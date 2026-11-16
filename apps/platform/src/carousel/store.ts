import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  CAROUSEL_TEMPLATES,
  type BrandCreativeProfile,
  type CarouselOutput,
  type CarouselSlide,
  type CompositionLintItem,
  type CompositionView,
  type KnowledgeDocView,
  type KnowledgeStatus,
  type KnowledgeVersion,
  type MaterialSource,
  type MaterialView,
  type OutputFile,
  type ProvenanceItem,
} from '@company-os/contracts';
import { writeAudit } from '../audit.js';
import { inTransaction } from '../grants/store.js';

type Queryable = Pick<Pool, 'query'>;
type Actor = { type: 'human' | 'agent'; id: string };

export type BrandProfileData = { profile: BrandCreativeProfile; documents: Record<string, unknown> };

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function payloadOf(document: unknown): Record<string, unknown> {
  const root = record(document);
  return Object.keys(record(root.payload)).length > 0 ? record(root.payload) : root;
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function colorAt(payload: Record<string, unknown>, id: string, fallback: string): string {
  const role = list(payload.roles).map(record).find((item) => text(item.id) === id);
  const value = text(role?.hex);
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

/** 目前品牌或指定 release 的創作快照；renderer 與 MCP 讀同一份。 */
export async function getBrandProfile(pool: Queryable, brandId: string, releaseId?: string): Promise<BrandProfileData | null> {
  const brand = await pool.query<{ id: string; name: string }>('select id, name from public.brand where id = $1', [brandId]);
  if (brand.rows[0] === undefined) return null;

  type ReleaseRow = { id: string; release_no: number; pages: { key: string; versionNo: number }[] };
  let release: ReleaseRow | null;
  if (releaseId !== undefined) {
    const result = await pool.query<ReleaseRow>('select id, release_no, pages from public.brand_release where id = $1 and brand_id = $2', [releaseId, brandId]);
    release = result.rows[0] ?? null;
    if (release === null) return null;
  } else {
    const result = await pool.query<ReleaseRow>('select id, release_no, pages from public.brand_release where brand_id = $1 order by release_no desc limit 1', [brandId]);
    release = result.rows[0] ?? null;
  }

  const documents: Record<string, unknown> = {};
  const pages: BrandCreativeProfile['pages'] = [];
  if (release !== null) {
    for (const page of release.pages) {
      const result = await pool.query<{ id: string; version_no: number; document: unknown }>(
        `select v.id, v.version_no, v.document from public.brand_page p
           join public.brand_page_version v on v.page_id = p.id
          where p.brand_id = $1 and p.key = $2 and v.version_no = $3`,
        [brandId, page.key, page.versionNo],
      );
      const row = result.rows[0];
      if (row !== undefined) {
        documents[page.key] = row.document;
        pages.push({ key: page.key, versionId: row.id, versionNo: row.version_no });
      }
    }
  } else {
    const result = await pool.query<{ key: string; id: string; version_no: number; document: unknown }>(
      `select p.key, v.id, v.version_no, v.document from public.brand_page p
         join lateral (
           select vv.id, vv.version_no, vv.document from public.brand_page_version vv
            where vv.page_id = p.id and vv.deleted_at is null order by vv.version_no desc limit 1
         ) v on true
        where p.brand_id = $1 and p.deleted_at is null`,
      [brandId],
    );
    for (const row of result.rows) {
      documents[row.key] = row.document;
      pages.push({ key: row.key, versionId: row.id, versionNo: row.version_no });
    }
  }

  const color = payloadOf(documents.color);
  const type = payloadOf(documents.type);
  const tone = payloadOf(documents.tone);
  const image = payloadOf(documents.image);
  const photo = record(image.photo);
  const families = list(type.families).map(record).map((item) => text(item.name)).filter(Boolean);
  const traits = list(tone.traits).map(record).map((item) => text(item.name)).filter(Boolean);
  const banned = list(tone.banned).map(record).map((item) => text(item.term)).filter(Boolean);
  const primary = colorAt(color, 'brand.primary', '#171717');
  const accent = colorAt(color, 'brand.secondary', primary);

  return {
    profile: {
      brandId, brandName: brand.rows[0]?.name ?? '', releaseId: release?.id ?? null, releaseNo: release?.release_no ?? null,
      colors: { primary, ink: colorAt(color, 'ink', '#171717'), paper: colorAt(color, 'paper', '#F7F6F3'), accent },
      fonts: { display: families[0] ?? 'Inter, Noto Sans HK, sans-serif', body: families[1] ?? families[0] ?? 'Inter, Noto Sans HK, sans-serif' },
      tone: { traits, banned, languagePolicy: text(tone.language_policy) },
      image: { composition: text(photo.composition), light: text(photo.light), space: text(photo.space) },
      pages,
    },
    documents,
  };
}

async function createRelease(client: PoolClient, input: { brandId: string; actorId: string }): Promise<string> {
  await client.query('select id from public.brand where id = $1 for update', [input.brandId]);
  const snapshot = await client.query<{ pages: { key: string; versionNo: number }[] }>(
    `select coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'versionNo', v.version_no) order by p.sort_order), '[]') as pages
       from public.brand_page p join lateral (
         select vv.version_no from public.brand_page_version vv
          where vv.page_id = p.id and vv.deleted_at is null order by vv.version_no desc limit 1
       ) v on true where p.brand_id = $1 and p.deleted_at is null`,
    [input.brandId],
  );
  const result = await client.query<{ id: string }>(
    `insert into public.brand_release (brand_id, release_no, pages, created_by)
     select $1, coalesce(max(release_no), 0) + 1, $2::jsonb, nullif($3, '')::uuid from public.brand_release where brand_id = $1 returning id`,
    [input.brandId, JSON.stringify(snapshot.rows[0]?.pages ?? []), input.actorId],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('建立 Brand Release 失敗');
  return id;
}

type MaterialRow = {
  id: string; brand_id: string; name: string; content_type: string; size_bytes: string; sha256: string;
  width: number; height: number; source: MaterialSource; description: string; tags: string[]; created_at: Date;
};
function materialOf(row: MaterialRow, agent = false): MaterialView {
  const base = agent ? '/api/agent/materials' : '/api/materials';
  return {
    id: row.id, brandId: row.brand_id, name: row.name, contentType: row.content_type,
    sizeBytes: Number(row.size_bytes), sha256: row.sha256, width: row.width, height: row.height,
    source: row.source, description: row.description, tags: row.tags, versionNo: 1,
    previewUrl: `${base}/${row.id}/file?variant=preview`, originalUrl: `${base}/${row.id}/file`,
    createdAt: row.created_at.toISOString(),
  };
}
const MATERIAL_SELECT = 'select id, brand_id, name, content_type, size_bytes, sha256, width, height, source, description, tags, created_at from design.material';
export async function listMaterials(pool: Pool, brandId: string, query = '', limit = 50, agent = false): Promise<MaterialView[]> {
  const result = await pool.query<MaterialRow>(
    `${MATERIAL_SELECT} where brand_id = $1 and deleted_at is null
       and ($2 = '' or concat_ws(' ', name, description, array_to_string(tags, ' ')) ilike '%' || $2 || '%')
      order by created_at desc limit $3`,
    [brandId, query.trim(), Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows.map((row) => materialOf(row, agent));
}
export async function findMaterial(pool: Queryable, id: string, agent = false): Promise<(MaterialView & { originalKey: string; previewKey: string }) | null> {
  const result = await pool.query<MaterialRow & { original_key: string; preview_key: string }>(
    `${MATERIAL_SELECT.replace('from design.material', ', original_key, preview_key from design.material')} where id = $1 and deleted_at is null`, [id],
  );
  const row = result.rows[0];
  return row === undefined ? null : { ...materialOf(row, agent), originalKey: row.original_key, previewKey: row.preview_key };
}
export async function createMaterialRecord(pool: Pool, input: {
  brandId: string; name: string; originalKey: string; previewKey: string; contentType: string; sizeBytes: number;
  sha256: string; width: number; height: number; source: MaterialSource; description: string; tags: string[]; actorId: string;
}): Promise<{ material: MaterialView; created: boolean }> {
  return inTransaction(pool, async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into design.material (brand_id, name, original_key, preview_key, content_type, size_bytes, sha256, width, height, source, description, tags, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (brand_id, sha256) where deleted_at is null do nothing returning id`,
      [input.brandId, input.name, input.originalKey, input.previewKey, input.contentType, input.sizeBytes, input.sha256, input.width, input.height, input.source, input.description, input.tags, input.actorId],
    );
    const existing = await client.query<{ id: string }>('select id from design.material where brand_id = $1 and sha256 = $2 and deleted_at is null', [input.brandId, input.sha256]);
    const id = inserted.rows[0]?.id ?? existing.rows[0]?.id;
    if (id === undefined) throw new Error('素材入庫後讀不到 ID');
    if (inserted.rows[0] !== undefined) {
      await writeAudit(client, { actorType: 'human', actorId: input.actorId, action: 'material.upload', target: id, detail: { brandId: input.brandId, sha256: input.sha256 } });
    }
    const material = await findMaterial(client, id);
    if (material === null) throw new Error('素材入庫後讀不到內容');
    return { material, created: inserted.rows[0] !== undefined };
  });
}

function chunkMarkdown(markdown: string): { heading: string; body: string }[] {
  const chunks: { heading: string; body: string }[] = [];
  let heading = '內容';
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join('\n').trim();
    if (body !== '') chunks.push({ heading, body });
  };
  for (const line of markdown.replace(/^---\s*\n[\s\S]*?\n---\s*/m, '').split('\n')) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line);
    if (match !== null) {
      flush();
      heading = match[2]?.trim() ?? '內容';
      lines = [];
    } else lines.push(line);
  }
  flush();
  return chunks.slice(0, 100);
}
async function insertKnowledgeVersion(client: PoolClient, input: {
  docId: string; summary: string; bodyMd: string; sources: unknown; jurisdiction: string[]; reviewBy: string | null;
  actor: Actor; requestId: string;
}): Promise<string> {
  const next = await client.query<{ version_no: number }>('select coalesce(max(version_no), 0) + 1 as version_no from design.knowledge_version where doc_id = $1', [input.docId]);
  const versionNo = next.rows[0]?.version_no ?? 1;
  const inserted = await client.query<{ id: string }>(
    `insert into design.knowledge_version (doc_id, version_no, summary, body_md, sources, jurisdiction, review_by, created_by, created_by_agent, request_id)
     values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10) returning id`,
    [input.docId, versionNo, input.summary, input.bodyMd, JSON.stringify(input.sources), input.jurisdiction, input.reviewBy, input.actor.type === 'human' ? input.actor.id : null, input.actor.type === 'agent' ? input.actor.id : null, input.requestId],
  );
  const versionId = inserted.rows[0]?.id;
  if (versionId === undefined) throw new Error('建立知識版本失敗');
  const chunks = chunkMarkdown(input.bodyMd);
  for (const [index, chunk] of chunks.entries()) {
    await client.query('insert into design.knowledge_chunk (version_id, heading, body, ordinal) values ($1,$2,$3,$4)', [versionId, chunk.heading, chunk.body, index]);
  }
  return versionId;
}
async function currentKnowledgeVersion(pool: Queryable, docId: string): Promise<KnowledgeVersion | null> {
  const version = await pool.query<{
    id: string; version_no: number; summary: string; body_md: string; sources: KnowledgeVersion['sources'];
    jurisdiction: string[]; review_by: string | null; created_at: Date;
  }>('select id, version_no, summary, body_md, sources, jurisdiction, review_by, created_at from design.knowledge_version where doc_id = $1 order by version_no desc limit 1', [docId]);
  const row = version.rows[0];
  if (row === undefined) return null;
  const chunks = await pool.query<{ id: string; heading: string; body: string; ordinal: number }>('select id, heading, body, ordinal from design.knowledge_chunk where version_id = $1 order by ordinal', [row.id]);
  return {
    id: row.id, versionNo: row.version_no, summary: row.summary, bodyMd: row.body_md, sources: row.sources,
    jurisdiction: row.jurisdiction, reviewBy: row.review_by === null ? null : String(row.review_by).slice(0, 10),
    chunks: chunks.rows, createdAt: row.created_at.toISOString(),
  };
}
export async function listKnowledge(pool: Pool, brandId: string, query = '', limit = 50): Promise<KnowledgeDocView[]> {
  const docs = await pool.query<{ id: string; brand_id: string | null; title: string; status: KnowledgeStatus; created_at: Date }>(
    `select id, brand_id, title, status, created_at from design.knowledge_doc
      where (brand_id = $1 or brand_id is null)
        and ($2 = '' or concat_ws(' ', title, id) ilike '%' || $2 || '%')
      order by updated_at desc limit $3`,
    [brandId, query.trim(), Math.min(Math.max(limit, 1), 100)],
  );
  const out: KnowledgeDocView[] = [];
  for (const doc of docs.rows) out.push({ id: doc.id, brandId: doc.brand_id, title: doc.title, status: doc.status, current: await currentKnowledgeVersion(pool, doc.id), createdAt: doc.created_at.toISOString() });
  return out;
}
export async function findKnowledge(pool: Queryable, id: string): Promise<KnowledgeDocView | null> {
  const result = await pool.query<{ id: string; brand_id: string | null; title: string; status: KnowledgeStatus; created_at: Date }>('select id, brand_id, title, status, created_at from design.knowledge_doc where id = $1', [id]);
  const doc = result.rows[0];
  return doc === undefined ? null : { id: doc.id, brandId: doc.brand_id, title: doc.title, status: doc.status, current: await currentKnowledgeVersion(pool, id), createdAt: doc.created_at.toISOString() };
}
export async function createKnowledge(pool: Pool, input: {
  brandId: string | null; title: string; summary: string; bodyMd: string; sources: unknown; jurisdiction: string[];
  reviewBy: string | null; actor: Actor; requestId: string;
}): Promise<KnowledgeDocView> {
  const id = await inTransaction(pool, async (client) => {
    const inserted = await client.query<{ id: string }>('insert into design.knowledge_doc (brand_id, title, created_by) values ($1,$2,$3) returning id', [input.brandId, input.title, input.actor.type === 'human' ? input.actor.id : null]);
    const docId = inserted.rows[0]?.id;
    if (docId === undefined) throw new Error('建立知識文件失敗');
    await insertKnowledgeVersion(client, { ...input, docId });
    await writeAudit(client, { actorType: input.actor.type, actorId: input.actor.id, action: 'knowledge.create', target: docId, detail: { requestId: input.requestId } });
    return docId;
  });
  const doc = await findKnowledge(pool, id);
  if (doc === null) throw new Error('建立知識後讀不到文件');
  return doc;
}
export async function appendKnowledge(pool: Pool, input: {
  docId: string; summary: string; bodyMd: string; sources: unknown; jurisdiction: string[]; reviewBy: string | null;
  actor: Actor; requestId: string;
}): Promise<KnowledgeDocView | null> {
  return inTransaction(pool, async (client) => {
    const doc = await client.query('select id from design.knowledge_doc where id = $1 for update', [input.docId]);
    if (doc.rows[0] === undefined) return null;
    await insertKnowledgeVersion(client, input);
    await client.query('update design.knowledge_doc set status = \'unverified\', updated_at = now() where id = $1', [input.docId]);
    await writeAudit(client, { actorType: input.actor.type, actorId: input.actor.id, action: 'knowledge.version.append', target: input.docId, detail: { requestId: input.requestId } });
    return findKnowledge(client, input.docId);
  });
}
export async function reviewKnowledge(pool: Pool, id: string, status: KnowledgeStatus, actorId: string): Promise<KnowledgeDocView | null> {
  const result = await pool.query('update design.knowledge_doc set status = $2, updated_at = now() where id = $1 returning id', [id, status]);
  if (result.rows[0] === undefined) return null;
  await writeAudit(pool, { actorType: 'human', actorId, action: 'knowledge.review', target: id, detail: { status } });
  return findKnowledge(pool, id);
}

function compositionOf(row: {
  id: string; project_id: string; version_no: number; based_on_id: string | null; brief_version_id: string | null;
  brand_release_id: string | null; slides: CarouselSlide[]; source_refs: CompositionView['sourceRefs']; lint: CompositionLintItem[];
  actor_type: 'human' | 'agent'; actor_id: string; request_id: string; created_at: Date;
}): CompositionView {
  return {
    id: row.id, projectId: row.project_id, versionNo: row.version_no, basedOnId: row.based_on_id,
    briefVersionId: row.brief_version_id, brandReleaseId: row.brand_release_id, slides: row.slides,
    sourceRefs: row.source_refs, lint: row.lint, actorType: row.actor_type, actorId: row.actor_id,
    requestId: row.request_id, createdAt: row.created_at.toISOString(),
  };
}
const COMPOSITION_SELECT = 'select id, project_id, version_no, based_on_id, brief_version_id, brand_release_id, slides, source_refs, lint, actor_type, actor_id, request_id, created_at from design.composition';
export async function findComposition(pool: Queryable, id: string): Promise<CompositionView | null> {
  const result = await pool.query<Parameters<typeof compositionOf>[0]>(`${COMPOSITION_SELECT} where id = $1`, [id]);
  return result.rows[0] === undefined ? null : compositionOf(result.rows[0]);
}
export async function listCompositions(pool: Pool, projectId: string): Promise<CompositionView[]> {
  const result = await pool.query<Parameters<typeof compositionOf>[0]>(`${COMPOSITION_SELECT} where project_id = $1 order by version_no desc`, [projectId]);
  return result.rows.map(compositionOf);
}
export function lintSlides(slides: CarouselSlide[]): CompositionLintItem[] {
  const lint: CompositionLintItem[] = [];
  for (const slide of slides) {
    const template = CAROUSEL_TEMPLATES.find((item) => item.role === slide.role);
    const headlineLimit = template?.slots.find((slot) => slot.key === 'headline')?.maxChars ?? 80;
    const bodyLimit = template?.slots.find((slot) => slot.key === 'body')?.maxChars ?? 420;
    if (slide.headline.length > headlineLimit) lint.push({ level: 'warning', code: 'headline_length', message: `標題超過建議 ${headlineLimit} 字元`, slideId: slide.id });
    if (slide.body.length > bodyLimit) lint.push({ level: 'warning', code: 'body_length', message: `內容超過建議 ${bodyLimit} 字元`, slideId: slide.id });
    if (slide.role === 'cover' && slide.materialId === null) lint.push({ level: 'warning', code: 'cover_without_image', message: '封面未選主圖，將使用純版面', slideId: slide.id });
  }
  return lint;
}
export async function createComposition(pool: Pool, input: {
  projectId: string; slides: CarouselSlide[]; basedOnId: string | null; actor: Actor; requestId: string;
  idempotencyKey: string; idempotencyHash: string;
}): Promise<{ status: 'ok'; composition: CompositionView; created: boolean } | { status: 'not_found' } | { status: 'invalid_sources' } | { status: 'idempotency_conflict' }> {
  return inTransaction(pool, async (client) => {
    const existing = await client.query<{ id: string; idempotency_hash: string }>('select id, idempotency_hash from design.composition where actor_id = $1 and idempotency_key = $2', [input.actor.id, input.idempotencyKey]);
    if (existing.rows[0] !== undefined) {
      if (existing.rows[0].idempotency_hash !== input.idempotencyHash) return { status: 'idempotency_conflict' as const };
      const composition = await findComposition(client, existing.rows[0].id);
      if (composition === null) throw new Error('組稿重試讀不到舊版本');
      return { status: 'ok' as const, composition, created: false };
    }
    const project = await client.query<{ id: string; brand_id: string }>('select id, brand_id from design.project where id = $1 for update', [input.projectId]);
    if (project.rows[0] === undefined) return { status: 'not_found' as const };
    if (input.basedOnId !== null) {
      const base = await client.query('select id from design.composition where id = $1 and project_id = $2', [input.basedOnId, input.projectId]);
      if (base.rows[0] === undefined) return { status: 'not_found' as const };
    }
    const materialIds = [...new Set(input.slides.map((slide) => slide.materialId).filter((id): id is string => id !== null))];
    for (const id of materialIds) {
      const material = await client.query('select id from design.material where id = $1 and brand_id = $2 and deleted_at is null', [id, project.rows[0]?.brand_id]);
      if (material.rows[0] === undefined) return { status: 'invalid_sources' as const };
    }
    const knowledge = input.slides.flatMap((slide) => slide.knowledgeRefs);
    for (const ref of knowledge) {
      const valid = await client.query(
        `select kc.id from design.knowledge_chunk kc join design.knowledge_version kv on kv.id = kc.version_id
           join design.knowledge_doc kd on kd.id = kv.doc_id
          where kc.id = $1 and kv.id = $2 and kd.id = $3 and (kd.brand_id = $4 or kd.brand_id is null)`,
        [ref.chunkId, ref.versionId, ref.docId, project.rows[0]?.brand_id],
      );
      if (valid.rows[0] === undefined) return { status: 'invalid_sources' as const };
    }
    const brandReleaseId = await createRelease(client, { brandId: project.rows[0]?.brand_id ?? '', actorId: input.actor.type === 'human' ? input.actor.id : '' });
    const brief = await client.query<{ id: string }>('select id from design.brief_version where project_id = $1 order by version_no desc limit 1', [input.projectId]);
    const next = await client.query<{ version_no: number }>('select coalesce(max(version_no), 0) + 1 as version_no from design.composition where project_id = $1', [input.projectId]);
    const sourceRefs = { materialIds, knowledge, templateIds: CAROUSEL_TEMPLATES.map((item) => item.id) };
    const inserted = await client.query<{ id: string }>(
      `insert into design.composition (project_id, version_no, based_on_id, brief_version_id, brand_release_id, slides, source_refs, lint, actor_type, actor_id, request_id, idempotency_key, idempotency_hash)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13) returning id`,
      [input.projectId, next.rows[0]?.version_no ?? 1, input.basedOnId, brief.rows[0]?.id ?? null, brandReleaseId, JSON.stringify(input.slides), JSON.stringify(sourceRefs), JSON.stringify(lintSlides(input.slides)), input.actor.type, input.actor.id, input.requestId, input.idempotencyKey, input.idempotencyHash],
    );
    const id = inserted.rows[0]?.id;
    if (id === undefined) throw new Error('建立 Composition 失敗');
    await writeAudit(client, { actorType: input.actor.type, actorId: input.actor.id, action: 'composition.append', target: input.projectId, detail: { compositionId: id, requestId: input.requestId } });
    const composition = await findComposition(client, id);
    if (composition === null) throw new Error('組稿建立後讀不到內容');
    return { status: 'ok' as const, composition, created: true };
  });
}

export async function createRenderJob(pool: Pool, input: {
  projectId: string; compositionId: string; actor: Actor; requestId: string; idempotencyKey: string; idempotencyHash: string;
}): Promise<{ status: 'ok'; jobId: string; created: boolean } | { status: 'not_found' | 'idempotency_conflict' }> {
  return inTransaction(pool, async (client) => {
    const existing = await client.query<{ id: string; idempotency_hash: string }>('select id, idempotency_hash from design.render_job where actor_id = $1 and idempotency_key = $2', [input.actor.id, input.idempotencyKey]);
    if (existing.rows[0] !== undefined) {
      if (existing.rows[0].idempotency_hash !== input.idempotencyHash) return { status: 'idempotency_conflict' as const };
      return { status: 'ok' as const, jobId: existing.rows[0].id, created: false };
    }
    const valid = await client.query('select id from design.composition where id = $1 and project_id = $2', [input.compositionId, input.projectId]);
    if (valid.rows[0] === undefined) return { status: 'not_found' as const };
    const result = await client.query<{ id: string }>(
      `insert into design.render_job (project_id, composition_id, status, actor_type, actor_id, request_id, idempotency_key, idempotency_hash)
       values ($1,$2,'running',$3,$4,$5,$6,$7) returning id`,
      [input.projectId, input.compositionId, input.actor.type, input.actor.id, input.requestId, input.idempotencyKey, input.idempotencyHash],
    );
    const jobId = result.rows[0]?.id;
    if (jobId === undefined) throw new Error('建立 Render Job 失敗');
    await writeAudit(client, { actorType: input.actor.type, actorId: input.actor.id, action: 'render.start', target: input.projectId, detail: { jobId, compositionId: input.compositionId, requestId: input.requestId } });
    return { status: 'ok' as const, jobId, created: true };
  });
}
export async function failRenderJob(pool: Pool, jobId: string, error: string): Promise<void> {
  await pool.query('update design.render_job set status = \'failed\', error = $2, completed_at = now() where id = $1', [jobId, error.slice(0, 1000)]);
}
export async function getRenderJob(pool: Pool, jobId: string): Promise<{ id: string; status: string; error: string | null; outputId: string | null } | null> {
  const result = await pool.query<{ id: string; status: string; error: string | null; output_id: string | null }>(
    'select j.id, j.status, j.error, o.id as output_id from design.render_job j left join design.output o on o.render_job_id = j.id where j.id = $1', [jobId],
  );
  const row = result.rows[0];
  return row === undefined ? null : { id: row.id, status: row.status, error: row.error, outputId: row.output_id };
}

export async function recordOutput(pool: Pool, input: {
  jobId: string; projectId: string; compositionId: string; rendererVersion: string;
  files: { name: string; kind: 'page' | 'archive'; storageKey: string; contentType: string; body: Buffer; width: number | null; height: number | null; ordinal: number | null }[];
  provenance: { kind: ProvenanceItem['kind']; objectId: string; version: string; detail: Record<string, unknown> }[];
}): Promise<string> {
  const { createHash } = await import('node:crypto');
  return inTransaction(pool, async (client) => {
    const output = await client.query<{ id: string }>('insert into design.output (project_id, composition_id, render_job_id) values ($1,$2,$3) returning id', [input.projectId, input.compositionId, input.jobId]);
    const outputId = output.rows[0]?.id;
    if (outputId === undefined) throw new Error('建立 Output 失敗');
    for (const file of input.files) {
      await client.query(
        `insert into design.output_file (output_id, name, kind, storage_key, content_type, size_bytes, sha256, width, height, ordinal)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [outputId, file.name, file.kind, file.storageKey, file.contentType, file.body.byteLength, createHash('sha256').update(file.body).digest('hex'), file.width, file.height, file.ordinal],
      );
    }
    for (const item of input.provenance) {
      await client.query('insert into design.provenance (output_id, kind, object_id, version, detail) values ($1,$2,$3,$4,$5::jsonb)', [outputId, item.kind, item.objectId, item.version, JSON.stringify(item.detail)]);
    }
    await client.query('update design.render_job set status = \'done\', renderer_version = $2, completed_at = now() where id = $1', [input.jobId, input.rendererVersion]);
    await writeAudit(client, { actorType: 'system', actorId: 'hyperframes', action: 'render.complete', target: input.projectId, detail: { outputId, jobId: input.jobId, rendererVersion: input.rendererVersion } });
    return outputId;
  });
}

function fileOf(row: { id: string; output_id: string; name: string; kind: 'page' | 'archive'; content_type: string; size_bytes: string; sha256: string; width: number | null; height: number | null }): OutputFile {
  return { id: row.id, name: row.name, kind: row.kind, contentType: row.content_type, sizeBytes: Number(row.size_bytes), sha256: row.sha256, width: row.width, height: row.height, url: `/api/output-files/${row.id}` };
}
export async function listOutputs(pool: Pool, input: { projectId?: string; brandId?: string }): Promise<CarouselOutput[]> {
  const values: string[] = [];
  const conditions: string[] = [];
  if (input.projectId !== undefined) { values.push(input.projectId); conditions.push(`o.project_id = $${values.length}`); }
  if (input.brandId !== undefined) { values.push(input.brandId); conditions.push(`p.brand_id = $${values.length}`); }
  const outputs = await pool.query<{ id: string; project_id: string; composition_id: string; version_no: number; created_at: Date }>(
    `select o.id, o.project_id, o.composition_id, c.version_no, o.created_at from design.output o
       join design.project p on p.id = o.project_id join design.composition c on c.id = o.composition_id
      ${conditions.length === 0 ? '' : `where ${conditions.join(' and ')}`} order by o.created_at desc limit 100`,
    values,
  );
  const result: CarouselOutput[] = [];
  for (const output of outputs.rows) {
    const files = await pool.query<Parameters<typeof fileOf>[0]>('select id, output_id, name, kind, content_type, size_bytes, sha256, width, height from design.output_file where output_id = $1 order by kind desc, ordinal', [output.id]);
    const provenance = await pool.query<{ kind: ProvenanceItem['kind']; object_id: string; version: string; detail: Record<string, unknown> }>('select kind, object_id, version, detail from design.provenance where output_id = $1 order by kind, object_id', [output.id]);
    result.push({
      id: output.id, projectId: output.project_id, compositionId: output.composition_id, compositionVersionNo: output.version_no,
      profile: 'carousel-png', files: files.rows.map(fileOf),
      provenance: provenance.rows.map((item) => ({ kind: item.kind, objectId: item.object_id, version: item.version, detail: JSON.stringify(item.detail) })),
      createdAt: output.created_at.toISOString(),
    });
  }
  return result;
}
export async function findOutput(pool: Pool, id: string): Promise<CarouselOutput | null> {
  const outputs = await pool.query<{ project_id: string }>('select project_id from design.output where id = $1', [id]);
  const projectId = outputs.rows[0]?.project_id;
  if (projectId === undefined) return null;
  return (await listOutputs(pool, { projectId })).find((item) => item.id === id) ?? null;
}
export async function findOutputFile(pool: Pool, id: string): Promise<{ storageKey: string; name: string; contentType: string; sizeBytes: number; sha256: string } | null> {
  const result = await pool.query<{ storage_key: string; name: string; content_type: string; size_bytes: string; sha256: string }>('select storage_key, name, content_type, size_bytes, sha256 from design.output_file where id = $1', [id]);
  const row = result.rows[0];
  return row === undefined ? null : { storageKey: row.storage_key, name: row.name, contentType: row.content_type, sizeBytes: Number(row.size_bytes), sha256: row.sha256 };
}

export async function getWorkspace(pool: Pool, projectId: string): Promise<import('@company-os/contracts').ProjectCreativeWorkspace | null> {
  const project = await pool.query<{ brand_id: string }>('select brand_id from design.project where id = $1', [projectId]);
  const brandId = project.rows[0]?.brand_id;
  if (brandId === undefined) return null;
  const [brand, materials, knowledge, compositions, outputs] = await Promise.all([
    getBrandProfile(pool, brandId), listMaterials(pool, brandId), listKnowledge(pool, brandId), listCompositions(pool, projectId), listOutputs(pool, { projectId }),
  ]);
  if (brand === null) return null;
  return { brand: brand.profile, materials, knowledge, templates: [...CAROUSEL_TEMPLATES], compositions, outputs };
}

export function newRequestId(): string { return randomUUID(); }

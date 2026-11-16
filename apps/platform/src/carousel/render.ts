import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CarouselOutput, ProvenanceItem } from '@company-os/contracts';
import { CAROUSEL_TEMPLATES } from '@company-os/contracts';
import type { Storage } from '../storage/index.js';
import { findMaterial, findOutput, getBrandProfile, getRenderJob, createRenderJob, failRenderJob, findComposition, recordOutput } from './store.js';
import { renderWithHyperframes, HYPERFRAMES_VERSION } from './hyperframes.js';

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function renderCarousel(deps: { pool: Pool; storage: Storage }, input: {
  projectId: string; compositionId: string; actor: { type: 'human' | 'agent'; id: string };
  requestId: string; idempotencyKey: string;
}): Promise<{ status: 'ok'; output: CarouselOutput; created: boolean } | { status: 'not_found' } | { status: 'idempotency_conflict' }> {
  const job = await createRenderJob(deps.pool, { ...input, idempotencyHash: digest({ projectId: input.projectId, compositionId: input.compositionId }) });
  if (job.status !== 'ok') return job;
  if (!job.created) {
    const existing = await getRenderJob(deps.pool, job.jobId);
    if (existing?.outputId != null) {
      const output = await findOutput(deps.pool, existing.outputId);
      if (output !== null) return { status: 'ok', output, created: false };
    }
    if (existing?.status === 'running') throw new Error('這個 Render Job 已在進行中');
    if (existing?.status === 'failed') throw new Error(existing.error ?? '上一次 Render 失敗');
  }

  const composition = await findComposition(deps.pool, input.compositionId);
  if (composition === null || composition.projectId !== input.projectId) return { status: 'not_found' };
  const project = await deps.pool.query<{ brand_id: string }>('select brand_id from design.project where id = $1', [input.projectId]);
  const brandId = project.rows[0]?.brand_id;
  if (brandId === undefined) return { status: 'not_found' };
  const brand = await getBrandProfile(deps.pool, brandId, composition.brandReleaseId ?? undefined);
  if (brand === null) return { status: 'not_found' };

  const materialIds = [...new Set(composition.slides.map((slide) => slide.materialId).filter((id): id is string => id !== null))];
  const materials = [];
  for (const id of materialIds) {
    const material = await findMaterial(deps.pool, id);
    if (material === null) throw new Error(`素材 ${id} 不存在或已移除`);
    const object = await deps.storage.get(material.originalKey);
    materials.push({ id, dataUri: `data:${material.contentType};base64,${object.body.toString('base64')}` });
  }

  let rendered;
  try {
    rendered = await renderWithHyperframes({ slides: composition.slides, brand: brand.profile, materials });
  } catch (error) {
    await failRenderJob(deps.pool, job.jobId, error instanceof Error ? error.message : String(error));
    throw error;
  }

  const prefix = `outputs/${input.projectId}/${job.jobId}`;
  const files = [
    ...rendered.pages.map((page, index) => ({
      name: page.name, kind: 'page' as const, storageKey: `${prefix}/${page.name}`, contentType: 'image/png',
      body: page.body, width: page.width, height: page.height, ordinal: index,
    })),
    { name: rendered.archive.name, kind: 'archive' as const, storageKey: `${prefix}/${rendered.archive.name}`, contentType: 'application/zip', body: rendered.archive.body, width: null, height: null, ordinal: null },
  ];
  try {
    for (const file of files) await deps.storage.put(file.storageKey, file.body, { contentType: file.contentType });
    const provenance: { kind: ProvenanceItem['kind']; objectId: string; version: string; detail: Record<string, unknown> }[] = [];
    if (brand.profile.releaseId !== null) provenance.push({ kind: 'brand', objectId: brand.profile.releaseId, version: String(brand.profile.releaseNo ?? ''), detail: { brandId, pages: brand.profile.pages } });
    if (composition.briefVersionId !== null) provenance.push({ kind: 'brief', objectId: composition.briefVersionId, version: 'pinned', detail: { projectId: input.projectId } });
    for (const id of materialIds) provenance.push({ kind: 'material', objectId: id, version: '1', detail: {} });
    const knowledge = new Map<string, { versionId: string; chunkIds: string[] }>();
    for (const slide of composition.slides) {
      for (const ref of slide.knowledgeRefs) {
        const current = knowledge.get(ref.docId) ?? { versionId: ref.versionId, chunkIds: [] };
        current.chunkIds.push(ref.chunkId);
        knowledge.set(ref.docId, current);
      }
    }
    for (const [docId, ref] of knowledge) provenance.push({ kind: 'knowledge', objectId: docId, version: ref.versionId, detail: { chunkIds: [...new Set(ref.chunkIds)] } });
    for (const template of CAROUSEL_TEMPLATES) provenance.push({ kind: 'template', objectId: template.id, version: String(template.version), detail: { role: template.role } });

    const outputId = await recordOutput(deps.pool, {
      jobId: job.jobId, projectId: input.projectId, compositionId: composition.id,
      rendererVersion: HYPERFRAMES_VERSION, files, provenance,
    });
    const output = await findOutput(deps.pool, outputId);
    if (output === null) throw new Error('Output 建立後讀不到內容');
    return { status: 'ok', output, created: true };
  } catch (error) {
    for (const file of files) await deps.storage.remove(file.storageKey).catch(() => undefined);
    await failRenderJob(deps.pool, job.jobId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export function newRenderRequestId(): string { return randomUUID(); }

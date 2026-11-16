import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import sharp from 'sharp';
import {
  CAROUSEL_TEMPLATES,
  validateCarouselSlides,
  type KnowledgeStatus,
  type MaterialSource,
} from '@company-os/contracts';
import type { ModuleRegistry } from '../modules/registry/index.js';
import type { TrustedEntry } from '@company-os/contracts';
import { createDesignAccess } from '../projects/access.js';
import { getProjectDetail } from '../projects/store.js';
import { buildContentDisposition } from '../files/content-disposition.js';
import type { Storage } from '../storage/index.js';
import { buildAutomaticSlides } from './compose.js';
import { renderCarousel } from './render.js';
import {
  createComposition,
  createKnowledge,
  createMaterialRecord,
  findComposition,
  findMaterial,
  findOutputFile,
  getWorkspace,
  listCompositions,
  listKnowledge,
  listMaterials,
  listOutputs,
  appendKnowledge,
  reviewKnowledge,
} from './store.js';

export type CarouselDeps = {
  pool: Pool;
  storage: Storage;
  registry: ModuleRegistry;
  resolveEntry: (request: FastifyRequest) => TrustedEntry | null;
  maxUploadBytes?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_.:-]{1,100}$/;
function validId(value: string): boolean { return UUID.test(value); }
function header(request: FastifyRequest, key: string): string | undefined { const value = request.headers[key]; return typeof value === 'string' ? value : undefined; }
function requestId(request: FastifyRequest): string { const value = header(request, 'x-request-id'); return value !== undefined && KEY.test(value) ? value : randomUUID(); }
function idempotency(request: FastifyRequest, reply: FastifyReply): string | null {
  const value = header(request, 'idempotency-key');
  if (value === undefined || !KEY.test(value)) { void reply.code(422).send({ error: 'invalid_idempotency_key' }); return null; }
  return value;
}
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function text(value: unknown, max = 20000): string | null { return typeof value === 'string' && value.trim() !== '' && value.length <= max ? value.trim() : null; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()).slice(0, 50) : []; }
function actorOf(request: FastifyRequest): { type: 'human' | 'agent'; id: string } | null {
  if (request.currentUser !== null) return { type: 'human', id: request.currentUser.id };
  if (request.currentAgent !== null) return { type: 'agent', id: request.currentAgent.id };
  return null;
}
function decodedHeader(value: string | undefined, fallback: string): string {
  if (value === undefined || value === '') return fallback;
  try { return decodeURIComponent(value).slice(0, 200); } catch { return fallback; }
}
function brandFilter(request: FastifyRequest, reply: FastifyReply): string | null {
  const value = (request.query as Record<string, unknown>).brandId;
  if (typeof value !== 'string' || !validId(value)) { void reply.code(422).send({ error: 'invalid_brand' }); return null; }
  return value;
}
function parseKnowledge(input: unknown): { ok: true; value: { title: string; summary: string; bodyMd: string; sources: unknown[]; jurisdiction: string[]; reviewBy: string | null } } | { ok: false; reasons: string[] } {
  const raw = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
  const title = text(raw.title, 240);
  const summary = text(raw.summary, 2000);
  const bodyMd = text(raw.bodyMd, 200000);
  const reasons = [];
  if (title === null) reasons.push('title 必須是 1–240 字元');
  if (summary === null) reasons.push('summary 必須是 1–2000 字元');
  if (bodyMd === null) reasons.push('bodyMd 必須是 1–200000 字元');
  if (raw.sources !== undefined && !Array.isArray(raw.sources)) reasons.push('sources 必須是陣列');
  const reviewBy = raw.reviewBy === undefined || raw.reviewBy === null || raw.reviewBy === '' ? null : typeof raw.reviewBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.reviewBy) ? raw.reviewBy : null;
  if (raw.reviewBy !== undefined && raw.reviewBy !== null && raw.reviewBy !== '' && reviewBy === null) reasons.push('reviewBy 必須是 YYYY-MM-DD');
  return reasons.length > 0 || title === null || summary === null || bodyMd === null
    ? { ok: false, reasons }
    : { ok: true, value: { title, summary, bodyMd, sources: Array.isArray(raw.sources) ? raw.sources : [], jurisdiction: strings(raw.jurisdiction), reviewBy } };
}

export function registerCarousel(app: FastifyInstance, deps: CarouselDeps): void {
  const access = createDesignAccess(app, deps);
  const maxUploadBytes = deps.maxUploadBytes ?? 50 * 1024 * 1024;
  app.addContentTypeParser(['image/png', 'image/jpeg', 'image/webp'], { parseAs: 'buffer', bodyLimit: maxUploadBytes }, (_request, body, done) => done(null, body));

  async function materialsHandler(request: FastifyRequest, reply: FastifyReply) {
    const brandId = brandFilter(request, reply);
    if (brandId === null) return;
    const query = (request.query as Record<string, unknown>).q;
    const materials = await listMaterials(deps.pool, brandId, typeof query === 'string' ? query : '', 50, request.currentAgent !== null);
    return { materials, total: materials.length };
  }
  app.get('/materials', { preHandler: access.human }, materialsHandler);
  app.get('/agent/materials', { preHandler: access.agent }, materialsHandler);

  app.post('/materials', { bodyLimit: maxUploadBytes, preHandler: access.human }, async (request, reply) => {
    const brandId = brandFilter(request, reply);
    if (brandId === null) return;
    if (!Buffer.isBuffer(request.body) || request.body.byteLength === 0) return reply.code(422).send({ error: 'invalid_file' });
    const contentType = header(request, 'content-type') ?? '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) return reply.code(422).send({ error: 'invalid_content_type' });
    let metadata;
    try { metadata = await sharp(request.body).metadata(); } catch { return reply.code(422).send({ error: 'invalid_image' }); }
    if (metadata.width === undefined || metadata.height === undefined) return reply.code(422).send({ error: 'invalid_image' });
    const actor = actorOf(request);
    if (actor === null) return reply.code(401).send({ error: 'not_signed_in' });
    const sha256 = createHash('sha256').update(request.body).digest('hex');
    const objectId = randomUUID();
    const year = String(new Date().getUTCFullYear());
    const originalKey = `materials/original/${year}/${objectId}`;
    const previewKey = `materials/derived/${year}/${objectId}.webp`;
    const preview = await sharp(request.body).resize({ width: 900, height: 1100, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    await deps.storage.put(originalKey, request.body, { contentType });
    await deps.storage.put(previewKey, preview, { contentType: 'image/webp' });
    try {
      const source = header(request, 'x-material-source');
      const result = await createMaterialRecord(deps.pool, {
        brandId, name: decodedHeader(header(request, 'x-file-name'), '未命名素材'),
        originalKey, previewKey, contentType, sizeBytes: request.body.byteLength, sha256,
        width: metadata.width, height: metadata.height,
        source: (['human_shot', 'ai_generated', 'stock', 'client_provided'].includes(source ?? '') ? source : 'human_shot') as MaterialSource,
        description: decodedHeader(header(request, 'x-material-description'), ''),
        tags: decodedHeader(header(request, 'x-material-tags'), '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 30),
        actorId: actor.id,
      });
      if (!result.created) {
        await deps.storage.remove(originalKey);
        await deps.storage.remove(previewKey);
      }
      return reply.code(result.created ? 201 : 200).send(result);
    } catch (error) {
      await deps.storage.remove(originalKey).catch(() => undefined);
      await deps.storage.remove(previewKey).catch(() => undefined);
      throw error;
    }
  });

  async function materialFile(request: FastifyRequest, reply: FastifyReply) {
    const id = (request.params as { id: string }).id;
    if (!validId(id)) return reply.code(404).send({ error: 'not_found' });
    const material = await findMaterial(deps.pool, id, request.currentAgent !== null);
    if (material === null) return reply.code(404).send({ error: 'not_found' });
    const preview = (request.query as Record<string, unknown>).variant === 'preview';
    const object = await deps.storage.get(preview ? material.previewKey : material.originalKey);
    reply.header('content-type', preview ? 'image/webp' : material.contentType);
    reply.header('content-length', String(object.body.byteLength));
    reply.header('cache-control', 'private, max-age=3600');
    reply.header('etag', `"${material.sha256}"`);
    return reply.send(object.body);
  }
  app.get('/materials/:id/file', { preHandler: access.human }, materialFile);
  app.get('/agent/materials/:id/file', { preHandler: access.agent }, materialFile);

  async function knowledgeHandler(request: FastifyRequest, reply: FastifyReply) {
    const brandId = brandFilter(request, reply);
    if (brandId === null) return;
    const query = (request.query as Record<string, unknown>).q;
    const knowledge = await listKnowledge(deps.pool, brandId, typeof query === 'string' ? query : '');
    return { knowledge, total: knowledge.length };
  }
  app.get('/knowledge', { preHandler: access.human }, knowledgeHandler);
  app.get('/agent/knowledge', { preHandler: access.agent }, knowledgeHandler);

  app.post('/knowledge', { preHandler: access.human }, async (request, reply) => {
    const raw = typeof request.body === 'object' && request.body !== null ? request.body as Record<string, unknown> : {};
    const parsed = parseKnowledge(request.body);
    if (!parsed.ok) return reply.code(422).send({ error: 'invalid_input', reasons: parsed.reasons });
    const brandId = raw.brandId === null ? null : typeof raw.brandId === 'string' && validId(raw.brandId) ? raw.brandId : undefined;
    if (brandId === undefined) return reply.code(422).send({ error: 'invalid_brand' });
    const actor = actorOf(request);
    if (actor === null) return reply.code(401).send({ error: 'not_signed_in' });
    const doc = await createKnowledge(deps.pool, { ...parsed.value, brandId, actor, requestId: requestId(request) });
    return reply.code(201).send({ knowledge: doc });
  });
  app.post('/knowledge/:id/versions', { preHandler: access.human }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!validId(id)) return reply.code(404).send({ error: 'not_found' });
    const parsed = parseKnowledge(request.body);
    if (!parsed.ok) return reply.code(422).send({ error: 'invalid_input', reasons: parsed.reasons });
    const actor = actorOf(request);
    if (actor === null) return reply.code(401).send({ error: 'not_signed_in' });
    const doc = await appendKnowledge(deps.pool, { docId: id, ...parsed.value, actor, requestId: requestId(request) });
    return doc === null ? reply.code(404).send({ error: 'not_found' }) : reply.code(201).send({ knowledge: doc });
  });
  app.post('/knowledge/:id/review', { preHandler: access.human }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!validId(id)) return reply.code(404).send({ error: 'not_found' });
    const raw = typeof request.body === 'object' && request.body !== null ? request.body as Record<string, unknown> : {};
    const status = raw.status;
    if (status !== 'unverified' && status !== 'verified' && status !== 'outdated') return reply.code(422).send({ error: 'invalid_status' });
    const actor = actorOf(request);
    if (actor === null) return reply.code(401).send({ error: 'not_signed_in' });
    const doc = await reviewKnowledge(deps.pool, id, status as KnowledgeStatus, actor.id);
    return doc === null ? reply.code(404).send({ error: 'not_found' }) : { knowledge: doc };
  });

  app.get('/templates', { preHandler: access.human }, async () => ({ templates: CAROUSEL_TEMPLATES, total: CAROUSEL_TEMPLATES.length }));
  app.get('/agent/templates', { preHandler: access.agent }, async () => ({ templates: CAROUSEL_TEMPLATES, total: CAROUSEL_TEMPLATES.length }));

  async function workspaceHandler(request: FastifyRequest, reply: FastifyReply) {
    const id = (request.params as { id: string }).id;
    if (!validId(id)) return reply.code(404).send({ error: 'not_found' });
    const workspace = await getWorkspace(deps.pool, id);
    return workspace === null ? reply.code(404).send({ error: 'not_found' }) : { workspace };
  }
  app.get('/projects/:id/creative', { preHandler: access.human }, workspaceHandler);
  app.get('/agent/projects/:id/creative', { preHandler: access.agent }, workspaceHandler);

  async function compositionHandler(request: FastifyRequest, reply: FastifyReply) {
    const projectId = (request.params as { id: string }).id;
    if (!validId(projectId)) return reply.code(404).send({ error: 'not_found' });
    const raw = typeof request.body === 'object' && request.body !== null ? request.body as Record<string, unknown> : {};
    const actor = actorOf(request);
    if (actor === null) return reply.code(401).send({ error: 'not_signed_in' });
    const key = idempotency(request, reply);
    if (key === null) return;
    let slides;
    if (raw.slides === undefined) {
      const [project, workspace] = await Promise.all([getProjectDetail(deps.pool, projectId), getWorkspace(deps.pool, projectId)]);
      if (project === null || workspace === null) return reply.code(404).send({ error: 'not_found' });
      const selection = {
        ...(raw.materialIds === undefined ? {} : { materialIds: strings(raw.materialIds) }),
        ...(raw.knowledgeIds === undefined ? {} : { knowledgeIds: strings(raw.knowledgeIds) }),
      };
      const automatic = buildAutomaticSlides(project, workspace, selection);
      if (!automatic.ok) return reply.code(422).send({ error: automatic.reason, message: '請先新增至少一份有段落的知識，再組成 Carousel。' });
      slides = automatic.slides;
    } else {
      const parsed = validateCarouselSlides(raw.slides);
      if (!parsed.ok) return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
      slides = parsed.value;
    }
    const basedOnId = typeof raw.basedOnId === 'string' && validId(raw.basedOnId) ? raw.basedOnId : null;
    const result = await createComposition(deps.pool, {
      projectId, slides, basedOnId, actor, requestId: requestId(request), idempotencyKey: key,
      idempotencyHash: hash({ projectId, slides, basedOnId }),
    });
    if (result.status === 'not_found') return reply.code(404).send({ error: 'not_found' });
    if (result.status === 'invalid_sources') return reply.code(422).send({ error: 'invalid_sources', message: '有素材或知識引用不屬於這個品牌，請重新選擇。' });
    if (result.status === 'idempotency_conflict') return reply.code(409).send({ error: 'idempotency_conflict' });
    return reply.code(result.created ? 201 : 200).send({ composition: result.composition, created: result.created });
  }
  app.post('/projects/:id/compositions', { preHandler: access.human }, compositionHandler);
  app.post('/agent/projects/:id/compositions', { preHandler: access.agent }, compositionHandler);

  async function compositionsHandler(request: FastifyRequest, reply: FastifyReply) {
    const projectId = (request.params as { id: string }).id;
    if (!validId(projectId)) return reply.code(404).send({ error: 'not_found' });
    return { compositions: await listCompositions(deps.pool, projectId) };
  }
  app.get('/projects/:id/compositions', { preHandler: access.human }, compositionsHandler);
  app.get('/agent/projects/:id/compositions', { preHandler: access.agent }, compositionsHandler);

  async function renderHandler(request: FastifyRequest, reply: FastifyReply) {
    const projectId = (request.params as { id: string }).id;
    if (!validId(projectId)) return reply.code(404).send({ error: 'not_found' });
    const raw = typeof request.body === 'object' && request.body !== null ? request.body as Record<string, unknown> : {};
    const compositions = await listCompositions(deps.pool, projectId);
    const compositionId = typeof raw.compositionId === 'string' ? raw.compositionId : compositions[0]?.id;
    if (compositionId === undefined || !validId(compositionId)) return reply.code(422).send({ error: 'composition_required', message: '請先建立 Carousel 組稿。' });
    if (await findComposition(deps.pool, compositionId) === null) return reply.code(404).send({ error: 'not_found' });
    const actor = actorOf(request);
    if (actor === null) return reply.code(401).send({ error: 'not_signed_in' });
    const key = idempotency(request, reply);
    if (key === null) return;
    try {
      const result = await renderCarousel(deps, { projectId, compositionId, actor, requestId: requestId(request), idempotencyKey: key });
      if (result.status === 'not_found') return reply.code(404).send({ error: 'not_found' });
      if (result.status === 'idempotency_conflict') return reply.code(409).send({ error: 'idempotency_conflict' });
      return reply.code(result.created ? 201 : 200).send({ output: result.output, created: result.created });
    } catch (error) {
      return reply.code(502).send({ error: 'render_failed', message: error instanceof Error ? error.message : String(error) });
    }
  }
  app.post('/projects/:id/render', { preHandler: access.human }, renderHandler);
  app.post('/agent/projects/:id/render', { preHandler: access.agent }, renderHandler);

  async function outputsHandler(request: FastifyRequest) {
    const query = request.query as Record<string, unknown>;
    const projectId = typeof query.projectId === 'string' && validId(query.projectId) ? query.projectId : undefined;
    const brandId = typeof query.brandId === 'string' && validId(query.brandId) ? query.brandId : undefined;
    return { outputs: await listOutputs(deps.pool, { ...(projectId === undefined ? {} : { projectId }), ...(brandId === undefined ? {} : { brandId }) }) };
  }
  app.get('/outputs', { preHandler: access.human }, outputsHandler);
  app.get('/agent/outputs', { preHandler: access.agent }, outputsHandler);

  async function outputFileHandler(request: FastifyRequest, reply: FastifyReply) {
    const id = (request.params as { id: string }).id;
    if (!validId(id)) return reply.code(404).send({ error: 'not_found' });
    const file = await findOutputFile(deps.pool, id);
    if (file === null) return reply.code(404).send({ error: 'not_found' });
    const object = await deps.storage.get(file.storageKey);
    reply.header('content-type', file.contentType);
    reply.header('content-length', String(object.body.byteLength));
    reply.header('content-disposition', buildContentDisposition(file.name, file.contentType));
    reply.header('etag', `"${file.sha256}"`);
    return reply.send(object.body);
  }
  app.get('/output-files/:id', { preHandler: access.human }, outputFileHandler);
  app.get('/agent/output-files/:id', { preHandler: access.agent }, outputFileHandler);
}

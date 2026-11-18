import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { brandExists, canEditBrand } from '../brand-guide/auth.js';
import {
  MAX_FORMAT_NAME,
  MAX_NAME,
  MAX_TITLE,
  createFolder,
  createFormat,
  createProject,
  createSet,
  deleteFolder,
  deleteProject,
  deleteSet,
  duplicateProject,
  duplicateSet,
  findProject,
  findSet,
  listLibrary,
  listProjects,
  normalizeName,
  renameFolder,
  restoreSet,
  updateProject,
  updateSet,
  type ProjectRef,
  type ProjectSetRef,
} from './store.js';

/**
 * Project Library 的收納與管理：格式、資料夾、專案集、專案的 CRUD、複製與搬移。
 *
 * 路由分層：
 *   /brands/:brandId/library      列表（格式＋資料夾＋專案集）
 *   /brands/:brandId/projects     專案列表（可過濾）與建立
 *   /brands/:brandId/folders      資料夾建立
 *   /brands/:brandId/formats      格式建立
 *   /project-sets/:setId/...      針對一個已有的專案集
 *   /project-folders/:folderId/... 針對一個已有的資料夾
 *   /projects/:projectId/...      針對一個已有的專案
 *
 * 權限與品牌引導一致：讀要登入，寫要有品牌編輯權。
 */

export type ProjectLibraryDeps = { pool: Pool };

type BrandParams = { brandId: string };
type SetParams = { setId: string };
type FolderParams = { folderId: string };
type ProjectParams = { projectId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function bodyOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function registerProjectLibrary(app: FastifyInstance, deps: ProjectLibraryDeps): void {
  type ResolvedSet =
    | { ok: true; set: ProjectSetRef }
    | { ok: false; status: number; body: Record<string, unknown> };

  async function resolveSet(setId: string, options: { allowDeleted?: boolean } = {}): Promise<ResolvedSet> {
    if (!isUuid(setId)) {
      return { ok: false, status: 404, body: { error: 'set_not_found', setId } };
    }

    const set = await findSet(deps.pool, setId);

    if (set === null) {
      return { ok: false, status: 404, body: { error: 'set_not_found', setId } };
    }

    if (set.deletedAt !== null && options.allowDeleted !== true) {
      return { ok: false, status: 409, body: { error: 'set_deleted', setId } };
    }

    return { ok: true, set };
  }

  async function resolveProject(projectId: string): Promise<
    | { ok: true; project: ProjectRef }
    | { ok: false; status: number; body: Record<string, unknown> }
  > {
    if (!isUuid(projectId)) {
      return { ok: false, status: 404, body: { error: 'project_not_found', projectId } };
    }

    const project = await findProject(deps.pool, projectId);

    if (project === null) {
      return { ok: false, status: 404, body: { error: 'project_not_found', projectId } };
    }

    return { ok: true, project };
  }

  /* ── 列表 ───────────────────────────────────────────── */

  app.get('/brands/:brandId/library', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as BrandParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    return listLibrary(deps.pool, brandId);
  });

  app.get('/brands/:brandId/projects', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as BrandParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const query = (request.query ?? {}) as Record<string, unknown>;
    const filter: { setId?: string | 'none'; formatId?: string; q?: string } = {};

    if (query.setId === 'none') {
      filter.setId = 'none';
    } else if (typeof query.setId === 'string' && isUuid(query.setId)) {
      filter.setId = query.setId;
    }

    if (typeof query.formatId === 'string' && isUuid(query.formatId)) {
      filter.formatId = query.formatId;
    }

    if (typeof query.q === 'string') {
      filter.q = query.q;
    }

    return { projects: await listProjects(deps.pool, brandId, filter) };
  });

  /* ── 格式 ───────────────────────────────────────────── */

  app.post('/brands/:brandId/formats', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as BrandParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const name = normalizeName(bodyOf(request.body).name, MAX_FORMAT_NAME);

    if (name === null) {
      return reply.code(400).send({ error: 'invalid_format_name', max: MAX_FORMAT_NAME });
    }

    const format = await createFormat(deps.pool, { name });

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'design.format.create',
      target: brandId,
      detail: { formatId: format.id, name },
    });

    return format;
  });

  /* ── 資料夾 ─────────────────────────────────────────── */

  app.post('/brands/:brandId/folders', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as BrandParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const name = normalizeName(bodyOf(request.body).name);

    if (name === null) {
      return reply.code(400).send({ error: 'invalid_folder_name', max: MAX_NAME });
    }

    const folder = await createFolder(deps.pool, { brandId, name });

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'design.folder.create',
      target: brandId,
      detail: { folderId: folder.id, name },
    });

    return folder;
  });

  app.patch('/project-folders/:folderId', { preHandler: app.requireUser }, async (request, reply) => {
    const { folderId } = request.params as FolderParams;

    if (!isUuid(folderId)) {
      return reply.code(404).send({ error: 'folder_not_found', folderId });
    }

    const found = await deps.pool.query<{ brand_id: string }>(
      `select brand_id from design.project_folder where id = $1`,
      [folderId],
    );
    const brandId = found.rows[0]?.brand_id;

    if (brandId === undefined) {
      return reply.code(404).send({ error: 'folder_not_found', folderId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const name = normalizeName(bodyOf(request.body).name);

    if (name === null) {
      return reply.code(400).send({ error: 'invalid_folder_name', max: MAX_NAME });
    }

    await renameFolder(deps.pool, folderId, name);

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'design.folder.rename',
      target: brandId,
      detail: { folderId, name },
    });

    return { ok: true, folderId, name };
  });

  app.delete('/project-folders/:folderId', { preHandler: app.requireUser }, async (request, reply) => {
    const { folderId } = request.params as FolderParams;

    if (!isUuid(folderId)) {
      return reply.code(404).send({ error: 'folder_not_found', folderId });
    }

    const found = await deps.pool.query<{ brand_id: string }>(
      `select brand_id from design.project_folder where id = $1`,
      [folderId],
    );
    const brandId = found.rows[0]?.brand_id;

    if (brandId === undefined) {
      return reply.code(404).send({ error: 'folder_not_found', folderId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    await deleteFolder(deps.pool, folderId);

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'design.folder.delete',
      target: brandId,
      detail: { folderId },
    });

    return { ok: true, folderId };
  });

  /* ── 專案集 ─────────────────────────────────────────── */

  app.post('/brands/:brandId/project-sets', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as BrandParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const body = bodyOf(request.body);
    const name = normalizeName(body.name);

    if (name === null) {
      return reply.code(400).send({ error: 'invalid_set_name', max: MAX_NAME });
    }

    const folderId = body.folderId === null || body.folderId === undefined ? null : String(body.folderId);

    if (folderId !== null && !isUuid(folderId)) {
      return reply.code(400).send({ error: 'invalid_folder_id', folderId });
    }

    try {
      const set = await createSet(deps.pool, { brandId, name, folderId, createdBy: user.id });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'design.set.create',
        target: brandId,
        detail: { setId: set.id, name: set.name, folderId },
      });

      return set;
    } catch (error) {
      if ((error as { code?: string }).code === 'folder_not_found') {
        return reply.code(404).send({ error: 'folder_not_found', folderId });
      }

      throw error;
    }
  });

  app.patch('/project-sets/:setId', { preHandler: app.requireUser }, async (request, reply) => {
    const { setId } = request.params as SetParams;
    const target = await resolveSet(setId);

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, target.set.brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const body = bodyOf(request.body);
    const patch: { name?: string; folderId?: string | null } = {};

    if (body.name !== undefined) {
      const name = normalizeName(body.name);

      if (name === null) {
        return reply.code(400).send({ error: 'invalid_set_name', max: MAX_NAME });
      }

      patch.name = name;
    }

    if (body.folderId !== undefined) {
      if (body.folderId === null) {
        patch.folderId = null;
      } else if (isUuid(body.folderId)) {
        patch.folderId = body.folderId;
      } else {
        return reply.code(400).send({ error: 'invalid_folder_id', folderId: body.folderId });
      }
    }

    if (patch.name === undefined && patch.folderId === undefined) {
      return reply.code(400).send({ error: 'nothing_to_update' });
    }

    try {
      await updateSet(deps.pool, target.set, patch);
    } catch (error) {
      const code = (error as { code?: string }).code;

      if (code === 'folder_not_found') {
        return reply.code(404).send({ error: 'folder_not_found', folderId: patch.folderId });
      }

      if (code === 'name_taken') {
        return reply.code(409).send({ error: 'name_taken', name: patch.name });
      }

      throw error;
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'design.set.update',
      target: target.set.brandId,
      detail: { setId, ...patch },
    });

    return { ok: true, setId };
  });

  app.post('/project-sets/:setId/duplicate', { preHandler: app.requireUser }, async (request, reply) => {
    const { setId } = request.params as SetParams;
    const target = await resolveSet(setId);

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, target.set.brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const body = bodyOf(request.body);
    const name = normalizeName(body.name) ?? `${target.set.name}（副本）`;
    const folderId =
      body.folderId === undefined
        ? target.set.folderId
        : body.folderId === null
          ? null
          : String(body.folderId);

    if (folderId !== null && !isUuid(folderId)) {
      return reply.code(400).send({ error: 'invalid_folder_id', folderId });
    }

    try {
      const copy = await duplicateSet(deps.pool, target.set, { name, folderId, createdBy: user.id });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'design.set.duplicate',
        target: target.set.brandId,
        detail: { source: setId, setId: copy.id },
      });

      return copy;
    } catch (error) {
      if ((error as { code?: string }).code === 'folder_not_found') {
        return reply.code(404).send({ error: 'folder_not_found', folderId });
      }

      throw error;
    }
  });

  app.delete('/project-sets/:setId', { preHandler: app.requireUser }, async (request, reply) => {
    const { setId } = request.params as SetParams;
    const target = await resolveSet(setId);

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, target.set.brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    await deleteSet(deps.pool, setId, user.id);

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'design.set.delete',
      target: target.set.brandId,
      detail: { setId, name: target.set.name },
    });

    return { ok: true, setId };
  });

  app.post('/project-sets/:setId/restore', { preHandler: app.requireUser }, async (request, reply) => {
    const { setId } = request.params as SetParams;
    const target = await resolveSet(setId, { allowDeleted: true });

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, target.set.brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    // 還原時如果名字已被另一套用，自動改名。
    const library = await listLibrary(deps.pool, target.set.brandId);
    let name = target.set.name;

    if (library.sets.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      for (let index = 2; index < 100; index += 1) {
        const candidate = `${target.set.name}（${index}）`;

        if (!library.sets.some((item) => item.name.toLowerCase() === candidate.toLowerCase())) {
          name = candidate;
          break;
        }
      }
    }

    await restoreSet(deps.pool, setId, name);

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'design.set.restore',
      target: target.set.brandId,
      detail: { setId, name },
    });

    return { ok: true, setId, name };
  });

  /* ── 專案 ───────────────────────────────────────────── */

  app.post('/brands/:brandId/projects', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as BrandParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const body = bodyOf(request.body);
    const title = normalizeName(body.title, MAX_TITLE);

    if (title === null) {
      return reply.code(400).send({ error: 'invalid_title', max: MAX_TITLE });
    }

    const formatId = body.formatId;
    const setId = body.setId === null || body.setId === undefined ? null : String(body.setId);

    if (typeof formatId !== 'string' || !isUuid(formatId)) {
      return reply.code(400).send({ error: 'invalid_format_id', formatId });
    }

    if (setId !== null && !isUuid(setId)) {
      return reply.code(400).send({ error: 'invalid_set_id', setId });
    }

    try {
      const project = await createProject(deps.pool, {
        brandId,
        title,
        formatId,
        setId,
        createdBy: user.id,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'design.project.create',
        target: brandId,
        detail: { projectId: project.id, title, formatId, setId },
      });

      return { project };
    } catch (error) {
      const code = (error as { code?: string }).code;

      if (code === 'format_not_found') {
        return reply.code(404).send({ error: 'format_not_found', formatId });
      }

      if (code === 'set_not_found') {
        return reply.code(404).send({ error: 'set_not_found', setId });
      }

      throw error;
    }
  });

  app.patch('/projects/:projectId', { preHandler: app.requireUser }, async (request, reply) => {
    const { projectId } = request.params as ProjectParams;
    const target = await resolveProject(projectId);

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, target.project.brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const body = bodyOf(request.body);
    const patch: { title?: string; formatId?: string; setId?: string | null; coverFileId?: string | null } = {};

    if (body.title !== undefined) {
      const title = normalizeName(body.title, MAX_TITLE);

      if (title === null) {
        return reply.code(400).send({ error: 'invalid_title', max: MAX_TITLE });
      }

      patch.title = title;
    }

    if (body.formatId !== undefined) {
      if (typeof body.formatId === 'string' && isUuid(body.formatId)) {
        patch.formatId = body.formatId;
      } else {
        return reply.code(400).send({ error: 'invalid_format_id', formatId: body.formatId });
      }
    }

    if (body.setId !== undefined) {
      if (body.setId === null) {
        patch.setId = null;
      } else if (isUuid(body.setId)) {
        patch.setId = body.setId;
      } else {
        return reply.code(400).send({ error: 'invalid_set_id', setId: body.setId });
      }
    }

    if (body.coverFileId !== undefined) {
      patch.coverFileId = body.coverFileId === null ? null : String(body.coverFileId);
    }

    if (patch.title === undefined && patch.formatId === undefined && patch.setId === undefined && patch.coverFileId === undefined) {
      return reply.code(400).send({ error: 'nothing_to_update' });
    }

    try {
      await updateProject(deps.pool, target.project, patch);
    } catch (error) {
      const code = (error as { code?: string }).code;

      if (code === 'format_not_found') {
        return reply.code(404).send({ error: 'format_not_found', formatId: patch.formatId });
      }

      if (code === 'set_not_found') {
        return reply.code(404).send({ error: 'set_not_found', setId: patch.setId });
      }

      throw error;
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'design.project.update',
      target: target.project.brandId,
      detail: { projectId, ...patch },
    });

    return { ok: true, projectId };
  });

  app.post('/projects/:projectId/duplicate', { preHandler: app.requireUser }, async (request, reply) => {
    const { projectId } = request.params as ProjectParams;
    const target = await resolveProject(projectId);

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, target.project.brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const body = bodyOf(request.body);
    const title = normalizeName(body.title, MAX_TITLE) ?? `${target.project.title}（副本）`;

    const copy = await duplicateProject(deps.pool, target.project, { title, createdBy: user.id });

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'design.project.duplicate',
      target: target.project.brandId,
      detail: { source: projectId, projectId: copy.id },
    });

    return { project: copy };
  });

  app.delete('/projects/:projectId', { preHandler: app.requireUser }, async (request, reply) => {
    const { projectId } = request.params as ProjectParams;
    const target = await resolveProject(projectId);

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('project-library 路由缺少 requireUser');
    }

    if (!(await canEditBrand(deps.pool, target.project.brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    await deleteProject(deps.pool, projectId);

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'design.project.delete',
      target: target.project.brandId,
      detail: { projectId, title: target.project.title },
    });

    return { ok: true, projectId };
  });
}

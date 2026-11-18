import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { brandExists, canEditBrand } from '../brand-guide/auth.js';
import {
  createFolder,
  createSet,
  deleteFolder,
  deleteSet,
  duplicateSet,
  findBrandSet,
  listBrandSets,
  normalizeName,
  renameFolder,
  restoreSet,
  updateSet,
  type BrandSetRef,
} from './store.js';

/**
 * 品牌集（04A–04H）的收納與管理：資料夾、複製、搬移、改名、安全刪除。
 *
 * 路由刻意分兩層：
 *   /brands/:brandId/...   建立與列表（要有品牌才知道放哪）
 *   /brand-sets/:setId/... 針對一個已有的品牌集
 * 因為品牌集自己記得 brand_id，逐個動作不需要再叫前端傳一次品牌，
 * 傳兩個來源只會出現「兩邊唔一致」這種 bug。
 *
 * 權限與品牌引導其他寫入一致：讀要登入，寫要品牌編輯權。
 */

export type BrandSetDeps = { pool: Pool };

type BrandParams = { brandId: string };
type SetParams = { setId: string };
type FolderParams = { folderId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function bodyOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function registerBrandSets(app: FastifyInstance, deps: BrandSetDeps): void {
  type Resolved = { ok: true; set: BrandSetRef } | { ok: false; status: number; body: Record<string, unknown> };

  /** 讀一個品牌集，順便講清楚「不存在」與「已刪除」的分別。 */
  async function resolveSet(setId: string, options: { allowDeleted?: boolean } = {}): Promise<Resolved> {
    if (!isUuid(setId)) {
      return { ok: false, status: 404, body: { error: 'brand_set_not_found', setId } };
    }

    const set = await findBrandSet(deps.pool, setId);

    if (set === null) {
      return { ok: false, status: 404, body: { error: 'brand_set_not_found', setId } };
    }

    if (set.deletedAt !== null && options.allowDeleted !== true) {
      return { ok: false, status: 409, body: { error: 'brand_set_deleted', setId } };
    }

    return { ok: true, set };
  }

  /** 列表：資料夾 ＋ 使用中的品牌集 ＋ 已刪除（可以還原）。 */
  app.get('/brands/:brandId/sets', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as BrandParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    return listBrandSets(deps.pool, brandId);
  });

  app.post('/brands/:brandId/sets', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as BrandParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-set 路由缺少 requireUser：request.currentUser 是空的');
    }

    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const body = bodyOf(request.body);
    const name = normalizeName(body.name);

    if (name === null) {
      return reply.code(400).send({ error: 'invalid_set_name', max: 80 });
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
        action: 'brand.set.create',
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

  // 改名與搬資料夾走同一條：兩者都只是「這個品牌集屬於邊」的修正。
  app.patch('/brand-sets/:setId', { preHandler: app.requireUser }, async (request, reply) => {
    const { setId } = request.params as SetParams;
    const target = await resolveSet(setId);

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-set 路由缺少 requireUser：request.currentUser 是空的');
    }

    if (!(await canEditBrand(deps.pool, target.set.brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const body = bodyOf(request.body);
    const patch: { name?: string; folderId?: string | null } = {};

    if (body.name !== undefined) {
      const name = normalizeName(body.name);

      if (name === null) {
        return reply.code(400).send({ error: 'invalid_set_name', max: 80 });
      }

      patch.name = name;
    }

    // folderId: null 是「移去未分類」，undefined 是「不搬」。兩者意思不同，
    // 所以要分得出「有傳但係 null」。
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
      action: 'brand.set.update',
      target: target.set.brandId,
      detail: { setId, ...patch },
    });

    return { ok: true, setId };
  });

  app.post('/brand-sets/:setId/duplicate', { preHandler: app.requireUser }, async (request, reply) => {
    const { setId } = request.params as SetParams;
    const target = await resolveSet(setId);

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-set 路由缺少 requireUser：request.currentUser 是空的');
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
        action: 'brand.set.duplicate',
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

  // 安全刪除：只標記。資料、歷史、附件全部留低，隨時可以還原。
  app.delete('/brand-sets/:setId', { preHandler: app.requireUser }, async (request, reply) => {
    const { setId } = request.params as SetParams;
    const target = await resolveSet(setId);

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-set 路由缺少 requireUser：request.currentUser 是空的');
    }

    if (!(await canEditBrand(deps.pool, target.set.brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    await deleteSet(deps.pool, setId, user.id);

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'brand.set.delete',
      target: target.set.brandId,
      detail: { setId, name: target.set.name },
    });

    return { ok: true, setId };
  });

  app.post('/brand-sets/:setId/restore', { preHandler: app.requireUser }, async (request, reply) => {
    const { setId } = request.params as SetParams;
    const target = await resolveSet(setId, { allowDeleted: true });

    if (!target.ok) {
      return reply.code(target.status).send(target.body);
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-set 路由缺少 requireUser：request.currentUser 是空的');
    }

    if (!(await canEditBrand(deps.pool, target.set.brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    // 還原時如果名字已經被另一套用了，自動改名，不要丟錯讓人自己想。
    const existing = await listBrandSets(deps.pool, target.set.brandId);
    let name = target.set.name;

    if (existing.sets.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      for (let index = 2; index < 100; index += 1) {
        const candidate = `${target.set.name}（${index}）`;

        if (!existing.sets.some((item) => item.name.toLowerCase() === candidate.toLowerCase())) {
          name = candidate;
          break;
        }
      }
    }

    await restoreSet(deps.pool, setId);

    if (name !== target.set.name) {
      await updateSet(deps.pool, { ...target.set, deletedAt: null }, { name });
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'brand.set.restore',
      target: target.set.brandId,
      detail: { setId, name },
    });

    return { ok: true, setId, name };
  });

  /* ── 資料夾 ─────────────────────────────────────────────── */

  app.post('/brands/:brandId/set-folders', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as BrandParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-set 路由缺少 requireUser：request.currentUser 是空的');
    }

    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const name = normalizeName(bodyOf(request.body).name);

    if (name === null) {
      return reply.code(400).send({ error: 'invalid_folder_name', max: 80 });
    }

    const folder = await createFolder(deps.pool, { brandId, name });

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'brand.set.folder.create',
      target: brandId,
      detail: { folderId: folder.id, name },
    });

    return folder;
  });

  app.patch('/brand-set-folders/:folderId', { preHandler: app.requireUser }, async (request, reply) => {
    const { folderId } = request.params as FolderParams;

    if (!isUuid(folderId)) {
      return reply.code(404).send({ error: 'folder_not_found', folderId });
    }

    const found = await deps.pool.query<{ brand_id: string }>(
      `select brand_id from brand_set_folder where id = $1`,
      [folderId],
    );
    const brandId = found.rows[0]?.brand_id;

    if (brandId === undefined) {
      return reply.code(404).send({ error: 'folder_not_found', folderId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-set 路由缺少 requireUser：request.currentUser 是空的');
    }

    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const name = normalizeName(bodyOf(request.body).name);

    if (name === null) {
      return reply.code(400).send({ error: 'invalid_folder_name', max: 80 });
    }

    await renameFolder(deps.pool, folderId, name);

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'brand.set.folder.rename',
      target: brandId,
      detail: { folderId, name },
    });

    return { ok: true, folderId, name };
  });

  app.delete('/brand-set-folders/:folderId', { preHandler: app.requireUser }, async (request, reply) => {
    const { folderId } = request.params as FolderParams;

    if (!isUuid(folderId)) {
      return reply.code(404).send({ error: 'folder_not_found', folderId });
    }

    const found = await deps.pool.query<{ brand_id: string }>(
      `select brand_id from brand_set_folder where id = $1`,
      [folderId],
    );
    const brandId = found.rows[0]?.brand_id;

    if (brandId === undefined) {
      return reply.code(404).send({ error: 'folder_not_found', folderId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-set 路由缺少 requireUser：request.currentUser 是空的');
    }

    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    await deleteFolder(deps.pool, folderId);

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'brand.set.folder.delete',
      target: brandId,
      detail: { folderId },
    });

    return { ok: true, folderId };
  });
}

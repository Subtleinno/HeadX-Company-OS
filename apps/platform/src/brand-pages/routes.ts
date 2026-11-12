import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { canEditBrand } from './permissions.js';
import {
  isUuid,
  parseCreatePageInput,
  parseRenameInput,
  parseVersionInput,
} from './schema.js';
import {
  brandExists,
  createPage,
  createVersion,
  deletePage,
  deleteVersion,
  ensureFixedPages,
  findCurrentVersion,
  findPage,
  listEditors,
  listPages,
  listVersions,
  renamePage,
  restoreVersion,
  setEditor,
} from './store.js';

/**
 * 品牌頁、頁版本與自定義頁 API（issue #33、#32）。
 *
 * 七條路：
 *   GET    /brands/:brandId/pages                              頁清單（任何登入者）
 *   GET    /brands/:brandId/pages/:key                         一頁的現行版本與版本列表
 *   POST   /brands/:brandId/pages                              建立自定義頁（要編輯權）
 *   PATCH  /brands/:brandId/pages/:key                         改顯示名（要編輯權）
 *   DELETE /brands/:brandId/pages/:key                         軟刪除自定義頁（要編輯權）
 *   POST   /brands/:brandId/pages/:key/versions                儲存＝新增一版（要編輯權）
 *   POST   /brands/:brandId/pages/:key/versions/:id/restore    用回舊版（要編輯權）
 *   DELETE /brands/:brandId/pages/:key/versions/:id            軟刪除舊版（要編輯權）
 *   GET    /brands/:brandId/editors                            誰可以改這個品牌（任何登入者）
 *   PUT    /brands/:brandId/editors/:userId                    授予（只有老闆）
 *   DELETE /brands/:brandId/editors/:userId                    收回（只有老闆）
 *
 * **讀為什麼不是老闆專用**：員工預設只讀 —— 只讀是「看得到、改不了」，不是
 * 「看不到」（C98）。擋在讀取只會令人以為這一頁不存在。
 *
 * **寫為什麼不再是 requireOwner**：品牌級編輯權（C103）—— 老闆永遠可以改，
 * 另外可以由老闆指定某個員工「可以改這個品牌的頁」。授權掛在 (brand, user)
 * 這一對，不是職位、不是部門。前端也會用 `canEdit` 決定顯示什麼，但**前端不
 * 決定可不可以做**：這裡每次都再問一次（#32 第 13 點）。
 *
 * 跨品牌一律當作不存在（404），不回 403：回 403 等於確認那個 id 真的存在。
 */

export type BrandPagesDeps = {
  pool: Pool;
};

type PageParams = { brandId: string; key: string };
type VersionParams = PageParams & { versionId: string };
type EditorParams = { brandId: string; userId: string };

export function registerBrandPages(app: FastifyInstance, deps: BrandPagesDeps): void {
  /**
   * 讀之前先確保五個固定頁存在。品牌可以在這個功能之前就開好（#19），
   * 沒有那一列就建 —— 不是 backfill 腳本，而是每次讀都便宜地對一次。
   */
  async function resolvePage(brandId: string, key: string) {
    if (!isUuid(brandId)) {
      return { kind: 'brand_missing' as const };
    }

    if (!(await brandExists(deps.pool, brandId))) {
      return { kind: 'brand_missing' as const };
    }

    await ensureFixedPages(deps.pool, brandId);

    const page = await findPage(deps.pool, brandId, key);

    if (page === null) {
      return { kind: 'page_missing' as const };
    }

    return { kind: 'ok' as const, page };
  }

  /**
   * 寫入之前問一次「這個人可不可以改這個品牌」。
   *
   * 回 `null` 代表可以；回一個字串代表拒絕的理由（route 直接拿去回 403）。
   * 不在 preHandler 用 `requireOwner`：那會令品牌編輯權永遠用不到，而
   * `canEditBrand` 需要讀品牌 id，那只有 handler 內才拿到。
   */
  async function editDenied(request: FastifyRequest, brandId: string): Promise<string | null> {
    const user = request.currentUser;

    // request.currentUser 由 requireUser 設定；這裡拿不到就是程式接錯，
    // 不要靜靜當成「有權限」。
    if (user === null) {
      throw new Error('brand-pages 路由缺少 requireUser：request.currentUser 是空的');
    }

    return (await canEditBrand(deps.pool, brandId, user)) ? null : 'not_brand_editor';
  }

  app.get('/brands/:brandId/pages', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as PageParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    await ensureFixedPages(deps.pool, brandId);

    const actor = request.currentUser;

    return {
      items: await listPages(deps.pool, brandId),
      // 前端用它決定顯示什麼表單；後端每一條寫入仍然自己再問一次（#32 第 13 點）。
      canEdit: actor === null ? false : await canEditBrand(deps.pool, brandId, actor),
    };
  });

  /**
   * 建立自定義頁。三樣一次過要齊：顯示名、slug、一句「這一頁要決定什麼」。
   *
   * 「這一頁是不是其實屬於標誌／色彩／字體／語氣」那個判斷在畫面做（#32 第 6 點）：
   * 選了任何一個就帶去那一頁，不會呼叫這條路。後端不需要猜。
   */
  app.post('/brands/:brandId/pages', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as { brandId: string };

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const denied = await editDenied(request, brandId);

    if (denied !== null) {
      return reply.code(403).send({ error: denied });
    }

    const parsed = parseCreatePageInput(request.body);

    if (!parsed.ok) {
      return reply.code(400).send({ error: 'invalid_page', reason: parsed.reason });
    }

    await ensureFixedPages(deps.pool, brandId);

    const outcome = await createPage(deps.pool, { brandId, ...parsed.value });

    if (outcome.status === 'conflict') {
      return reply.code(409).send({
        error: 'page_key_taken',
        key: outcome.key,
        name: outcome.name,
        message: `已經有一張頁用 ${outcome.key}：${outcome.name}。名或 slug 撞了都不會自動改名。`,
      });
    }

    if (outcome.status === 'fixed_key') {
      return reply.code(409).send({
        error: 'page_key_reserved',
        key: outcome.key,
        message: `${outcome.key} 是五個固定頁之一，不可以用來做自定義頁。`,
      });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-pages 路由缺少 requireUser：request.currentUser 是空的');
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'brand.page.create',
      target: outcome.page.id,
      detail: { brandId, key: outcome.page.key, name: outcome.page.name },
    });

    return reply.code(201).send({ page: outcome.page });
  });

  /** 改名。slug 不可改：請求帶 slug 一律 400，而不是靜靜忽略（C101）。 */
  app.patch(
    '/brands/:brandId/pages/:key',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, key } = request.params as PageParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      const denied = await editDenied(request, brandId);

      if (denied !== null) {
        return reply.code(403).send({ error: denied });
      }

      const parsed = parseRenameInput(request.body);

      if (!parsed.ok) {
        return reply.code(400).send({ error: 'invalid_page', reason: parsed.reason });
      }

      const page = await renamePage(deps.pool, { brandId, key, name: parsed.value.name });

      if (page === null) {
        return reply.code(404).send({ error: 'page_not_found', key });
      }

      const actor = request.currentUser;

      if (actor === null) {
        throw new Error('brand-pages 路由缺少 requireUser：request.currentUser 是空的');
      }

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: actor.id,
        action: 'brand.page.rename',
        target: page.id,
        detail: { brandId, key, name: page.name },
      });

      return { page };
    },
  );

  /**
   * 軟刪除自定義頁。五個固定頁拒絕（它們是網址的一部分）；任何一版被成品釘住
   * 也拒絕，並講明釘在哪一件 —— 不是把頁刪掉令成品指向空的。
   */
  app.delete(
    '/brands/:brandId/pages/:key',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, key } = request.params as PageParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      const denied = await editDenied(request, brandId);

      if (denied !== null) {
        return reply.code(403).send({ error: denied });
      }

      const outcome = await deletePage(deps.pool, { brandId, key });

      if (outcome.status === 'not_found') {
        return reply.code(404).send({ error: 'page_not_found', key });
      }

      if (outcome.status === 'fixed') {
        return reply.code(409).send({
          error: 'page_is_fixed',
          key,
          message: `${outcome.name}是五個固定頁之一，網址的一部分，不可以刪。`,
        });
      }

      if (outcome.status === 'pinned') {
        return reply.code(409).send({
          error: 'page_pinned',
          key,
          pinnedBy: outcome.labels,
          message: `${outcome.name}有版本被已出街成品釘住（${outcome.labels.join('、')}）。要刪，先改那一件成品。`,
        });
      }

      const actor = request.currentUser;

      if (actor === null) {
        throw new Error('brand-pages 路由缺少 requireUser：request.currentUser 是空的');
      }

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: actor.id,
        action: 'brand.page.delete',
        target: key,
        detail: { brandId, key, name: outcome.name, versions: outcome.versions },
      });

      return { deleted: true, key, versions: outcome.versions };
    },
  );

  app.get(
    '/brands/:brandId/pages/:key',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, key } = request.params as PageParams;
      const resolved = await resolvePage(brandId, key);

      if (resolved.kind === 'brand_missing') {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (resolved.kind === 'page_missing') {
        return reply.code(404).send({ error: 'page_not_found', key });
      }

      const [versions, current] = await Promise.all([
        listVersions(deps.pool, resolved.page.id),
        findCurrentVersion(deps.pool, resolved.page.id),
      ]);

      return { page: resolved.page, versions, current };
    },
  );

  app.post(
    '/brands/:brandId/pages/:key/versions',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, key } = request.params as PageParams;
      const resolved = await resolvePage(brandId, key);

      if (resolved.kind === 'brand_missing') {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (resolved.kind === 'page_missing') {
        return reply.code(404).send({ error: 'page_not_found', key });
      }

      const denied = await editDenied(request, brandId);

      if (denied !== null) {
        return reply.code(403).send({ error: denied });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-pages 路由缺少 requireUser：request.currentUser 是空的');
      }

      const parsed = parseVersionInput(request.body);

      if (!parsed.ok) {
        return reply.code(400).send({ error: 'invalid_version', reason: parsed.reason });
      }

      const version = await createVersion(deps.pool, {
        pageId: resolved.page.id,
        document: parsed.value.document,
        content: parsed.value.content,
        note: parsed.value.note,
        actorId: user.id,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.page.version.create',
        target: version.id,
        detail: { brandId, pageKey: key, versionNo: version.versionNo },
      });

      return reply.code(201).send({ version, page: { ...resolved.page, current: version } });
    },
  );

  app.post(
    '/brands/:brandId/pages/:key/versions/:versionId/restore',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, key, versionId } = request.params as VersionParams;
      const resolved = await resolvePage(brandId, key);

      if (resolved.kind === 'brand_missing') {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (resolved.kind === 'page_missing') {
        return reply.code(404).send({ error: 'page_not_found', key });
      }

      const denied = await editDenied(request, brandId);

      if (denied !== null) {
        return reply.code(403).send({ error: denied });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-pages 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!isUuid(versionId)) {
        return reply.code(404).send({ error: 'version_not_found', versionId });
      }

      const outcome = await restoreVersion(deps.pool, {
        pageId: resolved.page.id,
        sourceVersionId: versionId,
        actorId: user.id,
      });

      if (outcome.status === 'not_found') {
        return reply.code(404).send({ error: 'version_not_found', versionId });
      }

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.page.version.restore',
        target: outcome.version.id,
        detail: {
          brandId,
          pageKey: key,
          versionNo: outcome.version.versionNo,
          sourceVersionId: versionId,
        },
      });

      return reply.code(201).send({ version: outcome.version });
    },
  );

  app.delete(
    '/brands/:brandId/pages/:key/versions/:versionId',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, key, versionId } = request.params as VersionParams;
      const resolved = await resolvePage(brandId, key);

      if (resolved.kind === 'brand_missing') {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (resolved.kind === 'page_missing') {
        return reply.code(404).send({ error: 'page_not_found', key });
      }

      const denied = await editDenied(request, brandId);

      if (denied !== null) {
        return reply.code(403).send({ error: denied });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-pages 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!isUuid(versionId)) {
        return reply.code(404).send({ error: 'version_not_found', versionId });
      }

      const outcome = await deleteVersion(deps.pool, {
        pageId: resolved.page.id,
        versionId,
      });

      if (outcome.status === 'not_found') {
        return reply.code(404).send({ error: 'version_not_found', versionId });
      }

      if (outcome.status === 'current') {
        // 講明要先換現行：不是「不可以刪」，而是「這一個刪了之後這一頁就沒有現行」。
        return reply.code(409).send({
          error: 'current_version',
          versionNo: outcome.versionNo,
          message: `第 ${outcome.versionNo} 版是現行版本。先用另一版建立新版本，才可以刪這一版。`,
        });
      }

      if (outcome.status === 'pinned') {
        return reply.code(409).send({
          error: 'version_pinned',
          versionNo: outcome.versionNo,
          pinnedBy: outcome.labels,
          message: `第 ${outcome.versionNo} 版被已出街成品釘住（${outcome.labels.join('、')}）。要斷開，先改那一件成品。`,
        });
      }

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.page.version.delete',
        target: versionId,
        detail: { brandId, pageKey: key, versionNo: outcome.versionNo },
      });

      return reply.code(200).send({ deleted: true, versionNo: outcome.versionNo });
    },
  );

  /**
   * 誰可以改這個品牌的頁。
   *
   * 讀：任何登入者（員工要知道自己是不是可以改，才不會打了十分鐘才發現存不了）。
   * 寫：只有老闆 —— 授予與收回都是老闆的決定（C103）。老闆本人不出現在名單裡：
   * 他永遠可以改，寫進來只會出現「老闆被移除了編輯權」這種講不通的狀態。
   */
  app.get(
    '/brands/:brandId/editors',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId } = request.params as { brandId: string };

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      return { items: await listEditors(deps.pool, brandId) };
    },
  );

  app.put(
    '/brands/:brandId/editors/:userId',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      const { brandId, userId } = request.params as EditorParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!isUuid(userId)) {
        return reply.code(404).send({ error: 'user_not_found', userId });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-pages 路由缺少 requireOwner：request.currentUser 是空的');
      }

      const granted = await setEditor(deps.pool, {
        brandId,
        userId,
        grantedBy: user.id,
        granted: true,
      });

      if (!granted) {
        return reply.code(404).send({ error: 'user_not_found', userId });
      }

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.editor.grant',
        target: userId,
        detail: { brandId },
      });

      return { items: await listEditors(deps.pool, brandId) };
    },
  );

  app.delete(
    '/brands/:brandId/editors/:userId',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      const { brandId, userId } = request.params as EditorParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-pages 路由缺少 requireOwner：request.currentUser 是空的');
      }

      await setEditor(deps.pool, {
        brandId,
        userId,
        grantedBy: user.id,
        granted: false,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.editor.revoke',
        target: userId,
        detail: { brandId },
      });

      return { items: await listEditors(deps.pool, brandId) };
    },
  );
}

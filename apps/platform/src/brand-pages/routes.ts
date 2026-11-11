import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { isUuid, parseVersionInput } from './schema.js';
import {
  brandExists,
  createVersion,
  deleteVersion,
  ensureFixedPages,
  findCurrentVersion,
  findPage,
  listPages,
  listVersions,
  restoreVersion,
} from './store.js';

/**
 * 品牌頁與頁版本 API（issue #33）。
 *
 * 五條路：
 *   GET    /brands/:brandId/pages                              頁清單（任何登入者）
 *   GET    /brands/:brandId/pages/:key                         一頁的現行版本與版本列表
 *   POST   /brands/:brandId/pages/:key/versions                儲存＝新增一版（要編輯權）
 *   POST   /brands/:brandId/pages/:key/versions/:id/restore    用回舊版（要編輯權）
 *   DELETE /brands/:brandId/pages/:key/versions/:id            軟刪除舊版（要編輯權）
 *
 * **讀為什麼不是老闆專用**：員工預設只讀 —— 只讀是「看得到、改不了」，不是
 * 「看不到」（C98）。擋在讀取只會令人以為這一頁不存在。
 *
 * **寫為什麼現在只有老闆**：編輯權是品牌級（C98），但「授予某人可以改這個
 * 品牌」的介面與資料在 #32。在它存在之前，這裡只認老闆 —— 不會假裝有一個
 * 未實作的授權，也不會把 403 講成別的原因。
 *
 * 跨品牌一律當作不存在（404），不回 403：回 403 等於確認那個 id 真的存在，
 * 而它不應該被確認。
 */

export type BrandPagesDeps = {
  pool: Pool;
};

type PageParams = { brandId: string; key: string };
type VersionParams = PageParams & { versionId: string };

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

  app.get('/brands/:brandId/pages', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as PageParams;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    await ensureFixedPages(deps.pool, brandId);

    return { items: await listPages(deps.pool, brandId) };
  });

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
    { preHandler: app.requireOwner },
    async (request, reply) => {
      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-pages 路由缺少 requireOwner：request.currentUser 是空的');
      }

      const { brandId, key } = request.params as PageParams;
      const resolved = await resolvePage(brandId, key);

      if (resolved.kind === 'brand_missing') {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (resolved.kind === 'page_missing') {
        return reply.code(404).send({ error: 'page_not_found', key });
      }

      const parsed = parseVersionInput(request.body);

      if (!parsed.ok) {
        return reply.code(400).send({ error: 'invalid_version', reason: parsed.reason });
      }

      const version = await createVersion(deps.pool, {
        pageId: resolved.page.id,
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
    { preHandler: app.requireOwner },
    async (request, reply) => {
      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-pages 路由缺少 requireOwner：request.currentUser 是空的');
      }

      const { brandId, key, versionId } = request.params as VersionParams;
      const resolved = await resolvePage(brandId, key);

      if (resolved.kind === 'brand_missing') {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (resolved.kind === 'page_missing') {
        return reply.code(404).send({ error: 'page_not_found', key });
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
    { preHandler: app.requireOwner },
    async (request, reply) => {
      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-pages 路由缺少 requireOwner：request.currentUser 是空的');
      }

      const { brandId, key, versionId } = request.params as VersionParams;
      const resolved = await resolvePage(brandId, key);

      if (resolved.kind === 'brand_missing') {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (resolved.kind === 'page_missing') {
        return reply.code(404).send({ error: 'page_not_found', key });
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
}

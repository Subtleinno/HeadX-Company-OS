import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { canEditBrand } from '../brand-pages/permissions.js';
import { isUuid } from '../brand-pages/schema.js';
import { brandExists, findPage } from '../brand-pages/store.js';
import { countGaps, createGapNeed, listGaps } from './store.js';

/**
 * 品牌缺口（issue #58）。
 *
 *   GET  /brands/:brandId/gaps               全部缺口＋已建立的 Need 狀態
 *   GET  /brands/:brandId/gaps?page=color    只取這一頁（右側欄用）
 *   POST /brands/:brandId/gaps/needs         一鍵建立 Need（重複按不會開第二張）
 *
 * **缺什麼由文件講，不是由這張表講。** 所以這裡沒有「新增缺口」的路：缺口
 * 是內容的一部分（儲存時寫入），不是一個可以由 API 任意創造的物件。
 *
 * 判斷型缺口只有老闆可以開單（`owner_only`）：外判不能替公司做定位決定。
 * 外判角色未存在（已知缺口），所以這一條現時以「老闆 vs 非老闆」實現。
 */

export type BrandGapsDeps = { pool: Pool };

type Params = { brandId: string };

export function registerBrandGaps(app: FastifyInstance, deps: BrandGapsDeps): void {
  app.get('/brands/:brandId/gaps', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as Params;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const query = request.query as { page?: string };
    const items = await listGaps(deps.pool, brandId);
    const filtered = typeof query.page === 'string' ? items.filter((item) => item.pageKey === query.page) : items;

    return { items: filtered, counts: countGaps(items) };
  });

  app.post('/brands/:brandId/gaps/needs', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as Params;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-gaps 路由缺少 requireUser：request.currentUser 是空的');
    }

    const allowed = await canEditBrand(deps.pool, brandId, user);

    if (!allowed) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const body = request.body as { pageKey?: unknown; item?: unknown } | null;
    const pageKey = typeof body?.pageKey === 'string' ? body.pageKey : '';
    const item = typeof body?.item === 'string' ? body.item : '';

    if (pageKey === '' || item === '') {
      return reply.code(400).send({ error: 'invalid_gap', reason: 'pageKey 與 item 都要有' });
    }

    // 頁一定要存在：否則會出現一條指向不存在頁的 brand_gap。
    if ((await findPage(deps.pool, brandId, pageKey)) === null) {
      return reply.code(404).send({ error: 'page_not_found', pageKey });
    }

    const outcome = await createGapNeed(deps.pool, {
      brandId,
      pageKey,
      item,
      actorId: user.id,
      isOwner: user.role === 'owner',
    });

    if (outcome.status === 'not_a_gap') {
      return reply.code(404).send({ error: 'gap_not_found', pageKey, item });
    }

    if (outcome.status === 'owner_only') {
      return reply.code(403).send({
        error: 'owner_only',
        message: '判斷型缺口只有老闆可以建立 Need：要由公司決定，不是交一份檔案。',
      });
    }

    if (outcome.status === 'page_missing') {
      return reply.code(404).send({ error: 'page_not_found', pageKey });
    }

    if (outcome.created) {
      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.gap.need',
        target: outcome.needId,
        detail: { brandId, pageKey, item, needCode: outcome.needCode },
      });
    }

    return outcome.created
      ? reply.code(201).send({ need: { id: outcome.needId, code: outcome.needCode }, created: true })
      : reply.send({ need: { id: outcome.needId, code: outcome.needCode }, created: false });
  });
}

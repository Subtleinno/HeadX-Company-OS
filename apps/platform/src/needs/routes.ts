import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { parseListQuery } from './schema.js';
import { claimNeed, findNeed, listNeeds, summarizeNeeds } from './store.js';

/**
 * Needs 的 API（issue 184）。
 *
 * 三條路，全部要登入：
 *   GET  /needs          清單（可篩狀態、來源、上限）
 *   GET  /needs/summary  計數（頂欄與右側欄用）
 *   POST /needs/:id/claim 認領
 *
 * 為咩唔係老闆專用：Need 係「交畀人做嘅工作」，員工要做得先要看得。
 * 但係唔會因為看得就改得到：改狀態只有認領一條，其餘由 agent 按事實推進（C06）。
 *
 * 呢張唔做：開立 Need（屬 agent／MCP）、交貨、吸收、驗收。
 * 冇做的路就唔好開一個假路由，否則前端會以為功能已經有。
 */

export type NeedsDeps = {
  pool: Pool;
  /** 注入時鐘：測試要固定「而家」才講得清邊件逾期。 */
  now?: () => Date;
};

export function registerNeeds(app: FastifyInstance, deps: NeedsDeps): void {
  const now = deps.now ?? (() => new Date());

  app.get('/needs', { preHandler: app.requireUser }, async (request, reply) => {
    const parsed = parseListQuery(request.query);

    if (!parsed.ok) {
      return reply.code(400).send({ error: 'invalid_query', reasons: parsed.errors });
    }

    const items = await listNeeds(deps.pool, parsed.value, now());

    return { items, query: parsed.value };
  });

  app.get('/needs/summary', { preHandler: app.requireUser }, async (request, reply) => {
    // 計數可以用來源篩選：右側欄要「此頁」的數字，頂欄要全公司。
    const parsed = parseListQuery(request.query);

    if (!parsed.ok) {
      return reply.code(400).send({ error: 'invalid_query', reasons: parsed.errors });
    }

    const counts = await summarizeNeeds(deps.pool, parsed.value.appId, now());

    return { counts };
  });

  app.post('/needs/:id/claim', { preHandler: app.requireUser }, async (request, reply) => {
    const user = request.currentUser;

    // requireUser 已經擋過未登入；冇 currentUser 就係路由設定出錯，唔可以當成 401。
    if (user === null) {
      throw new Error('needs 路由缺少 requireUser：request.currentUser 是空的');
    }

    const id = (request.params as { id: string }).id;
    const claimed = await claimNeed(deps.pool, id, user.id);

    if (!claimed) {
      // 兩種可能：冇這件工作，或者俾人認領了／已驗收。前端一律叫用戶重新載入，
      // 唔假裝成功。
      const existing = await findNeed(deps.pool, id, now());

      if (existing === null) {
        return reply.code(404).send({ error: 'need_not_found', id });
      }

      return reply.code(409).send({
        error: existing.state === 'claimed' || existing.state === 'uploaded' ? 'already_claimed' : 'need_closed',
        state: existing.state,
      });
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'need.claim',
      target: id,
    });

    const updated = await findNeed(deps.pool, id, now());

    return updated === null ? reply.code(404).send({ error: 'need_not_found', id }) : { item: updated };
  });
}

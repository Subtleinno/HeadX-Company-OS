import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { activeGrantsForAgent } from '../agents/store.js';
import { brandExists } from './auth.js';
import { MAX_DECISION_LENGTH, getBlock, isBlockId, listBlocks, saveDecision } from './blocks.js';
import { GUIDE_STAGES, isUuid } from './schema.js';
import { resolveSetScope } from './set-scope.js';

/**
 * Agent（MCP）讀寫品牌引導區塊的路。
 *
 * 為什麼要另開一組 `/agent/...` 而不是重用 `/brands/...`：
 *   - 人的路由認 cookie session；agent 認 Bearer token，兩套身份不能混在手寫的
 *     `if` 裡，否則一次改錯就是「有 token 就等於老闆」。
 *   - agent 的權限單位是 app grant（`design`），不是品牌編輯名單。它要能寫，
 *     一定是老闆在授權頁批准過。
 *
 * 寫入的仍是同一份 `brand_guide_block`，所以人在畫面看到的決策、歷史與 agent
 * 寫入的完全一樣 —— 不存在第二套「AI 的答案」。
 *
 * 安全邊界：
 *   - 只接受 43 字元 Bearer token（見 agents/request-auth）。
 *   - 一定要有 `design` 的有效授權；沒有就 403，不是 404。
 *   - 寫入上限、區塊代號格式與人那一邊共用同一個 validator。
 *   - 每次寫入都寫 audit（actorType: 'agent'）。
 */

export type BrandGuideAgentDeps = { pool: Pool };

const DESIGN_APP_ID = 'design';

type BlockQuery = { brandId?: string; stage?: string; setId?: string };
type BlockParams = { blockId: string };

function textField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** agent 是否可以寫品牌資料：`design` app 的有效授權，一個就夠。 */
async function canAgentEditBrand(pool: Pool, agentId: string): Promise<boolean> {
  const grants = await activeGrantsForAgent(pool, agentId);
  return grants.some((grant) => grant.app_id === DESIGN_APP_ID);
}

export function registerBrandGuideAgent(app: FastifyInstance, deps: BrandGuideAgentDeps): void {
  type Guarded =
    | { ok: true; brandSetId: string | null }
    | { ok: false; status: number; body: Record<string, unknown> };

  /** 共用前置：agent 有 design 授權、品牌存在、stage 合法。 */
  async function guard(
    request: FastifyRequest,
    reply: FastifyReply,
    brandId: unknown,
    stage: unknown,
    setId: unknown,
  ): Promise<Guarded> {
    const agent = request.currentAgent;

    if (agent === null) {
      // requireAgent 已經回 401；到這裡代表路由漏了 preHandler。
      reply.code(401);
      return { ok: false, status: 401, body: { error: 'agent_not_authenticated' } };
    }

    if (!(await canAgentEditBrand(deps.pool, agent.id))) {
      return { ok: false, status: 403, body: { error: 'agent_not_granted', app: DESIGN_APP_ID } };
    }

    if (typeof brandId !== 'string' || !isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return { ok: false, status: 404, body: { error: 'brand_not_found', brandId } };
    }

    if (typeof stage !== 'string' || !(GUIDE_STAGES as readonly string[]).includes(stage)) {
      return { ok: false, status: 404, body: { error: 'stage_not_found', stage } };
    }

    // 04A–04H 屬於品牌集：agent 要改某一套，就要講清楚是哪一套。
    const scope = await resolveSetScope(deps.pool, brandId, stage, setId);

    if (!scope.ok) {
      return { ok: false, status: scope.status, body: scope.body };
    }

    return { ok: true, brandSetId: scope.brandSetId };
  }

  // 一次讀一個 stage 的全部區塊：agent 先用這個確認自己看的是哪一格。
  app.get('/agent/brand-guide/blocks', { preHandler: app.requireAgent }, async (request, reply) => {
    const query = request.query as BlockQuery;
    const allowed = await guard(request, reply, query.brandId, query.stage, query.setId);

    if (!allowed.ok) {
      return reply.code(allowed.status).send(allowed.body);
    }

    const brandId = query.brandId as string;
    const stage = query.stage as string;

    return { stage, blocks: await listBlocks(deps.pool, brandId, stage, allowed.brandSetId) };
  });

  // 寫回決策。這是「傾好之後，agent 代我存」的那一步。
  app.put(
    '/agent/brand-guide/blocks/:blockId/decision',
    { preHandler: app.requireAgent },
    async (request, reply) => {
      const { blockId } = request.params as BlockParams;
      const body = request.body as Record<string, unknown>;
      const brandId = textField(body.brandId);
      const stage = textField(body.stage);
      const allowed = await guard(request, reply, brandId, stage, body.setId);

      if (!allowed.ok) {
        return reply.code(allowed.status).send(allowed.body);
      }

      const agent = request.currentAgent;

      if (agent === null) {
        return reply.code(401).send({ error: 'agent_not_authenticated' });
      }

      if (!isBlockId(blockId)) {
        return reply.code(400).send({ error: 'invalid_block_id', blockId });
      }

      const decision = textField(body.decision);

      if (decision.length > MAX_DECISION_LENGTH) {
        return reply.code(400).send({ error: 'decision_too_long', max: MAX_DECISION_LENGTH });
      }

      // 編號與名稱沿用紀錄上的：agent 只負責內容，不應該無意間改掉位置標籤。
      const existing = await getBlock(deps.pool, brandId, stage, blockId, allowed.brandSetId);
      const before = existing?.decision ?? '';

      const block = await saveDecision(deps.pool, {
        brandId,
        stage,
        brandSetId: allowed.brandSetId,
        blockId,
        code: existing?.code ?? textField(body.code).trim(),
        title: existing?.title ?? textField(body.title).trim(),
        decision,
        actor: { type: 'agent', agentId: agent.id },
      });

      await writeAudit(deps.pool, {
        actorType: 'agent',
        actorId: agent.id,
        action: 'brand.guide.block.decision.agent',
        target: brandId,
        detail: {
          stage,
          brandSetId: allowed.brandSetId,
          blockId,
          decisionLength: decision.length,
          changed: before !== decision,
          agentName: agent.name,
        },
      });

      // `written: false` ＝內容與現況相同，沒有新版本。agent 要講得出
      // 「其實沒有改到」，不要假裝成功寫了一個新決策。
      return { stage, block, written: before !== decision };
    },
  );
}

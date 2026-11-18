import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { findFile } from '../files/store.js';
import {
  MAX_DECISION_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_PROMPT_LENGTH,
  attachFile,
  isBlockId,
  listBlocks,
  removeFile,
  saveDecision,
  savePrompt,
} from '../brand-guide/blocks.js';
import { buildStageBrief, priorBriefs } from '../brand-guide/brief.js';
import { loadStageSchema } from '../brand-guide/engine/index.js';
import { attachOptionImages, loadOptionImages } from '../brand-guide/option-images.js';
import { isUuid } from '../brand-guide/schema.js';
import { COMPANY_STAGES } from '../brand-guide/set-scope.js';
import { getGuideBrief, getGuideState, saveGuideState } from '../brand-guide/store.js';

/**
 * Boss Portal › Marketing：公司層的 04F 行銷內容。
 *
 * 老闆 2026-11-17 晚定：行銷策略由他自己定、全公司共用，其他同事不應該看到。
 * 所以這一組路由有兩個硬條件，缺一不可：
 *
 *   1. **只有老闆（owner）讀得到、寫得到。** 讀也不行 —— 「看不到」是需求
 *      本身，不是副作用。其他人一律 403 `owner_only`，不回空資料扮成功。
 *   2. **答案不屬於任何品牌**（`brand_id is null`）。全公司共用一份，才不會
 *      出現「Moonic 的行銷策略」與「公司行銷策略」兩份互相矛盾的東西。
 *
 * 路徑刻意跟品牌引導同形（`/company/guide/:stage/...`），前端只需要換一個
 * base，`StageDetail` 那些畫面元件不用分兩份。
 *
 * 權限檢查與 store 的 scope 判斷分開放：路由只講「你是不是老闆」，資料層
 * 只講「這一列屬於誰」。兩件事混在一起，日後加一種角色就會漏。
 */

export type MarketingDeps = { pool: Pool };

type StageParams = { stage: string };
type BlockParams = StageParams & { blockId: string };
type AttachmentParams = BlockParams & { attachmentId: string };

function textField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 位置編號與名稱由前端送來（它才知道 schema 的排序），長度有上限。 */
function identityOf(body: unknown): { code: string; title: string } | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const code = textField(record.code).trim();
  const title = textField(record.title).trim();

  if (code.length > 24 || title.length > 120) {
    return null;
  }

  return { code, title };
}

type Guard =
  | { ok: true; userId: string }
  | { ok: false; status: number; body: Record<string, unknown> };

export function registerMarketing(app: FastifyInstance, deps: MarketingDeps): void {
  /** 每個端點都要過這一關：登入者必須是老闆，stage 必須是公司層的 stage。 */
  function guard(request: { currentUser: { id: string; role: string } | null }, stage: string): Guard {
    const user = request.currentUser;

    if (user === null) {
      return { ok: false, status: 401, body: { error: 'not_signed_in' } };
    }

    if (user.role !== 'owner') {
      return { ok: false, status: 403, body: { error: 'owner_only' } };
    }

    if (!COMPANY_STAGES.includes(stage)) {
      return { ok: false, status: 404, body: { error: 'stage_not_found', stage } };
    }

    return { ok: true, userId: user.id };
  }

  function guardBlock(
    request: { currentUser: { id: string; role: string } | null },
    stage: string,
    blockId: string,
  ): Guard {
    const passed = guard(request, stage);

    if (!passed.ok) {
      return passed;
    }

    if (!isBlockId(blockId)) {
      return { ok: false, status: 400, body: { error: 'invalid_block_id', blockId } };
    }

    return passed;
  }

  // 選項結構。前端 Edit 卡片照著畫，與 DB 遷移不會有偏差。
  app.get('/company/guide/:stage/schema', { preHandler: app.requireUser }, async (request, reply) => {
    const { stage } = request.params as StageParams;
    const passed = guard(request, stage);

    if (!passed.ok) {
      return reply.code(passed.status).send(passed.body);
    }

    // 公司層與品牌層共用同一份選項圖：圖是源碼件，不是品牌資料。
    // 少了這一步，Boss › 行銷的卡全部只有文字，與 Design 品牌的卡不一致。
    const images = await loadOptionImages(stage);
    return { stage, schema: attachOptionImages(loadStageSchema(stage), images) };
  });

  app.get('/company/guide/:stage/state', { preHandler: app.requireUser }, async (request, reply) => {
    const { stage } = request.params as StageParams;
    const passed = guard(request, stage);

    if (!passed.ok) {
      return reply.code(passed.status).send(passed.body);
    }

    return { stage, state: await getGuideState(deps.pool, null, stage) };
  });

  // 寫一份 state（整份覆蓋）。brief 由引擎計好一併存，下游（prompt／檢查）讀它。
  app.put('/company/guide/:stage/state', { preHandler: app.requireUser }, async (request, reply) => {
    const { stage } = request.params as StageParams;
    const passed = guard(request, stage);

    if (!passed.ok) {
      return reply.code(passed.status).send(passed.body);
    }

    const body = request.body as Record<string, unknown>;

    if (typeof body !== 'object' || body === null || typeof body.state !== 'object' || body.state === null) {
      return reply.code(400).send({ error: 'invalid_state', reason: 'state 必須是物件' });
    }

    const state = body.state as Record<string, unknown>;
    const prior = await priorBriefs(deps.pool, null, stage);
    const brief = buildStageBrief(stage, state, prior);

    await saveGuideState(deps.pool, { brandId: null, stage, state, brief });

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: passed.userId,
      action: 'company.guide.state.save',
      detail: { stage },
    });

    return { stage, brief };
  });

  // 未儲存過也要有 brief：用目前 state 即時算一次，但不寫入（GET 不應有副作用）。
  app.get('/company/guide/:stage/brief', { preHandler: app.requireUser }, async (request, reply) => {
    const { stage } = request.params as StageParams;
    const passed = guard(request, stage);

    if (!passed.ok) {
      return reply.code(passed.status).send(passed.body);
    }

    const stored = await getGuideBrief(deps.pool, null, stage);

    if (stored !== null) {
      return { stage, brief: stored };
    }

    const state = await getGuideState(deps.pool, null, stage);
    const prior = await priorBriefs(deps.pool, null, stage);

    return { stage, brief: buildStageBrief(stage, state, prior) };
  });

  app.get('/company/guide/:stage/blocks', { preHandler: app.requireUser }, async (request, reply) => {
    const { stage } = request.params as StageParams;
    const passed = guard(request, stage);

    if (!passed.ok) {
      return reply.code(passed.status).send(passed.body);
    }

    return { stage, blocks: await listBlocks(deps.pool, null, stage) };
  });

  app.put(
    '/company/guide/:stage/blocks/:blockId/decision',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { stage, blockId } = request.params as BlockParams;
      const passed = guardBlock(request, stage, blockId);

      if (!passed.ok) {
        return reply.code(passed.status).send(passed.body);
      }

      const identity = identityOf(request.body);

      if (identity === null) {
        return reply.code(400).send({ error: 'invalid_block_identity' });
      }

      const body = request.body as Record<string, unknown>;
      const decision = textField(body.decision);

      if (decision.length > MAX_DECISION_LENGTH) {
        return reply.code(400).send({ error: 'decision_too_long', max: MAX_DECISION_LENGTH });
      }

      const block = await saveDecision(deps.pool, {
        brandId: null,
        stage,
        blockId,
        code: identity.code,
        title: identity.title,
        decision,
        actor: { type: 'human', userId: passed.userId },
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: passed.userId,
        action: 'company.guide.block.decision.save',
        detail: { stage, blockId, decisionLength: decision.length },
      });

      return { stage, block };
    },
  );

  app.put(
    '/company/guide/:stage/blocks/:blockId/prompt',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { stage, blockId } = request.params as BlockParams;
      const passed = guardBlock(request, stage, blockId);

      if (!passed.ok) {
        return reply.code(passed.status).send(passed.body);
      }

      const identity = identityOf(request.body);

      if (identity === null) {
        return reply.code(400).send({ error: 'invalid_block_identity' });
      }

      const body = request.body as Record<string, unknown>;
      const prompt = textField(body.prompt);

      if (prompt.length > MAX_PROMPT_LENGTH) {
        return reply.code(400).send({ error: 'prompt_too_long', max: MAX_PROMPT_LENGTH });
      }

      const block = await savePrompt(deps.pool, {
        brandId: null,
        stage,
        blockId,
        code: identity.code,
        title: identity.title,
        prompt,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: passed.userId,
        action: 'company.guide.block.prompt.save',
        detail: { stage, blockId, custom: prompt.trim() !== '', promptLength: prompt.length },
      });

      return { stage, block };
    },
  );

  app.post(
    '/company/guide/:stage/blocks/:blockId/files',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { stage, blockId } = request.params as BlockParams;
      const passed = guardBlock(request, stage, blockId);

      if (!passed.ok) {
        return reply.code(passed.status).send(passed.body);
      }

      const identity = identityOf(request.body);

      if (identity === null) {
        return reply.code(400).send({ error: 'invalid_block_identity' });
      }

      const body = request.body as Record<string, unknown>;
      const fileId = textField(body.fileId);
      const label = textField(body.label).trim();

      if (!isUuid(fileId)) {
        return reply.code(400).send({ error: 'invalid_file_id', fileId });
      }

      if (label.length > MAX_LABEL_LENGTH) {
        return reply.code(400).send({ error: 'label_too_long', max: MAX_LABEL_LENGTH });
      }

      const file = await findFile(deps.pool, fileId, { id: passed.userId, role: 'owner' });

      if (file === null) {
        return reply.code(404).send({ error: 'file_not_found', fileId });
      }

      const block = await attachFile(deps.pool, {
        brandId: null,
        stage,
        blockId,
        code: identity.code,
        title: identity.title,
        fileId,
        label,
        actorId: passed.userId,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: passed.userId,
        action: 'company.guide.block.file.attach',
        detail: { stage, blockId, fileId },
      });

      return { stage, block };
    },
  );

  app.delete(
    '/company/guide/:stage/blocks/:blockId/files/:attachmentId',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { stage, blockId, attachmentId } = request.params as AttachmentParams;
      const passed = guardBlock(request, stage, blockId);

      if (!passed.ok) {
        return reply.code(passed.status).send(passed.body);
      }

      if (!isUuid(attachmentId)) {
        return reply.code(404).send({ error: 'attachment_not_found', attachmentId });
      }

      const block = await removeFile(deps.pool, {
        brandId: null,
        stage,
        blockId,
        attachmentId,
        actorId: passed.userId,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: passed.userId,
        action: 'company.guide.block.file.remove',
        detail: { stage, blockId, attachmentId },
      });

      return { stage, block };
    },
  );
}

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { findFile } from '../files/store.js';
import { brandExists, canEditBrand } from './auth.js';
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
  saveRationale,
  type GuideBlock,
} from './blocks.js';
import { GUIDE_STAGES, isUuid } from './schema.js';
import { resolveSetScope } from './set-scope.js';

/**
 * 品牌引導「填寫區塊」的路由：決策、歷史、附件。
 *
 * 為什麼要獨立一條路，而不是塞進 stage state：state 是「最終揀了甚麼」，
 * 這裡是「為甚麼這樣揀、睇過咩、幾時改」。前者一次寫整份，後者是逐格追加
 * 的紀錄 —— 兩種寫入節奏不同，混在一起會令每次改一個選項都覆蓋整份歷史。
 *
 * 權限與其他 brand-guide 寫入一致：讀要登入，寫要品牌編輯權。
 */

export type BrandGuideBlockDeps = { pool: Pool };

type BlockParams = { brandId: string; stage: string; blockId: string };
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

/** `?setId=` 是品牌集的 scope；沒有就是品牌層（01–03 與舊的 04 資料）。 */
function setIdOf(query: unknown): unknown {
  return typeof query === 'object' && query !== null ? (query as Record<string, unknown>).setId : undefined;
}

export function registerBrandGuideBlocks(app: FastifyInstance, deps: BrandGuideBlockDeps): void {
  type Resolved = { ok: true; brandSetId: string | null } | { ok: false; status: number; body: Record<string, unknown> };

  /**
   * 共用前置檢查：品牌存在、stage 合法、品牌集（如果有）屬於這個品牌。
   *
   * 04A–04H 的答案住在品牌集，所以每一個讀寫都要帶同一個 set scope；
   * 少了它，兩個品牌集就會互相覆蓋同一格。
   */
  async function resolveStage(brandId: string, stage: string, setId: unknown): Promise<Resolved> {
    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return { ok: false, status: 404, body: { error: 'brand_not_found', brandId } };
    }

    if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
      return { ok: false, status: 404, body: { error: 'stage_not_found', stage } };
    }

    const scope = await resolveSetScope(deps.pool, brandId, stage, setId);

    if (!scope.ok) {
      return scope;
    }

    return { ok: true, brandSetId: scope.brandSetId };
  }

  /** 再檢查區塊代號：它會被寫入紀錄，不接受任意字串。 */
  async function resolveTarget(
    brandId: string,
    stage: string,
    blockId: string,
    setId: unknown,
  ): Promise<Resolved> {
    const staged = await resolveStage(brandId, stage, setId);

    if (!staged.ok) {
      return staged;
    }

    if (!isBlockId(blockId)) {
      return { ok: false, status: 400, body: { error: 'invalid_block_id', blockId } };
    }

    return staged;
  }

  app.get(
    '/brands/:brandId/guide/:stage/blocks',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as BlockParams;
      const target = await resolveStage(brandId, stage, setIdOf(request.query));

      if (!target.ok) {
        return reply.code(target.status).send(target.body);
      }

      return { stage, blocks: await listBlocks(deps.pool, brandId, stage, target.brandSetId) };
    },
  );

  // 儲存決策：內容有變才留一版歷史（見 blocks.saveDecision）。
  app.put(
    '/brands/:brandId/guide/:stage/blocks/:blockId/decision',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage, blockId } = request.params as BlockParams;
      const target = await resolveTarget(brandId, stage, blockId, setIdOf(request.query));

      if (!target.ok) {
        return reply.code(target.status).send(target.body);
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-guide block 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
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
        brandId,
        stage,
        brandSetId: target.brandSetId,
        blockId,
        code: identity.code,
        title: identity.title,
        decision,
        actor: { type: 'human', userId: user.id },
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.guide.block.decision.save',
        target: brandId,
        detail: { stage, blockId, decisionLength: decision.length },
      });

      return { stage, block };
    },
  );

  // 老闆自己改 prompt。傳空字串＝還原自動版本（自動版本跟住選項更新）。
  app.put(
    '/brands/:brandId/guide/:stage/blocks/:blockId/prompt',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage, blockId } = request.params as BlockParams;
      const target = await resolveTarget(brandId, stage, blockId, setIdOf(request.query));

      if (!target.ok) {
        return reply.code(target.status).send(target.body);
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-guide block 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
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
        brandId,
        stage,
        brandSetId: target.brandSetId,
        blockId,
        code: identity.code,
        title: identity.title,
        prompt,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.guide.block.prompt.save',
        target: brandId,
        detail: { stage, blockId, custom: prompt.trim() !== '', promptLength: prompt.length },
      });

      return { stage, block };
    },
  );

  // 儲存區塊的 rationale（為甚麼這樣揀）。與 decision（結論）分開。
  app.put(
    '/brands/:brandId/guide/:stage/blocks/:blockId/rationale',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage, blockId } = request.params as BlockParams;
      const target = await resolveTarget(brandId, stage, blockId, setIdOf(request.query));

      if (!target.ok) {
        return reply.code(target.status).send(target.body);
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-guide block 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
      }

      const identity = identityOf(request.body);

      if (identity === null) {
        return reply.code(400).send({ error: 'invalid_block_identity' });
      }

      const body = request.body as Record<string, unknown>;
      const rationale = textField(body.rationale);

      if (rationale.length > MAX_DECISION_LENGTH) {
        return reply.code(400).send({ error: 'rationale_too_long', max: MAX_DECISION_LENGTH });
      }

      const block = await saveRationale(deps.pool, {
        brandId,
        stage,
        brandSetId: target.brandSetId,
        blockId,
        code: identity.code,
        title: identity.title,
        rationale,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.guide.block.rationale.save',
        target: brandId,
        detail: { stage, blockId, rationaleLength: rationale.length },
      });

      return { stage, block };
    },
  );

  // 掛一份已上傳的檔案。上傳本身走 /files（大小上限、sha256、審計都在那邊）。
  app.post(
    '/brands/:brandId/guide/:stage/blocks/:blockId/files',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage, blockId } = request.params as BlockParams;
      const target = await resolveTarget(brandId, stage, blockId, setIdOf(request.query));

      if (!target.ok) {
        return reply.code(target.status).send(target.body);
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-guide block 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
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

      // 檔案要真的存在而且這位使用者看得到：看不到就是不存在的檔案，
      // 不讓「知道 uuid 就掛得上」變成繞過檔案權限的門。
      const file = await findFile(deps.pool, fileId, { id: user.id, role: user.role });

      if (file === null) {
        return reply.code(404).send({ error: 'file_not_found', fileId });
      }

      const block: GuideBlock = await attachFile(deps.pool, {
        brandId,
        stage,
        brandSetId: target.brandSetId,
        blockId,
        code: identity.code,
        title: identity.title,
        fileId,
        label,
        actorId: user.id,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.guide.block.file.attach',
        target: brandId,
        detail: { stage, blockId, fileId },
      });

      return { stage, block };
    },
  );

  // 移除：標記 removed_at，歷史仍然看得到。
  app.delete(
    '/brands/:brandId/guide/:stage/blocks/:blockId/files/:attachmentId',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage, blockId, attachmentId } = request.params as AttachmentParams;
      const target = await resolveTarget(brandId, stage, blockId, setIdOf(request.query));

      if (!target.ok) {
        return reply.code(target.status).send(target.body);
      }

      if (!isUuid(attachmentId)) {
        return reply.code(404).send({ error: 'attachment_not_found', attachmentId });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-guide block 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
      }

      const block = await removeFile(deps.pool, {
        brandId,
        stage,
        brandSetId: target.brandSetId,
        blockId,
        attachmentId,
        actorId: user.id,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.guide.block.file.remove',
        target: brandId,
        detail: { stage, blockId, attachmentId },
      });

      return { stage, block };
    },
  );
}

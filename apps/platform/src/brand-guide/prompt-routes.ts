import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { brandExists, canEditBrand } from './auth.js';
import { MAX_SCOPE_PROMPT_LENGTH, getScopePrompt, saveScopePrompt } from './prompts.js';
import { GUIDE_STAGES, isUuid } from './schema.js';
import { resolveSetRef, SET_STAGES } from './set-scope.js';

/**
 * 範圍層 Prompt 的自訂版本：品牌總覽（`brand`）、一套品牌集（`set`）、
 * 或者單一階段（`stage4a`／`stage4g` 這一類）。
 *
 * 為什麼不是 `/guide/:stage/prompt`：品牌總覽不是一個 stage（它是 01–03
 * 三站合計），用 stage 做路徑就要為它虛構一個 stage id。所以路徑第二段是
 * 「範圍代號」，與 stage 刻意分開 —— 一個 stage 仍然可以是範圍（單頁那一種）。
 *
 * 權限跟其他 brand-guide 寫入一致：讀要登入，寫要品牌編輯權。
 */

export type BrandGuidePromptDeps = { pool: Pool };

type PromptParams = { brandId: string; scope: string };

function querySetId(query: unknown): unknown {
  return typeof query === 'object' && query !== null ? (query as Record<string, unknown>).setId : undefined;
}

/**
 * 範圍代號是否合法。
 *
 * 品牌層：`brand` 或任何一個 stage（04A／04G 就是「這一頁」）。
 * 品牌集：`set`（整套）或品牌集容許的那幾個 stage。
 *
 * 反過來（品牌層用 `set`、品牌集用 `brand`）一律 400：靜靜接受就會寫入
 * 一個沒有人讀到的位置，等於改了但畫面不變。
 */
function isKnownScope(scope: string, brandSetId: string | null): boolean {
  const stages = GUIDE_STAGES as readonly string[];

  if (brandSetId === null) {
    return scope === 'brand' || stages.includes(scope);
  }

  return scope === 'set' || SET_STAGES.includes(scope);
}

export function registerBrandGuidePrompts(app: FastifyInstance, deps: BrandGuidePromptDeps): void {
  app.get(
    '/brands/:brandId/scope-prompt/:scope',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, scope } = request.params as PromptParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      const set = await resolveSetRef(deps.pool, brandId, querySetId(request.query));

      if (!set.ok) {
        return reply.code(set.status).send(set.body);
      }

      if (!isKnownScope(scope, set.brandSetId)) {
        return reply.code(400).send({ error: 'invalid_scope', scope, setId: set.brandSetId });
      }

      return getScopePrompt(deps.pool, { brandId, brandSetId: set.brandSetId, scope });
    },
  );

  app.put(
    '/brands/:brandId/scope-prompt/:scope',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, scope } = request.params as PromptParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      const set = await resolveSetRef(deps.pool, brandId, querySetId(request.query));

      if (!set.ok) {
        return reply.code(set.status).send(set.body);
      }

      if (!isKnownScope(scope, set.brandSetId)) {
        return reply.code(400).send({ error: 'invalid_scope', scope, setId: set.brandSetId });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-guide prompt 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
      }

      const body = request.body as Record<string, unknown> | null;
      const prompt = typeof body?.prompt === 'string' ? body.prompt : null;

      if (prompt === null) {
        return reply.code(400).send({ error: 'invalid_prompt' });
      }

      if (prompt.length > MAX_SCOPE_PROMPT_LENGTH) {
        return reply.code(400).send({ error: 'prompt_too_long', max: MAX_SCOPE_PROMPT_LENGTH });
      }

      const record = await saveScopePrompt(deps.pool, {
        brandId,
        brandSetId: set.brandSetId,
        scope,
        prompt,
        userId: user.id,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.guide.scope-prompt.save',
        target: brandId,
        detail: {
          scope,
          setId: set.brandSetId,
          custom: prompt.trim() !== '',
          promptLength: prompt.length,
        },
      });

      return record;
    },
  );
}

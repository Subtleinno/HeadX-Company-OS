import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { canEditBrand } from '../brand-pages/permissions.js';
import { isUuid } from '../brand-pages/schema.js';
import { brandExists } from '../brand-pages/store.js';
import { acceptSuggestion, dismissSuggestion, listSuggestions, recordSuggestion } from './store.js';

/**
 * 品牌專屬系統建議（issue #60）。
 *
 *   GET  /brands/:brandId/suggestions                     等決定的建議
 *   POST /brands/:brandId/suggestions                     記一個建議（agent 提出）
 *   POST /brands/:brandId/suggestions/:id/accept          接受：建立自定義頁
 *   POST /brands/:brandId/suggestions/:id/dismiss         略過：留簽名，不再提
 *
 * **三項判斷缺一項就回 422，不是靜靜過濾。** 一個存得入而永遠不顯示的建議，
 * 等於後端答應了一件事而前端不做 —— 兩邊各講一個版本，日後查不出是誰錯。
 *
 * 建議由 agent 提出（`POST` 的 actor 是 agent 或品牌編輯者）：判斷「這是一個
 * 系統」需要讀懂內容，不是數欄位。這一支只負責收下理由與決定。
 */

export type BrandSuggestionsDeps = { pool: Pool };

type Params = { brandId: string };
type IdParams = { brandId: string; suggestionId: string };

function readCheck(value: unknown): { ok: boolean; reason: string } {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  return {
    ok: record.ok === true,
    reason: typeof record.reason === 'string' ? record.reason.trim() : '',
  };
}

export function registerBrandSuggestions(app: FastifyInstance, deps: BrandSuggestionsDeps): void {
  app.get('/brands/:brandId/suggestions', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as Params;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    return { items: await listSuggestions(deps.pool, brandId) };
  });

  app.post('/brands/:brandId/suggestions', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as Params;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const user = request.currentUser;

    if (user === null) {
      throw new Error('brand-suggestions 路由缺少 requireUser：request.currentUser 是空的');
    }

    // 提出建議的可以是 agent，但一定是「有權改這個品牌的人叫它做的」。
    if (!(await canEditBrand(deps.pool, brandId, user))) {
      return reply.code(403).send({ error: 'not_brand_editor' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const text = (key: string): string => (typeof body[key] === 'string' ? (body[key] as string).trim() : '');

    const signature = text('signature');
    const name = text('name');
    const slug = text('slug');
    const brief = text('brief');

    if (signature === '' || name === '' || slug === '' || brief === '') {
      return reply.code(400).send({
        error: 'invalid_suggestion',
        reason: 'signature、name、slug、brief 四樣都要有',
      });
    }

    const refs = Array.isArray(body.refs) ? body.refs.filter((item): item is string => typeof item === 'string') : [];
    const belongsTo = text('belongsTo');

    const outcome = await recordSuggestion(deps.pool, {
      brandId,
      signature,
      name,
      slug,
      brief,
      unique: readCheck(body.unique),
      repeated: readCheck(body.repeated),
      noRoom: readCheck(body.noRoom),
      refs,
      belongsTo: belongsTo === '' ? null : belongsTo,
      createdBy: user.id,
    });

    if (outcome.status === 'not_eligible') {
      return reply.code(422).send({
        error: 'not_eligible',
        missing: outcome.missing,
        message: '獨有、重複使用、其他頁放不下：三項皆是才是一個系統，缺一項就不是一頁。',
      });
    }

    if (outcome.status === 'duplicate_signature') {
      // 同一個簽名已經略過或者正在等決定：不再提。200 而不是 409，因為對
      // 呼叫它的 agent 來說「這件事已經講過了」不是錯誤。
      return reply.code(200).send({ suggestion: null, created: false });
    }

    await writeAudit(deps.pool, {
      actorType: user.role === 'owner' || user.role === 'staff' ? 'human' : 'agent',
      actorId: user.id,
      action: 'brand.suggestion.record',
      target: outcome.suggestion.id,
      detail: { brandId, slug, name, belongsTo: belongsTo === '' ? null : belongsTo },
    });

    return reply.code(201).send({ suggestion: outcome.suggestion, created: true });
  });

  app.post(
    '/brands/:brandId/suggestions/:suggestionId/accept',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, suggestionId } = request.params as IdParams;

      if (!isUuid(brandId) || !isUuid(suggestionId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'suggestion_not_found', suggestionId });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-suggestions 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
      }

      const body = (request.body ?? {}) as { brief?: unknown };
      const brief = typeof body.brief === 'string' ? body.brief : undefined;

      const outcome = await acceptSuggestion(deps.pool, {
        brandId,
        suggestionId,
        ...(brief === undefined ? {} : { brief }),
        decidedBy: user.id,
      });

      if (outcome.status === 'not_found') {
        return reply.code(404).send({ error: 'suggestion_not_found', suggestionId });
      }

      if (outcome.status === 'already_decided') {
        return reply.code(409).send({ error: 'already_decided', state: outcome.state });
      }

      if (outcome.status === 'slug_taken') {
        return reply.code(409).send({
          error: 'page_key_taken',
          slug: outcome.slug,
          name: outcome.pageName,
          message: `已經有一張頁用 ${outcome.slug}：${outcome.pageName}。建議留在這裡，改一個名再試。`,
        });
      }

      await writeAudit(deps.pool, {
        actorType: user.role === 'owner' || user.role === 'staff' ? 'human' : 'agent',
        actorId: user.id,
        action: 'brand.suggestion.accept',
        target: outcome.suggestion.id,
        detail: { brandId, pageKey: outcome.page?.key ?? null },
      });

      return reply.code(201).send({ suggestion: outcome.suggestion, page: outcome.page });
    },
  );

  app.post(
    '/brands/:brandId/suggestions/:suggestionId/dismiss',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, suggestionId } = request.params as IdParams;

      if (!isUuid(brandId) || !isUuid(suggestionId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'suggestion_not_found', suggestionId });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-suggestions 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
      }

      const outcome = await dismissSuggestion(deps.pool, { brandId, suggestionId, decidedBy: user.id });

      if (outcome.status === 'not_found') {
        return reply.code(404).send({ error: 'suggestion_not_found', suggestionId });
      }

      if (outcome.status === 'already_decided') {
        return reply.code(409).send({ error: 'already_decided', state: outcome.state });
      }

      await writeAudit(deps.pool, {
        actorType: user.role === 'owner' || user.role === 'staff' ? 'human' : 'agent',
        actorId: user.id,
        action: 'brand.suggestion.dismiss',
        target: outcome.suggestion.id,
        detail: { brandId },
      });

      return { suggestion: outcome.suggestion };
    },
  );
}

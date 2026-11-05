import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { findUnit } from '../org/store.js';
import { parseRuleInput, type RuleInput } from './policy.js';
import {
  SETTING_DESCRIPTIONS,
  isImmutableSetting,
  isSettingKey,
  validateSettingValue,
} from './schema.js';
import {
  findPolicyRule,
  insertPolicyRule,
  listPolicyRules,
  listSettings,
  readEdition,
  softDeletePolicyRule,
  toRuleView,
  toSettingView,
  updatePolicyRule,
  upsertSetting,
} from './store.js';

/**
 * 公司設定與政策規則的 API（issue #80）。
 *
 * 全部要老闆：未登入 401、員工 403（用 auth 的 requireOwner）。
 * 設定與政策決定整間公司怎樣運作，寫入一律留審計（不變量 13）。
 *
 * 回應與審計都不含機密：company_setting 由設計就不可以存密碼、金鑰或 token
 * （渠道憑證是之後 notification_channel 表的事），所以 detail 可以完整寫出舊值與新值。
 */

export type SettingsDeps = {
  pool: Pool;
};

/** UUID 的形狀；不是的話一定不存在，直接 404，不要丟給 Postgres 換一個 500。 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** requireOwner 一定會先跑；沒有 currentUser 就是路由設定的程式錯誤。 */
function actorIdOf(request: FastifyRequest): string {
  const user = request.currentUser;

  if (user === null) {
    throw new Error('設定路由缺少 requireOwner：request.currentUser 是空的');
  }

  return user.id;
}

function invalid(reply: FastifyReply, error: string, reasons: string[]): FastifyReply {
  return reply.code(422).send({ error, reasons });
}

/**
 * 規則指向的單位存在嗎？回傳一句錯誤訊息，或者 null 代表沒問題。
 * 未給（undefined）與 null 都代表整間公司，不需要查。
 */
async function missingUnit(pool: Pool, orgUnitId: string | null | undefined): Promise<string | null> {
  if (orgUnitId === undefined || orgUnitId === null) {
    return null;
  }

  const unit = await findUnit(pool, orgUnitId);

  return unit === null ? `orgUnitId 指向的單位不存在或已刪除：${orgUnitId}` : null;
}

export function registerSettings(app: FastifyInstance, deps: SettingsDeps): void {
  app.get('/settings', { preHandler: app.requireOwner }, async () => {
    const rows = await listSettings(deps.pool);

    return { settings: rows.map(toSettingView) };
  });

  app.put('/settings/:key', { preHandler: app.requireOwner }, async (request, reply) => {
    const key = (request.params as { key: string }).key;

    // 未知 key：404。寫進一個沒有人讀的 key 等於對老闆講錯話（「我設好了」）。
    if (!isSettingKey(key)) {
      return reply.code(404).send({ error: 'unknown_setting', key });
    }

    // 安裝時決定的 key：409。不是「值不合法」，是「這個東西不可以改」。
    if (isImmutableSetting(key)) {
      return reply.code(409).send({
        error: 'immutable_setting',
        key,
        reason: `${key} 在安裝時決定，不可經 API 修改（${SETTING_DESCRIPTIONS[key]}）`,
      });
    }

    const body = request.body;

    if (!isRecord(body) || !('value' in body)) {
      return invalid(reply, 'invalid_setting', ['body 必須是 { "value": … }']);
    }

    // 驗證要用「這個安裝實際的版本」，不是寫死的預設版本。
    const edition = await readEdition(deps.pool);
    const result = validateSettingValue(key, body.value, { edition });

    if (!result.ok) {
      return invalid(reply, 'invalid_setting', [result.reason]);
    }

    const before = await deps.pool.query<{ value: unknown }>(
      'select value from company_setting where key = $1',
      [key],
    );

    const row = await upsertSetting(deps.pool, {
      key,
      value: result.value,
      updatedBy: actorIdOf(request),
    });

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: actorIdOf(request),
      action: 'setting.update',
      target: key,
      detail: { key, oldValue: before.rows[0]?.value ?? null, newValue: result.value },
    });

    return { setting: toSettingView(row) };
  });

  app.get('/policy-rules', { preHandler: app.requireOwner }, async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const domain = query.domain;

    if (domain !== undefined && (typeof domain !== 'string' || domain === '')) {
      return invalid(reply, 'invalid_query', ['domain 必須是非空字串']);
    }

    const rows = await listPolicyRules(
      deps.pool,
      domain === undefined ? {} : { domain: domain as string },
    );

    return { rules: rows.map(toRuleView) };
  });

  app.post('/policy-rules', { preHandler: app.requireOwner }, async (request, reply) => {
    const parsed = parseRuleInput(request.body);

    if (parsed.errors.length > 0) {
      return invalid(reply, 'invalid_policy_rule', parsed.errors);
    }

    const input = parsed.value as RuleInput;

    // 規則可以只對某個單位生效（issue #81）；那個單位一定要存在而且未刪除。
    const missing = await missingUnit(deps.pool, input.orgUnitId);

    if (missing !== null) {
      return invalid(reply, 'invalid_policy_rule', [missing]);
    }

    const row = await insertPolicyRule(deps.pool, {
      domain: input.domain,
      condition: input.condition,
      action: input.action,
      priority: input.priority,
      enabled: input.enabled,
      note: input.note,
      orgUnitId: input.orgUnitId ?? null,
      createdBy: actorIdOf(request),
    });

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: actorIdOf(request),
      action: 'policy_rule.create',
      target: row.id,
      detail: {
        domain: row.domain,
        condition: row.condition,
        action: row.action,
        priority: row.priority,
        enabled: row.enabled,
        note: row.note,
      },
    });

    return reply.code(201).send({ rule: toRuleView(row) });
  });

  app.patch('/policy-rules/:id', { preHandler: app.requireOwner }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    if (!UUID.test(id)) {
      return reply.code(404).send({ error: 'policy_rule_not_found', id });
    }

    const parsed = parseRuleInput(request.body, { partial: true });

    if (parsed.errors.length > 0) {
      return invalid(reply, 'invalid_policy_rule', parsed.errors);
    }

    if (Object.keys(parsed.value).length === 0) {
      return invalid(reply, 'invalid_policy_rule', ['沒有提供任何可以修改的欄位']);
    }

    const before = await findPolicyRule(deps.pool, id);

    if (before === null) {
      return reply.code(404).send({ error: 'policy_rule_not_found', id });
    }

    const missing = await missingUnit(deps.pool, parsed.value.orgUnitId);

    if (missing !== null) {
      return invalid(reply, 'invalid_policy_rule', [missing]);
    }

    const row = await updatePolicyRule(deps.pool, id, parsed.value);

    if (row === null) {
      // 讀得到但改不到：中間被別人刪掉了。照實回 404，不要回一個看似成功的 200。
      return reply.code(404).send({ error: 'policy_rule_not_found', id });
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: actorIdOf(request),
      action: 'policy_rule.update',
      target: id,
      detail: {
        before: toRuleView(before),
        after: toRuleView(row),
      },
    });

    return { rule: toRuleView(row) };
  });

  app.delete('/policy-rules/:id', { preHandler: app.requireOwner }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    if (!UUID.test(id)) {
      return reply.code(404).send({ error: 'policy_rule_not_found', id });
    }

    const before = await findPolicyRule(deps.pool, id);

    if (before === null) {
      return reply.code(404).send({ error: 'policy_rule_not_found', id });
    }

    const deleted = await softDeletePolicyRule(deps.pool, id);

    if (!deleted) {
      return reply.code(404).send({ error: 'policy_rule_not_found', id });
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: actorIdOf(request),
      action: 'policy_rule.delete',
      target: id,
      detail: { domain: before.domain, action: before.action },
    });

    return reply.code(204).send();
  });
}

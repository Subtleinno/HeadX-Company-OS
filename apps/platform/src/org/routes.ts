import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { readEdition } from '../settings/store.js';
import { OVERRIDABLE_KEYS, isOverridableKey, isSettingKey, validateSettingValue } from '../settings/schema.js';
import { createGraph, createSettingResolver, type UnitEdge } from './graph.js';
import { parseEdgeInput, parseUnitInput, type UnitInput } from './units.js';
import {
  addParent,
  companySettingValues,
  countChildren,
  countParents,
  deleteUnitSetting,
  findUnit,
  insertUnit,
  listEdges,
  listUnitSettings,
  listUnitSettingsFor,
  listUnits,
  removeParent,
  softDeleteUnit,
  toEdgeView,
  toUnitSettingView,
  toUnitView,
  updateUnit,
  upsertUnitSetting,
  type UnitRow,
} from './store.js';

/**
 * 組織單位與單位設定的 API（issue #81）。
 *
 * 全部要老闆：未登入 401、員工 403（auth 的 requireOwner）。
 * 結構與設定決定整間公司怎樣運作，每個寫入都留審計（不變量 13）。
 *
 * 錯誤碼的分工要一致，否則用家只會見到一堆 400：
 *   404 找不到（形狀不對的 uuid 也當找不到，不要丟給 Postgres 換一個 500）
 *   409 資料狀態不允許（成環、重複邊、最後一個上級、有下級、根單位）
 *   422 輸入本身沒有意義（成環以外的格式問題、不可覆寫的 key、值不合法）
 */

export type OrgDeps = {
  pool: Pool;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function actorIdOf(request: FastifyRequest): string {
  const user = request.currentUser;

  if (user === null) {
    throw new Error('組織路由缺少 requireOwner：request.currentUser 是空的');
  }

  return user.id;
}

function invalid(reply: FastifyReply, error: string, reasons: string[]): FastifyReply {
  return reply.code(422).send({ error, reasons });
}

/** 路由用的單位查詢：形狀不對或已刪除都回 null（呼叫者一律回 404）。 */
async function requireUnit(db: Pool, id: string): Promise<UnitRow | null> {
  if (!UUID.test(id)) {
    return null;
  }

  return findUnit(db, id);
}

export function registerOrg(app: FastifyInstance, deps: OrgDeps): void {
  app.get('/org-units', { preHandler: app.requireOwner }, async () => {
    const [units, edges] = await Promise.all([listUnits(deps.pool), listEdges(deps.pool)]);

    return { units: units.map(toUnitView), edges: edges.map(toEdgeView) };
  });

  app.post('/org-units', { preHandler: app.requireOwner }, async (request, reply) => {
    const parsed = parseUnitInput(request.body);

    if (parsed.errors.length > 0) {
      return invalid(reply, 'invalid_org_unit', parsed.errors);
    }

    const input = parsed.value as UnitInput;

    // 上級一定要存在而且未刪除：懸空的單位會安靜地繼承到公司預設值，
    // 看起來像「設定沒生效」，其實是自己不見了。
    const missing: string[] = [];

    for (const parentId of input.parentIds) {
      const parent = await findUnit(deps.pool, parentId);

      if (parent === null) {
        missing.push(parentId);
      }
    }

    if (missing.length > 0) {
      return invalid(reply, 'invalid_org_unit', [
        `上級不存在或已刪除：${missing.join('、')}`,
      ]);
    }

    const { unit, parents } = await insertUnit(deps.pool, {
      name: input.name,
      type: input.type,
      country: input.country,
      currency: input.currency,
      timezone: input.timezone,
      parentIds: input.parentIds,
    });

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: actorIdOf(request),
      action: 'org_unit.create',
      target: unit.id,
      detail: {
        name: unit.name,
        type: unit.type,
        country: unit.country,
        currency: unit.currency,
        timezone: unit.timezone,
        parentIds: parents.map((edge) => edge.parent_id),
      },
    });

    return reply.code(201).send({ unit: toUnitView(unit), parents: parents.map(toEdgeView) });
  });

  app.patch('/org-units/:id', { preHandler: app.requireOwner }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const before = await requireUnit(deps.pool, id);

    if (before === null) {
      return reply.code(404).send({ error: 'org_unit_not_found', id });
    }

    const parsed = parseUnitInput(request.body, { partial: true });

    if (parsed.errors.length > 0) {
      return invalid(reply, 'invalid_org_unit', parsed.errors);
    }

    if (Object.keys(parsed.value).length === 0) {
      return invalid(reply, 'invalid_org_unit', ['沒有提供任何可以修改的欄位']);
    }

    const unit = await updateUnit(deps.pool, id, parsed.value);

    if (unit === null) {
      // 讀得到但改不到：中間被別人刪掉了。照實回 404，不要回一個看似成功的 200。
      return reply.code(404).send({ error: 'org_unit_not_found', id });
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: actorIdOf(request),
      action: 'org_unit.update',
      target: id,
      detail: { before: toUnitView(before), after: toUnitView(unit) },
    });

    return { unit: toUnitView(unit) };
  });

  app.delete('/org-units/:id', { preHandler: app.requireOwner }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const before = await requireUnit(deps.pool, id);

    if (before === null) {
      return reply.code(404).send({ error: 'org_unit_not_found', id });
    }

    if (before.is_root) {
      return reply.code(409).send({
        error: 'root_undeletable',
        reason: '根單位代表整間公司，不可以刪除',
      });
    }

    const children = await countChildren(deps.pool, id);

    if (children > 0) {
      return reply.code(409).send({
        error: 'has_children',
        reason: `還有 ${children} 個未刪除的下級單位，請先處理它們`,
      });
    }

    const deleted = await softDeleteUnit(deps.pool, id);

    if (!deleted) {
      return reply.code(404).send({ error: 'org_unit_not_found', id });
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: actorIdOf(request),
      action: 'org_unit.delete',
      target: id,
      detail: { name: before.name, type: before.type },
    });

    return reply.code(204).send();
  });

  app.post('/org-units/:id/parents', { preHandler: app.requireOwner }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const child = await requireUnit(deps.pool, id);

    if (child === null) {
      return reply.code(404).send({ error: 'org_unit_not_found', id });
    }

    const parsed = parseEdgeInput(request.body);

    if (parsed.errors.length > 0) {
      return invalid(reply, 'invalid_org_edge', parsed.errors);
    }

    const input = parsed.value as { parentId: string; position: number };

    if (child.is_root) {
      return reply.code(409).send({
        error: 'root_has_no_parent',
        reason: '根單位不可以有上級（它是整間公司）',
      });
    }

    const parent = await findUnit(deps.pool, input.parentId);

    if (parent === null) {
      return invalid(reply, 'invalid_org_edge', [`上級不存在或已刪除：${input.parentId}`]);
    }

    const result = await addParent(deps.pool, {
      childId: id,
      parentId: input.parentId,
      position: input.position,
    });

    if (result === 'duplicate_edge') {
      return reply.code(409).send({
        error: 'duplicate_edge',
        reason: '這條上級關係已經存在',
      });
    }

    if (result === 'cycle') {
      return reply.code(409).send({
        error: 'cycle',
        reason: '加這條邊會令組織圖成環：上級不可以是這個單位的下級',
      });
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: actorIdOf(request),
      action: 'org_unit.edge_add',
      target: id,
      detail: { childId: id, parentId: input.parentId, position: input.position },
    });

    return reply.code(201).send({
      edge: { parentId: input.parentId, childId: id, position: input.position },
    });
  });

  app.delete(
    '/org-units/:id/parents/:parentId',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      const params = request.params as { id: string; parentId: string };
      const child = await requireUnit(deps.pool, params.id);

      if (child === null) {
        return reply.code(404).send({ error: 'org_unit_not_found', id: params.id });
      }

      const parents = await countParents(deps.pool, params.id);

      if (parents <= 1) {
        return reply.code(409).send({
          error: 'last_parent',
          reason: '每個單位至少要有一個上級；要移走最後一個上級之前，先接上另一個',
        });
      }

      const removed = await removeParent(deps.pool, params.id, params.parentId);

      if (!removed) {
        return reply.code(404).send({
          error: 'edge_not_found',
          childId: params.id,
          parentId: params.parentId,
        });
      }

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: actorIdOf(request),
        action: 'org_unit.edge_remove',
        target: params.id,
        detail: { childId: params.id, parentId: params.parentId },
      });

      return reply.code(204).send();
    },
  );

  app.get('/org-units/:id/settings', { preHandler: app.requireOwner }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const unit = await requireUnit(deps.pool, id);

    if (unit === null) {
      return reply.code(404).send({ error: 'org_unit_not_found', id });
    }

    const [units, edges, unitSettings, company] = await Promise.all([
      listUnits(deps.pool),
      listEdges(deps.pool),
      listUnitSettings(deps.pool),
      companySettingValues(deps.pool),
    ]);

    const graph = createGraph({
      units: units.map((row) => row.id),
      edges: edges.map(
        (row): UnitEdge => ({
          parentId: row.parent_id,
          childId: row.child_id,
          position: row.position,
        }),
      ),
    });

    const resolve = createSettingResolver({
      graph,
      unitSettings: unitSettings.map((row) => ({
        unitId: row.unit_id,
        key: row.key,
        value: row.value,
      })),
      companySettings: company,
    });

    // 四個可覆寫的 key 全部列出，連「沒有值」都照實講（value: null、source: null）。
    const settings = OVERRIDABLE_KEYS.map((key) => {
      const resolved = resolve(id, key);

      return {
        key,
        value: resolved?.value ?? null,
        source: resolved?.source ?? null,
      };
    });

    // 同時交出這個單位自己的覆寫，方便畫面顯示「這裡改過」。
    const overrides = (await listUnitSettingsFor(deps.pool, id)).map(toUnitSettingView);

    return { unitId: id, settings, overrides };
  });

  app.put(
    '/org-units/:id/settings/:key',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      const params = request.params as { id: string; key: string };
      const unit = await requireUnit(deps.pool, params.id);

      if (unit === null) {
        return reply.code(404).send({ error: 'org_unit_not_found', id: params.id });
      }

      if (!isSettingKey(params.key)) {
        return reply.code(404).send({ error: 'unknown_setting', key: params.key });
      }

      if (!isOverridableKey(params.key)) {
        return reply.code(422).send({
          error: 'not_overridable',
          key: params.key,
          reason: `${params.key} 是整間公司的設定，不可以由單位覆寫（可覆寫：${OVERRIDABLE_KEYS.join('、')}）`,
        });
      }

      const body = request.body;

      if (!isRecord(body) || !('value' in body)) {
        return invalid(reply, 'invalid_setting', ['body 必須是 { "value": … }']);
      }

      const edition = await readEdition(deps.pool);
      const result = validateSettingValue(params.key, body.value, { edition });

      if (!result.ok) {
        return invalid(reply, 'invalid_setting', [result.reason]);
      }

      const before = await deps.pool.query<{ value: unknown }>(
        'select value from org_unit_setting where unit_id = $1 and key = $2',
        [params.id, params.key],
      );

      const row = await upsertUnitSetting(deps.pool, {
        unitId: params.id,
        key: params.key,
        value: result.value,
        updatedBy: actorIdOf(request),
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: actorIdOf(request),
        action: 'org_unit.setting_set',
        target: params.id,
        detail: {
          unitId: params.id,
          key: params.key,
          oldValue: before.rows[0]?.value ?? null,
          newValue: result.value,
        },
      });

      return { setting: toUnitSettingView(row) };
    },
  );

  app.delete(
    '/org-units/:id/settings/:key',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      const params = request.params as { id: string; key: string };
      const unit = await requireUnit(deps.pool, params.id);

      if (unit === null) {
        return reply.code(404).send({ error: 'org_unit_not_found', id: params.id });
      }

      if (!isSettingKey(params.key)) {
        return reply.code(404).send({ error: 'unknown_setting', key: params.key });
      }

      if (!isOverridableKey(params.key)) {
        return reply.code(422).send({
          error: 'not_overridable',
          key: params.key,
          reason: `${params.key} 是整間公司的設定，不可以由單位覆寫（可覆寫：${OVERRIDABLE_KEYS.join('、')}）`,
        });
      }

      const before = await deps.pool.query<{ value: unknown }>(
        'select value from org_unit_setting where unit_id = $1 and key = $2',
        [params.id, params.key],
      );

      const removed = await deleteUnitSetting(deps.pool, params.id, params.key);

      if (!removed) {
        return reply.code(404).send({
          error: 'setting_not_overridden',
          unitId: params.id,
          key: params.key,
        });
      }

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: actorIdOf(request),
        action: 'org_unit.setting_unset',
        target: params.id,
        detail: { unitId: params.id, key: params.key, oldValue: before.rows[0]?.value ?? null },
      });

      return reply.code(204).send();
    },
  );
}

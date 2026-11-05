import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { AppGrant, TrustedEntry, UnitScope } from '@company-os/contracts';
import { canAccessApp } from '@company-os/policy';
import { writeAudit, type AuditEntry } from '../audit.js';
import type { UserRow } from '../auth/store.js';
import type { ModuleManifest, ModuleRegistry } from '../modules/registry/index.js';
import {
  canApprove,
  canModify,
  canReject,
  canRequest,
  canRevoke,
  type Actor,
  type Decision,
  type GrantLike,
} from './permissions.js';
import {
  parseListQuery,
  parseModifyInput,
  parseRejectInput,
  parseRequestInput,
  parseRevokeInput,
  parseTransitionInput,
} from './schema.js';
import { buildScopeGraph, coverScope, isSubsetOf, sameScope, type ScopeGraph } from './scope.js';
import {
  createGrant,
  findActiveWithScope,
  findInflight,
  findGrant,
  inTransaction,
  listActiveAdminGrants,
  listActiveForApp,
  listGrants,
  lockGrant,
  revokeOtherActive,
  subjectIdOf,
  toGrantView,
  toScope,
  transition,
  type GrantRow,
  type Queryable,
} from './store.js';
import type { GrantRole } from './types.js';

/**
 * app 註冊與授權的 API（issue #83）。
 *
 * 三件事在這裡固定下來：
 *   1. app 定義只有一個來源（manifest）。沒有「手動改 app 定義」的 API，
 *      也不因為 manifest 存在就自動開放 —— 註冊不等於啟用。
 *   2. 客戶端永遠不可以提交 state。狀態只可以由這幾條路由按規則推進，
 *      而且每一次推進都與審計同一個交易。
 *   3. 入口由注入的 adapter 決定，不看 HTTP 標頭。真實代理信任與 session.entry
 *      接線是後續 issue，在那之前 adapter 回 null，route 就回 403 entry_untrusted ——
 *      寧可講「不知道」，也不要假設是內網。
 */

export type GrantsDeps = {
  pool: Pool;
  registry: ModuleRegistry;
  /**
   * 這次請求來自哪個可信入口。回傳 null 代表判斷不到 —— 呼叫者應該回 403。
   * **不可以**由 X-Company-OS-Entry 之類的自填標頭決定。
   */
  resolveEntry: (request: FastifyRequest) => TrustedEntry | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** requireUser 一定會先跑；沒有 currentUser 就是路由設定的程式錯誤。 */
function actorOf(request: FastifyRequest): UserRow {
  const user = request.currentUser;

  if (user === null) {
    throw new Error('授權路由缺少 requireUser：request.currentUser 是空的');
  }

  return user;
}

function invalid(reply: FastifyReply, reasons: string[]): FastifyReply {
  return reply.code(422).send({ error: 'invalid_grant', reasons });
}

/**
 * 拒絕的狀態碼由原因代碼決定，不是由呼叫位置決定。
 * 「狀態已經變了」是 409（叫對方重新讀一次），「你不夠權」才是 403。
 */
function denied(reply: FastifyReply, decision: Extract<Decision, { ok: false }>): FastifyReply {
  const status = decision.code === 'invalid_transition' ? 409 : 403;

  return reply.code(status).send({ error: decision.code, message: decision.message });
}

function audit(db: PoolClient, entry: AuditEntry): Promise<void> {
  return writeAudit({ query: (text, values) => db.query(text, values) }, entry);
}

// ---------------------------------------------------------------------------
// 讀組織圖、操作者與 app 定義
// ---------------------------------------------------------------------------

type Org = {
  graph: ScopeGraph;
  /** 全部單位（含已刪除）→ 是否已刪除。用來分辨「不存在」與「已刪除」。 */
  units: Map<string, boolean>;
};

/**
 * 一次讀完組織，之後所有範圍計算都在記憶體做。
 * 公司規模的資料量（幾十個單位）不值得為每個請求寫一段遞歸 SQL。
 */
async function loadOrg(db: Queryable): Promise<Org> {
  const unitRows = await db.query<{ id: string; deleted_at: Date | null }>(
    'select id, deleted_at from org_unit',
  );

  const edgeRows = await db.query<{ parent_id: string; child_id: string }>(
    'select parent_id, child_id from org_unit_edge',
  );

  const units = new Map<string, boolean>();

  for (const row of unitRows.rows) {
    units.set(row.id, row.deleted_at !== null);
  }

  const live = [...units.entries()].filter(([, deleted]) => !deleted).map(([id]) => id);

  const graph = buildScopeGraph({
    units: live,
    edges: edgeRows.rows.map((row) => ({ parentId: row.parent_id, childId: row.child_id })),
  });

  return { graph, units };
}

/** 範圍裡每一個單位都要存在而且未刪除；回傳第一個問題的說明或 null。 */
function unknownUnit(org: Org, scope: UnitScope): string | null {
  if (scope.kind === 'all') {
    return null;
  }

  for (const unitId of scope.unitIds) {
    const deleted = org.units.get(unitId);

    if (deleted === undefined) {
      return `scope.unitIds 指向的單位不存在：${unitId}`;
    }

    if (deleted) {
      return `scope.unitIds 指向的單位已刪除：${unitId}`;
    }
  }

  return null;
}

function coverOf(scope: UnitScope, org: Org): ReadonlySet<string> {
  return coverScope(scope, org.graph);
}

/**
 * 操作者的管理能力：他現在有效的 app_admin 授權，換成「每個 app 可以管到哪些單位」。
 * 同一個 app 有多筆（不同範圍、不同來源）就取聯集。
 */
async function loadActor(db: Queryable, user: UserRow, org: Org): Promise<Actor> {
  if (user.role === 'owner') {
    return { id: user.id, isOwner: true, adminOf: new Map() };
  }

  const rows = await listActiveAdminGrants(db, user.id);
  const adminOf = new Map<string, Set<string>>();

  for (const row of rows) {
    const cover = coverOf(toScope(row), org);
    const existing = adminOf.get(row.app_id) ?? new Set<string>();

    for (const unitId of cover) {
      existing.add(unitId);
    }

    adminOf.set(row.app_id, existing);
  }

  return { id: user.id, isOwner: false, adminOf };
}

function findApp(registry: ModuleRegistry, appId: string): ModuleManifest | null {
  return registry.listModules().find((item) => item.id === appId) ?? null;
}

function toGrantLike(row: GrantRow): GrantLike {
  return {
    userId: subjectIdOf(row),
    appId: row.app_id,
    role: row.role,
    state: row.state,
    scope: toScope(row),
  };
}

/** 這個操作者見不見得到這一列（查詢與單筆讀取共用同一條規則）。 */
function canSee(actor: Actor, org: Org, row: GrantRow): boolean {
  if (actor.isOwner) {
    return true;
  }

  if (subjectIdOf(row) === actor.id) {
    return true;
  }

  const own = actor.adminOf.get(row.app_id);

  if (own === undefined) {
    return false;
  }

  return isSubsetOf(coverOf(toScope(row), org), own);
}

async function findSubject(db: Queryable, userId: string): Promise<UserRow | null> {
  const result = await db.query<UserRow>(
    'select id, email, display_name, role, department, password_hash, disabled_at from app_user where id = $1',
    [userId],
  );

  return result.rows[0] ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
}

type TxResult =
  | { status: 200; body: Record<string, unknown> }
  | { status: 201; body: Record<string, unknown> }
  | { status: 403 | 404 | 409 | 422; body: Record<string, unknown> };

function send(reply: FastifyReply, result: TxResult): FastifyReply {
  return reply.code(result.status).send(result.body);
}

export function registerGrants(app: FastifyInstance, deps: GrantsDeps): void {
  const { pool, registry } = deps;

  app.get('/app-grants', { preHandler: app.requireUser }, async (request, reply) => {
    const parsed = parseListQuery(request.query);

    if (parsed.errors.length > 0 || parsed.value === undefined) {
      return invalid(reply, parsed.errors);
    }

    const query = parsed.value;
    const user = actorOf(request);
    const org = await loadOrg(pool);
    const actor = await loadActor(pool, user, org);

    const filter = {
      ...(query.appId === undefined ? {} : { appId: query.appId }),
      ...(query.state === undefined ? {} : { state: query.state }),
      ...(query.role === undefined ? {} : { role: query.role }),
    };

    if (actor.isOwner) {
      const page = await listGrants(pool, {
        ...filter,
        ...(query.userId === undefined ? {} : { userId: query.userId }),
        limit: query.limit,
        offset: query.offset,
      });

      return {
        grants: page.rows.map(toGrantView),
        page: { limit: query.limit, offset: query.offset, total: page.total },
      };
    }

    // 非老闆：先收窄到「自己的」或「自己管理得到的 app」，逐筆驗範圍，然後才分頁。
    // 為甚麼不用 SQL 分頁：範圍包含關係要組織圖才算得出來，寫成 SQL 會是一大段
    // 遞歸 CTE，而這裡的候選集合本來就有上限（一個人有管理權的 app 只有幾個）。
    const managedApps = [...actor.adminOf.keys()];
    const rows = await listGrants(
      pool,
      managedApps.length === 0
        ? { ...filter, userId: actor.id }
        : { ...filter, appIds: managedApps },
    );

    const visible = rows.rows
      .filter((row) => canSee(actor, org, row))
      .filter((row) => query.userId === undefined || row.user_id === query.userId);

    return {
      grants: visible.slice(query.offset, query.offset + query.limit).map(toGrantView),
      page: { limit: query.limit, offset: query.offset, total: visible.length },
    };
  });

  // 一定要在 /app-grants/:id 之前的概念上分開：路徑多一段，Fastify 的 router
  // 會先匹配靜態段，所以兩者不會互相吃掉。
  app.get('/app-grants/access/:appId', { preHandler: app.requireUser }, async (request, reply) => {
    const appId = (request.params as { appId: string }).appId;
    const manifest = findApp(registry, appId);

    if (manifest === null) {
      return reply.code(404).send({ error: 'unknown_app', appId });
    }

    const entry = deps.resolveEntry(request);

    if (entry === null) {
      return reply.code(403).send({
        error: 'entry_untrusted',
        message: '判斷不到這次請求來自哪個入口（真實代理信任與 session.entry 尚未接線），一律拒絕',
      });
    }

    const user = actorOf(request);
    const rows = await listActiveForApp(pool, { userId: user.id, appId });

    // 只有 active 的授權會出現在這裡 —— 這就是「申請中／已批准未生效不算」的落點。
    const grants: AppGrant[] = rows.map((row) => ({
      appId: row.app_id,
      subjectId: subjectIdOf(row),
      subjectKind: 'human',
      status: 'active',
      unitScope: toScope(row),
    }));

    return canAccessApp({
      identity: {
        kind: 'human',
        id: user.id,
        role: user.role === 'owner' ? 'owner' : 'staff',
        status: user.disabled_at === null ? 'active' : 'disabled',
      },
      app: { id: manifest.id, exposure: manifest.exposure, enabled: manifest.available },
      entry,
      grants,
    });
  });

  app.get('/app-grants/:id', { preHandler: app.requireUser }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    if (!UUID.test(id)) {
      return reply.code(404).send({ error: 'grant_not_found', id });
    }

    const user = actorOf(request);
    const org = await loadOrg(pool);
    const actor = await loadActor(pool, user, org);
    const row = await findGrant(pool, id);

    // 看不到的授權一律當成不存在：回 403 等於告訴對方「這個 id 是真的」。
    if (row === null || !canSee(actor, org, row)) {
      return reply.code(404).send({ error: 'grant_not_found', id });
    }

    return { grant: toGrantView(row) };
  });

  app.post('/app-grants', { preHandler: app.requireUser }, async (request, reply) => {
    const parsed = parseRequestInput(request.body);

    if (parsed.errors.length > 0) {
      return invalid(reply, parsed.errors);
    }

    const input = parsed.value;

    if (input === undefined) {
      return invalid(reply, ['body 格式不對']);
    }

    const manifest = findApp(registry, input.appId);

    if (manifest === null) {
      return reply.code(404).send({ error: 'unknown_app', appId: input.appId });
    }

    const org = await loadOrg(pool);
    const missingUnit = unknownUnit(org, input.scope);

    if (missingUnit !== null) {
      return reply.code(422).send({ error: 'unknown_unit', reasons: [missingUnit] });
    }

    const subject = await findSubject(pool, input.userId);

    if (subject === null) {
      return reply
        .code(422)
        .send({ error: 'unknown_subject', reasons: [`userId 指向的使用者不存在：${input.userId}`] });
    }

    if (subject.disabled_at !== null) {
      return reply.code(409).send({
        error: 'subject_disabled',
        message: '這個帳戶已停用，不可以發授權給他',
      });
    }

    const user = actorOf(request);
    const actor = await loadActor(pool, user, org);

    const decision = canRequest(actor, {
      appId: input.appId,
      subjectId: input.userId,
      role: input.role,
      scope: input.scope,
      scopeCover: coverOf(input.scope, org),
    });

    if (!decision.ok) {
      return denied(reply, decision);
    }

    // 重送：同一個角色與範圍已經存在（未完成或已生效）就回原來那一筆，不再建一列。
    const existing =
      (await findInflight(pool, {
        userId: input.userId,
        appId: input.appId,
        role: input.role,
        scope: input.scope,
      })) ??
      (await findActiveWithScope(pool, {
        userId: input.userId,
        appId: input.appId,
        role: input.role,
        scope: input.scope,
      }));

    if (existing !== null) {
      return reply.code(200).send({ grant: toGrantView(existing), created: false });
    }

    try {
      const row = await inTransaction(pool, async (client) => {
        const created = await createGrant(client, {
          userId: input.userId,
          appId: input.appId,
          role: input.role,
          scope: input.scope,
          state: 'requested',
          requestedBy: user.id,
        });

        await audit(client, {
          actorType: 'human',
          actorId: user.id,
          action: 'app_grant.request',
          target: created.id,
          detail: {
            subjectId: subjectIdOf(created),
            appId: created.app_id,
            role: created.role,
            scope: toScope(created),
            state: created.state,
          },
        });

        return created;
      });

      return reply.code(201).send({ grant: toGrantView(row), created: true });
    } catch (error) {
      // 兩個人同時送同一個申請：唯一索引是最後防線，這裡翻譯成「已經有了」。
      if (isUniqueViolation(error)) {
        const again = await findInflight(pool, {
          userId: input.userId,
          appId: input.appId,
          role: input.role,
          scope: input.scope,
        });

        if (again !== null) {
          return reply.code(200).send({ grant: toGrantView(again), created: false });
        }
      }

      throw error;
    }
  });

  app.post('/app-grants/:id/approve', { preHandler: app.requireUser }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    if (!UUID.test(id)) {
      return reply.code(404).send({ error: 'grant_not_found', id });
    }

    const parsed = parseTransitionInput(request.body);

    if (parsed.errors.length > 0 || parsed.value === undefined) {
      return invalid(reply, parsed.errors);
    }

    const version = parsed.value.version;
    const user = actorOf(request);

    const result = await inTransaction<TxResult>(pool, async (client) => {
      const row = await lockGrant(client, id);

      if (row === null) {
        return { status: 404, body: { error: 'grant_not_found', id } };
      }

      if (row.version !== version) {
        return {
          status: 409,
          body: { error: 'stale_version', message: '版本已經變了，請重新讀取再試', grant: toGrantView(row) },
        };
      }

      const manifest = findApp(registry, row.app_id);

      if (manifest === null) {
        return { status: 404, body: { error: 'unknown_app', appId: row.app_id } };
      }

      const org = await loadOrg(client);
      const actor = await loadActor(client, user, org);

      const decision = canApprove(actor, toGrantLike(row), {
        sensitive: manifest.sensitive,
        scopeCover: coverOf(toScope(row), org),
      });

      if (!decision.ok) {
        return { status: decision.code === 'invalid_transition' ? 409 : 403, body: { error: decision.code, message: decision.message } };
      }

      let current = row;

      if (current.state === 'requested') {
        const approved = await transition(client, id, current.version, {
          fromStates: ['requested'],
          toState: 'approved',
          approvedBy: user.id,
        });

        if (approved === null) {
          return { status: 409, body: { error: 'invalid_transition' } };
        }

        await audit(client, {
          actorType: 'human',
          actorId: user.id,
          action: 'app_grant.approve',
          target: id,
          detail: {
            subjectId: subjectIdOf(approved),
            appId: approved.app_id,
            role: approved.role,
            scope: toScope(approved),
            from: 'requested',
            to: 'approved',
          },
        });

        current = approved;
      }

      // 批准不等於生效：app 未啟用就不可以生效，狀態停在 approved（看得見、講得清）。
      if (!manifest.available) {
        return {
          status: 409,
          body: {
            error: 'app_not_enabled',
            message: `${manifest.id} 現在未啟用，批准了但不可以生效`,
            grant: toGrantView(current),
          },
        };
      }

      const replaced = await revokeOtherActive(client, {
        userId: subjectIdOf(current),
        appId: current.app_id,
        exceptId: current.id,
      });

      for (const old of replaced) {
        await audit(client, {
          actorType: 'human',
          actorId: user.id,
          action: 'app_grant.revoke',
          target: old.id,
          detail: { reason: 'superseded', replacedBy: current.id, appId: old.app_id, subjectId: subjectIdOf(old) },
        });
      }

      const active = await transition(client, id, current.version, {
        fromStates: ['approved'],
        toState: 'active',
        approvedBy: user.id,
      });

      if (active === null) {
        return { status: 409, body: { error: 'invalid_transition' } };
      }

      await audit(client, {
        actorType: 'human',
        actorId: user.id,
        action: 'app_grant.activate',
        target: id,
        detail: {
          subjectId: subjectIdOf(active),
          appId: active.app_id,
          role: active.role,
          scope: toScope(active),
          from: 'approved',
          to: 'active',
        },
      });

      return { status: 200, body: { grant: toGrantView(active), activated: true } };
    });

    return send(reply, result);
  });

  app.post('/app-grants/:id/activate', { preHandler: app.requireUser }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    if (!UUID.test(id)) {
      return reply.code(404).send({ error: 'grant_not_found', id });
    }

    const parsed = parseTransitionInput(request.body);

    if (parsed.errors.length > 0 || parsed.value === undefined) {
      return invalid(reply, parsed.errors);
    }

    const version = parsed.value.version;
    const user = actorOf(request);

    const result = await inTransaction<TxResult>(pool, async (client) => {
      const row = await lockGrant(client, id);

      if (row === null) {
        return { status: 404, body: { error: 'grant_not_found', id } };
      }

      if (row.version !== version) {
        return {
          status: 409,
          body: { error: 'stale_version', message: '版本已經變了，請重新讀取再試', grant: toGrantView(row) },
        };
      }

      const manifest = findApp(registry, row.app_id);

      if (manifest === null) {
        return { status: 404, body: { error: 'unknown_app', appId: row.app_id } };
      }

      const org = await loadOrg(client);
      const actor = await loadActor(client, user, org);

      const decision = canApprove(actor, toGrantLike(row), {
        sensitive: manifest.sensitive,
        scopeCover: coverOf(toScope(row), org),
      });

      if (!decision.ok) {
        return { status: decision.code === 'invalid_transition' ? 409 : 403, body: { error: decision.code, message: decision.message } };
      }

      if (row.state !== 'approved') {
        return {
          status: 409,
          body: { error: 'invalid_transition', message: `只有已批准的授權可以生效（現在是 ${row.state}）` },
        };
      }

      if (!manifest.available) {
        return {
          status: 409,
          body: { error: 'app_not_enabled', message: `${manifest.id} 現在未啟用，不可以生效` },
        };
      }

      const replaced = await revokeOtherActive(client, {
        userId: subjectIdOf(row),
        appId: row.app_id,
        exceptId: row.id,
      });

      for (const old of replaced) {
        await audit(client, {
          actorType: 'human',
          actorId: user.id,
          action: 'app_grant.revoke',
          target: old.id,
          detail: { reason: 'superseded', replacedBy: row.id, appId: old.app_id, subjectId: subjectIdOf(old) },
        });
      }

      const active = await transition(client, id, row.version, {
        fromStates: ['approved'],
        toState: 'active',
        approvedBy: user.id,
      });

      if (active === null) {
        return { status: 409, body: { error: 'invalid_transition' } };
      }

      await audit(client, {
        actorType: 'human',
        actorId: user.id,
        action: 'app_grant.activate',
        target: id,
        detail: {
          subjectId: subjectIdOf(active),
          appId: active.app_id,
          role: active.role,
          scope: toScope(active),
          from: 'approved',
          to: 'active',
        },
      });

      return { status: 200, body: { grant: toGrantView(active) } };
    });

    return send(reply, result);
  });

  app.post('/app-grants/:id/reject', { preHandler: app.requireUser }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    if (!UUID.test(id)) {
      return reply.code(404).send({ error: 'grant_not_found', id });
    }

    const parsed = parseRejectInput(request.body);

    if (parsed.errors.length > 0 || parsed.value === undefined) {
      return invalid(reply, parsed.errors);
    }

    const { version, reason } = parsed.value;
    const user = actorOf(request);

    const result = await inTransaction<TxResult>(pool, async (client) => {
      const row = await lockGrant(client, id);

      if (row === null) {
        return { status: 404, body: { error: 'grant_not_found', id } };
      }

      if (row.version !== version) {
        return {
          status: 409,
          body: { error: 'stale_version', message: '版本已經變了，請重新讀取再試', grant: toGrantView(row) },
        };
      }

      const org = await loadOrg(client);
      const actor = await loadActor(client, user, org);
      const decision = canReject(actor, toGrantLike(row));

      if (!decision.ok) {
        return { status: decision.code === 'invalid_transition' ? 409 : 403, body: { error: decision.code, message: decision.message } };
      }

      const rejected = await transition(client, id, row.version, {
        fromStates: ['requested', 'approved'],
        toState: 'rejected',
        rejectionReason: reason,
      });

      if (rejected === null) {
        return { status: 409, body: { error: 'invalid_transition' } };
      }

      await audit(client, {
        actorType: 'human',
        actorId: user.id,
        action: 'app_grant.reject',
        target: id,
        detail: {
          subjectId: subjectIdOf(rejected),
          appId: rejected.app_id,
          role: rejected.role,
          scope: toScope(rejected),
          from: row.state,
          to: 'rejected',
          // 拒絕理由不是秘密，但要留下是誰決定的；這裡不寫原始 request body。
          reason,
        },
      });

      return { status: 200, body: { grant: toGrantView(rejected) } };
    });

    return send(reply, result);
  });

  app.post('/app-grants/:id/revoke', { preHandler: app.requireUser }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    if (!UUID.test(id)) {
      return reply.code(404).send({ error: 'grant_not_found', id });
    }

    const parsed = parseRevokeInput(request.body);

    if (parsed.errors.length > 0 || parsed.value === undefined) {
      return invalid(reply, parsed.errors);
    }

    const { version } = parsed.value;
    const reason = parsed.value.reason ?? 'revoked';
    const user = actorOf(request);

    const result = await inTransaction<TxResult>(pool, async (client) => {
      const row = await lockGrant(client, id);

      if (row === null) {
        return { status: 404, body: { error: 'grant_not_found', id } };
      }

      if (row.version !== version) {
        return {
          status: 409,
          body: { error: 'stale_version', message: '版本已經變了，請重新讀取再試', grant: toGrantView(row) },
        };
      }

      const org = await loadOrg(client);
      const actor = await loadActor(client, user, org);
      const decision = canRevoke(actor, toGrantLike(row));

      if (!decision.ok) {
        return { status: decision.code === 'invalid_transition' ? 409 : 403, body: { error: decision.code, message: decision.message } };
      }

      const revoked = await transition(client, id, row.version, {
        fromStates: ['requested', 'approved', 'active'],
        toState: 'revoked',
      });

      if (revoked === null) {
        return { status: 409, body: { error: 'invalid_transition' } };
      }

      await audit(client, {
        actorType: 'human',
        actorId: user.id,
        action: 'app_grant.revoke',
        target: id,
        detail: {
          subjectId: subjectIdOf(revoked),
          appId: revoked.app_id,
          role: revoked.role,
          scope: toScope(revoked),
          from: row.state,
          to: 'revoked',
          reason,
        },
      });

      return { status: 200, body: { grant: toGrantView(revoked) } };
    });

    return send(reply, result);
  });

  app.patch('/app-grants/:id', { preHandler: app.requireUser }, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    if (!UUID.test(id)) {
      return reply.code(404).send({ error: 'grant_not_found', id });
    }

    const parsed = parseModifyInput(request.body);

    if (parsed.errors.length > 0 || parsed.value === undefined) {
      return invalid(reply, parsed.errors);
    }

    const change = parsed.value;
    const user = actorOf(request);

    const result = await inTransaction<TxResult>(pool, async (client) => {
      const row = await lockGrant(client, id);

      if (row === null) {
        return { status: 404, body: { error: 'grant_not_found', id } };
      }

      if (row.version !== change.version) {
        return {
          status: 409,
          body: { error: 'stale_version', message: '版本已經變了，請重新讀取再試', grant: toGrantView(row) },
        };
      }

      const targetRole: GrantRole = change.role ?? row.role;
      const targetScope = change.scope ?? toScope(row);

      if (targetRole === row.role && sameScope(targetScope, toScope(row))) {
        return {
          status: 422,
          body: { error: 'not_a_change', reasons: ['角色與範圍都沒有改變'] },
        };
      }

      const org = await loadOrg(client);
      const missingUnit = unknownUnit(org, targetScope);

      if (missingUnit !== null) {
        return { status: 422, body: { error: 'unknown_unit', reasons: [missingUnit] } };
      }

      const actor = await loadActor(client, user, org);
      const targetCover = coverOf(targetScope, org);

      const decision = canModify(
        actor,
        { ...toGrantLike(row), role: targetRole, scope: targetScope },
        targetCover,
      );

      if (!decision.ok) {
        return { status: decision.code === 'invalid_transition' ? 409 : 403, body: { error: decision.code, message: decision.message } };
      }

      const currentCover = coverOf(toScope(row), org);

      // 縮範圍而且角色不變、而且現在生效：即刻生效（規則 5）。
      // 做法仍然是開新一列 —— 舊那列的角色與範圍在資料庫層是改不到的。
      const shrinking =
        targetRole === row.role &&
        row.state === 'active' &&
        isSubsetOf(targetCover, currentCover);

      if (shrinking) {
        const revoked = await transition(client, id, row.version, {
          fromStates: ['active'],
          toState: 'revoked',
        });

        if (revoked === null) {
          return { status: 409, body: { error: 'invalid_transition' } };
        }

        const created = await createGrant(client, {
          userId: subjectIdOf(row),
          appId: row.app_id,
          role: targetRole,
          scope: targetScope,
          state: 'active',
          requestedBy: user.id,
          approvedBy: user.id,
          replacesId: id,
        });

        await audit(client, {
          actorType: 'human',
          actorId: user.id,
          action: 'app_grant.revoke',
          target: id,
          detail: { reason: 'superseded', replacedBy: created.id, appId: row.app_id, subjectId: subjectIdOf(row) },
        });

        await audit(client, {
          actorType: 'human',
          actorId: user.id,
          action: 'app_grant.shrink',
          target: created.id,
          detail: {
            subjectId: subjectIdOf(created),
            appId: created.app_id,
            role: created.role,
            scope: toScope(created),
            previousScope: toScope(row),
            replacedId: id,
          },
        });

        return {
          status: 200,
          body: { grant: toGrantView(created), replacedId: id, requiresApproval: false },
        };
      }

      // 擴大範圍或改角色：舊的保持原狀（規則 5：新版本生效前保留原範圍），
      // 新的由 requested 開始，要人批准。
      const created = await createGrant(client, {
        userId: subjectIdOf(row),
        appId: row.app_id,
        role: targetRole,
        scope: targetScope,
        state: 'requested',
        requestedBy: user.id,
        replacesId: id,
      });

      await audit(client, {
        actorType: 'human',
        actorId: user.id,
        action: 'app_grant.request',
        target: created.id,
        detail: {
          subjectId: subjectIdOf(created),
          appId: created.app_id,
          role: created.role,
          scope: toScope(created),
          state: created.state,
          via: 'expand',
          replacedId: id,
        },
      });

      return {
        status: 201,
        body: { grant: toGrantView(created), replacedId: id, requiresApproval: true },
      };
    });

    return send(reply, result);
  });
}

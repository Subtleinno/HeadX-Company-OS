import type { Pool, PoolClient } from 'pg';
import type { UnitScope } from '@company-os/contracts';
import { writeAudit } from '../audit.js';
import {
  createGrant,
  findGrant,
  inTransaction,
  lockGrant,
  toGrantView,
  toScope,
  transition,
  type GrantRow,
  type GrantView,
} from '../grants/store.js';
import type { GrantRole } from '../grants/types.js';

/**
 * agent 身份與 agent 授權的資料庫存取（issue #84）。
 *
 * agent 的授權沿用 #83 的同一張表、同一組狀態、同一套並發保護 ——
 * 分別只在主體是 agent_id，而且角色一定是 member。
 * 建立路徑是「老闆一個人完成 request → approve → activate」，
 * 三個轉換都寫審計，所以歷史上看得出它跳過了誰的批准（就是沒有人）。
 */

export type AgentRow = {
  id: string;
  name: string;
  created_by: string;
  created_at: Date;
  disabled_at: Date | null;
};

export type AgentView = {
  id: string;
  name: string;
  createdAt: string;
  disabledAt: string | null;
};

const AGENT_COLUMNS = 'id, name, created_by, created_at, disabled_at';

export function toAgentView(row: AgentRow): AgentView {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    disabledAt: row.disabled_at?.toISOString() ?? null,
  };
}

function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export type CreateAgentResult =
  | { status: 'created'; agent: AgentView }
  | { status: 'duplicate_name' };

export async function createAgentAccount(
  pool: Pool,
  input: { name: string; actorId: string },
): Promise<CreateAgentResult> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const inserted = await client.query<AgentRow>(
      `insert into agent_identity (name, created_by) values ($1, $2) returning ${AGENT_COLUMNS}`,
      [input.name, input.actorId],
    );

    const row = inserted.rows[0];

    if (row === undefined) {
      throw new Error('建立 agent 之後沒有回傳列');
    }

    await writeAudit(
      { query: (text, values) => client.query(text, values) },
      {
        actorType: 'human',
        actorId: input.actorId,
        action: 'agent.create',
        target: row.id,
        detail: { name: row.name },
      },
    );

    await client.query('commit');

    return { status: 'created', agent: toAgentView(row) };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);

    if (sqlStateOf(error) === '23505') {
      return { status: 'duplicate_name' };
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function listAgents(
  pool: Pool,
  input: { limit: number; offset: number },
): Promise<{ rows: AgentRow[]; total: number }> {
  const rows = await pool.query<AgentRow>(
    `select ${AGENT_COLUMNS} from agent_identity
      order by created_at asc, id asc
      limit $1 offset $2`,
    [input.limit, input.offset],
  );

  const total = await pool.query<{ total: number }>(
    'select count(*)::int as total from agent_identity',
  );

  return { rows: rows.rows, total: total.rows[0]?.total ?? 0 };
}

export async function findAgent(pool: Pool, id: string): Promise<AgentRow | null> {
  const rows = await pool.query<AgentRow>(
    `select ${AGENT_COLUMNS} from agent_identity where id = $1`,
    [id],
  );

  return rows.rows[0] ?? null;
}

export type DisableAgentResult =
  | { status: 'ok'; agent: AgentView }
  | { status: 'not_found' }
  | { status: 'already_disabled' };

/**
 * 停用 agent。
 *
 * 只標記 disabled_at 就夠：agent 沒有 session 可以撤銷（它未有能力登入），
 * 而 #82 的身份快照會見到 disabled 就直接拒絕，所以不需要改動任何授權列。
 * 授權歷史原樣保留 —— 停用不等於「它以前沒有做過那些事」。
 */
export async function disableAgentAccount(
  pool: Pool,
  input: { id: string; actorId: string; now: Date },
): Promise<DisableAgentResult> {
  return inTransaction(pool, async (client) => {
    const locked = await client.query<{ id: string; disabled_at: Date | null }>(
      'select id, disabled_at from agent_identity where id = $1 for update',
      [input.id],
    );

    const found = locked.rows[0];

    if (found === undefined) {
      return { status: 'not_found' as const };
    }

    if (found.disabled_at !== null) {
      return { status: 'already_disabled' as const };
    }

    const updated = await client.query<AgentRow>(
      `update agent_identity set disabled_at = $2 where id = $1 returning ${AGENT_COLUMNS}`,
      [input.id, input.now],
    );

    await writeAudit(
      { query: (text, values) => client.query(text, values) },
      {
        actorType: 'human',
        actorId: input.actorId,
        action: 'agent.disable',
        target: input.id,
        detail: { grantsKept: true },
      },
    );

    const row = updated.rows[0];

    if (row === undefined) {
      throw new Error('停用 agent 之後沒有回傳列');
    }

    return { status: 'ok' as const, agent: toAgentView(row) };
  });
}

export type CreateAgentGrantResult =
  | { status: 'created'; grant: GrantView }
  | { status: 'agent_not_found' }
  | { status: 'agent_disabled' }
  | { status: 'unknown_unit' }
  | { status: 'duplicate' };

/**
 * 老闆直接給 agent 一個生效授權：requested → approved → active，一個交易、三個審計。
 *
 * 為甚麼仍然要走三個狀態而不是直接寫 active：#83 的狀態機是唯一入口，
 * 直接寫 active 等於繞過 `app_grant_guard` 對「active 必須有批准人」的要求，
 * 也就等於審計裡看不出誰批准過。
 */
export async function createActiveAgentGrant(
  pool: Pool,
  input: {
    agentId: string;
    appId: string;
    role: GrantRole;
    scope: UnitScope;
    actorId: string;
  },
): Promise<CreateAgentGrantResult> {
  try {
    return await inTransaction(pool, async (client) => {
      const agent = await client.query<{ id: string; disabled_at: Date | null }>(
        'select id, disabled_at from agent_identity where id = $1 for update',
        [input.agentId],
      );

      const row = agent.rows[0];

      if (row === undefined) {
        return { status: 'agent_not_found' as const };
      }

      if (row.disabled_at !== null) {
        return { status: 'agent_disabled' as const };
      }

      const unitIds = input.scope.kind === 'all' ? [] : [...input.scope.unitIds];

      if (unitIds.length > 0) {
        const known = await client.query<{ count: number }>(
          'select count(*)::int as count from org_unit where id = any($1::uuid[]) and deleted_at is null',
          [unitIds],
        );

        if ((known.rows[0]?.count ?? 0) !== unitIds.length) {
          return { status: 'unknown_unit' as const };
        }
      }

      const requested = await createGrant(client, {
        agentId: input.agentId,
        appId: input.appId,
        role: input.role,
        scope: input.scope,
        state: 'requested',
        requestedBy: input.actorId,
      });

      await audit(client, {
        actorType: 'human',
        actorId: input.actorId,
        action: 'agent.grant.request',
        target: input.agentId,
        detail: { grantId: requested.id, appId: input.appId, role: input.role },
      });

      const approved = await transition(client, requested.id, requested.version, {
        fromStates: ['requested'],
        toState: 'approved',
        approvedBy: input.actorId,
      });

      if (approved === null) {
        throw new Error('批准 agent 授權失敗（版本或狀態不符）');
      }

      await audit(client, {
        actorType: 'human',
        actorId: input.actorId,
        action: 'agent.grant.approve',
        target: input.agentId,
        detail: { grantId: approved.id, appId: input.appId },
      });

      const active = await transition(client, approved.id, approved.version, {
        fromStates: ['approved'],
        toState: 'active',
        approvedBy: input.actorId,
      });

      if (active === null) {
        throw new Error('啟用 agent 授權失敗（版本或狀態不符）');
      }

      await audit(client, {
        actorType: 'human',
        actorId: input.actorId,
        action: 'agent.grant.activate',
        target: input.agentId,
        detail: { grantId: active.id, appId: input.appId, scope: input.scope },
      });

      return { status: 'created' as const, grant: toGrantView(active) };
    });
  } catch (error) {
    // 同一個 agent、同一個 app、同樣角色與範圍的重送：唯一索引會擋。
    if (sqlStateOf(error) === '23505') {
      return { status: 'duplicate' };
    }

    throw error;
  }
}

export async function listAgentGrants(
  pool: Pool,
  input: { agentId: string; limit: number; offset: number },
): Promise<{ rows: GrantRow[]; total: number }> {
  const rows = await pool.query<GrantRow>(
    `select id, user_id, agent_id, app_id, role, scope_kind, scope_unit_ids, state,
            requested_by, approved_by, requested_at, approved_at, activated_at,
            revoked_at, rejection_reason, replaces_id, version, created_at, updated_at
       from app_grant
      where agent_id = $1
      order by requested_at desc, id asc
      limit $2 offset $3`,
    [input.agentId, input.limit, input.offset],
  );

  const total = await pool.query<{ total: number }>(
    'select count(*)::int as total from app_grant where agent_id = $1',
    [input.agentId],
  );

  return { rows: rows.rows, total: total.rows[0]?.total ?? 0 };
}

export type RevokeAgentGrantResult =
  | { status: 'ok'; grant: GrantView }
  | { status: 'not_found' }
  | { status: 'conflict' };

export async function revokeAgentGrant(
  pool: Pool,
  input: { agentId: string; grantId: string; version: number; reason?: string; actorId: string },
): Promise<RevokeAgentGrantResult> {
  return inTransaction(pool, async (client) => {
    const locked = await lockGrant(client, input.grantId);

    if (locked === null || locked.agent_id !== input.agentId) {
      // 別人的授權一律當成不存在：不可以由 id 猜出「有這筆授權」。
      return { status: 'not_found' as const };
    }

    if (locked.state !== 'active') {
      return { status: 'conflict' as const };
    }

    const revoked = await transition(client, input.grantId, input.version, {
      fromStates: ['active'],
      toState: 'revoked',
    });

    if (revoked === null) {
      return { status: 'conflict' as const };
    }

    await audit(client, {
      actorType: 'human',
      actorId: input.actorId,
      action: 'agent.grant.revoke',
      target: input.agentId,
      detail: {
        grantId: revoked.id,
        appId: revoked.app_id,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      },
    });

    return { status: 'ok' as const, grant: toGrantView(revoked) };
  });
}

/** 目前生效的授權列（給 #82 的引擎用）。 */
export async function activeGrantsForAgent(pool: Pool, agentId: string): Promise<GrantRow[]> {
  const rows = await pool.query<GrantRow>(
    `select id, user_id, agent_id, app_id, role, scope_kind, scope_unit_ids, state,
            requested_by, approved_by, requested_at, approved_at, activated_at,
            revoked_at, rejection_reason, replaces_id, version, created_at, updated_at
       from app_grant
      where agent_id = $1 and state = 'active'
      order by requested_at desc, id asc`,
    [agentId],
  );

  return rows.rows;
}

export { findGrant, toScope };

/** writeAudit 只需要 query；這裡明確收窄，避免把整個 PoolClient 介面傳出去。 */
function audit(client: PoolClient, entry: Parameters<typeof writeAudit>[1]): Promise<void> {
  return writeAudit({ query: (text, values) => client.query(text, values) }, entry);
}

import type { Pool, PoolClient } from 'pg';
import type { UnitScope } from '@company-os/contracts';
import type { GrantRole, GrantState } from './types.js';

/**
 * 授權的資料庫存取（issue #83）。
 *
 * SQL 集中在這裡：路由只管 HTTP 形狀與權限，不直接寫 SQL。
 * 沒有任何函式會硬刪一列 —— 拒絕與撤銷都是狀態，歷史要留下來（不變量 7）。
 *
 * 狀態轉換一律用「條件更新 + 版本號」：`update … where id = $1 and version = $2 and state = any(…)`。
 * 兩個人同時按批准，第二個的 rowCount 是 0，路由就會回 409，不會兩個都成功。
 */

export type GrantRow = {
  id: string;
  /** 人類受益人；與 agent_id 二選一（issue #84 的 check 約束）。 */
  user_id: string | null;
  /** agent 受益人；與 user_id 二選一。 */
  agent_id: string | null;
  app_id: string;
  role: GrantRole;
  scope_kind: UnitScope['kind'];
  scope_unit_ids: string[];
  state: GrantState;
  requested_by: string;
  approved_by: string | null;
  requested_at: Date;
  approved_at: Date | null;
  activated_at: Date | null;
  revoked_at: Date | null;
  rejection_reason: string | null;
  replaces_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

export type GrantView = {
  id: string;
  userId: string | null;
  agentId: string | null;
  appId: string;
  role: GrantRole;
  scope: UnitScope;
  state: GrantState;
  version: number;
  requestedBy: string;
  approvedBy: string | null;
  requestedAt: string;
  approvedAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
  rejectionReason: string | null;
  replacesId: string | null;
};

const COLUMNS =
  'id, user_id, agent_id, app_id, role, scope_kind, scope_unit_ids, state, requested_by, approved_by, requested_at, approved_at, activated_at, revoked_at, rejection_reason, replaces_id, version, created_at, updated_at';

/**
 * 受益人 id，不分是人還是 agent。
 *
 * 畫面上、審計裡都只需要「這筆授權係邊個嘅」，而兩欄是互斥的；
 * 與其每個呼叫者自己寫 `user_id ?? agent_id ?? throw`，不如只寫一次。
 * 兩欄同時為 null 在資料庫層寫不進去，所以在這裡拋錯等於「資料庫出了問題」。
 */
export function subjectIdOf(row: Pick<GrantRow, 'user_id' | 'agent_id'>): string {
  const id = row.user_id ?? row.agent_id;

  if (id === null) {
    throw new Error('授權沒有受益人（user_id 與 agent_id 都是 null）');
  }

  return id;
}

export function toScope(row: Pick<GrantRow, 'scope_kind' | 'scope_unit_ids'>): UnitScope {
  if (row.scope_kind === 'all') {
    return { kind: 'all' };
  }

  return { kind: row.scope_kind, unitIds: row.scope_unit_ids };
}

/** 對外回應。逐個欄位抄出來，不是 spread —— spread 會把將來新增的欄位一併帶出去。 */
export function toGrantView(row: GrantRow): GrantView {
  return {
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id,
    appId: row.app_id,
    role: row.role,
    scope: toScope(row),
    state: row.state,
    version: row.version,
    requestedBy: row.requested_by,
    approvedBy: row.approved_by,
    requestedAt: row.requested_at.toISOString(),
    approvedAt: row.approved_at?.toISOString() ?? null,
    activatedAt: row.activated_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    rejectionReason: row.rejection_reason,
    replacesId: row.replaces_id,
  };
}

/** 只需要 query；Pool 或交易中的 PoolClient 都可以（兩者的 query 簽名一樣）。 */
export type Queryable = Pick<Pool, 'query'>;

export type NewGrant = {
  /** 人類受益人；與 agentId 二選一（issue #84 之後兩者互斥）。 */
  userId?: string;
  /** agent 受益人；與 userId 二選一。 */
  agentId?: string;
  appId: string;
  role: GrantRole;
  scope: UnitScope;
  state: 'requested' | 'active';
  requestedBy: string;
  /** state 是 active 時記錄「批准／執行的人」；一般情況下與 requestedBy 不同。 */
  approvedBy?: string;
  replacesId?: string | null;
};

export async function createGrant(db: Queryable, input: NewGrant): Promise<GrantRow> {
  const unitIds = input.scope.kind === 'all' ? [] : [...input.scope.unitIds];

  const result = await db.query<GrantRow>(
    `insert into app_grant (
       user_id, agent_id, app_id, role, scope_kind, scope_unit_ids, state,
       requested_by, approved_by, approved_at, activated_at, replaces_id
     ) values (
       $1, $2, $3, $4, $5, $6::uuid[], $7,
       $8,
       case when $7 = 'active' then $9::uuid else null end,
       case when $7 = 'active' then now() else null end,
       case when $7 = 'active' then now() else null end,
       $10
     )
     returning ${COLUMNS}`,
    [
      input.userId ?? null,
      input.agentId ?? null,
      input.appId,
      input.role,
      input.scope.kind,
      unitIds,
      input.state,
      input.requestedBy,
      input.approvedBy ?? null,
      input.replacesId ?? null,
    ],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error('建立授權之後沒有回傳列');
  }

  return row;
}

export async function findGrant(db: Queryable, id: string): Promise<GrantRow | null> {
  const result = await db.query<GrantRow>(`select ${COLUMNS} from app_grant where id = $1`, [id]);

  return result.rows[0] ?? null;
}

/** 鎖住一列再判斷 —— 併發批准／撤銷要靠這一句排隊。 */
export async function lockGrant(db: Queryable, id: string): Promise<GrantRow | null> {
  const result = await db.query<GrantRow>(
    `select ${COLUMNS} from app_grant where id = $1 for update`,
    [id],
  );

  return result.rows[0] ?? null;
}

export type TransitionPatch = {
  fromStates: readonly GrantState[];
  toState: GrantState;
  approvedBy?: string;
  rejectionReason?: string;
};

/**
 * 條件更新：版本號與來源狀態都要對得上，否則回 null。
 * `revokedReason` 不寫進 rejection_reason（那是拒絕的理由），只寫審計。
 */
export async function transition(
  db: Queryable,
  id: string,
  expectedVersion: number,
  patch: TransitionPatch,
): Promise<GrantRow | null> {
  const result = await db.query<GrantRow>(
    `update app_grant set
       state = $2,
       approved_by = coalesce($3, approved_by),
       approved_at = case when $2 in ('approved', 'active') then coalesce(approved_at, now()) else approved_at end,
       activated_at = case when $2 = 'active' then coalesce(activated_at, now()) else activated_at end,
       revoked_at = case when $2 = 'revoked' then now() else revoked_at end,
       rejection_reason = coalesce($4, rejection_reason),
       version = version + 1,
       updated_at = now()
     where id = $1 and version = $5 and state = any($6::text[])
     returning ${COLUMNS}`,
    [
      id,
      patch.toState,
      patch.approvedBy ?? null,
      patch.rejectionReason ?? null,
      expectedVersion,
      [...patch.fromStates],
    ],
  );

  return result.rows[0] ?? null;
}

/** 同一個人、同一個 app，目前生效的授權（唯一索引保證最多一列）。 */
export async function findActive(
  db: Queryable,
  input: { userId: string; appId: string },
): Promise<GrantRow | null> {
  const result = await db.query<GrantRow>(
    `select ${COLUMNS} from app_grant
      where user_id = $1 and app_id = $2 and state = 'active'
      limit 1`,
    [input.userId, input.appId],
  );

  return result.rows[0] ?? null;
}

/** 某人某個 app 的全部生效授權（存取檢查用）。 */
export async function listActiveForApp(
  db: Queryable,
  input: { userId: string; appId: string },
): Promise<GrantRow[]> {
  const result = await db.query<GrantRow>(
    `select ${COLUMNS} from app_grant
      where user_id = $1 and app_id = $2 and state = 'active'
      order by role asc`,
    [input.userId, input.appId],
  );

  return result.rows;
}

/** 某人所有生效的 app_admin 授權（算「可以管理哪些 app 的哪些單位」用）。 */
export async function listActiveAdminGrants(db: Queryable, userId: string): Promise<GrantRow[]> {
  const result = await db.query<GrantRow>(
    `select ${COLUMNS} from app_grant
      where user_id = $1 and role = 'app_admin' and state = 'active'
      order by app_id asc`,
    [userId],
  );

  return result.rows;
}

/** 同一個角色與範圍是不是已經有一個未完成的版本（重送要回原本那一個）。 */
export async function findInflight(
  db: Queryable,
  input: { userId: string; appId: string; role: GrantRole; scope: UnitScope },
): Promise<GrantRow | null> {
  const unitIds = input.scope.kind === 'all' ? [] : [...input.scope.unitIds];

  const result = await db.query<GrantRow>(
    `select ${COLUMNS} from app_grant
      where user_id = $1 and app_id = $2 and role = $3
        and scope_kind = $4 and scope_unit_ids = $5::uuid[]
        and state in ('requested', 'approved')
      limit 1`,
    [input.userId, input.appId, input.role, input.scope.kind, unitIds],
  );

  return result.rows[0] ?? null;
}

/** 同一個角色與範圍是不是已經生效（重送要回原本那一個）。 */
export async function findActiveWithScope(
  db: Queryable,
  input: { userId: string; appId: string; role: GrantRole; scope: UnitScope },
): Promise<GrantRow | null> {
  const unitIds = input.scope.kind === 'all' ? [] : [...input.scope.unitIds];

  const result = await db.query<GrantRow>(
    `select ${COLUMNS} from app_grant
      where user_id = $1 and app_id = $2 and role = $3
        and scope_kind = $4 and scope_unit_ids = $5::uuid[]
        and state = 'active'
      limit 1`,
    [input.userId, input.appId, input.role, input.scope.kind, unitIds],
  );

  return result.rows[0] ?? null;
}

/**
 * 把同一個人、同一個 app、同一個角色的其他生效授權撤銷（換版本時用）。
 * 先撤銷再讓新版本生效，唯一索引才不會在中間撞到。
 */
export async function revokeOtherActive(
  db: Queryable,
  input: { userId: string; appId: string; exceptId: string },
): Promise<GrantRow[]> {
  const result = await db.query<GrantRow>(
    `update app_grant set
       state = 'revoked',
       revoked_at = now(),
       version = version + 1,
       updated_at = now()
     where user_id = $1 and app_id = $2
       and state = 'active' and id <> $3
     returning ${COLUMNS}`,
    [input.userId, input.appId, input.exceptId],
  );

  return result.rows;
}

export type ListFilter = {
  appId?: string;
  userId?: string;
  state?: GrantState;
  role?: GrantRole;
  /** 只查這些 app（非老闆的路徑用）。 */
  appIds?: readonly string[];
};

function whereOf(filter: ListFilter): { text: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];

  const push = (sql: string, value: unknown): void => {
    values.push(value);
    conditions.push(sql.replace('?', `$${values.length}`));
  };

  if (filter.appId !== undefined) {
    push('app_id = ?', filter.appId);
  }

  if (filter.userId !== undefined) {
    push('user_id = ?', filter.userId);
  }

  if (filter.state !== undefined) {
    push('state = ?', filter.state);
  }

  if (filter.role !== undefined) {
    push('role = ?', filter.role);
  }

  if (filter.appIds !== undefined) {
    push('app_id = any(?::text[])', [...filter.appIds]);
  }

  return {
    text: conditions.length === 0 ? '' : `where ${conditions.join(' and ')}`,
    values,
  };
}

/** 有序的列表：`requested_at desc, id asc` —— 同一個時間點也有穩定次序。 */
export async function listGrants(
  db: Queryable,
  filter: ListFilter & { limit?: number; offset?: number },
): Promise<{ rows: GrantRow[]; total: number }> {
  const where = whereOf(filter);
  const values = [...where.values];

  let pagination = '';

  if (filter.limit !== undefined) {
    values.push(filter.limit, filter.offset ?? 0);
    pagination = ` limit $${values.length - 1} offset $${values.length}`;
  }

  const rows = await db.query<GrantRow>(
    `select ${COLUMNS} from app_grant ${where.text}
      order by requested_at desc, id asc${pagination}`,
    values,
  );

  const count = await db.query<{ total: number }>(
    `select count(*)::int as total from app_grant ${where.text}`,
    where.values,
  );

  return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
}

/** 在交易裡跑一段工作；出錯全部回滾（業務寫入與審計同一個交易）。 */
export async function inTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

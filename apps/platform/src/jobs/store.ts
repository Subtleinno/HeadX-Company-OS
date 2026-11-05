import type { Pool, PoolClient } from 'pg';
import { isUuid, type JobRow, type JobState } from './types.js';

/**
 * 隊列的 SQL（issue #85）。
 *
 * 這一層只做資料庫的事：不驗證輸入、不決定退避、不寫審計。
 * 那些屬於 `queue.ts`。分工的理由是「一個事實一個來源」：
 * 領取互斥寫在這裡（SQL 是唯一做得到 Skip Locked 的地方），
 * 但「幾時重試」寫在 JS（可注入、可測試），兩邊不重複。
 */

/** 只要 query；Pool 與交易中的 PoolClient 都可以。 */
export type Queryable = Pick<Pool, 'query'>;

const COLUMNS =
  'id, type, payload, state, run_at, attempts, max_attempts, lease_token, lease_expires_at, ' +
  'locked_by, last_error_code, last_error_summary, idempotency_key, created_at, updated_at, completed_at';

export type InsertJobInput = {
  type: string;
  payload: Record<string, unknown>;
  maxAttempts: number;
  runAt: Date;
  idempotencyKey: string | null;
};

/**
 * 寫入一筆工作。
 *
 * 有 idempotency_key 時用 `on conflict do nothing`，靠唯一索引而不是「先查再寫」：
 * 先查再寫在兩個並發請求之間一定有一刻兩邊都查不到，於是兩邊都寫。
 * 衝突之後再讀回既有那一筆，呼叫者仍然拿到一個可用的 id。
 */
export async function insertJob(
  db: Queryable,
  input: InsertJobInput,
): Promise<{ row: JobRow; created: boolean }> {
  const payload = JSON.stringify(input.payload);

  const inserted = await db.query<JobRow>(
    `insert into job (type, payload, max_attempts, run_at, idempotency_key)
     values ($1, $2::jsonb, $3, $4, $5)
     ${input.idempotencyKey === null ? '' : 'on conflict (idempotency_key) where idempotency_key is not null do nothing'}
     returning ${COLUMNS}`,
    [input.type, payload, input.maxAttempts, input.runAt, input.idempotencyKey],
  );

  const row = inserted.rows[0];

  if (row !== undefined) {
    return { row, created: true };
  }

  const existing = await db.query<JobRow>(
    `select ${COLUMNS} from job where idempotency_key = $1`,
    [input.idempotencyKey],
  );

  const found = existing.rows[0];

  if (found === undefined) {
    throw new Error('入隊衝突之後找不到既有工作：請重試（這不應該發生，唯一索引與查詢是同一個 key）');
  }

  return { row: found, created: false };
}

export type ClaimJobInput = {
  workerId: string;
  leaseExpiresAt: Date;
  types: readonly string[];
  now: Date;
};

/**
 * 領取一件到期工作。
 *
 * 互斥由 `for update skip locked` 提供：兩個 worker 同時執行這一句，
 * 第二個會跳過被鎖住的列，所以同一件工作不會同時交給兩個人。
 * 次數在這裡加一 —— 領取即計數，崩潰的 worker 一樣會加，逃不過上限。
 *
 * 一句 UPDATE 就是一個隱含交易，所以「短交易」是自動的：
 * 不會有長時間持有鎖的機會。
 *
 * `type = any($4)` 亦令 worker 不會偷走別組程式的工作：未註冊的種類
 * 會留在 pending，出現在 `countPendingByType` 的診斷裡。
 */
export async function claimJob(db: Queryable, input: ClaimJobInput): Promise<JobRow | null> {
  if (input.types.length === 0) {
    return null;
  }

  const result = await db.query<JobRow>(
    `update job
        set state = 'running',
            attempts = attempts + 1,
            lease_token = gen_random_uuid(),
            lease_expires_at = $2,
            locked_by = $1
      where id = (
        select id
          from job
         where state = 'pending'
           and run_at <= $3
           and attempts < max_attempts
           and type = any($4::text[])
         order by run_at, id
         for update skip locked
         limit 1
      )
      returning ${COLUMNS}`,
    [input.workerId, input.leaseExpiresAt, input.now, [...input.types]],
  );

  return result.rows[0] ?? null;
}

/**
 * 完成。條件包含 lease_token 與 state：租約一旦被回收，舊 worker 這一句
 * 會回 0 列，於是它的結果寫不回去（舊 worker 不會覆蓋新 worker）。
 */
export async function completeJob(
  db: Queryable,
  input: { id: string; token: string; at: Date },
): Promise<JobRow | null> {
  // 唔係 uuid 就一定唔係這一個租約：回 null（「唔係你嘅」），唔好讓 Postgres 擲 22P02。
  if (!isUuid(input.id) || !isUuid(input.token)) {
    return null;
  }

  const result = await db.query<JobRow>(
    `update job
        set state = 'succeeded',
            completed_at = $3,
            lease_token = null,
            lease_expires_at = null,
            locked_by = null
      where id = $1 and lease_token = $2 and state = 'running'
      returning ${COLUMNS}`,
    [input.id, input.token, input.at],
  );

  return result.rows[0] ?? null;
}

/**
 * 鎖住一筆正在跑的工作，用來計算失敗之後的去向。
 * `for update` 令兩個同時報告失敗的 worker 只有一個成功（另一個會見到 state 已變）。
 */
export async function lockRunningJob(
  client: Queryable,
  input: { id: string; token: string },
): Promise<JobRow | null> {
  if (!isUuid(input.id) || !isUuid(input.token)) {
    return null;
  }

  const result = await client.query<JobRow>(
    `select ${COLUMNS}
       from job
      where id = $1 and lease_token = $2 and state = 'running'
        for update`,
    [input.id, input.token],
  );

  return result.rows[0] ?? null;
}

export type ApplyFailureInput = {
  id: string;
  token: string;
  state: Extract<JobState, 'pending' | 'dead'>;
  /** 重試時的下次到期時間；進 dead 時不變。 */
  runAt: Date;
  completedAt: Date | null;
  code: string;
  summary: string;
};

/** 把失敗結果寫回去（在同一個交易內，與審計一齊成功或一齊失敗）。 */
export async function applyFailure(db: Queryable, input: ApplyFailureInput): Promise<JobRow | null> {
  const result = await db.query<JobRow>(
    `update job
        set state = $3,
            run_at = $4,
            completed_at = $5,
            last_error_code = $6,
            last_error_summary = $7,
            lease_token = null,
            lease_expires_at = null,
            locked_by = null
      where id = $1 and lease_token = $2 and state = 'running'
      returning ${COLUMNS}`,
    [input.id, input.token, input.state, input.runAt, input.completedAt, input.code, input.summary],
  );

  return result.rows[0] ?? null;
}

/**
 * 續租。要求租約仍然未過期：過期之後再續，等於把一件可能已經交給別人
 * 的工作搶回來，會造成同一個工作跑兩次之外，還會令兩邊都以為自己擁有它。
 */
export async function renewLease(
  db: Queryable,
  input: { id: string; token: string; leaseExpiresAt: Date; now: Date },
): Promise<boolean> {
  if (!isUuid(input.id) || !isUuid(input.token)) {
    return false;
  }

  const result = await db.query(
    `update job
        set lease_expires_at = $3
      where id = $1 and lease_token = $2 and state = 'running' and lease_expires_at > $4`,
    [input.id, input.token, input.leaseExpiresAt, input.now],
  );

  return (result.rowCount ?? 0) === 1;
}

/**
 * 回收過期租約。
 *
 * 未達上限就回 pending（保留 attempts，所以崩潰的 worker 逃不過上限）；
 * 達上限就進 dead。一句 UPDATE 完成，因為這裡不需要退避計算：
 * 過期本身就已經是一段等待。
 */
export async function reclaimExpiredLeases(db: Queryable, now: Date): Promise<JobRow[]> {
  const result = await db.query<JobRow>(
    `update job
        set state = case when attempts >= max_attempts then 'dead' else 'pending' end,
            completed_at = case when attempts >= max_attempts then $1 else null end,
            last_error_code = 'lease_expired',
            last_error_summary = '租約過期未完成，已回收',
            lease_token = null,
            lease_expires_at = null,
            locked_by = null
      where state = 'running' and lease_expires_at <= $1
      returning ${COLUMNS}`,
    [now],
  );

  return result.rows;
}

export async function getJob(db: Queryable, id: string): Promise<JobRow | null> {
  const result = await db.query<JobRow>(`select ${COLUMNS} from job where id = $1`, [id]);

  return result.rows[0] ?? null;
}

/**
 * 死掉的工作，新的先排。留在資料庫，不自動刪、不自動重跑：
 * 「自動重跑 dead」等於把一個已經證明會失敗的東西變成無限循環。
 */
export async function listDeadJobs(
  db: Queryable,
  input: { limit: number; offset: number },
): Promise<JobRow[]> {
  const result = await db.query<JobRow>(
    `select ${COLUMNS}
       from job
      where state = 'dead'
      order by completed_at desc, id
      limit $1 offset $2`,
    [input.limit, input.offset],
  );

  return result.rows;
}

/** 待辦工作的種類與數量，用來指出「有工作但沒有 handler」這種沉默的積壓。 */
export async function countPendingByType(
  db: Queryable,
): Promise<Array<{ type: string; count: number; oldest_run_at: Date }>> {
  const result = await db.query<{ type: string; count: number; oldest_run_at: Date }>(
    `select type, count(*)::int as count, min(run_at) as oldest_run_at
       from job
      where state = 'pending'
      group by type
      order by count desc, type`,
  );

  return result.rows;
}

/** 在一個交易內做完一件事。任何錯誤都會回滾，連線一定會還回池。 */
export async function inTransaction<T>(
  pool: Pool,
  task: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const result = await task(client);

    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

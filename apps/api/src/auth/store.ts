import type { Pool, PoolClient } from 'pg';
import { writeAudit } from '../audit.js';
import type { FailedAttempts } from './rate-limit.js';

/**
 * 登入相關的資料庫存取。全部參數化查詢，不拼字串。
 * 這裡沒有一個函式會回傳密碼或 token 給呼叫者以外的地方：
 * UserRow 只留在伺服器內部，出 API 前一定經 toPublicUser 收窄。
 */

export type Role = 'owner' | 'staff';

export type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  department: string | null;
  password_hash: string;
  disabled_at: Date | null;
};

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
};

/** 首次開機的鎖：兩個併發 setup 只會有一個成功。 */
const SETUP_LOCK_KEY = 4_206_002;

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
}

export async function hasOwner(pool: Pool): Promise<boolean> {
  const rows = await pool.query("select 1 as one from app_user where role = 'owner' limit 1");

  return rows.rows.length > 0;
}

export async function findUserByEmail(pool: Pool, email: string): Promise<UserRow | null> {
  const rows = await pool.query<UserRow>(
    `select id, email, display_name, role, department, password_hash, disabled_at
     from app_user
     where lower(email) = $1
     limit 1`,
    [email],
  );

  return rows.rows[0] ?? null;
}

export type CreateOwnerInput = {
  email: string;
  displayName: string;
  passwordHash: string;
  tokenHash: string;
  expiresAt: Date;
};

export type CreateOwnerResult =
  | { status: 'created'; user: PublicUser }
  | { status: 'already_set_up' };

/**
 * 測試專用的鉤子，正式路徑不傳。
 *
 * 為甚麼需要它：「兩個併發 setup」如果兩個請求其實一先一後，測試就分辨不出
 * advisory lock 有沒有效 —— 後到的那個見到已提交的老闆自然回 409，就算沒有鎖也一樣。
 * afterOwnerCheck 讓測試把「檢查完沒有老闆」與「寫入」之間撐開，令兩個請求真的重疊。
 */
export type SetupHooks = {
  afterOwnerCheck?: () => Promise<void>;
};

/**
 * 建立老闆並同時開一個 session，在同一個交易裡。
 *
 * pg_advisory_xact_lock 令兩個併發的 setup 排隊：第二個拿到鎖時已經見到老闆，
 * 回 already_set_up，不會出現兩個 owner（資料庫的部分唯一索引是最後防線）。
 */
export async function createOwnerWithSession(
  pool: Pool,
  input: CreateOwnerInput,
  hooks?: SetupHooks,
): Promise<CreateOwnerResult> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [SETUP_LOCK_KEY]);

    const existing = await client.query(
      "select 1 as one from app_user where role = 'owner' limit 1",
    );

    if (existing.rows.length > 0) {
      await client.query('rollback');
      return { status: 'already_set_up' };
    }

    if (hooks?.afterOwnerCheck !== undefined) {
      await hooks.afterOwnerCheck();
    }

    const inserted = await client.query<{
      id: string;
      email: string;
      display_name: string;
      role: Role;
    }>(
      `insert into app_user (email, display_name, role, department, password_hash)
       values ($1, $2, 'owner', null, $3)
       returning id, email, display_name, role`,
      [input.email, input.displayName, input.passwordHash],
    );

    const row = inserted.rows[0];

    if (row === undefined) {
      throw new Error('建立老闆帳戶沒有回傳任何列');
    }

    await client.query(
      'insert into auth_session (token_hash, user_id, expires_at) values ($1, $2, $3)',
      [input.tokenHash, row.id, input.expiresAt],
    );

    await audit(client, {
      actorType: 'human',
      actorId: row.id,
      action: 'auth.setup',
      target: input.email,
    });

    await client.query('commit');

    return {
      status: 'created',
      user: { id: row.id, email: row.email, displayName: row.display_name, role: row.role },
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** writeAudit 只需要 query；這裡明確收窄，避免把 PoolClient 的整個介面傳出去。 */
function audit(
  client: PoolClient,
  entry: Parameters<typeof writeAudit>[1],
): Promise<void> {
  return writeAudit(
    { query: (text, values) => client.query(text, values) },
    entry,
  );
}

export async function insertSession(
  pool: Pool,
  input: { tokenHash: string; userId: string; expiresAt: Date },
): Promise<void> {
  await pool.query(
    'insert into auth_session (token_hash, user_id, expires_at) values ($1, $2, $3)',
    [input.tokenHash, input.userId, input.expiresAt],
  );
}

/**
 * 由 token 的雜湊找目前有效的 session。
 * 過期、已撤銷、使用者已停用，一律當作沒有登入。
 */
export async function findSessionUser(
  pool: Pool,
  tokenHash: string,
  now: Date,
): Promise<UserRow | null> {
  const rows = await pool.query<UserRow>(
    `select u.id, u.email, u.display_name, u.role, u.department, u.password_hash, u.disabled_at
     from auth_session s
     join app_user u on u.id = s.user_id
     where s.token_hash = $1
       and s.revoked_at is null
       and s.expires_at > $2
       and u.disabled_at is null
     limit 1`,
    [tokenHash, now],
  );

  return rows.rows[0] ?? null;
}

/** 撤銷 session；回傳被撤銷的 user_id，沒有對應 session 就回 null。 */
export async function revokeSession(
  pool: Pool,
  tokenHash: string,
  now: Date,
): Promise<string | null> {
  const rows = await pool.query<{ user_id: string }>(
    `update auth_session
     set revoked_at = $2
     where token_hash = $1 and revoked_at is null
     returning user_id`,
    [tokenHash, now],
  );

  return rows.rows[0]?.user_id ?? null;
}

/**
 * 數窗口內的失敗次數。
 * `target` 是 loginFailureTarget 算出來的識別碼，不是 email —— 審計表裡沒有 email。
 */
export async function countFailedAttempts(
  pool: Pool,
  target: string,
  since: Date,
): Promise<FailedAttempts> {
  const rows = await pool.query<{ count: number; oldest_at: Date | null }>(
    `select count(*)::int as count, min(at) as oldest_at
     from audit_log
     where action = 'auth.login_failed' and target = $1 and at > $2`,
    [target, since],
  );

  const row = rows.rows[0];

  if (row === undefined) {
    return { count: 0, oldestAt: null };
  }

  return { count: row.count, oldestAt: row.oldest_at };
}

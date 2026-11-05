import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { revokeAllSessions } from '../auth/store.js';

/**
 * 員工帳戶的資料庫存取（issue #84）。
 *
 * 三個不變量，全部靠資料庫而不是靠呼叫者記得：
 *   1. 經 API 建立的帳戶一定是 role = 'staff'、department = null、
 *      must_change_password = true —— 這裡不提供任何參數去改這三樣。
 *   2. 停用與撤銷 session 在同一個交易，所以不存在「停了但舊 cookie 仍然入得」。
 *   3. 停用不動 app_grant：授權歷史要留下來（#83 的規矩），權限判斷本身會因為
 *      帳戶停用而拒絕，所以不需要刪任何授權列。
 */

export type StaffRow = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  must_change_password: boolean;
  disabled_at: Date | null;
  created_at: Date;
};

export type StaffView = {
  id: string;
  email: string;
  displayName: string;
  role: 'staff';
  mustChangePassword: boolean;
  disabledAt: string | null;
  createdAt: string;
};

const COLUMNS = 'id, email, display_name, role, must_change_password, disabled_at, created_at';

export function toStaffView(row: StaffRow): StaffView {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: 'staff',
    mustChangePassword: row.must_change_password,
    disabledAt: row.disabled_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export type CreateStaffParams = {
  email: string;
  displayName: string;
  passwordHash: string;
  actorId: string;
};

export type CreateStaffResult =
  | { status: 'created'; staff: StaffView }
  | { status: 'duplicate_email' };

/**
 * 建立員工並寫審計，同一個交易：審計寫不入就整筆回滾 ——
 * 一個「查不到誰建立」的帳戶不應該存在。
 */
export async function createStaffAccount(
  pool: Pool,
  params: CreateStaffParams,
): Promise<CreateStaffResult> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const inserted = await client.query<StaffRow>(
      `insert into app_user (email, display_name, role, department, password_hash, must_change_password)
       values ($1, $2, 'staff', null, $3, true)
       returning ${COLUMNS}`,
      [params.email, params.displayName, params.passwordHash],
    );

    const row = inserted.rows[0];

    if (row === undefined) {
      throw new Error('建立員工之後沒有回傳列');
    }

    await writeAudit(
      { query: (text, values) => client.query(text, values) },
      {
        actorType: 'human',
        actorId: params.actorId,
        action: 'staff.create',
        target: row.id,
        // 只有角色與「要改密碼」這個事實。密碼、salt、雜湊一律不進審計。
        detail: { role: 'staff', mustChangePassword: true },
      },
    );

    await client.query('commit');

    return { status: 'created', staff: toStaffView(row) };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);

    // email 唯一索引（lower(email)）撞到就是重複；其他錯誤照樣拋出去。
    if (sqlStateOf(error) === '23505') {
      return { status: 'duplicate_email' };
    }

    throw error;
  } finally {
    client.release();
  }
}

/** 員工列表：建立次序（created_at asc, id asc），同一秒也有穩定次序。 */export async function listStaffAccounts(
  pool: Pool,
  input: { limit: number; offset: number },
): Promise<{ rows: StaffRow[]; total: number }> {
  const rows = await pool.query<StaffRow>(
    `select ${COLUMNS} from app_user
      where role = 'staff'
      order by created_at asc, id asc
      limit $1 offset $2`,
    [input.limit, input.offset],
  );

  const total = await pool.query<{ total: number }>(
    "select count(*)::int as total from app_user where role = 'staff'",
  );

  return { rows: rows.rows, total: total.rows[0]?.total ?? 0 };
}

export async function findStaff(pool: Pool, id: string): Promise<StaffRow | null> {
  const rows = await pool.query<StaffRow>(
    `select ${COLUMNS} from app_user where id = $1 and role = 'staff'`,
    [id],
  );

  return rows.rows[0] ?? null;
}

export type DisableResult =
  | { status: 'ok'; staff: StaffView }
  | { status: 'not_found' }
  | { status: 'owner_protected' }
  | { status: 'already_disabled' };

/**
 * 停用員工：鎖住該列、標記停用、撤銷全部 session、寫審計 —— 一個交易。
 *
 * `for update` 不是裝飾：登入的 insert … select 會等這個鎖，等到它提交之後
 * 見到 disabled_at，於是簽發不到 session。這一對（鎖 + 條件寫入）才是
 * 「停用之後唔會有新 session」的全部理由。
 */
export async function disableStaffAccount(
  pool: Pool,
  input: { id: string; actorId: string; now: Date },
): Promise<DisableResult> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const locked = await client.query<{ id: string; role: string; disabled_at: Date | null }>(
      'select id, role, disabled_at from app_user where id = $1 for update',
      [input.id],
    );

    const row = locked.rows[0];

    if (row === undefined) {
      await client.query('rollback');
      return { status: 'not_found' };
    }

    // 老闆不在管理範圍：不可以停用、不可以刪、也不可以「先降級再停用」（沒有降級 API）。
    if (row.role === 'owner') {
      await client.query('rollback');
      return { status: 'owner_protected' };
    }

    if (row.disabled_at !== null) {
      await client.query('rollback');
      return { status: 'already_disabled' };
    }

    const updated = await client.query<StaffRow>(
      `update app_user set disabled_at = $2 where id = $1 returning ${COLUMNS}`,
      [input.id, input.now],
    );

    await revokeAllSessions(
      { query: (text, values) => client.query(text, values) },
      input.id,
      input.now,
    );

    await writeAudit(
      { query: (text, values) => client.query(text, values) },
      {
        actorType: 'human',
        actorId: input.actorId,
        action: 'staff.disable',
        target: input.id,
        detail: { sessionsRevoked: true },
      },
    );

    await client.query('commit');

    const staff = updated.rows[0];

    if (staff === undefined) {
      throw new Error('停用員工之後沒有回傳列');
    }

    return { status: 'ok', staff: toStaffView(staff) };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 測試專用的鉤子（issue #86），正式路徑不傳。
 *
 * 為甚麼需要它：「老闆憑證在請求途中被換掉」這個競態如果沒有鉤子，
 * 測試只能靠時間差去猜，而靠猜的測試會時好時壞。`afterOwnerVerified`
 * 讓測試把「驗完老闆密碼」與「開交易」之間撐開，令第二個請求真的插進來。
 */
export type StaffHooks = {
  afterOwnerVerified?: () => Promise<void>;
};

export type ResetStaffPasswordParams = {
  id: string;
  actorId: string;
  /**
   * 驗證老闆密碼時讀到的那一串。交易內會再讀一次並比較：
   * 如果期間老闆自己換了密碼，這裡會回 stale_credentials 而不是照樣重設。
   */
  expectedOwnerHash: string;
  passwordHash: string;
  now: Date;
};

export type ResetStaffPasswordResult =
  | { status: 'ok'; staff: StaffView }
  | { status: 'not_found' }
  | { status: 'owner_protected' }
  | { status: 'actor_missing' }
  | { status: 'stale_credentials' };

/**
 * 老闆重設員工密碼（issue #86）：換雜湊、設 must_change_password、撤銷目標全部
 * session、寫審計 —— 一個交易，任何一步失敗整筆回滾。
 *
 * 幾個刻意的選擇：
 *   1. **不開 session 給目標**。這是重設，不是代登入；臨時密碼的線下交付由人負責。
 *   2. **不動 disabled_at**。停用的帳戶重設之後仍然停用 —— 重設密碼不是復活程序。
 *   3. **先鎖操作者，再鎖目標**。鎖次序固定，兩個重設撞在一起時只會排隊，不會死鎖。
 *   4. **操作者的 password_hash 要對得上**。`for update` 之後再比較，
 *      所以「驗證時是舊密碼、提交時已經是另一串」這種情況會回 409 而不是靜靜放行。
 */
export async function resetStaffPassword(
  pool: Pool,
  params: ResetStaffPasswordParams,
): Promise<ResetStaffPasswordResult> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const actor = await client.query<{ password_hash: string }>(
      'select password_hash from app_user where id = $1 and disabled_at is null for update',
      [params.actorId],
    );

    const actorRow = actor.rows[0];

    if (actorRow === undefined) {
      await client.query('rollback');
      return { status: 'actor_missing' };
    }

    if (actorRow.password_hash !== params.expectedOwnerHash) {
      await client.query('rollback');
      return { status: 'stale_credentials' };
    }

    const locked = await client.query<{ role: string }>(
      'select role from app_user where id = $1 for update',
      [params.id],
    );

    const row = locked.rows[0];

    if (row === undefined) {
      await client.query('rollback');
      return { status: 'not_found' };
    }

    if (row.role === 'owner') {
      await client.query('rollback');
      return { status: 'owner_protected' };
    }

    const updated = await client.query<StaffRow>(
      `update app_user
          set password_hash = $2, must_change_password = true
        where id = $1
        returning ${COLUMNS}`,
      [params.id, params.passwordHash],
    );

    await revokeAllSessions(
      { query: (text, values) => client.query(text, values) },
      params.id,
      params.now,
    );

    await writeAudit(
      { query: (text, values) => client.query(text, values) },
      {
        actorType: 'human',
        actorId: params.actorId,
        action: 'staff.password_reset',
        target: params.id,
        // 只有「做了甚麼」，沒有密碼、salt、雜湊、cookie 或 token。
        detail: { sessionsRevoked: true, mustChangePassword: true },
      },
    );

    await client.query('commit');

    const staff = updated.rows[0];

    if (staff === undefined) {
      throw new Error('重設員工密碼之後沒有回傳列');
    }

    return { status: 'ok', staff: toStaffView(staff) };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

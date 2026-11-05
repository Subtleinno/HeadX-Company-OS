import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHashLimiter } from '../../src/auth/hash-limits';
import {
  cookieFrom,
  createHarness,
  createStaff,
  login,
  signUpOwner,
  type Actor,
  type Harness,
} from './identity-harness';

/**
 * 帳戶安全管理（issue #86）：自行改密碼與老闆重設員工密碼。
 *
 * 這一張的重點不是「功能有冇」，而是「失敗的時候留下甚麼」：
 *   - 錯舊密碼要留痕，而且要有界地節流（不可以靠 UI）
 *   - 老闆重設要真的重新驗證老闆本人，不是信前端一個旗標
 *   - 重設之後目標一定要再改一次，舊 session 一個都不可以留
 *   - 停用、改密碼、重設、登入撞在一起時，不可以出現「停了仍然入得」
 *
 * 真 Postgres（臨時資料庫 co_test_<隨機>），正式資料庫由頭到尾不插任何列。
 */

const password = (): string => randomBytes(18).toString('base64url');

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(async () => {
  // 每個測試自己收好鉤子，免得下一個測試被上一個的暫停卡住。
  delete h.staffHooks.afterOwnerVerified;
  await h.app.close();
  await h.drop();
});

type Json = Record<string, unknown>;

function json(response: { json: () => unknown }): Json {
  return response.json() as Json;
}

async function owner(): Promise<Actor> {
  return signUpOwner(h);
}

/** 員工改完首次密碼之後的狀態：可以正常用系統。回傳的是**現行**密碼。 */
async function readyStaff(
  boss: Actor,
): Promise<{ id: string; email: string; password: string; cookie: string }> {
  const staff = await createStaff(h, boss);
  const first = await login(h, staff.email, staff.password);
  const current = password();
  const changed = await h.app.inject({
    method: 'POST',
    url: '/auth/change-password',
    headers: { cookie: first },
    payload: { currentPassword: staff.password, newPassword: current },
  });

  expect(changed.statusCode).toBe(200);

  return { ...staff, password: current, cookie: cookieFrom(changed) };
}

async function reset(
  boss: Actor,
  targetId: string,
  payload: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Json; headers: Record<string, unknown> }> {
  const response = await h.app.inject({
    method: 'POST',
    url: `/staff/${targetId}/reset-password`,
    headers: { cookie: boss.cookie },
    payload,
  });

  return { statusCode: response.statusCode, body: json(response), headers: response.headers };
}

async function passwordHashOf(id: string): Promise<string> {
  const rows = await h.db.pool.query<{ password_hash: string }>(
    'select password_hash from app_user where id = $1',
    [id],
  );

  return rows.rows[0]?.password_hash ?? '';
}

async function flagsOf(id: string): Promise<{ mustChange: boolean; disabled: boolean }> {
  const rows = await h.db.pool.query<{ must_change_password: boolean; disabled_at: Date | null }>(
    'select must_change_password, disabled_at from app_user where id = $1',
    [id],
  );

  const row = rows.rows[0];

  if (row === undefined) {
    throw new Error('找不到帳戶');
  }

  return { mustChange: row.must_change_password, disabled: row.disabled_at !== null };
}

async function liveSessionsOf(id: string): Promise<number> {
  const rows = await h.db.pool.query<{ count: number }>(
    'select count(*)::int as count from auth_session where user_id = $1 and revoked_at is null',
    [id],
  );

  return rows.rows[0]?.count ?? 0;
}

async function loginStatus(email: string, secret: string): Promise<number> {
  const response = await h.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: secret },
  });

  return response.statusCode;
}

describe('自行改密碼：路徑與輸入', () => {
  it('POST /auth/change-password 是正式路徑，body 只收 currentPassword 與 newPassword', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    const cookie = await login(h, staff.email, staff.password);
    const next = password();

    const unknown = await h.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: staff.password, newPassword: next, email: 'x@example.com' },
    });

    expect(unknown.statusCode).toBe(422);
    expect(unknown.headers['set-cookie']).toBeUndefined();

    const missing = await h.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: staff.password },
    });

    expect(missing.statusCode).toBe(422);

    const ok = await h.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: staff.password, newPassword: next },
    });

    expect(ok.statusCode).toBe(200);
  });

  it('未登入 401，回應不含任何帳戶資料', async () => {
    const response = await h.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      payload: { currentPassword: password(), newPassword: password() },
    });

    expect(response.statusCode).toBe(401);
    expect(json(response)).toEqual({ error: 'not_signed_in' });
  });

  it('新 session 的 token 只在 Set-Cookie，資料庫只存 SHA-256', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    const cookie = await login(h, staff.email, staff.password);

    const response = await h.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: staff.password, newPassword: password() },
    });

    expect(response.statusCode).toBe(200);
    expect(json(response)).not.toHaveProperty('token');

    const token = cookieFrom(response).replace(/^[^=]+=/, '');
    expect(token.length).toBeGreaterThanOrEqual(32);

    const rows = await h.db.pool.query<{ token_hash: string }>(
      'select token_hash from auth_session where user_id = $1 and revoked_at is null',
      [staff.id],
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.rows[0]?.token_hash).not.toBe(token);
  });
});

describe('自行改密碼：錯誤舊密碼的節流', () => {
  it('錯舊密碼留審計 auth.password_change_failed，唔會洩漏任何密碼素材', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    const cookie = await login(h, staff.email, staff.password);

    const response = await h.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: 'wrong-password-1234', newPassword: password() },
    });

    expect(response.statusCode).toBe(403);
    expect(json(response)).toEqual({ error: 'invalid_current_password' });

    const rows = await h.db.pool.query<{ actor_id: string; target: string; detail: unknown }>(
      `select actor_id, target, detail from audit_log where action = 'auth.password_change_failed'`,
    );

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.actor_id).toBe(staff.id);
    expect(rows.rows[0]?.target).toBe(staff.id);

    // detail 只可以有原因，不可以有 body、salt、雜湊。
    const serialised = JSON.stringify(rows.rows[0]?.detail ?? {});
    expect(serialised).not.toContain('wrong-password-1234');
    expect(serialised).not.toContain('scrypt');
  });

  it('連續 5 次錯之後連正確密碼都 429，帶 Retry-After', async () => {
    const boss = await owner();
    const staff = await createStaff(h, boss);
    const cookie = await login(h, staff.email, staff.password);
    const before = await passwordHashOf(staff.id);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await h.app.inject({
        method: 'POST',
        url: '/auth/change-password',
        headers: { cookie },
        payload: { currentPassword: `wrong-password-${attempt}`, newPassword: password() },
      });

      expect(wrong.statusCode).toBe(403);
    }

    const blocked = await h.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: staff.password, newPassword: password() },
    });

    expect(blocked.statusCode).toBe(429);
    expect(json(blocked)['error']).toBe('too_many_attempts');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // 鎖定期間密碼完全冇變：仍然可以用原本的密碼登入。
    expect(await passwordHashOf(staff.id)).toBe(before);
    expect(await loginStatus(staff.email, staff.password)).toBe(200);
  });

  it('節流是按操作者計，唔會波及另一個人的改密碼', async () => {
    const boss = await owner();
    const victim = await createStaff(h, boss);
    const other = await createStaff(h, boss);
    const victimCookie = await login(h, victim.email, victim.password);
    const otherCookie = await login(h, other.email, other.password);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await h.app.inject({
        method: 'POST',
        url: '/auth/change-password',
        headers: { cookie: victimCookie },
        payload: { currentPassword: `wrong-${attempt}`, newPassword: password() },
      });
    }

    const unaffected = await h.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie: otherCookie },
      payload: { currentPassword: other.password, newPassword: password() },
    });

    expect(unaffected.statusCode).toBe(200);
  });
});

describe('老闆重設員工密碼', () => {
  it('成功：旗標設回 true、目標全部 session 撤銷、舊密碼即時失效', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const temp = password();

    expect(await liveSessionsOf(staff.id)).toBe(1);

    const response = await reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: temp,
    });

    expect(response.statusCode).toBe(200);
    expect((response.body['staff'] as Json)['mustChangePassword']).toBe(true);

    const old = await h.app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: staff.cookie },
    });
    expect(old.statusCode).toBe(401);
    expect(await liveSessionsOf(staff.id)).toBe(0);

    expect(await loginStatus(staff.email, staff.password)).toBe(401);
    expect(await loginStatus(staff.email, temp)).toBe(200);
  });

  it('臨時密碼登入之後仍然被首次改密碼閘門擋住', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const temp = password();

    await reset(boss, staff.id, { ownerPassword: boss.password, newTemporaryPassword: temp });

    const cookie = await login(h, staff.email, temp);
    const blocked = await h.app.inject({
      method: 'GET',
      url: '/app-grants',
      headers: { cookie },
    });

    expect(blocked.statusCode).toBe(403);
    expect(json(blocked)['error']).toBe('password_change_required');
  });

  it('不得替目標開 session，亦不得回傳或回顯臨時密碼', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const temp = password();

    const response = await reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: temp,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await liveSessionsOf(staff.id)).toBe(0);

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain(temp);
    expect(serialised).not.toContain('scrypt');
    expect(serialised).not.toContain(boss.password);
  });

  it('未登入 401、員工 403', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);

    const anonymous = await h.app.inject({
      method: 'POST',
      url: `/staff/${staff.id}/reset-password`,
      payload: { ownerPassword: password(), newTemporaryPassword: password() },
    });
    expect(anonymous.statusCode).toBe(401);

    const byStaff = await h.app.inject({
      method: 'POST',
      url: `/staff/${staff.id}/reset-password`,
      headers: { cookie: staff.cookie },
      payload: { ownerPassword: staff.password, newTemporaryPassword: password() },
    });
    expect(byStaff.statusCode).toBe(403);
  });

  it('owner 重新驗證失敗 403，而且目標的密碼完全冇變', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const before = await passwordHashOf(staff.id);
    const sessionsBefore = await liveSessionsOf(staff.id);

    const response = await reset(boss, staff.id, {
      ownerPassword: password(),
      newTemporaryPassword: password(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.body['error']).toBe('invalid_owner_password');
    expect(await passwordHashOf(staff.id)).toBe(before);
    expect(await liveSessionsOf(staff.id)).toBe(sessionsBefore);

    // 原本的密碼仍然登入得到 —— 失敗的重設不可以有任何副作用。
    expect(await loginStatus(staff.email, staff.password)).toBe(200);
  });

  it('不可以重設老闆（409）、agent（404）、不存在（404）、非 uuid（422）', async () => {
    const boss = await owner();
    const created = await h.app.inject({
      method: 'POST',
      url: '/agents',
      headers: { cookie: boss.cookie },
      payload: { name: `agent-${randomBytes(3).toString('hex')}` },
    });
    expect(created.statusCode).toBe(201);
    const agentId = (json(created)['agent'] as { id: string }).id;

    const againstOwner = await reset(boss, boss.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: password(),
    });
    expect(againstOwner.statusCode).toBe(409);
    expect(againstOwner.body['error']).toBe('owner_protected');

    const againstAgent = await reset(boss, agentId, {
      ownerPassword: boss.password,
      newTemporaryPassword: password(),
    });
    expect(againstAgent.statusCode).toBe(404);

    const againstGhost = await reset(boss, '00000000-0000-4000-8000-000000000000', {
      ownerPassword: boss.password,
      newTemporaryPassword: password(),
    });
    expect(againstGhost.statusCode).toBe(404);

    const notUuid = await reset(boss, 'not-a-uuid', {
      ownerPassword: boss.password,
      newTemporaryPassword: password(),
    });
    expect(notUuid.statusCode).toBe(422);
  });

  it('停用的帳戶重設之後仍然停用，也登入不到', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const temp = password();

    const disabled = await h.app.inject({
      method: 'POST',
      url: `/staff/${staff.id}/disable`,
      headers: { cookie: boss.cookie },
    });
    expect(disabled.statusCode).toBe(200);

    const response = await reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: temp,
    });
    expect(response.statusCode).toBe(200);

    const flags = await flagsOf(staff.id);
    expect(flags.disabled).toBe(true);
    expect(flags.mustChange).toBe(true);

    expect(await loginStatus(staff.email, temp)).toBe(401);
    expect(await liveSessionsOf(staff.id)).toBe(0);
  });

  it('未知欄位與太短的臨時密碼 422，而且不會改動任何東西', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const before = await passwordHashOf(staff.id);
    const temp = password();

    const unknown = await reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: temp,
      mustChangePassword: false,
    });
    expect(unknown.statusCode).toBe(422);

    const weak = await reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: 'short',
    });
    expect(weak.statusCode).toBe(422);

    const missingOwner = await reset(boss, staff.id, { newTemporaryPassword: temp });
    expect(missingOwner.statusCode).toBe(422);

    expect(await passwordHashOf(staff.id)).toBe(before);
  });

  it('審計 staff.password_reset：actor 是老闆、target 是員工、無秘密', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const temp = password();

    await reset(boss, staff.id, { ownerPassword: boss.password, newTemporaryPassword: temp });

    const rows = await h.db.pool.query<{ actor_id: string; target: string; detail: unknown }>(
      `select actor_id, target, detail from audit_log where action = 'staff.password_reset'`,
    );

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.actor_id).toBe(boss.id);
    expect(rows.rows[0]?.target).toBe(staff.id);

    const serialised = JSON.stringify(rows.rows[0]?.detail ?? {});
    expect(serialised).not.toContain(temp);
    expect(serialised).not.toContain('scrypt');
  });

  it('審計寫不入就整筆回滾：密碼、旗標、session 全部保持原狀', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const before = await passwordHashOf(staff.id);
    const sessionsBefore = await liveSessionsOf(staff.id);

    await h.db.pool.query(`
      create or replace function fail_reset_audit() returns trigger as $$
      begin
        if new.action = 'staff.password_reset' then
          raise exception 'audit down';
        end if;
        return new;
      end;
      $$ language plpgsql
    `);
    await h.db.pool.query(
      'create trigger fail_reset_audit before insert on audit_log for each row execute function fail_reset_audit()',
    );

    const response = await reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: password(),
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(await passwordHashOf(staff.id)).toBe(before);
    expect(await liveSessionsOf(staff.id)).toBe(sessionsBefore);

    const flags = await flagsOf(staff.id);
    expect(flags.mustChange).toBe(false);
  });
});

describe('老闆重設員工密碼：並發', () => {
  it('老闆憑證在請求途中被換掉：409，唔會覆蓋任何東西', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const before = await passwordHashOf(staff.id);

    let release: () => void = () => undefined;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });

    h.staffHooks.afterOwnerVerified = async () => {
      entered();
      await paused;
    };

    const pending = reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: password(),
    });

    await reached;
    delete h.staffHooks.afterOwnerVerified;

    // 途中老闆自己改了密碼：舊的那一串已經不是現行憑證。
    const rotated = await h.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie: boss.cookie },
      payload: { currentPassword: boss.password, newPassword: password() },
    });
    expect(rotated.statusCode).toBe(200);

    release();
    const response = await pending;

    expect(response.statusCode).toBe(409);
    expect(response.body['error']).toBe('stale_credentials');
    expect(await passwordHashOf(staff.id)).toBe(before);

    const audits = await h.db.pool.query(
      `select 1 from audit_log where action = 'staff.password_reset'`,
    );
    expect(audits.rowCount).toBe(0);
  });

  it('重設與停用同時發生：最後仍然停用、零個可用 session、旗標 true', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const temp = password();

    let release: () => void = () => undefined;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });

    h.staffHooks.afterOwnerVerified = async () => {
      entered();
      await paused;
    };

    const pending = reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: temp,
    });

    await reached;
    delete h.staffHooks.afterOwnerVerified;

    const disabled = await h.app.inject({
      method: 'POST',
      url: `/staff/${staff.id}/disable`,
      headers: { cookie: boss.cookie },
    });
    expect(disabled.statusCode).toBe(200);

    release();
    const response = await pending;

    expect(response.statusCode).toBe(200);

    const flags = await flagsOf(staff.id);
    expect(flags.disabled).toBe(true);
    expect(flags.mustChange).toBe(true);
    expect(await liveSessionsOf(staff.id)).toBe(0);
    expect(await loginStatus(staff.email, temp)).toBe(401);
  });

  it('重設與登入同時發生：舊密碼換到的 session 不會留低', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const temp = password();

    let release: () => void = () => undefined;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });

    h.staffHooks.afterOwnerVerified = async () => {
      entered();
      await paused;
    };

    const pending = reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: temp,
    });

    await reached;
    delete h.staffHooks.afterOwnerVerified;

    // 重設未提交之前，舊密碼仍然有效，於是這一刻真的簽發了一個 session。
    expect(await loginStatus(staff.email, staff.password)).toBe(200);

    release();
    expect((await pending).statusCode).toBe(200);

    // 關鍵：重設提交之後，沒有任何未撤銷的 session 留低。
    expect(await liveSessionsOf(staff.id)).toBe(0);
  });

  it('兩個重設同時到達：序列化，兩筆審計，最後只有一個臨時密碼有效', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const first = password();
    const second = password();

    let release: () => void = () => undefined;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });

    h.staffHooks.afterOwnerVerified = async () => {
      entered();
      await paused;
    };

    const pending = reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: first,
    });

    await reached;
    delete h.staffHooks.afterOwnerVerified;

    const immediate = await reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: second,
    });
    expect(immediate.statusCode).toBe(200);

    release();
    expect((await pending).statusCode).toBe(200);

    const audits = await h.db.pool.query(
      `select 1 from audit_log where action = 'staff.password_reset'`,
    );
    expect(audits.rowCount).toBe(2);

    // 其中一個一定有效、另一個一定失效 —— 不會兩個都通，也不會兩個都不通。
    const outcomes = [await loginStatus(staff.email, first), await loginStatus(staff.email, second)];
    expect(outcomes.filter((status) => status === 200)).toHaveLength(1);

    const flags = await flagsOf(staff.id);
    expect(flags.mustChange).toBe(true);
  });
});

describe('老闆重設員工密碼：雜湊資源限制', () => {
  it('滿載時回 503 加 Retry-After，目標密碼不變', async () => {
    const boss = await owner();
    const staff = await readyStaff(boss);
    const before = await passwordHashOf(staff.id);

    h.limiter.current = createHashLimiter({ maxConcurrent: 1, maxQueue: 0, timeoutMs: 1_000 });

    let release: () => void = () => undefined;
    const held = h.limiter.current.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const response = await reset(boss, staff.id, {
      ownerPassword: boss.password,
      newTemporaryPassword: password(),
    });

    expect(response.statusCode).toBe(503);
    expect(response.body['error']).toBe('service_busy');
    expect(response.headers['retry-after']).toBeDefined();

    release();
    await held;
    expect(await passwordHashOf(staff.id)).toBe(before);
  });
});

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { loginFailureTarget } from '../../src/auth/login-hash';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 首次開機與登入的整合測試：真的 Postgres（臨時資料庫 co_test_<隨機>）加 Fastify inject。
 * 正式資料庫不會被寫入任何東西 —— 首次開機鎖是永久的，跑一次就無法復原。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

const BOSS_EMAIL = 'boss@example.com';

/** 測試專用 key：真 key 只放在 .env，不入 repo、不入測試。 */
const TEST_KEY = 'test-only-login-hash-key-0123456789abcdef';

function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

function firstSetCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string') {
    throw new Error('回應沒有 Set-Cookie');
  }

  return value;
}

function cookieHeader(response: { headers: Record<string, unknown> }): { cookie: string } {
  return { cookie: firstSetCookie(response).split(';')[0] ?? '' };
}

/**
 * 兩方會合點：兩個 setup 都到達之後才一起放行。
 *
 * 只有一方到達時（另一個被 advisory lock 擋在交易開頭）等一小段就放行，
 * 否則有鎖的那一版會死鎖 —— 持鎖的一方在等，另一方在等鎖。
 */
function rendezvous(parties: number, waitMs = 300): () => Promise<void> {
  let arrived = 0;
  let release: () => void = () => undefined;

  const allArrived = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    arrived += 1;

    if (arrived >= parties) {
      release();
      return;
    }

    await Promise.race([allArrived, new Promise<void>((resolve) => setTimeout(resolve, waitMs))]);
  };
}

describe('首次開機與老闆登入', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let now: Date;

  beforeEach(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
    now = new Date();

    app = buildServer({ checkDb: ok, checkStorage: ok });
    registerAuth(app, { pool: db.pool, now: () => now, loginHashKey: TEST_KEY });

    // 測試專用路由：證明 requireOwner 對未登入回 401、對員工回 403。
    app.get('/test/owner-only', { preHandler: app.requireOwner }, async () => ({ ok: true }));

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function setupOwner(): Promise<{ password: string; cookie: { cookie: string } }> {
    const password = randomPassword();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'Boss@Example.com', password },
    });

    expect(response.statusCode).toBe(201);

    return { password, cookie: cookieHeader(response) };
  }

  async function insertStaff(overrides: { disabled?: boolean } = {}): Promise<{
    email: string;
    cookie: { cookie: string };
  }> {
    const email = 'staff@example.com';
    const passwordHash = await hashPassword(randomPassword());

    const inserted = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash, disabled_at)
       values ($1, '員工', 'staff', 'design', $2, $3)
       returning id`,
      [email, passwordHash, overrides.disabled === true ? now : null],
    );

    const token = createSessionToken();
    await db.pool.query(
      'insert into auth_session (token_hash, user_id, expires_at) values ($1, $2, $3)',
      [
        hashSessionToken(token),
        inserted.rows[0]?.id,
        new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ],
    );

    return { email, cookie: { cookie: `co_session=${token}` } };
  }

  it('未開機：setupRequired 為 true，signedIn 為 false', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/state' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ setupRequired: true, signedIn: false });
  });

  it('setup：201、Set-Cookie 具備 HttpOnly 與 SameSite=Lax，email 轉小寫', async () => {
    const password = randomPassword();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'Boss@Example.com', password },
    });

    expect(response.statusCode).toBe(201);

    const cookie = firstSetCookie(response);
    expect(cookie).toContain('co_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');

    expect(response.json().user).toMatchObject({
      email: BOSS_EMAIL,
      displayName: '老闆',
      role: 'owner',
    });
    expect(response.body).not.toContain('password_hash');

    const rows = await db.pool.query<{ email: string; role: string; department: string | null }>(
      'select email, role, department from app_user',
    );
    expect(rows.rows).toEqual([{ email: BOSS_EMAIL, role: 'owner', department: null }]);

    const state = await app.inject({
      method: 'GET',
      url: '/auth/state',
      headers: cookieHeader(response),
    });
    expect(state.json()).toMatchObject({ setupRequired: false, signedIn: true });
  });

  it('setup 第二次回 409 already_set_up，不會建立第二個老闆', async () => {
    await setupOwner();

    const second = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '冒充者', email: 'other@example.com', password: randomPassword() },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'already_set_up' });

    const owners = await db.pool.query<{ n: number }>(
      "select count(*)::int as n from app_user where role = 'owner'",
    );
    expect(owners.rows[0]?.n).toBe(1);
  });

  it('兩個併發 setup：只有一個 201，一個 409', async () => {
    const first = app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '甲', email: 'a@example.com', password: randomPassword() },
    });
    const second = app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '乙', email: 'b@example.com', password: randomPassword() },
    });

    const statuses = (await Promise.all([first, second])).map((response) => response.statusCode);

    expect(statuses.sort()).toEqual([201, 409]);

    const owners = await db.pool.query<{ n: number }>(
      "select count(*)::int as n from app_user where role = 'owner'",
    );
    expect(owners.rows[0]?.n).toBe(1);
  });

  /**
   * 上面那個測試分不出「advisory lock 有效」與「唯一索引兜底」：
   * 就算拿走 lock，唯一索引也會令第二個 insert 失敗（變成 500 或者 409，視乎錯誤處理）。
   * 這個測試先把唯一索引拿走，剩下的就只有 lock 在擋。
   */
  it('拿走唯一索引之後兩個併發 setup：仍然一個 201、一個 409，owner 只有一列', async () => {
    await db.pool.query('drop index app_user_single_owner');

    // 兩個請求必須在「檢查沒有老闆」與「寫入」之間真的重疊，這個測試才分辨得出
    // 是 advisory lock 在擋，還是兩個請求剛好一先一後。會合點由鉤子撐開。
    const gate = rendezvous(2);
    const hooked = buildServer({ checkDb: ok, checkStorage: ok });
    registerAuth(hooked, {
      pool: db.pool,
      now: () => now,
      loginHashKey: TEST_KEY,
      setupHooks: { afterOwnerCheck: gate },
    });
    await hooked.ready();

    try {
      const first = hooked.inject({
        method: 'POST',
        url: '/auth/setup',
        payload: { displayName: '甲', email: 'a@example.com', password: randomPassword() },
      });
      const second = hooked.inject({
        method: 'POST',
        url: '/auth/setup',
        payload: { displayName: '乙', email: 'b@example.com', password: randomPassword() },
      });

      const responses = await Promise.all([first, second]);
      const statuses = responses.map((response) => response.statusCode);

      expect(statuses.sort()).toEqual([201, 409]);

      const owners = await db.pool.query<{ n: number }>(
        "select count(*)::int as n from app_user where role = 'owner'",
      );
      expect(owners.rows[0]?.n).toBe(1);
    } finally {
      await hooked.close();
    }
  });

  it('不經 API 直接 insert 第二個 owner：被 app_user_single_owner 拒絕', async () => {
    await setupOwner();

    const error = await db.pool
      .query(
        `insert into app_user (email, display_name, role, department, password_hash)
         values ('second@example.com', '第二個老闆', 'owner', null, 'x')`,
      )
      .then(
        () => null,
        (caught: { code?: string; constraint?: string }) => caught,
      );

    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505');
    expect(error?.constraint).toBe('app_user_single_owner');

    const owners = await db.pool.query<{ n: number }>(
      "select count(*)::int as n from app_user where role = 'owner'",
    );
    expect(owners.rows[0]?.n).toBe(1);
  });

  it('setup 的密碼太短：400，一列都不寫，審計表也沒有紀錄', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: BOSS_EMAIL, password: 'too-short' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_input', field: 'password' });

    const users = await db.pool.query<{ n: number }>('select count(*)::int as n from app_user');
    const audits = await db.pool.query<{ n: number }>('select count(*)::int as n from audit_log');
    expect(users.rows[0]?.n).toBe(0);
    expect(audits.rows[0]?.n).toBe(0);
  });

  it('登入成功取得 cookie，/me 回同一個老闆', async () => {
    const owner = await setupOwner();

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'BOSS@example.com', password: owner.password },
    });

    expect(login.statusCode).toBe(200);
    expect(firstSetCookie(login)).toContain('HttpOnly');

    const me = await app.inject({ method: 'GET', url: '/me', headers: cookieHeader(login) });

    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: BOSS_EMAIL, role: 'owner', displayName: '老闆' });
    expect(me.body).not.toContain('password_hash');
  });

  it('未登入存取 /me 回 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'not_signed_in' });
  });

  it('錯密碼與不存在的 email：狀態碼與 body 完全相同', async () => {
    const owner = await setupOwner();

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: BOSS_EMAIL, password: `${owner.password}-wrong` },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: owner.password },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.body).toBe(unknownEmail.body);
    expect(wrongPassword.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('已停用的使用者：同一個 401，不會透露帳戶存在', async () => {
    const owner = await setupOwner();
    await db.pool.query('update app_user set disabled_at = now() where email = $1', [BOSS_EMAIL]);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: BOSS_EMAIL, password: owner.password },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'invalid_credentials' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('連續 5 次失敗：第 6 次即使密碼正確也 429，並附 Retry-After', async () => {
    const owner = await setupOwner();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: BOSS_EMAIL, password: `${owner.password}-wrong-${attempt}` },
      });
      expect(failed.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: BOSS_EMAIL, password: owner.password },
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: 'too_many_attempts' });

    const retryAfter = Number(blocked.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);

    // 時鐘推過 15 分鐘：審計表改不了，所以窗口起點由 app 帶入。
    now = new Date(now.getTime() + 16 * 60 * 1000);

    const afterWindow = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: BOSS_EMAIL, password: owner.password },
    });

    expect(afterWindow.statusCode).toBe(200);
  });

  /**
   * issue #65：登入失敗的 target 不可以是明文 email。
   * audit_log 只准追加，所以寫進去的每一列都永遠在；這裡用臨時資料庫，
   * 測完 DROP，正式庫由頭到尾不插任何列。
   */
  it('不存在的 email 連續失敗 5 次：target 是同一個識別碼，不含 @，也不是明文', async () => {
    const email = 'nobody@example.com';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: randomPassword() },
      });

      expect(failed.statusCode).toBe(401);
    }

    const rows = await db.pool.query<{ target: string | null }>(
      "select target from audit_log where action = 'auth.login_failed' order by id",
    );

    expect(rows.rows).toHaveLength(5);

    const targets = rows.rows.map((row) => row.target);
    expect(new Set(targets).size).toBe(1);
    expect(targets[0]).toBe(loginFailureTarget(email, TEST_KEY));
    expect(targets[0]).toMatch(/^email_hmac:[0-9a-f]{64}$/);
    expect(targets[0]).not.toContain('@');
    expect(targets[0]).not.toContain('nobody');

    // 整張表都不應該有 email 形狀的字串留下來。
    const withAt = await db.pool.query<{ n: number }>(
      "select count(*)::int as n from audit_log where target like '%@%'",
    );
    expect(withAt.rows[0]?.n).toBe(0);
  });

  it('大小寫不同、前後有空白的同一 email：同一個 target；不同 email：不同 target', async () => {
    const attempts = [
      'Alice.Smith@Company.com',
      '  alice.smith@company.com ',
      'bob@company.com',
    ];

    for (const email of attempts) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: randomPassword() },
      });

      expect(response.statusCode).toBe(401);
    }

    const rows = await db.pool.query<{ target: string | null }>(
      "select target from audit_log where action = 'auth.login_failed' order by id",
    );

    const targets = rows.rows.map((row) => row.target);
    expect(targets).toHaveLength(3);
    expect(targets[0]).toBe(targets[1]);
    expect(targets[2]).not.toBe(targets[0]);
  });

  it('不存在的 email 第 6 次失敗：429 加 Retry-After（鎖是靠識別碼穩定才鎖得住）', async () => {
    const email = 'nobody@example.com';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: randomPassword() },
      });

      expect(failed.statusCode).toBe(401);
    }

    // 換一個大小寫不同的寫法：正規化後是同一個 email，應該一樣被鎖。
    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'NOBODY@Example.COM', password: randomPassword() },
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: 'too_many_attempts' });

    const retryAfter = Number(blocked.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
  });

  it('登出：204、清 cookie、同一個 cookie 之後回 401，資料庫有 revoked_at', async () => {
    const owner = await setupOwner();

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: owner.cookie,
    });

    expect(logout.statusCode).toBe(204);
    const cleared = firstSetCookie(logout);
    expect(cleared).toContain('co_session=');
    expect(cleared).toContain('Max-Age=0');

    const me = await app.inject({ method: 'GET', url: '/me', headers: owner.cookie });
    expect(me.statusCode).toBe(401);

    const sessions = await db.pool.query<{ revoked_at: Date | null }>(
      'select revoked_at from auth_session',
    );
    expect(sessions.rows[0]?.revoked_at).not.toBeNull();
  });

  it('登出帶 application/json 但沒有 body：仍然 204，session 真的被撤銷', async () => {
    const owner = await setupOwner();

    // 很多前端封裝會為所有請求統一加 Content-Type: application/json，即使沒有 body。
    // Fastify 預設在解析器就回 400（FST_ERR_CTP_EMPTY_JSON_BODY），請求到不了 handler。
    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { ...owner.cookie, 'content-type': 'application/json' },
    });

    expect(logout.statusCode).toBe(204);
    expect(firstSetCookie(logout)).toContain('Max-Age=0');

    const me = await app.inject({ method: 'GET', url: '/me', headers: owner.cookie });
    expect(me.statusCode).toBe(401);

    const sessions = await db.pool.query<{ revoked_at: Date | null }>(
      'select revoked_at from auth_session',
    );
    expect(sessions.rows[0]?.revoked_at).not.toBeNull();

    const audits = await db.pool.query<{ n: number }>(
      "select count(*)::int as n from audit_log where action = 'auth.logout'",
    );
    expect(audits.rows[0]?.n).toBe(1);
  });

  it('setup 與 login 帶 application/json 但沒有 body：400 invalid_input，不是 500', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      headers: { 'content-type': 'application/json' },
    });

    expect(setup.statusCode).toBe(400);
    expect(setup.json()).toEqual({ error: 'invalid_input', field: 'displayName' });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
    });

    expect(login.statusCode).toBe(400);
    expect(login.json()).toEqual({ error: 'invalid_input', field: 'email' });

    // 空 body 不可以被當成「已開機」而寫入任何東西。
    const users = await db.pool.query<{ n: number }>('select count(*)::int as n from app_user');
    expect(users.rows[0]?.n).toBe(0);
  });

  it('壞掉的 JSON：400，不是 500', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": "boss@example.com", "password":',
    });

    expect(response.statusCode).toBe(400);
  });

  it('session 過期（注入時鐘）回 401', async () => {
    const owner = await setupOwner();

    const before = await app.inject({ method: 'GET', url: '/me', headers: owner.cookie });
    expect(before.statusCode).toBe(200);

    now = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000 + 1000);

    const after = await app.inject({ method: 'GET', url: '/me', headers: owner.cookie });
    expect(after.statusCode).toBe(401);
  });

  it('資料庫存的是 cookie token 的 SHA-256，不是 token 本身', async () => {
    const owner = await setupOwner();
    const token = (owner.cookie.cookie.split('=')[1] ?? '').trim();

    const rows = await db.pool.query<{ token_hash: string }>('select token_hash from auth_session');

    expect(rows.rows[0]?.token_hash).toBe(hashSessionToken(token));
    expect(rows.rows[0]?.token_hash).not.toBe(token);
    expect(rows.rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Origin 與 Host 不同：403 bad_origin；相同就照常處理', async () => {
    const mismatched = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: 'http://evil.example', host: '127.0.0.1:4420' },
      payload: { email: BOSS_EMAIL, password: randomPassword() },
    });

    expect(mismatched.statusCode).toBe(403);
    expect(mismatched.json()).toEqual({ error: 'bad_origin' });

    const sameOrigin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: 'http://127.0.0.1:4420', host: '127.0.0.1:4420' },
      payload: { email: BOSS_EMAIL, password: randomPassword() },
    });
    expect(sameOrigin.statusCode).toBe(401);

    // 只檢查會改變狀態的請求：GET 帶不同 Origin 也照常。
    const state = await app.inject({
      method: 'GET',
      url: '/auth/state',
      headers: { origin: 'http://evil.example', host: '127.0.0.1:4420' },
    });
    expect(state.statusCode).toBe(200);
  });

  it('審計：setup、login、login_failed、logout 都有紀錄，detail 不含密碼', async () => {
    const owner = await setupOwner();

    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: BOSS_EMAIL, password: owner.password },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: BOSS_EMAIL, password: `${owner.password}-wrong` },
    });
    await app.inject({ method: 'POST', url: '/auth/logout', headers: owner.cookie });

    const rows = await db.pool.query<{
      action: string;
      actor_type: string;
      actor_id: string;
      target: string | null;
      detail: unknown;
    }>('select action, actor_type, actor_id, target, detail from audit_log order by id');

    const actions = rows.rows.map((row) => row.action);
    expect(actions).toEqual(['auth.setup', 'auth.login', 'auth.login_failed', 'auth.logout']);

    const failed = rows.rows.find((row) => row.action === 'auth.login_failed');
    // issue #65：失敗紀錄的 target 是 keyed hash，不是明文 email。
    expect(failed?.target).toBe(loginFailureTarget(BOSS_EMAIL, TEST_KEY));
    expect(failed?.target).not.toBe(BOSS_EMAIL);
    expect(failed?.target).not.toContain('@');
    expect(failed?.actor_id).toBe('anonymous');

    for (const row of rows.rows) {
      expect(JSON.stringify(row.detail)).not.toContain(owner.password);
    }
  });

  it('requireOwner：未登入 401、員工 403、老闆 200', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/test/owner-only' });
    expect(anonymous.statusCode).toBe(401);

    const staff = await insertStaff();
    const asStaff = await app.inject({
      method: 'GET',
      url: '/test/owner-only',
      headers: staff.cookie,
    });
    expect(asStaff.statusCode).toBe(403);
    expect(asStaff.json()).toEqual({ error: 'forbidden' });

    const owner = await setupOwner();
    const asOwner = await app.inject({
      method: 'GET',
      url: '/test/owner-only',
      headers: owner.cookie,
    });
    expect(asOwner.statusCode).toBe(200);
  });
});

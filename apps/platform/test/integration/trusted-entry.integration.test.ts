import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { GATEWAY_TOKEN_HEADER } from '../../src/auth/gateway-token';
import { registerEntryGuard } from '../../src/auth/entry-guard';
import { ENTRY_HEADER } from '../../src/auth/trusted-entry';
import { createHashLimiter } from '../../src/auth/hash-limits';
import { registerGrants } from '../../src/grants/index';
import { registerStaff } from '../../src/staff/index';
import { migrate } from '../../src/migrate';
import type { ModuleManifest, ModuleRegistry } from '../../src/modules/registry/index';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 可信 internal 入口與 session.entry（issue #87）。
 *
 * 這一張的核心問題只有一句：**憑甚麼相信「這個請求是由內網入口轉發過來」？**
 * 答案不可以是「因為它來自 Docker 網段」或者「因為 Host 是 localhost」——
 * 那些都可以由呼叫者自己填。答案只可以是一條只有 gateway 與 platform 知道的憑證。
 *
 * 這個檔案用真 Postgres（臨時資料庫 co_test_<隨機>）加真 HTTP（Fastify inject），
 * 接線與 server.ts 一致：守衛讀標頭、session 綁入口、policy 只由服務端 context 取入口。
 * 正式資料庫由頭到尾不插任何列；憑證是測試即時隨機產生，不會寫進 repo。
 */

const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

/** 測試憑證：每次執行都不同。64 個 hex 字元＝32 bytes，符合下限。 */
const TOKEN = randomBytes(32).toString('hex');
const OTHER_TOKEN = randomBytes(32).toString('hex');

/** 測試專用 login hash key（與其他整合測試一致，不入 repo 的真 key）。 */
const TEST_LOGIN_HASH_KEY = 'test-only-login-hash-key-0123456789abcdef';

type Built = {
  app: FastifyInstance;
  db: TempDatabase;
  /** 原封不動的 inject：要送「沒有憑證」「錯憑證」的請求時用這個。 */
  injectRaw: FastifyInstance['inject'];
};

/**
 * 測試專用 app 清單：sales（內部）、portal（客戶入口）。
 * portal 是這一張的關鍵 —— internal 入口的 session 不可以通過 customer app 的規則。
 */
function testRegistry(): ModuleRegistry {
  const apps: Array<Pick<ModuleManifest, 'id' | 'sensitive' | 'available' | 'exposure'>> = [
    { id: 'sales', sensitive: false, available: true, exposure: 'internal' },
    { id: 'portal', sensitive: false, available: true, exposure: 'customer' },
  ];

  return {
    listModules: () =>
      apps.map((app, index) => ({
        ...app,
        title: app.id,
        kind: 'department' as const,
        department: app.id,
        order: index,
        route: `/${app.id}`,
      })),
    departmentKeys: () => apps.map((app) => app.id),
  };
}

async function build(): Promise<Built> {
  const db = await createTempDatabase();
  await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

  const app = buildServer({ checkDb: ok, checkStorage: ok });
  const registry = testRegistry();
  const hashRun = createHashLimiter().run;

  // 與 server.ts 一致：先裝入口守衛，才註冊需要入口的路由。
  registerEntryGuard(app, { token: TOKEN });

  registerAuth(app, {
    pool: db.pool,
    loginHashKey: TEST_LOGIN_HASH_KEY,
    hashRun,
    // 刻意不注入 resolveEntry：走真正的 request context（見 trusted-entry.ts）。
  });
  registerStaff(app, { pool: db.pool, hashRun });
  // 授權檢查的入口也由服務端 context 取，不經 body／query。
  registerGrants(app, {
    pool: db.pool,
    registry,
    resolveEntry: (request) => request.trustedEntry ?? null,
  });

  await app.ready();

  return { app, db, injectRaw: app.inject.bind(app) };
}

/** 一個「合法 gateway 轉發過來」的標頭組。 */
function trusted(over: Record<string, string> = {}): Record<string, string> {
  return {
    [ENTRY_HEADER]: 'internal',
    [GATEWAY_TOKEN_HEADER]: TOKEN,
    ...over,
  };
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  return String(value ?? '').split(';')[0] ?? '';
}

let built: Built;

beforeEach(async () => {
  built = await build();
});

afterEach(async () => {
  await built.app.close();
  await built.db.drop();
});

/** 走真 HTTP 建立老闆，回傳 id／email／密碼／cookie。 */
async function setupOwner(): Promise<{ id: string; email: string; password: string; cookie: string }> {
  const email = `boss-${randomBytes(4).toString('hex')}@example.com`;
  const password = randomBytes(18).toString('base64url');

  const response = await built.injectRaw({
    method: 'POST',
    url: '/auth/setup',
    headers: trusted(),
    payload: { displayName: '老闆', email, password },
  });

  expect(response.statusCode).toBe(201);

  const cookie = cookieFrom(response);
  const me = await built.injectRaw({ method: 'GET', url: '/me', headers: trusted({ cookie }) });

  return { id: (me.json() as { user: { id: string } }).user.id, email, password, cookie };
}

describe('合法 gateway：完整流程照舊可用', () => {
  it('setup → me → logout → me 全部成功', async () => {
    const owner = await setupOwner();
    expect(owner.cookie).toMatch(/^co_session=/);

    const me = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ cookie: owner.cookie }),
    });

    expect(me.statusCode).toBe(200);
    expect((me.json() as { user: { email: string } }).user.email).toBe(owner.email);

    const logout = await built.injectRaw({
      method: 'POST',
      url: '/auth/logout',
      headers: trusted({ cookie: owner.cookie }),
    });

    expect(logout.statusCode).toBe(204);

    const after = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ cookie: owner.cookie }),
    });

    expect(after.statusCode).toBe(401);
  });

  it('登入、讀 state 一樣要帶憑證，帶了就如常', async () => {
    const owner = await setupOwner();

    const login = await built.injectRaw({
      method: 'POST',
      url: '/auth/login',
      headers: trusted(),
      payload: { email: owner.email, password: owner.password },
    });

    expect(login.statusCode).toBe(200);
    expect(cookieFrom(login)).toMatch(/^co_session=/);

    const state = await built.injectRaw({
      method: 'GET',
      url: '/auth/state',
      headers: trusted(),
    });

    expect(state.statusCode).toBe(200);
    expect((state.json() as { setupRequired: boolean }).setupRequired).toBe(false);
  });
});

describe('沒有可信入口：一律 403 untrusted_entry', () => {
  it('直接呼叫平台、完全不帶標頭', async () => {
    const response = await built.injectRaw({ method: 'GET', url: '/me' });

    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: string }).error).toBe('untrusted_entry');
  });

  it('只有偽造的 entry 標頭，沒有憑證', async () => {
    const response = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: { [ENTRY_HEADER]: 'internal' },
    });

    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: string }).error).toBe('untrusted_entry');
  });

  it('憑證是錯的（長度對、內容錯）', async () => {
    const response = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ [GATEWAY_TOKEN_HEADER]: OTHER_TOKEN }),
    });

    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: string }).error).toBe('untrusted_entry');
  });

  it('憑證正確但入口寫 partner／customer／亂填 —— 本張只接受 internal', async () => {
    for (const entry of ['partner', 'customer', 'unknown', 'Internal']) {
      const response = await built.injectRaw({
        method: 'GET',
        url: '/me',
        headers: trusted({ [ENTRY_HEADER]: entry }),
      });

      expect(response.statusCode, entry).toBe(403);
      expect((response.json() as { error: string }).error, entry).toBe('untrusted_entry');
    }
  });

  it('重複標頭（Node 會用逗號合併）不會被當成第一個值', async () => {
    const duplicatedEntry = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ [ENTRY_HEADER]: 'internal, internal' }),
    });

    expect(duplicatedEntry.statusCode).toBe(403);

    const duplicatedToken = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ [GATEWAY_TOKEN_HEADER]: `${TOKEN}, ${TOKEN}` }),
    });

    expect(duplicatedToken.statusCode).toBe(403);
  });

  it('來自 loopback、帶 X-Forwarded-For 也不會變成可信', async () => {
    const response = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: {
        host: '127.0.0.1:4420',
        'x-forwarded-for': '172.18.0.1',
        'x-forwarded-proto': 'http',
        'x-real-ip': '127.0.0.1',
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('設定入口（setup）、登入、改密碼、重設密碼全部受同一道守衛保護', async () => {
    const owner = await setupOwner();

    const setup = await built.injectRaw({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '路人', email: 'x@example.com', password: 'a-long-enough-password' },
    });

    expect(setup.statusCode).toBe(403);

    const login = await built.injectRaw({
      method: 'POST',
      url: '/auth/login',
      payload: { email: owner.email, password: owner.password },
    });

    expect(login.statusCode).toBe(403);

    const change = await built.injectRaw({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie: owner.cookie },
      payload: { currentPassword: owner.password, newPassword: 'another-long-password' },
    });

    expect(change.statusCode).toBe(403);

    const reset = await built.injectRaw({
      method: 'POST',
      url: `/staff/${owner.id}/reset-password`,
      headers: { cookie: owner.cookie },
      payload: { ownerPassword: owner.password, newTemporaryPassword: 'temporary-password' },
    });

    expect(reset.statusCode).toBe(403);
  });
});

describe('豁免只限容器探針', () => {
  it('/livez 與 /health 不需要憑證', async () => {
    const livez = await built.injectRaw({ method: 'GET', url: '/livez' });
    expect(livez.statusCode).toBe(200);

    const health = await built.injectRaw({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
  });

  it('豁免不會傳遞：/health/storage 一樣要憑證', async () => {
    const anonymous = await built.injectRaw({ method: 'GET', url: '/health/storage' });

    expect(anonymous.statusCode).toBe(403);
    expect((anonymous.json() as { error: string }).error).toBe('untrusted_entry');

    const trustedResponse = await built.injectRaw({
      method: 'GET',
      url: '/health/storage',
      headers: trusted(),
    });

    // 帶了憑證就走到真正的診斷（測試沒有注入診斷器，所以是 503 而不是 403）。
    expect(trustedResponse.statusCode).toBe(503);
  });
});

describe('可信入口不等於登入', () => {
  it('有憑證、無 cookie：401 而不是 200', async () => {
    const response = await built.injectRaw({ method: 'GET', url: '/me', headers: trusted() });

    expect(response.statusCode).toBe(401);
  });

  it('有憑證、cookie 是亂填的：401', async () => {
    const response = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ cookie: 'co_session=not-a-real-token' }),
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('session 綁定入口', () => {
  it('setup 開出的 session 記住 internal', async () => {
    await setupOwner();

    const rows = await built.db.pool.query<{ entry: string }>(
      'select entry from auth_session where revoked_at is null',
    );

    expect(rows.rows.map((row) => row.entry)).toEqual(['internal']);
  });

  it('登入開出的 session 同樣記住 internal', async () => {
    const owner = await setupOwner();

    await built.injectRaw({
      method: 'POST',
      url: '/auth/login',
      headers: trusted(),
      payload: { email: owner.email, password: owner.password },
    });

    const rows = await built.db.pool.query<{ entry: string }>(
      'select entry from auth_session where revoked_at is null order by created_at',
    );

    expect(rows.rows.length).toBe(2);
    expect(rows.rows.every((row) => row.entry === 'internal')).toBe(true);
  });

  it('改密碼輪替出來的新 session 一樣是 internal，舊 session 被撤銷', async () => {
    const owner = await setupOwner();
    const newPassword = randomBytes(18).toString('base64url');

    const response = await built.injectRaw({
      method: 'POST',
      url: '/auth/change-password',
      headers: trusted({ cookie: owner.cookie }),
      payload: { currentPassword: owner.password, newPassword },
    });

    expect(response.statusCode).toBe(200);

    const alive = await built.db.pool.query<{ entry: string; token_hash: string }>(
      'select entry, token_hash from auth_session where revoked_at is null',
    );

    expect(alive.rows.length).toBe(1);
    expect(alive.rows[0]?.entry).toBe('internal');

    // 舊 cookie 已經失效，新 cookie 可用。
    const oldCookie = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ cookie: owner.cookie }),
    });

    expect(oldCookie.statusCode).toBe(401);

    const freshCookie = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ cookie: cookieFrom(response) }),
    });

    expect(freshCookie.statusCode).toBe(200);
  });

  it('老闆重設員工密碼：撤銷員工 session，但不會替員工開新 session', async () => {
    const owner = await setupOwner();
    const staffEmail = `staff-${randomBytes(4).toString('hex')}@example.com`;
    const staffPassword = randomBytes(18).toString('base64url');

    const created = await built.injectRaw({
      method: 'POST',
      url: '/staff',
      headers: trusted({ cookie: owner.cookie }),
      payload: { displayName: '員工', email: staffEmail, initialPassword: staffPassword },
    });

    expect(created.statusCode).toBe(201);
    const staffId = (created.json() as { staff: { id: string } }).staff.id;

    // 員工先登入一次，令重設有東西可以撤銷。
    const staffLogin = await built.injectRaw({
      method: 'POST',
      url: '/auth/login',
      headers: trusted(),
      payload: { email: staffEmail, password: staffPassword },
    });

    expect(staffLogin.statusCode).toBe(200);
    const staffCookie = cookieFrom(staffLogin);

    const reset = await built.injectRaw({
      method: 'POST',
      url: `/staff/${staffId}/reset-password`,
      headers: trusted({ cookie: owner.cookie }),
      payload: {
        ownerPassword: owner.password,
        newTemporaryPassword: randomBytes(18).toString('base64url'),
      },
    });

    expect(reset.statusCode).toBe(200);

    const staffSessions = await built.db.pool.query<{ count: number }>(
      'select count(*)::int as count from auth_session where user_id = $1 and revoked_at is null',
      [staffId],
    );

    expect(staffSessions.rows[0]?.count).toBe(0);

    const revoked = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ cookie: staffCookie }),
    });

    expect(revoked.statusCode).toBe(401);
  });

  it('入口不相符的 session 一律拒絕：直接寫一列 partner session', async () => {
    const owner = await setupOwner();

    // 測試專用 adapter：模擬一條由夥伴入口建立的 session。
    const token = `mismatch-${randomBytes(8).toString('hex')}`;
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await built.db.pool.query(
      `insert into auth_session (token_hash, user_id, entry, expires_at)
       values ($1, $2, 'partner', now() + interval '1 day')`,
      [tokenHash, owner.id],
    );

    const response = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ cookie: `co_session=${token}` }),
    });

    expect(response.statusCode).toBe(401);
  });

  it('升級前的 session（legacy）一律失效', async () => {
    const owner = await setupOwner();

    const token = `legacy-${randomBytes(8).toString('hex')}`;
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // 模擬升級前的列：migration 會把它標成 legacy 並撤銷。
    await built.db.pool.query(
      `insert into auth_session (token_hash, user_id, entry, expires_at, revoked_at)
       values ($1, $2, 'legacy', now() + interval '1 day', now())`,
      [tokenHash, owner.id],
    );

    const response = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ cookie: `co_session=${token}` }),
    });

    expect(response.statusCode).toBe(401);
  });

  it('legacy 永遠不可用：資料庫拒絕「未撤銷的 legacy」', async () => {
    const owner = await setupOwner();

    await expect(
      built.db.pool.query(
        `insert into auth_session (token_hash, user_id, entry, expires_at)
         values ('legacy-not-revoked', $1, 'legacy', now() + interval '1 day')`,
        [owner.id],
      ),
    ).rejects.toThrow();
  });

  it('未知的 entry 值寫不進資料庫', async () => {
    const owner = await setupOwner();

    await expect(
      built.db.pool.query(
        `insert into auth_session (token_hash, user_id, entry, expires_at)
         values ('weird-entry', $1, 'intranet', now() + interval '1 day')`,
        [owner.id],
      ),
    ).rejects.toThrow();
  });

  it('已停用的身份與已撤銷的 session 都回 401', async () => {
    const owner = await setupOwner();

    await built.db.pool.query('update app_user set disabled_at = now() where id = $1', [owner.id]);

    const disabled = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ cookie: owner.cookie }),
    });

    expect(disabled.statusCode).toBe(401);

    await built.db.pool.query('update app_user set disabled_at = null where id = $1', [owner.id]);
    await built.db.pool.query('update auth_session set revoked_at = now() where revoked_at is null');

    const revoked = await built.injectRaw({
      method: 'GET',
      url: '/me',
      headers: trusted({ cookie: owner.cookie }),
    });

    expect(revoked.statusCode).toBe(401);
  });
});

describe('policy 由服務端 context 取入口', () => {
  it('internal session 不可以通過 customer app 的規則（真 HTTP 到 policy）', async () => {
    const owner = await setupOwner();

    const customerApp = await built.injectRaw({
      method: 'GET',
      url: '/app-grants/access/portal',
      headers: trusted({ cookie: owner.cookie }),
    });

    expect(customerApp.statusCode).toBe(200);
    expect(customerApp.json()).toEqual({ allowed: false, reason: 'entry_not_allowed' });
  });

  it('internal app 由 internal 入口進入就照常放行（老闆憑身份）', async () => {
    const owner = await setupOwner();

    const internalApp = await built.injectRaw({
      method: 'GET',
      url: '/app-grants/access/sales',
      headers: trusted({ cookie: owner.cookie }),
    });

    expect(internalApp.statusCode).toBe(200);
    expect(internalApp.json()).toEqual({ allowed: true, via: 'owner' });
  });

  it('未登入（但入口可信）仍然是 401，不是 policy 的 403', async () => {
    const response = await built.injectRaw({
      method: 'GET',
      url: '/app-grants/access/sales',
      headers: trusted(),
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('既有保護沒有退化', () => {
  it('Origin 與 Host 不同仍然 403 bad_origin（即使憑證正確）', async () => {
    const response = await built.injectRaw({
      method: 'POST',
      url: '/auth/login',
      headers: trusted({ origin: 'https://evil.example', host: 'localhost:4420' }),
      payload: { email: 'nobody@example.com', password: 'whatever-long-enough' },
    });

    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: string }).error).toBe('bad_origin');
  });

  it('登入失敗限流仍然生效（第 6 次 429）', async () => {
    await setupOwner();
    const email = `nobody-${randomBytes(4).toString('hex')}@example.com`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await built.injectRaw({
        method: 'POST',
        url: '/auth/login',
        headers: trusted(),
        payload: { email, password: 'wrong-but-long-enough' },
      });

      expect(failed.statusCode, `第 ${attempt + 1} 次`).toBe(401);
    }

    const locked = await built.injectRaw({
      method: 'POST',
      url: '/auth/login',
      headers: trusted(),
      payload: { email, password: 'wrong-but-long-enough' },
    });

    expect(locked.statusCode).toBe(429);
  });

  it('#86 的重設規則仍然生效：老闆密碼錯 403、對自己重設 409', async () => {
    const owner = await setupOwner();

    const wrongPassword = await built.injectRaw({
      method: 'POST',
      url: `/staff/${owner.id}/reset-password`,
      headers: trusted({ cookie: owner.cookie }),
      payload: {
        ownerPassword: 'definitely-not-the-owner-password',
        newTemporaryPassword: randomBytes(18).toString('base64url'),
      },
    });

    expect(wrongPassword.statusCode).toBe(403);
    expect((wrongPassword.json() as { error: string }).error).toBe('invalid_owner_password');

    const selfReset = await built.injectRaw({
      method: 'POST',
      url: `/staff/${owner.id}/reset-password`,
      headers: trusted({ cookie: owner.cookie }),
      payload: {
        ownerPassword: owner.password,
        newTemporaryPassword: randomBytes(18).toString('base64url'),
      },
    });

    expect(selfReset.statusCode).toBe(409);
    expect((selfReset.json() as { error: string }).error).toBe('owner_protected');
  });
});

describe('憑證不外洩', () => {
  it('任何回應的標頭與內容都沒有憑證原文', async () => {
    const owner = await setupOwner();

    const responses = await Promise.all([
      built.injectRaw({ method: 'GET', url: '/me', headers: trusted({ cookie: owner.cookie }) }),
      built.injectRaw({ method: 'GET', url: '/me' }),
      built.injectRaw({ method: 'GET', url: '/auth/state', headers: trusted() }),
      built.injectRaw({ method: 'GET', url: '/auth/state' }),
    ]);

    for (const response of responses) {
      expect(JSON.stringify(response.headers)).not.toContain(TOKEN);
      expect(response.body).not.toContain(TOKEN);
    }
  });

  it('審計紀錄沒有任何欄位含憑證原文', async () => {
    await setupOwner();

    const rows = await built.db.pool.query('select * from audit_log');

    expect(rows.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows.rows)).not.toContain(TOKEN);
  });
});

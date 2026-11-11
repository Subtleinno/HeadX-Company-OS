import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { migrate } from '../../src/migrate';
import { loadModules } from '../../src/modules/registry';
import { registerStaff } from '../../src/staff/index';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * POST /staff 帶部門（issue #28）。
 *
 * C92 的原話是「建立時就要選部門」。舊做法是建立完之後在名單上再指派一次，
 * 那會留下一個中間狀態：員工已經存在但沒有部門。短暫的中間狀態在後台看不出問題，
 * 但對那個員工來說就是「我登入之後被擋住」。所以建立與指派壓成同一個請求。
 *
 * 用真的 Postgres 與 repo 內真的 manifest：部門 key 是不是 registry 那一份，
 * 是這一張要證明的事。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const appsDir = resolve(process.cwd(), 'apps');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

function cookieHeader(response: { headers: Record<string, unknown> }): { cookie: string } {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string') {
    throw new Error('回應沒有 Set-Cookie');
  }

  return { cookie: value.split(';')[0] ?? '' };
}

describe('POST /staff 帶部門', () => {
  let db: TempDatabase;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    app = buildServer({ checkDb: ok, checkStorage: ok });
    registerAuth(app, {
      pool: db.pool,
      loginHashKey: 'test-only-login-hash-key-0123456789abcdef',
      resolveEntry: () => 'internal',
    });
    registerStaff(app, { pool: db.pool, hashRun: (task) => task(), registry: loadModules(appsDir) });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function setupOwner(): Promise<{ cookie: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password: randomPassword() },
    });

    expect(response.statusCode).toBe(201);

    return cookieHeader(response);
  }

  function createPayload(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      displayName: '陳大文',
      email: `staff-${randomBytes(4).toString('hex')}@example.com`,
      initialPassword: randomPassword(),
      ...extra,
    };
  }

  async function countStaff(): Promise<number> {
    const rows = await db.pool.query<{ n: number }>(
      "select count(*)::int as n from app_user where role = 'staff'",
    );

    return rows.rows[0]?.n ?? -1;
  }

  it('帶一個存在的部門：201，回應與資料庫都是那個部門', async () => {
    const { cookie } = await setupOwner();
    const payload = createPayload({ department: 'design' });

    const response = await app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie },
      payload,
    });

    expect(response.statusCode).toBe(201);

    const staff = (response.json() as { staff: { id: string; department: string | null } }).staff;

    // 回應要有部門：否則前端建立完仍然要重讀一次才知道落在哪。
    expect(staff.department).toBe('design');

    const rows = await db.pool.query<{ department: string | null }>(
      'select department from app_user where id = $1',
      [staff.id],
    );

    expect(rows.rows[0]?.department).toBe('design');
  });

  it('完全不帶 department：201，department 是 null（舊呼叫端仍然有效）', async () => {
    const { cookie } = await setupOwner();
    const payload = createPayload({});

    const response = await app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie },
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { staff: { department: string | null } }).staff.department).toBe(
      null,
    );
  });

  it('明確帶 null：201，department 是 null', async () => {
    const { cookie } = await setupOwner();
    const payload = createPayload({ department: null });

    const response = await app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie },
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { staff: { department: string | null } }).staff.department).toBe(
      null,
    );
  });

  it('部門唔存在：400 unknown_department，而且一個人都冇建立', async () => {
    const { cookie } = await setupOwner();
    const before = await countStaff();
    const payload = createPayload({ department: 'nope' });

    const response = await app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('unknown_department');

    // 「拒絕」不可以留下半個人：帳戶建立了但部門冇設定，就是一個登入即被擋的人。
    expect(await countStaff()).toBe(before);
  });

  it('空字串不是「未指派」：400，不會靜靜變成 null', async () => {
    const { cookie } = await setupOwner();
    const before = await countStaff();
    const payload = createPayload({ department: '   ' });

    const response = await app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie },
      payload,
    });

    expect(response.statusCode).toBe(422);
    expect(await countStaff()).toBe(before);
  });

  it('department 不是字串：422，不會被當成 null 收貨', async () => {
    const { cookie } = await setupOwner();
    const payload = createPayload({ department: 42 });

    const response = await app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie },
      payload,
    });

    expect(response.statusCode).toBe(422);
  });

  it('建立了帶部門的員工之後，佢登入就落在該部門（真的走一次 /auth/state）', async () => {
    const { cookie } = await setupOwner();
    const payload = createPayload({ department: 'design' });

    const created = await app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie },
      payload,
    });

    expect(created.statusCode).toBe(201);

    // 員工第一次登入要改密碼，所以先改，再看 /auth/state 有沒有帶部門。
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: payload.email, password: payload.initialPassword },
    });

    expect(login.statusCode).toBe(200);

    const { cookie: staffCookie } = cookieHeader(login);

    const changed = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie: staffCookie },
      payload: {
        currentPassword: payload.initialPassword,
        newPassword: randomPassword(),
      },
    });

    expect(changed.statusCode).toBe(200);

    // 改密碼會輪替 session（舊 cookie 即刻失效），所以要用回應新發的那一個。
    const { cookie: rotated } = cookieHeader(changed);

    const state = await app.inject({
      method: 'GET',
      url: '/auth/state',
      headers: { cookie: rotated },
    });

    expect(state.statusCode).toBe(200);
    expect((state.json() as { user: { department: string | null } }).user.department).toBe('design');
  });
});

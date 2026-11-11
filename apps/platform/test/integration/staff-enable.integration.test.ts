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
 * POST /staff/:id/enable（issue #30）。
 *
 * 停用是單程的話，產品就是壞的：按錯人、或者同事放假回來，老闆只能另開一個
 * 新帳戶，舊 email 一直被佔住，審計也斷成兩截。這一張要證明的是「回頭路真的
 * 通」，不是「有個 200」：
 *
 *   1. 恢復之後，那個人**真的**可以用原本的密碼登入（不是只有資料庫看起來對）。
 *   2. 恢復不會改密碼、不會悄悄幫他開 session。
 *   3. 三種失敗各有自己的原因（沒停用／不存在／老闆），畫面才講得出真話。
 *   4. 審計留得住「停了幾久」，日後查得到。
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

describe('POST /staff/:id/enable', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let ownerCookie: string;
  let ownerId: string;
  let staffId: string;
  let staffEmail: string;
  let staffPassword: string;

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

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password: randomPassword() },
    });

    expect(setup.statusCode).toBe(201);

    const owner = cookieHeader(setup);
    ownerCookie = owner.cookie;

    const state = await app.inject({
      method: 'GET',
      url: '/auth/state',
      headers: { cookie: ownerCookie },
    });

    ownerId = (state.json() as { user: { id: string } }).user.id;

    staffEmail = `staff-${randomBytes(4).toString('hex')}@example.com`;
    staffPassword = randomPassword();

    const created = await app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie: ownerCookie },
      payload: {
        displayName: '陳大文',
        email: staffEmail,
        initialPassword: staffPassword,
        department: 'design',
      },
    });

    expect(created.statusCode).toBe(201);

    staffId = (created.json() as { staff: { id: string } }).staff.id;
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function disable(): Promise<void> {
    const response = await app.inject({
      method: 'POST',
      url: `/staff/${staffId}/disable`,
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(200);
  }

  async function enable(id = staffId): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const response = await app.inject({
      method: 'POST',
      url: `/staff/${id}/enable`,
      headers: { cookie: ownerCookie },
    });

    return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
  }

  async function disabledAtOf(id: string): Promise<Date | null> {
    const rows = await db.pool.query<{ disabled_at: Date | null }>(
      'select disabled_at from app_user where id = $1',
      [id],
    );

    return rows.rows[0]?.disabled_at ?? null;
  }

  it('停用之後恢復：200，回應與資料庫的 disabledAt 都變回 null', async () => {
    await disable();
    expect(await disabledAtOf(staffId)).not.toBeNull();

    const result = await enable();

    expect(result.statusCode).toBe(200);

    const staff = result.body.staff as { id: string; disabledAt: string | null; department: string | null };

    // 回應要帶 department：畫面靠它決定「恢復之後他有沒有畫面」，重讀一次才知太慢。
    expect(staff.disabledAt).toBeNull();
    expect(staff.department).toBe('design');
    expect(await disabledAtOf(staffId)).toBeNull();
  });

  it('恢復之後真的可以用原本的密碼登入（不是只有資料庫看起來對）', async () => {
    await disable();

    // 停用期間登入要被拒 —— 否則這一張後面的斷言就證明不了任何事。
    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: staffEmail, password: staffPassword },
    });

    expect(blocked.statusCode).not.toBe(200);

    const result = await enable();

    expect(result.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: staffEmail, password: staffPassword },
    });

    expect(login.statusCode).toBe(200);
    expect((login.json() as { user: { department: string | null } }).user.department).toBe('design');
  });

  it('恢復不改密碼、也不悄悄開 session', async () => {
    const before = await db.pool.query<{ password_hash: string; must_change_password: boolean }>(
      'select password_hash, must_change_password from app_user where id = $1',
      [staffId],
    );

    await disable();

    const result = await enable();

    expect(result.statusCode).toBe(200);

    const after = await db.pool.query<{ password_hash: string; must_change_password: boolean }>(
      'select password_hash, must_change_password from app_user where id = $1',
      [staffId],
    );

    expect(after.rows[0]?.password_hash).toBe(before.rows[0]?.password_hash);
    // 原本就要改密碼的人，恢復之後仍然要改：恢復不是「重設」。
    expect(after.rows[0]?.must_change_password).toBe(true);

    // 沒有任何 session 被這個請求簽發出來。
    const sessions = await db.pool.query<{ n: number }>(
      'select count(*)::int as n from auth_session where user_id = $1',
      [staffId],
    );

    expect(sessions.rows[0]?.n).toBe(0);
  });

  it('本來就沒有停用：409 not_disabled，不會寫多一筆審計', async () => {
    const before = await countAudit('staff.enable');

    const result = await enable();

    expect(result.statusCode).toBe(409);
    expect(result.body.error).toBe('not_disabled');
    expect(await countAudit('staff.enable')).toBe(before);
  });

  it('兩次恢復：第二次 409，審計只有一筆（撞在一起也只算一次）', async () => {
    await disable();

    const first = await enable();
    const second = await enable();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(second.body.error).toBe('not_disabled');
    expect(await countAudit('staff.enable')).toBe(1);
  });

  it('帳戶不存在：404，不會假裝成功', async () => {
    const result = await enable('00000000-0000-4000-8000-000000000000');

    expect(result.statusCode).toBe(404);
    expect(result.body.error).toBe('not_found');
  });

  it('id 不是 uuid：422，不會拿去查資料庫', async () => {
    const result = await enable('not-a-uuid');

    expect(result.statusCode).toBe(422);
  });

  it('老闆帳戶：409 owner_protected（停用與恢復都不在老闆身上發生）', async () => {
    const result = await enable(ownerId);

    expect(result.statusCode).toBe(409);
    expect(result.body.error).toBe('owner_protected');
  });

  it('員工不可以恢復自己或別人：403，沒有任何改動', async () => {
    await disable();

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: staffEmail, password: staffPassword },
    });

    expect(login.statusCode).not.toBe(200);

    // 用未停用的另一個員工去試，才真的證明「非老闆」被擋，而不是「停用的人登入不到」。
    const otherEmail = `other-${randomBytes(4).toString('hex')}@example.com`;
    const otherPassword = randomPassword();

    const other = await app.inject({
      method: 'POST',
      url: '/staff',
      headers: { cookie: ownerCookie },
      payload: {
        displayName: '另一個人',
        email: otherEmail,
        initialPassword: otherPassword,
        department: 'design',
      },
    });

    expect(other.statusCode).toBe(201);

    const otherLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: otherEmail, password: otherPassword },
    });

    expect(otherLogin.statusCode).toBe(200);

    const { cookie: firstCookie } = cookieHeader(otherLogin);

    // 先改密碼，才真的走到角色檢查；否則擋住他的是「要先改密碼」，
    // 這一條就證明不了「員工不可以恢復別人」。
    const changed = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie: firstCookie },
      payload: { currentPassword: otherPassword, newPassword: randomPassword() },
    });

    expect(changed.statusCode).toBe(200);

    const { cookie: otherCookie } = cookieHeader(changed);

    const response = await app.inject({
      method: 'POST',
      url: `/staff/${staffId}/enable`,
      headers: { cookie: otherCookie },
    });

    expect(response.statusCode).toBe(403);
    expect(await disabledAtOf(staffId)).not.toBeNull();
  });

  it('審計寫得入：actor、action、target 與「停用了幾久」的起點都在', async () => {
    await disable();

    const disabledAt = await disabledAtOf(staffId);

    const result = await enable();

    expect(result.statusCode).toBe(200);

    const rows = await db.pool.query<{
      actor_type: string;
      actor_id: string;
      action: string;
      target: string;
      detail: { wasDisabledSince?: string; sessionsRevoked?: boolean };
    }>("select actor_type, actor_id, action, target, detail from audit_log where action = 'staff.enable'");

    expect(rows.rows).toHaveLength(1);

    const entry = rows.rows[0];

    expect(entry?.actor_type).toBe('human');
    expect(entry?.actor_id).toBe(ownerId);
    expect(entry?.target).toBe(staffId);
    expect(entry?.detail.wasDisabledSince).toBe(disabledAt?.toISOString());
    // 恢復沒有撤銷任何 session（停用時已撤銷），審計不可以寫反話。
    expect(entry?.detail.sessionsRevoked).toBe(false);
  });

  async function countAudit(action: string): Promise<number> {
    const rows = await db.pool.query<{ n: number }>(
      'select count(*)::int as n from audit_log where action = $1',
      [action],
    );

    return rows.rows[0]?.n ?? -1;
  }
});

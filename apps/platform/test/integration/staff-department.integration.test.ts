import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { migrate } from '../../src/migrate';
import { loadModules } from '../../src/modules/registry';
import { registerStaff } from '../../src/staff/index';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * PATCH /staff/:id/department（issue #12）。
 *
 * 用真的 Postgres（`co_test_<隨機>`）與 repo 內真的 manifest：
 * 部門清單是不是 registry 那一份，是這一張要證明的事，用假 registry 等於
 * 自己證明自己。正式資料庫由頭到尾不插任何列。
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

describe('PATCH /staff/:id/department', () => {
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

  async function setupOwner(): Promise<{ cookie: string; id: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password: randomPassword() },
    });

    if (response.statusCode !== 201) {
      throw new Error(`setup 失敗：${response.statusCode} ${response.body}`);
    }

    const rows = await db.pool.query<{ id: string }>(
      "select id from app_user where role = 'owner'",
    );

    const id = rows.rows[0]?.id;

    if (id === undefined) {
      throw new Error('setup 之後找不到老闆');
    }

    return { ...cookieHeader(response), id };
  }

  /** 經 API 建立的員工（must_change_password = true，符合產品流程）。 */
  async function createStaff(owner: { cookie: string }): Promise<{ id: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/staff',
      headers: owner,
      payload: {
        displayName: '阿明',
        email: 'ming@example.com',
        initialPassword: randomPassword(),
      },
    });

    if (response.statusCode !== 201) {
      throw new Error(`建立員工失敗：${response.statusCode} ${response.body}`);
    }

    return { id: response.json().staff.id as string };
  }

  /** 直接落 DB 造一個「已改密碼、可以行 requireOwner」的員工 session。 */
  async function staffSession(): Promise<{ cookie: string; id: string }> {
    const inserted = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash, must_change_password)
       values ('staff@example.com', '員工', 'staff', null, $1, false)
       returning id`,
      [await hashPassword(randomPassword())],
    );

    const id = inserted.rows[0]?.id;

    if (id === undefined) {
      throw new Error('插入員工之後沒有回傳 id');
    }

    const token = createSessionToken();

    await db.pool.query(
      "insert into auth_session (token_hash, user_id, expires_at, entry) values ($1, $2, $3, 'internal')",
      [hashSessionToken(token), id, new Date(Date.now() + 24 * 60 * 60 * 1000)],
    );

    return { cookie: `co_session=${token}`, id };
  }

  async function auditRows(): Promise<{ action: string; detail: Record<string, unknown> }[]> {
    const rows = await db.pool.query<{ action: string; detail: Record<string, unknown> }>(
      "select action, detail from audit_log where action = 'staff.department_changed'",
    );

    return rows.rows;
  }

  it('未登入：401 not_signed_in', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/staff/00000000-0000-4000-8000-000000000000/department',
      payload: { department: 'design' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'not_signed_in' });
  });

  it('員工（非老闆）：403 forbidden', async () => {
    await setupOwner();
    const staff = await staffSession();

    const response = await app.inject({
      method: 'PATCH',
      url: `/staff/${staff.id}/department`,
      headers: { cookie: staff.cookie },
      payload: { department: 'design' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'forbidden' });
  });

  it('指派成功：回應與 GET /staff 都見到部門，審計有一筆 from → to', async () => {
    const owner = await setupOwner();
    const staff = await createStaff(owner);

    const response = await app.inject({
      method: 'PATCH',
      url: `/staff/${staff.id}/department`,
      headers: owner,
      payload: { department: 'design' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().staff).toMatchObject({ id: staff.id, department: 'design' });

    const list = await app.inject({ method: 'GET', url: '/staff', headers: owner });

    expect(list.json().staff).toEqual([
      expect.objectContaining({ id: staff.id, department: 'design' }),
    ]);

    const audits = await auditRows();

    expect(audits).toHaveLength(1);
    expect(audits[0]?.detail).toEqual({ from: null, to: 'design' });
  });

  it('取消指派：null 是合法值', async () => {
    const owner = await setupOwner();
    const staff = await createStaff(owner);

    await app.inject({
      method: 'PATCH',
      url: `/staff/${staff.id}/department`,
      headers: owner,
      payload: { department: 'design' },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/staff/${staff.id}/department`,
      headers: owner,
      payload: { department: null },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().staff.department).toBeNull();
    expect(await auditRows()).toHaveLength(2);
  });

  it('同一個部門再送一次：200，但不再寫審計（沒有發生的事不留紀錄）', async () => {
    const owner = await setupOwner();
    const staff = await createStaff(owner);
    const payload = { department: 'design' };

    await app.inject({
      method: 'PATCH',
      url: `/staff/${staff.id}/department`,
      headers: owner,
      payload,
    });

    const again = await app.inject({
      method: 'PATCH',
      url: `/staff/${staff.id}/department`,
      headers: owner,
      payload,
    });

    expect(again.statusCode).toBe(200);
    expect(await auditRows()).toHaveLength(1);
  });

  it('未知部門：400 unknown_department（不是靜靜接受）', async () => {
    const owner = await setupOwner();
    const staff = await createStaff(owner);

    const response = await app.inject({
      method: 'PATCH',
      url: `/staff/${staff.id}/department`,
      headers: owner,
      payload: { department: 'warehouse' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'unknown_department', department: 'warehouse' });

    const rows = await db.pool.query<{ department: string | null }>(
      'select department from app_user where id = $1',
      [staff.id],
    );

    expect(rows.rows[0]?.department).toBeNull();
    expect(await auditRows()).toHaveLength(0);
  });

  it('body 形狀不對：422，並講出原因', async () => {
    const owner = await setupOwner();
    const staff = await createStaff(owner);

    for (const payload of [{}, { department: '' }, { department: 'design', role: 'owner' }]) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/staff/${staff.id}/department`,
        headers: owner,
        payload,
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error).toBe('invalid_input');
    }
  });

  it('對老闆自己：400 owner_protected', async () => {
    const owner = await setupOwner();

    const response = await app.inject({
      method: 'PATCH',
      url: `/staff/${owner.id}/department`,
      headers: { cookie: owner.cookie },
      payload: { department: 'design' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'owner_protected' });
  });

  it('找不到這個人：404 not_found', async () => {
    const owner = await setupOwner();

    const response = await app.inject({
      method: 'PATCH',
      url: '/staff/00000000-0000-4000-8000-000000000000/department',
      headers: owner,
      payload: { department: 'design' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found' });
  });

  /**
   * 指派部門是為了令那個人「登入之後直接去自己的部門」（issue #14）。
   * 所以這一張要證明的不只是 database 有一欄，而是 `/auth/state` 真的
   * 講得出它 —— 前端就是靠這一個欄位決定落點。
   */
  it('員工再讀 /auth/state 時，回應帶著他的部門（登入落點靠這個欄位）', async () => {
    const owner = await setupOwner();
    const session = await staffSession();

    const patched = await app.inject({
      method: 'PATCH',
      url: `/staff/${session.id}/department`,
      headers: owner,
      payload: { department: 'design' },
    });

    expect(patched.statusCode).toBe(200);

    const state = await app.inject({ method: 'GET', url: '/auth/state', headers: session });

    expect(state.statusCode).toBe(200);
    expect(state.json().user).toMatchObject({ role: 'staff', department: 'design' });
  });

  it('老闆自己的 department 永遠是 null（Boss Portal 唔屬任何部門）', async () => {
    const owner = await setupOwner();

    const state = await app.inject({ method: 'GET', url: '/auth/state', headers: owner });

    expect(state.json().user).toMatchObject({ role: 'owner', department: null });
  });
});

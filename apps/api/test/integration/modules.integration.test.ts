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
import { registerModules } from '../../src/modules/routes';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * GET /modules：誰見到哪些模組。
 * 用真的 Postgres（co_test_<隨機>）但模組清單讀 repo 內的 modules/，不是假資料。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const modulesDir = resolve(process.cwd(), 'modules');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

const BOSS_EMAIL = 'boss@example.com';

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

describe('GET /modules', () => {
  let db: TempDatabase;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    app = buildServer({ checkDb: ok, checkStorage: ok });
    registerAuth(app, { pool: db.pool, loginHashKey: 'test-only-login-hash-key-0123456789abcdef' });
    registerModules(app, { registry: loadModules(modulesDir), pool: db.pool });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function setupOwner(): Promise<{ cookie: { cookie: string } }> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: BOSS_EMAIL, password: randomPassword() },
    });

    if (response.statusCode !== 201) {
      throw new Error(`setup 失敗：${response.statusCode} ${response.body}`);
    }

    return { cookie: cookieHeader(response) };
  }

  async function staffCookie(department: string | null): Promise<{ cookie: string }> {
    const passwordHash = await hashPassword(randomPassword());
    const inserted = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash)
       values ($1, '員工', 'staff', $2, $3)
       returning id`,
      [`staff-${department ?? 'none'}@example.com`, department, passwordHash],
    );

    const token = createSessionToken();
    await db.pool.query(
      'insert into auth_session (token_hash, user_id, expires_at) values ($1, $2, $3)',
      [
        hashSessionToken(token),
        inserted.rows[0]?.id,
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      ],
    );

    return { cookie: `co_session=${token}` };
  }

  it('未登入：401 not_signed_in', async () => {
    const response = await app.inject({ method: 'GET', url: '/modules' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'not_signed_in' });
  });

  it('老闆：六個模組，依 order 排序', async () => {
    const owner = await setupOwner();
    const response = await app.inject({ method: 'GET', url: '/modules', headers: owner.cookie });

    expect(response.statusCode).toBe(200);
    expect(response.json().modules.map((item: { id: string }) => item.id)).toEqual([
      'boss',
      'design',
      'sales',
      'ops_finance',
      'hr',
      'support',
    ]);
  });

  it('回應只有六個欄位，不含檔案路徑', async () => {
    const owner = await setupOwner();
    const response = await app.inject({ method: 'GET', url: '/modules', headers: owner.cookie });
    const modules = response.json().modules as Record<string, unknown>[];

    expect(Object.keys(modules[0] ?? {}).sort()).toEqual([
      'available',
      'department',
      'id',
      'kind',
      'order',
      'title',
    ]);

    expect(response.body).not.toContain('manifest.json');
    expect(response.body).not.toContain('/app/modules');
    expect(response.body).not.toContain(modulesDir.replace(/\\/g, '/'));
  });

  it('design 員工：只見 design，看不到老闆台', async () => {
    await setupOwner();
    const staff = await staffCookie('design');

    const response = await app.inject({ method: 'GET', url: '/modules', headers: staff });

    expect(response.statusCode).toBe(200);
    expect(response.json().modules).toEqual([
      {
        id: 'design',
        title: '設計／內容／網站',
        kind: 'department',
        department: 'design',
        order: 10,
        available: false,
      },
    ]);
  });

  it('sales 員工：只見 sales', async () => {
    await setupOwner();
    const staff = await staffCookie('sales');

    const response = await app.inject({ method: 'GET', url: '/modules', headers: staff });

    expect(response.json().modules.map((item: { id: string }) => item.id)).toEqual(['sales']);
  });

  it('員工的 department 沒有對應模組：空陣列，不是全部', async () => {
    await setupOwner();
    const staff = await staffCookie('warehouse');

    const response = await app.inject({ method: 'GET', url: '/modules', headers: staff });

    expect(response.statusCode).toBe(200);
    expect(response.json().modules).toEqual([]);
  });

  it('員工沒有 department：空陣列', async () => {
    await setupOwner();
    const staff = await staffCookie(null);

    const response = await app.inject({ method: 'GET', url: '/modules', headers: staff });

    expect(response.json().modules).toEqual([]);
  });
});

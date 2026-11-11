import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { registerDirectory } from '../../src/directory/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * POST /brands 只有老闆可以（issue #19）。
 *
 * 前端已經收起表單，但「見唔到」唔等於「做唔到」：真正的閘在後端。
 * 這一張證明三件事：
 *   1. 員工送得上來都 403（不是 201，也不是靜靜回一個空品牌）。
 *   2. 403 之後資料庫真的一條新品牌都冇。
 *   3. 老闆照樣開得成 —— 閘不可以連老闆都擋。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
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

describe('POST /brands 只有老闆', () => {
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
    registerDirectory(app, { pool: db.pool });

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

    if (response.statusCode !== 201) {
      throw new Error(`setup 失敗：${response.statusCode} ${response.body}`);
    }

    return cookieHeader(response);
  }

  async function staffSession(): Promise<{ cookie: string }> {
    const inserted = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash, must_change_password)
       values ('ming@example.com', '阿明', 'staff', 'design', $1, false)
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

    return { cookie: `co_session=${token}` };
  }

  async function brandCount(): Promise<number> {
    const rows = await db.pool.query<{ n: number }>('select count(*)::int as n from brand');

    return rows.rows[0]?.n ?? -1;
  }

  it('未登入：401，冇建立任何品牌', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/brands',
      payload: { code: 'moonic', name: 'Moonic' },
    });

    expect(response.statusCode).toBe(401);
    expect(await brandCount()).toBe(0);
  });

  it('員工：403 forbidden，而且真的一條新品牌都冇', async () => {
    await setupOwner();
    const staff = await staffSession();

    const response = await app.inject({
      method: 'POST',
      url: '/brands',
      headers: { cookie: staff.cookie },
      payload: { code: 'moonic', name: 'Moonic' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'forbidden' });
    expect(await brandCount()).toBe(0);
  });

  it('老闆：201，品牌真的寫入', async () => {
    const owner = await setupOwner();

    const response = await app.inject({
      method: 'POST',
      url: '/brands',
      headers: { cookie: owner.cookie },
      payload: { code: 'moonic', name: 'Moonic' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().item).toMatchObject({ code: 'moonic', name: 'Moonic' });
    expect(await brandCount()).toBe(1);
  });
});

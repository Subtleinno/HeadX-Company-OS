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
 * GET／PUT /me/brand-focus（issue #15）。
 *
 * 用真的 Postgres 與真的 `brand` 表：這一張要證明的是「寫入的是自己那一行、
 * 而且一定指向一個存在的品牌」，用假 store 等於自己證明自己。
 *
 * 最重要的一條不是 200，而是**唔可以寫別人那一行**：請求裡面冇 user id，
 * 寫邊個由 session 決定。所以下面有一個測試是「兩個人各寫各的」，
 * 以及一個「body 順便夾帶 userId 也沒有用」。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

const MISSING_BRAND = '00000000-0000-4000-8000-000000000000';

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

describe('/me/brand-focus', () => {
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

  async function createBrand(code: string, name: string): Promise<string> {
    const result = await db.pool.query<{ id: string }>(
      'insert into brand (code, name) values ($1, $2) returning id',
      [code, name],
    );

    const id = result.rows[0]?.id;

    if (id === undefined) {
      throw new Error('建立品牌之後讀唔返 id');
    }

    return id;
  }

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

  /** 直接落 DB 造一個可以行 requireUser 的員工 session（免登入流程）。 */
  async function staffSession(email: string): Promise<{ cookie: string; id: string }> {
    const inserted = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash, must_change_password)
       values ($1, '員工', 'staff', 'design', $2, false)
       returning id`,
      [email, await hashPassword(randomPassword())],
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

  it('未登入：401', async () => {
    const response = await app.inject({ method: 'GET', url: '/me/brand-focus' });

    expect(response.statusCode).toBe(401);
  });

  it('第一次：null（唔會替人揀一個品牌）', async () => {
    await setupOwner();
    const staff = await staffSession('ming@example.com');

    const response = await app.inject({
      method: 'GET',
      url: '/me/brand-focus',
      headers: { cookie: staff.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ brandId: null });
  });

  it('寫入之後讀得返：同一個品牌', async () => {
    await setupOwner();
    const staff = await staffSession('ming@example.com');
    const brandId = await createBrand('moonic', 'Moonic');

    const written = await app.inject({
      method: 'PUT',
      url: '/me/brand-focus',
      headers: { cookie: staff.cookie },
      payload: { brandId },
    });

    expect(written.statusCode).toBe(200);
    expect(written.json()).toEqual({ brandId });

    const read = await app.inject({
      method: 'GET',
      url: '/me/brand-focus',
      headers: { cookie: staff.cookie },
    });

    expect(read.json()).toEqual({ brandId });
  });

  it('再寫一次：覆蓋同一個人的那一行，唔會多一列', async () => {
    await setupOwner();
    const staff = await staffSession('ming@example.com');
    const first = await createBrand('moonic', 'Moonic');
    const second = await createBrand('hxdesign', 'HX Design');

    for (const brandId of [first, second]) {
      await app.inject({
        method: 'PUT',
        url: '/me/brand-focus',
        headers: { cookie: staff.cookie },
        payload: { brandId },
      });
    }

    const rows = await db.pool.query<{ count: number }>(
      'select count(*)::int as count from user_brand_focus',
    );

    expect(rows.rows[0]?.count).toBe(1);
  });

  /**
   * 兩層意思都要成立：
   *   1. A 寫完，B 讀到的仍然是 null（唔會共用一行）。
   *   2. body 夾帶 userId 也沒有用 —— 寫邊個只由 session 決定。
   */
  it('兩個人各寫各的；body 夾帶 userId 都改不了別人', async () => {
    await setupOwner();
    const a = await staffSession('a@example.com');
    const b = await staffSession('b@example.com');
    const brandId = await createBrand('moonic', 'Moonic');

    await app.inject({
      method: 'PUT',
      url: '/me/brand-focus',
      headers: { cookie: a.cookie },
      payload: { brandId, userId: b.id },
    });

    const bRead = await app.inject({
      method: 'GET',
      url: '/me/brand-focus',
      headers: { cookie: b.cookie },
    });

    expect(bRead.json()).toEqual({ brandId: null });

    const rows = await db.pool.query<{ user_id: string }>(
      'select user_id from user_brand_focus',
    );

    expect(rows.rows).toEqual([{ user_id: a.id }]);
  });

  it('品牌唔存在：400 unknown_brand，而且乜都冇寫', async () => {
    await setupOwner();
    const staff = await staffSession('ming@example.com');

    const response = await app.inject({
      method: 'PUT',
      url: '/me/brand-focus',
      headers: { cookie: staff.cookie },
      payload: { brandId: MISSING_BRAND },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'unknown_brand', brandId: MISSING_BRAND });

    const rows = await db.pool.query<{ count: number }>(
      'select count(*)::int as count from user_brand_focus',
    );

    expect(rows.rows[0]?.count).toBe(0);
  });

  it('body 形狀不對：400 invalid_input（uuid 都唔似）', async () => {
    await setupOwner();
    const staff = await staffSession('ming@example.com');

    for (const payload of [{}, { brandId: '' }, { brandId: 'moonic' }, { brandId: 42 }]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/me/brand-focus',
        headers: { cookie: staff.cookie },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('invalid_input');
    }
  });

  it('老闆都可以有自己的 focus（員工區的畫面一樣要記住）', async () => {
    const owner = await setupOwner();
    const brandId = await createBrand('moonic', 'Moonic');

    const written = await app.inject({
      method: 'PUT',
      url: '/me/brand-focus',
      headers: { cookie: owner.cookie },
      payload: { brandId },
    });

    expect(written.statusCode).toBe(200);

    const read = await app.inject({
      method: 'GET',
      url: '/me/brand-focus',
      headers: { cookie: owner.cookie },
    });

    expect(read.json()).toEqual({ brandId });
  });

  /** 品牌被刪（例如清理誤建的品牌）之後，focus 唔應該指向一個唔存在的 id。 */
  it('品牌被刪：讀返 null，而唔係一個死 id', async () => {
    await setupOwner();
    const staff = await staffSession('ming@example.com');
    const brandId = await createBrand('moonic', 'Moonic');

    await app.inject({
      method: 'PUT',
      url: '/me/brand-focus',
      headers: { cookie: staff.cookie },
      payload: { brandId },
    });

    await db.pool.query('delete from user_brand_focus where brand_id = $1', [brandId]);
    await db.pool.query('delete from brand where id = $1', [brandId]);

    const read = await app.inject({
      method: 'GET',
      url: '/me/brand-focus',
      headers: { cookie: staff.cookie },
    });

    expect(read.json()).toEqual({ brandId: null });
  });
});

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { registerBrandGuide } from '../../src/brand-guide/index';
import { registerBrandSets } from '../../src/brand-sets/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 範圍層 Prompt（`brand_guide_prompt`）：品牌總覽、品牌集、單一階段。
 *
 * 這裡要證明四件容易寫錯的事：
 *   1. 自訂版本真的存得返（否則「可以改」只是畫面騙人）；
 *   2. 兩個品牌集各自一份 —— 同一段 prompt 唔會互相覆蓋；
 *   3. scope 與 setId 不匹配就 400（寧可講錯，不要靜靜寫入無人讀到的位置）；
 *   4. 只有品牌編輯者寫得入（員工 403），讀也要登入（未登入 401）。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

function cookieHeader(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string') {
    throw new Error('回應沒有 Set-Cookie');
  }

  return value.split(';')[0] ?? '';
}

type SetBody = { id: string; name: string };
type PromptBody = { scope: string; prompt: string; updatedAt: string | null };

describe('範圍層 Prompt', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let cookie = '';
  let brandId = '';

  beforeEach(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    app = buildServer({ checkDb: ok, checkStorage: ok });
    registerAuth(app, {
      pool: db.pool,
      loginHashKey: 'test-only-login-hash-key-0123456789abcdef',
      resolveEntry: () => 'internal',
    });
    registerBrandGuide(app, { pool: db.pool });
    registerBrandSets(app, { pool: db.pool });
    await app.ready();

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password: randomBytes(24).toString('base64url') },
    });
    cookie = cookieHeader(setup);

    const brand = await db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('moonic', 'Moonic') returning id",
    );
    brandId = brand.rows[0]?.id ?? '';
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function createSet(name: string): Promise<SetBody> {
    const response = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/sets`,
      headers: { cookie },
      payload: { name },
    });

    expect(response.statusCode, response.body).toBe(200);
    return response.json() as SetBody;
  }

  async function staffCookie(): Promise<string> {
    const inserted = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash, must_change_password)
       values ('ming@example.com', '阿明', 'staff', 'design', $1, false)
       returning id`,
      [await hashPassword(randomBytes(24).toString('base64url'))],
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

    return `co_session=${token}`;
  }

  it('未自訂時回空字串：空＝跟住決策自動更新，不是「沒有內容」', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/scope-prompt/brand`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ scope: 'brand', prompt: '' });
  });

  it('品牌總覽的自訂版本存得返', async () => {
    const saved = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/scope-prompt/brand`,
      headers: { cookie },
      payload: { prompt: '品牌層：先講定位，再講三站之間的張力。' },
    });

    expect(saved.statusCode).toBe(200);
    expect((saved.json() as PromptBody).updatedAt).not.toBeNull();

    const read = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/scope-prompt/brand`,
      headers: { cookie },
    });

    expect((read.json() as PromptBody).prompt).toBe('品牌層：先講定位，再講三站之間的張力。');
  });

  it('兩個品牌集各自一份，唔會互相覆蓋', async () => {
    const summer = await createSet('2026 夏季');
    const winter = await createSet('2026 冬季');

    const saved = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/scope-prompt/set?setId=${summer.id}`,
      headers: { cookie },
      payload: { prompt: '夏季版：明亮日光。' },
    });
    expect(saved.statusCode).toBe(200);

    const other = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/scope-prompt/set?setId=${winter.id}`,
      headers: { cookie },
    });

    expect((other.json() as PromptBody).prompt).toBe('');

    const same = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/scope-prompt/set?setId=${summer.id}`,
      headers: { cookie },
    });

    expect((same.json() as PromptBody).prompt).toBe('夏季版：明亮日光。');
  });

  it('scope 與 setId 不匹配就 400：不會靜靜寫入無人讀到的位置', async () => {
    const set = await createSet('2026 夏季');

    // 品牌集之外沒有 `set` 這個範圍；品牌集之內沒有 `brand`（那是 01–03 的）。
    const brandScopeWithSet = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/scope-prompt/brand?setId=${set.id}`,
      headers: { cookie },
      payload: { prompt: 'x' },
    });
    expect(brandScopeWithSet.statusCode).toBe(400);
    expect((brandScopeWithSet.json() as { error: string }).error).toBe('invalid_scope');

    const setScopeWithoutSet = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/scope-prompt/set`,
      headers: { cookie },
      payload: { prompt: 'x' },
    });
    expect(setScopeWithoutSet.statusCode).toBe(400);

    // 04A 已經搬回品牌層：帶 setId 來說它是品牌集的範圍，要擋。
    const coreInSet = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/scope-prompt/stage4a?setId=${set.id}`,
      headers: { cookie },
      payload: { prompt: 'x' },
    });
    expect(coreInSet.statusCode).toBe(400);
  });

  it('品牌集內的單一階段（04B）有自己的範圍 prompt', async () => {
    const set = await createSet('2026 夏季');

    const saved = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/scope-prompt/stage4b?setId=${set.id}`,
      headers: { cookie },
      payload: { prompt: '04B 這一站：先定圖形表面。' },
    });

    expect(saved.statusCode).toBe(200);
    expect((saved.json() as PromptBody).scope).toBe('stage4b');
  });

  it('空字串＝還原自動版本（清走自訂版，不是留一個空殼）', async () => {
    await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/scope-prompt/brand`,
      headers: { cookie },
      payload: { prompt: '自訂版' },
    });

    await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/scope-prompt/brand`,
      headers: { cookie },
      payload: { prompt: '' },
    });

    const read = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/scope-prompt/brand`,
      headers: { cookie },
    });

    expect((read.json() as PromptBody).prompt).toBe('');
  });

  it('員工寫入 403；未登入讀取 401', async () => {
    const staff = await staffCookie();

    const denied = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/scope-prompt/brand`,
      headers: { cookie: staff },
      payload: { prompt: '偷改' },
    });
    expect(denied.statusCode).toBe(403);

    const anonymous = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/scope-prompt/brand`,
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('不屬於這個品牌的品牌集：404', async () => {
    const other = await db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('other', 'Other') returning id",
    );
    const otherBrandId = other.rows[0]?.id ?? '';
    const set = await createSet('自己的');

    const response = await app.inject({
      method: 'GET',
      url: `/brands/${otherBrandId}/scope-prompt/set?setId=${set.id}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
  });
});

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { registerBrandPages } from '../../src/brand-pages/index';
import { registerBrandSuggestions } from '../../src/brand-suggestions/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 品牌專屬系統建議（issue #60）用真的 Postgres。
 *
 * 四件事要在真資料庫驗：
 *   1. 三項判斷缺一項就**不存在**（422 與 DB 的 check 兩重）。
 *   2. 接受＝真的開了一張自定義頁，brief 寫進去，左側清單讀得返。
 *   3. 略過是決定：同一簽名不再提，換一個簽名才可以是新的一次。
 *   4. 「其實屬於既有頁」不開新頁，只記住屬於哪一頁（畫面在那一頁頂部講）。
 */

const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

function cookieHeader(response: { headers: Record<string, unknown> }): { cookie: string } {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string') {
    throw new Error('回應沒有 Set-Cookie');
  }

  return { cookie: value.split(';')[0] ?? '' };
}

const ALL_OK = {
  unique: { ok: true, reason: '只有這個品牌用漸層講時間' },
  repeated: { ok: true, reason: '每一張節慶圖都要用' },
  noRoom: { ok: true, reason: '色彩頁只講角色，講不到漸層的過渡' },
};

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    signature: 'sig-sky-1',
    name: '天空漸層',
    slug: 'sky-gradient',
    brief: '節慶圖的背景漸層怎樣配、幾時用、幾時不用',
    refs: ['paper', 'ink', 'brand.primary'],
    ...ALL_OK,
    ...overrides,
  };
}

describe('品牌專屬系統建議', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let cookie: string;
  let brandId: string;

  beforeEach(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    app = buildServer({ checkDb: ok, checkStorage: ok });
    registerAuth(app, {
      pool: db.pool,
      loginHashKey: 'test-only-login-hash-key-0123456789abcdef',
      resolveEntry: () => 'internal',
    });
    registerBrandPages(app, { pool: db.pool });
    registerBrandSuggestions(app, { pool: db.pool });
    await app.ready();

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password: randomBytes(24).toString('base64url') },
    });

    cookie = cookieHeader(setup).cookie;

    const brand = await db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('moonic', 'Moonic') returning id",
    );
    brandId = brand.rows[0]?.id ?? '';

    await app.inject({ method: 'GET', url: `/brands/${brandId}/pages`, headers: { cookie } });
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  function record(payload: Record<string, unknown>, header = { cookie }) {
    return app.inject({ method: 'POST', url: `/brands/${brandId}/suggestions`, headers: header, payload });
  }

  async function list(): Promise<{ items: { id: string; name: string; belongsTo: string | null }[] }> {
    const response = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/suggestions`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);

    return response.json() as { items: { id: string; name: string; belongsTo: string | null }[] };
  }

  it('三項皆是：記得入，讀得返，理由一併存', async () => {
    const response = await record(suggestion());

    expect(response.statusCode).toBe(201);
    const body = response.json() as { suggestion: { checks: Record<string, string>; refs: string[] } };
    expect(body.suggestion.checks.unique).toContain('漸層');
    expect(body.suggestion.refs).toEqual(['paper', 'ink', 'brand.primary']);

    const items = await list();
    expect(items.items.map((item) => item.name)).toEqual(['天空漸層']);
  });

  it('缺一項就不存在：422，而且資料庫裡沒有這一列', async () => {
    const response = await record(suggestion({ noRoom: { ok: false, reason: '其實色彩頁放得下' } }));

    expect(response.statusCode).toBe(422);
    expect((response.json() as { missing: string[] }).missing).toEqual(['noRoom']);

    const count = await db.pool.query<{ n: number }>('select count(*)::int as n from brand_page_suggestion');
    expect(count.rows[0]?.n).toBe(0);
  });

  it('資料庫自己也不收三缺一的列（不靠應用層記得）', async () => {
    await expect(
      db.pool.query(
        `insert into brand_page_suggestion
           (brand_id, signature, name, slug, brief, unique_ok, repeated_ok, no_room_ok)
         values ($1, 'sig-x', 'X', 'x-page', 'b', true, false, true)`,
        [brandId],
      ),
    ).rejects.toThrow(/three_checks/);
  });

  it('接受：真的開了一張自定義頁，brief 寫進去，清單讀得返', async () => {
    const created = await record(suggestion());
    const id = (created.json() as { suggestion: { id: string } }).suggestion.id;

    const accepted = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/suggestions/${id}/accept`,
      headers: { cookie },
      payload: {},
    });

    expect(accepted.statusCode).toBe(201);
    const body = accepted.json() as { page: { key: string; kind: string; brief: string } };
    expect(body.page.key).toBe('sky-gradient');
    expect(body.page.kind).toBe('custom');
    expect(body.page.brief).toContain('漸層');

    const pages = await app.inject({ method: 'GET', url: `/brands/${brandId}/pages`, headers: { cookie } });
    const items = (pages.json() as { items: { key: string; group: string }[] }).items;
    const page = items.find((item) => item.key === 'sky-gradient');

    // 新頁出現在「品牌專屬」組：左側欄因此自動多一個入口（issue #60 驗收）。
    expect(page?.group).toBe('custom');
    expect((await list()).items).toHaveLength(0);
  });

  it('接受時可以改 brief：改的是頁的 brief，建議原文仍然留著', async () => {
    const created = await record(suggestion());
    const id = (created.json() as { suggestion: { id: string } }).suggestion.id;

    await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/suggestions/${id}/accept`,
      headers: { cookie },
      payload: { brief: '只講節慶圖，日常圖不用漸層' },
    });

    const page = await db.pool.query<{ brief: string }>("select brief from brand_page where key = 'sky-gradient'");
    expect(page.rows[0]?.brief).toBe('只講節慶圖，日常圖不用漸層');

    const raw = await db.pool.query<{ brief: string }>('select brief from brand_page_suggestion');
    expect(raw.rows[0]?.brief).toContain('漸層');
  });

  it('略過：同一簽名不再提；換一個簽名才是新的一次', async () => {
    const created = await record(suggestion());
    const id = (created.json() as { suggestion: { id: string } }).suggestion.id;

    const dismissed = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/suggestions/${id}/dismiss`,
      headers: { cookie },
      payload: {},
    });

    expect(dismissed.statusCode).toBe(200);
    expect((await list()).items).toHaveLength(0);

    // 同一個簽名：不再出現（200，沒有新的一列）。
    const again = await record(suggestion());
    expect(again.statusCode).toBe(200);
    expect((again.json() as { created: boolean }).created).toBe(false);
    expect((await list()).items).toHaveLength(0);

    // 內容變了＝新簽名：可以再提一次。
    const changed = await record(suggestion({ signature: 'sig-sky-2', name: '天空漸層（第二版）' }));
    expect(changed.statusCode).toBe(201);
    expect((await list()).items).toHaveLength(1);
  });

  it('其實屬於既有頁：記住屬於哪一頁，不開新頁', async () => {
    const created = await record(suggestion({ name: '用色比例', slug: 'colour-ratio', belongsTo: 'color' }));

    expect(created.statusCode).toBe(201);
    expect((created.json() as { suggestion: { belongsTo: string } }).suggestion.belongsTo).toBe('color');

    const pages = await db.pool.query<{ n: number }>("select count(*)::int as n from brand_page where key = 'colour-ratio'");
    expect(pages.rows[0]?.n).toBe(0);
  });

  it('撞了已有的頁鍵：409，建議仍然等決定（不會靜靜消失）', async () => {
    const created = await record(suggestion({ slug: 'logo' }));
    const id = (created.json() as { suggestion: { id: string } }).suggestion.id;

    const accepted = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/suggestions/${id}/accept`,
      headers: { cookie },
      payload: {},
    });

    expect(accepted.statusCode).toBe(409);
    expect((accepted.json() as { error: string }).error).toBe('page_key_taken');
    expect((await list()).items).toHaveLength(1);
  });

  it('已經決定了就不可以再決定一次', async () => {
    const created = await record(suggestion());
    const id = (created.json() as { suggestion: { id: string } }).suggestion.id;

    await app.inject({ method: 'POST', url: `/brands/${brandId}/suggestions/${id}/dismiss`, headers: { cookie }, payload: {} });

    const accept = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/suggestions/${id}/accept`,
      headers: { cookie },
      payload: {},
    });

    expect(accept.statusCode).toBe(409);
    expect((accept.json() as { error: string }).already_decided ?? (accept.json() as { error: string }).error).toBeDefined();
  });

  it('有品牌編輯權但不是老闆：可以提出與決定（這是設計師的工作）', async () => {
    const staff = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash, must_change_password)
       values ('designer@example.com', '設計師', 'staff', 'design', 'x', false) returning id`,
    );
    const staffId = staff.rows[0]?.id ?? '';

    await db.pool.query('insert into brand_editor (brand_id, user_id) values ($1, $2)', [brandId, staffId]);

    const { createSessionToken, hashSessionToken } = await import('../../src/auth/token');
    const sessionToken = createSessionToken();

    await db.pool.query(
      "insert into auth_session (token_hash, user_id, expires_at, entry) values ($1, $2, now() + interval '1 day', 'internal')",
      [hashSessionToken(sessionToken), staffId],
    );

    const staffCookie = { cookie: `co_session=${sessionToken}` };

    expect((await record(suggestion(), staffCookie)).statusCode).toBe(201);
    expect((await list()).items).toHaveLength(1);
  });

  it('沒有編輯權的員工：403，連提出都不行', async () => {
    const staff = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash, must_change_password)
       values ('viewer@example.com', '同事', 'staff', 'design', 'x', false) returning id`,
    );

    const { createSessionToken, hashSessionToken } = await import('../../src/auth/token');
    const sessionToken = createSessionToken();

    await db.pool.query(
      "insert into auth_session (token_hash, user_id, expires_at, entry) values ($1, $2, now() + interval '1 day', 'internal')",
      [hashSessionToken(sessionToken), staff.rows[0]?.id ?? ''],
    );

    const response = await record(suggestion(), { cookie: `co_session=${sessionToken}` });

    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: string }).error).toBe('not_brand_editor');
  });

  it('未登入：401', async () => {
    const response = await app.inject({ method: 'GET', url: `/brands/${brandId}/suggestions` });

    expect(response.statusCode).toBe(401);
  });
});

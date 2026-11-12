import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { registerBrandPages } from '../../src/brand-pages/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 品牌頁版本（issue #33）。
 *
 * 用真的 Postgres：這一張要證明的是「現行用算的」、「版本只加不改」、
 * 「被成品釘住的不可以刪」。這三件事全部住在資料庫（`max(version_no)`、
 * trigger、pin 表），用假 store 等於自己證明自己。
 *
 * 最重要的一條不是 201，而是**刪不到現行**：如果刪得到，這一頁就會沒有
 * 現行版本，而畫面仍然會顯示「這一頁有內容」——因為它顯示的是資料庫最後
 * 一次回答，不是現在的真相。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

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

describe('品牌頁版本', () => {
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
    registerBrandPages(app, { pool: db.pool });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function createBrandRow(code: string, name: string): Promise<string> {
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

    const rows = await db.pool.query<{ id: string }>("select id from app_user where role = 'owner'");
    const id = rows.rows[0]?.id;

    if (id === undefined) {
      throw new Error('setup 之後找不到老闆');
    }

    return { ...cookieHeader(response), id };
  }

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

  async function save(
    cookie: string,
    brandId: string,
    key: string,
    content: string,
    note?: string,
  ) {
    return app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages/${key}/versions`,
      headers: { cookie },
      payload: note === undefined ? { content } : { content, note },
    });
  }

  it('讀頁清單會建立八個固定頁（C112），第二次不會重複', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    const first = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages`,
      headers: { cookie: owner.cookie },
    });

    expect(first.statusCode).toBe(200);
    const keys = (first.json() as { items: { key: string }[] }).items.map((item) => item.key);
    expect(keys).toEqual(['home', 'platform', 'color', 'type', 'logo', 'tone', 'image', 'examples']);

    const second = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages`,
      headers: { cookie: owner.cookie },
    });

    expect((second.json() as { items: unknown[] }).items).toHaveLength(8);
  });

  it('未有任何版本時，現行是 null（不是一個空版本）', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    const response = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { current: unknown; versions: unknown[] };
    expect(body.current).toBeNull();
    expect(body.versions).toEqual([]);
  });

  it('儲存就是新增一版，版號由 1 起，現行跟著走', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    const first = await save(owner.cookie, brandId, 'logo', '第一版內容');
    expect(first.statusCode).toBe(201);
    expect((first.json() as { version: { versionNo: number } }).version.versionNo).toBe(1);

    const second = await save(owner.cookie, brandId, 'logo', '第二版內容');
    expect((second.json() as { version: { versionNo: number } }).version.versionNo).toBe(2);

    const page = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });

    const body = page.json() as {
      current: { versionNo: number; content: string };
      versions: { versionNo: number }[];
    };

    expect(body.current.versionNo).toBe(2);
    expect(body.current.content).toBe('第二版內容');
    expect(body.versions.map((version) => version.versionNo)).toEqual([2, 1]);
  });

  it('版本列表講改了哪一欄：路徑由 payload 出發，角色名不是索引（#62）', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    const colour = (inkHex: string): string =>
      JSON.stringify({
        roles: [
          { id: 'ink', group: 'reading', name: '', hex: inkHex, cmyk: '', dark: '', usage: '', reason: '' },
          { id: 'paper', group: 'reading', name: '', hex: '#ffffff', cmyk: '', dark: '', usage: '', reason: '' },
        ],
        order: { text: '', reason: '' },
        ratios: [],
        contrast_floor: 4.5,
        large_floor: 3,
        pairs: { allowed: [], forbidden: [] },
        tints: [],
      });

    await save(owner.cookie, brandId, 'color', colour('#111111'));
    await save(owner.cookie, brandId, 'color', colour('#222222'));

    const page = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/color`,
      headers: { cookie: owner.cookie },
    });

    const body = page.json() as { versions: { versionNo: number; changed: string[] }[] };

    // 新的一版：只改了墨色一格。索引已經換成角色名，因為 `roles.0.hex`
    // 對人沒有意思。
    expect(body.versions[0]?.changed).toEqual(['roles.ink.hex']);
    // 第一版沒有上一版可以比 —— 空陣列，不是「改了零項」。
    expect(body.versions[1]?.changed).toEqual([]);
  });

  it('用回舊版：以舊內容建立新版本，歷史沒有被改寫', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await save(owner.cookie, brandId, 'logo', '第一版內容');

    const page = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });
    const firstId = (page.json() as { versions: { id: string; versionNo: number }[] }).versions[0]?.id;

    if (firstId === undefined) {
      throw new Error('讀不到第一版');
    }

    await save(owner.cookie, brandId, 'logo', '第二版內容');

    const restored = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages/logo/versions/${firstId}/restore`,
      headers: { cookie: owner.cookie },
    });

    expect(restored.statusCode).toBe(201);

    const after = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });

    const body = after.json() as {
      current: { versionNo: number; content: string };
      versions: unknown[];
    };

    // 回滾是多一版，不是把指針撥回去：三版都在。
    expect(body.versions).toHaveLength(3);
    expect(body.current.versionNo).toBe(3);
    expect(body.current.content).toBe('第一版內容');
  });

  it('現行版本不可以刪：409 並講明要先換現行', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await save(owner.cookie, brandId, 'logo', '第一版內容');

    const page = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });
    const currentId = (page.json() as { current: { id: string } }).current.id;

    const response = await app.inject({
      method: 'DELETE',
      url: `/brands/${brandId}/pages/logo/versions/${currentId}`,
      headers: { cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('current_version');

    const still = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });

    expect((still.json() as { current: unknown }).current).not.toBeNull();
  });

  it('刪一個舊版本：由列表消失，但資料仍在（軟刪除）', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await save(owner.cookie, brandId, 'logo', '第一版內容');
    await save(owner.cookie, brandId, 'logo', '第二版內容');

    const page = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });
    const oldId = (page.json() as { versions: { id: string; versionNo: number }[] }).versions.find(
      (version) => version.versionNo === 1,
    )?.id;

    if (oldId === undefined) {
      throw new Error('讀不到第一版');
    }

    const response = await app.inject({
      method: 'DELETE',
      url: `/brands/${brandId}/pages/logo/versions/${oldId}`,
      headers: { cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });

    expect((after.json() as { versions: unknown[] }).versions).toHaveLength(1);

    const row = await db.pool.query<{ deleted_at: Date | null }>(
      'select deleted_at from brand_page_version where id = $1',
      [oldId],
    );

    expect(row.rows[0]?.deleted_at).not.toBeNull();
  });

  it('被已出街成品釘住的版本不可以刪：409 並講明釘在哪一件', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await save(owner.cookie, brandId, 'logo', '第一版內容');
    await save(owner.cookie, brandId, 'logo', '第二版內容');

    const page = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });
    const oldId = (page.json() as { versions: { id: string; versionNo: number }[] }).versions.find(
      (version) => version.versionNo === 1,
    )?.id;

    if (oldId === undefined) {
      throw new Error('讀不到第一版');
    }

    await db.pool.query(
      "insert into brand_page_version_pin (version_id, ref_kind, ref_label) values ($1, 'output', '2026 秋季包裝盒 v2')",
      [oldId],
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/brands/${brandId}/pages/logo/versions/${oldId}`,
      headers: { cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { error: string; pinnedBy: string[]; message: string };
    expect(body.error).toBe('version_pinned');
    expect(body.pinnedBy).toEqual(['2026 秋季包裝盒 v2']);
    expect(body.message).toContain('2026 秋季包裝盒 v2');
  });

  it('拿另一個品牌的版本 id 來刪：當作不存在', async () => {
    const owner = await setupOwner();
    const moonic = await createBrandRow('moonic', 'Moonic');
    const other = await createBrandRow('hx', 'HeadX');

    await save(owner.cookie, moonic, 'logo', '第一版內容');
    await save(owner.cookie, moonic, 'logo', '第二版內容');

    const page = await app.inject({
      method: 'GET',
      url: `/brands/${moonic}/pages/logo`,
      headers: { cookie: owner.cookie },
    });
    const oldId = (page.json() as { versions: { id: string; versionNo: number }[] }).versions.find(
      (version) => version.versionNo === 1,
    )?.id;

    if (oldId === undefined) {
      throw new Error('讀不到第一版');
    }

    const response = await app.inject({
      method: 'DELETE',
      url: `/brands/${other}/pages/logo/versions/${oldId}`,
      headers: { cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('version_not_found');
  });

  it('員工讀得到，寫入 403', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');
    const staff = await staffSession('ming@example.com');

    const read = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: staff.cookie },
    });

    expect(read.statusCode).toBe(200);

    const write = await save(staff.cookie, brandId, 'logo', '員工想改');
    expect(write.statusCode).toBe(403);

    // 老闆的讀取見到同一個「未有版本」的狀態：員工的請求真的沒有寫入。
    const after = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });

    expect((after.json() as { current: unknown }).current).toBeNull();
  });

  it('空內容不會變成一個版本', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    const response = await save(owner.cookie, brandId, 'logo', '   ');

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('invalid_version');

    const page = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });

    expect((page.json() as { versions: unknown[] }).versions).toEqual([]);
  });

  it('品牌不存在：404，不是 500', async () => {
    const owner = await setupOwner();

    const response = await app.inject({
      method: 'GET',
      url: `/brands/${MISSING_ID}/pages/logo`,
      headers: { cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('brand_not_found');
  });

  it('不是 uuid 的路徑參數：404（不是 500）', async () => {
    const owner = await setupOwner();

    const response = await app.inject({
      method: 'GET',
      url: '/brands/not-a-uuid/pages/logo',
      headers: { cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(404);
  });

  it('資料庫層擋改寫：直接 UPDATE 內容會失敗', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await save(owner.cookie, brandId, 'logo', '第一版內容');

    const row = await db.pool.query<{ id: string }>('select id from brand_page_version limit 1');
    const id = row.rows[0]?.id;

    if (id === undefined) {
      throw new Error('讀不到版本列');
    }

    await expect(
      db.pool.query('update brand_page_version set content = $2 where id = $1', [id, '改寫歷史']),
    ).rejects.toThrow(/只准追加/);
  });

  it('資料庫層擋物理刪除', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await save(owner.cookie, brandId, 'logo', '第一版內容');

    const row = await db.pool.query<{ id: string }>('select id from brand_page_version limit 1');
    const id = row.rows[0]?.id;

    if (id === undefined) {
      throw new Error('讀不到版本列');
    }

    await expect(
      db.pool.query('delete from brand_page_version where id = $1', [id]),
    ).rejects.toThrow(/軟刪除/);
  });

  it('自定義頁的鍵與固定頁共用命名空間：用固定頁的鍵建自定義頁會被資料庫拒絕', async () => {
    const brandId = await createBrandRow('moonic', 'Moonic');

    await expect(
      db.pool.query(
        "insert into brand_page (brand_id, kind, key, name, brief) values ($1, 'custom', 'logo', '重複的標誌', '想再做一個標誌頁')",
        [brandId],
      ),
    ).rejects.toThrow(/brand_page_custom_key|duplicate key/);
  });
});

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { registerBrandPages } from '../../src/brand-pages/index';
import { registerBrandPolicy } from '../../src/brand-policy/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 品牌頁策略（issue #34）。
 *
 * 用真的 Postgres：這一張要證明的是「六個槽都有全文」、「只加不改」、「已經
 * 做好的頁不會被重寫」。三件事全部住在資料庫（migration 寫入的第一版、
 * trigger、頁版本的 policy_version_id），用假 store 等於自己證明自己。
 *
 * 最重要的一條不是 201，而是**舊版讀得返**：如果一條 UPDATE 改得動策略，
 * 已經印在盒上的成品就會指向一段已經不存在的文字，而畫面看不出分別。
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

type Slot = {
  slot: string;
  current: { versionNo: number; content: string; id: string } | null;
  versions: { id: string; versionNo: number }[];
};

describe('品牌頁策略', () => {
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
    registerBrandPolicy(app, { pool: db.pool });
    registerBrandPages(app, { pool: db.pool });

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

  async function readPolicy(cookie: string): Promise<Slot[]> {
    const response = await app.inject({
      method: 'GET',
      url: '/policy',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    return (response.json() as { slots: Slot[] }).slots;
  }

  async function save(cookie: string, slot: string, content: string, note?: string) {
    return app.inject({
      method: 'POST',
      url: `/policy/${slot}/versions`,
      headers: { cookie },
      payload: note === undefined ? { content } : { content, note },
    });
  }

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

  it('六個槽都有第 1 版，而且是全文不是「未寫」', async () => {
    const owner = await setupOwner();
    const slots = await readPolicy(owner.cookie);

    expect(slots.map((item) => item.slot)).toEqual([
      'home',
      'logo',
      'color',
      'type',
      'tone',
      'custom',
    ]);

    for (const item of slots) {
      expect(item.current, item.slot).not.toBeNull();
      expect(item.current?.versionNo, item.slot).toBe(1);

      const content = item.current?.content ?? '';
      expect(content.length, item.slot).toBeGreaterThan(100);
      expect(content, item.slot).not.toContain('未寫');
    }

    const byslot = new Map(slots.map((item) => [item.slot, item.current?.content ?? '']));

    expect(byslot.get('home')).toContain('編成一份主頁');
    expect(byslot.get('logo')).toContain('安全範圍 X');
    expect(byslot.get('color')).toContain('brand.primary');
    expect(byslot.get('type')).toContain('最多兩個家族');
    expect(byslot.get('tone')).toContain('禁用詞');
    expect(byslot.get('custom')).toContain('brief');
  });

  it('儲存＝新增一版：舊版仍然在列表，內容一個字都沒有變', async () => {
    const owner = await setupOwner();
    const before = await readPolicy(owner.cookie);
    const originalLogo = before.find((item) => item.slot === 'logo')?.current?.content ?? '';

    const response = await save(owner.cookie, 'logo', '新的標誌標準：五類資產、安全範圍 X。', '加安全範圍');

    expect(response.statusCode).toBe(201);
    expect((response.json() as { version: { versionNo: number } }).version.versionNo).toBe(2);

    const after = await readPolicy(owner.cookie);
    const logo = after.find((item) => item.slot === 'logo');

    expect(logo?.current?.versionNo).toBe(2);
    expect(logo?.current?.content).toBe('新的標誌標準：五類資產、安全範圍 X。');
    expect(logo?.versions.map((item) => item.versionNo)).toEqual([2, 1]);

    const stored = await db.pool.query<{ content: string }>(
      `select content from brand_policy_version where slot = 'logo' and version_no = 1`,
    );
    expect(stored.rows[0]?.content).toBe(originalLogo);

    // 其他槽不受影響：改標誌不應該令色彩多一版。
    expect(after.find((item) => item.slot === 'color')?.current?.versionNo).toBe(1);
  });

  it('員工：讀得到，寫不入（403）', async () => {
    const staff = await staffSession('wai@example.com');
    const owner = await setupOwner();

    expect((await readPolicy(staff.cookie)).length).toBe(6);

    const response = await save(staff.cookie, 'logo', '員工想改');
    expect(response.statusCode).toBe(403);

    // 真的沒有寫入：現行仍然是第 1 版。
    const after = await readPolicy(owner.cookie);
    expect(after.find((item) => item.slot === 'logo')?.current?.versionNo).toBe(1);
  });

  it('空內容：400，不會建立一個空白版本', async () => {
    const owner = await setupOwner();

    const response = await save(owner.cookie, 'logo', '   ');
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('invalid_version');
  });

  it('打錯槽名：404，不是 400', async () => {
    const owner = await setupOwner();

    const response = await save(owner.cookie, 'logos', '打錯字');
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('policy_slot_not_found');
  });

  it('資料庫擋改寫：一條 UPDATE 改不動舊版', async () => {
    await setupOwner();

    await expect(
      db.pool.query(`update brand_policy_version set content = '改寫' where slot = 'logo'`),
    ).rejects.toThrow(/只准追加/);
  });

  it('資料庫擋刪除：舊版永遠讀得返', async () => {
    await setupOwner();

    await expect(
      db.pool.query(`delete from brand_policy_version where slot = 'logo'`),
    ).rejects.toThrow(/只准追加/);
  });

  it('寫入留審計', async () => {
    const owner = await setupOwner();
    await save(owner.cookie, 'tone', '新的語氣標準', '改一條');

    const rows = await db.pool.query<{ action: string; detail: Record<string, unknown> }>(
      "select action, detail from audit_log where action = 'brand.policy.version.create'",
    );

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.detail).toMatchObject({ slot: 'tone', versionNo: 2 });
  });

  it('頁版本記住當時的策略版本：之後改策略，舊頁版本仍然指著舊那版', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    // 先把標誌策略推到第 2 版。
    expect((await save(owner.cookie, 'logo', '標誌標準第 2 版')).statusCode).toBe(201);

    const pageVersion = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages/logo/versions`,
      headers: { cookie: owner.cookie },
      payload: { content: '標誌頁內容，照第 2 版策略做' },
    });

    expect(pageVersion.statusCode).toBe(201);
    expect(
      (pageVersion.json() as { version: { policyVersionNo: number | null } }).version
        .policyVersionNo,
    ).toBe(2);

    // 再推到第 3 版：已經做好的頁版本不會被改寫。
    expect((await save(owner.cookie, 'logo', '標誌標準第 3 版')).statusCode).toBe(201);

    const detail = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });

    const body = detail.json() as {
      current: { content: string; policyVersionNo: number | null };
      versions: { versionNo: number; policyVersionNo: number | null }[];
    };

    expect(body.current.content).toBe('標誌頁內容，照第 2 版策略做');
    expect(body.current.policyVersionNo).toBe(2);
    expect(body.versions[0]?.policyVersionNo).toBe(2);
  });

  it('自定義頁用「自定義頁通用」槽，不是五頁任何一個', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    // 自定義頁的建立介面在 #32；這裡直接寫一列，驗的是「用哪一個槽」。
    const inserted = await db.pool.query<{ id: string }>(
      `insert into brand_page (brand_id, kind, key, name, brief, sort_order)
       values ($1, 'custom', 'packaging', '包裝', '包裝要決定什麼', 60)
       returning id`,
      [brandId],
    );

    expect(inserted.rowCount).toBe(1);

    const response = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages/packaging/versions`,
      headers: { cookie: owner.cookie },
      payload: { content: '包裝頁內容' },
    });

    expect(response.statusCode).toBe(201);
    // custom 槽現時是第 1 版。
    expect(
      (response.json() as { version: { policyVersionNo: number | null } }).version.policyVersionNo,
    ).toBe(1);
  });
});

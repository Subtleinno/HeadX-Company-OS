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
 * 自定義頁與品牌級編輯權（issue #32，決策 C103）。
 *
 * 用真的 Postgres：這一張要證明「零到多張」、「次序＝建立次序」、
 * 「撞名不會靜靜改名」、「刪頁會連版本一併軟刪」、「沒有編輯權的人真的寫不入」。
 * 最後一條最重要 —— 前端把按鈕收起來不算數，後端要拒絕。
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

type PageJson = { key: string; name: string; kind: string; brief: string | null; sortOrder: number };

describe('自定義頁與品牌編輯權', () => {
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
    registerBrandPolicy(app, { pool: db.pool });

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

  async function listPages(cookie: string, brandId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/pages`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    return response.json() as { items: PageJson[]; canEdit: boolean };
  }

  async function addPage(
    cookie: string,
    brandId: string,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages`,
      headers: { cookie },
      payload,
    });
  }

  it('加三張自定義頁：左側次序＝建立次序，不是字母序', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    for (const [name, slug, brief] of [
      ['攝影', 'photo', '攝影要決定哪些畫面可以用'],
      ['包裝', 'packaging', '包裝要決定紙材與印刷'],
      ['命名', 'naming', '命名要決定產品名稱的規則'],
    ] as const) {
      const response = await addPage(owner.cookie, brandId, { name, slug, brief });
      expect(response.statusCode).toBe(201);
    }

    const { items } = await listPages(owner.cookie, brandId);
    const keys = items.map((item) => item.key);

    // 八個固定頁先（C112），然後三張自定義頁按建立次序（不是字母：naming < packaging < photo）。
    expect(keys).toEqual([
      'home',
      'platform',
      'color',
      'type',
      'logo',
      'tone',
      'image',
      'examples',
      'photo',
      'packaging',
      'naming',
    ]);
    expect(items.filter((item) => item.kind === 'custom')).toHaveLength(3);
  });

  it('缺 brief 或 slug：400，講明欠什麼', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    const noBrief = await addPage(owner.cookie, brandId, { name: '包裝', slug: 'packaging' });
    expect(noBrief.statusCode).toBe(400);
    expect((noBrief.json() as { reason: string }).reason).toContain('要決定什麼');

    const badSlug = await addPage(owner.cookie, brandId, {
      name: '包裝',
      slug: 'Packaging Box',
      brief: '包裝要決定紙材',
    });
    expect(badSlug.statusCode).toBe(400);

    const fixedSlug = await addPage(owner.cookie, brandId, {
      name: '色彩',
      slug: 'color',
      brief: '想開一張色彩頁',
    });
    expect(fixedSlug.statusCode).toBe(400);
    expect((fixedSlug.json() as { reason: string }).reason).toContain('固定頁');

    expect((await listPages(owner.cookie, brandId)).items).toHaveLength(8);
  });

  it('撞名：409，講明撞了哪一張，不會靜靜改名', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    expect(
      (await addPage(owner.cookie, brandId, { name: '包裝', slug: 'packaging', brief: '紙材' }))
        .statusCode,
    ).toBe(201);

    const clash = await addPage(owner.cookie, brandId, {
      name: '包裝設計',
      slug: 'packaging',
      brief: '又是紙材',
    });

    expect(clash.statusCode).toBe(409);
    const body = clash.json() as { error: string; name: string; message: string };
    expect(body.error).toBe('page_key_taken');
    expect(body.name).toBe('包裝');
    expect(body.message).toContain('包裝');
  });

  it('改名：網址不變；帶 slug 一律 400', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await addPage(owner.cookie, brandId, { name: '包裝', slug: 'packaging', brief: '紙材' });

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/brands/${brandId}/pages/packaging`,
      headers: { cookie: owner.cookie },
      payload: { name: '包裝與紙材' },
    });

    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as { page: PageJson }).page.key).toBe('packaging');

    const withSlug = await app.inject({
      method: 'PATCH',
      url: `/brands/${brandId}/pages/packaging`,
      headers: { cookie: owner.cookie },
      payload: { name: '包裝', slug: 'box' },
    });

    expect(withSlug.statusCode).toBe(400);
    expect((withSlug.json() as { reason: string }).reason).toContain('不可以改');
  });

  it('刪一張：左側即刻消失，版本一併軟刪，資料與審計仍在', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await addPage(owner.cookie, brandId, { name: '包裝', slug: 'packaging', brief: '紙材' });

    const saved = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages/packaging/versions`,
      headers: { cookie: owner.cookie },
      payload: { content: '包裝頁第 1 版' },
    });
    expect(saved.statusCode).toBe(201);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/brands/${brandId}/pages/packaging`,
      headers: { cookie: owner.cookie },
    });

    expect(removed.statusCode).toBe(200);
    expect((removed.json() as { versions: number }).versions).toBe(1);

    const keys = (await listPages(owner.cookie, brandId)).items.map((item) => item.key);
    expect(keys).not.toContain('packaging');

    const row = await db.pool.query<{ deleted_at: Date | null }>(
      "select deleted_at from brand_page where key = 'packaging'",
    );
    expect(row.rows[0]?.deleted_at).not.toBeNull();

    const versions = await db.pool.query<{ deleted_at: Date | null }>(
      `select v.deleted_at from brand_page_version v
         join brand_page p on p.id = v.page_id
        where p.key = 'packaging'`,
    );
    expect(versions.rows.every((item) => item.deleted_at !== null)).toBe(true);

    const audit = await db.pool.query("select 1 from audit_log where action = 'brand.page.delete'");
    expect(audit.rowCount).toBe(1);
  });

  it('刪除之後同一個 slug 可以再建立（部分唯一索引）', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await addPage(owner.cookie, brandId, { name: '包裝', slug: 'packaging', brief: '紙材' });
    await app.inject({
      method: 'DELETE',
      url: `/brands/${brandId}/pages/packaging`,
      headers: { cookie: owner.cookie },
    });

    const again = await addPage(owner.cookie, brandId, {
      name: '包裝 2',
      slug: 'packaging',
      brief: '新的紙材方向',
    });

    expect(again.statusCode).toBe(201);
  });

  it('固定頁不可以刪：409 講明它是網址的一部分', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await listPages(owner.cookie, brandId);

    const response = await app.inject({
      method: 'DELETE',
      url: `/brands/${brandId}/pages/logo`,
      headers: { cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('page_is_fixed');
  });

  it('任何一版被成品釘住：拒絕刪頁，並講明釘在哪一件', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    await addPage(owner.cookie, brandId, { name: '包裝', slug: 'packaging', brief: '紙材' });

    const saved = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages/packaging/versions`,
      headers: { cookie: owner.cookie },
      payload: { content: '包裝頁第 1 版' },
    });
    const versionId = (saved.json() as { version: { id: string } }).version.id;

    await db.pool.query(
      `insert into brand_page_version_pin (version_id, ref_kind, ref_label)
       values ($1, 'output', '2026 秋季包裝盒 v2')`,
      [versionId],
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/brands/${brandId}/pages/packaging`,
      headers: { cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { error: string; message: string };
    expect(body.error).toBe('page_pinned');
    expect(body.message).toContain('2026 秋季包裝盒 v2');

    expect((await listPages(owner.cookie, brandId)).items.map((item) => item.key)).toContain(
      'packaging',
    );
  });

  it('員工沒有編輯權：建立、改名、刪除、存版本全部 403，而且真的一個字都沒寫入', async () => {
    const owner = await setupOwner();
    const staff = await staffSession('wai@example.com');
    const brandId = await createBrandRow('moonic', 'Moonic');

    await addPage(owner.cookie, brandId, { name: '包裝', slug: 'packaging', brief: '紙材' });

    const created = await addPage(staff.cookie, brandId, {
      name: '攝影',
      slug: 'photo',
      brief: '畫面',
    });
    expect(created.statusCode).toBe(403);
    expect((created.json() as { error: string }).error).toBe('not_brand_editor');

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/brands/${brandId}/pages/packaging`,
      headers: { cookie: staff.cookie },
      payload: { name: '亂改名' },
    });
    expect(renamed.statusCode).toBe(403);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/brands/${brandId}/pages/packaging`,
      headers: { cookie: staff.cookie },
    });
    expect(removed.statusCode).toBe(403);

    const saved = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages/packaging/versions`,
      headers: { cookie: staff.cookie },
      payload: { content: '員工想寫' },
    });
    expect(saved.statusCode).toBe(403);

    const { items } = await listPages(staff.cookie, brandId);
    expect(items.map((item) => item.key)).toEqual([
      'home',
      'platform',
      'color',
      'type',
      'logo',
      'tone',
      'image',
      'examples',
      'packaging',
    ]);
    expect(items.find((item) => item.key === 'packaging')?.name).toBe('包裝');
  });

  it('老闆授予之後，該員工真的改得到；但授予本身只有老闆做得到', async () => {
    const owner = await setupOwner();
    const staff = await staffSession('wai@example.com');
    const brandId = await createBrandRow('moonic', 'Moonic');

    // 未授予之前：canEdit 是 false。
    expect((await listPages(staff.cookie, brandId)).canEdit).toBe(false);

    // 員工自己授權給自己 → 403（只有老闆可以）。
    const selfGrant = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/editors/${staff.id}`,
      headers: { cookie: staff.cookie },
    });
    expect(selfGrant.statusCode).toBe(403);

    const grant = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/editors/${staff.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(grant.statusCode).toBe(200);
    expect((grant.json() as { items: { userId: string }[] }).items).toHaveLength(1);

    expect((await listPages(staff.cookie, brandId)).canEdit).toBe(true);

    const created = await addPage(staff.cookie, brandId, {
      name: '攝影',
      slug: 'photo',
      brief: '畫面',
    });
    expect(created.statusCode).toBe(201);

    const saved = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages/photo/versions`,
      headers: { cookie: staff.cookie },
      payload: { content: '攝影頁第 1 版' },
    });
    expect(saved.statusCode).toBe(201);

    // 收回之後即刻失效。
    const revoke = await app.inject({
      method: 'DELETE',
      url: `/brands/${brandId}/editors/${staff.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(revoke.statusCode).toBe(200);

    const after = await addPage(staff.cookie, brandId, {
      name: '命名',
      slug: 'naming',
      brief: '規則',
    });
    expect(after.statusCode).toBe(403);
  });

  it('編輯權是逐品牌：A 品牌的編輯權改不到 B 品牌', async () => {
    const owner = await setupOwner();
    const staff = await staffSession('wai@example.com');
    const brandA = await createBrandRow('branda', 'Brand A');
    const brandB = await createBrandRow('brandb', 'Brand B');

    await app.inject({
      method: 'PUT',
      url: `/brands/${brandA}/editors/${staff.id}`,
      headers: { cookie: owner.cookie },
    });

    expect((await listPages(staff.cookie, brandA)).canEdit).toBe(true);
    expect((await listPages(staff.cookie, brandB)).canEdit).toBe(false);

    const denied = await addPage(staff.cookie, brandB, {
      name: '包裝',
      slug: 'packaging',
      brief: '紙材',
    });
    expect(denied.statusCode).toBe(403);
  });

  it('未登入：401，不是 403', async () => {
    const owner = await setupOwner();
    const brandId = await createBrandRow('moonic', 'Moonic');

    const response = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages`,
      payload: { name: '包裝', slug: 'packaging', brief: '紙材' },
    });

    expect(response.statusCode).toBe(401);
    expect(owner.id).toBeTruthy();
  });
});

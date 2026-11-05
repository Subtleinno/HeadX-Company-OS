import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { migrate } from '../../src/migrate';
import { decide } from '../../src/settings/policy';
import { seedSettings } from '../../src/settings/seed';
import { registerSettings } from '../../src/settings/routes';
import { listPolicyRules } from '../../src/settings/store';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 設定與政策規則的整合測試（issue #80）：真 Postgres（臨時資料庫 co_test_<隨機>）加 Fastify inject。
 *
 * 正式資料庫由頭到尾不插任何列 —— 種子填入是「第一次啟動才做」的事，
 * 在正式庫跑一次就再也回不去（值會被當成「老闆改過」）。
 *
 * 這裡驗的是單元測試驗不到的東西：SQL 真的寫得進去、on conflict do nothing 真的不覆蓋、
 * 已刪除的規則真的讓整張表被當成「已經填過」、以及每一個寫入動作真的在 audit_log 留下紀錄。
 */

const migrationsDir = resolve(process.cwd(), 'db/migrations');
const profileDir = resolve(process.cwd(), 'profiles/default');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

/** 測試專用 key：真 key 只放在 .env，不入 repo、不入測試。 */
const TEST_KEY = 'test-only-login-hash-key-0123456789abcdef';

/** 審計 detail 不可以出現這些字（不變量 10）。 */
const SECRET_LIKE = /password|secret|token|hash|credential/i;

type Harness = {
  app: FastifyInstance;
  db: TempDatabase;
  drop: () => Promise<void>;
};

let harness: Harness | undefined;
const tempDirs: string[] = [];

/** 目前這個測試的 harness。beforeEach 一定會建好，拿不到就是測試寫錯。 */
function current(): Harness {
  if (harness === undefined) {
    throw new Error('沒有 harness：測試缺少 setup()');
  }

  return harness;
}

afterEach(async () => {
  if (harness !== undefined) {
    await harness.app.close();
    await harness.drop();
    harness = undefined;
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

type SetupOptions = {
  env?: Record<string, string | undefined>;
  seed?: boolean;
  profile?: string;
};

/** 建一個臨時庫、套 migration、（可選）填種子，然後起一個只有 auth 與 settings 的 API。 */
async function setup(options: SetupOptions = {}): Promise<Harness> {
  const db = await createTempDatabase();

  if (options.seed !== false) {
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
    await seedSettings({
      pool: db.pool,
      profileDir: options.profile ?? profileDir,
      env: options.env ?? {},
      log: silent,
    });
  }

  const app = buildServer({ checkDb: ok, checkStorage: ok });
  registerAuth(app, { pool: db.pool, loginHashKey: TEST_KEY, resolveEntry: () => 'internal' });
  registerSettings(app, { pool: db.pool });
  await app.ready();

  const current: Harness = { app, db, drop: db.drop };
  harness = current;
  return current;
}

function firstSetCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string') {
    throw new Error('回應沒有 Set-Cookie');
  }

  return value;
}

/** 建老闆（走真的 /auth/setup）並回傳可用的 cookie 與 id。 */
async function signInOwner(app: FastifyInstance, db: TempDatabase): Promise<{ cookie: string; id: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/setup',
    payload: {
      displayName: '老闆',
      email: `boss-${randomBytes(4).toString('hex')}@example.com`,
      password: randomBytes(18).toString('base64url'),
    },
  });

  expect(response.statusCode).toBe(201);

  const cookie = firstSetCookie(response).split(';')[0] ?? '';
  const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie } });
  const id = (me.json() as { user: { id: string } }).user.id;

  expect(await db.pool.query('select 1 from app_user where id = $1', [id])).toMatchObject({
    rowCount: 1,
  });

  return { cookie, id };
}

/** 直接插一個員工與 session（員工不應該可以改設定）。 */
async function signInStaff(db: TempDatabase): Promise<{ cookie: string }> {
  const inserted = await db.pool.query<{ id: string }>(
    `insert into app_user (email, display_name, role, department, password_hash)
     values ($1, '員工', 'staff', 'design', $2)
     returning id`,
    [`staff-${randomBytes(4).toString('hex')}@example.com`, await hashPassword(randomBytes(18).toString('base64url'))],
  );

  const token = createSessionToken();

  await db.pool.query(
    'insert into auth_session (token_hash, user_id, expires_at, entry) values ($1, $2, now() + interval \'1 day\', \'internal\')',
    [hashSessionToken(token), inserted.rows[0]?.id],
  );

  return { cookie: `co_session=${token}` };
}

async function readSettings(db: TempDatabase): Promise<Map<string, unknown>> {
  const rows = await db.pool.query<{ key: string; value: unknown }>(
    'select key, value from company_setting order by key',
  );

  return new Map(rows.rows.map((row) => [row.key, row.value]));
}

type AuditRow = {
  action: string;
  actor_id: string;
  target: string | null;
  detail: Record<string, unknown>;
};

async function auditRows(db: TempDatabase, action?: string): Promise<AuditRow[]> {
  const result =
    action === undefined
      ? await db.pool.query<AuditRow>('select action, actor_id, target, detail from audit_log order by id')
      : await db.pool.query<AuditRow>(
          'select action, actor_id, target, detail from audit_log where action = $1 order by id',
          [action],
        );

  return result.rows;
}

describe('全新資料庫：種子依規則填入', () => {
  beforeEach(async () => {
    await setup({ env: {} });
  });

  it('未設 EDITION 與 INSTALL_CODE：六個 key，edition 為 intl、語系 zh-HK', async () => {
    const { db } = current();
    const settings = await readSettings(db);

    expect([...settings.keys()]).toEqual([
      'acceptance_rule',
      'company_locale',
      'department_isolation',
      'edition',
      'notification_channels',
      'overdue_grace_hours',
    ]);
    expect(settings.get('edition')).toBe('intl');
    expect(settings.get('company_locale')).toBe('zh-HK');
    expect(settings.get('acceptance_rule')).toBe('owner');
    expect(settings.get('department_isolation')).toBe(false);
    expect(settings.get('overdue_grace_hours')).toBe(0);
    expect(settings.get('notification_channels')).toEqual(['inapp']);
  });

  it('install_code 沒有設定時不寫入（不是寫一個空字串）', async () => {
    const { db } = current();
    const rows = await db.pool.query("select 1 from company_setting where key = 'install_code'");

    expect(rows.rowCount).toBe(0);
  });

  it('寫一筆 settings.seed 審計，detail 列出填入的 key，不含任何機密', async () => {
    const { db } = current();
    const rows = await auditRows(db, 'settings.seed');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_id).toBe('settings-seed');
    expect((rows[0]?.detail as { keys: string[] }).keys).toContain('edition');

    for (const row of rows) {
      expect(JSON.stringify(row.detail)).not.toMatch(SECRET_LIKE);
    }
  });

  it('policy_rule 預設是空的（全部需批准），不是填一堆放行規則', async () => {
    const { db } = current();
    const rows = await db.pool.query('select count(*)::int as n from policy_rule');

    expect(rows.rows[0]).toMatchObject({ n: 0 });
  });
});

describe('安裝時決定：EDITION 與 INSTALL_CODE 來自環境', () => {
  beforeEach(async () => {
    await setup({ env: { EDITION: 'cn', INSTALL_CODE: 'HK01' } });
  });

  it('大陸版：語系預設簡體、install_code 有值，共七個 key', async () => {
    const { db } = current();
    const settings = await readSettings(db);

    expect(settings.size).toBe(7);
    expect(settings.get('edition')).toBe('cn');
    expect(settings.get('company_locale')).toBe('zh-CN');
    expect(settings.get('install_code')).toBe('HK01');
  });

  it('不合法 EDITION 讓啟動失敗，不會靜靜當成 intl', async () => {
    const db = await createTempDatabase();

    try {
      await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

      await expect(
        seedSettings({ pool: db.pool, profileDir, env: { EDITION: 'hk' }, log: silent }),
      ).rejects.toThrow(/EDITION/);
    } finally {
      await db.drop();
    }
  });

  it('不合法 INSTALL_CODE 讓啟動失敗', async () => {
    const db = await createTempDatabase();

    try {
      await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

      await expect(
        seedSettings({ pool: db.pool, profileDir, env: { INSTALL_CODE: 'hk' }, log: silent }),
      ).rejects.toThrow(/INSTALL_CODE/);
    } finally {
      await db.drop();
    }
  });
});

describe('重啟：已存在的值不被種子覆蓋', () => {
  beforeEach(async () => {
    await setup({ env: {} });
  });

  it('改過的值重啟之後仍然是改過的值，也不會多一筆 settings.seed', async () => {
    const { db } = current();

    await db.pool.query("update company_setting set value = '\"on_submit\"'::jsonb where key = 'acceptance_rule'");

    const second = await seedSettings({ pool: db.pool, profileDir, env: {}, log: silent });

    expect(second).toEqual({ seededKeys: [], seededRules: 0 });

    const settings = await readSettings(db);
    expect(settings.get('acceptance_rule')).toBe('on_submit');
    expect(await auditRows(db, 'settings.seed')).toHaveLength(1);
  });

  it('取消某個 key 之後重啟：補回來的是預設值，其他已改的值不動', async () => {
    const { db } = current();

    await db.pool.query("update company_setting set value = 'false'::jsonb where key = 'department_isolation'");
    await db.pool.query("delete from company_setting where key = 'overdue_grace_hours'");

    const second = await seedSettings({ pool: db.pool, profileDir, env: {}, log: silent });

    expect(second.seededKeys).toEqual(['overdue_grace_hours']);

    const settings = await readSettings(db);
    expect(settings.get('overdue_grace_hours')).toBe(0);
    expect(settings.get('department_isolation')).toBe(false);
  });
});

describe('policy_rule 的種子：整張表（含已刪除）沒有列才填', () => {
  /** 一份「有一條規則」的 profile；用來驗「有列就不填」。 */
  async function profileWithOneRule(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'co-profile-'));
    tempDirs.push(dir);

    await writeFile(
      join(dir, 'settings.json'),
      await readFile(join(profileDir, 'settings.json'), 'utf8'),
      'utf8',
    );
    await writeFile(
      join(dir, 'policy-rules.json'),
      JSON.stringify([
        {
          domain: 'payment',
          condition: { all: [{ field: 'amount', op: 'lte', value: 1000, currency: 'HKD' }] },
          action: 'allow',
          note: '小額付款放行',
        },
      ]),
      'utf8',
    );

    return dir;
  }

  it('第一次啟動時填入，已經有列時不再填', async () => {
    const dir = await profileWithOneRule();
    const db = await createTempDatabase();

    try {
      await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

      const first = await seedSettings({ pool: db.pool, profileDir: dir, env: {}, log: silent });
      expect(first.seededRules).toBe(1);

      const second = await seedSettings({ pool: db.pool, profileDir: dir, env: {}, log: silent });
      expect(second.seededRules).toBe(0);

      const rows = await db.pool.query('select count(*)::int as n from policy_rule');
      expect(rows.rows[0]).toMatchObject({ n: 1 });
    } finally {
      await db.drop();
    }
  });

  it('規則被刪光（只剩已刪除的列）之後重啟：不會長回來', async () => {
    const dir = await profileWithOneRule();
    const db = await createTempDatabase();

    try {
      await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
      await seedSettings({ pool: db.pool, profileDir: dir, env: {}, log: silent });

      await db.pool.query('update policy_rule set deleted_at = now()');

      const third = await seedSettings({ pool: db.pool, profileDir: dir, env: {}, log: silent });

      expect(third.seededRules).toBe(0);

      // 整張表仍然只有那一列（已刪除），可見度為 0。
      const total = await db.pool.query('select count(*)::int as n from policy_rule');
      expect(total.rows[0]).toMatchObject({ n: 1 });

      const visible = await db.pool.query('select count(*)::int as n from policy_rule where deleted_at is null');
      expect(visible.rows[0]).toMatchObject({ n: 0 });
    } finally {
      await db.drop();
    }
  });
});

describe('API：只有老闆可以用', () => {
  beforeEach(async () => {
    await setup({ env: {} });
  });

  it('未登入 401，員工 403', async () => {
    const { app, db } = current();

    const anonymous = await app.inject({ method: 'GET', url: '/settings' });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: 'not_signed_in' });

    const staff = await signInStaff(db);
    const forbidden = await app.inject({ method: 'GET', url: '/settings', headers: staff });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ error: 'forbidden' });

    const write = await app.inject({
      method: 'PUT',
      url: '/settings/acceptance_rule',
      headers: staff,
      payload: { value: 'on_submit' },
    });
    expect(write.statusCode).toBe(403);
  });

  it('老闆可以讀，形狀是 key、value、updatedAt、updatedBy', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);

    const response = await app.inject({ method: 'GET', url: '/settings', headers: { cookie: owner.cookie } });
    expect(response.statusCode).toBe(200);

    const body = response.json() as { settings: { key: string; value: unknown; updatedAt: string; updatedBy: string | null }[] };
    expect(body.settings.map((item) => item.key)).toEqual([
      'acceptance_rule',
      'company_locale',
      'department_isolation',
      'edition',
      'notification_channels',
      'overdue_grace_hours',
    ]);

    for (const item of body.settings) {
      expect(item.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(item.updatedBy).toBeNull();
    }
  });

  it('老闆修改：200，值變了，updatedBy 是老闆，並寫一筆 setting.update', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/acceptance_rule',
      headers: { cookie: owner.cookie },
      payload: { value: 'dept_head' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { setting: { key: string; value: string; updatedBy: string } };
    expect(body.setting).toMatchObject({ key: 'acceptance_rule', value: 'dept_head', updatedBy: owner.id });

    const rows = await auditRows(db, 'setting.update');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.target).toBe('acceptance_rule');
    expect(rows[0]?.actor_id).toBe(owner.id);
    expect(rows[0]?.detail).toMatchObject({ key: 'acceptance_rule', oldValue: 'owner', newValue: 'dept_head' });
    expect(JSON.stringify(rows[0]?.detail)).not.toMatch(SECRET_LIKE);
  });

  it('不可改的 key 回 409，值沒有被改', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);

    for (const key of ['edition', 'install_code']) {
      const response = await app.inject({
        method: 'PUT',
        url: `/settings/${key}`,
        headers: { cookie: owner.cookie },
        payload: { value: 'cn' },
      });

      expect(response.statusCode, key).toBe(409);
      expect(response.json(), key).toMatchObject({ error: 'immutable_setting', key });
    }

    const settings = await readSettings(db);
    expect(settings.get('edition')).toBe('intl');
  });

  it('未知 key 回 404，不會偷偷寫一列', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/payment_threshold',
      headers: { cookie: owner.cookie },
      payload: { value: 5000 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'unknown_setting' });

    const rows = await db.pool.query("select 1 from company_setting where key = 'payment_threshold'");
    expect(rows.rowCount).toBe(0);
  });

  it('值不合法回 422 並說明原因，值沒有被改', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);

    const cases = [
      { key: 'overdue_grace_hours', value: -1 },
      { key: 'overdue_grace_hours', value: 721 },
      { key: 'acceptance_rule', value: 'everyone' },
      { key: 'department_isolation', value: 'true' },
      { key: 'company_locale', value: 'zh-TW' },
    ];

    for (const item of cases) {
      const response = await app.inject({
        method: 'PUT',
        url: `/settings/${item.key}`,
        headers: { cookie: owner.cookie },
        payload: { value: item.value },
      });

      expect(response.statusCode, JSON.stringify(item)).toBe(422);

      const body = response.json() as { error: string; reasons: string[] };
      expect(body.error).toBe('invalid_setting');
      expect(body.reasons[0]).toContain(item.key);
    }

    const settings = await readSettings(db);
    expect(settings.get('overdue_grace_hours')).toBe(0);
    expect(settings.get('acceptance_rule')).toBe('owner');
  });

  it('沒有 body 或沒有 value 回 422', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);

    for (const payload of [{}, { value2: 1 }]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/settings/acceptance_rule',
        headers: { cookie: owner.cookie },
        payload,
      });

      expect(response.statusCode, JSON.stringify(payload)).toBe(422);
    }
  });
});

describe('API：notification_channels 要對版本', () => {
  it('大陸版寫 whatsapp 回 422', async () => {
    await setup({ env: { EDITION: 'cn' } });
    const { app, db } = current();
    const owner = await signInOwner(app, db);

    const rejected = await app.inject({
      method: 'PUT',
      url: '/settings/notification_channels',
      headers: { cookie: owner.cookie },
      payload: { value: ['inapp', 'whatsapp'] },
    });

    expect(rejected.statusCode).toBe(422);
    expect((rejected.json() as { reasons: string[] }).reasons[0]).toContain('whatsapp');

    const accepted = await app.inject({
      method: 'PUT',
      url: '/settings/notification_channels',
      headers: { cookie: owner.cookie },
      payload: { value: ['inapp', 'wecom'] },
    });

    expect(accepted.statusCode).toBe(200);
  });

  it('國際版可以寫 whatsapp', async () => {
    await setup({ env: {} });
    const { app, db } = current();
    const owner = await signInOwner(app, db);

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/notification_channels',
      headers: { cookie: owner.cookie },
      payload: { value: ['inapp', 'whatsapp', 'email'] },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { setting: { value: string[] } }).setting.value).toEqual([
      'inapp',
      'whatsapp',
      'email',
    ]);
  });
});

describe('API：政策規則 CRUD 與軟刪除', () => {
  beforeEach(async () => {
    await setup({ env: {} });
  });

  const newRule = {
    domain: 'payment',
    condition: { all: [{ field: 'amount', op: 'lte', value: 1000, currency: 'HKD' }] },
    action: 'allow',
    note: '小額付款放行',
  };

  it('新增、列出、修改、軟刪除，每一步都有審計', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);
    const headers = { cookie: owner.cookie };

    const created = await app.inject({ method: 'POST', url: '/policy-rules', headers, payload: newRule });
    expect(created.statusCode).toBe(201);

    const rule = (created.json() as { rule: { id: string; priority: number; enabled: boolean; note: string } }).rule;
    expect(rule.priority).toBe(100);
    expect(rule.enabled).toBe(true);
    expect(rule.note).toBe('小額付款放行');

    const listed = await app.inject({ method: 'GET', url: '/policy-rules', headers });
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as { rules: unknown[] }).rules).toHaveLength(1);

    const filtered = await app.inject({ method: 'GET', url: '/policy-rules?domain=outbound', headers });
    expect((filtered.json() as { rules: unknown[] }).rules).toHaveLength(0);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/policy-rules/${rule.id}`,
      headers,
      payload: { priority: 10, enabled: false },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { rule: { priority: number; enabled: boolean } }).rule).toMatchObject({
      priority: 10,
      enabled: false,
    });

    const deleted = await app.inject({ method: 'DELETE', url: `/policy-rules/${rule.id}`, headers });
    expect(deleted.statusCode).toBe(204);

    const afterDelete = await app.inject({ method: 'GET', url: '/policy-rules', headers });
    expect((afterDelete.json() as { rules: unknown[] }).rules).toHaveLength(0);

    const actions = (await auditRows(db)).map((row) => row.action).filter((action) => action.startsWith('policy_rule.'));
    expect(actions).toEqual(['policy_rule.create', 'policy_rule.update', 'policy_rule.delete']);

    for (const row of await auditRows(db)) {
      expect(JSON.stringify(row.detail)).not.toMatch(SECRET_LIKE);
    }
  });

  it('軟刪除：列仍然在表上，deleted_at 有值，decide 不再採用它', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);
    const headers = { cookie: owner.cookie };

    const created = await app.inject({ method: 'POST', url: '/policy-rules', headers, payload: newRule });
    const id = (created.json() as { rule: { id: string } }).rule.id;

    // 刪除之前：命中，放行。
    const before = await listPolicyRules(db.pool);
    expect(decide(before, 'payment', { amount: 500, currency: 'HKD' }).action).toBe('allow');

    await app.inject({ method: 'DELETE', url: `/policy-rules/${id}`, headers });

    const row = await db.pool.query<{ deleted_at: Date | null }>(
      'select deleted_at from policy_rule where id = $1',
      [id],
    );
    expect(row.rows[0]?.deleted_at instanceof Date).toBe(true);

    // 刪除之後：可見的規則沒有它，判斷回到預設的 require_approval。
    const after = await listPolicyRules(db.pool);
    expect(after).toHaveLength(0);
    expect(decide(after, 'payment', { amount: 500, currency: 'HKD' })).toEqual({
      action: 'require_approval',
      ruleId: null,
      reason: 'no_rule_matched',
    });
  });

  it('已刪除的規則：PATCH 與再 DELETE 都是 404', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);
    const headers = { cookie: owner.cookie };

    const created = await app.inject({ method: 'POST', url: '/policy-rules', headers, payload: newRule });
    const id = (created.json() as { rule: { id: string } }).rule.id;

    await app.inject({ method: 'DELETE', url: `/policy-rules/${id}`, headers });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/policy-rules/${id}`,
      headers,
      payload: { priority: 5 },
    });
    expect(patch.statusCode).toBe(404);

    const again = await app.inject({ method: 'DELETE', url: `/policy-rules/${id}`, headers });
    expect(again.statusCode).toBe(404);
  });

  it('不合法的規則回 422：壞掉的條件、未知運算子、金額沒有貨幣、未知欄位', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);
    const headers = { cookie: owner.cookie };

    const cases = [
      { ...newRule, condition: { all: [] } },
      { ...newRule, condition: { all: [{ field: 'amount', op: 'like', value: 1 }] } },
      { ...newRule, condition: { all: [{ field: 'amount', op: 'lte', value: 100 }] } },
      { ...newRule, action: 'maybe' },
      { ...newRule, domain: 'Payment' },
      { ...newRule, surprise: 1 },
    ];

    for (const payload of cases) {
      const response = await app.inject({ method: 'POST', url: '/policy-rules', headers, payload });

      expect(response.statusCode, JSON.stringify(payload)).toBe(422);
      expect((response.json() as { error: string }).error).toBe('invalid_policy_rule');
    }

    const rows = await db.pool.query('select count(*)::int as n from policy_rule');
    expect(rows.rows[0]).toMatchObject({ n: 0 });
  });

  it('不存在的 id 回 404；不是 UUID 的 id 也回 404（不是 500）', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);
    const headers = { cookie: owner.cookie };

    for (const id of [randomUUID(), 'not-a-uuid']) {
      const del = await app.inject({ method: 'DELETE', url: `/policy-rules/${id}`, headers });
      expect(del.statusCode, id).toBe(404);

      const patch = await app.inject({
        method: 'PATCH',
        url: `/policy-rules/${id}`,
        headers,
        payload: { priority: 1 },
      });
      expect(patch.statusCode, id).toBe(404);
    }
  });

  it('PATCH 沒有帶任何欄位回 422', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app, db);
    const headers = { cookie: owner.cookie };

    const created = await app.inject({ method: 'POST', url: '/policy-rules', headers, payload: newRule });
    const id = (created.json() as { rule: { id: string } }).rule.id;

    const response = await app.inject({ method: 'PATCH', url: `/policy-rules/${id}`, headers, payload: {} });
    expect(response.statusCode).toBe(422);
  });
});

describe('舊資料庫升級：0001 至 0003 的庫加新程式', () => {
  it('新 migration 套用成功、既有資料不變、種子照樣填入', async () => {
    const db = await createTempDatabase();
    const legacyDir = await mkdtemp(join(tmpdir(), 'co-legacy-'));
    tempDirs.push(legacyDir);

    try {
      // 1. 舊程式：只有 0001 至 0003。
      await mkdir(legacyDir, { recursive: true });
      for (const name of ['0001_audit_log.sql', '0002_users_sessions.sql', '0003_stored_file.sql']) {
        await writeFile(join(legacyDir, name), await readFile(join(migrationsDir, name), 'utf8'), 'utf8');
      }

      const legacyApplied = await migrate({ pool: db.pool, dir: legacyDir, log: silent });
      expect(legacyApplied).toEqual([
        '0001_audit_log.sql',
        '0002_users_sessions.sql',
        '0003_stored_file.sql',
      ]);

      // 舊庫的資料：一個老闆帳戶與一筆審計。
      const ownerId = randomUUID();
      await db.pool.query(
        `insert into app_user (id, email, display_name, role, password_hash)
         values ($1, 'legacy-boss@example.com', '舊老闆', 'owner', 'x')`,
        [ownerId],
      );
      await db.pool.query(
        `insert into audit_log (actor_type, actor_id, action, target, detail)
         values ('human', $1, 'legacy.marker', 'x', '{"n":1}'::jsonb)`,
        [ownerId],
      );

      const beforeUsers = await db.pool.query('select id, email, role from app_user order by id');
      const beforeAudit = await db.pool.query('select count(*)::int as n from audit_log');

      // 2. 新程式接手：只補舊庫沒有的（0004 與之後新增的）。
      const applied = await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
      expect(applied).toContain('0004_company_settings.sql');
      expect(applied).not.toContain('0003_stored_file.sql');

      // 3. 既有資料一個字都沒動。
      const afterUsers = await db.pool.query('select id, email, role from app_user order by id');
      expect(afterUsers.rows).toEqual(beforeUsers.rows);
      expect((await db.pool.query('select count(*)::int as n from audit_log')).rows[0]).toEqual(
        beforeAudit.rows[0],
      );

      // 4. 新表真的存在。
      const tables = await db.pool.query<{ settings_table: string | null; rules_table: string | null }>(
        `select to_regclass('public.company_setting')::text as settings_table,
                to_regclass('public.policy_rule')::text as rules_table`,
      );
      expect(tables.rows[0]).toEqual({ settings_table: 'company_setting', rules_table: 'policy_rule' });

      // 5. 種子照樣填入，而且只填一次。
      const first = await seedSettings({ pool: db.pool, profileDir, env: {}, log: silent });
      expect(first.seededKeys).toHaveLength(6);

      const second = await seedSettings({ pool: db.pool, profileDir, env: {}, log: silent });
      expect(second.seededKeys).toEqual([]);

      const seeded = await db.pool.query('select count(*)::int as n from company_setting');
      expect(seeded.rows[0]).toMatchObject({ n: 6 });
    } finally {
      await db.drop();
    }
  });
});

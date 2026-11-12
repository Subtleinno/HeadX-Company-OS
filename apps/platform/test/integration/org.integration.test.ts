import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { migrate } from '../../src/migrate';
import { registerOrg } from '../../src/org/routes';
import { seedOrgUnits } from '../../src/org/seed';
import { decide } from '../../src/settings/policy';
import { registerSettings } from '../../src/settings/routes';
import { seedSettings } from '../../src/settings/seed';
import { listPolicyRules } from '../../src/settings/store';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 組織單位與設定繼承的整合測試（issue #81）：真 Postgres（臨時資料庫 co_test_<隨機>）加 Fastify inject。
 *
 * 正式資料庫由頭到尾不插任何列。這裡驗的是單元測試驗不到的東西：
 * 三張表真的寫得進去、trigger 真的擋得住成環（不經 API）、軟刪除的單位真的不再參與繼承、
 * 以及每一個寫入動作真的在 audit_log 留下紀錄。
 */

const migrationsDir = resolve(process.cwd(), 'db/migrations');
const profileDir = resolve(process.cwd(), 'profiles/default');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

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

beforeEach(async () => {
  await setup();
});

async function setup(): Promise<Harness> {
  const db = await createTempDatabase();

  await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
  await seedSettings({ pool: db.pool, profileDir, env: {}, log: silent });
  await seedOrgUnits({ pool: db.pool, log: silent });

  const app = buildServer({ checkDb: ok, checkStorage: ok });
  registerAuth(app, { pool: db.pool, loginHashKey: TEST_KEY, resolveEntry: () => 'internal' });
  registerSettings(app, { pool: db.pool });
  registerOrg(app, { pool: db.pool });
  await app.ready();

  const created: Harness = { app, db, drop: db.drop };
  harness = created;
  return created;
}

function firstSetCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string') {
    throw new Error('回應沒有 Set-Cookie');
  }

  return value;
}

async function signInOwner(app: FastifyInstance): Promise<{ cookie: string; id: string }> {
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

  return { cookie, id: (me.json() as { user: { id: string } }).user.id };
}

async function signInStaff(db: TempDatabase): Promise<{ cookie: string }> {
  const inserted = await db.pool.query<{ id: string }>(
    `insert into app_user (email, display_name, role, department, password_hash)
     values ($1, '員工', 'staff', 'design', $2)
     returning id`,
    [
      `staff-${randomBytes(4).toString('hex')}@example.com`,
      await hashPassword(randomBytes(18).toString('base64url')),
    ],
  );

  const token = createSessionToken();

  await db.pool.query(
    `insert into auth_session (token_hash, user_id, expires_at, entry)
     values ($1, $2, now() + interval '1 day', 'internal')`,
    [hashSessionToken(token), inserted.rows[0]?.id],
  );

  return { cookie: `co_session=${token}` };
}

type UnitJson = { id: string; name: string; type: string; isRoot: boolean };

async function listUnits(app: FastifyInstance, cookie: string): Promise<{
  units: UnitJson[];
  edges: { parentId: string; childId: string; position: number }[];
}> {
  const response = await app.inject({ method: 'GET', url: '/org-units', headers: { cookie } });

  expect(response.statusCode).toBe(200);
  return response.json() as { units: UnitJson[]; edges: { parentId: string; childId: string; position: number }[] };
}

async function rootId(app: FastifyInstance, cookie: string): Promise<string> {
  const { units } = await listUnits(app, cookie);
  const root = units.find((unit) => unit.isRoot);

  expect(root).toBeDefined();
  return root?.id as string;
}

async function createUnit(
  app: FastifyInstance,
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: '/org-units',
    headers: { cookie },
    payload: body,
  });

  return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
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

describe('根單位：只在第一次啟動建立', () => {
  it('全新資料庫恰好一個根單位，名稱與類型固定，沒有上級', async () => {
    const { app } = current();
    const owner = await signInOwner(app);
    const { units, edges } = await listUnits(app, owner.cookie);

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ name: '公司', type: 'company', isRoot: true });
    expect(edges).toEqual([]);
  });

  it('再跑一次種子不會重複建立', async () => {
    const { db } = current();
    const result = await seedOrgUnits({ pool: db.pool, log: silent });

    expect(result).toEqual({ seededRoot: false, rootId: null });
    expect((await db.pool.query('select count(*)::int as n from org_unit')).rows[0]).toEqual({ n: 1 });
  });

  it('把根單位刪掉之後重啟，不會長回來（刪光是一個決定）', async () => {
    const { db } = current();

    // 直接改資料庫：API 不允許刪根單位，但資料庫層面「已經沒有單位」的狀態要能處理。
    await db.pool.query('update org_unit set deleted_at = now() where is_root');

    const result = await seedOrgUnits({ pool: db.pool, log: silent });

    expect(result.seededRoot).toBe(false);
    expect((await db.pool.query('select count(*)::int as n from org_unit')).rows[0]).toEqual({ n: 1 });
  });

  it('種子留下一筆 org_unit.seed 審計，actor 是系統', async () => {
    const { db } = current();
    const rows = await auditRows(db, 'org_unit.seed');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_id).toBe('org-seed');
    expect(rows[0]?.detail).toMatchObject({ name: '公司', type: 'company' });
  });
});

describe('單位 CRUD 與多上級', () => {
  let cookie: string;
  let root: string;

  beforeEach(async () => {
    const { app } = current();
    cookie = (await signInOwner(app)).cookie;
    root = await rootId(app, cookie);
  });

  it('建立三層與菱形，GET 交回全部單位與邊', async () => {
    const { app } = current();

    const brand = await createUnit(app, cookie, { name: '滿月堂', type: 'brand', parentIds: [root] });
    expect(brand.statusCode).toBe(201);

    const brandId = (brand.body.unit as UnitJson).id;
    const region = await createUnit(app, cookie, {
      name: '香港區',
      type: 'region',
      country: 'HK',
      currency: 'HKD',
      timezone: 'Asia/Hong_Kong',
      parentIds: [root],
    });
    const store = await createUnit(app, cookie, {
      name: '銅鑼灣店',
      type: 'store',
      parentIds: [brandId, (region.body.unit as UnitJson).id],
    });

    expect(store.statusCode).toBe(201);
    expect((store.body.parents as unknown[]).length).toBe(2);

    const { units, edges } = await listUnits(app, cookie);

    expect(units).toHaveLength(4);
    expect(units.filter((unit) => unit.isRoot)).toHaveLength(1);
    expect(edges).toHaveLength(4);
    expect(edges.filter((edge) => edge.childId === (store.body.unit as UnitJson).id)).toEqual([
      expect.objectContaining({ position: 0 }),
      expect.objectContaining({ position: 1 }),
    ]);
  });

  it('沒有上級、上級不存在、上級已刪除：都回 422', async () => {
    const { app, db } = current();

    expect((await createUnit(app, cookie, { name: '孤島', type: 'store' })).statusCode).toBe(422);

    const ghost = await createUnit(app, cookie, {
      name: '鬼',
      type: 'store',
      parentIds: ['11111111-1111-4111-8111-111111111111'],
    });
    expect(ghost.statusCode).toBe(422);

    const doomed = await createUnit(app, cookie, { name: '臨時', type: 'team', parentIds: [root] });
    const doomedId = (doomed.body.unit as UnitJson).id;
    await db.pool.query('update org_unit set deleted_at = now() where id = $1', [doomedId]);

    const afterDelete = await createUnit(app, cookie, {
      name: '掛住死單位',
      type: 'store',
      parentIds: [doomedId],
    });
    expect(afterDelete.statusCode).toBe(422);
  });

  it('PATCH 改名，審計留有前後值', async () => {
    const { app, db } = current();
    const created = await createUnit(app, cookie, { name: '舊名', type: 'team', parentIds: [root] });
    const id = (created.body.unit as UnitJson).id;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/org-units/${id}`,
      headers: { cookie },
      payload: { name: '新名' },
    });

    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { unit: UnitJson }).unit.name).toBe('新名');

    const rows = await auditRows(db, 'org_unit.update');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.detail).toMatchObject({
      before: { name: '舊名' },
      after: { name: '新名' },
    });
  });

  it('根單位不可以刪、不可以有上級', async () => {
    const { app } = current();

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/org-units/${root}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(409);
    expect((deleted.json() as { error: string }).error).toBe('root_undeletable');

    const added = await app.inject({
      method: 'POST',
      url: `/org-units/${root}/parents`,
      headers: { cookie },
      payload: { parentId: root },
    });
    expect(added.statusCode).toBe(409);
    expect((added.json() as { error: string }).error).toBe('root_has_no_parent');
  });

  it('有下級不可以刪；下級刪光之後可以刪，並且是軟刪除', async () => {
    const { app, db } = current();
    const brand = await createUnit(app, cookie, { name: '品牌', type: 'brand', parentIds: [root] });
    const brandId = (brand.body.unit as UnitJson).id;
    const store = await createUnit(app, cookie, { name: '店', type: 'store', parentIds: [brandId] });
    const storeId = (store.body.unit as UnitJson).id;

    const blocked = await app.inject({
      method: 'DELETE',
      url: `/org-units/${brandId}`,
      headers: { cookie },
    });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: string }).error).toBe('has_children');

    await app.inject({ method: 'DELETE', url: `/org-units/${storeId}`, headers: { cookie } });

    const allowed = await app.inject({
      method: 'DELETE',
      url: `/org-units/${brandId}`,
      headers: { cookie },
    });
    expect(allowed.statusCode).toBe(204);

    const row = await db.pool.query<{ deleted_at: Date | null }>(
      'select deleted_at from org_unit where id = $1',
      [brandId],
    );
    expect(row.rows[0]?.deleted_at).not.toBeNull();
  });

  it('移除最後一個上級回 409；有兩個上級時可以移除一個', async () => {
    const { app } = current();
    const a = await createUnit(app, cookie, { name: 'A', type: 'team', parentIds: [root] });
    const b = await createUnit(app, cookie, { name: 'B', type: 'team', parentIds: [root] });
    const aId = (a.body.unit as UnitJson).id;
    const bId = (b.body.unit as UnitJson).id;
    const child = await createUnit(app, cookie, {
      name: 'C',
      type: 'team',
      parentIds: [aId, bId],
    });
    const childId = (child.body.unit as UnitJson).id;

    const removed = await app.inject({
      method: 'DELETE',
      url: `/org-units/${childId}/parents/${bId}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(204);

    const last = await app.inject({
      method: 'DELETE',
      url: `/org-units/${childId}/parents/${aId}`,
      headers: { cookie },
    });
    expect(last.statusCode).toBe(409);
    expect((last.json() as { error: string }).error).toBe('last_parent');
  });

  it('成環回 409 cycle（A→B→C 之後再加 C→A），自指也一樣', async () => {
    const { app } = current();
    const a = await createUnit(app, cookie, { name: 'A', type: 'team', parentIds: [root] });
    const aId = (a.body.unit as UnitJson).id;
    const b = await createUnit(app, cookie, { name: 'B', type: 'team', parentIds: [aId] });
    const bId = (b.body.unit as UnitJson).id;

    const cycle = await app.inject({
      method: 'POST',
      url: `/org-units/${aId}/parents`,
      headers: { cookie },
      payload: { parentId: bId },
    });
    expect(cycle.statusCode).toBe(409);
    expect((cycle.json() as { error: string }).error).toBe('cycle');

    const self = await app.inject({
      method: 'POST',
      url: `/org-units/${aId}/parents`,
      headers: { cookie },
      payload: { parentId: aId },
    });
    expect(self.statusCode).toBe(409);
    expect((self.json() as { error: string }).error).toBe('cycle');
  });

  it('重複的邊回 409 duplicate_edge', async () => {
    const { app } = current();
    const created = await createUnit(app, cookie, { name: 'A', type: 'team', parentIds: [root] });
    const id = (created.body.unit as UnitJson).id;

    const again = await app.inject({
      method: 'POST',
      url: `/org-units/${id}/parents`,
      headers: { cookie },
      payload: { parentId: root },
    });

    expect(again.statusCode).toBe(409);
    expect((again.json() as { error: string }).error).toBe('duplicate_edge');
  });

  it('不存在的單位：404（形狀不對的 uuid 也是 404，不是 500）', async () => {
    const { app } = current();

    for (const id of ['11111111-1111-4111-8111-111111111111', 'not-a-uuid']) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/org-units/${id}`,
        headers: { cookie },
        payload: { name: 'x' },
      });

      expect(response.statusCode).toBe(404);
    }
  });
});

describe('單位設定：覆寫、繼承與來源', () => {
  let cookie: string;
  let root: string;

  beforeEach(async () => {
    const { app } = current();
    cookie = (await signInOwner(app)).cookie;
    root = await rootId(app, cookie);
  });

  async function putSetting(
    app: FastifyInstance,
    unitId: string,
    key: string,
    value: unknown,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const response = await app.inject({
      method: 'PUT',
      url: `/org-units/${unitId}/settings/${key}`,
      headers: { cookie },
      payload: { value },
    });

    return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
  }

  type SettingRow = { key: string; value: unknown; source: { kind: string; unitId?: string } | null };

  async function effective(
    app: FastifyInstance,
    unitId: string,
  ): Promise<Map<string, SettingRow>> {
    const response = await app.inject({
      method: 'GET',
      url: `/org-units/${unitId}/settings`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as { settings: SettingRow[] };
    return new Map(body.settings.map((row) => [row.key, row]));
  }

  it('菱形：position 小的上級先；改 position 之後換另一個勝出', async () => {
    const { app } = current();
    const brand = await createUnit(app, cookie, { name: '品牌', type: 'brand', parentIds: [root] });
    const region = await createUnit(app, cookie, { name: '地區', type: 'region', parentIds: [root] });
    const brandId = (brand.body.unit as UnitJson).id;
    const regionId = (region.body.unit as UnitJson).id;

    const store = await createUnit(app, cookie, {
      name: '店',
      type: 'store',
      parentIds: [brandId, regionId],
    });
    const storeId = (store.body.unit as UnitJson).id;

    expect((await putSetting(app, brandId, 'overdue_grace_hours', 20)).statusCode).toBe(200);
    expect((await putSetting(app, regionId, 'overdue_grace_hours', 10)).statusCode).toBe(200);

    let settings = await effective(app, storeId);
    expect(settings.get('overdue_grace_hours')).toMatchObject({
      value: 20,
      source: { kind: 'unit', unitId: brandId },
    });

    // 把地區排到品牌前面：先移除那條邊，再用更小的 position 加回去（邊的 position 沒有 PATCH）。
    const removed = await app.inject({
      method: 'DELETE',
      url: `/org-units/${storeId}/parents/${regionId}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(204);

    const readded = await app.inject({
      method: 'POST',
      url: `/org-units/${storeId}/parents`,
      headers: { cookie },
      payload: { parentId: regionId, position: -1 },
    });
    expect(readded.statusCode).toBe(201);

    settings = await effective(app, storeId);
    expect(settings.get('overdue_grace_hours')).toMatchObject({
      value: 10,
      source: { kind: 'unit', unitId: regionId },
    });
  });

  it('自己的覆寫勝過所有上級；移除之後回到上級，再移除回 404', async () => {
    const { app } = current();
    const brand = await createUnit(app, cookie, { name: '品牌', type: 'brand', parentIds: [root] });
    const brandId = (brand.body.unit as UnitJson).id;
    const store = await createUnit(app, cookie, { name: '店', type: 'store', parentIds: [brandId] });
    const storeId = (store.body.unit as UnitJson).id;

    await putSetting(app, brandId, 'acceptance_rule', 'dept_head');
    await putSetting(app, storeId, 'acceptance_rule', 'on_submit');

    expect((await effective(app, storeId)).get('acceptance_rule')).toMatchObject({
      value: 'on_submit',
      source: { kind: 'unit', unitId: storeId },
    });

    const removed = await app.inject({
      method: 'DELETE',
      url: `/org-units/${storeId}/settings/acceptance_rule`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(204);

    expect((await effective(app, storeId)).get('acceptance_rule')).toMatchObject({
      value: 'dept_head',
      source: { kind: 'unit', unitId: brandId },
    });

    const again = await app.inject({
      method: 'DELETE',
      url: `/org-units/${storeId}/settings/acceptance_rule`,
      headers: { cookie },
    });
    expect(again.statusCode).toBe(404);
  });

  it('完全沒有覆寫：回退 company_setting，來源標明 company', async () => {
    const { app } = current();
    const store = await createUnit(app, cookie, { name: '店', type: 'store', parentIds: [root] });
    const storeId = (store.body.unit as UnitJson).id;

    const settings = await effective(app, storeId);

    expect(settings.get('overdue_grace_hours')).toMatchObject({
      value: 0,
      source: { kind: 'company' },
    });
    expect(settings.get('company_locale')).toMatchObject({
      value: 'zh-HK',
      source: { kind: 'company' },
    });
    expect([...settings.keys()]).toEqual([
      'company_locale',
      'notification_channels',
      'overdue_grace_hours',
      'acceptance_rule',
    ]);
  });

  it('不可覆寫的 key 回 422，未知 key 回 404，值不合法回 422', async () => {
    const { app } = current();
    const store = await createUnit(app, cookie, { name: '店', type: 'store', parentIds: [root] });
    const storeId = (store.body.unit as UnitJson).id;

    const notOverridable = await putSetting(app, storeId, 'department_isolation', true);
    expect(notOverridable.statusCode).toBe(422);
    expect(notOverridable.body.error).toBe('not_overridable');

    const unknown = await putSetting(app, storeId, 'no_such_key', 1);
    expect(unknown.statusCode).toBe(404);

    const invalidValue = await putSetting(app, storeId, 'overdue_grace_hours', 9999);
    expect(invalidValue.statusCode).toBe(422);

    // 渠道代碼要對版本目錄。國際版的目錄是超集，所以這裡用一個任何版本都沒有的代碼；
    // 「大陸版拒絕 whatsapp」那條由 settings 的整合測試（EDITION=cn）負責。
    const badChannel = await putSetting(app, storeId, 'notification_channels', ['carrier_pigeon']);
    expect(badChannel.statusCode).toBe(422);
  });

  it('單位設定的寫入與移除都有審計', async () => {
    const { app, db } = current();
    const store = await createUnit(app, cookie, { name: '店', type: 'store', parentIds: [root] });
    const storeId = (store.body.unit as UnitJson).id;

    await putSetting(app, storeId, 'overdue_grace_hours', 48);
    await app.inject({
      method: 'DELETE',
      url: `/org-units/${storeId}/settings/overdue_grace_hours`,
      headers: { cookie },
    });

    const set = await auditRows(db, 'org_unit.setting_set');
    const unset = await auditRows(db, 'org_unit.setting_unset');

    expect(set).toHaveLength(1);
    expect(set[0]?.detail).toMatchObject({ key: 'overdue_grace_hours', newValue: 48 });
    expect(unset).toHaveLength(1);
    expect(unset[0]?.detail).toMatchObject({ key: 'overdue_grace_hours', oldValue: 48 });
  });
});

describe('權限：未登入 401、員工 403', () => {
  it('未登入：全部 401', async () => {
    const { app } = current();

    for (const [method, url] of [
      ['GET', '/org-units'],
      ['POST', '/org-units'],
      ['GET', '/org-units/11111111-1111-4111-8111-111111111111/settings'],
    ] as const) {
      const response = await app.inject({ method, url });

      expect(response.statusCode).toBe(401);
    }
  });

  it('員工：讀與寫都 403', async () => {
    const { app, db } = current();
    const staff = await signInStaff(db);
    const owner = await signInOwner(app);
    const root = await rootId(app, owner.cookie);

    const read = await app.inject({
      method: 'GET',
      url: '/org-units',
      headers: { cookie: staff.cookie },
    });
    expect(read.statusCode).toBe(403);

    const write = await app.inject({
      method: 'POST',
      url: '/org-units',
      headers: { cookie: staff.cookie },
      payload: { name: '偷偷加', type: 'team', parentIds: [root] },
    });
    expect(write.statusCode).toBe(403);
  });
});

describe('政策規則可以掛在單位上', () => {
  it('越近的單位規則先；不帶 unitId 時與 #80 一樣只看整間公司', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app);
    const root = await rootId(app, owner.cookie);
    const brand = await createUnit(app, owner.cookie, { name: '品牌', type: 'brand', parentIds: [root] });
    const brandId = (brand.body.unit as UnitJson).id;
    const store = await createUnit(app, owner.cookie, { name: '店', type: 'store', parentIds: [brandId] });
    const storeId = (store.body.unit as UnitJson).id;

    const condition = { all: [{ field: 'amount', op: 'lte', value: 100, currency: 'HKD' }] };

    // 整間公司：放行
    await app.inject({
      method: 'POST',
      url: '/policy-rules',
      headers: { cookie: owner.cookie },
      payload: { domain: 'payment', condition, action: 'allow', priority: 1 },
    });

    // 分店：要批准
    const storeRule = await app.inject({
      method: 'POST',
      url: '/policy-rules',
      headers: { cookie: owner.cookie },
      payload: {
        domain: 'payment',
        condition,
        action: 'require_approval',
        priority: 999,
        orgUnitId: storeId,
      },
    });
    expect(storeRule.statusCode).toBe(201);

    const rows = await listPolicyRules(db.pool);

    // 資料庫的列是 snake_case；decide 收的是 PolicyRule（orgUnitId）。
    const rules = rows.map((row) => ({
      id: row.id,
      domain: row.domain,
      condition: row.condition,
      action: row.action,
      priority: row.priority,
      enabled: row.enabled,
      orgUnitId: row.org_unit_id,
    }));

    const facts = { amount: 50, currency: 'HKD' };

    expect(decide(rules, 'payment', facts, { unitOrder: [storeId, brandId, root] }).action).toBe(
      'require_approval',
    );
    // 不帶 unitOrder：只看整間公司那條（#80 的行為）。
    expect(decide(rules, 'payment', facts).action).toBe('allow');
  });

  it('orgUnitId 指向不存在的單位：422，不會靜靜寫入一條永遠不會命中的規則', async () => {
    const { app } = current();
    const owner = await signInOwner(app);

    const response = await app.inject({
      method: 'POST',
      url: '/policy-rules',
      headers: { cookie: owner.cookie },
      payload: {
        domain: 'payment',
        condition: { all: [{ field: 'amount', op: 'lte', value: 1, currency: 'HKD' }] },
        action: 'allow',
        orgUnitId: '11111111-1111-4111-8111-111111111111',
      },
    });

    expect(response.statusCode).toBe(422);
  });
});

describe('資料庫層防成環（不經 API）', () => {
  it('直接 INSERT 一條會成環的邊，被 trigger 拒絕', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app);
    const root = await rootId(app, owner.cookie);
    const a = await createUnit(app, owner.cookie, { name: 'A', type: 'team', parentIds: [root] });
    const aId = (a.body.unit as UnitJson).id;
    const b = await createUnit(app, owner.cookie, { name: 'B', type: 'team', parentIds: [aId] });
    const bId = (b.body.unit as UnitJson).id;

    // A 的上級指向 B：B 已經在 A 之下，這條邊會成環。
    await expect(
      db.pool.query('insert into org_unit_edge (parent_id, child_id, position) values ($1, $2, 0)', [
        bId,
        aId,
      ]),
    ).rejects.toThrow(/成環/);

    // 自指：連 check 約束都不用到，trigger 已經先回。
    await expect(
      db.pool.query('insert into org_unit_edge (parent_id, child_id, position) values ($1, $1, 0)', [
        aId,
      ]),
    ).rejects.toThrow(/成環|check/i);
  });

  it('成環與重複邊的 SQLSTATE 分別是 23514 與 23505', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app);
    const root = await rootId(app, owner.cookie);
    const a = await createUnit(app, owner.cookie, { name: 'A', type: 'team', parentIds: [root] });
    const aId = (a.body.unit as UnitJson).id;

    const codeOf = async (query: Promise<unknown>): Promise<string | undefined> => {
      try {
        await query;
        return undefined;
      } catch (error) {
        return (error as { code?: string }).code;
      }
    };

    expect(
      await codeOf(
        db.pool.query('insert into org_unit_edge (parent_id, child_id, position) values ($1, $1, 0)', [
          aId,
        ]),
      ),
    ).toBe('23514');

    expect(
      await codeOf(
        db.pool.query('insert into org_unit_edge (parent_id, child_id, position) values ($1, $2, 0)', [
          root,
          aId,
        ]),
      ),
    ).toBe('23505');
  });
});

describe('舊資料庫升級（#80 的 0001–0004 → 0005 及之後）', () => {
  it('只補 0005 之後的；company_setting 與 policy_rule 資料不變，新欄位全為空', async () => {
    const db = await createTempDatabase();

    try {
      // 1. 只用 0001 至 0004 建一個「#80 的資料庫」。
      const oldDir = await mkdtemp(join(tmpdir(), 'co81-old-migrations-'));
      tempDirs.push(oldDir);

      const files = (await readdir(migrationsDir)).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();

      for (const name of files.filter((file) => file < '0005')) {
        await writeFile(join(oldDir, name), await readFile(join(migrationsDir, name), 'utf8'), 'utf8');
      }

      expect((await migrate({ pool: db.pool, dir: oldDir, log: silent })).at(-1)).toBe(
        '0004_company_settings.sql',
      );

      // 2. 寫一些「老闆已經改過」的資料。
      await db.pool.query(
        `insert into company_setting (key, value) values ('overdue_grace_hours', '48'::jsonb)`,
      );
      const rule = await db.pool.query<{ id: string }>(
        `insert into policy_rule (domain, condition, action, priority)
         values ('payment', '{"all":[{"field":"amount","op":"lte","value":100,"currency":"HKD"}]}'::jsonb, 'allow', 7)
         returning id`,
      );

      const beforeSettings = await db.pool.query('select key, value from company_setting order by key');
      const beforeRules = await db.pool.query(
        'select id, domain, condition, action, priority, enabled, note from policy_rule order by id',
      );

      // 3. 新程式接手：只補 0005 之後的。
      const applied = await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
      expect(applied).toEqual([
        '0005_org_units.sql',
        '0006_app_grants.sql',
        '0007_identities.sql',
        '0008_jobs.sql',
        '0009_session_entry.sql',
        '0010_needs.sql',
        '0011_brands_sites.sql',
        '0012_user_brand_focus.sql',
        '0013_brand_pages.sql',
        '0014_brand_policy.sql',
      '0015_brand_editor.sql',

      '0016_brand_policy_v2.sql',

      '0017_brand_document.sql',
      ]);

      // 4. 既有資料一個字都沒動。
      expect((await db.pool.query('select key, value from company_setting order by key')).rows).toEqual(
        beforeSettings.rows,
      );
      expect(
        (
          await db.pool.query(
            'select id, domain, condition, action, priority, enabled, note from policy_rule order by id',
          )
        ).rows,
      ).toEqual(beforeRules.rows);

      // 5. 新欄位全為空，新表真的存在。
      const orgUnitId = await db.pool.query<{ org_unit_id: string | null }>(
        'select org_unit_id from policy_rule where id = $1',
        [(rule.rows[0] as { id: string }).id],
      );
      expect(orgUnitId.rows[0]?.org_unit_id).toBeNull();

      const tables = await db.pool.query<{ units: string | null; edges: string | null; settings: string | null }>(
        `select to_regclass('public.org_unit')::text as units,
                to_regclass('public.org_unit_edge')::text as edges,
                to_regclass('public.org_unit_setting')::text as settings`,
      );
      expect(tables.rows[0]).toEqual({
        units: 'org_unit',
        edges: 'org_unit_edge',
        settings: 'org_unit_setting',
      });
    } finally {
      await db.drop();
    }
  });
});

describe('審計：每個寫入動作都留痕，detail 不含機密', () => {
  it('建立、加邊、移除邊、刪除都有對應紀錄', async () => {
    const { app, db } = current();
    const owner = await signInOwner(app);
    const root = await rootId(app, owner.cookie);
    const brand = await createUnit(app, owner.cookie, { name: '品牌', type: 'brand', parentIds: [root] });
    const brandId = (brand.body.unit as UnitJson).id;
    const team = await createUnit(app, owner.cookie, { name: '組', type: 'team', parentIds: [root] });
    const teamId = (team.body.unit as UnitJson).id;

    await app.inject({
      method: 'POST',
      url: `/org-units/${teamId}/parents`,
      headers: { cookie: owner.cookie },
      payload: { parentId: brandId },
    });
    await app.inject({
      method: 'DELETE',
      url: `/org-units/${teamId}/parents/${brandId}`,
      headers: { cookie: owner.cookie },
    });
    await app.inject({
      method: 'DELETE',
      url: `/org-units/${teamId}`,
      headers: { cookie: owner.cookie },
    });

    for (const action of [
      'org_unit.seed',
      'org_unit.create',
      'org_unit.edge_add',
      'org_unit.edge_remove',
      'org_unit.delete',
    ]) {
      expect((await auditRows(db, action)).length, action).toBeGreaterThan(0);
    }

    const all = await auditRows(db);
    for (const row of all.filter((entry) => entry.action.startsWith('org_unit.'))) {
      expect(JSON.stringify(row.detail)).not.toMatch(SECRET_LIKE);
      expect(row.actor_id).toBeTruthy();
    }
  });
});

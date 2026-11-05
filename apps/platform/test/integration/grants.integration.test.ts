import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModuleManifest, ModuleRegistry } from '../../src/modules/registry/index';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { registerGrants } from '../../src/grants/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * app 註冊與授權底座（issue #83）：真 Postgres（臨時資料庫 co_test_<隨機>）加 Fastify inject。
 *
 * 正式資料庫由頭到尾不插任何列；種子、帳戶與授權全部在臨時庫裡面建。
 *
 * 這裡驗的是單元測試驗不到的東西：SQL 的約束與 trigger 真的擋得住、狀態轉換與審計在
 * 同一個交易、並發批准不會出現兩個生效授權、以及 #82 的引擎真的被接上去。
 */

const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;
const TEST_KEY = 'test-only-login-hash-key-0123456789abcdef';

/** 測試專用 app 定義。正式 manifest 全部 available: false，所以測試要用自己的。 */
type TestApp = {
  id: string;
  sensitive: boolean;
  available: boolean;
  exposure: 'internal' | 'partner' | 'customer';
};

function testApp(over: Partial<TestApp> & { id: string }): TestApp {
  return {
    sensitive: false,
    available: true,
    exposure: 'internal',
    ...over,
  };
}

function toManifest(app: TestApp, index: number): ModuleManifest {
  return {
    id: app.id,
    title: app.id,
    kind: 'department',
    department: app.id,
    order: index,
    available: app.available,
    route: `/${app.id}`,
    exposure: app.exposure,
    sensitive: app.sensitive,
  };
}

type MutableRegistry = ModuleRegistry & {
  set: (id: string, patch: Partial<TestApp>) => void;
};

function mutableRegistry(apps: TestApp[]): MutableRegistry {
  const items = apps.map((app) => ({ ...app }));

  return {
    listModules: () =>
      items.map((app, index) => toManifest(app, index)),
    departmentKeys: () => items.map((app) => app.id),
    set: (id, patch) => {
      const found = items.find((app) => app.id === id);

      if (found === undefined) {
        throw new Error(`測試 registry 沒有這個 app：${id}`);
      }

      Object.assign(found, patch);
    },
  };
}

type Harness = {
  app: FastifyInstance;
  db: TempDatabase;
  registry: MutableRegistry;
  drop: () => Promise<void>;
  /** 入口由可信 adapter 注入；測試可以改這一個值。 */
  entry: { trusted: 'internal' | 'partner' | 'customer' | null };
  units: { root: string; hk: string; jp: string; shop: string };
};

let harness: Harness | undefined;

function current(): Harness {
  if (harness === undefined) {
    throw new Error('沒有 harness：測試缺少 setup()');
  }

  return harness;
}

beforeEach(async () => {
  await setup();
});

afterEach(async () => {
  if (harness !== undefined) {
    await harness.app.close();
    await harness.drop();
    harness = undefined;
  }
});

async function setup(): Promise<Harness> {
  const db = await createTempDatabase();
  await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

  const registry = mutableRegistry([
    testApp({ id: 'sales' }),
    testApp({ id: 'hr', sensitive: true }),
    testApp({ id: 'beta', available: false }),
  ]);

  const entry: Harness['entry'] = { trusted: 'internal' };

  const app = buildServer({ checkDb: ok, checkStorage: ok });
  registerAuth(app, { pool: db.pool, loginHashKey: TEST_KEY });
  registerGrants(app, {
    pool: db.pool,
    registry,
    resolveEntry: () => entry.trusted,
  });
  await app.ready();

  const units = await seedUnits(db);
  harness = { app, db, registry, drop: db.drop, entry, units };
  return harness;
}

/** 三個單位：root → hk、jp；hk 下面有 shop。用來驗範圍包含。 */
async function seedUnits(db: TempDatabase): Promise<Harness['units']> {
  const insert = async (name: string): Promise<string> => {
    const rows = await db.pool.query<{ id: string }>(
      `insert into org_unit (name, type) values ($1, 'branch') returning id`,
      [name],
    );

    const id = rows.rows[0]?.id;

    if (id === undefined) {
      throw new Error('建立單位失敗');
    }

    return id;
  };

  const root = await insert('公司');
  const hk = await insert('香港');
  const jp = await insert('日本');
  const shop = await insert('香港分店');

  const edge = async (parentId: string, childId: string): Promise<void> => {
    await db.pool.query('insert into org_unit_edge (parent_id, child_id) values ($1, $2)', [
      parentId,
      childId,
    ]);
  };

  await edge(root, hk);
  await edge(root, jp);
  await edge(hk, shop);

  return { root, hk, jp, shop };
}

type Actor = { id: string; cookie: string };

/** 建老闆（走真的 /auth/setup）。 */
async function signUpOwner(): Promise<Actor> {
  const h = current();
  const response = await h.app.inject({
    method: 'POST',
    url: '/auth/setup',
    payload: {
      displayName: '老闆',
      email: `boss-${randomBytes(4).toString('hex')}@example.com`,
      password: randomBytes(18).toString('base64url'),
    },
  });

  expect(response.statusCode).toBe(201);

  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const cookie = String(value).split(';')[0] ?? '';

  const me = await h.app.inject({ method: 'GET', url: '/me', headers: { cookie } });
  const id = (me.json() as { user: { id: string } }).user.id;

  return { id, cookie };
}

/**
 * 建一個員工並直接開一個 session（員工帳戶管理是 S1-08 的事，本張不建 API）。
 * 直接寫資料庫是可以的：這裡要驗的是授權，不是建立帳戶。
 */
async function createStaff(name: string): Promise<Actor> {
  const h = current();
  const rows = await h.db.pool.query<{ id: string }>(
    `insert into app_user (email, display_name, role, department, password_hash)
     values ($1, $2, 'staff', null, 'x') returning id`,
    [`${name}-${randomBytes(3).toString('hex')}@example.com`, name],
  );

  const id = rows.rows[0]?.id;

  if (id === undefined) {
    throw new Error('建立員工失敗');
  }

  const token = createSessionToken();

  await h.db.pool.query(
    `insert into auth_session (token_hash, user_id, expires_at)
     values ($1, $2, now() + interval '1 day')`,
    [hashSessionToken(token), id],
  );

  return { id, cookie: `co_session=${token}` };
}

type GrantBody = {
  id: string;
  userId: string;
  appId: string;
  role: string;
  state: string;
  version: number;
  scope: { kind: string; unitIds?: string[] };
};

function asGrant(response: { json: () => unknown }): GrantBody {
  return (response.json() as { grant: GrantBody }).grant;
}

async function requestGrant(
  actor: Actor,
  body: Record<string, unknown>,
  expected = 201,
): Promise<GrantBody> {
  const h = current();
  const response = await h.app.inject({
    method: 'POST',
    url: '/app-grants',
    headers: { cookie: actor.cookie },
    payload: body,
  });

  expect(response.statusCode, response.body).toBe(expected);
  return asGrant(response);
}

async function act(
  actor: Actor,
  id: string,
  action: 'approve' | 'activate' | 'reject' | 'revoke',
  payload: Record<string, unknown>,
  expected = 200,
): Promise<{ response: Awaited<ReturnType<FastifyInstance['inject']>>; grant: GrantBody | null }> {
  const h = current();
  const response = await h.app.inject({
    method: 'POST',
    url: `/app-grants/${id}/${action}`,
    headers: { cookie: actor.cookie },
    payload,
  });

  expect(response.statusCode, response.body).toBe(expected);

  const body = response.json() as { grant?: GrantBody };
  return { response, grant: body.grant ?? null };
}

/** 行一次「建立 + 批准」，回傳生效的授權。用的都是 owner。 */
async function activeGrant(
  owner: Actor,
  body: Record<string, unknown>,
): Promise<GrantBody> {
  const created = await requestGrant(owner, body);
  const { grant } = await act(owner, created.id, 'approve', { version: created.version });

  expect(grant?.state).toBe('active');
  return grant as GrantBody;
}

function scopeOf(unitIds: string[]): Record<string, unknown> {
  return { kind: 'units', unitIds };
}

describe('申請、批准、生效', () => {
  it('老闆第一次可以為某人建立 app_admin，而且不需要先有第二個管理員', async () => {
    const h = current();
    const owner = await signUpOwner();
    const alice = await createStaff('alice');

    const created = await requestGrant(owner, {
      userId: alice.id,
      appId: 'sales',
      role: 'app_admin',
      scope: { kind: 'all' },
    });

    expect(created.state).toBe('requested');
    expect(created.requestedBy).toBe(owner.id);

    const { response, grant } = await act(owner, created.id, 'approve', {
      version: created.version,
    });

    expect(grant?.state).toBe('active');
    expect(grant?.approvedBy).toBe(owner.id);
    expect((response.json() as { activated: boolean }).activated).toBe(true);

    // 批准與生效是兩個轉換，加上申請一共三筆審計。
    // 同一個交易內 now() 是同一個時間，所以只驗「有哪幾筆」，不驗次序。
    const actions = await h.db.pool.query<{ action: string }>(
      'select action from audit_log where target = $1',
      [created.id],
    );

    expect(actions.rows.map((row) => row.action).sort()).toEqual([
      'app_grant.activate',
      'app_grant.approve',
      'app_grant.request',
    ]);
  });

  it('非敏感 app：管理員可以批准別人的成員授權', async () => {
    const owner = await signUpOwner();
    const alice = await createStaff('alice');
    const bob = await createStaff('bob');
    const h = current();

    await activeGrant(owner, {
      userId: alice.id,
      appId: 'sales',
      role: 'app_admin',
      scope: { kind: 'all' },
    });

    const created = await requestGrant(alice, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: scopeOf([h.units.hk]),
    });

    const { grant } = await act(alice, created.id, 'approve', { version: created.version });
    expect(grant?.state).toBe('active');
  });

  it('敏感 app：管理員批准會被擋，只有老闆可以', async () => {
    const owner = await signUpOwner();
    const alice = await createStaff('alice');
    const bob = await createStaff('bob');

    await activeGrant(owner, {
      userId: alice.id,
      appId: 'hr',
      role: 'app_admin',
      scope: { kind: 'all' },
    });

    const created = await requestGrant(alice, {
      userId: bob.id,
      appId: 'hr',
      role: 'member',
      scope: { kind: 'all' },
    });

    await act(alice, created.id, 'approve', { version: created.version }, 403);

    const { grant } = await act(owner, created.id, 'approve', { version: created.version });
    expect(grant?.state).toBe('active');
  });

  it('已批准但未生效的授權不算有效（approved 不等於 active）', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');

    const created = await requestGrant(owner, {
      userId: bob.id,
      appId: 'beta',
      role: 'member',
      scope: { kind: 'all' },
    });

    // beta 未啟用：批准可以（狀態轉換合法），但生效被擋。
    const { response } = await act(owner, created.id, 'approve', { version: created.version }, 409);

    expect((response.json() as { error: string }).error).toBe('app_not_enabled');

    const rows = await current().db.pool.query<{ state: string }>(
      'select state from app_grant where id = $1',
      [created.id],
    );

    expect(rows.rows[0]?.state).toBe('approved');
  });
});

describe('存取檢查接 #82 的引擎', () => {
  it('未生效的授權不可以存取；生效之後可以', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    const created = await requestGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    const before = await h.app.inject({
      method: 'GET',
      url: '/app-grants/access/sales',
      headers: { cookie: bob.cookie },
    });

    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({ allowed: false, reason: 'grant_missing' });

    await act(owner, created.id, 'approve', { version: created.version });

    const after = await h.app.inject({
      method: 'GET',
      url: '/app-grants/access/sales',
      headers: { cookie: bob.cookie },
    });

    expect(after.json()).toEqual({ allowed: true, via: 'grant' });
  });

  it('approved 不是 active：app 啟用之後仍然不算有效，要另外生效', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    const created = await requestGrant(owner, {
      userId: bob.id,
      appId: 'beta',
      role: 'member',
      scope: { kind: 'all' },
    });

    // 未啟用：批准成功（狀態轉換合法），生效被擋，留在 approved。
    const { response } = await act(owner, created.id, 'approve', { version: created.version }, 409);
    const approved = (response.json() as { grant: GrantBody }).grant;

    expect(approved.state).toBe('approved');

    // app 啟用了，但授權只是「批准了」：存取仍然要拒。
    h.registry.set('beta', { available: true });

    const before = await h.app.inject({
      method: 'GET',
      url: '/app-grants/access/beta',
      headers: { cookie: bob.cookie },
    });

    expect(before.json()).toEqual({ allowed: false, reason: 'grant_missing' });

    const { grant } = await act(owner, approved.id, 'activate', { version: approved.version });

    expect(grant?.state).toBe('active');

    const after = await h.app.inject({
      method: 'GET',
      url: '/app-grants/access/beta',
      headers: { cookie: bob.cookie },
    });

    expect(after.json()).toEqual({ allowed: true, via: 'grant' });
  });

  it('未啟用的 app：存取被拒，原因是 app_disabled', async () => {
    const owner = await signUpOwner();
    const h = current();

    const response = await h.app.inject({
      method: 'GET',
      url: '/app-grants/access/beta',
      headers: { cookie: owner.cookie },
    });

    expect(response.json()).toEqual({ allowed: false, reason: 'app_disabled' });
  });

  it('老闆與管理員都繞不過入口限制', async () => {
    const owner = await signUpOwner();
    const h = current();

    h.entry.trusted = 'customer';

    const asOwner = await h.app.inject({
      method: 'GET',
      url: '/app-grants/access/sales',
      headers: { cookie: owner.cookie, 'x-company-os-entry': 'internal' },
    });

    // 請求自己帶的 X-Company-OS-Entry 沒有作用：入口來自 adapter。
    expect(asOwner.json()).toEqual({ allowed: false, reason: 'entry_not_allowed' });
  });

  it('入口不明時拒絕，不假設是內網', async () => {
    const owner = await signUpOwner();
    const h = current();

    h.entry.trusted = null;

    const response = await h.app.inject({
      method: 'GET',
      url: '/app-grants/access/sales',
      headers: { cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: string }).error).toBe('entry_untrusted');
  });

  it('未登入 401，未知 app 404', async () => {
    const owner = await signUpOwner();
    const h = current();

    const anonymous = await h.app.inject({ method: 'GET', url: '/app-grants/access/sales' });
    expect(anonymous.statusCode).toBe(401);

    const unknown = await h.app.inject({
      method: 'GET',
      url: '/app-grants/access/nope',
      headers: { cookie: owner.cookie },
    });
    expect(unknown.statusCode).toBe(404);
    expect((unknown.json() as { error: string }).error).toBe('unknown_app');
  });
});

describe('拒絕與撤銷', () => {
  it('拒絕要寫理由，並且保留歷史（不硬刪）', async () => {
    const owner = await signUpOwner();
    const alice = await createStaff('alice');
    const bob = await createStaff('bob');
    const h = current();

    await activeGrant(owner, {
      userId: alice.id,
      appId: 'sales',
      role: 'app_admin',
      scope: { kind: 'all' },
    });

    const created = await requestGrant(alice, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    const { grant } = await act(alice, created.id, 'reject', {
      version: created.version,
      reason: '這個 app 不需要他',
    });

    expect(grant?.state).toBe('rejected');
    expect((grant as unknown as { rejectionReason: string }).rejectionReason).toBe(
      '這個 app 不需要他',
    );

    const rows = await h.db.pool.query<{ count: number }>(
      'select count(*)::int as count from app_grant where id = $1',
      [created.id],
    );

    expect(rows.rows[0]?.count).toBe(1);
  });

  it('撤銷之後即刻失去存取，而且不可以再撤銷一次', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    const active = await activeGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    const { grant } = await act(owner, active.id, 'revoke', {
      version: active.version,
      reason: '離職',
    });

    expect(grant?.state).toBe('revoked');

    await act(owner, active.id, 'revoke', { version: (grant as GrantBody).version }, 409);

    const access = await h.app.inject({
      method: 'GET',
      url: '/app-grants/access/sales',
      headers: { cookie: bob.cookie },
    });

    expect(access.json()).toEqual({ allowed: false, reason: 'grant_missing' });
  });

  it('非法狀態轉換回 409：已生效的授權不可以「拒絕」', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');

    const active = await activeGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    await act(owner, active.id, 'reject', { version: active.version, reason: '晚了' }, 409);
  });
});

describe('權限邊界', () => {
  it('管理員不可以在批准這一步自我擴權', async () => {
    const owner = await signUpOwner();
    const alice = await createStaff('alice');

    await activeGrant(owner, {
      userId: alice.id,
      appId: 'sales',
      role: 'app_admin',
      scope: { kind: 'all' },
    });

    // 她已經有 app_admin(all)，所以申請 member(all) 才會產生新的一列。
    const created = await requestGrant(alice, {
      userId: alice.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    await act(alice, created.id, 'approve', { version: created.version }, 403);
  });

  it('不可以授予超出自己可管理的範圍，範圍內就可以', async () => {
    const owner = await signUpOwner();
    const alice = await createStaff('alice');
    const bob = await createStaff('bob');
    const h = current();

    await activeGrant(owner, {
      userId: alice.id,
      appId: 'sales',
      role: 'app_admin',
      scope: { kind: 'subtree', unitIds: [h.units.hk] },
    });

    const tooWide = await h.app.inject({
      method: 'POST',
      url: '/app-grants',
      headers: { cookie: alice.cookie },
      payload: { userId: bob.id, appId: 'sales', role: 'member', scope: { kind: 'all' } },
    });

    expect(tooWide.statusCode).toBe(403);
    expect((tooWide.json() as { error: string }).error).toBe('scope_exceeds_own');

    const inside = await h.app.inject({
      method: 'POST',
      url: '/app-grants',
      headers: { cookie: alice.cookie },
      payload: {
        userId: bob.id,
        appId: 'sales',
        role: 'member',
        scope: scopeOf([h.units.shop]),
      },
    });

    expect(inside.statusCode).toBe(201);
  });

  it('批准者的權限被撤銷之後就批准不了', async () => {
    const owner = await signUpOwner();
    const alice = await createStaff('alice');
    const bob = await createStaff('bob');

    const adminGrant = await activeGrant(owner, {
      userId: alice.id,
      appId: 'sales',
      role: 'app_admin',
      scope: { kind: 'all' },
    });

    const created = await requestGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    await act(owner, adminGrant.id, 'revoke', { version: adminGrant.version });

    await act(alice, created.id, 'approve', { version: created.version }, 403);
  });

  it('manifest 改成敏感之後，未完成的申請按最新敏感度處理', async () => {
    const owner = await signUpOwner();
    const alice = await createStaff('alice');
    const bob = await createStaff('bob');
    const h = current();

    await activeGrant(owner, {
      userId: alice.id,
      appId: 'sales',
      role: 'app_admin',
      scope: { kind: 'all' },
    });

    const created = await requestGrant(alice, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    h.registry.set('sales', { sensitive: true });

    await act(alice, created.id, 'approve', { version: created.version }, 403);

    h.registry.set('sales', { sensitive: false });

    const { grant } = await act(alice, created.id, 'approve', { version: created.version });
    expect(grant?.state).toBe('active');
  });

  it('普通員工查不到別人的授權，只見到自己的', async () => {
    const owner = await signUpOwner();
    const alice = await createStaff('alice');
    const bob = await createStaff('bob');
    const h = current();

    await activeGrant(owner, {
      userId: alice.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    await activeGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    const response = await h.app.inject({
      method: 'GET',
      url: '/app-grants',
      headers: { cookie: alice.cookie },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as { grants: GrantBody[]; page: { total: number } };
    expect(body.grants.map((grant) => grant.userId)).toEqual([alice.id]);
    expect(body.page.total).toBe(1);
  });

  it('管理員只見到自己管理範圍之內的授權', async () => {
    const owner = await signUpOwner();
    const alice = await createStaff('alice');
    const bob = await createStaff('bob');
    const h = current();

    await activeGrant(owner, {
      userId: alice.id,
      appId: 'sales',
      role: 'app_admin',
      scope: { kind: 'subtree', unitIds: [h.units.hk] },
    });

    // 範圍內（hk 的分店）
    await activeGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: scopeOf([h.units.shop]),
    });

    // 範圍外（jp）
    await activeGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: scopeOf([h.units.jp]),
    });

    const response = await h.app.inject({
      method: 'GET',
      url: '/app-grants?appId=sales',
      headers: { cookie: alice.cookie },
    });

    const body = response.json() as { grants: GrantBody[] };
    const scopes = body.grants.map((grant) => (grant.scope.unitIds ?? []).join(','));

    expect(scopes).toContain(h.units.hk);
    expect(scopes).toContain(h.units.shop);
    expect(scopes).not.toContain(h.units.jp);
  });
});

describe('修改 active 授權：不得原地擴權', () => {
  it('擴範圍產生新版本，舊授權在新版本生效前保持原範圍', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    const active = await activeGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: scopeOf([h.units.hk]),
    });

    const patch = await h.app.inject({
      method: 'PATCH',
      url: `/app-grants/${active.id}`,
      headers: { cookie: owner.cookie },
      payload: { version: active.version, scope: { kind: 'all' } },
    });

    expect(patch.statusCode).toBe(201);

    const created = (patch.json() as { grant: GrantBody }).grant;
    expect(created.state).toBe('requested');
    expect((created as unknown as { replacesId: string }).replacesId).toBe(active.id);
    expect(created.userId).toBe(bob.id);

    // 舊授權仍然生效，範圍沒有被改大。
    const stillActive = await h.db.pool.query<{ state: string; scope_kind: string }>(
      'select state, scope_kind from app_grant where id = $1',
      [active.id],
    );

    expect(stillActive.rows[0]).toEqual({ state: 'active', scope_kind: 'units' });

    // 新版本生效之後，舊的自動撤銷，同一時間只有一個生效授權。
    await act(owner, created.id, 'approve', { version: created.version });

    const rows = await h.db.pool.query<{ state: string; scope_kind: string }>(
      'select state, scope_kind from app_grant where user_id = $1 and app_id = $2 order by state',
      [bob.id, 'sales'],
    );

    expect(rows.rows).toEqual([
      { state: 'active', scope_kind: 'all' },
      { state: 'revoked', scope_kind: 'units' },
    ]);
  });

  it('縮範圍可以即時生效（不用批准）', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    const active = await activeGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    const patch = await h.app.inject({
      method: 'PATCH',
      url: `/app-grants/${active.id}`,
      headers: { cookie: owner.cookie },
      payload: { version: active.version, scope: scopeOf([h.units.hk]) },
    });

    expect(patch.statusCode).toBe(200);

    const grant = (patch.json() as { grant: GrantBody }).grant;
    expect(grant.state).toBe('active');
    expect(grant.scope.kind).toBe('units');

    const old = await h.db.pool.query<{ state: string }>(
      'select state from app_grant where id = $1',
      [active.id],
    );

    expect(old.rows[0]?.state).toBe('revoked');
  });

  it('沒有改到任何東西回 422，版本過期回 409', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    const active = await activeGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    const same = await h.app.inject({
      method: 'PATCH',
      url: `/app-grants/${active.id}`,
      headers: { cookie: owner.cookie },
      payload: { version: active.version, scope: { kind: 'all' } },
    });

    expect(same.statusCode).toBe(422);

    const stale = await h.app.inject({
      method: 'PATCH',
      url: `/app-grants/${active.id}`,
      headers: { cookie: owner.cookie },
      payload: { version: active.version + 99, scope: scopeOf([h.units.hk]) },
    });

    expect(stale.statusCode).toBe(409);
  });
});

describe('重送、並發與審計', () => {
  it('重送同一個申請不會產生第二筆', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    const body = {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    };

    const first = await requestGrant(owner, body);

    const second = await h.app.inject({
      method: 'POST',
      url: '/app-grants',
      headers: { cookie: owner.cookie },
      payload: body,
    });

    expect(second.statusCode).toBe(200);
    expect((second.json() as { created: boolean }).created).toBe(false);
    expect((second.json() as { grant: GrantBody }).grant.id).toBe(first.id);

    const count = await h.db.pool.query<{ count: number }>(
      'select count(*)::int as count from app_grant where user_id = $1 and app_id = $2',
      [bob.id, 'sales'],
    );

    expect(count.rows[0]?.count).toBe(1);
  });

  it('兩個併發批准：只有一個成功，不會出現兩次生效', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    const created = await requestGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    const approve = (): Promise<{ statusCode: number }> =>
      h.app.inject({
        method: 'POST',
        url: `/app-grants/${created.id}/approve`,
        headers: { cookie: owner.cookie },
        payload: { version: created.version },
      });

    const results = await Promise.all([approve(), approve()]);
    const codes = results.map((result) => result.statusCode).sort();

    expect(codes).toEqual([200, 409]);

    const rows = await h.db.pool.query<{ state: string }>(
      'select state from app_grant where id = $1',
      [created.id],
    );

    expect(rows.rows[0]?.state).toBe('active');

    const activations = await h.db.pool.query<{ count: number }>(
      "select count(*)::int as count from audit_log where target = $1 and action = 'app_grant.activate'",
      [created.id],
    );

    expect(activations.rows[0]?.count).toBe(1);
  });

  it('批准與撤銷同時發生：結果一致，不會留下兩個生效授權', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    const created = await requestGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    const approve = h.app.inject({
      method: 'POST',
      url: `/app-grants/${created.id}/approve`,
      headers: { cookie: owner.cookie },
      payload: { version: created.version },
    });

    const revoke = h.app.inject({
      method: 'POST',
      url: `/app-grants/${created.id}/revoke`,
      headers: { cookie: owner.cookie },
      payload: { version: created.version },
    });

    const results = await Promise.all([approve, revoke]);

    for (const result of results) {
      expect([200, 409]).toContain(result.statusCode);
    }

    const active = await h.db.pool.query<{ count: number }>(
      "select count(*)::int as count from app_grant where user_id = $1 and state = 'active'",
      [bob.id],
    );

    expect(active.rows[0]?.count ?? 0).toBeLessThan(2);
  });

  it('審計寫不進去，整筆交易回滾', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    const created = await requestGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    // 令寫審計一定失敗：audit_log 是只准追加的表，這裡加一個必然失敗的約束。
    // NOT VALID：只對之後的寫入生效，既有列不用重驗（audit_log 本來就有列）。
    await h.db.pool.query(
      'alter table audit_log add constraint audit_boom check (false) not valid',
    );

    const response = await h.app.inject({
      method: 'POST',
      url: `/app-grants/${created.id}/approve`,
      headers: { cookie: owner.cookie },
      payload: { version: created.version },
    });

    expect(response.statusCode).toBe(500);

    const rows = await h.db.pool.query<{ state: string; version: number }>(
      'select state, version from app_grant where id = $1',
      [created.id],
    );

    expect(rows.rows[0]).toEqual({ state: 'requested', version: 1 });
  });
});

describe('輸入驗證與不洩漏', () => {
  it('未知欄位、未知 app、未知用戶、未知單位、格式錯誤都有明確回應', async () => {
    const owner = await signUpOwner();
    const h = current();

    const cases: { payload: Record<string, unknown>; status: number; error: string }[] = [
      {
        payload: {
          userId: owner.id,
          appId: 'sales',
          role: 'member',
          scope: { kind: 'all' },
          state: 'active',
        },
        status: 422,
        error: 'invalid_grant',
      },
      {
        payload: { userId: owner.id, appId: 'nope', role: 'member', scope: { kind: 'all' } },
        status: 404,
        error: 'unknown_app',
      },
      {
        payload: {
          userId: '11111111-1111-1111-1111-111111111111',
          appId: 'sales',
          role: 'member',
          scope: { kind: 'all' },
        },
        status: 422,
        error: 'unknown_subject',
      },
      {
        payload: {
          userId: owner.id,
          appId: 'sales',
          role: 'member',
          scope: scopeOf(['11111111-1111-1111-1111-111111111111']),
        },
        status: 422,
        error: 'unknown_unit',
      },
      {
        payload: { userId: owner.id, appId: 'sales', role: 'member' },
        status: 422,
        error: 'invalid_grant',
      },
    ];

    for (const item of cases) {
      const response = await h.app.inject({
        method: 'POST',
        url: '/app-grants',
        headers: { cookie: owner.cookie },
        payload: item.payload,
      });

      expect(response.statusCode, JSON.stringify(item.payload)).toBe(item.status);
      expect((response.json() as { error: string }).error).toBe(item.error);
    }
  });

  it('未登入 401；查詢參數不合法 422', async () => {
    const owner = await signUpOwner();
    const h = current();

    const anonymous = await h.app.inject({ method: 'GET', url: '/app-grants' });
    expect(anonymous.statusCode).toBe(401);

    const badQuery = await h.app.inject({
      method: 'GET',
      url: '/app-grants?limit=999',
      headers: { cookie: owner.cookie },
    });
    expect(badQuery.statusCode).toBe(422);

    const badId = await h.app.inject({
      method: 'GET',
      url: '/app-grants/not-a-uuid',
      headers: { cookie: owner.cookie },
    });
    expect(badId.statusCode).toBe(404);
  });

  it('回應不含密碼、session、token 或別人的帳戶資料', async () => {
    const owner = await signUpOwner();
    const bob = await createStaff('bob');
    const h = current();

    await activeGrant(owner, {
      userId: bob.id,
      appId: 'sales',
      role: 'member',
      scope: { kind: 'all' },
    });

    const list = await h.app.inject({
      method: 'GET',
      url: '/app-grants',
      headers: { cookie: owner.cookie },
    });

    const text = list.body;

    expect(text).not.toMatch(/password|token|secret|hash/i);
    expect(text).not.toContain('@example.com');
  });

  it('列表有分頁與穩定排序', async () => {
    const owner = await signUpOwner();
    const h = current();
    const bob = await createStaff('bob');

    for (const unit of [h.units.hk, h.units.jp, h.units.shop]) {
      await activeGrant(owner, {
        userId: bob.id,
        appId: 'sales',
        role: 'member',
        scope: scopeOf([unit]),
      });
    }

    const first = await h.app.inject({
      method: 'GET',
      url: '/app-grants?limit=2&offset=0',
      headers: { cookie: owner.cookie },
    });
    const second = await h.app.inject({
      method: 'GET',
      url: '/app-grants?limit=2&offset=2',
      headers: { cookie: owner.cookie },
    });

    const pageOne = first.json() as { grants: GrantBody[]; page: { total: number } };
    const pageTwo = second.json() as { grants: GrantBody[] };

    expect(pageOne.page.total).toBeGreaterThanOrEqual(3);
    expect(pageOne.grants).toHaveLength(2);
    expect(pageTwo.grants).toHaveLength(1);

    const ids = [...pageOne.grants, ...pageTwo.grants].map((grant) => grant.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

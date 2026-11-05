import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { createHashLimiter, type HashLimiter } from '../../src/auth/hash-limits';
import { registerAgents } from '../../src/agents/index';
import { registerGrants } from '../../src/grants/index';
import { registerStaff } from '../../src/staff/index';
import type { StaffHooks } from '../../src/staff/store';
import { migrate } from '../../src/migrate';
import type { ModuleManifest, ModuleRegistry } from '../../src/modules/registry/index';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * issue #84（員工與 agent 身份）的整合測試骨架。
 *
 * 與 grants.integration.test.ts 的骨架刻意分開：那一張要驗的是授權狀態機，
 * 這一張要驗身份管理與資源保護。真 Postgres（臨時資料庫 co_test_<隨機>），
 * 正式資料庫由頭到尾不插任何列。
 */

const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

export const TEST_LOGIN_HASH_KEY = 'test-only-login-hash-key-0123456789abcdef';

/**
 * `email` 與 `password` 是給 #86 的：老闆重設員工密碼要「重新驗證自己的密碼」，
 * 所以測試要拿得到那串密碼。這一組只存在於測試骨架，不會經 API 回傳。
 */
export type Actor = { id: string; cookie: string; email: string; password: string };

export type Harness = {
  app: FastifyInstance;
  db: TempDatabase;
  /** 測試可以換成自己控制的限制器（例如把它塞滿）。 */
  limiter: { current: HashLimiter };
  /**
   * 測試專用的併發鉤子（issue #86）。物件本身在 app 建立前就交了出去，
   * 所以測試可以在事後才塞入鉤子，而路由每次請求都會重新讀。
   */
  staffHooks: StaffHooks;
  entry: { trusted: 'internal' | 'partner' | 'customer' | null };
  units: { root: string; hk: string; shop: string };
  drop: () => Promise<void>;
};

/**
 * 測試專用 app 清單：sales（內部、非敏感、已開放）與 hr（敏感）。
 * 真正嘅 manifest 全部 available: false，所以測試要自己有一份。
 */
function testRegistry(): ModuleRegistry {
  const apps: Array<Pick<ModuleManifest, 'id' | 'sensitive' | 'available' | 'exposure'>> = [
    { id: 'sales', sensitive: false, available: true, exposure: 'internal' },
    { id: 'hr', sensitive: true, available: true, exposure: 'internal' },
  ];

  return {
    listModules: () =>
      apps.map((app, index) => ({
        ...app,
        title: app.id,
        kind: 'department' as const,
        department: app.id,
        order: index,
        route: `/${app.id}`,
      })),
    departmentKeys: () => apps.map((app) => app.id),
  };
}

export async function createHarness(): Promise<Harness> {
  const db = await createTempDatabase();
  await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

  const limiter = { current: createHashLimiter() };
  const entry: Harness['entry'] = { trusted: 'internal' };

  /**
   * 限制器必須是「同一個實例」：issue 要求所有密碼雜湊流程共用同一資源限制。
   * 所以 auth、staff、agents 三個模組都收到同一個 object 的 run。
   */
  const hashRun = <T>(task: () => Promise<T>): Promise<T> => limiter.current.run(task);

  const app = buildServer({ checkDb: ok, checkStorage: ok });
  const registry = testRegistry();
  const staffHooks: StaffHooks = {};
  registerAuth(app, { pool: db.pool, loginHashKey: TEST_LOGIN_HASH_KEY, hashRun });
  registerGrants(app, { pool: db.pool, registry, resolveEntry: () => entry.trusted });
  registerStaff(app, { pool: db.pool, hashRun, now: () => new Date(), hooks: staffHooks });
  registerAgents(app, {
    pool: db.pool,
    registry,
    resolveEntry: () => entry.trusted,
    now: () => new Date(),
  });
  await app.ready();

  const units = await seedUnits(db);

  return { app, db, limiter, staffHooks, entry, units, drop: db.drop };
}

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
  const shop = await insert('香港分店');

  await db.pool.query('insert into org_unit_edge (parent_id, child_id) values ($1, $2)', [root, hk]);
  await db.pool.query('insert into org_unit_edge (parent_id, child_id) values ($1, $2)', [hk, shop]);

  return { root, hk, shop };
}

export function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  return String(value ?? '').split(';')[0] ?? '';
}

/** 建老闆（走真的 /auth/setup），回傳 id 與可用的 cookie。 */
export async function signUpOwner(h: Harness): Promise<Actor> {
  const email = `boss-${randomBytes(4).toString('hex')}@example.com`;
  const password = randomBytes(18).toString('base64url');

  const response = await h.app.inject({
    method: 'POST',
    url: '/auth/setup',
    payload: { displayName: '老闆', email, password },
  });

  expect(response.statusCode).toBe(201);

  const cookie = cookieFrom(response);
  const me = await h.app.inject({ method: 'GET', url: '/me', headers: { cookie } });

  return { id: (me.json() as { user: { id: string } }).user.id, cookie, email, password };
}

/** 用 email／密碼登入，回傳 cookie。 */
export async function login(h: Harness, email: string, password: string): Promise<string> {
  const response = await h.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });

  expect(response.statusCode).toBe(200);

  return cookieFrom(response);
}

/** 由老闆建立員工，回傳 id、email 與初始密碼。 */
export async function createStaff(
  h: Harness,
  owner: Actor,
  over: { email?: string; displayName?: string; password?: string } = {},
): Promise<{ id: string; email: string; password: string }> {
  const email = over.email ?? `staff-${randomBytes(4).toString('hex')}@example.com`;
  const password = over.password ?? randomBytes(18).toString('base64url');

  const response = await h.app.inject({
    method: 'POST',
    url: '/staff',
    headers: { cookie: owner.cookie },
    payload: {
      displayName: over.displayName ?? '員工',
      email,
      initialPassword: password,
    },
  });

  expect(response.statusCode).toBe(201);

  return { id: (response.json() as { staff: { id: string } }).staff.id, email, password };
}

/** 直接寫一個員工列（不經 API），用於驗「既有資料」的相容性。 */
export async function insertStaffRow(
  h: Harness,
  over: { email?: string; passwordHash?: string } = {},
): Promise<{ id: string; email: string }> {
  const email = over.email ?? `legacy-${randomBytes(4).toString('hex')}@example.com`;

  const rows = await h.db.pool.query<{ id: string }>(
    `insert into app_user (email, display_name, role, department, password_hash)
     values ($1, '舊員工', 'staff', null, $2) returning id`,
    [email, over.passwordHash ?? 'scrypt$16384$8$1$c2FsdA$aGFzaA'],
  );

  const id = rows.rows[0]?.id;

  if (id === undefined) {
    throw new Error('建立舊員工失敗');
  }

  return { id, email };
}

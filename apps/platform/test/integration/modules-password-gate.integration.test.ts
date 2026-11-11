import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { migrate } from '../../src/migrate';
import { loadModules } from '../../src/modules/registry';
import { registerModules } from '../../src/modules/routes';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * issue 140：GET /modules 要同其他受保護路由一樣，擋住未改初始密碼嘅 session。
 *
 * 用真 HTTP（app.listen + fetch）而唔係 app.inject，配合拋棄式 Postgres
 * （co_test_<隨機>）重現真實 session 行為；模組清單讀 repo 嘅 apps/，唔係假資料。
 * 測試入面嘅密碼一律即場隨機產生，唔寫死、唔 log、唔放入回應。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const appsDir = resolve(process.cwd(), 'apps');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;
// 每次跑即場產生，repo 入面唔留任何固定 key。
const TEST_LOGIN_HASH_KEY = randomBytes(32).toString('hex');

const DESIGN_MODULE = [
  {
    id: 'design',
    title: 'Design',
    kind: 'department',
    department: 'design',
    order: 10,
    available: true,
    route: '/design',
  },
];

const OWNER_MODULE_IDS = ['boss', 'design', 'sales', 'ops_finance', 'hr', 'support'];

function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value ?? '').split(';')[0] ?? '';
}

type HttpResult = { status: number; body: Record<string, unknown> };

describe('GET /modules：首次改密碼閘門（issue 140）', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    app = buildServer({ checkDb: ok, checkStorage: ok });
    registerAuth(app, {
      pool: db.pool,
      loginHashKey: TEST_LOGIN_HASH_KEY,
      // 呢張測嘅係密碼閘門，唔係入口；入口守衛另有專屬測試（issue 87）。
      resolveEntry: () => 'internal',
    });
    registerModules(app, { registry: loadModules(appsDir) });

    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const info = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${info.port}`;
    // address 只係用嚟攞 port；keep-alive 由 app.close() 收。
    void address;
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  /** 真 HTTP GET /modules。 */
  async function getModules(cookie?: string): Promise<HttpResult> {
    const response = await fetch(`${baseUrl}/modules`, {
      headers: cookie === undefined ? {} : { cookie },
    });
    const text = await response.text();
    return { status: response.status, body: JSON.parse(text) as Record<string, unknown> };
  }

  /** 直接由資料庫建一個員工 session，flag 由呼叫者決定。 */
  async function staffSession(mustChangePassword: boolean): Promise<{ cookie: string; password: string }> {
    const password = randomPassword();
    const passwordHash = await hashPassword(password);
    const inserted = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash, must_change_password)
       values ($1, '員工', 'staff', 'design', $2, $3)
       returning id`,
      [`staff-${randomBytes(6).toString('hex')}@example.com`, passwordHash, mustChangePassword],
    );

    const token = createSessionToken();
    await db.pool.query(
      `insert into auth_session (token_hash, user_id, expires_at, entry)
       values ($1, $2, $3, 'internal')`,
      [
        hashSessionToken(token),
        inserted.rows[0]?.id,
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      ],
    );

    return { cookie: `co_session=${token}`, password };
  }

  async function ownerCookie(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: `boss-${randomBytes(6).toString('hex')}@example.com`, password: randomPassword() },
    });

    if (response.statusCode !== 201) {
      throw new Error(`setup 失敗：${response.statusCode}`);
    }

    return cookieFrom(response);
  }

  async function changePassword(cookie: string, currentPassword: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { cookie },
      payload: { currentPassword, newPassword: randomPassword() },
    });

    if (response.statusCode !== 200) {
      throw new Error(`改密碼失敗：${response.statusCode}`);
    }

    return cookieFrom(response);
  }

  it('未改初始密碼嘅員工：403 password_change_required', async () => {
    const staff = await staffSession(true);
    const result = await getModules(staff.cookie);

    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: 'password_change_required' });
  });

  it('同一個員工改完密碼：200，清單內容同修復前一致', async () => {
    const staff = await staffSession(true);
    const newCookie = await changePassword(staff.cookie, staff.password);
    const after = await getModules(newCookie);

    // DESIGN_MODULE 係修復前 GET /modules 對 design 員工嘅既有回應（六個欄位、
    // 逐個抄出嚟）。呢度逐格對照，證明修復冇改過清單內容或者回應形狀。
    expect(after.status).toBe(200);
    expect(after.body['modules']).toEqual(DESIGN_MODULE);
  });

  it('老闆與已改密碼員工嘅行為不變', async () => {
    const owner = await ownerCookie();
    const ownerResult = await getModules(owner);
    expect(ownerResult.status).toBe(200);
    expect((ownerResult.body['modules'] as { id: string }[]).map((item) => item.id)).toEqual(
      OWNER_MODULE_IDS,
    );

    const staff = await staffSession(false);
    const staffResult = await getModules(staff.cookie);
    expect(staffResult.status).toBe(200);
    expect(staffResult.body['modules']).toEqual(DESIGN_MODULE);
  });

  it('未登入：仍然係原有嘅 401 not_signed_in', async () => {
    const result = await getModules();

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'not_signed_in' });
  });
});

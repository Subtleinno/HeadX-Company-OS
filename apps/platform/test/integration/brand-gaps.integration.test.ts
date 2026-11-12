import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { registerBrandGaps } from '../../src/brand-gaps/index';
import { registerBrandPages } from '../../src/brand-pages/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 缺口與 Need（issue #58）。
 *
 * 三件事要在真資料庫驗：
 *   1. 重複按「建立 Need」只會有一張工單（唯一索引 ＋ 讀返那一張）。
 *   2. 判斷型缺口只有老闆開得，外判（這裡用有品牌編輯權的員工代替）開不到。
 *   3. Need 驗收之後缺口關閉 —— 狀態是算出來的，不是另存一個欄位。
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

function documentWithGaps() {
  return {
    schema: 2,
    stance: '先白，後墨，再藍。',
    payload: {
      stance: '先白，後墨，再藍。',
      roles: [
        { id: 'paper', group: 'reading', name: 'White', hex: '#F6F3FE', cmyk: '', dark: '', usage: '底色', reason: '先白' },
        { id: 'ink', group: 'reading', name: 'Ink', hex: '#1F1B2D', cmyk: '', dark: '', usage: '文字', reason: '定墨' },
        { id: 'brand.primary', group: 'brand', name: 'Blue', hex: '#DADEF8', cmyk: '', dark: '', usage: '標記', reason: '只標記' },
      ],
      order: { text: '', reason: '' },
      ratios: [],
      contrast_floor: 4.5,
      large_floor: 3,
      pairs: { allowed: [], forbidden: [] },
      tints: [],
    },
    layout: { blocks: [{ kind: 'stance', reason: '先講立場。' }] },
    rationale: {},
    gaps: [
      { item: 'roles.surface', what: '深色底色 surface', type: 'judgement', ruleId: 'color.r1' },
      { item: 'roles.surface_file', what: '深色模式的印刷對照', type: 'file' },
    ],
    refs: [],
  };
}

describe('品牌缺口與 Need', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let ownerCookie: string;
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
    registerBrandGaps(app, { pool: db.pool });
    await app.ready();

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password: randomBytes(24).toString('base64url') },
    });

    ownerCookie = cookieHeader(setup).cookie;

    const brand = await db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('moonic', 'Moonic') returning id",
    );
    brandId = brand.rows[0]?.id ?? '';

    await app.inject({ method: 'GET', url: `/brands/${brandId}/pages`, headers: { cookie: ownerCookie } });

    const saved = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages/color/versions`,
      headers: { cookie: ownerCookie },
      payload: { document: documentWithGaps() },
    });

    expect(saved.statusCode).toBe(201);
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function gaps(cookie = ownerCookie) {
    const response = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/gaps`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);

    return response.json() as {
      items: { pageKey: string; item: string; type: string; needId: string | null; needState: string | null }[];
      counts: { total: number; file: number; judgement: number };
    };
  }

  function createNeed(cookie: string, item: string) {
    return app.inject({
      method: 'POST',
      url: `/brands/${brandId}/gaps/needs`,
      headers: { cookie },
      payload: { pageKey: 'color', item },
    });
  }

  it('缺口由文件講：兩個缺口、一檔案一判斷', async () => {
    const body = await gaps();

    expect(body.counts).toEqual({ total: 2, file: 1, judgement: 1, open: 2 });
    expect(body.items.map((item) => item.item)).toEqual(['roles.surface', 'roles.surface_file']);
  });

  it('建立 Need 之後，同一個缺口有編號與狀態', async () => {
    const response = await createNeed(ownerCookie, 'roles.surface_file');

    expect(response.statusCode).toBe(201);
    const body = response.json() as { need: { code: string }; created: boolean };
    expect(body.created).toBe(true);
    expect(body.need.code).toMatch(/^COS-[A-Z0-9]{2,8}-[0-9]{3}$/);

    const list = await gaps();
    const gap = list.items.find((item) => item.item === 'roles.surface_file');
    expect(gap?.needState).toBe('open');
  });

  it('重複按建立不會產生第二張工單', async () => {
    const first = await createNeed(ownerCookie, 'roles.surface_file');
    const second = await createNeed(ownerCookie, 'roles.surface_file');

    expect(second.statusCode).toBe(200);
    expect((second.json() as { created: boolean }).created).toBe(false);
    expect((second.json() as { need: { id: string } }).need.id).toBe(
      (first.json() as { need: { id: string } }).need.id,
    );

    const count = await db.pool.query<{ n: number }>('select count(*)::int as n from need');
    expect(count.rows[0]?.n).toBe(1);
  });

  it('判斷型缺口：有品牌編輯權的員工開不到，外判不能替公司決定', async () => {
    const staff = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash, must_change_password)
       values ('designer@example.com', '設計師', 'staff', 'design', 'x', false) returning id`,
    );
    const staffId = staff.rows[0]?.id ?? '';

    await db.pool.query('insert into brand_editor (brand_id, user_id) values ($1, $2)', [brandId, staffId]);

    const token = randomBytes(32).toString('base64url');
    const { createSessionToken, hashSessionToken } = await import('../../src/auth/token');
    const sessionToken = createSessionToken();

    await db.pool.query(
      "insert into auth_session (token_hash, user_id, expires_at, entry) values ($1, $2, now() + interval '1 day', 'internal')",
      [hashSessionToken(sessionToken), staffId],
    );

    const staffCookie = `co_session=${sessionToken}`;
    expect(token.length).toBeGreaterThan(0);

    const judgement = await createNeed(staffCookie, 'roles.surface');
    expect(judgement.statusCode).toBe(403);
    expect((judgement.json() as { error: string }).error).toBe('owner_only');

    // 檔案型可以由設計師開（外判未來會是同一個入口）。
    const file = await createNeed(staffCookie, 'roles.surface_file');
    expect(file.statusCode).toBe(201);
  });

  it('判斷型的 Need 預設指派老闆', async () => {
    await createNeed(ownerCookie, 'roles.surface');

    const row = await db.pool.query<{ role: string; kind: string; claimed_at: Date | null }>(
      `select u.role, n.kind, n.claimed_at
         from need n join app_user u on u.id = n.assignee_id`,
    );

    expect(row.rows[0]?.role).toBe('owner');
    expect(row.rows[0]?.kind).toBe('decision');
    expect(row.rows[0]?.claimed_at).not.toBeNull();
  });

  it('Need 驗收之後缺口關閉（狀態是算出來的）', async () => {
    const created = await createNeed(ownerCookie, 'roles.surface_file');
    const needId = (created.json() as { need: { id: string } }).need.id;

    await db.pool.query(
      "update need set uploaded_at = now(), accepted_at = now() where id = $1",
      [needId],
    );

    const list = await gaps();
    const gap = list.items.find((item) => item.item === 'roles.surface_file');
    expect(gap?.needState).toBe('closed');
    expect(list.counts.open).toBe(1);
  });

  it('不是文件裡的缺口：404，不可以靠 API 開任意工單', async () => {
    const response = await createNeed(ownerCookie, 'roles.invented');

    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('gap_not_found');
  });

  it('未登入：401', async () => {
    const response = await app.inject({ method: 'GET', url: `/brands/${brandId}/gaps` });

    expect(response.statusCode).toBe(401);
  });
});

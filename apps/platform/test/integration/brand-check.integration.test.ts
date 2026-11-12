import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { registerBrandCheck } from '../../src/brand-check/index';
import { registerBrandPages } from '../../src/brand-pages/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 驗證規則的 API（issue #59）用真的 Postgres。
 *
 * 要證明三件事：
 *   1. 檢查讀的是現行版本 —— 存了錯色，檢查就講錯色。
 *   2. 檢查一份**未儲存**的文件不會寫入：版本數、品牌版本數都不變。
 *   3. 三態在真資料上也是三態：未有版本回「無法判斷」，不是全綠。
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

const ROLES = [
  { id: 'paper', group: 'reading', name: 'White', hex: '#FFFFFF', cmyk: '', dark: '', usage: '底色', reason: '先白' },
  { id: 'ink', group: 'reading', name: 'Ink', hex: '#1F1B2D', cmyk: '', dark: '', usage: '文字', reason: '定墨' },
  { id: 'brand.primary', group: 'brand', name: 'Blue', hex: '#2B3A8F', cmyk: '', dark: '', usage: '標記', reason: '只標記' },
  { id: 'surface', group: 'reading', name: 'Deep', hex: '#12101A', cmyk: '', dark: '', usage: '深色底', reason: '夜間' },
];

function colourDocument(overrides: Record<string, unknown> = {}) {
  return {
    schema: 2,
    stance: '先白，後墨，再藍。',
    payload: {
      stance: '先白，後墨，再藍。',
      roles: ROLES,
      order: { text: '白 → 墨 → 藍', reason: '順序就是優先級' },
      ratios: [],
      contrast_floor: 4.5,
      large_floor: 3,
      pairs: {
        allowed: [
          { fg: 'ink', bg: 'paper', use: 'body', reason: '正文' },
          { fg: 'paper', bg: 'brand.primary', use: 'large', reason: '標題' },
        ],
        forbidden: [],
      },
      tints: [],
      ...overrides,
    },
    layout: { blocks: [{ kind: 'stance', reason: '先講立場。' }] },
    rationale: {},
    gaps: [],
    refs: [],
  };
}

type CheckBody = {
  items: { ruleId: string; state: string; location: string; detail: string; fix: string }[];
  summary: { pass: number; fail: number; undetermined: number };
  headline: { ruleId: string } | null;
  pageKey: string | null;
};

describe('品牌檢查', () => {
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
    registerBrandCheck(app, { pool: db.pool });
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

    // 順便建立八個固定頁。
    await app.inject({ method: 'GET', url: `/brands/${brandId}/pages`, headers: { cookie } });
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function saveColour(document: ReturnType<typeof colourDocument>) {
    return app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages/color/versions`,
      headers: { cookie },
      payload: { document },
    });
  }

  async function check(payload: Record<string, unknown>, header = { cookie }) {
    return app.inject({ method: 'POST', url: `/brands/${brandId}/check`, headers: header, payload });
  }

  function body(response: { json(): unknown }): CheckBody {
    return response.json() as CheckBody;
  }

  it('存了低對比的色，檢查就講得出實測值', async () => {
    const roles = [
      ...ROLES,
      { id: 'ink.soft', group: 'reading', name: 'Soft', hex: '#9A9A9A', cmyk: '', dark: '', usage: '次要', reason: '輕一點' },
    ];
    const pairs = { allowed: [{ fg: 'ink.soft', bg: 'paper', use: 'body', reason: '' }], forbidden: [] };

    expect((await saveColour(colourDocument({ roles, pairs }))).statusCode).toBe(201);

    const response = await check({ pageKey: 'color' });
    expect(response.statusCode).toBe(200);

    const report = body(response);
    expect(report.pageKey).toBe('color');
    expect(report.items.map((item) => item.ruleId)).toEqual(['color.r1', 'color.r2', 'color.r3', 'color.r4']);

    const rule = report.items.find((item) => item.ruleId === 'color.r2');
    expect(rule?.state).toBe('fail');
    expect(rule?.detail).toContain('實測');
    expect(report.headline?.ruleId).toBe('color.r2');
  });

  it('檢查一份未儲存的文件：只報告，不寫版本也不寫品牌版本', async () => {
    const before = await db.pool.query<{ versions: number; releases: number }>(
      `select (select count(*)::int from brand_page_version) as versions,
              (select count(*)::int from brand_release) as releases`,
    );

    const roles = [
      ...ROLES,
      { id: 'ink.soft', group: 'reading', name: 'Soft', hex: '#9A9A9A', cmyk: '', dark: '', usage: '次要', reason: '' },
    ];
    const pairs = { allowed: [{ fg: 'ink.soft', bg: 'paper', use: 'body', reason: '' }], forbidden: [] };

    const response = await check({ pageKey: 'color', document: colourDocument({ roles, pairs }) });
    expect(response.statusCode).toBe(200);
    expect(body(response).items.find((item) => item.ruleId === 'color.r2')?.state).toBe('fail');

    const after = await db.pool.query<{ versions: number; releases: number }>(
      `select (select count(*)::int from brand_page_version) as versions,
              (select count(*)::int from brand_release) as releases`,
    );

    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('未有版本的頁：每一條規則都講「無法判斷」，不是全綠', async () => {
    const response = await check({ pageKey: 'type' });
    const report = body(response);

    expect(report.items).toHaveLength(3);
    expect(report.summary).toEqual({ pass: 0, fail: 0, undetermined: 3 });
    expect(report.items[0]?.detail).toContain('未有版本');
  });

  it('自定義頁沒有專屬規則：回空報告，不會借用別頁的規則', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/pages`,
      headers: { cookie },
      payload: { name: '包裝', slug: 'packaging', brief: '紙盒與貼紙的規格' },
    });

    expect(created.statusCode).toBe(201);
    const key = (created.json() as { page: { key: string } }).page.key;

    const report = body(await check({ pageKey: key }));
    expect(report.items).toEqual([]);
    expect(report.summary).toEqual({ pass: 0, fail: 0, undetermined: 0 });
  });

  it('不存在的頁與不存在的品牌：都是 404', async () => {
    expect((await check({ pageKey: 'invented' })).statusCode).toBe(404);

    const missing = await app.inject({
      method: 'POST',
      url: '/brands/00000000-0000-4000-8000-000000000000/check',
      headers: { cookie },
      payload: {},
    });

    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { error: string }).error).toBe('brand_not_found');
  });

  it('未登入：401', async () => {
    const response = await app.inject({ method: 'POST', url: `/brands/${brandId}/check`, payload: {} });

    expect(response.statusCode).toBe(401);
  });

  it('交給檢查的文件不合法：400，並且逐條講為咩', async () => {
    const broken = { ...colourDocument(), layout: { blocks: [] } };
    const response = await check({ pageKey: 'color', document: broken });

    expect(response.statusCode).toBe(400);
    const payload = response.json() as { error: string; reasons: string[] };
    expect(payload.error).toBe('invalid_document');
    expect(payload.reasons.length).toBeGreaterThan(0);
  });

  it('檢查一份文件但沒有講是哪一頁：400，而不是靜靜檢查整個品牌', async () => {
    const response = await check({ document: colourDocument() });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('invalid_check');
  });

  it('不給 pageKey：整個品牌一起檢查，12 條規則都在', async () => {
    await saveColour(colourDocument());

    const report = body(await check({}));

    expect(report.pageKey).toBeNull();
    expect(report.items).toHaveLength(12);
    expect(report.summary.fail + report.summary.pass + report.summary.undetermined).toBe(12);
  });
});

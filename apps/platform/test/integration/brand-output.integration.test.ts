import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { registerBrandOutput } from '../../src/brand-output/index';
import { registerBrandPages } from '../../src/brand-pages/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 四種輸出（issue #57）用真的 Postgres。
 *
 * 要證明的是「同一份 payload，四份輸出」與「品牌版本是一個查得返的組成」：
 * 兩件事都住在資料庫（`brand_page_version.document`、`brand_release`），用假
 * store 等於自己證明自己。
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

function colourDocument(hex: string, stance = '先白，後墨，再藍。') {
  return {
    schema: 2,
    stance,
    payload: {
      stance,
      roles: [
        { id: 'paper', group: 'reading', name: 'Afterglow White', hex: '#F6F3FE', cmyk: '3,3,0,0', dark: '', usage: '底色', reason: '先白' },
        { id: 'ink', group: 'reading', name: 'Dusk Ink', hex: '#1F1B2D', cmyk: '80,85,60,70', dark: '', usage: '文字', reason: '定墨' },
        { id: 'brand.primary', group: 'brand', name: 'Signal Blue', hex, cmyk: '18,12,0,0', dark: '', usage: '標記', reason: '只標記一件事' },
        { id: 'surface', group: 'reading', name: 'Deep', hex: '#141018', cmyk: '80,80,60,80', dark: '', usage: '深色底', reason: '深色模式' },
      ],
      order: { text: '先紙，後墨，再藍。', reason: '白是底' },
      ratios: [
        { role: 'paper', percent: 80, reason: '留白' },
        { role: 'ink', percent: 15, reason: '文字' },
        { role: 'brand.primary', percent: 5, reason: '標記' },
      ],
      contrast_floor: 4.5,
      large_floor: 3,
      pairs: { allowed: [{ fg: 'ink', bg: 'paper', use: 'body', reason: '正文' }], forbidden: [] },
      tints: [],
    },
    layout: {
      blocks: [
        { kind: 'stance', reason: '先講立場。' },
        { kind: 'section', source: 'roles', reason: '角色表是主體。' },
      ],
    },
    rationale: {},
    gaps: [{ item: 'roles.surface', what: '深色底色的對比', type: 'judgement', ruleId: 'color.r1' }],
    refs: [],
  };
}

describe('品牌輸出', () => {
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
    registerBrandOutput(app, { pool: db.pool });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password: randomPassword() },
    });

    if (response.statusCode !== 201) {
      throw new Error(`setup 失敗：${response.statusCode} ${response.body}`);
    }

    cookie = cookieHeader(response).cookie;

    const brand = await db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('moonic', 'Moonic 滿月堂') returning id",
    );

    brandId = brand.rows[0]?.id ?? '';

    if (brandId === '') {
      throw new Error('建立品牌之後讀唔返 id');
    }

    // 這條路會順便建立八個固定頁。
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

  it('四種輸出都由同一份現行版本出來', async () => {
    expect((await saveColour(colourDocument('#DADEF8'))).statusCode).toBe(201);

    const tokens = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/output/tokens.json`,
      headers: { cookie },
    });

    expect(tokens.statusCode).toBe(200);
    expect(tokens.json() as unknown).toMatchObject({
      light: { color: { 'brand.primary': { $value: '#DADEF8' } } },
    });

    const prompt = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/output/prompt.md`,
      headers: { cookie },
    });

    expect(prompt.statusCode).toBe(200);
    expect(prompt.body).toContain('內文 4.5:1');
    expect(prompt.body).toContain('色彩 v1');

    const html = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/output/html`,
      headers: { cookie },
    });

    expect(html.statusCode).toBe(200);
    expect(html.body).toContain('先白，後墨，再藍。');
  });

  it('改一個角色，三份文字輸出一起變', async () => {
    await saveColour(colourDocument('#DADEF8'));
    await saveColour(colourDocument('#123456'));

    const tokens = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/output/tokens.json`,
      headers: { cookie },
    });
    const prompt = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/output/prompt.md`,
      headers: { cookie },
    });
    const html = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/output/html`,
      headers: { cookie },
    });

    expect(tokens.body).toContain('#123456');
    expect(tokens.body).not.toContain('#DADEF8');
    expect(prompt.body).toContain('#123456');
    expect(html.body).toContain('#123456');
  });

  it('每一次儲存都留下一個品牌版本，組成讀得返', async () => {
    await saveColour(colourDocument('#DADEF8'));
    await saveColour(colourDocument('#123456'));

    const releases = await db.pool.query<{ release_no: number; pages: { key: string; versionNo: number }[] }>(
      'select release_no, pages from brand_release order by release_no',
    );

    expect(releases.rows.map((row) => row.release_no)).toEqual([1, 2]);
    expect(releases.rows[1]?.pages).toEqual([{ key: 'color', versionNo: 2 }]);
  });

  it('缺口寫得入文件，輸出講得返（缺口不是畫面狀態）', async () => {
    await saveColour(colourDocument('#DADEF8'));

    const prompt = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/output/prompt.md`,
      headers: { cookie },
    });

    expect(prompt.body).toContain('roles.surface');
    expect(prompt.body).toContain('判斷型');
  });

  it('未有版本的固定頁仍然存在，會講「缺」而不是消失', async () => {
    const html = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/output/html`,
      headers: { cookie },
    });

    expect(html.body).toContain('data-page="logo"');
    expect(html.body).toContain('缺');
  });

  it('品牌版本由 0 開始（未有任何儲存）', async () => {
    const prompt = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/output/prompt.md`,
      headers: { cookie },
    });

    expect(prompt.statusCode).toBe(200);
    expect(prompt.body).toContain('品牌版本 v0');
  });

  it('不存在的品牌回 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/brands/00000000-0000-0000-0000-000000000000/output/tokens.json',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
  });

  it('印刷版與螢幕版是同一份內容，只是加了 A4', async () => {
    await saveColour(colourDocument('#DADEF8'));

    const print = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/output/print`,
      headers: { cookie },
    });

    expect(print.statusCode).toBe(200);
    expect(print.body).toContain('size: A4');
    expect(print.body).toContain('先白，後墨，再藍。');
  });
});

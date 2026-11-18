import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { registerBrandGuide } from '../../src/brand-guide/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 品牌引導「五層」投影。
 *
 * 要證明：
 *   1. 層是投影：讀取即時合成，不落表；未填 stage 唔出假空段。
 *   2. design.md 層不收 ?setId=（01–03、04A 方向都是品牌層）。
 *   3. 匯出 .md 有正確的 Content-Disposition 與核准狀態標記。
 *   4. 未知層 kind 404。
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

describe('品牌引導五層投影', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let password = '';
  let ownerCookie = '';
  let brandId = '';

  beforeEach(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    app = buildServer({ checkDb: ok, checkStorage: ok });
    registerAuth(app, {
      pool: db.pool,
      loginHashKey: 'test-only-login-hash-key-0123456789abcdef',
      resolveEntry: () => 'internal',
    });
    registerBrandGuide(app, { pool: db.pool });
    await app.ready();

    password = randomBytes(24).toString('base64url');

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password },
    });
    expect(setup.statusCode).toBe(201);
    ownerCookie = cookieHeader(setup).cookie;

    const brand = await db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('moonic', 'Moonic') returning id",
    );
    brandId = brand.rows[0]?.id ?? '';
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  it('design.md 層即時合成，未填 stage 唔出假空段', async () => {
    // 寫 stage1 的 state（定位宣言），觸發 brief 計算。
    const stateResult = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage1/state`,
      headers: { cookie: ownerCookie },
      payload: {
        state: {
          name: '滿月堂',
          statement: '為都市女性提供可信的針灸調理',
        },
      },
    });
    expect(stateResult.statusCode).toBe(200);

    const layer = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/layer/design-doc`,
      headers: { cookie: ownerCookie },
    });

    expect(layer.statusCode).toBe(200);
    const body = layer.json();
    expect(body.kind).toBe('design-doc');
    expect(Array.isArray(body.sections)).toBe(true);
    // stage1 有內容；stage4a 未填，唔應該出假空段。
    const stages = body.sections.map((s: { stage: string }) => s.stage);
    expect(stages).toContain('stage1');
    expect(stages).not.toContain('stage4a');
    expect(body.exportText).toContain('design.md');
  });

  it('未知層 kind 回 404', async () => {
    const layer = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/layer/nonsense`,
      headers: { cookie: ownerCookie },
    });
    expect(layer.statusCode).toBe(404);
    expect(layer.json().error).toBe('layer_not_found');
  });

  it('design.md 層不收 ?setId=（品牌集）', async () => {
    // 建立品牌集。
    const set = await db.pool.query<{ id: string }>(
      "insert into brand_set (brand_id, name) values ($1, '2026 夏季') returning id",
      [brandId],
    );
    const setId = set.rows[0]?.id ?? '';

    const layer = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/layer/design-doc?setId=${setId}`,
      headers: { cookie: ownerCookie },
    });
    expect(layer.statusCode).toBe(400);
    expect(layer.json().error).toBe('layer_set_mismatch');
  });

  it('匯出 .md 有 Content-Disposition 與核准狀態標記', async () => {
    // 寫 stage1 並核准。
    await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage1/state`,
      headers: { cookie: ownerCookie },
      payload: { state: { name: '滿月堂', statement: '可信的針灸調理' } },
    });
    await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage1/approval`,
      headers: { cookie: ownerCookie },
      payload: { status: 'approved', version: '1.0', note: '', rationale: '鎖定信任感' },
    });

    const exported = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/layer/design-doc.md`,
      headers: { cookie: ownerCookie },
    });

    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toContain('text/markdown');
    expect(exported.headers['content-disposition']).toContain('brand-design.md');
    expect(exported.body).toContain('design.md');
    expect(exported.body).toContain('approved');
    expect(exported.body).toContain('鎖定信任感');
  });

  it('未登入讀層 401', async () => {
    const layer = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/layer/design-doc`,
    });
    expect(layer.statusCode).toBe(401);
  });
});

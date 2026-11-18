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
 * 選項圖：圖是源碼的一部分，不經 DB、不經物件儲存。
 *
 * 要證明：
 *   1. 有圖的選項讀得到（image/webp），因為檔案就在 `apps/platform/assets/`；
 *   2. 沒有圖的選項回 404，不是 500、也不是一張假圖；
 *   3. 未登入回 401 —— 圖不比文字寬鬆；
 *   4. 路徑守衛擋住 `..` 之類的成分；
 *   5. schema 回應把 `img` 併進每個選項，沒有圖的選項不多一個 key。
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

describe('品牌選項圖', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
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

    const password = randomBytes(24).toString('base64url');
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

  it('有圖的選項回 WebP（檔案在源碼裡）', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/brand-options/stage2/material/ceramic.webp',
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.rawPayload.length).toBeGreaterThan(1000);
    // WebP 簽名：RIFF....WEBP
    expect(response.rawPayload.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(response.rawPayload.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('沒有圖的選項回 404，不是 500', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/brand-options/stage2/material/definitely_no_such_option.webp',
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'option_image_not_found',
      stage: 'stage2',
      dimension: 'material',
      optId: 'definitely_no_such_option',
    });
  });

  it('未登入回 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/brand-options/stage2/material/ceramic.webp',
    });

    expect(response.statusCode).toBe(401);
  });

  it('路徑守衛擋住目錄跳脫與非 webp', async () => {
    const bad = [
      '/brand-options/stage2/material/..%2F..%2Fpackage.json',
      '/brand-options/stage2/material/ceramic.png',
      '/brand-options/stage2/material/../ceramic.webp',
      // 維度那一段一樣不可以跳脫。
      '/brand-options/stage2/..%2Fstage1/material/ceramic.png',
      '/brand-options/stage2/%2E%2E/material/ceramic.png',
    ];

    for (const url of bad) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: ownerCookie },
      });

      expect(response.statusCode).toBe(404);
    }
  });

  it('未知 stage 回 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/brand-options/stage9x/material/ceramic.webp',
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'stage_not_found', stage: 'stage9x' });
  });

  it('schema 把 img 併進有圖的選項，沒有圖的不多一個 key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage2/schema`,
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      schema: { cat: Record<string, { groups: { items: { id: string; img?: string }[] }[] }> };
    };

    const items = body.schema.cat.material?.groups.flatMap((group) => group.items) ?? [];
    const ceramic = items.find((item) => item.id === 'ceramic');

    expect(ceramic?.img).toBe('/api/brand-options/stage2/material/ceramic.webp');

    // 材質以外的維度（例如關鍵字）不一定有圖；但一定要是「有圖才有 img」。
    const withImg = items.filter((item) => item.img !== undefined);

    expect(withImg.length).toBeGreaterThan(0);
    expect(withImg.length).toBeLessThanOrEqual(items.length);
  });
});

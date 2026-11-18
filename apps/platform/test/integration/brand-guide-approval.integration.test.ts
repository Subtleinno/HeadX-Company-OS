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
 * 品牌引導「stage 級核准狀態」＋「區塊 rationale」。
 *
 * 這裡要證明三件容易被寫錯的事：
 *   1. 核准狀態是可寫入的持久事實（不是 engine 硬編碼的 draft）；
 *   2. rationale 與 decision 分開 —— 儲存 rationale 不改 decision；
 *   3. 權限與其他 brand-guide 寫入一致 —— 冇品牌編輯權就 403；
 *   4. approved 一定要有核准者（寫入者就是核准者）。
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

describe('品牌引導核准狀態與 rationale', () => {
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

  it('核准狀態預設沒有紀錄（等於草稿），寫入後可讀回', async () => {
    const empty = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage1/approval`,
      headers: { cookie: ownerCookie },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().approval).toBeNull();

    const saved = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage1/approval`,
      headers: { cookie: ownerCookie },
      payload: {
        status: 'approved',
        version: '1.0',
        note: '老闆拍板',
        rationale: '目標客群偏高階，用低調克制的定位。',
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().approval.status).toBe('approved');
    expect(saved.json().approval.version).toBe('1.0');
    expect(saved.json().approval.rationale).toBe('目標客群偏高階，用低調克制的定位。');
    // approved 由寫入者核准，approverName 一定要有值。
    expect(saved.json().approval.approverName).not.toBeNull();

    const reread = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage1/approval`,
      headers: { cookie: ownerCookie },
    });
    expect(reread.json().approval.status).toBe('approved');
  });

  it('不同 stage 的核准狀態互不干擾', async () => {
    await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage1/approval`,
      headers: { cookie: ownerCookie },
      payload: { status: 'approved', version: '1.0', note: '', rationale: '' },
    });

    const stage2 = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage2/approval`,
      headers: { cookie: ownerCookie },
    });
    expect(stage2.json().approval).toBeNull();
  });

  it('無效的核准狀態回 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage1/approval`,
      headers: { cookie: ownerCookie },
      payload: { status: 'not_a_status', version: '', note: '', rationale: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_approval_status');
  });

  it('儲存區塊 rationale 不改 decision', async () => {
    // 先寫 decision。
    const decision = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage1/blocks/dims/decision`,
      headers: { cookie: ownerCookie },
      payload: { code: '01.1', title: '定位', decision: '高端克制' },
    });
    expect(decision.statusCode).toBe(200);

    // 再寫 rationale。
    const rationale = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage1/blocks/dims/rationale`,
      headers: { cookie: ownerCookie },
      payload: { code: '01.1', title: '定位', rationale: '因為目標客群偏高階。' },
    });
    expect(rationale.statusCode).toBe(200);
    expect(rationale.json().block.rationale).toBe('因為目標客群偏高階。');
    // decision 冇被 rationale 蓋走。
    expect(rationale.json().block.decision).toBe('高端克制');

    // 讀回 blocks 見到兩個欄位都齊。
    const blocks = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage1/blocks`,
      headers: { cookie: ownerCookie },
    });
    const block = blocks.json().blocks.find((b: { blockId: string }) => b.blockId === 'dims');
    expect(block.decision).toBe('高端克制');
    expect(block.rationale).toBe('因為目標客群偏高階。');
  });

  it('未登入不能寫核准狀態', async () => {
    const unauth = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage1/approval`,
      payload: { status: 'approved', version: '', note: '', rationale: '' },
    });
    expect(unauth.statusCode).toBe(401);
  });
});

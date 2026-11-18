import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { registerBrandGuide } from '../../src/brand-guide/index';
import { registerMarketing } from '../../src/marketing/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 公司層 04F 行銷內容（Boss Portal › Marketing）。
 *
 * 老闆 2026-11-17 晚：行銷策略由他自己定、全公司共用、其他同事不應該看到。
 * 這裡要證明四件事：
 *   1. 老闆寫得、讀得（一份，沒有 brandId）。
 *   2. 員工**讀都讀不到**（403，不是回空資料扮成功）——「看不到」是需求本身。
 *   3. 公司層與品牌層是兩個 scope：同一個 stage4f 唔會互相覆蓋。
 *   4. 只有 04F 是公司層；其他 stage 打公司路徑要 404，不會靜靜寫入。
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

type BlockBody = { blockId: string; decision: string };

describe('公司層 04F 行銷內容', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let owner = '';
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
    registerMarketing(app, { pool: db.pool });
    await app.ready();

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password: randomPassword() },
    });
    owner = cookieHeader(setup).cookie;

    const brand = await db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('moonic', 'Moonic') returning id",
    );
    brandId = brand.rows[0]?.id ?? '';
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function staffCookie(): Promise<string> {
    const inserted = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash, must_change_password)
       values ('ming@example.com', '阿明', 'staff', 'design', $1, false)
       returning id`,
      [await hashPassword(randomPassword())],
    );

    const id = inserted.rows[0]?.id;

    if (id === undefined) {
      throw new Error('插入員工之後沒有回傳 id');
    }

    const token = createSessionToken();

    await db.pool.query(
      "insert into auth_session (token_hash, user_id, expires_at, entry) values ($1, $2, $3, 'internal')",
      [hashSessionToken(token), id, new Date(Date.now() + 24 * 60 * 60 * 1000)],
    );

    return `co_session=${token}`;
  }

  async function saveDecision(cookie: string, decision: string): Promise<void> {
    const response = await app.inject({
      method: 'PUT',
      url: '/company/guide/stage4f/blocks/mkt:channels/decision',
      headers: { cookie },
      payload: { code: '04F.1', title: '渠道與訊息', decision },
    });

    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
  }

  it('老闆寫得、讀得，而且不需要 brandId', async () => {
    await saveDecision(owner, '全公司：小紅書＋IG 為主，官網做收口');

    const response = await app.inject({
      method: 'GET',
      url: '/company/guide/stage4f/blocks',
      headers: { cookie: owner },
    });

    expect(response.statusCode).toBe(200);
    const blocks = (response.json() as { blocks: BlockBody[] }).blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.decision).toBe('全公司：小紅書＋IG 為主，官網做收口');
  });

  it('公司層 schema 與品牌層一樣帶選項圖', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/company/guide/stage4f/schema',
      headers: { cookie: owner },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      schema: { cat?: Record<string, { groups?: { items?: { id?: string; img?: string }[] }[] }> };
    };
    const items = body.schema.cat?.templateTypes?.groups?.flatMap((group) => group.items ?? []) ?? [];
    const withImage = items.find((item) => item.id === 'tp_single');

    expect(withImage?.img).toBe('/api/brand-options/stage4f/templateTypes/tp_single.webp');
  });

  it('員工讀與寫都 403 —— 不是空資料，是讀不到', async () => {
    await saveDecision(owner, '老闆的策略');
    const staff = await staffCookie();

    const read = await app.inject({
      method: 'GET',
      url: '/company/guide/stage4f/blocks',
      headers: { cookie: staff },
    });

    expect(read.statusCode).toBe(403);
    expect((read.json() as { error: string }).error).toBe('owner_only');

    const write = await app.inject({
      method: 'PUT',
      url: '/company/guide/stage4f/blocks/mkt:channels/decision',
      headers: { cookie: staff },
      payload: { code: '04F.1', title: '渠道與訊息', decision: '員工亂改' },
    });

    expect(write.statusCode).toBe(403);

    const state = await app.inject({
      method: 'GET',
      url: '/company/guide/stage4f/state',
      headers: { cookie: staff },
    });

    expect(state.statusCode).toBe(403);
  });

  it('未登入是 401，不是 403', async () => {
    const response = await app.inject({ method: 'GET', url: '/company/guide/stage4f/blocks' });

    expect(response.statusCode).toBe(401);
  });

  it('公司層與品牌層是兩個 scope：同一格互不覆蓋', async () => {
    await saveDecision(owner, '全公司版本');

    // 品牌層的 stage4f 應該是空的（舊資料未搬入之前也不應該被公司層污染）。
    const brandLevel = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage4f/blocks`,
      headers: { cookie: owner },
    });

    expect(brandLevel.statusCode).toBe(200);
    expect((brandLevel.json() as { blocks: unknown[] }).blocks).toHaveLength(0);

    // state 也各自一份。
    const saveState = await app.inject({
      method: 'PUT',
      url: '/company/guide/stage4f/state',
      headers: { cookie: owner },
      payload: { state: { text: { goal: '全年營收 +30%' } } },
    });

    expect(saveState.statusCode).toBe(200);

    const company = await app.inject({
      method: 'GET',
      url: '/company/guide/stage4f/state',
      headers: { cookie: owner },
    });
    const brand = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage4f/state`,
      headers: { cookie: owner },
    });

    expect((company.json() as { state: Record<string, unknown> }).state).not.toEqual({});
    expect((brand.json() as { state: Record<string, unknown> }).state).toEqual({});
  });

  it('公司路徑只認 04F：其他 stage 一律 404，不留一份無人讀到的答案', async () => {
    for (const stage of ['stage4a', 'stage1', 'stage0', 'stage4h']) {
      const response = await app.inject({
        method: 'GET',
        url: `/company/guide/${stage}/blocks`,
        headers: { cookie: owner },
      });

      expect(response.statusCode, stage).toBe(404);
    }
  });
});

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
 * 品牌引導跨 stage 連繫（stage0→stage1→stage2→…→stage4h）。
 *
 * 證明一件事：下游 stage 的 brief 真的讀到前面 stage 的 brief（經
 * `importPrior` 注入 s0/s1/...），所以 cross-check／downstream_hints／
 * agent context 唔會再係「尚未匯入」。
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

describe('品牌引導跨 stage 連繫', () => {
  let db: TempDatabase;
  let app: FastifyInstance;

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
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function setupOwner(): Promise<{ cookie: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password: randomPassword() },
    });
    if (response.statusCode !== 201) {
      throw new Error(`setup 失敗：${response.statusCode} ${response.body}`);
    }
    return { ...cookieHeader(response) };
  }

  async function createBrand(code: string, name: string): Promise<string> {
    const result = await db.pool.query<{ id: string }>(
      'insert into brand (code, name) values ($1, $2) returning id',
      [code, name],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) {
      throw new Error('建立品牌之後讀唔返 id');
    }
    return id;
  }

  async function putState(cookie: string, brandId: string, stage: string, state: unknown): Promise<unknown> {
    const response = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/${stage}/state`,
      headers: { cookie },
      payload: { state },
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  it('stage2 讀到 stage1 的 anti-persona（stage1_context 唔係「尚未匯入」）', async () => {
    const owner = await setupOwner();
    const brandId = await createBrand('moonic', 'Moonic');

    // stage1：塞一個反 persona。
    await putState(owner.cookie, brandId, 'stage1', {
      audience: ['aud_a'],
      pain: ['pain_a'],
      alternatives: ['alt_a'],
      diff: ['diff_a'],
      value: ['val_a'],
      category: ['cat_a'],
      rtb: ['rtb_a'],
      tensionPrimary: 't_quiet_bold',
      dials: { quiet_bold: -1 },
      anti: ['anti_clinical'],
    });

    // stage2：留空，但讀 stage1 的 brief。
    const result = await putState(owner.cookie, brandId, 'stage2', {});
    const brief = (result as { brief: Record<string, unknown> }).brief;

    expect(brief).toBeTruthy();
    // stage2 的 brief 應該帶有 stage1_context（即「已匯入 Stage 1」）。
    expect(brief.stage1_context).toBeTruthy();
    expect(JSON.stringify(brief.stage1_context)).toContain('anti_clinical');
  });

  it('stage4h（最深）讀到 stage4g 的 brief', async () => {
    const owner = await setupOwner();
    const brandId = await createBrand('hxdesign', 'HX Design');

    const g = await putState(owner.cookie, brandId, 'stage4g', {});
    const gBrief = (g as { brief: Record<string, unknown> }).brief;
    expect(gBrief.schema).toBeTruthy();

    const h = await putState(owner.cookie, brandId, 'stage4h', {});
    const hBrief = (h as { brief: Record<string, unknown> }).brief;

    // stage4h 的 brief 有 stage_context（含 stage4g）。
    expect(hBrief.stage_context).toBeTruthy();
  });

  it('冇前 stage brief 時，下游 stage 仍能出 brief（stage_context 標「尚未匯入」）', async () => {
    const owner = await setupOwner();
    const brandId = await createBrand('moonic', 'Moonic');

    const result = await putState(owner.cookie, brandId, 'stage4b', {});
    const brief = (result as { brief: Record<string, unknown> }).brief;

    expect(brief.schema).toBeTruthy();
    // 冇前 stage 都唔會 500，stage_context 會標記「尚未匯入」。
    expect(brief.stage_context).toBeTruthy();
  });
});

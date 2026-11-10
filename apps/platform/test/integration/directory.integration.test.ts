import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/migrate';
import {
  approveSite,
  createSite,
  ensureLocalSite,
  listBrands,
  listSites,
} from '../../src/directory/store';
import { parseBrandInput, parseSiteInput, shortenFingerprint } from '../../src/directory/schema';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 品牌同據點：規則是純函數，資料庫那一邊用真 Postgres 跑一次。
 *
 * 為咩要真資料庫：呢張表有三個約束（本機只可以有一台、本機一定已登記、
 * 有邀請就要有到期時間），佢們喺程式碼裡睇唔見。只測試純函數，等於
 * 只測試門口，冇測試門鎖。
 */

const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;

const NOW = new Date('2026-11-10T12:00:00.000Z');

describe('directory schema（純函數）', () => {
  it('據點代碼一律轉大寫', () => {
    const parsed = parseSiteInput({ code: 'hk-hq-01', name: '香港' });

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.value.code : '').toBe('HK-HQ-01');
  });

  it('據點代碼要三段', () => {
    expect(parseSiteInput({ code: 'HKHQ01', name: '香港' }).ok).toBe(false);
  });

  it('公司名可以留空，但唔可以過長', () => {
    expect(parseSiteInput({ code: 'HK-HQ-01', name: '香港' }).ok).toBe(true);
    expect(parseSiteInput({ code: 'HK-HQ-01', name: '香港', companyLabel: 'x'.repeat(81) }).ok).toBe(
      false,
    );
  });

  it('品牌代碼只可以小寫', () => {
    expect(parseBrandInput({ code: 'HxDesign', name: 'HxDesign' }).ok).toBe(true);
    expect(parseBrandInput({ code: 'HX_1', name: 'HxDesign' }).ok).toBe(false);
  });

  it('指紋只顯示頭尾，太短就當冇', () => {
    expect(shortenFingerprint('4d91c0a7f3b28e5d')).toBe('4D:91…5D');
    expect(shortenFingerprint('abc')).toBeNull();
    expect(shortenFingerprint(null)).toBeNull();
  });
});

describe('directory store（真 SQL）', () => {
  let db: TempDatabase;

  beforeAll(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
  });

  afterAll(async () => {
    await db.drop();
  });

  it('第一次讀就補上本機據點，而且代碼跟安裝代碼', async () => {
    const local = await ensureLocalSite(db.pool);

    expect(local.is_local).toBe(true);
    expect(local.status).toBe('registered');
    expect(local.code).toBe('XX-HQ-01');
  });

  it('再讀唔會多開第二台本機', async () => {
    await ensureLocalSite(db.pool);
    const rows = await db.pool.query('select 1 from site where is_local');

    expect(rows.rowCount).toBe(1);
  });

  it('新增據點係 pending，並回一次性憑證', async () => {
    const created = await createSite(
      db.pool,
      { code: 'CN-SZ-01', name: '深圳', companyLabel: '滿月堂（深圳）', city: '深圳' },
      NOW,
    );

    expect(created.ok).toBe(true);

    if (!created.ok) {
      return;
    }

    expect(created.site.status).toBe('pending');
    // 明文憑證只回一次；資料庫只有 hash，所以這裡要對得上。
    expect(created.inviteToken).toHaveLength(48);

    const stored = await db.pool.query<{ invite_token_hash: string }>(
      'select invite_token_hash from site where code = $1',
      ['CN-SZ-01'],
    );

    expect(stored.rows[0]?.invite_token_hash).not.toBe(created.inviteToken);
  });

  it('同一個代碼再建：回 duplicate，唔會覆蓋原本那台', async () => {
    const again = await createSite(db.pool, { code: 'CN-SZ-01', name: '深圳二', companyLabel: null, city: null }, NOW);

    expect(again.ok).toBe(false);

    const rows = await db.pool.query<{ name: string }>('select name from site where code = $1', [
      'CN-SZ-01',
    ]);

    expect(rows.rows[0]?.name).toBe('深圳');
  });

  it('批准之後變 registered，再批一次回 not_pending', async () => {
    const id = await idOf('CN-SZ-01');

    await expect(approveSite(db.pool, id, NOW)).resolves.toBe('approved');

    const site = (await listSites(db.pool, NOW)).find((item) => item.code === 'CN-SZ-01');

    expect(site?.status).toBe('registered');
    expect(site?.fingerprint).not.toBeNull();

    await expect(approveSite(db.pool, id, NOW)).resolves.toBe('not_pending');
  });

  it('批准唔存在的據點：回 missing，唔會靜靜當成功', async () => {
    await expect(
      approveSite(db.pool, '00000000-0000-0000-0000-000000000000', NOW),
    ).resolves.toBe('missing');
  });

  it('清單本機排第一', async () => {
    const items = await listSites(db.pool, NOW);

    expect(items[0]?.isLocal).toBe(true);
  });

  it('品牌按 sort_order 排，唔係按建立時間', async () => {
    await db.pool.query(
      `insert into brand (code, name, sort_order) values
         ('second', '第二', 20), ('first', '第一', 10)`,
    );

    const brands = await listBrands(db.pool);

    expect(brands.map((brand) => brand.code)).toEqual(['first', 'second']);
  });

  async function idOf(code: string): Promise<string> {
    const row = await db.pool.query<{ id: string }>('select id from site where code = $1', [code]);

    return row.rows[0]!.id;
  }
});

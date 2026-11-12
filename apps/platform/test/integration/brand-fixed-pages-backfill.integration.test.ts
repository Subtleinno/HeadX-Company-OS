import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 0020 補齊八個固定頁（issue #87）。
 *
 * 這一張要證明四件事：
 *
 * 1. 舊品牌（0017 之後仍然只有五頁）補得返平台／圖像／已核准範例。
 * 2. 次序對齊 `BRAND_FIXED_PAGES` —— 舊次序是 logo 20／tone 50，不對齊就會
 *    排出「標誌排在平台之前」，與新環境不一致。
 * 3. 冪等：跑兩次結果一樣（部署重跑、測試重跑都不會多出重複頁）。
 * 4. 不越界：已改名的固定頁保留他改的名；自訂頁原封不動；已軟刪除的固定頁
 *    會被重建（固定頁不應該可以被刪走），但歷史那一列仍然留著。
 *
 * 為甚麼不靠 `ensureFixedPages()`：它用 `on conflict do nothing`，永遠改不到
 * 舊品牌已寫死的次序。次序只在 migration 出現一次。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;

type FixedRow = { key: string; name: string; sort_order: number };

/** 新環境應有的八頁，次序與 `BRAND_FIXED_PAGES` 一致。 */
const EXPECTED: readonly { key: string; name: string; order: number }[] = [
  { key: 'home', name: '品牌主頁', order: 10 },
  { key: 'platform', name: '平台', order: 20 },
  { key: 'color', name: '色彩', order: 30 },
  { key: 'type', name: '字體', order: 40 },
  { key: 'logo', name: '標誌', order: 50 },
  { key: 'tone', name: '語氣', order: 60 },
  { key: 'image', name: '圖像', order: 70 },
  { key: 'examples', name: '已核准範例', order: 90 },
];

let db: TempDatabase;
let backfillSql: string;

beforeEach(async () => {
  db = await createTempDatabase();
  await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
  backfillSql = await readFile(resolve(migrationsDir, '0020_brand_fixed_pages_backfill.sql'), 'utf8');
});

afterEach(async () => {
  await db.drop();
});

async function seedBrand(code: string): Promise<string> {
  const result = await db.pool.query<{ id: string }>(
    'insert into brand (code, name) values ($1, $2) returning id',
    [code, `品牌 ${code}`],
  );

  return result.rows[0]!.id;
}

/**
 * 種出 0017 之後的真實舊狀態：五頁、舊次序（logo 20／tone 50）。
 *
 * 不可以靠「插入品牌就自動有頁」—— `insert into brand` 不會建頁，建頁是
 * `ensureFixedPages()` 在 `GET /brands/:id/pages` 時做的。所以這裡要明寫五頁，
 * 否則測試驗的是「零頁變八頁」，不是「五頁變八頁」。
 */
async function seedLegacyFivePages(brandId: string): Promise<void> {
  await db.pool.query(
    `insert into brand_page (brand_id, kind, key, name, sort_order)
     values ($1, 'fixed', 'home', '品牌主頁', 10),
            ($1, 'fixed', 'logo', '標誌', 20),
            ($1, 'fixed', 'color', '色彩', 30),
            ($1, 'fixed', 'type', '字體', 40),
            ($1, 'fixed', 'tone', '語氣', 50)`,
    [brandId],
  );
}

async function fixedRows(brandId: string): Promise<FixedRow[]> {
  const result = await db.pool.query<FixedRow>(
    `select key, name, sort_order
       from brand_page
      where brand_id = $1 and kind = 'fixed' and deleted_at is null
      order by sort_order, key`,
    [brandId],
  );

  return result.rows;
}

describe('補齊八個固定頁', () => {
  it('舊品牌只有五頁時補齊八頁，次序與新環境一致', async () => {
    const brandId = await seedBrand('legacy');
    await seedLegacyFivePages(brandId);

    expect((await fixedRows(brandId)).map((row) => row.key)).toEqual([
      'home',
      'logo',
      'color',
      'type',
      'tone',
    ]);

    await db.pool.query(backfillSql);

    expect(await fixedRows(brandId)).toEqual(
      EXPECTED.map((page) => ({ key: page.key, name: page.name, sort_order: page.order })),
    );
  });

  it('再跑一次結果一樣（冪等）', async () => {
    const brandId = await seedBrand('twice');
    await seedLegacyFivePages(brandId);

    await db.pool.query(backfillSql);
    const first = await fixedRows(brandId);

    await db.pool.query(backfillSql);
    const second = await fixedRows(brandId);

    expect(second).toEqual(first);
    expect(second).toHaveLength(EXPECTED.length);
  });

  it('已改名的固定頁保留他改的名，只對齊次序', async () => {
    const brandId = await seedBrand('renamed');
    await seedLegacyFivePages(brandId);
    await db.pool.query(
      `update brand_page set name = '色彩（我改過）' where brand_id = $1 and kind = 'fixed' and key = 'color'`,
      [brandId],
    );

    await db.pool.query(backfillSql);

    const rows = await fixedRows(brandId);
    expect(rows.find((row) => row.key === 'color')).toEqual({
      key: 'color',
      name: '色彩（我改過）',
      sort_order: 30,
    });
  });

  it('自訂頁原封不動', async () => {
    const brandId = await seedBrand('custom');
    await db.pool.query(
      `insert into brand_page (brand_id, kind, key, name, brief, sort_order)
       values ($1, 'custom', 'packaging', '包裝', '包裝要決定什麼', 60)`,
      [brandId],
    );

    await db.pool.query(backfillSql);

    const custom = await db.pool.query<{ key: string; sort_order: number }>(
      `select key, sort_order from brand_page
        where brand_id = $1 and kind = 'custom' and deleted_at is null`,
      [brandId],
    );

    expect(custom.rows).toEqual([{ key: 'packaging', sort_order: 60 }]);
  });

  it('已軟刪除的固定頁會重建，舊列仍然留著', async () => {
    const brandId = await seedBrand('softdeleted');
    await seedLegacyFivePages(brandId);
    await db.pool.query(
      `update brand_page set deleted_at = now()
        where brand_id = $1 and kind = 'fixed' and key = 'tone'`,
      [brandId],
    );

    await db.pool.query(backfillSql);

    const live = await fixedRows(brandId);
    expect(live.map((row) => row.key)).toContain('tone');
    expect(live).toHaveLength(EXPECTED.length);

    const all = await db.pool.query<{ count: string }>(
      `select count(*)::text as count from brand_page
        where brand_id = $1 and kind = 'fixed' and key = 'tone'`,
      [brandId],
    );
    expect(all.rows[0]?.count).toBe('2');
  });

  it('一次補齊所有品牌，不只第一個', async () => {
    const first = await seedBrand('first');
    const second = await seedBrand('second');
    await seedLegacyFivePages(first);
    await seedLegacyFivePages(second);

    await db.pool.query(backfillSql);

    expect(await fixedRows(first)).toHaveLength(EXPECTED.length);
    expect(await fixedRows(second)).toHaveLength(EXPECTED.length);
  });
});

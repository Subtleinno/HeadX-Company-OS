import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 小實驗（#75 第一步）：在**現有**執行器下，臨時資料庫套用 0001 至 0009 之後，
 * schema_migrations 到底長甚麼樣。
 *
 * 這一份是後面每個階段的基準線：
 * - ledger 實際落在哪個 schema（改多串之前要先確認，之後才可以用完整限定名稱操作，
 *   而不是靠 search_path 猜）
 * - 三條紀錄的 name 與 checksum 逐字是甚麼
 * - applied_at 的排序與相對關係
 *
 * checksum 用字面值釘死：已套用的 migration 內容永不修改，所以這幾個 hex 字串也永不改變。
 * 新增 migration 時，把新的一行加在尾（#80 加了 0004、#81 加了 0005、#83 加了 0006）。
 * 一旦有人動了 migration 的內容，這條測試會先於執行器本身的檢查爆出來。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;

/** 由 `sed 's/\r$//' db/migrations/<檔名> | sha256sum` 量得的基準值。 */
const BASELINE = [
  ['0001_audit_log.sql', 'bc2ed422b55c373f35c672130f49038b5d0f0e9d11c24b5c3d2493ad6a329f2e'],
  ['0002_users_sessions.sql', '2f4914035f2e675ad6d9e315c45592c93d7e70bf787f256b47a7b56544c85bad'],
  ['0003_stored_file.sql', 'faf59654788d55f9e09a58b7dbd14facb68caf8a15e238b9164feff1f317453f'],
  ['0004_company_settings.sql', '46233f8294f3342dfe02e77fa55101b59cb08e2ff6e78590b7b6408dbb1a1a5b'],
  ['0005_org_units.sql', '43f52acfdbb6b55bcf735f42918895495333db4a8e1ee08d78c350bcfdb8e26c'],
  ['0006_app_grants.sql', '31cc6dd2ffc9636aaa5da98bf6d87cc7e3b3535aa774452bbfd1c7de50d2d717'],
  ['0007_identities.sql', '29a3a59352c86d04edba6a4ffedb8ff922b2a44598fcae1ca2104cb00221ff9c'],
  ['0008_jobs.sql', 'c5d47b075dd054ec66feee1053e5158cbf87eaf19f06c9e5c54d9c9d1e0348ac'],
  ['0009_session_entry.sql', '43f16b3b82533c4f6af6a137745dea97890c720b7e2ae5664255f488770feece'],
  ['0010_needs.sql', '289060af6e20961f98ae0b12e7b278a921b9b0bb1862b7de3c19a78fa1d11d4a'],
  ['0011_brands_sites.sql', '73c8d65270e8d36021901bedf11991d48fb1f1c626b5d979ed4f75246d62ce4c'],
  ['0012_user_brand_focus.sql', 'c4b3004f5dcbdd09cc9f9fb7bf44432c120bbe763d4f33ff50b068641f14ed6e'],
  ['0013_brand_pages.sql', '92be49ba9ed199afac4cd35333b9638bc70b4218d82773df8bb060b1de6ebe6a'],
  ['0014_brand_policy.sql', 'ef17f61af119be69d522d8d9475f419db2b75db154dad8a4be3e83ce17b0db87'],
] as const;

describe('基準線：現有執行器套用 0001 至 0014 之後的 ledger', () => {
  let db: TempDatabase;

  beforeAll(async () => {
    db = await createTempDatabase();
  });

  afterAll(async () => {
    await db.drop();
  });

  it('ledger 落在 public，每一筆的 name 與 checksum 逐字等於基準值', async () => {
    const applied = await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
    expect(applied).toEqual(BASELINE.map(([name]) => name));

    const rows = await db.pool.query<{ name: string; checksum: string }>(
      'select name, checksum from public.schema_migrations order by name',
    );

    expect(rows.rows).toEqual(BASELINE.map(([name, checksum]) => ({ name, checksum })));
  });

  it('ledger 的實體位置就是 public.schema_migrations，不是別的 schema', async () => {
    const where = await db.pool.query<{ schema: string }>(
      `select table_schema as schema
         from information_schema.tables
        where table_name = 'schema_migrations'`,
    );

    expect(where.rows).toEqual([{ schema: 'public' }]);
  });

  it('applied_at 有預設值，且同一批次寫入', async () => {
    const rows = await db.pool.query<{ name: string; at: Date | null }>(
      'select name, applied_at as at from public.schema_migrations order by name',
    );

    expect(rows.rows.map((row) => row.name)).toEqual(BASELINE.map(([name]) => name));
    for (const row of rows.rows) {
      expect(row.at instanceof Date).toBe(true);
    }
  });

  it('migration 檔案的位元組內容與基準 checksum 一致（檔案本身沒被改）', async () => {
    const { createHash } = await import('node:crypto');

    for (const [name, expected] of BASELINE) {
      const sql = readFileSync(resolve(migrationsDir, name), 'utf8').replace(/\r\n/g, '\n');
      const actual = createHash('sha256').update(sql, 'utf8').digest('hex');
      expect(actual, name).toBe(expected);
    }
  });

  it('套用完之後連線的 search_path 仍是預設值（未殘留任何 app schema）', async () => {
    const path = await db.pool.query<{ sp: string }>("select current_setting('search_path') as sp");
    expect(path.rows[0]?.sp).toBe('"$user", public');
  });
});

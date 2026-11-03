import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, migrate, type MigrationFile } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 整合測試：需要 db 在跑。每個個案用臨時資料庫 co_test_<隨機>，測完刪除。
 * 正式資料庫不會被寫入任何東西。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const auditLogSql = readFileSync(resolve(migrationsDir, '0001_audit_log.sql'), 'utf8');

describe('migration 執行器', () => {
  let db: TempDatabase;

  beforeAll(async () => {
    db = await createTempDatabase();
  });

  afterAll(async () => {
    await db.drop();
  });

  it('空資料庫套用全部 migration，schema_migrations 只有 0001', async () => {
    const applied = await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    expect(applied).toEqual(['0001_audit_log.sql']);

    const rows = await db.pool.query<{ name: string; checksum: string }>(
      'select name, checksum from schema_migrations order by name',
    );

    expect(rows.rows.map((row) => row.name)).toEqual(['0001_audit_log.sql']);
    expect(rows.rows[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);

    const table = await db.pool.query("select to_regclass('public.audit_log') as reg");
    expect(table.rows[0]?.reg).toBe('audit_log');
  });

  it('再跑一次：沒有任何改動，applied_at 不變', async () => {
    const before = await db.pool.query('select name, applied_at from schema_migrations order by name');

    const applied = await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    expect(applied).toEqual([]);

    const after = await db.pool.query('select name, applied_at from schema_migrations order by name');
    expect(after.rows).toEqual(before.rows);
  });

  it('兩個 runner 同時啟動：只套用一次，沒有重複錯誤', async () => {
    const fresh = await createTempDatabase();

    try {
      const results = await Promise.all([
        migrate({ pool: fresh.pool, dir: migrationsDir, log: silent }),
        migrate({ pool: fresh.pool, dir: migrationsDir, log: silent }),
      ]);

      expect(results.flat()).toEqual(['0001_audit_log.sql']);

      const rows = await fresh.pool.query('select count(*)::int as n from schema_migrations');
      expect(rows.rows[0]?.n).toBe(1);
    } finally {
      await fresh.drop();
    }
  });

  it('已套用檔案的內容被改：拒絕，訊息指出檔名', async () => {
    const fresh = await createTempDatabase();
    const client = await fresh.pool.connect();

    try {
      await applyMigrations({
        client,
        migrations: [{ name: '0001_audit_log.sql', sql: auditLogSql }],
        log: silent,
      });

      await expect(
        applyMigrations({
          client,
          migrations: [{ name: '0001_audit_log.sql', sql: `${auditLogSql}\n-- 有人改了已套用的檔案` }],
          log: silent,
        }),
      ).rejects.toThrow(/0001_audit_log\.sql/);
    } finally {
      client.release();
      await fresh.drop();
    }
  });

  it('資料庫已記錄 LF 版本，改用 CRLF 的內容再跑：不拒絕，也不重複套用', async () => {
    const fresh = await createTempDatabase();
    const dir = await mkdtemp(resolve(tmpdir(), 'company-os-migrations-'));

    try {
      // 先套用 LF 版本：等同在 Linux／CI 建置出來的映像。
      // 由 repo 的檔案讀出來再正規化成 LF，因為這部機的工作樹本身可能是 CRLF。
      const original = await readFile(resolve(migrationsDir, '0001_audit_log.sql'), 'utf8');
      const lf = original.replace(/\r?\n/g, '\n');
      await writeFile(resolve(dir, '0001_audit_log.sql'), lf, 'utf8');

      const first = await migrate({ pool: fresh.pool, dir, log: silent });
      expect(first).toEqual(['0001_audit_log.sql']);

      // 同一個檔案改成 CRLF：等同 core.autocrlf=true 的 Windows 工作樹建出來的映像。
      await writeFile(resolve(dir, '0001_audit_log.sql'), lf.replace(/\n/g, '\r\n'), 'utf8');

      const second = await migrate({ pool: fresh.pool, dir, log: silent });

      expect(second).toEqual([]);

      const rows = await fresh.pool.query('select count(*)::int as n from schema_migrations');
      expect(rows.rows[0]?.n).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
      await fresh.drop();
    }
  });

  it('壞掉的 migration：整個回滾，schema_migrations 沒有那一筆', async () => {
    const fresh = await createTempDatabase();
    const client = await fresh.pool.connect();

    try {
      const migrations: MigrationFile[] = [
        { name: '0001_audit_log.sql', sql: auditLogSql },
        {
          name: '0002_broken.sql',
          sql: 'create table half_done (id integer);\nthis is not valid sql;',
        },
      ];

      await expect(applyMigrations({ client, migrations, log: silent })).rejects.toThrow(
        /0002_broken\.sql/,
      );

      const rows = await client.query('select name from schema_migrations order by name');
      expect(rows.rows.map((row) => row.name)).toEqual(['0001_audit_log.sql']);

      // 壞掉那個檔的前半段也要回滾，不可以留半張表。
      const half = await client.query("select to_regclass('public.half_done') as reg");
      expect(half.rows[0]?.reg).toBeNull();
    } finally {
      client.release();
      await fresh.drop();
    }
  });
});

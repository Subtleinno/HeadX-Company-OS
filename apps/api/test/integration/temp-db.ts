import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';

/**
 * 整合測試用的臨時資料庫，名稱前綴 co_test_。
 *
 * 為甚麼不直接用正式資料庫：audit_log 有防刪除 trigger，測試列一寫進去就永遠刪不掉。
 * 所以每個測試檔自己 CREATE DATABASE，測完 DROP，正式資料庫由頭到尾不插任何列。
 * 連線參數讀 .env（POSTGRES_*、DB_PORT），經主機的 127.0.0.1:${DB_PORT} 入。
 */
process.loadEnvFile(resolve(process.cwd(), '.env'));

export const TEMP_DATABASE_PREFIX = 'co_test_';

const baseConfig = {
  host: '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 25432),
  user: process.env.POSTGRES_USER ?? 'company_os',
  password: process.env.POSTGRES_PASSWORD ?? '',
};

const maintenanceDatabase = process.env.POSTGRES_DB ?? 'company_os';

export type TempDatabase = {
  name: string;
  pool: Pool;
  drop: () => Promise<void>;
};

export async function createTempDatabase(): Promise<TempDatabase> {
  const name = `${TEMP_DATABASE_PREFIX}${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const admin = new Pool({ ...baseConfig, database: maintenanceDatabase, max: 1 });

  try {
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ ...baseConfig, database: name, max: 4 });
  let dropped = false;

  return {
    name,
    pool,
    drop: async () => {
      if (dropped) {
        return;
      }
      dropped = true;
      await pool.end();

      const closer = new Pool({ ...baseConfig, database: maintenanceDatabase, max: 1 });
      try {
        await closer.query(`drop database if exists "${name}" with (force)`);
      } finally {
        await closer.end();
      }
    },
  };
}

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';

/**
 * app-host 整合測試用的臨時資料庫與臨時帳號。
 *
 * 為甚麼要自己再寫一份而不用 apps/platform 的：`apps/app-host` 不可以引用 platform
 * 的任何檔案（邊界規則 1），測試也一樣 —— 一引用就會在 lint:boundaries 亮紅。
 *
 * 名字一定以 `co_test_`／`co_app_` 開頭，測完必定 DROP。正式資料庫由頭到尾
 * 不插任何列、不建任何帳號。
 */
process.loadEnvFile(resolve(process.cwd(), '.env'));

export const TEMP_DATABASE_PREFIX = 'co_test_';
export const TEMP_ROLE_PREFIX = 'co_app_';

const baseConfig = {
  host: '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 25432),
  user: process.env.POSTGRES_USER ?? 'company_os',
  password: process.env.POSTGRES_PASSWORD ?? '',
};

const maintenanceDatabase = process.env.POSTGRES_DB ?? 'company_os';

export type TempEnv = {
  /** 臨時資料庫名（co_test_ 開頭）。 */
  database: string;
  /** 臨時 app 帳號名（co_app_ 開頭）。 */
  role: string;
  /** 臨時帳號的密碼；測試才用，不會出現在任何輸出。 */
  password: string;
  pool: Pool;
  config: { host: string; port: number; database: string };
  drop: () => Promise<void>;
};

function suffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

export async function createTempEnv(): Promise<TempEnv> {
  const database = `${TEMP_DATABASE_PREFIX}${suffix()}`;
  const role = `${TEMP_ROLE_PREFIX}${suffix()}`;
  const password = randomUUID().replace(/-/g, '');

  const admin = new Pool({ ...baseConfig, database: maintenanceDatabase, max: 1 });

  try {
    await admin.query(`create database "${database}"`);
    await admin.query(`create role "${role}" login password '${password}'`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ ...baseConfig, database, max: 4 });
  let dropped = false;

  return {
    database,
    role,
    password,
    pool,
    config: { host: baseConfig.host, port: baseConfig.port, database },
    drop: async () => {
      if (dropped) {
        return;
      }
      dropped = true;
      await pool.end();

      const closer = new Pool({ ...baseConfig, database: maintenanceDatabase, max: 1 });
      try {
        // 先 drop 資料庫（force 斷開殘餘連線），帳號擁有的物件隨資料庫一齊消失，
        // 之後才可以 drop role。
        await closer.query(`drop database if exists "${database}" with (force)`);
        await closer.query(`drop role if exists "${role}"`);
      } finally {
        await closer.end();
      }
    },
  };
}

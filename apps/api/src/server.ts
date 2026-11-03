import { Pool } from 'pg';
import { buildServer } from './app.js';
import { attachPoolErrorHandler, createDbCheck } from './db.js';
import { migrate } from './migrate.js';
import type { Storage } from './storage/index.js';
import { createMinioStorage } from './storage/minio.js';

const port = Number(process.env.PORT ?? 4420);
const host = process.env.HOST ?? '0.0.0.0';

const pool = new Pool({
  connectionTimeoutMillis: 3000,
  max: 5,
});

/**
 * 先套 migration，再開儲存，最後才 listen。
 * 套不上去就大聲失敗並結束：schema 不完整的 API 不應該看似健康。
 * 只印原因，不印連線字串或密碼（pg 的錯誤訊息本身不含密碼）。
 */
async function runMigrations(): Promise<void> {
  try {
    await migrate({ pool, log: (message) => console.log(message) });
  } catch (error) {
    console.error(
      `migration 失敗，API 不會啟動：${error instanceof Error ? error.message : String(error)}`,
    );
    await pool.end();
    process.exit(1);
  }
}

/**
 * 連不上或建不到 bucket 就大聲失敗並結束：沒有儲存空間的 API 不應該假裝健康。
 * 只印訊息，不印連線參數。
 */
async function initStorage(): Promise<Storage> {
  try {
    return await createMinioStorage({
      // 容器內的 API 經 compose 網路連 storage 服務，不經主機端口。
      endpoint: process.env.MINIO_ENDPOINT ?? 'http://storage:9000',
      accessKey: process.env.MINIO_ROOT_USER ?? '',
      secretKey: process.env.MINIO_ROOT_PASSWORD ?? '',
      bucket: process.env.MINIO_BUCKET ?? 'company-os',
    });
  } catch (error) {
    console.error(`無法初始化檔案儲存：${error instanceof Error ? error.message : String(error)}`);
    await pool.end();
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // 開始服務請求之前：資料庫先有正確的 schema。
  await runMigrations();

  const storage = await initStorage();

  const app = buildServer({
    checkDb: createDbCheck(pool),
    checkStorage: async () => {
      await storage.ping();
    },
    logger: true,
  });

  attachPoolErrorHandler(pool, (error) => {
    // 只記錄訊息，避免把連線參數寫入日誌。
    app.log.error({ message: error.message }, '資料庫閒置連線出錯');
  });

  app.addHook('onClose', async () => {
    await pool.end();
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, '收到關閉訊號');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port, host }).catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
}

void main();

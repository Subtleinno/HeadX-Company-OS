import { Pool } from 'pg';
import { buildServer } from './app.js';
import { attachPoolErrorHandler, createDbCheck } from './db.js';

const port = Number(process.env.PORT ?? 4420);
const host = process.env.HOST ?? '0.0.0.0';

const pool = new Pool({
  connectionTimeoutMillis: 3000,
  max: 5,
});

const app = buildServer({
  checkDb: createDbCheck(pool),
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

app.listen({ port, host }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});

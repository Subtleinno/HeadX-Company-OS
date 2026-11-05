import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Pool } from 'pg';
import { attachPoolErrorHandler } from './db.js';
import { parseJobsConfig } from './jobs/config.js';
import { createJobQueue } from './jobs/queue.js';
import { createHandlerRegistry, type JobHandler } from './jobs/registry.js';
import { createWorker, type WorkerEvent } from './jobs/worker.js';
import { migrate, resolveMigrationsDir } from './migrate.js';

/**
 * worker 的啟動入口（issue #85「worker 入口與部署」）。
 *
 * 為甚麼要另一支程式而不是在 API 裡面偷偷起一個 worker：
 * 背景工作會拖住記憶體與資料庫連線，而 API 的健康檢查不應該因為一件慢工作
 * 而變紅。兩者同一個映像、同一套程式碼，但**分別啟動**：
 *
 *   本機（repo 根目錄，先 npm run build）：npm run worker --workspace @company-os/platform
 *   映像內：node apps/platform/dist/worker.js
 *
 * 兩個指令都要寫出來，因為映像的 runtime stage 沒有根目錄的 package.json
 * （只有 apps/platform 與 packages），所以 npm workspace 指令在映像內跑不到。
 * 這一點是在真映像上試出來的，不是設計時就想到的。
 *
 * 這一張不新增 compose 服務、不改正式部署。日後加 worker 容器時，
 * 要同步更新備份的停止寫入清單（備份要等 worker 停手才拍快照）。
 */

/**
 * 本張只註冊一個沒有外部副作用的工作種類（issue #85 的「不做」）。
 * 它是驗收入口：真的排一件、真的領一次、真的完成一次，證明整條路通。
 * 其他工作種類由之後的 issue 自己註冊，不在這裡預留一堆空殼。
 */
const handlers: Record<string, JobHandler> = {
  'system.noop': async () => undefined,
};

function log(event: WorkerEvent | Record<string, unknown>): void {
  // 結構化事件：一行一個 JSON。這樣「幾時claim、幾時失敗、租約幾時失去」
  // 全部可以用程式查，不用讀中文句子。
  console.log(JSON.stringify(event));
}

async function main(): Promise<void> {
  const parsed = parseJobsConfig(process.env);

  if (parsed.value === undefined) {
    console.error(`worker 設定不正確，不會啟動：${parsed.errors.join('；')}`);
    process.exit(1);
  }

  const config = parsed.value;
  const pool = new Pool({
    connectionTimeoutMillis: 3000,
    // 併發上限加兩條：一條給領取，一條給審計或續租。
    max: config.concurrency + 2,
  });

  // schema 先有：worker 與 API 用同一個 migration 執行器，advisory lock 會令
  // 兩邊同時啟動時只有一個在套用。分開部署（先起 worker）都不會出錯。
  try {
    await migrate({
      pool,
      dir: resolveMigrationsDir(),
      log: (message) => console.log(message),
    });
  } catch (error) {
    console.error(
      `migration 失敗，worker 不會啟動：${error instanceof Error ? error.message : String(error)}`,
    );
    await pool.end();
    process.exit(1);
  }

  const registry = createHandlerRegistry(handlers);
  const queue = createJobQueue({ db: pool, registry, backoff: config.backoff });

  const worker = createWorker({
    queue,
    registry,
    // 重啟之後 pid 可能一樣，所以加一段隨機：否則兩隻新舊 worker 會用同一個名字。
    workerId: `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`,
    concurrency: config.concurrency,
    pollIntervalMs: config.pollIntervalMs,
    leaseMs: config.leaseMs,
    shutdownGraceMs: config.shutdownGraceMs,
    log,
  });

  // 有工作但這隻 worker 唔認識：講出來。沉默的積壓比起錯誤更難查。
  try {
    const pending = await queue.countPendingByType();
    const unhandled = pending.filter((row) => !registry.has(row.type));

    if (unhandled.length > 0) {
      console.warn(
        JSON.stringify({
          event: 'worker.unhandled_types',
          types: unhandled.map((row) => ({ type: row.type, count: row.count })),
        }),
      );
    }
  } catch (error) {
    // 診斷失敗不應該阻止 worker 起動；正式的領取會自己報錯。
    console.warn(
      JSON.stringify({ event: 'worker.diagnose_failed', message: error instanceof Error ? error.message : 'unknown' }),
    );
  }

  attachPoolErrorHandler(pool, (error) => {
    // 只記錄訊息：pg 的 error 物件本身可能帶著連線參數。
    console.error(JSON.stringify({ event: 'worker.db_error', message: error.message }));
  });

  worker.start();

  const shutdown = async (signal: string): Promise<void> => {
    log({ event: 'worker.signal', signal });

    const result = await worker.stop();

    await pool.end();

    // 超時退出：仍然有工作在跑，租約會在過期之後由回收程序接手。
    // 用 1 表示「不是乾淨收工」——誠實地讓外面的監控看得見。
    process.exit(result.drained ? 0 : 1);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();

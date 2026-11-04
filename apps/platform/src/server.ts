import { Pool } from 'pg';
import { buildServer } from './app.js';
import { LOGIN_HASH_KEY_ENV, loginHashKeyWarning, readLoginHashKey } from './auth/login-hash.js';
import { registerAuth } from './auth/routes.js';
import { attachPoolErrorHandler, createDbCheck } from './db.js';
import { DEFAULT_MAX_UPLOAD_BYTES, registerFiles } from './files/routes.js';
import { migrate } from './migrate.js';
import { loadModules } from './modules/registry/index.js';
import { registerModules } from './modules/routes.js';
import type { Storage } from './storage/index.js';
import { createStorageDiagnosis } from './storage/diagnose.js';
import { createMinioStorage } from './storage/minio.js';

const port = Number(process.env.PORT ?? 4420);
const host = process.env.HOST ?? '0.0.0.0';

const pool = new Pool({
  connectionTimeoutMillis: 3000,
  max: 5,
});

/**
 * 讀 apps/<id>/manifest.json（R4）。
 * manifest 有問題就大聲失敗並結束 —— 這份清單就是「有哪些部門」，
 * 帶著一個壞掉的清單起服務，等於對老闆說錯話。
 * 一次列齊所有錯誤，修的時候不用重複啟動。
 */
function loadModuleRegistry(): ReturnType<typeof loadModules> {
  const dir = process.env.MODULES_DIR ?? '/app/apps';

  try {
    const registry = loadModules(dir);
    console.log(`已載入 ${registry.listModules().length} 個模組`);
    return registry;
  } catch (error) {
    console.error(`模組載入失敗，API 不會啟動：\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

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

/**
 * 上傳上限。不是秘密，放 .env；寫錯就大聲失敗，不要靜靜用預設值
 * （使用者的檔案被拒收時，原因必須看得見）。
 */
function readMaxUploadBytes(): number {
  const raw = process.env.MAX_UPLOAD_BYTES;

  if (raw === undefined || raw === '') {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    console.error(`MAX_UPLOAD_BYTES 不是正整數：${raw}`);
    process.exit(1);
  }

  return value;
}

/**
 * 登入失敗審計的 HMAC key（issue #65）。
 * 未設定就大聲失敗並結束：沒有 key，唯一做得到的就是把使用者輸入的 email
 * 明文寫進只准追加的 audit_log，寫進去就永遠拿不走。
 * 太短就出聲但不阻止啟動（issue 只要求未設定時拒絕）；警告不含 key 的值。
 */
function readLoginHashKeyOrExit(): string {
  try {
    const key = readLoginHashKey(process.env[LOGIN_HASH_KEY_ENV]);
    const warning = loginHashKeyWarning(key);

    if (warning !== null) {
      console.warn(warning);
    }

    return key;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // 啟動設定先驗：缺 key 就不應該先去碰資料庫或任何外部服務。
  const loginHashKey = readLoginHashKeyOrExit();

  // 模組清單先驗：壞掉的 manifest 不應該先去碰資料庫。
  const registry = loadModuleRegistry();

  // 開始服務請求之前：資料庫先有正確的 schema。
  await runMigrations();

  const storage = await initStorage();

  const app = buildServer({
    checkDb: createDbCheck(pool),
    checkStorage: async () => {
      await storage.ping();
    },
    // 診斷要能分辨「bucket 不見」與「連不上」，所以除了 ping 還要探測一個已知物件。
    diagnoseStorage: createStorageDiagnosis({
      probeKey: process.env.STORAGE_PROBE_KEY ?? '_smoke/persist-check.txt',
      headBucket: async () => {
        await storage.ping();
      },
      headObject: (key) => storage.exists(key),
      bucketIsEmpty: () => storage.isEmpty(),
    }),
    logger: true,
  });

  // 登入與首次開機。COOKIE_SECURE=true 只在經 HTTPS 入口時開，否則瀏覽器不會存 cookie。
  registerAuth(app, {
    pool,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    loginHashKey,
  });

  registerModules(app, { registry, pool });

  // 檔案層：上傳／下載（Range）／列表／軟刪除。key 前綴固定為 files/，
  // 用戶提供的檔名永遠不參與路徑。
  registerFiles(app, {
    pool,
    storage,
    maxUploadBytes: readMaxUploadBytes(),
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

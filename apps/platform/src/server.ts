import type { FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import { buildServer } from './app.js';
import { registerEntryGuard } from './auth/entry-guard.js';
import { GATEWAY_TOKEN_ENV, readGatewayToken } from './auth/gateway-token.js';
import { entryOfRequest } from './auth/trusted-entry.js';
import { LOGIN_HASH_KEY_ENV, loginHashKeyWarning, readLoginHashKey } from './auth/login-hash.js';
import { createHashLimiter, parseHashLimits, type HashLimitsConfig } from './auth/hash-limits.js';
import { registerAuth } from './auth/routes.js';
import { registerAgents } from './agents/index.js';
import { registerBrandPages } from './brand-pages/index.js';
import { registerStaff } from './staff/index.js';
import { attachPoolErrorHandler, createDbCheck } from './db.js';
import { DEFAULT_MAX_UPLOAD_BYTES, registerFiles } from './files/routes.js';
import { registerGrants } from './grants/index.js';
import { migrate } from './migrate.js';
import { loadModules } from './modules/registry/index.js';
import { registerModules } from './modules/routes.js';
import { registerDirectory } from './directory/index.js';
import { registerNeeds } from './needs/index.js';
import { registerOrg, seedOrgUnits } from './org/index.js';
import { DEFAULT_PROFILE_DIR, registerSettings, seedSettings } from './settings/index.js';
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
 * 設定、政策規則與根單位的第一次填入（issue #80、#81）。
 *
 * 順序一定在 migration 之後：表還沒有之前填不進去。
 * 填不進去就大聲失敗並結束 —— 帶著一份不完整的設定開機，之後每個判斷都會用一個
 * 沒有人決定了的值。
 *
 * 根單位排在設定之後：它有依賴「整間公司」這個概念的設定，先有設定再有單位比較好讀。
 */
async function runSeed(): Promise<void> {
  try {
    await seedSettings({
      pool,
      // 映像內由 Dockerfile 的 ENV PROFILE_DIR 指定；本機開發時指向 repo 的 profiles/default。
      profileDir: process.env.PROFILE_DIR ?? DEFAULT_PROFILE_DIR,
      env: process.env,
      log: (message) => console.log(message),
    });

    await seedOrgUnits({ pool, log: (message) => console.log(message) });
  } catch (error) {
    console.error(
      `種子填入失敗，API 不會啟動：${error instanceof Error ? error.message : String(error)}`,
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
 * 入口憑證（issue #87）。
 *
 * 未設定或格式不合格就結束，不給預設值 —— 一個「大家都一樣」的憑證等於沒有憑證。
 * 這一步排在所有事情之前：沒有可信入口的 platform 就算連得上資料庫，
 * 也只會拒絕所有請求，早點死比晚點死好查。
 */
function readGatewayTokenOrExit(): string {
  try {
    return readGatewayToken(process.env[GATEWAY_TOKEN_ENV]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
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

/**
 * 雜湊資源上限（issue #84）。
 *
 * 預設 2 併發／8 排隊／5 秒。設定不合法就結束 —— 一個「部分套用」的限制器
 * 比起沒有更難查，而這個數字直接關係到會不會把整部機的記憶體用光
 * （每個 scrypt 要 132 MiB，見 auth/password.ts）。
 */
function readHashLimitsOrExit(): HashLimitsConfig {
  const parsed = parseHashLimits({
    HASH_MAX_CONCURRENT: process.env.HASH_MAX_CONCURRENT,
    HASH_MAX_QUEUE: process.env.HASH_MAX_QUEUE,
    HASH_TIMEOUT_MS: process.env.HASH_TIMEOUT_MS,
  });

  if (!parsed.ok) {
    console.error(`雜湊資源限制設定不正確：${parsed.errors.join('；')}`);
    process.exit(1);
  }

  return parsed.value;
}

async function main(): Promise<void> {
  // 入口憑證與登入審計 key 都是「沒有就不應該起服務」的設定，
  // 兩者都要在碰資料庫或任何外部服務之前驗。
  const gatewayToken = readGatewayTokenOrExit();
  const loginHashKey = readLoginHashKeyOrExit();

  // 雜湊的資源上限同樣先驗：設錯就不應該起服務。
  const hashLimits = readHashLimitsOrExit();
  const hashLimiter = createHashLimiter(hashLimits);
  const hashRun = <T>(task: () => Promise<T>): Promise<T> => hashLimiter.run(task);

  // 模組清單先驗：壞掉的 manifest 不應該先去碰資料庫。
  const registry = loadModuleRegistry();

  // 開始服務請求之前：資料庫先有正確的 schema。
  await runMigrations();

  // schema 有了之後才填種子；已存在的值一個字都不動。
  await runSeed();

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

  // 入口守衛（issue #87）：所有路由都要通過，只有 /livez 與 /health 例外。
  // 一定要排在所有業務路由之前 —— 之後每一條路由都預設要驗證，
  // 新增路由不用記得補，想豁免反而要改 entry-guard.ts。
  registerEntryGuard(app, { token: gatewayToken });

  // 登入與首次開機。COOKIE_SECURE=true 只在經 HTTPS 入口時開，否則瀏覽器不會存 cookie。
  registerAuth(app, {
    pool,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    loginHashKey,
    hashRun,
  });

  // 員工與 agent 身份：全部只有老闆可以用（issue #84）。
  // 指派部門需要部門清單，來源與 /modules 同一個 registry（issue #12）。
  registerStaff(app, { pool, hashRun, registry });
  registerAgents(app, {
    pool,
    registry,
    // 入口只可以由守衛放進請求的那一個值取 —— 不讀 body、query 或標頭。
    resolveEntry: (request) => entryOfRequest(request as FastifyRequest),
  });

  registerModules(app, { registry });

  // 品牌頁與頁版本（issue #33）：讀要登入，寫只有老闆（品牌級授權見 #32）。
  registerBrandPages(app, { pool });

  // 公司設定與政策規則：全部要老闆，寫入留審計。
  registerSettings(app, { pool });

  // 組織單位、多上級與設定繼承：一樣全部要老闆。
  registerOrg(app, { pool });

  // 檔案層：上傳／下載（Range）／列表／軟刪除。key 前綴固定為 files/，
  // 用戶提供的檔名永遠不參與路徑。
  // app 授權：申請、批准、拒絕、撤銷、查詢，以及接 #82 引擎的存取檢查。
  //
  // 入口由入口守衛決定（issue #87）。守衛未通過時 entryOfRequest 回 null，
  // /app-grants/access/* 會回 entry_untrusted —— 誠實的失敗。
  // 這裡不假設 internal：假設一次，經夥伴入口進來的請求就會被當成內網員工。
  registerGrants(app, {
    pool,
    registry,
    resolveEntry: (request) => entryOfRequest(request),
  });

  registerFiles(app, {
    pool,
    storage,
    maxUploadBytes: readMaxUploadBytes(),
  });

  // Needs：agent 交返畀人嘅工作（issue 184）。讀要登入、認領要登入，
  // 開立與吸收屬 agent／MCP 的路，呢度唔開。
  registerDirectory(app, { pool });
  registerNeeds(app, { pool });

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

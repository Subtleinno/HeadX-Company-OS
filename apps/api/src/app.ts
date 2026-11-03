import Fastify, { type FastifyInstance } from 'fastify';

export type HealthCheck = () => Promise<void>;

/**
 * storage 檢查的硬上限。
 * AWS SDK 預設會重試，storage 停掉時 /health 可以拖到 11 秒以上；監控與 docker healthcheck
 * 都等不到那個答案。這裡是最後防線，ping 自己另有 2 秒逾時。
 */
export const DEFAULT_STORAGE_TIMEOUT_MS = 2500;

export type ServerOptions = {
  checkDb: HealthCheck;
  checkStorage: HealthCheck;
  /** 測試可以調短；預設 2500ms，確保 /health 在 3 秒內一定有答案。 */
  storageTimeoutMs?: number;
  logger?: boolean;
};

type CheckResult = boolean;

/** 跑一個檢查；給了 timeoutMs 就限時，逾時當作失敗。 */
async function runCheck(check: HealthCheck, timeoutMs?: number): Promise<CheckResult> {
  if (timeoutMs === undefined) {
    try {
      await check();
      return true;
    } catch {
      return false;
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      check(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`檢查逾時（${timeoutMs}ms）`)), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * 建立 API 實例。db 與 storage 檢查以參數注入，測試可以模擬通、不通、卡住。
 */
export function buildServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  const storageTimeoutMs = options.storageTimeoutMs ?? DEFAULT_STORAGE_TIMEOUT_MS;

  // 只代表 process 仍然活著，不檢查任何依賴。
  app.get('/livez', async () => ({ status: 'ok' }));

  app.get('/health', async (_request, reply) => {
    // 兩個檢查都要跑，回應才會指出是 db 還是 storage 出問題。
    const [db, storage] = await Promise.all([
      runCheck(options.checkDb),
      runCheck(options.checkStorage, storageTimeoutMs),
    ]);

    const checks = {
      db: db ? ('ok' as const) : ('error' as const),
      storage: storage ? ('ok' as const) : ('error' as const),
    };

    if (checks.db === 'ok' && checks.storage === 'ok') {
      return { status: 'ok', checks };
    }

    // 不把底層錯誤內容回給外面，避免洩漏連線資訊。
    reply.code(503);
    return { status: 'error', checks };
  });

  return app;
}

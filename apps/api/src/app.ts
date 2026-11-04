import Fastify, { type FastifyInstance } from 'fastify';
import { isSameOrigin } from './auth/origin.js';

export type HealthCheck = () => Promise<void>;

/** 會改變狀態的方法；只有這些要檢查 Origin。 */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
 * 自訂的 JSON 解析器。
 *
 * Fastify 內建的 JSON 解析器見到空 body 就直接回 400（FST_ERR_CTP_EMPTY_JSON_BODY），
 * 請求到不了 handler。很多前端封裝會為所有請求統一加 Content-Type: application/json，
 * 於是沒有 body 的 POST（例如 /auth/logout）永遠失敗。
 *
 * 這裡把「空的 body」當成空物件，格式錯誤的 JSON 仍然回 400。
 * 註冊在實例上，所以之後每一條 POST 路由都受惠，不是逐條路由補。
 */
function registerJsonParser(app: FastifyInstance): void {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = typeof body === 'string' ? body : String(body ?? '');

    if (text.trim() === '') {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(text));
    } catch {
      // 保持 Fastify 原本的錯誤形狀：400，不是 500。
      const error = new Error('body 不是有效的 JSON') as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = 400;
      error.code = 'FST_ERR_CTP_INVALID_JSON_BODY';
      done(error, undefined);
    }
  });
}

/**
 * 建立 API 實例。db 與 storage 檢查以參數注入，測試可以模擬通、不通、卡住。
 */
export function buildServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  registerJsonParser(app);

  const storageTimeoutMs = options.storageTimeoutMs ?? DEFAULT_STORAGE_TIMEOUT_MS;

  // CSRF：瀏覽器對 POST 一定會帶 Origin；帶了而 host 與 Host 不同就拒絕。
  // 放在 onRequest，所有會改變狀態的請求都會經過，不只是 auth 路由。
  app.addHook('onRequest', async (request, reply) => {
    if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
      return;
    }

    const origin =
      typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
    const host = typeof request.headers.host === 'string' ? request.headers.host : undefined;

    if (!isSameOrigin(origin, host)) {
      reply.code(403).send({ error: 'bad_origin' });
    }
  });

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

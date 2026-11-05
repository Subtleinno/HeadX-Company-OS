/**
 * 密碼雜湊的有界資源限制（issue #84 第 6 節）。
 *
 * 為甚麼需要：每個 scrypt 要 132 MiB（見 password.ts 的註釋）。冇上限嘅話，
 * 十個併發登入就係 1.3 GB，一個刻意送慢速請求嘅人可以令整部機換頁。
 * 限制嘅係「幾多個同時做」，**唔係**「做得幾難」—— 唔准為咗通過而調低 N／r／p。
 *
 * 兩個數字要分清楚：
 *   - active：正在跑的雜湊（佔住記憶體）
 *   - queued：排隊等名額（尚未配置記憶體，但有上限，否則等的人自己就是一種耗盡）
 *
 * 逾時只適用於「排隊」：已經在跑的雜湊不會因為等的人放棄而被當成結束 ——
 * 它的記憶體還在，名額要等它真正 settle 才交還。
 */

export type HashLimitsConfig = {
  maxConcurrent: number;
  maxQueue: number;
  timeoutMs: number;
};

/** issue 指定的初始技術值：2 併發、8 排隊、5 秒。 */
export const DEFAULT_HASH_LIMITS: HashLimitsConfig = {
  maxConcurrent: 2,
  maxQueue: 8,
  timeoutMs: 5_000,
};

/** 集中設定的可接受範圍。超出範圍是設定錯誤，不是「用住先」。 */
const RANGES = {
  maxConcurrent: { min: 1, max: 8 },
  maxQueue: { min: 0, max: 64 },
  timeoutMs: { min: 100, max: 30_000 },
} as const;

export type ParseHashLimitsResult =
  | { ok: true; value: HashLimitsConfig }
  | { ok: false; errors: string[] };

function parseBounded(
  raw: string | undefined,
  name: string,
  fallback: number,
  range: { min: number; max: number },
): { errors: string[]; value?: number } {
  if (raw === undefined) {
    return { errors: [], value: fallback };
  }

  if (!/^\d+$/.test(raw)) {
    return { errors: [`${name} 必須是整數（收到 ${raw}）`] };
  }

  const value = Number(raw);

  if (value < range.min || value > range.max) {
    return { errors: [`${name} 必須介乎 ${range.min} 至 ${range.max}（收到 ${value}）`] };
  }

  return { errors: [], value };
}

/**
 * 讀環境變數。一次過報齊所有問題；任何一個不合法就整組拒絕，
 * 不會「部分套用」—— 一個 half-configured 的限制器比沒有更難查。
 */
export function parseHashLimits(raw: Record<string, string | undefined>): ParseHashLimitsResult {
  const concurrent = parseBounded(
    raw.HASH_MAX_CONCURRENT,
    'HASH_MAX_CONCURRENT',
    DEFAULT_HASH_LIMITS.maxConcurrent,
    RANGES.maxConcurrent,
  );
  const queue = parseBounded(
    raw.HASH_MAX_QUEUE,
    'HASH_MAX_QUEUE',
    DEFAULT_HASH_LIMITS.maxQueue,
    RANGES.maxQueue,
  );
  const timeout = parseBounded(
    raw.HASH_TIMEOUT_MS,
    'HASH_TIMEOUT_MS',
    DEFAULT_HASH_LIMITS.timeoutMs,
    RANGES.timeoutMs,
  );

  const errors = [...concurrent.errors, ...queue.errors, ...timeout.errors];

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      maxConcurrent: concurrent.value as number,
      maxQueue: queue.value as number,
      timeoutMs: timeout.value as number,
    },
  };
}

/**
 * 滿載時的錯誤。訊息固定是 `service_busy`，不含任何帳戶資訊 ——
 * 呼叫者不可以從「busy」推斷某個 email 是否存在。
 */
export class HashBusyError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds = 1) {
    super('service_busy');
    this.name = 'HashBusyError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type HashLimiterStats = { active: number; queued: number };

/**
 * 「跑一段雜湊」的形狀。模組之間傳的是這個函數而不是 limiter 本身 ——
 * 呼叫者不需要知道 stats、上限或者佇列，只需要一個會遵守限制的入口。
 */
export type HashRun = <T>(task: () => Promise<T>) => Promise<T>;

export type HashLimiter = {
  /** 在名額之內執行。名額滿／等太久就擲 HashBusyError。 */
  run: <T>(task: () => Promise<T>) => Promise<T>;
  readonly stats: HashLimiterStats;
};

type QueueEntry = {
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

function retryAfterSecondsFor(timeoutMs: number): number {
  return Math.max(1, Math.ceil(timeoutMs / 1_000));
}

export function createHashLimiter(config: HashLimitsConfig = DEFAULT_HASH_LIMITS): HashLimiter {
  const { maxConcurrent, maxQueue, timeoutMs } = config;
  const queue: QueueEntry[] = [];
  let active = 0;

  function start(task: () => Promise<unknown>, resolve: (v: unknown) => void, reject: (e: unknown) => void): void {
    active += 1;

    const settled = (): void => {
      active -= 1;
      pump();
    };

    // 先釋放名額再交結果，所以等待者拿到的 stats 已經是最新的；
    // 無論 resolve 還是 reject 都要釋放 —— 任務失敗不是「免費」。
    task().then(
      (value) => {
        settled();
        resolve(value);
      },
      (error: unknown) => {
        settled();
        reject(error);
      },
    );
  }

  function pump(): void {
    while (active < maxConcurrent && queue.length > 0) {
      const next = queue.shift();

      if (next === undefined) {
        return;
      }

      clearTimeout(next.timer);
      start(next.task, next.resolve, next.reject);
    }
  }

  function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < maxConcurrent) {
      return new Promise<T>((resolve, reject) => {
        start(task, resolve as (value: unknown) => void, reject);
      });
    }

    // 隊列滿了：即刻拒絕，不排隊。排隊本身也是一種資源，沒有上限就等於沒有保護。
    if (queue.length >= maxQueue) {
      return Promise.reject(new HashBusyError(retryAfterSecondsFor(timeoutMs)));
    }

    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry = {
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer: setTimeout(() => {
          const index = queue.indexOf(entry);

          if (index >= 0) {
            queue.splice(index, 1);
          }

          reject(new HashBusyError(retryAfterSecondsFor(timeoutMs)));
        }, timeoutMs),
      };

      queue.push(entry);
    });
  }

  return {
    run,
    get stats(): HashLimiterStats {
      return { active, queued: queue.length };
    },
  };
}

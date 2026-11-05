import { DEFAULT_BACKOFF, type BackoffConfig } from './backoff.js';
import { DEFAULT_MAX_ATTEMPTS, MAX_ATTEMPTS_CEILING, type ParseResult } from './types.js';

/**
 * worker 的設定（issue #85 第 4、7 點）。
 *
 * 為甚麼要集中解析：worker 崩潰之後會自己重來，一個「靜靜用預設值」的設定錯誤
 * 會變成「工作跑得慢」或「次數爆掉」這種很難查的現象。所以寧願起不動。
 *
 * 所有 worker（將來的第二隻、第三隻）都用這一份語意：同一個變數名、
 * 同一個上限、同一個錯誤訊息。分散解析遲早會出現兩隻 worker 行為不同。
 */

export type JobsConfig = {
  maxAttempts: number;
  concurrency: number;
  pollIntervalMs: number;
  leaseMs: number;
  shutdownGraceMs: number;
  backoff: BackoffConfig;
};

export const DEFAULT_JOBS_CONFIG: JobsConfig = {
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
  concurrency: 1,
  pollIntervalMs: 1000,
  leaseMs: 60_000,
  shutdownGraceMs: 15_000,
  backoff: DEFAULT_BACKOFF,
};

/** 只接受純數字：`30_000`、`1e4`、`2.5` 一律當錯誤，不要猜。 */
function readInt(
  raw: string | undefined,
  name: string,
  min: number,
  max: number,
  fallback: number,
): ParseResult<number> {
  if (raw === undefined || raw === '') {
    return { errors: [], value: fallback };
  }

  if (!/^\d+$/.test(raw)) {
    return { errors: [`${name} 必須是整數（現在 ${JSON.stringify(raw)}）`] };
  }

  const value = Number(raw);

  if (value < min || value > max) {
    return { errors: [`${name} 必須在 ${min} 至 ${max} 之間（現在 ${raw}）`] };
  }

  return { errors: [], value };
}

export function parseJobsConfig(env: Record<string, string | undefined>): ParseResult<JobsConfig> {
  const errors: string[] = [];

  const maxAttempts = readInt(
    env.JOB_MAX_ATTEMPTS,
    'JOB_MAX_ATTEMPTS',
    1,
    MAX_ATTEMPTS_CEILING,
    DEFAULT_JOBS_CONFIG.maxAttempts,
  );
  const concurrency = readInt(
    env.JOB_CONCURRENCY,
    'JOB_CONCURRENCY',
    1,
    32,
    DEFAULT_JOBS_CONFIG.concurrency,
  );
  const pollIntervalMs = readInt(
    env.JOB_POLL_INTERVAL_MS,
    'JOB_POLL_INTERVAL_MS',
    100,
    60_000,
    DEFAULT_JOBS_CONFIG.pollIntervalMs,
  );
  const leaseMs = readInt(env.JOB_LEASE_MS, 'JOB_LEASE_MS', 1000, 3_600_000, DEFAULT_JOBS_CONFIG.leaseMs);
  const shutdownGraceMs = readInt(
    env.JOB_SHUTDOWN_GRACE_MS,
    'JOB_SHUTDOWN_GRACE_MS',
    0,
    600_000,
    DEFAULT_JOBS_CONFIG.shutdownGraceMs,
  );
  const initialMs = readInt(
    env.JOB_BACKOFF_INITIAL_MS,
    'JOB_BACKOFF_INITIAL_MS',
    100,
    3_600_000,
    DEFAULT_BACKOFF.initialMs,
  );
  const maxMs = readInt(
    env.JOB_BACKOFF_MAX_MS,
    'JOB_BACKOFF_MAX_MS',
    100,
    86_400_000,
    DEFAULT_BACKOFF.maxMs,
  );

  errors.push(
    ...maxAttempts.errors,
    ...concurrency.errors,
    ...pollIntervalMs.errors,
    ...leaseMs.errors,
    ...shutdownGraceMs.errors,
    ...initialMs.errors,
    ...maxMs.errors,
  );

  if (
    errors.length > 0 ||
    maxAttempts.value === undefined ||
    concurrency.value === undefined ||
    pollIntervalMs.value === undefined ||
    leaseMs.value === undefined ||
    shutdownGraceMs.value === undefined ||
    initialMs.value === undefined ||
    maxMs.value === undefined
  ) {
    return { errors };
  }

  // 租約一定要比輪詢間隔長得多。兩者相等代表：一個 worker 可能在自己還沒有
  // 再輪詢之前就已經被判定失去租約，於是同一件工作被交兩次 —— 這不是
  // 「罕有情況」，這是必然。
  if (leaseMs.value <= pollIntervalMs.value * 2) {
    errors.push(
      `JOB_LEASE_MS 必須大於 JOB_POLL_INTERVAL_MS 的兩倍（現在 ${leaseMs.value} 與 ${pollIntervalMs.value}）`,
    );
  }

  if (maxMs.value < initialMs.value) {
    errors.push(
      `JOB_BACKOFF_MAX_MS 不可以小於 JOB_BACKOFF_INITIAL_MS（現在 ${maxMs.value} < ${initialMs.value}）`,
    );
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    value: {
      maxAttempts: maxAttempts.value,
      concurrency: concurrency.value,
      pollIntervalMs: pollIntervalMs.value,
      leaseMs: leaseMs.value,
      shutdownGraceMs: shutdownGraceMs.value,
      backoff: {
        initialMs: initialMs.value,
        maxMs: maxMs.value,
        factor: DEFAULT_BACKOFF.factor,
        jitter: DEFAULT_BACKOFF.jitter,
      },
    },
  };
}

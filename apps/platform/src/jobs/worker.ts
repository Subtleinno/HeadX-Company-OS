import type { JobQueue } from './queue.js';
import { errorCodeFrom, isJobFailure } from './redact.js';
import type { HandlerRegistry } from './registry.js';
import type { JobRow } from './types.js';

/**
 * 背景工作的執行器（issue #85「執行與並發」）。
 *
 * 幾個刻意的選擇：
 *
 * 1. **執行期間不持有資料庫交易。** 領取是一句 UPDATE（隱含短交易），
 *    之後 handler 完全在交易之外跑。否則一個慢 handler 會長時間佔住連線與鎖。
 * 2. **至少一次，不是 exactly-once。** 租約過期代表「不確定跑完未」，所以重試。
 *    唔會假裝做到 exactly-once：那需要 handler 與資料庫的兩階段提交，
 *    而外部副作用（發信、付款）根本冇辦法回滾。
 * 3. **無法取消的 handler 不假裝已停止。** stop() 等一段有限時間，超時就放手，
 *    並且只記錄「已放棄」——資料列仍然是 running，租約仍然有效直到過期，
 *    由回收程序接手。假裝取消只會令人以為工作已經安全地停了。
 * 4. **資料庫斷線不會令 worker 死。** 領取失敗就退避再試，工作仍然在資料庫裡。
 */

export type WorkerEvent =
  | { event: 'worker.started'; workerId: string; concurrency: number; types: readonly string[] }
  | { event: 'worker.claim_failed'; code: string; retryInMs: number }
  | { event: 'worker.stopped'; drained: boolean; active: number }
  | { event: 'job.claimed'; jobId: string; type: string; attempt: number }
  | { event: 'job.succeeded'; jobId: string; type: string; attempt: number }
  | { event: 'job.retry_scheduled'; jobId: string; type: string; attempt: number; code: string; delayMs: number }
  | { event: 'job.dead'; jobId: string; type: string; attempt: number; code: string }
  | { event: 'job.lease_lost'; jobId: string; type: string; attempt: number }
  | { event: 'job.abandoned'; jobId: string; type: string; attempt: number }
  | { event: 'job.handler_missing'; jobId: string; type: string }
  | { event: 'job.complete_failed'; jobId: string; code: string }
  | { event: 'job.fail_failed'; jobId: string; code: string };

export type JobWorker = {
  readonly workerId: string;
  start: () => void;
  stop: (options?: { graceMs?: number }) => Promise<{ drained: boolean; active: number }>;
  /** 領取並開始最多「空閒插槽」那麼多件工作；回傳實際開始了幾件。 */
  tick: () => Promise<number>;
  /** 等到手上的工作全部結束（測試與關機用）。 */
  idle: () => Promise<void>;
  stats: () => { active: number; stopping: boolean; polling: boolean };
};

export type WorkerOptions = {
  queue: JobQueue;
  registry: HandlerRegistry;
  workerId: string;
  concurrency: number;
  pollIntervalMs: number;
  leaseMs: number;
  shutdownGraceMs: number;
  log?: (event: WorkerEvent) => void;
};

type ActiveJob = {
  job: JobRow;
  controller: AbortController;
  renewTimer: ReturnType<typeof setInterval> | null;
  promise: Promise<void>;
  /** 租約已被回收／搶走：結果作廢。 */
  leaseLost: boolean;
  /** stop 超時之後我們停止等待：唔會再寫任何結果。 */
  abandoned: boolean;
};

const MAX_CLAIM_BACKOFF_MS = 60_000;

export function createWorker(options: WorkerOptions): JobWorker {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error(`concurrency 必須是正整數（現在 ${String(options.concurrency)}）`);
  }

  if (!(options.leaseMs > 0) || !(options.pollIntervalMs > 0)) {
    throw new Error('leaseMs 與 pollIntervalMs 都必須大於 0');
  }

  const log = options.log ?? ((): void => undefined);

  const active = new Map<string, ActiveJob>();
  let idleResolvers: Array<() => void> = [];
  let stopping = false;
  let polling = false;
  let wake: (() => void) | null = null;

  /** 可中斷的等待：stop() 會即刻叫醒它，所以關機不用等一個完整的輪詢間隔。 */
  function sleepInterruptible(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        if (wake === finish) {
          wake = null;
        }
        resolve();
      };

      const timer = setTimeout(finish, ms);
      wake = finish;
    });
  }

  function resolveIdleWaiters(): void {
    const waiters = idleResolvers;
    idleResolvers = [];

    for (const resolve of waiters) {
      resolve();
    }
  }

  async function noteLeaseLost(entry: ActiveJob): Promise<void> {
    if (entry.leaseLost) {
      return;
    }

    entry.leaseLost = true;
    entry.controller.abort();
    log({
      event: 'job.lease_lost',
      jobId: entry.job.id,
      type: entry.job.type,
      attempt: entry.job.attempts,
    });

    // 租約變更要追查得到。寫不進去也不算失敗：日誌已經有同一件事。
    await options.queue
      .recordLeaseLost({
        id: entry.job.id,
        workerId: options.workerId,
        type: entry.job.type,
        attempt: entry.job.attempts,
      })
      .catch(() => undefined);
  }

  async function renewOnce(entry: ActiveJob): Promise<void> {
    if (entry.leaseLost || entry.abandoned) {
      return;
    }

    try {
      const renewed = await options.queue.renew({
        id: entry.job.id,
        token: entry.job.lease_token ?? '',
        leaseMs: options.leaseMs,
      });

      if (!renewed) {
        await noteLeaseLost(entry);
      }
    } catch {
      // 資料庫暫時斷線：下一個週期再試。租約仍然在有效期內，唔算失去。
    }
  }

  async function recordFailure(entry: ActiveJob, error: unknown): Promise<void> {
    const code = errorCodeFrom(error);
    const permanent = isJobFailure(error) && error.permanent;
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : '';

    let outcome;

    try {
      outcome = await options.queue.fail({
        id: entry.job.id,
        token: entry.job.lease_token ?? '',
        code,
        message,
        permanent,
        workerId: options.workerId,
      });
    } catch (failureError) {
      // 寫不入去就由租約接手：過期之後會回收再試，工作不會掉。
      // 只記錄代碼，唔記錄訊息（可能含連線參數）。
      log({ event: 'job.fail_failed', jobId: entry.job.id, code: errorCodeFrom(failureError) });
      return;
    }

    if (outcome.status === 'stale') {
      await noteLeaseLost(entry);
      return;
    }

    if (outcome.status === 'dead') {
      log({
        event: 'job.dead',
        jobId: entry.job.id,
        type: entry.job.type,
        attempt: entry.job.attempts,
        code,
      });
      return;
    }

    log({
      event: 'job.retry_scheduled',
      jobId: entry.job.id,
      type: entry.job.type,
      attempt: entry.job.attempts,
      code,
      delayMs: outcome.delayMs,
    });
  }

  async function execute(entry: ActiveJob): Promise<void> {
    const handler = options.registry.get(entry.job.type);

    if (handler === undefined) {
      // 領取條件已經按 registry 過濾，所以這一條理論上唔會發生。
      // 真的發生就唔好假裝跑過：留住租約，過期之後再講。
      log({ event: 'job.handler_missing', jobId: entry.job.id, type: entry.job.type });
      return;
    }

    try {
      await handler({
        jobId: entry.job.id,
        type: entry.job.type,
        payload: entry.job.payload,
        attempt: entry.job.attempts,
        maxAttempts: entry.job.max_attempts,
        workerId: options.workerId,
        signal: entry.controller.signal,
      });
    } catch (error) {
      if (entry.abandoned || entry.leaseLost) {
        return;
      }

      await recordFailure(entry, error);
      return;
    }

    if (entry.abandoned || entry.leaseLost) {
      return;
    }

    try {
      const completed = await options.queue.complete({
        id: entry.job.id,
        token: entry.job.lease_token ?? '',
        workerId: options.workerId,
      });

      if (!completed) {
        // 租約已經不是我們的：結果作廢，唔會覆蓋新 worker。
        await noteLeaseLost(entry);
        return;
      }

      log({
        event: 'job.succeeded',
        jobId: entry.job.id,
        type: entry.job.type,
        attempt: entry.job.attempts,
      });
    } catch (error) {
      log({ event: 'job.complete_failed', jobId: entry.job.id, code: errorCodeFrom(error) });
    }
  }

  function startJob(job: JobRow): void {
    const entry: ActiveJob = {
      job,
      controller: new AbortController(),
      renewTimer: null,
      promise: Promise.resolve(),
      leaseLost: false,
      abandoned: false,
    };

    // 續租週期要比租約短得多：租約 60 秒就每 20 秒續一次，容許兩次失敗。
    const renewalMs = Math.max(50, Math.floor(options.leaseMs / 3));

    entry.renewTimer = setInterval(() => {
      void renewOnce(entry);
    }, renewalMs);

    log({
      event: 'job.claimed',
      jobId: job.id,
      type: job.type,
      attempt: job.attempts,
    });

    active.set(job.id, entry);

    entry.promise = execute(entry).finally(() => {
      if (entry.renewTimer !== null) {
        clearInterval(entry.renewTimer);
        entry.renewTimer = null;
      }

      active.delete(job.id);

      if (active.size === 0) {
        resolveIdleWaiters();
      }
    });
  }

  async function tick(): Promise<number> {
    if (stopping) {
      return 0;
    }

    let started = 0;

    while (!stopping && active.size < options.concurrency) {
      const job = await options.queue.claim({
        workerId: options.workerId,
        leaseMs: options.leaseMs,
      });

      if (job === null) {
        break;
      }

      started += 1;
      startJob(job);
    }

    return started;
  }

  async function runLoop(): Promise<void> {
    let failures = 0;

    while (!stopping) {
      try {
        const started = await tick();
        failures = 0;

        if (stopping) {
          break;
        }

        // 有工作就即刻再看：積壓時不需要等一個輪詢間隔。
        if (started > 0) {
          continue;
        }

        await sleepInterruptible(options.pollIntervalMs);
      } catch (error) {
        failures += 1;

        // 指數退避，但有上限：服務死了一整天之後仍然會繼續試。
        const retryInMs = Math.min(options.pollIntervalMs * 2 ** failures, MAX_CLAIM_BACKOFF_MS);

        // 只記錄代碼：錯誤訊息可能含連線字串與密碼。
        log({ event: 'worker.claim_failed', code: errorCodeFrom(error), retryInMs });

        await sleepInterruptible(retryInMs);
      }
    }

    polling = false;
  }

  function start(): void {
    if (polling) {
      return;
    }

    polling = true;
    log({
      event: 'worker.started',
      workerId: options.workerId,
      concurrency: options.concurrency,
      types: options.registry.types(),
    });

    void runLoop();
  }

  async function stop(stopOptions: { graceMs?: number } = {}): Promise<{
    drained: boolean;
    active: number;
  }> {
    stopping = true;
    wake?.();

    const graceMs = stopOptions.graceMs ?? options.shutdownGraceMs;

    if (active.size > 0 && graceMs > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, graceMs);

        idleResolvers.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    const drained = active.size === 0;

    if (!drained) {
      // 唔假裝已停止：只記錄我們放棄等待。資料列仍然是 running，
      // 租約過期之後由回收程序接手。
      for (const entry of active.values()) {
        entry.abandoned = true;

        if (entry.renewTimer !== null) {
          clearInterval(entry.renewTimer);
          entry.renewTimer = null;
        }

        entry.controller.abort();
        log({
          event: 'job.abandoned',
          jobId: entry.job.id,
          type: entry.job.type,
          attempt: entry.job.attempts,
        });
      }
    }

    log({ event: 'worker.stopped', drained, active: active.size });

    return { drained, active: active.size };
  }

  async function idle(): Promise<void> {
    if (active.size === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      idleResolvers.push(resolve);
    });
  }

  return {
    workerId: options.workerId,
    start,
    stop,
    tick,
    idle,
    stats: () => ({ active: active.size, stopping, polling }),
  };
}

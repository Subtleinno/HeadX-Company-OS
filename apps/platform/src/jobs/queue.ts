import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { backoffDelayMs, DEFAULT_BACKOFF, validateBackoff, type BackoffConfig } from './backoff.js';
import { errorCodeFrom, redactErrorSummary } from './redact.js';
import type { HandlerRegistry } from './registry.js';
import { parseEnqueueInput } from './schema.js';
import * as store from './store.js';
import { inTransaction } from './store.js';
import type { JobRow } from './types.js';

/**
 * 背景工作的內部介面（issue #85）。
 *
 * 對外（其他平台模組）只有這一個 facade：入隊、領取、完成、失敗、續租、回收。
 * 沒有任何 HTTP 端點 —— 這一張明確不提供公開 enqueue，也不提供「執行任意
 * 工作種類」的入口。要加工作種類，只能在程式裡註冊 handler。
 *
 * 為甚麼「失敗」要放在一個交易裡：狀態改變與審計要一齊成功。
 * 如果先寫狀態再寫審計，中間斷線就會出現「工作死了但冇人知為什麼」。
 * audit_log 只准追加，補不回來。
 */

export class JobValidationError extends Error {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super(`入隊輸入不合法：${reasons.join('；')}`);
    this.name = 'JobValidationError';
    this.reasons = reasons;
  }
}

export type EnqueueInput = {
  type: string;
  payload: unknown;
  idempotencyKey?: string;
  maxAttempts?: number;
  runAt?: Date;
};

export type FailInput = {
  id: string;
  token: string;
  code: string;
  /** 原始錯誤訊息；寫入前一定會遮罩。 */
  message: string;
  permanent?: boolean;
  workerId?: string;
};

export type FailOutcome =
  | { status: 'retry'; delayMs: number; nextRunAt: Date }
  | { status: 'dead' }
  /** 租約已不是這一個 worker 的：結果作廢，唔會覆蓋新 worker。 */
  | { status: 'stale' };

export type JobQueue = {
  enqueue: (input: EnqueueInput) => Promise<{ job: JobRow; created: boolean }>;
  claim: (input: { workerId: string; leaseMs: number }) => Promise<JobRow | null>;
  complete: (input: { id: string; token: string; workerId?: string }) => Promise<boolean>;
  fail: (input: FailInput) => Promise<FailOutcome>;
  renew: (input: { id: string; token: string; leaseMs: number }) => Promise<boolean>;
  reclaimExpired: () => Promise<{ requeued: number; dead: number }>;
  recordLeaseLost: (input: {
    id: string;
    workerId: string;
    type: string;
    attempt: number;
  }) => Promise<void>;
  get: (id: string) => Promise<JobRow | null>;
  listDead: (input?: { limit?: number; offset?: number }) => Promise<JobRow[]>;
  countPendingByType: () => Promise<Array<{ type: string; count: number; oldestRunAt: Date }>>;
};

export type JobQueueOptions = {
  db: Pool;
  registry: HandlerRegistry;
  backoff?: BackoffConfig;
  /** 測試注入：所有時間判斷都用這一個時鐘，所以「到期」不需要 sleep。 */
  now?: () => Date;
  /** 測試注入：抖動的隨機來源。 */
  random?: () => number;
};

const DEAD_PAGE_LIMIT = 20;
const DEAD_PAGE_MAX = 100;

function clampPage(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), 0), max);
}

export function createJobQueue(options: JobQueueOptions): JobQueue {
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const backoffErrors = validateBackoff(backoff);

  if (backoffErrors.length > 0) {
    throw new Error(`退避設定不合法：${backoffErrors.join('；')}`);
  }

  const now = options.now ?? ((): Date => new Date());
  const random = options.random ?? Math.random;

  async function enqueue(input: EnqueueInput): Promise<{ job: JobRow; created: boolean }> {
    const at = now();
    const parsed = parseEnqueueInput(input, at);

    if (parsed.value === undefined) {
      throw new JobValidationError(parsed.errors);
    }

    const request = parsed.value;

    // type 一定要有 handler：否則這一筆寫得入，但永遠沒有人執行得。
    // 寧願現在報錯，也不要留一件「看似排了隊」的工作。
    if (!options.registry.has(request.type)) {
      const known = options.registry.types();
      throw new JobValidationError([
        `type 未註冊：${request.type}（只可以用 ${known.length === 0 ? '（目前沒有註冊任何種類）' : known.join('、')}）`,
      ]);
    }

    const { row, created } = await store.insertJob(options.db, {
      type: request.type,
      payload: request.payload,
      maxAttempts: request.maxAttempts,
      runAt: request.runAt,
      idempotencyKey: request.idempotencyKey,
    });

    return { job: row, created };
  }

  async function claim(input: { workerId: string; leaseMs: number }): Promise<JobRow | null> {
    const at = now();

    return store.claimJob(options.db, {
      workerId: input.workerId,
      leaseExpiresAt: new Date(at.getTime() + input.leaseMs),
      types: options.registry.types(),
      now: at,
    });
  }

  async function complete(input: {
    id: string;
    token: string;
    workerId?: string;
  }): Promise<boolean> {
    return inTransaction(options.db, async (client) => {
      const row = await store.completeJob(client, { id: input.id, token: input.token, at: now() });

      if (row === null) {
        return false;
      }

      await writeAudit(client, {
        actorType: 'system',
        actorId: input.workerId ?? 'unattributed',
        action: 'job.succeeded',
        target: row.id,
        detail: { type: row.type, attempt: row.attempts },
      });

      return true;
    });
  }

  async function fail(input: FailInput): Promise<FailOutcome> {
    const summary = redactErrorSummary(input.message);
    const actorId = input.workerId ?? 'unattributed';

    return inTransaction(options.db, async (client) => {
      const row = await store.lockRunningJob(client, { id: input.id, token: input.token });

      if (row === null) {
        return { status: 'stale' };
      }

      const at = now();
      const exhausted = row.attempts >= row.max_attempts;

      if (input.permanent === true || exhausted) {
        const updated = await store.applyFailure(client, {
          id: input.id,
          token: input.token,
          state: 'dead',
          runAt: row.run_at,
          completedAt: at,
          code: input.code,
          summary,
        });

        if (updated === null) {
          return { status: 'stale' };
        }

        await writeAudit(client, {
          actorType: 'system',
          actorId,
          action: 'job.dead',
          target: row.id,
          detail: { type: row.type, attempt: row.attempts, code: input.code },
        });

        return { status: 'dead' };
      }

      const delayMs = backoffDelayMs(row.attempts, backoff, random);
      const nextRunAt = new Date(at.getTime() + delayMs);

      const updated = await store.applyFailure(client, {
        id: input.id,
        token: input.token,
        state: 'pending',
        runAt: nextRunAt,
        completedAt: null,
        code: input.code,
        summary,
      });

      if (updated === null) {
        return { status: 'stale' };
      }

      await writeAudit(client, {
        actorType: 'system',
        actorId,
        action: 'job.retry_scheduled',
        target: row.id,
        detail: { type: row.type, attempt: row.attempts, code: input.code, delayMs },
      });

      return { status: 'retry', delayMs, nextRunAt };
    });
  }

  async function renew(input: { id: string; token: string; leaseMs: number }): Promise<boolean> {
    const at = now();

    return store.renewLease(options.db, {
      id: input.id,
      token: input.token,
      leaseExpiresAt: new Date(at.getTime() + input.leaseMs),
      now: at,
    });
  }

  async function reclaimExpired(): Promise<{ requeued: number; dead: number }> {
    return inTransaction(options.db, async (client) => {
      const rows = await store.reclaimExpiredLeases(client, now());
      let requeued = 0;
      let dead = 0;

      for (const row of rows) {
        if (row.state === 'dead') {
          dead += 1;
        } else {
          requeued += 1;
        }

        await writeAudit(client, {
          actorType: 'system',
          actorId: 'lease-reclaimer',
          action: 'job.lease_expired',
          target: row.id,
          detail: { type: row.type, attempt: row.attempts, state: row.state },
        });
      }

      return { requeued, dead };
    });
  }

  async function recordLeaseLost(input: {
    id: string;
    workerId: string;
    type: string;
    attempt: number;
  }): Promise<void> {
    await writeAudit(options.db, {
      actorType: 'system',
      actorId: input.workerId,
      action: 'job.lease_lost',
      target: input.id,
      detail: { type: input.type, attempt: input.attempt },
    });
  }

  async function listDead(input: { limit?: number; offset?: number } = {}): Promise<JobRow[]> {
    return store.listDeadJobs(options.db, {
      limit: clampPage(input.limit, DEAD_PAGE_LIMIT, DEAD_PAGE_MAX),
      offset: clampPage(input.offset, 0, Number.MAX_SAFE_INTEGER),
    });
  }

  return {
    enqueue,
    claim,
    complete,
    fail,
    renew,
    reclaimExpired,
    recordLeaseLost,
    get: (id) => store.getJob(options.db, id),
    listDead,
    countPendingByType: async () => {
      const rows = await store.countPendingByType(options.db);

      return rows.map((row) => ({
        type: row.type,
        count: row.count,
        oldestRunAt: row.oldest_run_at,
      }));
    },
  };
}

/** 供 worker 把錯誤轉成可以寫入的摘要與代碼（同一個來源，不重複實作）。 */
export { errorCodeFrom, redactErrorSummary };

import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createJobQueue, JobValidationError, type JobQueue } from '../../src/jobs/queue';
import { createHandlerRegistry, type HandlerRegistry, type JobHandler } from '../../src/jobs/registry';
import type { BackoffConfig } from '../../src/jobs/backoff';
import { createWorker, type JobWorker, type WorkerEvent } from '../../src/jobs/worker';
import { JobFailure, type JobRow } from '../../src/jobs/types';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 背景工作隊列與 worker（issue #85）。
 *
 * 測試策略：真 Postgres 的臨時資料庫，時鐘與隨機全部注入，handler 由測試控制。
 * 全程沒有 sleep 去「碰」時間 —— 要工作到期就把時鐘推前，要租約過期就把時鐘推前，
 * 要 handler 卡住就等一個由測試放行的 promise。所以每一個斷言都指向一條規則，
 * 不是一個巧合。
 *
 * 這一張最危險的地方不是功能，而是「重複執行」與「次數上限被繞過」：
 * 租約回收寫錯，同一個工作會跑無限次；次數上限寫錯，崩潰的 worker 可以永遠逃。
 * 所以這兩件事各有獨立的測試，而且寧願測得細。
 */

const MIGRATIONS_DIR = resolve(process.cwd(), 'db/migrations');

type Clock = {
  now: () => Date;
  advance: (ms: number) => void;
};

function fakeClock(start = '2026-01-01T00:00:00.000Z'): Clock {
  const at = new Date(start);
  return {
    now: () => new Date(at.getTime()),
    advance: (ms) => {
      at.setTime(at.getTime() + ms);
    },
  };
}

/** 真時鐘：只有「續租要真嘅時間流逝」那一個測試用。 */
function realClock(): Clock {
  return { now: () => new Date(), advance: () => undefined };
}

const DETERMINISTIC: BackoffConfig = { initialMs: 5000, maxMs: 300_000, factor: 2, jitter: 0 };

type Handlers = Record<string, JobHandler>;

type Harness = {
  db: TempDatabase;
  clock: Clock;
  registry: HandlerRegistry;
  queue: JobQueue;
};

async function harness(
  handlersFor: (deps: { queue: () => JobQueue; clock: Clock; db: TempDatabase }) => Handlers = () => ({
    'demo.noop': async () => undefined,
  }),
  options: { clock?: Clock; backoff?: BackoffConfig } = {},
): Promise<Harness> {
  const db = await createTempDatabase();

  await migrate({ pool: db.pool, dir: MIGRATIONS_DIR });

  const clock = options.clock ?? fakeClock();
  const handlers = handlersFor({
    // 延後取用：handler 要呼叫隊列，而隊列要 registry，registry 要 handler。
    queue: () => queue,
    clock,
    db,
  });
  const registry = createHandlerRegistry(handlers);

  const queue = createJobQueue({
    db: db.pool,
    registry,
    backoff: options.backoff ?? DETERMINISTIC,
    now: clock.now,
  });

  return { db, clock, registry, queue };
}

/** 建立 worker；事件收集起來當作「結構化事件」的證據。 */
function makeWorker(
  h: Harness,
  overrides: {
    workerId?: string;
    concurrency?: number;
    pollIntervalMs?: number;
    leaseMs?: number;
    shutdownGraceMs?: number;
  } = {},
): { worker: JobWorker; events: WorkerEvent[] } {
  const events: WorkerEvent[] = [];

  const worker = createWorker({
    queue: h.queue,
    registry: h.registry,
    workerId: overrides.workerId ?? 'worker-a',
    concurrency: overrides.concurrency ?? 1,
    pollIntervalMs: overrides.pollIntervalMs ?? 1000,
    leaseMs: overrides.leaseMs ?? 60_000,
    shutdownGraceMs: overrides.shutdownGraceMs ?? 5000,
    log: (event) => events.push(event),
  });

  return { worker, events };
}

function ids(h: Harness, type = 'demo.noop') {
  return h.queue.enqueue({ type, payload: {} });
}

async function auditActions(h: Harness): Promise<string[]> {
  const rows = await h.db.pool.query<{ action: string }>(
    'select action from audit_log order by id',
  );

  return rows.rows.map((row) => row.action);
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

async function waitFor(
  check: () => boolean | Promise<boolean>,
  label: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (await check()) {
      return;
    }

    if (Date.now() > deadline) {
      throw new Error(`等不到${label}（${timeoutMs}ms）`);
    }

    await sleep(10);
  }
}

let open: TempDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.map((db) => db.drop()));
  open = [];
});

async function fresh(
  handlersFor?: Parameters<typeof harness>[0],
  options?: Parameters<typeof harness>[1],
): Promise<Harness> {
  const h = await harness(handlersFor, options);
  open.push(h.db);
  return h;
}

describe('migration 0008：job 表與約束', () => {
  it('四個狀態齊，其他值寫不入（每個值都有程式寫入，見下面幾個測試）', async () => {
    const h = await fresh();

    const columns = await h.db.pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'job' order by column_name`,
    );
    const names = columns.rows.map((row) => row.column_name);

    for (const required of [
      'id',
      'type',
      'payload',
      'state',
      'run_at',
      'attempts',
      'max_attempts',
      'lease_token',
      'lease_expires_at',
      'locked_by',
      'last_error_code',
      'created_at',
      'updated_at',
      'completed_at',
      'idempotency_key',
    ]) {
      expect(names).toContain(required);
    }

    await expect(
      h.db.pool.query(`insert into job (type, payload, state) values ('demo.noop', '{}'::jsonb, 'queued')`),
    ).rejects.toThrow(/job_state_valid|check constraint/i);
  });

  it('running 一定要有租約，其他狀態一定不可以有', async () => {
    const h = await fresh();

    await expect(
      h.db.pool.query(`insert into job (type, payload, state) values ('demo.noop', '{}'::jsonb, 'running')`),
    ).rejects.toThrow(/job_lease_matches_state/);

    await expect(
      h.db.pool.query(
        `insert into job (type, payload, state, lease_token, lease_expires_at, locked_by)
         values ('demo.noop', '{}'::jsonb, 'pending', gen_random_uuid(), now(), 'w')`,
      ),
    ).rejects.toThrow(/job_lease_matches_state/);
  });

  it('payload 一定要是 JSON 物件；陣列與純量都寫不入', async () => {
    const h = await fresh();

    await expect(
      h.db.pool.query(`insert into job (type, payload) values ('demo.noop', '[]'::jsonb)`),
    ).rejects.toThrow(/job_payload_object/);

    await expect(
      h.db.pool.query(`insert into job (type, payload) values ('demo.noop', '3'::jsonb)`),
    ).rejects.toThrow(/job_payload_object/);
  });

  it('attempts 不可以超過 max_attempts，上限本身有範圍', async () => {
    const h = await fresh();

    await expect(
      h.db.pool.query(
        `insert into job (type, payload, attempts, max_attempts) values ('demo.noop', '{}'::jsonb, 6, 5)`,
      ),
    ).rejects.toThrow(/job_attempts_range/);

    await expect(
      h.db.pool.query(`insert into job (type, payload, max_attempts) values ('demo.noop', '{}'::jsonb, 0)`),
    ).rejects.toThrow(/job_max_attempts_range/);
  });

  it('dead 一定要有錯誤代碼，completed_at 與終態一致', async () => {
    const h = await fresh();

    await expect(
      h.db.pool.query(`insert into job (type, payload, state) values ('demo.noop', '{}'::jsonb, 'dead')`),
    ).rejects.toThrow(/job_dead_has_error|job_completed/);

    await expect(
      h.db.pool.query(
        `insert into job (type, payload, state, completed_at) values ('demo.noop', '{}'::jsonb, 'succeeded', now())`,
      ),
    ).resolves.toBeDefined();

    await expect(
      h.db.pool.query(
        `insert into job (type, payload, state) values ('demo.noop', '{}'::jsonb, 'succeeded')`,
      ),
    ).rejects.toThrow(/job_completed/);
  });

  it('四個狀態全部有程式寫入：pending、running、succeeded、dead', async () => {
    const h = await fresh();
    const { job: queued } = await ids(h);

    expect(queued.state).toBe('pending');

    const running = await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });

    expect(running?.state).toBe('running');

    await h.queue.complete({ id: running?.id ?? '', token: running?.lease_token ?? '' });

    const { job: second } = await ids(h);
    const claimed = await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });

    await h.queue.fail({
      id: claimed?.id ?? '',
      token: claimed?.lease_token ?? '',
      code: 'handler_error',
      message: 'boom',
      permanent: true,
    });

    const states = await h.db.pool.query<{ state: string }>('select state from job order by created_at, id');

    expect(states.rows.map((row) => row.state).sort()).toEqual(['dead', 'succeeded']);
    expect(second.state).toBe('pending');
  });
});

describe('入隊', () => {
  it('建立 pending 工作，attempts 為 0，即刻到期', async () => {
    const h = await fresh();
    const { job, created } = await h.queue.enqueue({ type: 'demo.noop', payload: { a: 1 } });

    expect(created).toBe(true);
    expect(job.state).toBe('pending');
    expect(job.attempts).toBe(0);
    expect(job.max_attempts).toBe(5);
    expect(job.payload).toEqual({ a: 1 });
    expect(job.run_at.getTime()).toBe(h.clock.now().getTime());
    expect(job.lease_token).toBeNull();
    expect(job.idempotency_key).toBeNull();
  });

  it('同一個 idempotency_key 順序入隊兩次只建立一筆', async () => {
    const h = await fresh();
    const first = await h.queue.enqueue({
      type: 'demo.noop',
      payload: { n: 1 },
      idempotencyKey: 'demo:one',
    });
    const second = await h.queue.enqueue({
      type: 'demo.noop',
      payload: { n: 2 },
      idempotencyKey: 'demo:one',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(second.job.payload).toEqual({ n: 1 });

    const count = await h.db.pool.query<{ n: number }>('select count(*)::int as n from job');

    expect(count.rows[0]?.n).toBe(1);
  });

  it('同一個 idempotency_key 並發入隊只建立一筆（唯一索引擋住，不是靠先查再寫）', async () => {
    const h = await fresh();
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        h.queue.enqueue({ type: 'demo.noop', payload: { n }, idempotencyKey: 'demo:race' }),
      ),
    );

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.job.id)).size).toBe(1);

    const count = await h.db.pool.query<{ n: number }>('select count(*)::int as n from job');

    expect(count.rows[0]?.n).toBe(1);
  });

  it('未註冊的 type 被拒：type 只可以來自程式明寫的 handler', async () => {
    const h = await fresh();

    await expect(h.queue.enqueue({ type: 'demo.other', payload: {} })).rejects.toBeInstanceOf(
      JobValidationError,
    );
    await expect(h.queue.enqueue({ type: 'demo.other', payload: {} })).rejects.toThrow(/未註冊/);

    const count = await h.db.pool.query<{ n: number }>('select count(*)::int as n from job');

    expect(count.rows[0]?.n).toBe(0);
  });

  it('夾帶機密的 payload 被拒，一行都不會寫入', async () => {
    const h = await fresh();

    await expect(
      h.queue.enqueue({ type: 'demo.noop', payload: { password: 'hunter2' } }),
    ).rejects.toThrow(/機密/);

    const count = await h.db.pool.query<{ n: number }>('select count(*)::int as n from job');

    expect(count.rows[0]?.n).toBe(0);
  });

  it('指定將來的 runAt：現在領取不到，時鐘到期就領得到', async () => {
    const h = await fresh();

    await h.queue.enqueue({
      type: 'demo.noop',
      payload: {},
      runAt: new Date(h.clock.now().getTime() + 60_000),
    });

    expect(await h.queue.claim({ workerId: 'w', leaseMs: 10_000 })).toBeNull();

    h.clock.advance(60_000);

    expect(await h.queue.claim({ workerId: 'w', leaseMs: 10_000 })).not.toBeNull();
  });

  it('指定 maxAttempts 會寫入該筆工作，不是全隊共用一個數字', async () => {
    const h = await fresh();
    const { job } = await h.queue.enqueue({ type: 'demo.noop', payload: {}, maxAttempts: 2 });

    expect(job.max_attempts).toBe(2);
  });
});

describe('領取與並發', () => {
  it('領取之後 state 是 running、次數加一、有不可猜測的租約', async () => {
    const h = await fresh();
    await ids(h);

    const claimed = await h.queue.claim({ workerId: 'w1', leaseMs: 60_000 });

    expect(claimed).not.toBeNull();
    expect(claimed?.state).toBe('running');
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.locked_by).toBe('w1');
    expect(claimed?.lease_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(claimed?.lease_expires_at?.getTime()).toBe(h.clock.now().getTime() + 60_000);
  });

  it('兩個 worker 同時領取同一份工作，只會有一個拿到', async () => {
    const h = await fresh();
    await ids(h);

    const [a, b] = await Promise.all([
      h.queue.claim({ workerId: 'a', leaseMs: 60_000 }),
      h.queue.claim({ workerId: 'b', leaseMs: 60_000 }),
    ]);

    expect([a, b].filter((row) => row !== null)).toHaveLength(1);
  });

  it('兩個 worker 同時清空五件工作：每件只被領一次，總數剛好五', async () => {
    const h = await fresh();
    await Promise.all([1, 2, 3, 4, 5].map(() => ids(h)));

    const seen: string[] = [];

    await Promise.all(
      ['a', 'b'].map(async (workerId) => {
        for (;;) {
          const claimed = await h.queue.claim({ workerId, leaseMs: 60_000 });

          if (claimed === null) {
            return;
          }

          seen.push(claimed.id);
        }
      }),
    );

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('不會領取未註冊 type 的工作（另一個 fleet 的工作不可以偷）', async () => {
    const h = await fresh();

    // 直接寫入，模擬另一組程式登記、但這隻 worker 不認識的工作。
    await h.db.pool.query(
      `insert into job (type, payload, max_attempts) values ('other.fleet', '{}'::jsonb, 5)`,
    );

    expect(await h.queue.claim({ workerId: 'w', leaseMs: 60_000 })).toBeNull();

    const row = await h.db.pool.query<{ state: string }>(`select state from job where type = 'other.fleet'`);

    expect(row.rows[0]?.state).toBe('pending');
  });
});

describe('完成與舊 token', () => {
  it('完成之後是 succeeded，租約清空，completed_at 有值', async () => {
    const h = await fresh();
    await ids(h);
    const claimed = await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });

    const done = await h.queue.complete({
      id: claimed?.id ?? '',
      token: claimed?.lease_token ?? '',
    });

    expect(done).toBe(true);

    const row = await h.queue.get(claimed?.id ?? '');

    expect(row?.state).toBe('succeeded');
    expect(row?.completed_at).not.toBeNull();
    expect(row?.lease_token).toBeNull();
    expect(row?.lease_expires_at).toBeNull();
    expect(row?.locked_by).toBeNull();
    expect(row?.attempts).toBe(1);
  });

  it('同一筆完成兩次：第二次回 false，狀態不會被改第二次', async () => {
    const h = await fresh();
    await ids(h);
    const claimed = await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });

    await h.queue.complete({ id: claimed?.id ?? '', token: claimed?.lease_token ?? '' });

    expect(
      await h.queue.complete({ id: claimed?.id ?? '', token: claimed?.lease_token ?? '' }),
    ).toBe(false);
  });

  it('舊 token 完成被拒：租約被回收交給另一個 worker 之後，舊結果寫不回去', async () => {
    const h = await fresh();
    await ids(h);

    const first = await h.queue.claim({ workerId: 'slow', leaseMs: 60_000 });

    h.clock.advance(60_001);
    expect(await h.queue.reclaimExpired()).toEqual({ requeued: 1, dead: 0 });

    const second = await h.queue.claim({ workerId: 'fast', leaseMs: 60_000 });

    expect(second?.id).toBe(first?.id);
    expect(second?.lease_token).not.toBe(first?.lease_token);

    expect(
      await h.queue.complete({ id: first?.id ?? '', token: first?.lease_token ?? '' }),
    ).toBe(false);

    const row = await h.queue.get(first?.id ?? '');

    expect(row?.state).toBe('running');
    expect(row?.locked_by).toBe('fast');

    expect(
      await h.queue.complete({ id: second?.id ?? '', token: second?.lease_token ?? '' }),
    ).toBe(true);
  });
});

describe('失敗、退避與次數上限', () => {
  it('失敗之後回到 pending，run_at 是現在加退避，錯誤代碼與摘要留低', async () => {
    const h = await fresh();
    await ids(h);
    const claimed = await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });

    const outcome = await h.queue.fail({
      id: claimed?.id ?? '',
      token: claimed?.lease_token ?? '',
      code: 'handler_error',
      message: 'boom',
    });

    expect(outcome).toEqual({
      status: 'retry',
      delayMs: 5000,
      nextRunAt: new Date(h.clock.now().getTime() + 5000),
    });

    const row = await h.queue.get(claimed?.id ?? '');

    expect(row?.state).toBe('pending');
    expect(row?.attempts).toBe(1);
    expect(row?.last_error_code).toBe('handler_error');
    expect(row?.last_error_summary).toBe('boom');
    expect(row?.run_at.getTime()).toBe(h.clock.now().getTime() + 5000);
    expect(row?.lease_token).toBeNull();

    // 未到期：即刻領取不到，唔會忙迴圈。
    expect(await h.queue.claim({ workerId: 'w', leaseMs: 60_000 })).toBeNull();

    h.clock.advance(5000);

    expect(await h.queue.claim({ workerId: 'w', leaseMs: 60_000 })).not.toBeNull();
  });

  it('摘要會遮罩機密，長度有限（audit_log 只准追加，寫入就拎唔返）', async () => {
    const h = await fresh();
    await ids(h);
    const claimed = await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });

    await h.queue.fail({
      id: claimed?.id ?? '',
      token: claimed?.lease_token ?? '',
      code: 'handler_error',
      message: `連線失敗 postgres://company_os:hunter2@db:5432/company_os ${'x'.repeat(500)}`,
    });

    const row = await h.queue.get(claimed?.id ?? '');

    expect(row?.last_error_summary).not.toContain('hunter2');
    expect(row?.last_error_summary?.length).toBeLessThanOrEqual(200);
  });

  it('達到 max_attempts 之後進 dead，並留在資料庫（唔會自動刪、唔會自動重跑）', async () => {
    const h = await fresh();
    await h.queue.enqueue({ type: 'demo.noop', payload: {}, maxAttempts: 2 });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const claimed = await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });
      const outcome = await h.queue.fail({
        id: claimed?.id ?? '',
        token: claimed?.lease_token ?? '',
        code: 'handler_error',
        message: 'boom',
      });

      if (attempt === 1) {
        expect(outcome.status).toBe('retry');
        h.clock.advance(5000);
      } else {
        expect(outcome).toEqual({ status: 'dead' });
      }
    }

    const dead = await h.queue.listDead();

    expect(dead).toHaveLength(1);
    expect(dead[0]?.state).toBe('dead');
    expect(dead[0]?.attempts).toBe(2);
    expect(dead[0]?.completed_at).not.toBeNull();
    expect(dead[0]?.last_error_code).toBe('handler_error');

    // 已死的工作不會再被領取。
    expect(await h.queue.claim({ workerId: 'w', leaseMs: 60_000 })).toBeNull();
  });

  it('permanent 失敗即刻 dead，不會燒光次數', async () => {
    const h = await fresh();
    await h.queue.enqueue({ type: 'demo.noop', payload: {}, maxAttempts: 5 });
    const claimed = await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });

    const outcome = await h.queue.fail({
      id: claimed?.id ?? '',
      token: claimed?.lease_token ?? '',
      code: 'payload_rejected',
      message: '壞了',
      permanent: true,
    });

    expect(outcome).toEqual({ status: 'dead' });

    const row = await h.queue.get(claimed?.id ?? '');

    expect(row?.state).toBe('dead');
    expect(row?.attempts).toBe(1);
  });

  it('租約過期回收：未達上限回 pending，達上限進 dead', async () => {
    const h = await fresh();
    await h.queue.enqueue({ type: 'demo.noop', payload: {}, maxAttempts: 2 });

    await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });
    h.clock.advance(60_001);

    expect(await h.queue.reclaimExpired()).toEqual({ requeued: 1, dead: 0 });

    const requeued = await h.queue.listDead();

    expect(requeued).toHaveLength(0);

    const row = await h.db.pool.query<JobRow>('select * from job');

    expect(row.rows[0]?.state).toBe('pending');
    expect(row.rows[0]?.last_error_code).toBe('lease_expired');
    expect(row.rows[0]?.attempts).toBe(1);

    await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });
    h.clock.advance(60_001);

    expect(await h.queue.reclaimExpired()).toEqual({ requeued: 0, dead: 1 });

    const dead = await h.queue.listDead();

    expect(dead[0]?.attempts).toBe(2);
    expect(dead[0]?.last_error_code).toBe('lease_expired');
  });

  it('worker 崩潰逃不過次數上限：租約一再過期，最後一定 dead', async () => {
    const h = await fresh();
    await h.queue.enqueue({ type: 'demo.noop', payload: {}, maxAttempts: 3 });

    // 模擬一隻每次都崩潰的 worker：領取之後不完成、不失敗，只讓租約過期。
    for (let round = 0; round < 10; round += 1) {
      const claimed = await h.queue.claim({ workerId: 'crashy', leaseMs: 60_000 });

      if (claimed === null) {
        break;
      }

      h.clock.advance(60_001);
      await h.queue.reclaimExpired();
    }

    const row = await h.db.pool.query<JobRow>('select * from job');

    expect(row.rows[0]?.state).toBe('dead');
    expect(row.rows[0]?.attempts).toBe(3);
  });
});

describe('續租', () => {
  it('續租延長租約；token 不對或已完成都續不到', async () => {
    const h = await fresh();
    await ids(h);
    const claimed = await h.queue.claim({ workerId: 'w', leaseMs: 60_000 });

    h.clock.advance(20_000);

    expect(
      await h.queue.renew({ id: claimed?.id ?? '', token: claimed?.lease_token ?? '', leaseMs: 60_000 }),
    ).toBe(true);

    const renewed = await h.queue.get(claimed?.id ?? '');

    expect(renewed?.lease_expires_at?.getTime()).toBe(h.clock.now().getTime() + 60_000);

    expect(
      await h.queue.renew({ id: claimed?.id ?? '', token: '不是我的 token', leaseMs: 60_000 }),
    ).toBe(false);

    await h.queue.complete({ id: claimed?.id ?? '', token: claimed?.lease_token ?? '' });

    expect(
      await h.queue.renew({ id: claimed?.id ?? '', token: claimed?.lease_token ?? '', leaseMs: 60_000 }),
    ).toBe(false);
  });

  it('續租競態：租約被回收之後，舊 worker 續不到租', async () => {
    const h = await fresh();
    await ids(h);
    const first = await h.queue.claim({ workerId: 'slow', leaseMs: 60_000 });

    h.clock.advance(60_001);
    await h.queue.reclaimExpired();
    await h.queue.claim({ workerId: 'fast', leaseMs: 60_000 });

    expect(
      await h.queue.renew({ id: first?.id ?? '', token: first?.lease_token ?? '', leaseMs: 60_000 }),
    ).toBe(false);
  });
});

describe('worker', () => {
  it('成功執行一次：handler 收到 payload 與次數，完成後是 succeeded', async () => {
    const seen: Array<{ jobId: string; attempt: number; payload: unknown; workerId: string }> = [];
    const h = await fresh(() => ({
      'demo.noop': async (ctx) => {
        seen.push({
          jobId: ctx.jobId,
          attempt: ctx.attempt,
          payload: ctx.payload,
          workerId: ctx.workerId,
        });
      },
    }));
    const { job } = await h.queue.enqueue({ type: 'demo.noop', payload: { a: 1 } });
    const { worker, events } = makeWorker(h);

    expect(await worker.tick()).toBe(1);
    await worker.idle();

    expect(seen).toEqual([{ jobId: job.id, attempt: 1, payload: { a: 1 }, workerId: 'worker-a' }]);
    expect((await h.queue.get(job.id))?.state).toBe('succeeded');
    expect(events.map((event) => event.event)).toEqual(['job.claimed', 'job.succeeded']);
    expect(await auditActions(h)).toContain('job.succeeded');
  });

  it('並發有界：同一時刻最多執行 concurrency 件，完成一件之後才領下一件', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    let running = 0;
    let peak = 0;

    const h = await fresh(() => ({
      'demo.noop': async () => {
        running += 1;
        peak = Math.max(peak, running);
        await gate;
        running -= 1;
      },
    }));

    await Promise.all([1, 2, 3].map(() => ids(h)));

    const { worker } = makeWorker(h, { concurrency: 2 });

    expect(await worker.tick()).toBe(2);
    expect(await worker.tick()).toBe(0);
    expect(worker.stats().active).toBe(2);

    release();
    await worker.idle();

    expect(peak).toBe(2);
    expect(await worker.tick()).toBe(1);
    await worker.idle();
  });

  it('handler 拋錯：退避重試，事件與審計都留痕', async () => {
    const h = await fresh(() => ({
      'demo.noop': async () => {
        throw new Error('boom password=hunter2');
      },
    }));
    const { job } = await h.queue.enqueue({ type: 'demo.noop', payload: {}, maxAttempts: 2 });
    const { worker, events } = makeWorker(h);

    await worker.tick();
    await worker.idle();

    const row = await h.queue.get(job.id);

    expect(row?.state).toBe('pending');
    expect(row?.last_error_code).toBe('handler_error');
    expect(row?.last_error_summary).not.toContain('hunter2');
    expect(row?.run_at.getTime()).toBe(h.clock.now().getTime() + 5000);
    expect(events.map((event) => event.event)).toEqual(['job.claimed', 'job.retry_scheduled']);
    expect(await auditActions(h)).toContain('job.retry_scheduled');

    h.clock.advance(5000);
    await worker.tick();
    await worker.idle();

    expect((await h.queue.get(job.id))?.state).toBe('dead');
    expect(events.map((event) => event.event)).toContain('job.dead');
    expect(await auditActions(h)).toContain('job.dead');
  });

  it('handler 拋 JobFailure：用它的代碼，permanent 即刻 dead', async () => {
    const h = await fresh(() => ({
      'demo.noop': async () => {
        throw new JobFailure('payload_rejected', '壞了', { permanent: true });
      },
    }));
    await ids(h);
    const { worker } = makeWorker(h);

    await worker.tick();
    await worker.idle();

    const [dead] = await h.queue.listDead();

    expect(dead?.last_error_code).toBe('payload_rejected');
    expect(dead?.attempts).toBe(1);
  });

  it('租約在執行期間被回收：worker 不會把結果寫回去', async () => {
    const h = await fresh(({ queue, clock }) => ({
      'demo.noop': async (ctx) => {
        // 模擬另一個 worker 接手：租約過期、被回收。
        await h.db.pool.query('update job set lease_expires_at = $1 where id = $2', [
          new Date(clock.now().getTime() - 1000),
          ctx.jobId,
        ]);
        await queue().reclaimExpired();
      },
    }));
    const { job } = await ids(h);
    const { worker, events } = makeWorker(h);

    await worker.tick();
    await worker.idle();

    const row = await h.queue.get(job.id);

    expect(row?.state).toBe('pending');
    expect(row?.last_error_code).toBe('lease_expired');
    expect(events.map((event) => event.event)).toContain('job.lease_lost');
    expect(await auditActions(h)).toContain('job.lease_lost');
  });

  it('長工在執行期間會續租，租約不會過期', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });

    const h = await fresh(() => ({ 'demo.noop': async () => gate }), { clock: realClock() });
    const { job } = await ids(h);
    const { worker } = makeWorker(h, { leaseMs: 300 });

    await worker.tick();

    const claimedAt = (await h.queue.get(job.id))?.lease_expires_at?.getTime() ?? 0;

    await waitFor(
      async () => ((await h.queue.get(job.id))?.lease_expires_at?.getTime() ?? 0) > claimedAt,
      '續租',
    );

    release();
    await worker.idle();

    expect((await h.queue.get(job.id))?.state).toBe('succeeded');
  });

  it('stop 之後不再領取新工作', async () => {
    const h = await fresh();
    await ids(h);
    const { worker } = makeWorker(h);

    await worker.stop();

    expect(worker.stats().stopping).toBe(true);
    expect(await worker.tick()).toBe(0);
  });

  it('stop 會等正在執行的工作完成', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const h = await fresh(() => ({ 'demo.noop': async () => gate }));
    const { job } = await ids(h);
    const { worker } = makeWorker(h);

    await worker.tick();
    const stopping = worker.stop();

    setTimeout(() => {
      release();
    }, 20);

    const result = await stopping;

    expect(result).toEqual({ drained: true, active: 0 });
    expect((await h.queue.get(job.id))?.state).toBe('succeeded');
  });

  it('stop 超時：放棄等待，但不會假裝工作已停止（狀態仍然 running）', async () => {
    const h = await fresh(() => ({ 'demo.noop': async () => new Promise<void>(() => undefined) }));
    const { job } = await ids(h);
    const { worker, events } = makeWorker(h, { shutdownGraceMs: 100 });

    await worker.tick();

    const result = await worker.stop();

    expect(result.drained).toBe(false);
    expect(result.active).toBe(1);
    expect(events.map((event) => event.event)).toContain('job.abandoned');

    const row = await h.queue.get(job.id);

    expect(row?.state).toBe('running');
    expect(row?.last_error_code).toBeNull();
  });

  it('資料庫斷線：退避再試、不印連線秘密、工作不會掉', async () => {
    const h = await fresh();
    const { job } = await ids(h);
    const failing = {
      ...h.queue,
      claim: async (): Promise<JobRow | null> => {
        const error = new Error(
          'connect ECONNREFUSED postgres://company_os:hunter2@127.0.0.1:5432/company_os',
        );
        Object.assign(error, { code: 'ECONNREFUSED' });
        throw error;
      },
    };
    const events: WorkerEvent[] = [];
    const worker = createWorker({
      queue: failing,
      registry: h.registry,
      workerId: 'worker-a',
      concurrency: 1,
      pollIntervalMs: 20,
      leaseMs: 1000,
      shutdownGraceMs: 100,
      log: (event) => events.push(event),
    });

    worker.start();
    await waitFor(
      () => events.filter((event) => event.event === 'worker.claim_failed').length >= 2,
      '兩次領取失敗',
    );
    await worker.stop();

    const failures = events.filter((event) => event.event === 'worker.claim_failed');

    expect(failures.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(events)).not.toContain('hunter2');
    expect(JSON.stringify(events)).not.toContain('postgres://');
    expect(failures[1]).toMatchObject({ code: 'econnrefused' });
    expect((failures[1] as { retryInMs: number }).retryInMs).toBeGreaterThan(
      (failures[0] as { retryInMs: number }).retryInMs,
    );

    // 工作沒有被丟掉，也沒有被誤標。
    expect((await h.queue.get(job.id))?.state).toBe('pending');
  });

  it('start 之後 stop 不必等一個完整的輪詢間隔', async () => {
    const h = await fresh();
    const { worker } = makeWorker(h, { pollIntervalMs: 10_000 });

    worker.start();
    await waitFor(() => worker.stats().polling, '輪詢已開始');

    const startedAt = Date.now();

    await worker.stop();

    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('起動時會指出未註冊 type 的待辦工作（失敗要看得見）', async () => {
    const h = await fresh();

    await h.db.pool.query(
      `insert into job (type, payload, run_at) values ('other.fleet', '{}'::jsonb, now() - interval '1 hour')`,
    );

    const pending = await h.queue.countPendingByType();

    expect(pending).toEqual([
      expect.objectContaining({ type: 'other.fleet', count: 1 }),
    ]);
  });
});

describe('審計只准追加', () => {
  it('工作事件寫入 audit_log，內容不含 payload 與原文例外', async () => {
    const h = await fresh();
    await ids(h);
    const { worker } = makeWorker(h);

    await worker.tick();
    await worker.idle();

    const rows = await h.db.pool.query<{ actor_type: string; action: string; detail: unknown }>(
      `select actor_type, action, detail from audit_log where action like 'job.%'`,
    );

    expect(rows.rows.length).toBeGreaterThan(0);

    for (const row of rows.rows) {
      expect(row.actor_type).toBe('system');
      expect(JSON.stringify(row.detail)).not.toContain('payload');
    }

    // 只追加：連改一個字都不行。
    await expect(h.db.pool.query(`update audit_log set action = 'x' where action like 'job.%'`)).rejects.toThrow(
      /只准追加/,
    );
  });
});

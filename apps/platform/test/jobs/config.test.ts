import { describe, expect, it } from 'vitest';
import { DEFAULT_JOBS_CONFIG, parseJobsConfig } from '../../src/jobs/config';

/**
 * worker 設定的解析（issue #85 第 4、7 點）。
 *
 * 為甚麼要有這一份：worker 崩潰之後會自己重來，一個「靜靜用預設值」的設定錯誤
 * 會變成「工作跑得慢／次數爆掉」這種很難查的現象。所以寧願起不動，也要講出
 * 是哪一個變數寫錯。
 */

describe('worker 設定', () => {
  it('沒有設任何變數時用預設：5 次、1 併發、1 秒輪詢、60 秒租約、15 秒關機寬限', () => {
    const parsed = parseJobsConfig({});

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual(DEFAULT_JOBS_CONFIG);
    expect(parsed.value).toEqual({
      maxAttempts: 5,
      concurrency: 1,
      pollIntervalMs: 1000,
      leaseMs: 60_000,
      shutdownGraceMs: 15_000,
      backoff: { initialMs: 5000, maxMs: 300_000, factor: 2, jitter: 0.2 },
    });
  });

  it('空字串當作無設定，不是 0', () => {
    const parsed = parseJobsConfig({ JOB_CONCURRENCY: '', JOB_LEASE_MS: '' });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value?.concurrency).toBe(1);
    expect(parsed.value?.leaseMs).toBe(60_000);
  });

  it('讀得懂每一個變數', () => {
    const parsed = parseJobsConfig({
      JOB_MAX_ATTEMPTS: '3',
      JOB_CONCURRENCY: '4',
      JOB_POLL_INTERVAL_MS: '250',
      JOB_LEASE_MS: '30_000',
      JOB_SHUTDOWN_GRACE_MS: '2000',
      JOB_BACKOFF_INITIAL_MS: '1000',
      JOB_BACKOFF_MAX_MS: '60000',
    });

    // '30_000' 不是數字：寧願報錯，也不要靜靜當成 30 毫秒。
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toContain('JOB_LEASE_MS');

    const good = parseJobsConfig({
      JOB_MAX_ATTEMPTS: '3',
      JOB_CONCURRENCY: '4',
      JOB_POLL_INTERVAL_MS: '250',
      JOB_LEASE_MS: '30000',
      JOB_SHUTDOWN_GRACE_MS: '2000',
      JOB_BACKOFF_INITIAL_MS: '1000',
      JOB_BACKOFF_MAX_MS: '60000',
    });

    expect(good.errors).toEqual([]);
    expect(good.value).toMatchObject({
      maxAttempts: 3,
      concurrency: 4,
      pollIntervalMs: 250,
      leaseMs: 30_000,
      shutdownGraceMs: 2000,
      backoff: { initialMs: 1000, maxMs: 60_000 },
    });
  });

  it('非數字、零與超範圍都會報錯，並指出是哪一個變數', () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ JOB_MAX_ATTEMPTS: '0' }, 'JOB_MAX_ATTEMPTS'],
      [{ JOB_MAX_ATTEMPTS: '26' }, 'JOB_MAX_ATTEMPTS'],
      [{ JOB_MAX_ATTEMPTS: '2.5' }, 'JOB_MAX_ATTEMPTS'],
      [{ JOB_CONCURRENCY: '0' }, 'JOB_CONCURRENCY'],
      [{ JOB_CONCURRENCY: '33' }, 'JOB_CONCURRENCY'],
      [{ JOB_POLL_INTERVAL_MS: 'abc' }, 'JOB_POLL_INTERVAL_MS'],
      [{ JOB_POLL_INTERVAL_MS: '10' }, 'JOB_POLL_INTERVAL_MS'],
      [{ JOB_LEASE_MS: '0' }, 'JOB_LEASE_MS'],
      [{ JOB_SHUTDOWN_GRACE_MS: '-1' }, 'JOB_SHUTDOWN_GRACE_MS'],
    ];

    for (const [env, name] of cases) {
      const parsed = parseJobsConfig(env);

      expect(parsed.value).toBeUndefined();
      expect(parsed.errors.join(' ')).toContain(name);
    }
  });

  it('租約一定要比輪詢間隔長，否則會自己搶自己的工作', () => {
    const parsed = parseJobsConfig({ JOB_POLL_INTERVAL_MS: '5000', JOB_LEASE_MS: '5000' });

    expect(parsed.errors.join(' ')).toContain('JOB_LEASE_MS');
    expect(parsed.errors.join(' ')).toContain('JOB_POLL_INTERVAL_MS');
  });

  it('退避上限一定要大於起始值', () => {
    const parsed = parseJobsConfig({
      JOB_BACKOFF_INITIAL_MS: '10000',
      JOB_BACKOFF_MAX_MS: '5000',
    });

    expect(parsed.errors.join(' ')).toContain('JOB_BACKOFF_MAX_MS');
  });

  it('一次過報齊所有問題，不是只報第一個', () => {
    const parsed = parseJobsConfig({
      JOB_MAX_ATTEMPTS: 'x',
      JOB_CONCURRENCY: 'y',
      JOB_LEASE_MS: 'z',
    });

    expect(parsed.errors.length).toBeGreaterThanOrEqual(3);
  });
});

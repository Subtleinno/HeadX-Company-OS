import { describe, expect, it } from 'vitest';
import {
  createHashLimiter,
  DEFAULT_HASH_LIMITS,
  HashBusyError,
  parseHashLimits,
} from '../src/auth/hash-limits.js';

/**
 * 密碼雜湊的有界資源限制（issue #84 第 6 節）。
 *
 * 為何要限制：每個 scrypt 要 132 MiB。無上限的話，十個併發登入就是 1.3 GB，
 * 一個刻意送慢速請求的人可以令整部機換頁。這裡只用純 Promise 與假計時器，
 * 不減弱 scrypt 參數 —— 限制嘅係「幾多個同時做」，唔係「做得幾難」。
 *
 * 這裡驗的是佢自己嘅帳：上限、隊列、逾時、失敗都一定要還返個名額出嚟。
 * 名額洩漏係最惡嘅一種錯 —— 一次出錯之後整個服務永遠 busy。
 */

/** 可控制的任務：resolve 之前一直佔住名額。 */
function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('雜湊資源限制：並發上限', () => {
  it('同時最多只會有 maxConcurrent 個任務在跑', async () => {
    const limiter = createHashLimiter({ maxConcurrent: 2, maxQueue: 8, timeoutMs: 1_000 });

    let running = 0;
    let peak = 0;

    const gates = Array.from({ length: 5 }, () => deferred());

    const tasks = gates.map((gate) =>
      limiter.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await gate.promise;
        running -= 1;
      }),
    );

    await tick();

    expect(running).toBe(2);
    expect(limiter.stats).toEqual({ active: 2, queued: 3 });

    // 逐個放行：第三個只可以在第一個結束之後才開始。
    gates[0]?.resolve();
    await tick();

    expect(peak).toBe(2);
    expect(limiter.stats.active).toBe(2);

    gates[1]?.resolve();
    gates[2]?.resolve();
    gates[3]?.resolve();
    gates[4]?.resolve();
    await Promise.all(tasks);

    expect(peak).toBe(2);
    expect(limiter.stats).toEqual({ active: 0, queued: 0 });
  });

  it('預設值就是 issue 指定的 2／8／5 秒', () => {
    expect(DEFAULT_HASH_LIMITS).toEqual({ maxConcurrent: 2, maxQueue: 8, timeoutMs: 5_000 });
  });
});

describe('雜湊資源限制：隊列上限', () => {
  it('隊列滿了就即刻拒絕，不排隊、不假裝成功', async () => {
    const limiter = createHashLimiter({ maxConcurrent: 1, maxQueue: 2, timeoutMs: 1_000 });

    const gate = deferred();
    const running = limiter.run(() => gate.promise);

    const queued = [
      limiter.run(() => Promise.resolve()),
      limiter.run(() => Promise.resolve()),
    ];

    // 第四個：1 個在跑，隊列已有 2 個，所以連排都不可以排。
    await expect(limiter.run(() => Promise.resolve())).rejects.toBeInstanceOf(HashBusyError);

    gate.resolve();
    await running;
    await Promise.all(queued);

    expect(limiter.stats).toEqual({ active: 0, queued: 0 });
  });

  it('被拒絕的請求不會佔住名額', async () => {
    const limiter = createHashLimiter({ maxConcurrent: 1, maxQueue: 0, timeoutMs: 1_000 });

    const gate = deferred();
    const running = limiter.run(() => gate.promise);

    await expect(limiter.run(() => Promise.resolve())).rejects.toBeInstanceOf(HashBusyError);

    gate.resolve();
    await running;

    // 名額回來了：下一個請求正常執行。
    await expect(limiter.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(limiter.stats).toEqual({ active: 0, queued: 0 });
  });
});

describe('雜湊資源限制：等待逾時', () => {
  it('排隊等到逾時就回 busy，並且把位交還', async () => {
    const limiter = createHashLimiter({ maxConcurrent: 1, maxQueue: 4, timeoutMs: 30 });

    const gate = deferred();
    const running = limiter.run(() => gate.promise);
    const waiting = limiter.run(() => Promise.resolve('never'));

    await expect(waiting).rejects.toBeInstanceOf(HashBusyError);
    expect(limiter.stats).toEqual({ active: 1, queued: 0 });

    gate.resolve();
    await running;

    expect(limiter.stats).toEqual({ active: 0, queued: 0 });
  });

  it('已經在跑的雜湊不會因為等的人放棄而被當成結束', async () => {
    const limiter = createHashLimiter({ maxConcurrent: 1, maxQueue: 1, timeoutMs: 20 });

    const gate = deferred();
    const running = limiter.run(() => gate.promise);
    await expect(limiter.run(() => Promise.resolve())).rejects.toBeInstanceOf(HashBusyError);

    // 等的人走了，但第一個仍在跑：名額仍然是它佔住，不是 0。
    await tick(40);
    expect(limiter.stats.active).toBe(1);

    gate.resolve();
    await running;
    expect(limiter.stats.active).toBe(0);
  });

  it('busy 錯誤帶 Retry-After 秒數，而且不透露帳戶存在與否', () => {
    const error = new HashBusyError(3);

    expect(error.retryAfterSeconds).toBe(3);
    expect(error.message).toBe('service_busy');
    expect(JSON.stringify({ ...error })).not.toMatch(/@/);
  });
});

describe('雜湊資源限制：任務失敗都要還名額', () => {
  it('任務擲錯之後，下一個仍然執行得到', async () => {
    const limiter = createHashLimiter({ maxConcurrent: 1, maxQueue: 2, timeoutMs: 1_000 });

    await expect(
      limiter.run(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    await expect(limiter.run(() => Promise.resolve('after'))).resolves.toBe('after');
    expect(limiter.stats).toEqual({ active: 0, queued: 0 });
  });

  it('排隊中的任務因為前面失敗而接手，不會一齊失效', async () => {
    const limiter = createHashLimiter({ maxConcurrent: 1, maxQueue: 2, timeoutMs: 1_000 });

    const failing = limiter.run(() => Promise.reject(new Error('boom')));
    const next = limiter.run(() => Promise.resolve('second'));

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('second');
  });
});

describe('雜湊資源限制：集中設定與範圍驗證', () => {
  it('沒有設定時用預設值', () => {
    expect(parseHashLimits({})).toEqual({ ok: true, value: DEFAULT_HASH_LIMITS });
  });

  it('讀得懂字串形式的環境變數', () => {
    expect(
      parseHashLimits({ HASH_MAX_CONCURRENT: '3', HASH_MAX_QUEUE: '4', HASH_TIMEOUT_MS: '2500' }),
    ).toEqual({ ok: true, value: { maxConcurrent: 3, maxQueue: 4, timeoutMs: 2_500 } });
  });

  it('超出範圍或不是整數就報錯，不會靜靜用一個危險的值', () => {
    const cases: Array<Record<string, string>> = [
      { HASH_MAX_CONCURRENT: '0' },
      { HASH_MAX_CONCURRENT: '9' },
      { HASH_MAX_QUEUE: '-1' },
      { HASH_MAX_QUEUE: '65' },
      { HASH_TIMEOUT_MS: '50' },
      { HASH_TIMEOUT_MS: '60000' },
      { HASH_MAX_CONCURRENT: '兩' },
    ];

    for (const raw of cases) {
      expect(parseHashLimits(raw).ok, JSON.stringify(raw)).toBe(false);
    }
  });

  it('設定值真的會套用到 limiter 上', async () => {
    const parsed = parseHashLimits({ HASH_MAX_CONCURRENT: '1', HASH_MAX_QUEUE: '0' });
    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      return;
    }

    const limiter = createHashLimiter(parsed.value);
    const gate = deferred();
    const running = limiter.run(() => gate.promise);

    await expect(limiter.run(() => Promise.resolve())).rejects.toBeInstanceOf(HashBusyError);

    gate.resolve();
    await running;
  });
});

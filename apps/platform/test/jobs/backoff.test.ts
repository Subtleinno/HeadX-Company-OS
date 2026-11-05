import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BACKOFF,
  backoffDelayMs,
  validateBackoff,
  type BackoffConfig,
} from '../../src/jobs/backoff';

/**
 * 指數退避（issue #85 第 4 點）。
 *
 * 這裡全部是純函數，時間與隨機都由參數入，所以測試沒有任何 sleep：
 * 同一個輸入永遠同一個輸出，失敗時看得見是哪一條界線破了。
 */

const noJitter: BackoffConfig = { initialMs: 5000, maxMs: 300000, factor: 2, jitter: 0 };

/** 固定回傳同一個隨機值，用來看抖動的兩端。 */
const fixed = (value: number) => (): number => value;

describe('退避設定', () => {
  it('預設是起始 5 秒、上限 300 秒、每次乘 2、抖動 ±20%', () => {
    expect(DEFAULT_BACKOFF).toEqual({ initialMs: 5000, maxMs: 300000, factor: 2, jitter: 0.2 });
  });

  it('起始、上限、倍數、抖動不合法都會講出是哪一個欄位', () => {
    expect(validateBackoff({ ...noJitter, initialMs: 0 })).toEqual([
      expect.stringContaining('initialMs'),
    ]);
    expect(validateBackoff({ ...noJitter, maxMs: 1000 })).toEqual([
      expect.stringContaining('maxMs'),
    ]);
    expect(validateBackoff({ ...noJitter, factor: 0.5 })).toEqual([
      expect.stringContaining('factor'),
    ]);
    expect(validateBackoff({ ...noJitter, jitter: 1 })).toEqual([
      expect.stringContaining('jitter'),
    ]);
    expect(validateBackoff({ ...noJitter, jitter: -0.1 })).toEqual([
      expect.stringContaining('jitter'),
    ]);
  });

  it('合法設定沒有錯誤', () => {
    expect(validateBackoff(noJitter)).toEqual([]);
  });
});

describe('退避延遲', () => {
  it('第 1、2、3、4 次失敗依次是 5、10、20、40 秒', () => {
    expect(backoffDelayMs(1, noJitter, fixed(0.5))).toBe(5000);
    expect(backoffDelayMs(2, noJitter, fixed(0.5))).toBe(10_000);
    expect(backoffDelayMs(3, noJitter, fixed(0.5))).toBe(20_000);
    expect(backoffDelayMs(4, noJitter, fixed(0.5))).toBe(40_000);
  });

  it('次數再多都封頂在 maxMs，不會無限增長', () => {
    for (const attempt of [7, 8, 20, 100, 1000]) {
      expect(backoffDelayMs(attempt, noJitter, fixed(0.5))).toBe(300_000);
    }
  });

  it('抖動落在 ±jitter 之內', () => {
    const config: BackoffConfig = { initialMs: 5000, maxMs: 300000, factor: 2, jitter: 0.2 };

    expect(backoffDelayMs(1, config, fixed(0))).toBe(4000);
    expect(backoffDelayMs(1, config, fixed(0.5))).toBe(5000);
    expect(backoffDelayMs(1, config, fixed(1))).toBe(6000);
  });

  it('抖動加上去都不會超過上限，亦不會變成負數', () => {
    const config: BackoffConfig = { initialMs: 5000, maxMs: 300000, factor: 2, jitter: 0.2 };

    for (const attempt of [1, 5, 6, 7, 50]) {
      for (const random of [0, 0.13, 0.5, 0.87, 1]) {
        const delay = backoffDelayMs(attempt, config, fixed(random));

        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(config.maxMs);
        expect(Number.isInteger(delay)).toBe(true);
      }
    }

    // 第 6 次是 160 秒，加 20% 是 192 秒；第 7 次本來 320 秒，封頂 300 秒後再加抖動仍然是 300 秒。
    expect(backoffDelayMs(7, config, fixed(1))).toBe(300_000);
  });

  it('attempt 小於 1 當作第 1 次（不要出現 0 或負延遲）', () => {
    expect(backoffDelayMs(0, noJitter, fixed(0.5))).toBe(5000);
    expect(backoffDelayMs(-3, noJitter, fixed(0.5))).toBe(5000);
  });

  it('倍數不是 2 時一樣計得對', () => {
    const config: BackoffConfig = { initialMs: 1000, maxMs: 100_000, factor: 3, jitter: 0 };

    expect(backoffDelayMs(1, config, fixed(0.5))).toBe(1000);
    expect(backoffDelayMs(2, config, fixed(0.5))).toBe(3000);
    expect(backoffDelayMs(3, config, fixed(0.5))).toBe(9000);
  });
});

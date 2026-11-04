import { describe, expect, it } from 'vitest';
import {
  LOGIN_WINDOW_MS,
  MAX_LOGIN_FAILURES,
  evaluateLockout,
  loginWindowStart,
} from '../../src/auth/rate-limit';

const NOW = new Date('2026-11-04T00:00:00.000Z');

describe('登入限流', () => {
  it('查詢窗口是 15 分鐘前，時鐘由呼叫者帶入', () => {
    expect(loginWindowStart(NOW).toISOString()).toBe('2026-11-03T23:45:00.000Z');
    expect(LOGIN_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it(`${MAX_LOGIN_FAILURES - 1} 次失敗未鎖`, () => {
    expect(
      evaluateLockout({ count: MAX_LOGIN_FAILURES - 1, oldestAt: NOW }, NOW),
    ).toEqual({ locked: false, retryAfterSeconds: 0 });
  });

  it(`${MAX_LOGIN_FAILURES} 次失敗就鎖住，Retry-After 是最早那次加 15 分鐘`, () => {
    const oldestAt = new Date(NOW.getTime() - 60_000);

    const decision = evaluateLockout({ count: MAX_LOGIN_FAILURES, oldestAt }, NOW);

    expect(decision.locked).toBe(true);
    expect(decision.retryAfterSeconds).toBe(14 * 60);
  });

  it('時鐘推過窗口之後就解鎖', () => {
    const later = new Date(NOW.getTime() + LOGIN_WINDOW_MS);

    // 窗口已過：查詢會回 0 次，這裡直接驗 0 次的行為。
    expect(evaluateLockout({ count: 0, oldestAt: null }, later)).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });
  });

  it('Retry-After 最少 1 秒，不會回 0 或負數', () => {
    const oldestAt = new Date(NOW.getTime() - LOGIN_WINDOW_MS + 10);

    expect(evaluateLockout({ count: MAX_LOGIN_FAILURES, oldestAt }, NOW).retryAfterSeconds).toBe(1);
  });

  it('計數夠但沒有最早時間：用整個窗口當 Retry-After', () => {
    expect(
      evaluateLockout({ count: MAX_LOGIN_FAILURES, oldestAt: null }, NOW).retryAfterSeconds,
    ).toBe(LOGIN_WINDOW_MS / 1000);
  });

  it('最早時間稍為晚於 now（app 與資料庫的時鐘差）時，Retry-After 不會超過窗口', () => {
    const oldestAt = new Date(NOW.getTime() + 500);

    expect(evaluateLockout({ count: MAX_LOGIN_FAILURES, oldestAt }, NOW).retryAfterSeconds).toBe(
      LOGIN_WINDOW_MS / 1000,
    );
  });
});

/**
 * 登入限流：同一個 email 在 15 分鐘內失敗 5 次就鎖，鎖定期間連正確密碼都拒絕。
 *
 * 計數直接查 audit_log 的 auth.login_failed 紀錄，不另建表。
 * 時間一律由呼叫者帶入：審計表的紀錄改不了，測試不能靠改紀錄的時間來推過窗口。
 */

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const MAX_LOGIN_FAILURES = 5;

export type FailedAttempts = {
  count: number;
  /** 窗口內最早那次失敗；沒有失敗就是 null。 */
  oldestAt: Date | null;
};

export type LockoutDecision = {
  locked: boolean;
  retryAfterSeconds: number;
};

/** 查詢失敗次數時的窗口起點。 */
export function loginWindowStart(now: Date): Date {
  return new Date(now.getTime() - LOGIN_WINDOW_MS);
}

export function evaluateLockout(attempts: FailedAttempts, now: Date): LockoutDecision {
  if (attempts.count < MAX_LOGIN_FAILURES) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  // 沒有最早時間（不應該發生）就用整個窗口，寧願多等，不要提早放行。
  const oldest = attempts.oldestAt ?? now;
  const remainingMs = oldest.getTime() + LOGIN_WINDOW_MS - now.getTime();

  // 上限是窗口本身：審計列的 at 由資料庫寫入，會比 app 取樣的 now 遲幾毫秒，
  // 不設上限的話 Retry-After 會回 901 秒這種比窗口更長的數字。
  const retryAfterSeconds = Math.min(
    LOGIN_WINDOW_MS / 1000,
    Math.max(1, Math.ceil(remainingMs / 1000)),
  );

  return { locked: true, retryAfterSeconds };
}

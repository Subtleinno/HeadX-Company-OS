/**
 * 登入限流：同一個 email 在 15 分鐘內失敗 5 次就鎖，鎖定期間連正確密碼都拒絕。
 *
 * 計數直接查 audit_log 的失敗紀錄，不另建表。
 * 時間一律由呼叫者帶入：審計表的紀錄改不了，測試不能靠改紀錄的時間來推過窗口。
 *
 * issue #86 之後同一個評估函數也用於「已登入之後的密碼操作」：窗口與上限共用
 * 同一組數字，只是計數的 action 不同。一個系統不應該有兩套「幾多次」。
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

/** 窗口與上限。不傳就用登入的那一組，行為與 #65 完全一樣。 */
export type LockoutLimits = {
  windowMs?: number;
  maxFailures?: number;
};

/** 查詢失敗次數時的窗口起點。 */
export function loginWindowStart(now: Date): Date {
  return new Date(now.getTime() - LOGIN_WINDOW_MS);
}

export function evaluateLockout(
  attempts: FailedAttempts,
  now: Date,
  limits: LockoutLimits = {},
): LockoutDecision {
  const windowMs = limits.windowMs ?? LOGIN_WINDOW_MS;
  const maxFailures = limits.maxFailures ?? MAX_LOGIN_FAILURES;

  if (attempts.count < maxFailures) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  // 沒有最早時間（不應該發生）就用整個窗口，寧願多等，不要提早放行。
  const oldest = attempts.oldestAt ?? now;
  const remainingMs = oldest.getTime() + windowMs - now.getTime();

  // 上限是窗口本身：審計列的 at 由資料庫寫入，會比 app 取樣的 now 遲幾毫秒，
  // 不設上限的話 Retry-After 會回 901 秒這種比窗口更長的數字。
  const retryAfterSeconds = Math.min(windowMs / 1000, Math.max(1, Math.ceil(remainingMs / 1000)));

  return { locked: true, retryAfterSeconds };
}

/** 已登入之後的密碼操作（自行改密碼、老闆重設員工）。與登入同一組界限。 */
export const PASSWORD_WINDOW_MS = LOGIN_WINDOW_MS;

export const MAX_PASSWORD_FAILURES = MAX_LOGIN_FAILURES;

export const PASSWORD_LIMITS: LockoutLimits = {
  windowMs: PASSWORD_WINDOW_MS,
  maxFailures: MAX_PASSWORD_FAILURES,
};

export function passwordWindowStart(now: Date): Date {
  return new Date(now.getTime() - PASSWORD_WINDOW_MS);
}

import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import {
  evaluateLockout,
  PASSWORD_LIMITS,
  passwordWindowStart,
  type LockoutDecision,
} from './rate-limit.js';
import { countFailedAttempts } from './store.js';

/**
 * 已登入之後的密碼操作節流（issue #86）。
 *
 * 為甚麼需要它：`POST /auth/change-password` 要驗舊密碼，而驗舊密碼就是一個
 * 可以離線猜的入口。如果只是「錯就回 403」，一個偷到 session cookie 的人
 * 可以無限次試 —— UI 的限制不算是限制，因為攻擊者不會用 UI。
 *
 * 做法與 #65 的登入限流完全一樣：失敗寫審計列，計數查審計表，窗口與上限
 * 共用同一組數字（`PASSWORD_LIMITS`）。分別只在 action 與 target：
 *   - 登入用 email 的 HMAC（審計表永遠不存 email）
 *   - 這裡用操作者的帳戶 id（審計表本來就存 id，而且不算敏感）
 *
 * 為甚麼是「按操作者」而不是「按目標帳戶」：按目標計的話，任何一個有 session
 * 的人都可以狂打某個人的 id，令那個人 15 分鐘內改不到自己的密碼。按操作者計，
 * 被鎖的永遠是那個猜密碼的人。
 */

export const PASSWORD_FAILURE_ACTIONS = {
  /** 自行改密碼時舊密碼不符。 */
  change: 'auth.password_change_failed',
  /** 老闆重設員工時，老闆自己的密碼不符。 */
  reset: 'staff.password_reset_failed',
} as const;

export type PasswordFailureAction =
  (typeof PASSWORD_FAILURE_ACTIONS)[keyof typeof PASSWORD_FAILURE_ACTIONS];

/** 這個操作者現在是否已經用完名額。 */
export async function checkPasswordThrottle(
  pool: Pool,
  action: PasswordFailureAction,
  actorId: string,
  now: Date,
): Promise<LockoutDecision> {
  const attempts = await countFailedAttempts(pool, actorId, passwordWindowStart(now), action);

  return evaluateLockout(attempts, now, PASSWORD_LIMITS);
}

/**
 * 記一次失敗。只有原因，沒有 body、salt、雜湊或任何密碼素材 ——
 * 審計表只准追加，寫進去的東西永遠都在。
 */
export async function recordPasswordFailure(
  pool: Pool,
  action: PasswordFailureAction,
  actorId: string,
): Promise<void> {
  await writeAudit(pool, {
    actorType: 'human',
    actorId,
    action,
    // target 與 actor 相同：這一列講的是「這個操作者驗證失敗」，
    // 不是「某個帳戶被人試」。目標帳戶 id 不進這裡，免得失敗紀錄變成探測工具。
    target: actorId,
    detail: { reason: 'invalid_credentials' },
  });
}

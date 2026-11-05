/**
 * 授權的詞彙（issue #83）。
 *
 * 只有型別與常數，沒有判斷：schema（驗證）、permissions（判斷）、store（SQL）
 * 三邊要認得同一組字，所以集中放在這裡，避免三個檔各自寫一次然後有一個寫錯。
 */

export type GrantRole = 'member' | 'app_admin';

export const GRANT_ROLES: readonly GrantRole[] = ['member', 'app_admin'];

/**
 * 授權狀態。只有 active 算有效；approved 是「批准了但未生效」
 * （例如 app 未啟用），兩者刻意分開 —— 合併成一個就沒有辦法表達「批了但不能用」。
 */
export type GrantState = 'requested' | 'approved' | 'active' | 'rejected' | 'revoked';

export const GRANT_STATES: readonly GrantState[] = [
  'requested',
  'approved',
  'active',
  'rejected',
  'revoked',
];

/** 已經結束的狀態：歷史只可以讀，不可以復活。 */
export const TERMINAL_STATES: readonly GrantState[] = ['rejected', 'revoked'];

export function isTerminal(state: GrantState): boolean {
  return TERMINAL_STATES.includes(state);
}

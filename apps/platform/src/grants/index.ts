/**
 * app 授權模組的對外入口（issue #83）。
 *
 * 分界與 settings、org 一致：
 *   types.ts        詞彙（角色、狀態）—— 沒有判斷
 *   schema.ts       純函數（輸入驗證）
 *   scope.ts        純函數（範圍的集合運算：覆蓋與包含）
 *   permissions.ts  純函數（誰可以對授權做什麼）
 *   store.ts        SQL
 *   routes.ts       HTTP 形狀、狀態碼，以及接 #82 的引擎
 *
 * 外面只需要 registerGrants。判斷規則不外借 —— 要問「可不可以」請經路由，
 * 這樣才有同一個入口、同一份審計。
 */

export { registerGrants } from './routes.js';
export type { GrantsDeps } from './routes.js';

export { GRANT_ROLES, GRANT_STATES, isTerminal, TERMINAL_STATES } from './types.js';
export type { GrantRole, GrantState } from './types.js';

/**
 * Needs 模組的對外入口（issue 184）。
 *
 * 外面只經呢個檔拿東西：schema 的純函數、store 的 SQL、以及路由註冊函數。
 */

export {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  NEED_FILTERS,
  NEED_KINDS,
  NEED_STATES,
  deriveState,
  isOverdue,
  parseListQuery,
} from './schema.js';
export type {
  NeedFilter,
  NeedKind,
  NeedListQuery,
  NeedState,
  NeedTimestamps,
  QueryParse,
} from './schema.js';

export {
  claimNeed,
  findNeed,
  listNeeds,
  summarizeNeeds,
  toNeedView,
} from './store.js';
export type { NeedCounts, NeedDb, NeedRow, NeedView } from './store.js';

export { registerNeeds } from './routes.js';
export type { NeedsDeps } from './routes.js';

/**
 * 組織模組的對外入口（issue #81）。
 *
 * 外面只經這個檔拿東西。分界跟 settings 一樣：
 *   graph.ts  純函數（次序、繼承、成環判斷）—— 不碰資料庫
 *   units.ts  純函數（輸入驗證）
 *   store.ts  SQL
 *   routes.ts HTTP 形狀與權限
 *
 * 對外最常用的兩個：
 *   unitOrder(graph, unitId)              —— 由近到遠的單位次序
 *   createSettingResolver({ graph, … })   —— 查一個 key 的有效值與來源
 */

export {
  createGraph,
  createSettingResolver,
  resolveSetting,
  unitOrder,
  unitOrderDetailed,
  wouldCreateCycle,
} from './graph.js';
export type {
  OrderEntry,
  OrgGraph,
  ResolvedSetting,
  ResolverInput,
  SettingSource,
  UnitEdge,
  UnitSettingRow,
} from './graph.js';

export { UNIT_NAME_MAX_LENGTH, UNIT_TYPE_MAX_LENGTH, isValidTimezone, parseEdgeInput, parseUnitInput } from './units.js';
export type { EdgeInput, UnitInput, UnitPatch } from './units.js';

export { ROOT_UNIT_NAME, ROOT_UNIT_TYPE, seedOrgUnits } from './seed.js';
export type { OrgSeedResult } from './seed.js';

export { registerOrg } from './routes.js';

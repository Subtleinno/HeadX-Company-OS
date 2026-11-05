/**
 * 設定與政策模組的對外入口（issue #80）。
 *
 * 外面（路由、種子、日後的政策應用）只經這個檔拿東西：內部的檔案怎樣分，
 * 不應該變成別的模組要記住的事。純函數（decide、驗證）與 SQL（store）都在這裡分界。
 *
 * 判斷函數對外的兩種形狀：
 *   decide(rules, domain, facts)    —— 純函數，呼叫者自己讀規則
 *   createDecider(rules)            —— 綁好規則之後就是 decide(domain, facts)
 */

export {
  POLICY_ACTIONS,
  POLICY_OPERATORS,
  createDecider,
  decide,
  parseRuleInput,
  validateCondition,
} from './policy.js';
export type {
  Decision,
  PolicyAction,
  PolicyClause,
  PolicyCondition,
  PolicyFacts,
  PolicyOperator,
  PolicyRule,
  RuleInput,
  ScalarValue,
} from './policy.js';

export {
  SETTING_KEYS,
  isImmutableSetting,
  isSettingKey,
  validateSettingValue,
} from './schema.js';
export type { SettingKey, SettingValidation } from './schema.js';

export { DEFAULT_PROFILE_DIR, installDefaults, loadProfile, seedSettings } from './seed.js';
export type { SeedResult } from './seed.js';

export { registerSettings } from './routes.js';

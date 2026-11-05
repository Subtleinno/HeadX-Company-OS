export { applyAccess, AccessBlockedError, ACCESS_LOCK_KEY } from './apply.js';
export { buildPlan, describeStep, allBlockers, isEmpty } from './plan.js';
export type { AccessPlan, AppPlan, Step } from './plan.js';
export { verifyAccess } from './verify.js';
export type { VerifyResult, VerifyFailure } from './verify.js';
export {
  envNamesFor,
  parseAppList,
  resolveTargets,
  roleNameFor,
  schemaNameFor,
  MAX_IDENTIFIER_BYTES,
  ROLE_PREFIX,
} from './naming.js';
export type { AppTarget } from './naming.js';
export { main, parseArgs, readSecrets, selectTargets, UsageError } from './cli.js';
export type { Command, Options } from './cli.js';

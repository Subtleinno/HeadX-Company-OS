/**
 * Company OS 引擎的公開介面。
 */
export * from './core/types.ts'
export { createEngine, type Engine, type EngineOptions } from './core/engine.ts'
export { Gateway, isWrite, type BreakerRef, type GatewayDeps } from './core/gateway.ts'
export { CompanyRegistry } from './core/company.ts'
export { ActionRegistry, LEVEL_DECISION } from './policy/action-registry.ts'
export { AuditLog, hashEntry, type ChainVerification } from './audit/audit-log.ts'
export { NeedsBoard, type CreateNeedInput } from './needs/needs-board.ts'

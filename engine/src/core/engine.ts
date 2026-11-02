/**
 * 建立一個已組裝好的 Company OS 引擎。
 * 呼叫端只需要一個函式，不必認識內部結構。
 */
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { AuditLog } from '../audit/audit-log.ts'
import { ActionRegistry } from '../policy/action-registry.ts'
import { CompanyRegistry } from '../core/company.ts'
import { Gateway } from '../core/gateway.ts'
import { NeedsBoard } from '../needs/needs-board.ts'
import type { ApprovalRequest, BreakerState, Verdict } from '../core/types.ts'

export interface EngineOptions {
  /** 設定目錄，預設為專案內的 config/。 */
  configDir: string
  /** 資料目錄，審計日誌放在這裡。 */
  dataDir: string
  /** 批准請求有效秒數，預設 24 小時。 */
  approvalTtlSeconds?: number
  /** 時間來源，測試用。 */
  now?: () => Date
}

export interface Engine {
  audit: AuditLog
  actions: ActionRegistry
  companies: CompanyRegistry
  gateway: Gateway
  needs: NeedsBoard
  /** 熔斷狀態。 */
  breaker(): BreakerState
  /** 所有待批准請求。 */
  pending(): ApprovalRequest[]
  /** 健康檢查。 */
  health(): { ok: boolean; auditLength: number; chainOk: boolean; breakerTripped: boolean }
}

export function createEngine(options: EngineOptions): Engine {
  const audit = new AuditLog(join(options.dataDir, 'audit.jsonl'))
  const actions = ActionRegistry.fromJson(JSON.parse(readFileSync(join(options.configDir, 'actions.json'), 'utf8')))
  const companies = CompanyRegistry.fromFile(join(options.configDir, 'company.json'))

  const approvals = new Map<string, ApprovalRequest>()
  const idempotency = new Map<string, Verdict>()
  let breaker: BreakerState = { tripped: false, reason: null, at: null, by: null }

  const gateway = new Gateway({
    actions,
    companies,
    audit,
    approvals,
    idempotency,
    breakerRef: {
      get: () => breaker,
      set: (next: BreakerState) => {
        breaker = next
      },
    },
    approvalTtlSeconds: options.approvalTtlSeconds ?? 24 * 60 * 60,
    ...(options.now ? { now: options.now } : {}),
  })

  const needs = new NeedsBoard(audit, options.now)

  return {
    audit,
    actions,
    companies,
    gateway,
    needs,
    breaker: () => gateway.breaker(),
    pending: () => gateway.pendingApprovals(),
    health: () => {
      const chain = audit.verifyChain()
      return { ok: chain.ok && !breaker.tripped, auditLength: chain.length, chainOk: chain.ok, breakerTripped: breaker.tripped }
    },
  }
}

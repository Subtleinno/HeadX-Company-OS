/**
 * 政策閘道：所有寫入動作的唯一入口。
 *
 * 判定順序（任何人不得更改順序，因為它決定了安全性）：
 *   1. 熔斷開關        → 已熔斷：一律 deny
 *   2. 品牌隔離        → 品牌不屬於該公司或已停用：deny
 *   3. 動作未登記      → deny（預設拒絕，最重要的一條）
 *   4. L4 禁止         → deny，沒有批准路徑
 *   5. 金額上限        → 超出上限：deny
 *   6. 按級別處置      → L0/L1 allow，L2/L3 ask
 *
 * 每個請求都會寫入審計日誌，包括 deny。沒有「無聲放行」。
 */
import { randomUUID } from 'node:crypto'
import type { AuditLog } from '../audit/audit-log.ts'
import type { CompanyRegistry } from './company.ts'
import { LEVEL_DECISION, type ActionRegistry } from '../policy/action-registry.ts'
import type { ApprovalRequest, BreakerState, Decision, GatewayRequest, RiskLevel, Verdict } from './types.ts'

/** 閘道需要的相依物件。 */
export interface GatewayDeps {
  actions: ActionRegistry
  companies: CompanyRegistry
  audit: AuditLog
  /** 待批准請求的儲存（記憶體內，由呼叫端持有，方便測試與延續）。 */
  approvals: Map<string, ApprovalRequest>
  /** 冪等鍵快取：`${action}::${key}` → Verdict。 */
  idempotency: Map<string, Verdict>
  /** 熔斷開關狀態的讀寫介面。 */
  breakerRef: BreakerRef
  /** 批准請求的有效秒數；逾時即取消（預設拒絕）。 */
  approvalTtlSeconds: number
  /** 批准請求變更時回呼（用於落盤）。 */
  onApprovalsChanged?: () => void
  /** 目前時間來源，方便測試。 */
  now?: () => Date
}

/** 熔斷狀態的讀寫介面。用介面而不用 getter，避免物件字面量型別問題。 */
export interface BreakerRef {
  get(): BreakerState
  set(next: BreakerState): void
}

/** 動作是否屬於寫入（非唯讀）。L0 視為唯讀，其餘都是寫入。 */
export function isWrite(level: RiskLevel): boolean {
  return level !== 'L0'
}

export class Gateway {
  readonly #deps: GatewayDeps

  constructor(deps: GatewayDeps) {
    this.#deps = deps
  }

  #now(): Date {
    return this.#deps.now ? this.#deps.now() : new Date()
  }

  /** 讀取熔斷開關現況。 */
  breaker(): BreakerState {
    return { ...this.#deps.breakerRef.get() }
  }

  /**
   * 觸發熔斷：暫停所有寫入。唯讀（L0）不受影響。
   * 這是 master plan 原則 8「隨時可停」的實作。
   */
  tripBreaker(reason: string, by: string): BreakerState {
    const at = this.#now().toISOString()
    this.#deps.breakerRef.set({ tripped: true, reason, at, by })
    this.#deps.audit.append({
      kind: 'breaker',
      companyId: '',
      brandId: '',
      actor: by,
      action: 'breaker.trip',
      requestId: randomUUID(),
      decision: 'deny',
      detail: { reason },
    })
    return this.breaker()
  }

  /** 解除熔斷。 */
  resetBreaker(by: string): BreakerState {
    const at = this.#now().toISOString()
    this.#deps.breakerRef.set({ tripped: false, reason: null, at, by })
    this.#deps.audit.append({
      kind: 'breaker',
      companyId: '',
      brandId: '',
      actor: by,
      action: 'breaker.reset',
      requestId: randomUUID(),
      decision: 'allow',
      detail: {},
    })
    return this.breaker()
  }

  /**
   * 主判定。這是整個系統最重要的函式。
   * 每一個請求都一定會回傳 Verdict 並留下審計記錄。
   */
  evaluate(request: GatewayRequest): Verdict {
    const at = this.#now().toISOString()
    const cacheKey = `${request.action}::${request.idempotencyKey}`

    // 冪等：相同動作 + 相同鍵 = 同一個結果，不重複執行、不重複記錄。
    const cached = this.#deps.idempotency.get(cacheKey)
    if (cached) return { ...cached }

    const verdict = this.#decide(request, at)
    this.#deps.idempotency.set(cacheKey, verdict)

    const entry = this.#deps.audit.append({
      kind: 'verdict',
      companyId: request.companyId,
      brandId: request.brandId,
      actor: request.actor,
      action: request.action,
      requestId: verdict.requestId,
      decision: verdict.decision,
      detail: {
        level: verdict.level,
        reason: verdict.reason,
        matchedRuleId: verdict.matchedRuleId,
        params: request.params,
        idempotencyKey: request.idempotencyKey,
      },
    })
    void entry
    return { ...verdict }
  }

  #decide(request: GatewayRequest, at: string): Verdict {
    const base = { action: request.action, requestId: randomUUID() }

    // 1) 熔斷開關
    const breaker = this.#deps.breakerRef.get()
    if (breaker.tripped) {
      return {
        ...base,
        decision: 'deny',
        level: null,
        reason: `熔斷開關已開啟：${breaker.reason ?? '未說明原因'}`,
        matchedRuleId: null,
        approvalId: null,
      }
    }

    // 2) 品牌隔離
    const scopeProblem = this.#deps.companies.checkScope(request.companyId, request.brandId)
    if (scopeProblem !== null) {
      return { ...base, decision: 'deny', level: null, reason: scopeProblem, matchedRuleId: null, approvalId: null }
    }

    // 3) 動作未登記 → 預設拒絕
    const entry = this.#deps.actions.find(request.action)
    if (entry === null) {
      return {
        ...base,
        decision: 'deny',
        level: null,
        reason: `動作 ${request.action} 未在動作登錄表中登記，依「預設拒絕」原則擋下`,
        matchedRuleId: null,
        approvalId: null,
      }
    }

    // 4) L4 禁止，沒有批准路徑
    if (entry.level === 'L4') {
      return {
        ...base,
        decision: 'deny',
        level: 'L4',
        reason: entry.description ?? `動作 ${request.action} 屬 L4 禁止，閘道直接擋下`,
        matchedRuleId: entry.id,
        approvalId: null,
      }
    }

    // 5) 金額上限
    if (entry.amountParam !== undefined && entry.amountLimit !== undefined) {
      const rawAmount = request.params[entry.amountParam]
      if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount)) {
        return {
          ...base,
          decision: 'deny',
          level: entry.level,
          reason: `動作 ${request.action} 需要數值參數 ${entry.amountParam}，但收到 ${String(rawAmount)}`,
          matchedRuleId: entry.id,
          approvalId: null,
        }
      }
      if (rawAmount > entry.amountLimit) {
        return {
          ...base,
          decision: 'deny',
          level: entry.level,
          reason: `金額 ${rawAmount} 超出 ${entry.amountParam} 上限 ${entry.amountLimit}`,
          matchedRuleId: entry.id,
          approvalId: null,
        }
      }
    }

    // 6) 按級別處置
    const decision: Decision = LEVEL_DECISION[entry.level]
    if (decision === 'ask') {
      const approval = this.#createApproval(request, entry.level, entry.id, at)
      return {
        ...base,
        decision: 'ask',
        level: entry.level,
        reason: `動作 ${request.action} 屬 ${entry.level}，已建立批准請求 ${approval.id}，逾時即取消`,
        matchedRuleId: entry.id,
        approvalId: approval.id,
      }
    }

    return {
      ...base,
      decision,
      level: entry.level,
      reason: entry.description ?? `動作 ${request.action} 屬 ${entry.level}，依規則自動放行`,
      matchedRuleId: entry.id,
      approvalId: null,
    }
  }

  #createApproval(request: GatewayRequest, level: RiskLevel, ruleId: string, at: string): ApprovalRequest {
    const created = new Date(at)
    const expires = new Date(created.getTime() + this.#deps.approvalTtlSeconds * 1000)
    const approval: ApprovalRequest = {
      id: randomUUID(),
      requestId: randomUUID(),
      action: request.action,
      companyId: request.companyId,
      brandId: request.brandId,
      actor: request.actor,
      level,
      params: request.params,
      reason: `動作 ${request.action} 屬 ${level}（規則 ${ruleId}）`,
      createdAt: created.toISOString(),
      expiresAt: expires.toISOString(),
      status: 'pending',
      decidedAt: null,
      decidedBy: null,
      decisionNote: null,
    }
    this.#deps.approvals.set(approval.id, approval)
    this.#deps.onApprovalsChanged?.()
    this.#deps.audit.append({
      kind: 'approval',
      companyId: request.companyId,
      brandId: request.brandId,
      actor: request.actor,
      action: request.action,
      requestId: approval.requestId,
      decision: 'ask',
      detail: { approvalId: approval.id, level, expiresAt: approval.expiresAt, params: request.params },
    })
    return approval
  }

  /** 取出待批准請求。 */
  approval(id: string): ApprovalRequest | null {
    this.#expireApprovals()
    return this.#deps.approvals.get(id) ?? null
  }

  /** 所有待批准請求，按建立時間排序（批准收件匣的資料來源）。 */
  pendingApprovals(): ApprovalRequest[] {
    this.#expireApprovals()
    return [...this.#deps.approvals.values()]
      .filter((approval) => approval.status === 'pending')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  /**
   * 批准。這是「人」的動作；MCP 不得呼叫（見 ADR-016）。
   * 這裡不檢查呼叫者身份，因為閘道只負責記錄與狀態；
   * 身份驗證由呼叫端（UI）負責。
   */
  approve(id: string, by: string, note: string): ApprovalRequest {
    return this.#decideApproval(id, 'approved', by, note)
  }

  /** 拒絕。同樣只經人。 */
  reject(id: string, by: string, note: string): ApprovalRequest {
    return this.#decideApproval(id, 'rejected', by, note)
  }

  #decideApproval(id: string, status: 'approved' | 'rejected', by: string, note: string): ApprovalRequest {
    this.#expireApprovals()
    const approval = this.#deps.approvals.get(id)
    if (!approval) throw new Error(`找不到批准請求 ${id}`)
    if (approval.status !== 'pending') throw new Error(`批准請求 ${id} 已處理，狀態為 ${approval.status}`)
    approval.status = status
    approval.decidedAt = this.#now().toISOString()
    approval.decidedBy = by
    approval.decisionNote = note
    this.#deps.audit.append({
      kind: 'approval',
      companyId: approval.companyId,
      brandId: approval.brandId,
      actor: by,
      action: approval.action,
      requestId: approval.requestId,
      decision: status === 'approved' ? 'allow' : 'deny',
      detail: { approvalId: approval.id, note },
    })
    this.#deps.onApprovalsChanged?.()
    return approval
  }

  /** 逾時的批准請求一律取消：預設拒絕（master plan 原則 3）。 */
  #expireApprovals(): void {
    const now = this.#now().getTime()
    let changed = false
    for (const approval of this.#deps.approvals.values()) {
      if (approval.status !== 'pending') continue
      if (new Date(approval.expiresAt).getTime() > now) continue
      approval.status = 'expired'
      approval.decidedAt = new Date(now).toISOString()
      approval.decidedBy = null
      approval.decisionNote = '逾時未批准，依預設拒絕原則自動取消'
      changed = true
      this.#deps.audit.append({
        kind: 'approval',
        companyId: approval.companyId,
        brandId: approval.brandId,
        actor: 'system',
        action: approval.action,
        requestId: approval.requestId,
        decision: 'deny',
        detail: { approvalId: approval.id, reason: 'expired' },
      })
    }
    if (changed) this.#deps.onApprovalsChanged?.()
  }
}

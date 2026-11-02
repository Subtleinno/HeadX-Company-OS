/**
 * Needs：Agent 撞牆時自動開工單的系統（ADR-008）。
 *
 * 核心規則：
 *   - `attempted`（Agent 已嘗試過什麼）為必填，防止 Agent 未嘗試就開單。
 *   - 每一張工單都寫入審計日誌。
 *   - 狀態流程：open → assigned → delivered → accepted / rejected。
 */
import { randomUUID } from 'node:crypto'
import type { AuditLog } from '../audit/audit-log.ts'
import type { Need, NeedKind, NeedStatus } from '../core/types.ts'

/** 建立工單的輸入。 */
export interface CreateNeedInput {
  companyId: string
  brandId: string
  kind: NeedKind
  title: string
  spec: string
  purpose: string
  dueAt: string
  attempted: string
  references?: string[]
  actor: string
}

const VALID_KINDS: readonly NeedKind[] = ['video', 'photo', 'design', 'copy', 'document', 'other']

export class NeedsBoard {
  readonly #needs: Map<string, Need>
  readonly #audit: AuditLog
  readonly #now: () => Date

  constructor(audit: AuditLog, now: () => Date = () => new Date()) {
    this.#needs = new Map()
    this.#audit = audit
    this.#now = now
  }

  /**
   * 建立一張工單。任何必填欄位缺失都拋出錯誤——
   * 特別是 attempted，這是防止「Agent 一撞牆就叫人做」的關鍵欄位。
   */
  create(input: CreateNeedInput): Need {
    if (!input.attempted || input.attempted.trim() === '') {
      throw new Error('建立 Needs 工單必須填寫「Agent 已嘗試過什麼」（attempted），不可空白')
    }
    if (!input.title || input.title.trim() === '') throw new Error('工單標題不可空白')
    if (!input.spec || input.spec.trim() === '') throw new Error('工單必須說明期望產出規格（spec）')
    if (!input.purpose || input.purpose.trim() === '') throw new Error('工單必須說明用途（purpose）')
    if (!VALID_KINDS.includes(input.kind)) throw new Error(`工單種類必須是 ${VALID_KINDS.join(' / ')}`)
    if (Number.isNaN(Date.parse(input.dueAt))) throw new Error('dueAt 必須是合法的 ISO 8601 時間')

    const at = this.#now().toISOString()
    const need: Need = {
      id: randomUUID(),
      companyId: input.companyId,
      brandId: input.brandId,
      kind: input.kind,
      title: input.title.trim(),
      spec: input.spec.trim(),
      purpose: input.purpose.trim(),
      dueAt: new Date(input.dueAt).toISOString(),
      attempted: input.attempted.trim(),
      references: input.references ?? [],
      status: 'open',
      assignee: null,
      createdAt: at,
      updatedAt: at,
      deliveryNote: null,
    }
    this.#needs.set(need.id, need)
    this.#audit.append({
      kind: 'need',
      companyId: need.companyId,
      brandId: need.brandId,
      actor: input.actor,
      action: 'needs.create',
      requestId: need.id,
      decision: 'allow',
      detail: { kind: need.kind, title: need.title, dueAt: need.dueAt },
    })
    return { ...need }
  }

  get(id: string): Need | null {
    const need = this.#needs.get(id)
    return need ? { ...need } : null
  }

  /** 依公司與品牌列出工單（品牌隔離）。 */
  list(companyId: string, brandId?: string): Need[] {
    return [...this.#needs.values()]
      .filter((need) => need.companyId === companyId && (brandId === undefined || need.brandId === brandId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((need) => ({ ...need }))
  }

  /** 所有未完成的工單，按截止時間排序（批准收件匣的資料來源）。 */
  open(): Need[] {
    return [...this.#needs.values()]
      .filter((need) => need.status === 'open' || need.status === 'assigned' || need.status === 'delivered')
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .map((need) => ({ ...need }))
  }

  #transition(id: string, to: NeedStatus, actor: string, mutate: (need: Need) => void): Need {
    const need = this.#needs.get(id)
    if (!need) throw new Error(`找不到工單 ${id}`)
    mutate(need)
    need.status = to
    need.updatedAt = this.#now().toISOString()
    this.#audit.append({
      kind: 'need',
      companyId: need.companyId,
      brandId: need.brandId,
      actor,
      action: `needs.${to}`,
      requestId: need.id,
      decision: null,
      detail: { status: to },
    })
    return { ...need }
  }

  /** 指派給員工。 */
  assign(id: string, assignee: string, actor: string): Need {
    if (!assignee.trim()) throw new Error('必須指定承辦人')
    return this.#transition(id, 'assigned', actor, (need) => {
      need.assignee = assignee.trim()
    })
  }

  /** 員工交付。 */
  deliver(id: string, note: string, actor: string): Need {
    if (!note.trim()) throw new Error('交付時必須說明做了什麼')
    return this.#transition(id, 'delivered', actor, (need) => {
      need.deliveryNote = note.trim()
    })
  }

  /** Agent 驗收通過。 */
  accept(id: string, actor: string): Need {
    return this.#transition(id, 'accepted', actor, () => undefined)
  }

  /** 驗收退回。 */
  rejectDelivery(id: string, reason: string, actor: string): Need {
    if (!reason.trim()) throw new Error('退回時必須說明原因')
    return this.#transition(id, 'assigned', actor, (need) => {
      need.deliveryNote = `【退回】${reason.trim()}`
    })
  }

  /** 取消。 */
  cancel(id: string, reason: string, actor: string): Need {
    if (!reason.trim()) throw new Error('取消時必須說明原因')
    return this.#transition(id, 'cancelled', actor, (need) => {
      need.deliveryNote = `【取消】${reason.trim()}`
    })
  }
}

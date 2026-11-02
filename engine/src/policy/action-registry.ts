/**
 * 風險分級與動作登錄表。
 *
 * 這份表是「資料」，不是「程式碼」：修改分級不需要改任何邏輯，
 * 只要改 config/actions.json，符合 ADR-013 將業務語意與判定引擎分離的要求。
 *
 * 分級規則（master plan 第 3 節）：
 *   L0 唯讀            → 自動放行
 *   L1 草稿/可還原寫入 → 自動放行並記錄
 *   L2 對外/財務影響   → 需人批准
 *   L3 破壞性/權限     → 需人批准（未來可要求第二審核）
 *   L4 禁止            → 直接擋下，沒有批准路徑
 */
import type { ActionEntry, Decision, RiskLevel } from '../core/types.ts'

/** 分級 → 預設處置。這是「按級別」的唯一映射，其他邏輯不得覆蓋。 */
export const LEVEL_DECISION: Readonly<Record<RiskLevel, Decision>> = {
  L0: 'allow',
  L1: 'allow',
  L2: 'ask',
  L3: 'ask',
  L4: 'deny',
}

/** 動作登錄表。 */
export class ActionRegistry {
  readonly #entries: ActionEntry[]
  /** 由長到短排序，確保 "erp.order.create" 比 "erp.order.*" 先命中。 */
  readonly #sorted: ActionEntry[]

  constructor(entries: ActionEntry[]) {
    this.#entries = entries.slice()
    this.#sorted = [...entries].sort((a, b) => b.id.length - a.id.length)
  }

  /** 從已解析的 JSON 建立。做完整驗證，任何錯誤都拋出。 */
  static fromJson(value: unknown): ActionRegistry {
    if (!Array.isArray(value)) throw new Error('動作登錄表必須是陣列')
    const seen = new Set<string>()
    const entries: ActionEntry[] = value.map((raw, index) => {
      if (typeof raw !== 'object' || raw === null) throw new Error(`登錄表第 ${index + 1} 筆不是物件`)
      const item = raw as Record<string, unknown>
      if (typeof item.id !== 'string' || item.id === '') throw new Error(`登錄表第 ${index + 1} 筆缺少 id`)
      const level = item.level
      if (level !== 'L0' && level !== 'L1' && level !== 'L2' && level !== 'L3' && level !== 'L4') {
        throw new Error(`動作 ${item.id} 的 level 必須是 L0–L4`)
      }
      if (seen.has(item.id)) throw new Error(`動作 ${item.id} 重複登記`)
      seen.add(item.id)
      const entry: ActionEntry = { id: item.id, level }
      if (item.amountLimit !== undefined) {
        if (typeof item.amountLimit !== 'number' || !Number.isFinite(item.amountLimit) || item.amountLimit < 0) {
          throw new Error(`動作 ${item.id} 的 amountLimit 必須是非負數`)
        }
        entry.amountLimit = item.amountLimit
      }
      if (item.amountParam !== undefined) {
        if (typeof item.amountParam !== 'string') throw new Error(`動作 ${item.id} 的 amountParam 必須是字串`)
        entry.amountParam = item.amountParam
      }
      if (item.description !== undefined) {
        if (typeof item.description !== 'string') throw new Error(`動作 ${item.id} 的 description 必須是字串`)
        entry.description = item.description
      }
      return entry
    })
    return new ActionRegistry(entries)
  }

  get size(): number {
    return this.#entries.length
  }

  list(): readonly ActionEntry[] {
    return this.#entries.slice()
  }

  /**
   * 找出動作對應的登錄。支援末尾 `*` 的前綴匹配。
   * 找不到時回傳 null —— 呼叫端必須把它當成「未登記 → 拒絕」，這是預設拒絕的來源。
   */
  find(action: string): ActionEntry | null {
    for (const entry of this.#sorted) {
      if (entry.id.endsWith('*')) {
        const prefix = entry.id.slice(0, -1)
        if (action.startsWith(prefix)) return entry
      } else if (entry.id === action) {
        return entry
      }
    }
    return null
  }
}

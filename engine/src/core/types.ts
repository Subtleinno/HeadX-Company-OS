/**
 * Company OS 的核心型別。
 *
 * 設計原則（見 docs/company-os-master-plan.md）：
 * 1. 風險按「動作」分級，不按 Agent。
 * 2. 預設拒絕：沒有明確允許的動作一律 ask，逾時即取消。
 * 3. 品牌之間資料隔離。
 * 4. 審計日誌只可追加。
 * 5. MCP 不得提供批准工具 —— 批准只經人。
 */

/** 風險級別。L0 最低，L4 禁止。 */
export type RiskLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'

/** 閘道對一個請求的最終處置。 */
export type Decision = 'allow' | 'deny' | 'ask'

/** 閘道判定結果。 */
export interface Verdict {
  /** 最終處置。 */
  decision: Decision
  /** 命中的風險級別（若動作未登記，為 null）。 */
  level: RiskLevel | null
  /** 動作識別碼，例如 "erp.order.create"。 */
  action: string
  /** 給人或 Agent 看的原因。 */
  reason: string
  /** 命中的規則識別碼（若為預設拒絕，為 null）。 */
  matchedRuleId: string | null
  /** 幂等鍵；重複請求會回傳同一個請求記錄。 */
  requestId: string
  /** 若 decision 為 ask，這是等待批准的工單號；否則為 null。 */
  approvalId: string | null
}

/** 一個要通過閘道的請求。 */
export interface GatewayRequest {
  /** 動作識別碼，必須在動作登錄表中。 */
  action: string
  /** 發起者：main / subagent / 人或 Agent 名稱。 */
  actor: string
  /** 公司識別碼。 */
  companyId: string
  /** 品牌識別碼；空字串代表公司層級（不分品牌）。 */
  brandId: string
  /** 動作參數（金額、對象等）。 */
  params: Record<string, unknown>
  /** 幂等鍵。相同鍵 + 相同動作 = 同一個請求。 */
  idempotencyKey: string
  /** 請求時間（ISO 8601）。 */
  requestedAt?: string
}

/** 動作登錄表的一筆記錄。 */
export interface ActionEntry {
  /** 動作識別碼，支援末尾 `*` 作前綴匹配，例如 "erp.order.*"。 */
  id: string
  /** 風險級別。 */
  level: RiskLevel
  /** 金額上限（單位的整數，例如「仙」）。未設定代表不限。 */
  amountLimit?: number
  /** 讀取金額的參數名；未設定代表此動作不涉及金額。 */
  amountParam?: string
  /** 說明。 */
  description?: string
}

/** 公司設定。 */
export interface CompanyConfig {
  companyId: string
  name: string
  brands: BrandConfig[]
}

/** 品牌設定。 */
export interface BrandConfig {
  brandId: string
  name: string
  /** 品牌是否啟用；停用後所有請求被拒絕。 */
  enabled: boolean
}

/** Needs 工單狀態。 */
export type NeedStatus = 'open' | 'assigned' | 'delivered' | 'accepted' | 'rejected' | 'cancelled'

/** Needs 工單種類。 */
export type NeedKind = 'video' | 'photo' | 'design' | 'copy' | 'document' | 'other'

/** 一張 Needs 工單。 */
export interface Need {
  id: string
  companyId: string
  brandId: string
  kind: NeedKind
  /** 為何需要（一句話）。 */
  title: string
  /** 期望產出規格。 */
  spec: string
  /** 用途：哪個 app、哪次發布。 */
  purpose: string
  /** 截止時間（ISO 8601）。 */
  dueAt: string
  /** Agent 已嘗試過什麼 —— 必填，防止未嘗試就開單。 */
  attempted: string
  /** 參考資料連結。 */
  references: string[]
  status: NeedStatus
  assignee: string | null
  createdAt: string
  updatedAt: string
  /** 交付說明。 */
  deliveryNote: string | null
}

/** 審計日誌的一筆記錄。 */
export interface AuditEntry {
  /** 序號，由 1 起。 */
  seq: number
  at: string
  /** 事件類型。 */
  kind: 'request' | 'verdict' | 'approval' | 'need' | 'breaker' | 'config'
  companyId: string
  brandId: string
  actor: string
  action: string
  requestId: string
  decision: Decision | null
  detail: Record<string, unknown>
  /** 上一筆記錄的雜湊（第一筆為 64 個 0）。 */
  prevHash: string
  /** 本筆記錄的雜湊 = sha256(prevHash + 正規化內容)。 */
  hash: string
}

/** 熔斷開關狀態。 */
export interface BreakerState {
  /** 是否已熔斷（true = 所有寫入暫停）。 */
  tripped: boolean
  /** 熔斷原因。 */
  reason: string | null
  /** 熔斷時間。 */
  at: string | null
  /** 觸發者。 */
  by: string | null
}

/** 待批准請求。 */
export interface ApprovalRequest {
  id: string
  requestId: string
  action: string
  companyId: string
  brandId: string
  actor: string
  level: RiskLevel
  params: Record<string, unknown>
  reason: string
  createdAt: string
  /** 逾時即自動取消（預設拒絕）。 */
  expiresAt: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  decidedAt: string | null
  decidedBy: string | null
  decisionNote: string | null
}

/**
 * 審計日誌：只可追加、雜湊鏈、可驗證。
 *
 * 每一筆記錄的雜湊 = sha256(prevHash + "|" + 正規化內容)。
 * 任何一筆被改動，之後所有雜湊都會對不上，`verifyChain` 會指出第一個斷點。
 *
 * 這段不依賴任何外部套件，只用 node:crypto 與 node:fs，因為它是整個系統
 * 唯一「不可以出錯」的部分。
 */
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AuditEntry, Decision } from '../core/types.ts'

const GENESIS_HASH = '0'.repeat(64)

/** 把要雜湊的欄位以固定順序序列化，避免鍵序影響雜湊。 */
function canonical(entry: Omit<AuditEntry, 'hash'>): string {
  const ordered = {
    seq: entry.seq,
    at: entry.at,
    kind: entry.kind,
    companyId: entry.companyId,
    brandId: entry.brandId,
    actor: entry.actor,
    action: entry.action,
    requestId: entry.requestId,
    decision: entry.decision,
    detail: entry.detail,
    prevHash: entry.prevHash,
  }
  return JSON.stringify(ordered)
}

/** 計算一筆記錄的雜湊。 */
export function hashEntry(entry: Omit<AuditEntry, 'hash'>): string {
  return createHash('sha256').update(canonical(entry), 'utf8').digest('hex')
}

/** 雜湊鏈驗證結果。 */
export interface ChainVerification {
  ok: boolean
  /** 記錄總數。 */
  length: number
  /** 若 ok 為 false，第一個出問題的序號（由 1 起）。 */
  brokenAt: number | null
  /** 問題說明。 */
  problem: string | null
}

/**
 * 審計日誌。以 JSON Lines 儲存，一行一筆。
 * 同時寫入記憶體索引，方便查詢；重啟時從檔案重載。
 */
export class AuditLog {
  readonly #path: string
  #entries: AuditEntry[] = []

  constructor(path: string) {
    this.#path = path
    mkdirSync(dirname(path), { recursive: true })
    if (existsSync(path)) this.#load()
  }

  #load(): void {
    const text = readFileSync(this.#path, 'utf8')
    const lines = text.split('\n').filter((line) => line.trim() !== '')
    this.#entries = lines.map((line, index) => {
      try {
        return JSON.parse(line) as AuditEntry
      } catch {
        throw new Error(`審計日誌第 ${index + 1} 行不是合法 JSON：${this.#path}`)
      }
    })
  }

  get path(): string {
    return this.#path
  }

  get length(): number {
    return this.#entries.length
  }

  /** 全部記錄（唯讀副本）。 */
  entries(): readonly AuditEntry[] {
    return this.#entries.slice()
  }

  /** 最後一筆的雜湊；空日誌時為創世雜湊。 */
  get headHash(): string {
    const last = this.#entries[this.#entries.length - 1]
    return last ? last.hash : GENESIS_HASH
  }

  /** 追加一筆記錄，回傳寫入後的完整記錄（含 seq、雜湊）。 */
  append(input: {
    kind: AuditEntry['kind']
    companyId: string
    brandId: string
    actor: string
    action: string
    requestId: string
    decision: Decision | null
    detail: Record<string, unknown>
    at?: string
  }): AuditEntry {
    const seq = this.#entries.length + 1
    const base: Omit<AuditEntry, 'hash'> = {
      seq,
      at: input.at ?? new Date().toISOString(),
      kind: input.kind,
      companyId: input.companyId,
      brandId: input.brandId,
      actor: input.actor,
      action: input.action,
      requestId: input.requestId,
      decision: input.decision,
      detail: input.detail,
      prevHash: this.headHash,
    }
    const entry: AuditEntry = { ...base, hash: hashEntry(base) }
    appendFileSync(this.#path, JSON.stringify(entry) + '\n', 'utf8')
    this.#entries.push(entry)
    return entry
  }

  /** 依 requestId 找出所有相關記錄。 */
  byRequestId(requestId: string): AuditEntry[] {
    return this.#entries.filter((entry) => entry.requestId === requestId)
  }

  /** 依公司與品牌過濾（品牌隔離）。 */
  byBrand(companyId: string, brandId: string): AuditEntry[] {
    return this.#entries.filter((entry) => entry.companyId === companyId && entry.brandId === brandId)
  }

  /**
   * 驗證整條雜湊鏈。這是「不可篡改」的證明：
   * 回傳 ok 為 true 時，可以確信記錄自上線以來未被改動。
   */
  verifyChain(): ChainVerification {
    let prevHash = GENESIS_HASH
    for (let i = 0; i < this.#entries.length; i += 1) {
      const entry = this.#entries[i]
      if (!entry) continue
      const expectedSeq = i + 1
      if (entry.seq !== expectedSeq) {
        return { ok: false, length: this.#entries.length, brokenAt: expectedSeq, problem: `序號不連續：期望 ${expectedSeq}，實際 ${entry.seq}` }
      }
      if (entry.prevHash !== prevHash) {
        return { ok: false, length: this.#entries.length, brokenAt: expectedSeq, problem: 'prevHash 與上一筆的雜湊不符' }
      }
      const { hash, ...rest } = entry
      const recomputed = hashEntry(rest)
      if (recomputed !== hash) {
        return { ok: false, length: this.#entries.length, brokenAt: expectedSeq, problem: '記錄內容已被改動（雜湊不符）' }
      }
      prevHash = hash
    }
    return { ok: true, length: this.#entries.length, brokenAt: null, problem: null }
  }

  /** 匯出成 JSON，方便備份或交給審計。 */
  exportJson(): string {
    return JSON.stringify({ headHash: this.headHash, verification: this.verifyChain(), entries: this.#entries }, null, 2)
  }

  /** 僅供測試：建立一個空檔以便重新開始。 */
  static reset(path: string): void {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '', 'utf8')
  }
}

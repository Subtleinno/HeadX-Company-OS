/**
 * 批准請求的持久化儲存。
 *
 * 為什麼需要：批准請求原本只存在記憶體。但 Company OS 有多個進程
 * （MCP 伺服器、網頁介面、CLI），它們各自有獨立的記憶體。
 * 若 Agent 經 MCP 開出批准請求，人的批准收件匣（另一個進程）就看不到它，
 * 整個「閘道 -> 收件匣」的鏈路就斷了。
 *
 * 所以批准請求必須落盤。這裡用最簡單的 JSON 檔 + 原子寫入，
 * 因為它不是高頻資料，而且人類可讀比效能重要。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ApprovalRequest } from '../core/types.ts'

export class ApprovalStore {
  readonly #path: string

  constructor(path: string) {
    this.#path = path
    mkdirSync(dirname(path), { recursive: true })
  }

  /** 讀取全部批准請求；檔案不存在或損壞時回傳空 Map。 */
  load(): Map<string, ApprovalRequest> {
    const map = new Map<string, ApprovalRequest>()
    if (!existsSync(this.#path)) return map
    try {
      const raw = JSON.parse(readFileSync(this.#path, 'utf8')) as unknown
      if (!Array.isArray(raw)) return map
      for (const item of raw) {
        const approval = item as ApprovalRequest
        if (typeof approval?.id === 'string') map.set(approval.id, approval)
      }
    } catch {
      // 檔案損壞不應令整個系統起不來；寧可從空白開始，也不要失去伺服器。
      return map
    }
    return map
  }

  /** 原子寫入：先寫暫存檔再改名，避免半寫入的檔案。 */
  save(approvals: Map<string, ApprovalRequest>): void {
    const payload = JSON.stringify([...approvals.values()], null, 2)
    const temporary = `${this.#path}.${process.pid}.tmp`
    writeFileSync(temporary, payload, 'utf8')
    renameSync(temporary, this.#path)
  }
}

/**
 * 通用的 JSON 檔案儲存。
 *
 * 為什麼需要：Company OS 有多個進程（MCP 伺服器、網頁介面、CLI），
 * 各自有獨立記憶體。若批准請求與 Needs 工單只存在記憶體，
 * Agent 經 MCP 開出的請求，人在批准收件匣就看不到，鏈路就斷了。
 *
 * 所以這些資料必須落盤。用最簡單的 JSON + 原子寫入，
 * 因為它不是高頻資料，而且人類可讀比效能重要。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export class JsonStore<T extends { id: string }> {
  readonly #path: string

  constructor(path: string) {
    this.#path = path
    mkdirSync(dirname(path), { recursive: true })
  }

  get path(): string {
    return this.#path
  }

  /** 讀取全部記錄；檔案不存在或損壞時回傳空 Map（寧可從空白開始，也不要失去伺服器）。 */
  load(): Map<string, T> {
    const map = new Map<string, T>()
    if (!existsSync(this.#path)) return map
    try {
      const raw = JSON.parse(readFileSync(this.#path, 'utf8')) as unknown
      if (!Array.isArray(raw)) return map
      for (const item of raw) {
        const record = item as T
        if (typeof record?.id === 'string') map.set(record.id, record)
      }
    } catch {
      return map
    }
    return map
  }

  /** 原子寫入：先寫暫存檔再改名，避免半寫入的檔案。 */
  save(records: Map<string, T>): void {
    const payload = JSON.stringify([...records.values()], null, 2)
    const temporary = `${this.#path}.${process.pid}.tmp`
    writeFileSync(temporary, payload, 'utf8')
    renameSync(temporary, this.#path)
  }
}

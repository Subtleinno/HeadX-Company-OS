/**
 * 公司與品牌設定，以及品牌隔離。
 *
 * ADR-002：一間公司多個品牌。品牌之間資料必須隔離——
 * 每個請求都必須帶著 companyId 與 brandId，閘道會確認該品牌屬於該公司且已啟用。
 */
import { readFileSync } from 'node:fs'
import type { BrandConfig, CompanyConfig } from '../core/types.ts'

/** 公司設定庫。 */
export class CompanyRegistry {
  readonly #companies: Map<string, CompanyConfig>

  constructor(companies: CompanyConfig[]) {
    this.#companies = new Map()
    for (const company of companies) this.#companies.set(company.companyId, company)
  }

  /** 從 config/company.json 讀入。 */
  static fromFile(path: string): CompanyRegistry {
    const raw = readFileSync(path, 'utf8')
    return CompanyRegistry.fromJson(JSON.parse(raw))
  }

  /** 從已解析的 JSON 建立，並做嚴格驗證。 */
  static fromJson(value: unknown): CompanyRegistry {
    if (typeof value !== 'object' || value === null) throw new Error('公司設定必須是物件')
    const root = value as Record<string, unknown>
    if (!Array.isArray(root.companies)) throw new Error('公司設定缺少 companies 陣列')
    const companies: CompanyConfig[] = root.companies.map((raw, index) => {
      if (typeof raw !== 'object' || raw === null) throw new Error(`公司第 ${index + 1} 筆不是物件`)
      const item = raw as Record<string, unknown>
      if (typeof item.companyId !== 'string' || item.companyId === '') throw new Error(`公司第 ${index + 1} 筆缺少 companyId`)
      if (typeof item.name !== 'string') throw new Error(`公司 ${item.companyId} 缺少 name`)
      if (!Array.isArray(item.brands)) throw new Error(`公司 ${item.companyId} 缺少 brands 陣列`)
      const brands: BrandConfig[] = item.brands.map((brandRaw, brandIndex) => {
        if (typeof brandRaw !== 'object' || brandRaw === null) throw new Error(`公司 ${item.companyId} 第 ${brandIndex + 1} 個品牌不是物件`)
        const brand = brandRaw as Record<string, unknown>
        if (typeof brand.brandId !== 'string' || brand.brandId === '') throw new Error(`公司 ${item.companyId} 第 ${brandIndex + 1} 個品牌缺少 brandId`)
        if (typeof brand.name !== 'string') throw new Error(`品牌 ${brand.brandId} 缺少 name`)
        return { brandId: brand.brandId, name: brand.name, enabled: brand.enabled !== false }
      })
      const ids = brands.map((brand) => brand.brandId)
      if (new Set(ids).size !== ids.length) throw new Error(`公司 ${item.companyId} 有重複的 brandId`)
      return { companyId: item.companyId, name: item.name, brands }
    })
    const ids = companies.map((company) => company.companyId)
    if (new Set(ids).size !== ids.length) throw new Error('有重複的 companyId')
    return new CompanyRegistry(companies)
  }

  list(): readonly CompanyConfig[] {
    return [...this.#companies.values()]
  }

  get(companyId: string): CompanyConfig | null {
    return this.#companies.get(companyId) ?? null
  }

  /** 找出某公司的某品牌；不存在時回傳 null。 */
  brand(companyId: string, brandId: string): BrandConfig | null {
    const company = this.#companies.get(companyId)
    if (!company) return null
    return company.brands.find((brand) => brand.brandId === brandId) ?? null
  }

  /**
   * 品牌隔離檢查。
   * 回傳 null 代表通過；回傳字串代表拒絕原因。
   */
  checkScope(companyId: string, brandId: string): string | null {
    const company = this.#companies.get(companyId)
    if (!company) return `公司 ${companyId} 未登記`
    if (brandId === '') return null // 公司層級動作，不涉及品牌
    const brand = company.brands.find((candidate) => candidate.brandId === brandId)
    if (!brand) return `品牌 ${brandId} 不屬於公司 ${companyId}（品牌隔離）`
    if (!brand.enabled) return `品牌 ${brandId} 已停用`
    return null
  }
}

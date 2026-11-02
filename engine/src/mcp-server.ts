/**
 * Company OS MCP 伺服器（ADR-016）。
 *
 * 以 stdio 傳輸的 JSON-RPC 2.0 實作，不依賴任何外部套件，
 * 因為這個伺服器等於公司系統的「AI 介面」，必須在任何環境都能啟動。
 *
 * 硬規則：這裡**不會**提供 approve / reject 工具。
 * 批准與拒絕永遠只經人在 UI 或 CLI 完成。
 * 模型可以由 `company_os_evaluate` 得知一個動作「需要人批」，
 * 但它永遠無法自己把它批准。
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createEngine } from './core/engine.ts'
import type { GatewayRequest, NeedKind } from './core/types.ts'

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const ROOT = join(HERE, '..')
const DATA_DIR = process.env['COMPANY_OS_DATA'] ?? join(ROOT, 'data')
mkdirSync(DATA_DIR, { recursive: true })
const engine = createEngine({ configDir: join(ROOT, 'config'), dataDir: DATA_DIR })

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string | null
  method: string
  params?: Record<string, unknown>
}

interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'company_os_evaluate',
    description:
      '讓一個動作通過 Company OS 政策閘道。回傳 allow / deny / ask。' +
      'ask 代表需要人批准，閘道會建立批准請求；這個工具無法批准它。' +
      '未在動作登錄表中登記的動作一律 deny（預設拒絕）。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '動作識別碼，例如 erp.order.create 或 publish.social' },
        companyId: { type: 'string', description: '公司識別碼' },
        brandId: { type: 'string', description: '品牌識別碼；公司層級動作留空' },
        actor: { type: 'string', description: '發起者，例如 agent 或 model 名稱' },
        amountCents: { type: 'number', description: '涉及金額（以仙為單位）；不相關時省略' },
        params: { type: 'object', description: '其他動作參數' },
        idempotencyKey: { type: 'string', description: '幂等鍵；重複提交同一鍵不會重複執行' },
      },
      required: ['action', 'companyId'],
    },
  },
  {
    name: 'company_os_list_actions',
    description: '列出動作登錄表：每個動作的風險級別（L0–L4）、金額上限與說明。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'company_os_pending_approvals',
    description: '列出等待人批准的請求。供 Agent 知道「有什麼在等人」，但它不能批准。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'company_os_needs_create',
    description:
      '當 Agent 無法完成某項工作（影片、實拍照片、實物設計等）時，開一張 Needs 工單交給人。' +
      'attempted 為必填：必須說明自己已經嘗試過什麼，防止未嘗試就開單。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string' },
        brandId: { type: 'string' },
        kind: { type: 'string', enum: ['video', 'photo', 'design', 'copy', 'document', 'other'] },
        title: { type: 'string', description: '一句話說明需要什麼' },
        spec: { type: 'string', description: '期望產出規格（尺寸、長度、格式）' },
        purpose: { type: 'string', description: '用途：哪個 app、哪次發布' },
        dueAt: { type: 'string', description: '截止時間，ISO 8601' },
        attempted: { type: 'string', description: 'Agent 已嘗試過什麼（必填）' },
        references: { type: 'array', items: { type: 'string' }, description: '參考資料連結' },
        actor: { type: 'string' },
      },
      required: ['companyId', 'brandId', 'kind', 'title', 'spec', 'purpose', 'dueAt', 'attempted'],
    },
  },
  {
    name: 'company_os_needs_list',
    description: '列出某公司與品牌的 Needs 工單。',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string' },
        brandId: { type: 'string', description: '省略則列出該公司所有品牌' },
      },
      required: ['companyId'],
    },
  },
  {
    name: 'company_os_needs_deliver',
    description: '由員工交付工單（人用）。',
    inputSchema: {
      type: 'object',
      properties: { needId: { type: 'string' }, note: { type: 'string' }, by: { type: 'string' } },
      required: ['needId', 'note', 'by'],
    },
  },
  {
    name: 'company_os_audit_verify',
    description: '驗證審計日誌的雜湊鏈是否完整（是否被篡改）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'company_os_breaker_status',
    description: '查詢熔斷開關狀態。熔斷開啟時所有動作都會被擋下。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'company_os_health',
    description: 'Company OS 引擎健康檢查。',
    inputSchema: { type: 'object', properties: {} },
  },
]

function toolResult(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function requireString(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value === '') throw new Error(`參數 ${name} 必填且必須是字串`)
  return value
}

function callTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case 'company_os_evaluate': {
      const params: Record<string, unknown> = { ...(typeof args['params'] === 'object' && args['params'] !== null ? (args['params'] as Record<string, unknown>) : {}) }
      if (typeof args['amountCents'] === 'number') params['amountCents'] = args['amountCents']
      const request: GatewayRequest = {
        action: requireString(args, 'action'),
        companyId: requireString(args, 'companyId'),
        brandId: typeof args['brandId'] === 'string' ? args['brandId'] : '',
        actor: typeof args['actor'] === 'string' ? args['actor'] : 'mcp-agent',
        params,
        idempotencyKey: typeof args['idempotencyKey'] === 'string' ? args['idempotencyKey'] : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }
      return engine.gateway.evaluate(request)
    }
    case 'company_os_list_actions':
      return engine.actions.list()
    case 'company_os_pending_approvals':
      return engine.pending().map((approval) => ({
        id: approval.id,
        action: approval.action,
        brandId: approval.brandId,
        level: approval.level,
        params: approval.params,
        expiresAt: approval.expiresAt,
        note: '這個請求只能由人在 Company OS 介面批准，Agent 無法自行批准。',
      }))
    case 'company_os_needs_create':
      return engine.needs.create({
        companyId: requireString(args, 'companyId'),
        brandId: requireString(args, 'brandId'),
        kind: requireString(args, 'kind') as NeedKind,
        title: requireString(args, 'title'),
        spec: requireString(args, 'spec'),
        purpose: requireString(args, 'purpose'),
        dueAt: requireString(args, 'dueAt'),
        attempted: requireString(args, 'attempted'),
        references: Array.isArray(args['references']) ? (args['references'] as string[]) : [],
        actor: typeof args['actor'] === 'string' ? args['actor'] : 'mcp-agent',
      })
    case 'company_os_needs_list':
      return engine.needs.list(requireString(args, 'companyId'), typeof args['brandId'] === 'string' ? args['brandId'] : undefined)
    case 'company_os_needs_deliver':
      return engine.needs.deliver(requireString(args, 'needId'), requireString(args, 'note'), requireString(args, 'by'))
    case 'company_os_audit_verify':
      return engine.audit.verifyChain()
    case 'company_os_breaker_status':
      return engine.breaker()
    case 'company_os_health':
      return engine.health()
    default:
      throw new Error(`未知工具：${name}`)
  }
}

function handle(message: JsonRpcRequest): unknown {
  switch (message.method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'company-os', version: '0.1.0' },
        instructions:
          'Company OS 引擎。所有寫入動作都必須先經 company_os_evaluate。' +
          '這個伺服器沒有批准工具：決策為 ask 時，請求只會進入人的批准收件匣，模型無法自行批准。',
      }
    case 'notifications/initialized':
      return undefined
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call': {
      const params = message.params ?? {}
      const name = typeof params['name'] === 'string' ? params['name'] : ''
      const args = typeof params['arguments'] === 'object' && params['arguments'] !== null ? (params['arguments'] as Record<string, unknown>) : {}
      try {
        return toolResult(callTool(name, args))
      } catch (error) {
        return { content: [{ type: 'text', text: `錯誤：${error instanceof Error ? error.message : String(error)}` }], isError: true }
      }
    }
    case 'ping':
      return {}
    default:
      throw new Error(`未知方法：${message.method}`)
  }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => {
  buffer += chunk
  let index = buffer.indexOf('\n')
  while (index !== -1) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (line !== '') processLine(line)
    index = buffer.indexOf('\n')
  }
})

function processLine(line: string): void {
  let message: JsonRpcRequest
  try {
    message = JSON.parse(line) as JsonRpcRequest
  } catch {
    return
  }
  if (message.id === undefined || message.id === null) {
    try {
      handle(message)
    } catch {
      /* 通知不需要回應 */
    }
    return
  }
  try {
    const result = handle(message)
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n')
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: error instanceof Error ? error.message : String(error) },
      }) + '\n',
    )
  }
}

/**
 * Company OS 網頁介面伺服器。
 *
 * 零外部依賴，只用 node:http，因為它必須在任何環境都能起動。
 * 只綁定 127.0.0.1，不對外開放。
 *
 * 設計遵循 docs/company-os-design-system.md：
 *   白底 + 黑 accent、狀態三色、Apple HIG、無 emoji、動效 120–320ms。
 *
 * 硬規則（ADR-016）：批准與拒絕只在這個介面出現，MCP 不提供。
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createEngine } from './core/engine.ts'
import type { Engine } from './core/engine.ts'

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const ROOT = join(HERE, '..')
const PUBLIC = join(ROOT, 'public')
const DATA_DIR = process.env['COMPANY_OS_DATA'] ?? join(ROOT, 'data')
const PORT = Number(process.env['COMPANY_OS_PORT'] ?? 3083)

const engine: Engine = createEngine({ configDir: join(ROOT, 'config'), dataDir: DATA_DIR })

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(text)
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function asset(res: ServerResponse, name: string, type: string): void {
  try {
    const body = readFileSync(join(PUBLIC, name), 'utf8')
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
      if (raw.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      if (raw.trim() === '') return resolve({})
      try {
        const parsed = JSON.parse(raw) as unknown
        resolve(typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {})
      } catch {
        resolve({})
      }
    })
  })
}

function snapshot(): Record<string, unknown> {
  const pending = engine.pending()
  const needs = engine.needs.open()
  const chain = engine.audit.verifyChain()
  return {
    health: engine.health(),
    breaker: engine.breaker(),
    counts: {
      pendingApprovals: pending.length,
      openNeeds: needs.length,
      auditLength: chain.length,
    },
    chain,
    generatedAt: new Date().toISOString(),
  }
}

function approvalView(approval: ReturnType<Engine['pending']>[number]): Record<string, unknown> {
  return {
    id: approval.id,
    action: approval.action,
    level: approval.level,
    companyId: approval.companyId,
    brandId: approval.brandId,
    actor: approval.actor,
    params: approval.params,
    reason: approval.reason,
    createdAt: approval.createdAt,
    expiresAt: approval.expiresAt,
    status: approval.status,
  }
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const method = req.method ?? 'GET'

  // 靜態資源
  if (path === '/' || path === '/index.html') return html(res, 200, readFileSync(join(PUBLIC, 'index.html'), 'utf8'))
  if (path === '/style.css') return asset(res, 'style.css', 'text/css; charset=utf-8')
  if (path === '/app.js') return asset(res, 'app.js', 'text/javascript; charset=utf-8')

  // API
  if (path === '/api/state' && method === 'GET') {
    return json(res, 200, snapshot())
  }
  if (path === '/api/actions' && method === 'GET') {
    return json(res, 200, engine.actions.list())
  }
  if (path === '/api/approvals' && method === 'GET') {
    return json(res, 200, engine.pending().map(approvalView))
  }
  if (path === '/api/approvals/history' && method === 'GET') {
    const history = engine.audit
      .entries()
      .filter((entry) => entry.kind === 'approval')
      .slice(-40)
      .reverse()
    return json(res, 200, history)
  }

  const approveMatch = /^\/api\/approvals\/([^/]+)\/approve$/.exec(path)
  if (approveMatch && method === 'POST') {
    const body = await readBody(req)
    const by = typeof body['by'] === 'string' ? body['by'] : 'founder'
    const note = typeof body['note'] === 'string' ? body['note'] : ''
    try {
      const approval = engine.gateway.approve(decodeURIComponent(approveMatch[1]!), by, note)
      return json(res, 200, approvalView(approval))
    } catch (error) {
      return json(res, 409, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const rejectMatch = /^\/api\/approvals\/([^/]+)\/reject$/.exec(path)
  if (rejectMatch && method === 'POST') {
    const body = await readBody(req)
    const by = typeof body['by'] === 'string' ? body['by'] : 'founder'
    const note = typeof body['note'] === 'string' ? body['note'] : ''
    try {
      const approval = engine.gateway.reject(decodeURIComponent(rejectMatch[1]!), by, note)
      return json(res, 200, approvalView(approval))
    } catch (error) {
      return json(res, 409, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  if (path === '/api/needs' && method === 'GET') {
    return json(res, 200, engine.needs.open())
  }

  const needActionMatch = /^\/api\/needs\/([^/]+)\/(assign|deliver|accept|reject|cancel)$/.exec(path)
  if (needActionMatch && method === 'POST') {
    const id = decodeURIComponent(needActionMatch[1]!)
    const action = needActionMatch[2]!
    const body = await readBody(req)
    try {
      if (action === 'assign') {
        const assignee = typeof body['assignee'] === 'string' ? body['assignee'] : ''
        return json(res, 200, engine.needs.assign(id, assignee, String(body['by'] ?? 'founder')))
      }
      if (action === 'deliver') {
        return json(res, 200, engine.needs.deliver(id, String(body['note'] ?? ''), String(body['by'] ?? 'founder')))
      }
      if (action === 'accept') return json(res, 200, engine.needs.accept(id, String(body['by'] ?? 'founder')))
      if (action === 'reject') {
        return json(res, 200, engine.needs.rejectDelivery(id, String(body['note'] ?? ''), String(body['by'] ?? 'founder')))
      }
      return json(res, 200, engine.needs.cancel(id, String(body['note'] ?? ''), String(body['by'] ?? 'founder')))
    } catch (error) {
      return json(res, 409, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  if (path === '/api/audit/verify' && method === 'GET') {
    return json(res, 200, engine.audit.verifyChain())
  }
  if (path === '/api/audit/recent' && method === 'GET') {
    return json(res, 200, engine.audit.entries().slice(-40).reverse())
  }

  if (path === '/api/breaker/trip' && method === 'POST') {
    const body = await readBody(req)
    return json(res, 200, engine.gateway.tripBreaker(String(body['reason'] ?? '未說明原因'), String(body['by'] ?? 'founder')))
  }
  if (path === '/api/breaker/reset' && method === 'POST') {
    const body = await readBody(req)
    return json(res, 200, engine.gateway.resetBreaker(String(body['by'] ?? 'founder')))
  }

  return json(res, 404, { error: `找不到 ${path}` })
}

const server = createServer((req, res) => {
  // 只接受本機來源
  const host = req.headers.host ?? ''
  if (!host.startsWith('127.0.0.1:') && !host.startsWith('localhost:')) {
    res.writeHead(403).end('forbidden host')
    return
  }
  route(req, res).catch((error: unknown) => {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Company OS 介面：http://127.0.0.1:${PORT}`)
  console.log(`資料目錄：${DATA_DIR}`)
})

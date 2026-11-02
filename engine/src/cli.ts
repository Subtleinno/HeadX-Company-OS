#!/usr/bin/env node
/**
 * Company OS CLI：讓人與 Agent 都能用同一套指令。
 *
 * 設計原則（ADR-016）：CLI 只提供「做事」的指令，
 * 「批准」與「拒絕」是人的動作，只在 `approve` / `reject` 兩個子命令出現，
 * 而 MCP 伺服器**不會**把這兩個子命令暴露給模型。
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createEngine } from './core/engine.ts'
import type { GatewayRequest, NeedKind } from './core/types.ts'

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const ROOT = join(HERE, '..')
const CONFIG_DIR = join(ROOT, 'config')
const DATA_DIR = process.env['COMPANY_OS_DATA'] ?? join(ROOT, 'data')

mkdirSync(DATA_DIR, { recursive: true })
const engine = createEngine({ configDir: CONFIG_DIR, dataDir: DATA_DIR })

function usage(): never {
  console.log(`Company OS 引擎 CLI

用法：node src/cli.ts <command> [options]

命令：
  evaluate --action <動作> --company <公司> --brand <品牌> --actor <誰>
           [--amount <整數>] [--key <幂等鍵>] [--param k=v ...]
      通過政策閘道判定一個動作。回傳 JSON。

  approval list
      列出所有待批准請求（批准收件匣的資料來源）。

  approval show <id>
      顯示一筆批准請求。

  approve <id> --by <人> --note <理由>
      批准。只應由人執行，MCP 不提供。

  reject <id> --by <人> --note <理由>
      拒絕。只應由人執行，MCP 不提供。

  need create --company <公司> --brand <品牌> --kind <種類> --title <標題>
              --spec <規格> --purpose <用途> --due <ISO 時間> --attempted <已嘗試什麼>
      建立一張 Needs 工單。attempted 必填。

  need list [--company <公司>] [--brand <品牌>]
  need assign <id> --assignee <人>
  need deliver <id> --note <說明> --by <人>
  need accept <id> --by <人>

  breaker trip --reason <原因> --by <人>
  breaker reset --by <人>
  breaker status

  audit verify          驗證雜湊鏈
  audit export          匯出完整審計日誌
  health                健康檢查

環境變數：
  COMPANY_OS_DATA   資料目錄，預設為 engine/data
`)
  process.exit(0)
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function required(name: string): string {
  const value = arg(name)
  if (value === undefined) {
    console.error(`缺少必要參數 --${name}`)
    process.exit(2)
  }
  return value
}

function collectParams(): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  const amount = arg('amount')
  if (amount !== undefined) params['amountCents'] = Number(amount)
  const argv = process.argv
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--param') {
      const pair = argv[i + 1] ?? ''
      const eq = pair.indexOf('=')
      if (eq > 0) params[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
  }
  return params
}

function out(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

const command = process.argv[2]
const sub = process.argv[3]

switch (command) {
  case 'evaluate': {
    const request: GatewayRequest = {
      action: required('action'),
      companyId: required('company'),
      brandId: arg('brand') ?? '',
      actor: arg('actor') ?? 'agent',
      params: collectParams(),
      idempotencyKey: arg('key') ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }
    out(engine.gateway.evaluate(request))
    break
  }
  case 'approval': {
    if (sub === 'list') {
      out(engine.pending())
    } else if (sub === 'show') {
      const id = process.argv[4]
      if (!id) throw new Error('需要批准請求 id')
      out(engine.gateway.approval(id))
    } else usage()
    break
  }
  case 'approve': {
    const id = process.argv[3]
    if (!id) throw new Error('需要批准請求 id')
    out(engine.gateway.approve(id, required('by'), arg('note') ?? ''))
    break
  }
  case 'reject': {
    const id = process.argv[3]
    if (!id) throw new Error('需要批准請求 id')
    out(engine.gateway.reject(id, required('by'), arg('note') ?? ''))
    break
  }
  case 'need': {
    if (sub === 'create') {
      out(
        engine.needs.create({
          companyId: required('company'),
          brandId: required('brand'),
          kind: required('kind') as NeedKind,
          title: required('title'),
          spec: required('spec'),
          purpose: required('purpose'),
          dueAt: required('due'),
          attempted: required('attempted'),
          actor: arg('actor') ?? 'agent',
        }),
      )
    } else if (sub === 'list') {
      out(engine.needs.list(required('company'), arg('brand')))
    } else if (sub === 'assign') {
      const id = process.argv[4]
      if (!id) throw new Error('需要工單 id')
      out(engine.needs.assign(id, required('assignee'), arg('actor') ?? 'founder'))
    } else if (sub === 'deliver') {
      const id = process.argv[4]
      if (!id) throw new Error('需要工單 id')
      out(engine.needs.deliver(id, required('note'), required('by')))
    } else if (sub === 'accept') {
      const id = process.argv[4]
      if (!id) throw new Error('需要工單 id')
      out(engine.needs.accept(id, arg('by') ?? 'agent'))
    } else usage()
    break
  }
  case 'breaker': {
    if (sub === 'trip') out(engine.gateway.tripBreaker(required('reason'), required('by')))
    else if (sub === 'reset') out(engine.gateway.resetBreaker(required('by')))
    else if (sub === 'status') out(engine.breaker())
    else usage()
    break
  }
  case 'audit': {
    if (sub === 'verify') out(engine.audit.verifyChain())
    else if (sub === 'export') console.log(engine.audit.exportJson())
    else usage()
    break
  }
  case 'health':
    out(engine.health())
    break
  default:
    usage()
}

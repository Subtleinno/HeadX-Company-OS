/**
 * Company OS 引擎測試。
 *
 * 這些測試的目標不是「程式碼有冇 bug」，而是「系統有冇守住 master plan 的原則」。
 * 每個 test 的標題就是它要證明的原則。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngine } from '../src/core/engine.ts'
import { AuditLog, hashEntry } from '../src/audit/audit-log.ts'
import { ActionRegistry, LEVEL_DECISION } from '../src/policy/action-registry.ts'
import { CompanyRegistry } from '../src/core/company.ts'
import type { GatewayRequest } from '../src/core/types.ts'

const CONFIG_DIR = join(import.meta.dirname, '..', 'config')

function freshEngine(): { engine: ReturnType<typeof createEngine>; dispose: () => void } {
  const dataDir = mkdtempSync(join(tmpdir(), 'company-os-test-'))
  const engine = createEngine({ configDir: CONFIG_DIR, dataDir })
  return { engine, dispose: () => rmSync(dataDir, { recursive: true, force: true }) }
}

let counter = 0
function request(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  counter += 1
  return {
    action: 'reports.read',
    actor: 'agent',
    companyId: 'hx',
    brandId: 'hxdesign',
    params: {},
    idempotencyKey: `key-${counter}`,
    ...overrides,
  }
}

test('原則 3（預設拒絕）：未登記的動作一律擋下', () => {
  const { engine, dispose } = freshEngine()
  try {
    const verdict = engine.gateway.evaluate(request({ action: 'unknown.action' }))
    assert.equal(verdict.decision, 'deny')
    assert.equal(verdict.matchedRuleId, null)
    assert.match(verdict.reason, /未在動作登錄表中登記/)
  } finally {
    dispose()
  }
})

test('L0 唯讀自動放行，並留下審計記錄', () => {
  const { engine, dispose } = freshEngine()
  try {
    const before = engine.audit.length
    const verdict = engine.gateway.evaluate(request({ action: 'reports.read' }))
    assert.equal(verdict.decision, 'allow')
    assert.equal(verdict.level, 'L0')
    assert.ok(engine.audit.length > before)
  } finally {
    dispose()
  }
})

test('L1 草稿可還原的寫入自動放行', () => {
  const { engine, dispose } = freshEngine()
  try {
    assert.equal(engine.gateway.evaluate(request({ action: 'content.draft.create' })).decision, 'allow')
    assert.equal(engine.gateway.evaluate(request({ action: 'git.pr.open' })).decision, 'allow')
  } finally {
    dispose()
  }
})

test('L2 對外影響轉人工批准，並建立批准請求', () => {
  const { engine, dispose } = freshEngine()
  try {
    const verdict = engine.gateway.evaluate(request({ action: 'publish.social' }))
    assert.equal(verdict.decision, 'ask')
    assert.equal(verdict.level, 'L2')
    assert.ok(verdict.approvalId)
    const pending = engine.pending()
    assert.equal(pending.length, 1)
    assert.equal(pending[0]?.action, 'publish.social')
  } finally {
    dispose()
  }
})

test('L3 破壞性動作轉人工批准', () => {
  const { engine, dispose } = freshEngine()
  try {
    assert.equal(engine.gateway.evaluate(request({ action: 'git.pr.merge' })).decision, 'ask')
    assert.equal(engine.gateway.evaluate(request({ action: 'deploy.production' })).decision, 'ask')
  } finally {
    dispose()
  }
})

test('L4 禁止沒有批准路徑：直接擋下，不建立批准請求', () => {
  const { engine, dispose } = freshEngine()
  try {
    const verdict = engine.gateway.evaluate(request({ action: 'secret.read' }))
    assert.equal(verdict.decision, 'deny')
    assert.equal(verdict.level, 'L4')
    assert.equal(verdict.approvalId, null)
    assert.equal(engine.pending().length, 0)
  } finally {
    dispose()
  }
})

test('ADR-002 品牌隔離：品牌不屬於該公司時擋下', () => {
  const { engine, dispose } = freshEngine()
  try {
    const verdict = engine.gateway.evaluate(request({ brandId: 'someone-elses-brand' }))
    assert.equal(verdict.decision, 'deny')
    assert.match(verdict.reason, /品牌隔離/)
  } finally {
    dispose()
  }
})

test('ADR-002 品牌停用後所有請求擋下', () => {
  const companies = CompanyRegistry.fromJson({
    companies: [{ companyId: 'hx', name: 'Hx', brands: [{ brandId: 'hxdesign', name: 'HxDesign', enabled: false }] }],
  })
  const problem = companies.checkScope('hx', 'hxdesign')
  assert.equal(problem, '品牌 hxdesign 已停用')
})

test('原則 8 熔斷：開啟後連 L0 都被擋下', () => {
  const { engine, dispose } = freshEngine()
  try {
    engine.gateway.tripBreaker('測試熔斷', 'founder')
    assert.equal(engine.breaker().tripped, true)
    const verdict = engine.gateway.evaluate(request({ action: 'reports.read' }))
    assert.equal(verdict.decision, 'deny')
    assert.match(verdict.reason, /熔斷開關已開啟/)
    engine.gateway.resetBreaker('founder')
    assert.equal(engine.gateway.evaluate(request({ action: 'reports.read' })).decision, 'allow')
  } finally {
    dispose()
  }
})

test('金額上限：預設為 0，任何金額的下單都需人批或超限', () => {
  const { engine, dispose } = freshEngine()
  try {
    const tooMuch = engine.gateway.evaluate(request({ action: 'erp.order.create', params: { amountCents: 100 } }))
    assert.equal(tooMuch.decision, 'deny')
    assert.match(tooMuch.reason, /超出/)
    const zero = engine.gateway.evaluate(request({ action: 'erp.order.create', params: { amountCents: 0 } }))
    assert.equal(zero.decision, 'ask')
    const missing = engine.gateway.evaluate(request({ action: 'erp.order.create', params: {} }))
    assert.equal(missing.decision, 'deny')
  } finally {
    dispose()
  }
})

test('冪等鍵：相同動作 + 相同鍵只判定一次', () => {
  const { engine, dispose } = freshEngine()
  try {
    const first = engine.gateway.evaluate(request({ action: 'publish.social', idempotencyKey: 'same-key' }))
    const lengthAfterFirst = engine.audit.length
    const second = engine.gateway.evaluate(request({ action: 'publish.social', idempotencyKey: 'same-key' }))
    assert.equal(second.requestId, first.requestId)
    assert.equal(second.approvalId, first.approvalId)
    assert.equal(engine.audit.length, lengthAfterFirst, '重複的冪等請求不應再寫入審計日誌')
  } finally {
    dispose()
  }
})

test('原則 3 逾時即取消：超過 TTL 未批准的請求自動過期', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'company-os-ttl-'))
  let nowMs = Date.parse('2026-11-03T00:00:00.000Z')
  const engine = createEngine({ configDir: CONFIG_DIR, dataDir, approvalTtlSeconds: 60, now: () => new Date(nowMs) })
  try {
    const verdict = engine.gateway.evaluate(request({ action: 'refund.create' }))
    assert.equal(verdict.decision, 'ask')
    assert.ok(verdict.approvalId)
    nowMs += 61_000
    const approval = engine.gateway.approval(verdict.approvalId)
    assert.equal(approval?.status, 'expired')
    assert.equal(engine.pending().length, 0)
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
})

test('批准與拒絕都寫入審計日誌', () => {
  const { engine, dispose } = freshEngine()
  try {
    const a = engine.gateway.evaluate(request({ action: 'email.send.customer' }))
    engine.gateway.approve(a.approvalId!, 'founder', '內容已核對')
    assert.equal(engine.gateway.approval(a.approvalId!)?.status, 'approved')

    const b = engine.gateway.evaluate(request({ action: 'email.send.customer' }))
    engine.gateway.reject(b.approvalId!, 'founder', '語氣不對')
    assert.equal(engine.gateway.approval(b.approvalId!)?.status, 'rejected')

    const approvals = engine.audit.entries().filter((entry) => entry.kind === 'approval')
    assert.ok(approvals.some((entry) => entry.decision === 'allow'))
    assert.ok(approvals.some((entry) => entry.decision === 'deny'))
  } finally {
    dispose()
  }
})

test('原則 5 不可變日誌：雜湊鏈完整，改動任何一筆都會被發現', () => {
  const { engine, dispose } = freshEngine()
  try {
    for (let i = 0; i < 5; i += 1) engine.gateway.evaluate(request({ action: 'reports.read' }))
    assert.equal(engine.audit.verifyChain().ok, true)

    const entries = engine.audit.entries()
    const tampered = structuredClone(entries) as unknown as Array<Record<string, unknown>>
    tampered[2]!.actor = 'attacker'
    const recomputed = hashEntry(tampered[2] as never)
    assert.notEqual(recomputed, entries[2]!.hash, '改動內容後雜湊必須不同')
  } finally {
    dispose()
  }
})

test('審計日誌重啟後仍可驗證，雜湊鏈不中斷', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'company-os-reload-'))
  try {
    const first = createEngine({ configDir: CONFIG_DIR, dataDir })
    first.gateway.evaluate(request({ action: 'reports.read' }))
    first.gateway.evaluate(request({ action: 'publish.social' }))
    const headBefore = first.audit.headHash

    const second = createEngine({ configDir: CONFIG_DIR, dataDir })
    assert.equal(second.audit.headHash, headBefore)
    second.gateway.evaluate(request({ action: 'reports.read' }))
    const chain = second.audit.verifyChain()
    assert.equal(chain.ok, true)
    // 2 筆判定 + 1 筆批准請求 + 1 筆重啟後的判定 = 4
    assert.equal(chain.length, 4)
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
})

test('ADR-008 Needs：attempted 空白時拒絕建立工單', () => {
  const { engine, dispose } = freshEngine()
  try {
    assert.throws(
      () =>
        engine.needs.create({
          companyId: 'hx',
          brandId: 'hxdesign',
          kind: 'video',
          title: '品牌形象片',
          spec: '30 秒，直式',
          purpose: 'IG 發布',
          dueAt: '2026-11-10T00:00:00.000Z',
          attempted: '   ',
          actor: 'agent',
        }),
      /已嘗試過什麼/,
    )
  } finally {
    dispose()
  }
})

test('ADR-008 Needs：完整生命週期並留下審計記錄', () => {
  const { engine, dispose } = freshEngine()
  try {
    const need = engine.needs.create({
      companyId: 'hx',
      brandId: 'hxdesign',
      kind: 'photo',
      title: '產品實拍',
      spec: '白底，5 張，3000px',
      purpose: '官網首頁',
      dueAt: '2026-11-10T00:00:00.000Z',
      attempted: '已用 ComfyUI 試過三次生成，手部質感不達標',
      references: ['https://example.com/brief'],
      actor: 'agent',
    })
    assert.equal(need.status, 'open')
    assert.equal(engine.needs.assign(need.id, 'sam', 'founder').status, 'assigned')
    assert.equal(engine.needs.deliver(need.id, '已上載 5 張至 HxDesign', 'sam').status, 'delivered')
    assert.equal(engine.needs.accept(need.id, 'agent').status, 'accepted')
    const needEvents = engine.audit.entries().filter((entry) => entry.kind === 'need')
    assert.equal(needEvents.length, 4)
  } finally {
    dispose()
  }
})

test('Needs：品牌隔離，看不到別的品牌工單', () => {
  const { engine, dispose } = freshEngine()
  try {
    engine.needs.create({
      companyId: 'hx',
      brandId: 'hxdesign',
      kind: 'design',
      title: 'A 品牌的圖',
      spec: '方形',
      purpose: '測試',
      dueAt: '2026-11-10T00:00:00.000Z',
      attempted: '已試過三種風格',
      actor: 'agent',
    })
    assert.equal(engine.needs.list('hx', 'hxdesign').length, 1)
    assert.equal(engine.needs.list('hx', 'studio').length, 0)
  } finally {
    dispose()
  }
})

test('分級映射：L0/L1 放行、L2/L3 詢問、L4 拒絕', () => {
  assert.equal(LEVEL_DECISION.L0, 'allow')
  assert.equal(LEVEL_DECISION.L1, 'allow')
  assert.equal(LEVEL_DECISION.L2, 'ask')
  assert.equal(LEVEL_DECISION.L3, 'ask')
  assert.equal(LEVEL_DECISION.L4, 'deny')
})

test('動作登錄表：最長的 id 優先匹配', () => {
  const registry = ActionRegistry.fromJson([
    { id: 'erp.order.*', level: 'L2' },
    { id: 'erp.order.create', level: 'L3' },
  ])
  assert.equal(registry.find('erp.order.create')?.level, 'L3')
  assert.equal(registry.find('erp.order.cancel')?.level, 'L2')
  assert.equal(registry.find('other.action'), null)
})

test('動作登錄表：重複 id 或非法級別會在載入時失敗', () => {
  assert.throws(() => ActionRegistry.fromJson([{ id: 'a', level: 'L2' }, { id: 'a', level: 'L3' }]), /重複/)
  assert.throws(() => ActionRegistry.fromJson([{ id: 'a', level: 'L9' }]), /L0–L4/)
})

test('健康檢查：鏈正常且未熔斷時為 ok', () => {
  const { engine, dispose } = freshEngine()
  try {
    const health = engine.health()
    assert.equal(health.chainOk, true)
    assert.equal(health.breakerTripped, false)
    assert.equal(health.ok, true)
  } finally {
    dispose()
  }
})

test('AuditLog.reset 可建立空日誌', () => {
  const dir = mkdtempSync(join(tmpdir(), 'company-os-reset-'))
  try {
    const path = join(dir, 'audit.jsonl')
    AuditLog.reset(path)
    const log = new AuditLog(path)
    assert.equal(log.length, 0)
    assert.equal(log.verifyChain().ok, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

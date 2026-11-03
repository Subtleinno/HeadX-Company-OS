// Company OS 介面邏輯。原生 JS，無框架，無建置步驟。
// 設計約束：無 emoji、狀態以「顏色 + 文字」表達、動效 120–320ms。

const state = {
  view: 'approvals',
  approvals: [],
  needs: [],
  actions: [],
  audit: [],
  chain: null,
  counts: { pendingApprovals: 0, openNeeds: 0, auditLength: 0 },
  breaker: null,
}

const $ = (id) => document.getElementById(id)

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key === 'dataset') Object.assign(node.dataset, value)
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value)
    else node.setAttribute(key, value)
  }
  for (const child of [].concat(children)) {
    if (child == null) continue
    node.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(data && data.error ? data.error : `HTTP ${response.status}`)
  return data
}

function toast(message, isError = false) {
  const node = $('toast')
  node.textContent = message
  node.style.background = isError ? 'var(--state-danger)' : 'var(--accent)'
  node.hidden = false
  requestAnimationFrame(() => node.classList.add('is-visible'))
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => {
    node.classList.remove('is-visible')
    setTimeout(() => { node.hidden = true }, 260)
  }, 2600)
}

function formatTime(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function remaining(iso) {
  const ms = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(ms)) return '—'
  if (ms <= 0) return '已逾時'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `${hours} 小時後逾時`
  return `${Math.max(1, Math.floor(ms / 60_000))} 分鐘後逾時`
}

function levelChip(level) {
  if (!level) return el('span', { class: 'level', text: '未登記' })
  return el('span', { class: 'level', dataset: { level }, text: level })
}

function badge(id, count) {
  const node = $(id)
  if (!count) { node.hidden = true; node.textContent = ''; return }
  node.hidden = false
  node.textContent = count > 99 ? '99+' : String(count)
}

// ── 待批准 ────────────────────────────────────────────────
function renderApprovals() {
  const list = $('approvals-list')
  list.replaceChildren()

  if (state.approvals.length === 0) {
    list.append(el('div', { class: 'empty', text: '沒有待批准項目。所有動作都在規則內處理完畢。' }))
    return
  }

  state.approvals.forEach((approval, index) => {
    const params = Object.entries(approval.params ?? {})
      .map(([key, value]) => `${key} = ${String(value)}`)
      .join('、')

    const card = el('article', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('h2', { class: 'card-title', text: approval.action }),
          el('p', { class: 'card-sub', text: `${approval.companyId} / ${approval.brandId || '（公司層級）'}` }),
        ]),
        levelChip(approval.level),
      ]),
      el('div', { class: 'card-body' }, [
        el('p', { class: 'reason', text: approval.reason }),
        el('dl', { class: 'field' }, [
          el('dt', { text: '發起者' }),
          el('dd', { text: approval.actor }),
        ]),
        el('dl', { class: 'field' }, [
          el('dt', { text: '參數' }),
          el('dd', { text: params || '（無）' }),
        ]),
        el('dl', { class: 'field' }, [
          el('dt', { text: '期限' }),
          el('dd', { text: remaining(approval.expiresAt) }),
        ]),
      ]),
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: 'btn btn-primary',
          text: '批准',
          onclick: () => decide(approval.id, 'approve'),
        }),
        el('button', {
          class: 'btn btn-line',
          text: '退回',
          onclick: () => decide(approval.id, 'reject'),
        }),
      ]),
    ])
    card.style.animationDelay = `${Math.min(index, 8) * 20}ms`
    list.append(card)
  })
}

async function decide(id, action) {
  const note = action === 'reject' ? window.prompt('退回理由（必填）') : window.prompt('備註（可留空）') ?? ''
  if (action === 'reject' && !note) return
  try {
    await api(`/api/approvals/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ by: 'founder', note }),
    })
    toast(action === 'approve' ? '已批准' : '已退回')
    await refresh()
  } catch (error) {
    toast(error.message, true)
  }
}

// ── Needs ────────────────────────────────────────────────
const KIND_LABEL = {
  video: '影片',
  photo: '照片',
  design: '設計',
  copy: '文案',
  document: '文件',
  other: '其他',
}

const STATUS_LABEL = {
  open: '待指派',
  assigned: '已指派',
  delivered: '已交付',
  accepted: '已驗收',
  rejected: '已退回',
  cancelled: '已取消',
}

function renderNeeds() {
  const list = $('needs-list')
  list.replaceChildren()

  if (state.needs.length === 0) {
    list.append(el('div', { class: 'empty', text: '沒有未完成的工單。' }))
    return
  }

  state.needs.forEach((need, index) => {
    const actions = []

    if (need.status === 'open') {
      const input = el('input', { type: 'text', placeholder: '指派給誰' })
      actions.push(
        el('div', { class: 'inline-form' }, [
          input,
          el('button', {
            class: 'btn btn-primary',
            text: '指派',
            onclick: () => needAction(need.id, 'assign', { assignee: input.value }),
          }),
        ]),
      )
    }

    if (need.status === 'assigned') {
      const input = el('input', { type: 'text', placeholder: '交付說明' })
      actions.push(
        el('div', { class: 'inline-form' }, [
          input,
          el('button', {
            class: 'btn btn-primary',
            text: '標記已交付',
            onclick: () => needAction(need.id, 'deliver', { note: input.value, by: 'staff' }),
          }),
        ]),
      )
    }

    if (need.status === 'delivered') {
      actions.push(
        el('button', { class: 'btn btn-primary', text: '驗收通過', onclick: () => needAction(need.id, 'accept', {}) }),
        el('button', {
          class: 'btn btn-line',
          text: '退回',
          onclick: () => {
            const note = window.prompt('退回原因（必填）')
            if (note) needAction(need.id, 'reject', { note })
          },
        }),
      )
    }

    const card = el('article', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('h2', { class: 'card-title', text: need.title }),
          el('p', { class: 'card-sub', text: `${need.brandId} / ${KIND_LABEL[need.kind] ?? need.kind}` }),
        ]),
        el('span', { class: `level status-${need.status}`, text: STATUS_LABEL[need.status] ?? need.status }),
      ]),
      el('div', { class: 'card-body' }, [
        el('dl', { class: 'field' }, [el('dt', { text: '規格' }), el('dd', { text: need.spec })]),
        el('dl', { class: 'field' }, [el('dt', { text: '用途' }), el('dd', { text: need.purpose })]),
        el('dl', { class: 'field' }, [el('dt', { text: '截止' }), el('dd', { text: formatTime(need.dueAt) })]),
        el('dl', { class: 'field' }, [el('dt', { text: '已嘗試' }), el('dd', { text: need.attempted })]),
        need.assignee ? el('dl', { class: 'field' }, [el('dt', { text: '承辦' }), el('dd', { text: need.assignee })]) : null,
        need.deliveryNote ? el('dl', { class: 'field' }, [el('dt', { text: '交付' }), el('dd', { text: need.deliveryNote })]) : null,
      ]),
      el('div', { class: 'card-actions' }, actions),
    ])
    card.style.animationDelay = `${Math.min(index, 8) * 20}ms`
    list.append(card)
  })
}

async function needAction(id, action, body) {
  try {
    await api(`/api/needs/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    toast('已更新')
    await refresh()
  } catch (error) {
    toast(error.message, true)
  }
}

// ── 分級表 ────────────────────────────────────────────────
function renderActions() {
  const tbody = $('actions-table').querySelector('tbody')
  tbody.replaceChildren()

  state.actions.forEach((entry) => {
    tbody.append(
      el('tr', {}, [
        el('td', { text: entry.id }),
        el('td', {}, [levelChip(entry.level)]),
        el('td', { text: entry.amountLimit === undefined ? '—' : String(entry.amountLimit) }),
        el('td', { text: entry.description ?? '—' }),
      ]),
    )
  })
}

// ── 審計 ────────────────────────────────────────────────
function renderAudit() {
  const list = $('audit-list')
  list.replaceChildren()

  const chip = $('chain-chip')
  const auditChip = $('audit-chip')
  if (state.chain) {
    const ok = state.chain.ok
    chip.className = `chip ${ok ? 'is-ok' : 'is-bad'}`
    chip.textContent = ok ? `審計完整 ${state.chain.length}` : `雜湊鏈斷裂 @${state.chain.brokenAt}`
    auditChip.className = `chip ${ok ? 'is-ok' : 'is-bad'}`
    auditChip.textContent = ok
      ? `通過：${state.chain.length} 筆記錄，雜湊鏈完整`
      : `失敗：第 ${state.chain.brokenAt} 筆起不符（${state.chain.problem}）`
  }

  if (state.audit.length === 0) {
    list.append(el('div', { class: 'empty', text: '尚無審計記錄。' }))
    return
  }

  state.audit.forEach((entry) => {
    list.append(
      el('div', { class: 'audit-row' }, [
        el('span', { class: 'seq', text: `#${entry.seq}` }),
        el('span', { class: 'kind', text: entry.kind }),
        el('span', { class: 'what', text: `${entry.action} · ${entry.decision ?? '—'} · ${entry.brandId || '公司'}` }),
        el('span', { class: 'hash', text: entry.hash.slice(0, 8) }),
      ]),
    )
  })
}

// ── 狀態列 ────────────────────────────────────────────────
function renderStatus() {
  const breakerTripped = Boolean(state.breaker && state.breaker.tripped)
  const button = $('btn-breaker')
  button.textContent = breakerTripped ? '熔斷中，按此解除' : '熔斷'
  button.className = `btn btn-ghost${breakerTripped ? ' is-tripped' : ''}`

  const parts = [
    `待批准 ${state.counts.pendingApprovals}`,
    `未完成工單 ${state.counts.openNeeds}`,
    `審計 ${state.counts.auditLength} 筆`,
  ]
  if (breakerTripped) parts.unshift(`熔斷：${state.breaker.reason ?? '未說明'}`)
  $('status-left').textContent = parts.join('　·　')
  $('status-right').textContent = `更新於 ${formatTime(state.generatedAt ?? new Date().toISOString())}`
}

// ── 資料載入 ────────────────────────────────────────────────
async function refresh() {
  try {
    const [snapshot, approvals, needs, audit] = await Promise.all([
      api('/api/state'),
      api('/api/approvals'),
      api('/api/needs'),
      api('/api/audit/recent'),
    ])
    state.counts = snapshot.counts
    state.chain = snapshot.chain
    state.breaker = snapshot.breaker
    state.generatedAt = snapshot.generatedAt
    state.approvals = approvals
    state.needs = needs
    state.audit = audit

    if (state.actions.length === 0) state.actions = await api('/api/actions')

    badge('badge-approvals', state.counts.pendingApprovals)
    badge('badge-needs', state.counts.openNeeds)

    renderApprovals()
    renderNeeds()
    renderActions()
    renderAudit()
    renderStatus()
  } catch (error) {
    $('status-left').textContent = `載入失敗：${error.message}`
  }
}

// ── 事件綁定 ────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view
    state.view = view
    document.querySelectorAll('.tab').forEach((node) => {
      const active = node.dataset.view === view
      node.classList.toggle('is-active', active)
      node.setAttribute('aria-selected', String(active))
    })
    document.querySelectorAll('.view').forEach((node) => {
      node.classList.toggle('is-active', node.id === `view-${view}`)
    })
  })
})

$('btn-breaker').addEventListener('click', async () => {
  const tripped = state.breaker && state.breaker.tripped
  try {
    if (tripped) {
      await api('/api/breaker/reset', { method: 'POST', body: JSON.stringify({ by: 'founder' }) })
      toast('熔斷已解除')
    } else {
      const reason = window.prompt('熔斷原因（必填）')
      if (!reason) return
      await api('/api/breaker/trip', { method: 'POST', body: JSON.stringify({ reason, by: 'founder' }) })
      toast('已熔斷：所有寫入暫停')
    }
    await refresh()
  } catch (error) {
    toast(error.message, true)
  }
})

$('btn-verify').addEventListener('click', async () => {
  try {
    const chain = await api('/api/audit/verify')
    state.chain = chain
    renderAudit()
    toast(chain.ok ? `雜湊鏈完整，共 ${chain.length} 筆` : `雜湊鏈斷裂於第 ${chain.brokenAt} 筆`, !chain.ok)
  } catch (error) {
    toast(error.message, true)
  }
})

refresh()
setInterval(refresh, 5000)

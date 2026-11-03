/**
 * dsh-company-os-panel 的瀏覽器端。
 *
 * 手寫的 DSH 客戶端 bundle，格式跟隨宿主載入器：
 *   window.__ModuleLoader__.load({ id, factory: (require) => ({ apply, inject }) })
 *
 * 它做兩件事，兩件都只在 DSH 的側欄與主區註冊一列，不改任何既有行為：
 *   1. 在側欄加一個「Company OS」入口（sidebar.panellist）
 *   2. 主區顯示 Company OS 的網頁介面（main），以 iframe 載入本機的 3083
 *
 * 為什麼用 iframe 而不用 React 重寫一次介面：
 *   Company OS 的介面已經是獨立的網頁（Apple HIG、白底黑 accent、狀態三色），
 *   重寫等於維護兩套前端。iframe 讓「一份介面、兩處入口」成立。
 */
window.__ModuleLoader__.load({
  id: 'dsh-company-os-panel',
  factory: (require) => {
    const bundleModule = { exports: {} }
    Object.defineProperty(bundleModule.exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    /** 側欄入口的識別碼，同時是主區頁面的 key，兩者必須一致。 */
    const PANEL_ID = 'company-os'
    /** Company OS 網頁介面的位址。只綁定 127.0.0.1。 */
    const PANEL_URL = 'http://127.0.0.1:3083/'

    /** 側欄圖示：一個簡單的方框加一條橫線，線性、單色、跟隨 currentColor。 */
    function PanelIcon() {
      return h(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('rect', { x: 2, y: 2.5, width: 12, height: 11, rx: 2, stroke: 'currentColor', strokeWidth: 1.25 }),
        h('line', { x1: 2, y1: 6.5, x2: 14, y2: 6.5, stroke: 'currentColor', strokeWidth: 1.25 }),
        h('line', { x1: 6, y1: 6.5, x2: 6, y2: 13.5, stroke: 'currentColor', strokeWidth: 1.25 }),
      )
    }

    /** 主區頁面：整塊交給 iframe，並保留 DSH 的外框與滾動行為。 */
    function PanelPage() {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            minHeight: 0,
            background: '#ffffff',
          },
        },
        h('iframe', {
          src: PANEL_URL,
          title: 'Company OS',
          style: {
            flex: '1 1 auto',
            width: '100%',
            height: '100%',
            border: '0',
            display: 'block',
            background: '#ffffff',
          },
          // iframe 內是自家頁面，不需要跨站能力。
          sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups',
        }),
      )
    }

    /** 側欄入口的標題。用函式形式，宿主每次重繪都會讀取，將來可接多語言。 */
    const label = () => 'Company OS'

    function apply(ctx) {
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 1,
            label,
          },
          PanelIcon,
        ),
      )

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
          },
          PanelPage,
        ),
      )
    }

    bundleModule.exports.apply = apply
    bundleModule.exports.inject = ['slots', 'layout']
    return bundleModule.exports
  },
})

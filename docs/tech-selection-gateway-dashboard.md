# 技術選型報告：政策閘道 + Company Dashboard

版本：v0.1 | 日期：2026-11-03 | 狀態：待創辦人拍板
對應 ADR：ADR-013（閘道先評估開源再 fork）、ADR-009（Company Dashboard）、ADR-016（每 app 必備 MCP）

---

## 0. 一頁結論

| 問題 | 結論 |
|---|---|
| 閘道要唔要由零寫？ | **唔要。** fork `dsh-permission-rules`（Apache-2.0）做基座。 |
| 另一個候選 `dsh-auto-mode`？ | **唔用。** 該專案已於 2026-09-29 停止維護並封存，而且只支援到 DSH 0.2.0-rc.2（我們是 0.2.1-rc.5）。 |
| `dsh-approval-gate`？ | **唔做基座。** 它的定位是「減少人工」，與我們「把關」的目標相反；但它的 diff／撤銷 UI 點子可以借用。 |
| Dashboard 點實作？ | 以 `dsh-better-sidebar` 的 `ctx.betterSidebar.registerTab` 註冊一個自訂 tab；**API 已在本機確認**，使用方式穩定。 |
| 我哋真正要自己寫嘅係咩？ | 只有三樣：**品牌／公司維度**、**金額上限與幂等鍵**、**Needs 觸發**。其餘全部沿用或改造。 |
| 工作量估算 | 若 fork 改造：閘道約 **6–9 週**（原估 6–9 個月）；Dashboard 約 **4–6 週**。 |

---

## 1. 評估方法

1. 只考慮有官方 npm 套件、且能與 DSH 0.2.1-rc.5 相容的方案。
2. 逐一閱讀上游 README、授權條款、維護狀態、以及它們對外暴露的擴充點。
3. 對照 master plan 的硬性需求（下方第 2 節），逐項標示「已有／部分／沒有」。
4. Dashboard 的可行性以**本機實際型別定義**驗證，不只看 README。

---

## 2. 我們的硬性需求（評估基準）

來源：master plan 第 2 節原則、ADR-008 至 ADR-016。

| 編號 | 需求 | 說明 |
|---|---|---|
| R1 | 所有寫入必經閘道 | 無法被 Agent 繞過 |
| R2 | 風險分級 L0–L4 | 按動作分級，不按 Agent |
| R3 | 預設拒絕、逾時取消 | 未批准即不執行 |
| R4 | 品牌／公司維度隔離 | 每個品牌獨立金鑰，互不可見 |
| R5 | 金額上限 | 財務動作有額度 |
| R6 | 幂等鍵 | 重複請求不重複執行 |
| R7 | 不可變審計日誌 | 只可追加、雜湊鏈、含 request_id |
| R8 | Needs 觸發 | Agent 撞牆時自動開工單 |
| R9 | 批准只經人 | MCP 不得提供批准工具 |
| R10 | 熔斷開關 | 一鍵暫停所有寫入 |
| R11 | 可審核、可解釋 | 每個決定都能回答「為咩擋／為咩放」 |
| R12 | 許可證乾淨 | 可商用、可修改、可持續 |

---

## 3. 候選一：`dsh-permission-rules`（PerryLink）

**授權**：Apache-2.0（可商用、可修改、需保留聲明）
**維護**：活躍（README 有 0.2.1-alpha 適配紀錄、多語言文件、CI、OpenSSF Scorecard）
**已在本機**：未安裝（本報告建議安裝）

### 它已經做到的事

- 掛在 `tools/pre-execute` 瀑布，對**每一次工具呼叫**做有序的 `allow` / `deny` / `ask` 判定；首個匹配即勝。
- 匹配維度極廣：工具名 glob（含 `mcp__*`）、arguments 的 glob／regex／`!pattern` 否定／`absent`、**任意層深的 workspace 相對路徑**、`when`（環境變數、平台）、shell 命令分解（argv）。
- `ask` 走官方審批機制；**沒有任何回應者時 fail-closed**（預設拒絕）——直接滿足 R3。
- **審計**：每次命中與每次放行都寫 `permissionRules/decision` 事件；不注入模型上下文。
- **熱重載**：規則檔一改即生效；改壞了保留舊規則，不會把系統弄死。
- **dry-run**：`enforce: false` 先記錄「本來會點做」但不攔截——適合我們第一週上線時觀察。
- **網絡政策**：內建本機 HTTP/CONNECT proxy，可做 `deny-all` / `whitelist` / `allow-all`。
- 規則檔有 JSON Schema，可放 `.dsh/rules.yaml`（專案層）或絕對路徑（全域層）。

### 對照我們的 12 項需求

| 需求 | 支援 | 說明 |
|---|---|---|
| R1 必經閘道 | 部分 | 管的是 **工具呼叫層**，不是「對外部系統的寫入」層；API 呼叫只要不是 MCP 工具，就不會被它看見 |
| R2 分級 | 部分 | 它是 allow/deny/ask 三分，可透過命名規則模擬 L0–L4，但沒有「金額」「級別」概念 |
| R3 預設拒絕 | 完全 | `ask` 無回應者即 fail-closed |
| R4 品牌隔離 | 沒有 | 沒有品牌／公司維度；需自行加上 per-brand 規則檔載入 |
| R5 金額上限 | 部分 | 只能對參數做 glob／regex（例如 `amount` > 數值做不到正規比較），真正的金額判斷要在自家閘道補 |
| R6 幂等鍵 | 沒有 | 需自建 |
| R7 審計日誌 | 部分 | 有事件流，但是「session 事件」，不是我們要的雜湊鏈日誌；雜湊鏈要自建 |
| R8 Needs 觸發 | 沒有 | 需自建 |
| R9 批准只經人 | 完全 | `ask` 走官方人審；沒有 MCP 批准工具 |
| R10 熔斷 | 部分 | 可用一條「全部 deny」規則模擬，但不是真正的一鍵開關 |
| R11 可解釋 | 完全 | 每次命中都有規則 id 與 reason，可回答「為咩擋」 |
| R12 許可證 | 完全 | Apache-2.0 |

**結論：介面與判定引擎可以整塊沿用；真正缺的是「業務語意」那一層。**

---

## 4. 候選二：`dsh-auto-mode`（NanmiCoder）—— 不採用

**授權**：MIT
**致命問題（兩個）**：

1. **已停止維護**：README 明言「Maintenance ended on 2026-09-29，本 repo 準備封存」，官方已有内置 Auto review。
2. **版本不相容**：最高只支援 DSH `0.2.0-rc.2`，我們是 `0.2.1-rc.5`。

另有設計取向問題：它的目標是「**減少人工介入**」（自動放行安全的動作），與我們「**把關**」的取向相反。它的分類器模型可以「從使用者的直接訊息推斷授權」，這在我們的情境是風險而不是功能。

**結論：不採用。** 但它的「刪除政策」（區分本 Session 產生的檔案 vs 既有檔案）值得借鑑到我們的 Needs 與回滾設計。

---

## 5. 候選三：`dsh-approval-gate`（moon09300731）—— 不採用為基座

**授權**：MIT
**定位**：用 Flash 模型預判每次沙箱越界，安全的自動放行、硬風險轉人工。
**優點**：人工審查 UI 完整（自動放行綠色提示、diff 對比、一鍵撤銷、快照管理）。
**不採用的理由**：

- 核心是「**確認制學習**」——同一操作確認 N-1 次後自動放行。這與 master plan 原則 3「預設拒絕」及 ADR-007「穩」直接衝突。
- 判定依賴模型，可解釋性弱於規則式。
- 它是規則檔 `allowlist.json` 熱更新，仍然沒有品牌／金額／幂等概念。

**可以借用**：diff 面板、撤銷按鈕、快照佔用統計——這三樣正是批准收件匣需要的呈現方式。

---

## 6. Dashboard 可行性：`dsh-better-sidebar` 的擴充 API

**已在** `C:\Users\Billy Chung\.dsh\profiles\desktop\node_modules\dsh-better-sidebar\lib\types\client\service.d.ts` **本地核實**（v0.28.2）：

```ts
ctx.betterSidebar.registerTab({
  id: 'company-os:dashboard',
  title: 'Company OS',
  description: '公司、品牌、Apps 與 DSH 狀態的單一視圖',
  icon: /* ReactNode */,
  single: true,                 // 單一實例
  badge: () => pendingCount,    // tab 上顯示待批數字
  settings: { pluginToggles: [...] },
  component: ({ ctx, scope }) => <Dashboard sessionId={scope.sessionId} />,
})
```

**可用能力清單**（來自官方 `features` 欄位，全部向後兼容、永不移除）：
`badge`、`tabLifecycle`、`updateTab`、`openFile`、`targetedOpen`、`stateSubscription`、`tabMeta`、`pluginSettings`、`urlTarget`、`settingSelect`、`fileIcons`、`rightActions`、`settingPatterns`、`hostRouteUrl`。

**注意事項（來自官方 README 的安全聲明）**：
- 自 v0.23.0 起，`/sidebar/api/fs.*` 路由**沒有工作區圍欄**，可讀寫任何主機使用者可達的路徑。我們的 Dashboard 只用它自己的 host 路由讀取 Company OS 資料，**不直接暴露 fs 路由給前端**。
- 路由受 Host-header 信任圍欄保護（與 `/api` 相同）。
- HTML 預覽在 opaque-origin sandboxed iframe 中渲染。

**結論：Dashboard 可以做成在 DSH 側欄內的一個 tab，與對話並排，不必另開瀏覽器視窗。**

---

## 7. 建議架構（三層）

```
┌─────────────────────────────────────────────────────────┐
│ 第 3 層：業務語意（我們自己寫，約 6–9 週）               │
│   company-os-policy                                      │
│   ├─ 品牌／公司解析（由請求→品牌→金鑰→級別）             │
│   ├─ L0–L4 分級表（資料檔，不是程式碼）                  │
│   ├─ 金額上限、幂等鍵                                    │
│   ├─ Needs 觸發（撞牆→開工單）                           │
│   ├─ 雜湊鏈審計日誌                                      │
│   └─ 熔斷開關                                            │
└─────────────────────────────────────────────────────────┘
                          ↓ 產生規則
┌─────────────────────────────────────────────────────────┐
│ 第 2 層：判定引擎（fork dsh-permission-rules，改造）     │
│   保留：規則格式、判定順序、ask 走官方審批、審計事件     │
│   改造：加入 per-brand 規則檔載入、加入金額規則型別      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 第 1 層：DSH 官方（不改）                                │
│   tools/pre-execute 瀑布 · 審批機制 · 沙箱 · 會話        │
└─────────────────────────────────────────────────────────┘
```

**這個分層的好處**：判定引擎將來即使被上游改壞，我們的業務語意層依然完整；上游修好再同步即可。

---

## 8. Fork 的具體做法與風險

| 項目 | 做法 |
|---|---|
| 授權 | 保留 `LICENSE`（Apache-2.0）與 `NOTICE`；在本 repo 的 `NOTICE` 註明來源與 fork commit |
| 同步上游 | 建立 `upstream` remote，每兩週 `git fetch upstream` 並評估差異 |
| 命名 | 套件改名 `@company-os/policy-rules`，避免與上游衝突 |
| 改動範圍 | 只加不改：新增 `brands` 匹配維度、新增 `amount` 比較運算、新增規則檔分層來源；不改上游的判定語意 |
| 安全審查 | fork 前先讀完 `src/runtime.ts` 的判定主路徑與審計寫入路徑，確認沒有意外外呼 |
| 失敗回滾 | 保留一份「只用上游原始版本」的 profile，隨時可以切回 |

**主要風險**：DSH 是 developer preview，上游隨時有 breaking change。緩解：我們只依賴 `tools/pre-execute` 這個**穩定接縫**，其餘功能不依賴。

---

## 9. 兩階段上線計劃

### 第一階段：觀察期（第 1–2 週）
- 安裝原版 `dsh-permission-rules`（不改），`enforce: false`（dry-run）。
- 用一條最簡單的規則：禁止寫入 `C:\company-os\docs` 以外的工作區外路徑。
- 目的：觀察它記錄了什麼、有沒有誤判、`/rules decisions` 是否好用。

### 第二階段：fork 與擴充（第 3–9 週）
- 第 3–4 週：fork、改名、接回 DSH，確認行為與原版一致（回歸測試）。
- 第 5–6 週：加入品牌維度與 L0–L4 分級表（資料檔驅動）。
- 第 7 週：金額上限與幂等鍵。
- 第 8 週：雜湊鏈審計日誌。
- 第 9 週：Needs 觸發與熔斷開關，並補上 dry-run → enforce 的切換演練。

### 第三階段：Dashboard（第 5–10 週，與上並行）
- 先做唯讀版：公司／品牌／Apps 清單 + DSH 狀態（模型、Skills、Plugins、MCP、記憶）。
- 再做待批與 Needs 佇列。
- 最後做健康度與成本。

---

## 10. 需要創辦人決定的事

| 編號 | 決定 | 選項 | 建議 |
|---|---|---|---|
| D1 | 是否按本報告 fork `dsh-permission-rules` | 是／否／先做第一階段觀察 | **先做第一階段（2 週觀察），再 fork** |
| D2 | fork 後是否保留 Apache-2.0（不能改成閉源發佈） | 必須保留 | 無選擇餘地，說明而已 |
| D3 | Dashboard 第一版只做唯讀？ | 唯讀／含操作 | **唯讀**，操作全部回到閘道 |
| D4 | 品牌隔離用「每個品牌一個規則檔」還是「單一規則檔加 brand 維度」 | A／B | **B**（單檔 + 維度），規則檔數量不會爆炸 |
| D5 | 金額上限的單位與默認值 | 需創辦人給數字 | 先設一個很低的默認（例如 HKD 0），逼所有財務動作都要人批，之後逐項放寬 |

---

## 11. 附註：官方 Auto review 是甚麼

DSH 0.2.x 已內建「Auto review」權限模式（見 `dsh-auto-mode` 的封存說明）。它**不是**我們的閘道：

- 它管的是「沙箱要不要放行」，不是「業務動作要去到哪一級」。
- 它在本機實驗中用 `danger-full-access`，與我們的要求相反。

**結論：官方 Auto review 不列入閘道選項，但它的存在提醒我們——不要重造 DSH 已有的東西，只補它沒有的。**

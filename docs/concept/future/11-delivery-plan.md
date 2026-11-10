# 交付計劃：v1 範圍、UI 時序、Issue 迴路

版本 v0.1 ｜ 2026-11-10 ｜ 狀態：待你確認
上位文件：`00-master-plan.md`、`01-company-os-concept.md`、`10-build-charter.md`。
這份回答四件事：**v1 做哪幾個 app、UI 幾時做、GitHub 怎樣設、issue 怎樣跑成閉環。**

---

## 1. 三條直接回答

### 1.1 Boss Portal 不可以是 Forge 生成的 app

三個理由，任何一個都足夠否決：

1. **它是殼，不是部門。** Portal 讀的是 Registry 四 shape。如果它本身是生成物，等於平台總覽依賴生成物——Forge 生壞一次，你連「哪裡壞了」都看不到。
2. **它是契約的消費者，不是生產者。** 用 Portal 去驗證 Registry 契約，是自己驗自己。契約只有在**兩個不同的 app 各自交出四 shape** 時才算被測到。
3. **它會被 Forge 改壞而你不知道。** Portal 是紅區（`10` 三色）。生成物不能進紅區，這是 Forge 的寫入邊界。

**結論：Portal 手寫，屬平台殼 P0。**

### 1.2 第二個 app 是 Sales，但要切薄

Sales 在 `02` 寫的是「銷售團隊的 ERP 前端」——四種資料形態、Gateway、投影、批核 config、Automation。那是一整個 app，不是 v1 的一塊。

v1 的 Sales **只做一條線**：

| 做 | 不做（v2 才做） |
|---|---|
| Customer（關係面向）＋ ERP 鏡像 | Product／Price 全表 |
| Pipeline＋Project（`assisted`） | Automation runtime |
| Needs（`decision` 型：報價授權、折扣底線） | 應收帳／發票列表投影 |
| Quotation 草稿 → **ERP Gateway 建單** → 讀回狀態 | Invoice 開立、收款 |
| Quotation PDF（derived，HTML→PDF） | 成本價可見性矩陣 |
| 一個可運作的批核開關（per-object toggle） | 完整 per-field 權限表 |

**為什麼這一刀切得對**：v1 要驗證的是「同一套框架撐不撐得住兩種模式」，不是「Sales 功能齊不齊」。上面這一條線已經包含 Marketing 沒有的四樣東西——**外部系統（ERP）、人主場的操作、`decision` 型 Needs、derived 成品**。四樣都有，壓測目的就達到了。

### 1.3 Forge 順延到 v1.1（我上一輪的建議收回）

上一輪我說「第一版要含一個 Forge 生成的 app，否則契約沒被測」。這一輪收回，理由是：**它把手段和目的搞反了。**

- 契約被測的條件是「兩個不同 producer」，不是「一個生成物」。
- 而 **App Kit 是蒸餾，不是預測**。Kit 的 80% 鎖死骨架（shell、MCP 骨架、Needs 面板、Registry serializer、事件、權限、幣種、i18n、測試骨架）只能由**兩個真實 app** 反推出來。先寫 Kit 再寫 app，等於憑空猜四次。
- 而且 v1 若同時要「手工 Marketing ＋ 手工 Sales ＋ 可生成 app 的 Forge」，等於三個未驗證的東西互相依賴。

**修正後的次序**：Marketing ＋ Sales 手寫 → 兩者 stabilise → 抽出 Kit → Forge 用它生成第三個 app（第一個目標建議 Booking-lite 或 Support-lite，真實有用、範圍細）。

代價要講清楚：**Forge 遲一到兩個月**。換來的是 Kit 有實證基礎，而不是一個「生成得漂亮但每個 app 形狀都不同」的系統。

---

## 2. v1 範圍（一句話）

> **平台殼 ＋ Boss Portal v0 ＋ Marketing Design（完整）＋ Sales（一條線），在同一個 Docker compose 上跑，有 CI 圍欄、有可演練的備份還原。**

**明確不在 v1**：Forge、Operations、Finance、HR、Booking、Support、Commerce、Automation runtime、多店（Site 結構建但不啟用第二個）、多幣種以外的外幣換算 UI、PDF 以外的 derived 成品。

---

## 3. UI 設計在幾時做（兩個時刻，不是一個階段）

你的判斷標準是畫面，所以 UI 不能排在最後。但也**不應該**先做一個完整設計階段——那會畫出十個沒人用的畫面。做法是兩次：

### 時刻一：M0，開工第一個星期（3–5 日）

只做兩樣，**不碰真數據**：

1. **設計 tokens**：字體、字級階梯、間距、圓角、色票（含語義色：正常／警示／危險／完成）、明暗兩套。寫成 CSS 變數，之後每個畫面只准用變數，不准寫死色碼。
2. **五個版面原型（archetype）**，純靜態 HTML ＋ 假數據，可以在瀏覽器點：

| # | 原型 | 為何是它 |
|---|---|---|
| A | **Boss Portal 總覽** | 你每天第一眼看的一頁 |
| B | **Needs 收件箱**（staff 版 ＋ boss 版） | 全系統最高頻、也最容易做得醜 |
| C | **Project 列表 ＋ 詳情** | 每個 app 都會繼承這個骨架 |
| D | **Create 工作台**（成品格、半成品、版本） | Marketing 的核心畫面 |
| E | **策略文件庫**（多層、可版本、可預覽） | 決定 agent 揀策略的 UI 是否可信 |

**五個原型的用途不是「好看」，是定下五個可重複使用的骨架。** 之後每個 app 的畫面，是這五個的組合，不是重新設計。這一條是防止「每個 app 長得都不一樣」的唯一辦法。

### 時刻二：之後每一個 issue 自帶它的 UI 切片

沒有獨立的「UI 階段」。每個功能 issue 的完成定義都包含**截圖**：同一個畫面，改動前後各一張，貼在 PR 與 issue 裡。

**硬規則：沒有截圖的 issue 不算完成。** 這樣做有兩個作用：你不必讀程式碼就判得出對錯；而 agent 也沒有「先交邏輯、畫面之後補」這條路。

---

## 4. GitHub 設定（私有庫 ＋ bot 帳號）

### 4.1 兩個帳號

| 帳號 | 角色 | 權限 |
|---|---|---|
| **你**（`billy-...`） | 擁有者、唯一批准人 | Admin |
| **bot**（例如 `company-os-bot`） | agent 用它交改動 | Write，**不是 admin** |

bot 用 fine-grained PAT，只給這個 repo 的 `contents: write`、`pull_requests: write`。不給 `administration`。

> 為什麼一定要分開：如果 agent 用你的帳號，加上「需要 1 個批准」，它批不到自己的改動——**而你也批不到**，因為系統不讓你批准自己開的 PR。你會鎖死自己。

### 4.2 `main` 的保護設定

| 設定 | 值 | 作用 |
|---|---|---|
| Require pull request | 開 | 沒有人直接推 `main` |
| Required approvals | **1** | bot 的 PR 要你批 |
| Dismiss stale approvals | 開 | 批完之後又改動，要重新批 |
| Require status checks | `verify`、`contract`、`secret-scan` | 機器先過，人再看 |
| Require branches up to date | 開 | 防止「測試過但 base 已變」 |
| Allow force push / deletion | **關** | 歷史不可改 |
| Allow admin bypass | **開** | 你自己不會被鎖死（bot 不是 admin，用不到） |

### 4.3 CODEOWNERS 對應三色領土

```
# 紅區：只有你能批
/core/schema/            @你
/core/registry/          @你
/core/auth/              @你
/migrations/             @你
/ops/backup/             @你
/.github/                @你
```

黃區（`/apps/**` 新物件、`/core/services/**`）不設 code owner，靠「PR 要寫一頁決定的理由」與 `contract` check。綠區（畫面、文案、config）不設。

### 4.4 分支策略

Trunk-based：`main` 永遠可部署；每個 issue 一條短分支 `i-123-slug`；不合併超過兩日的分支。不用 `develop`，不用 release branch——一個人維護，多一條長命分支就是多一份 merge debt。

---

## 5. Issue 結構

### 5.1 一個 issue 的定義

一個 issue 必須滿足四條，否則要拆：

1. **一個 PR 做得完**（≤ 一日工作量）
2. **有機器可驗的驗收**（測試、contract check、或截圖）
3. **寫明可改的路徑**（哪些檔案它在範圍內）
4. **寫明依賴**（blocked by 哪幾條）

### 5.2 模板（六欄，貼進 `.github/ISSUE_TEMPLATE/task.md`）

```markdown
## 目的
一句話：做完之後，誰可以做到什麼以前做不到的事。

## 範圍
可改：apps/marketing/**, core/registry/**
不可碰：core/schema/**, migrations/**

## 驗收（機器可驗）
- [ ] `make verify` 通過
- [ ] contract conformance 通過（四 shape 齊全）
- [ ] 截圖：<畫面名> before / after

## 依賴
blocked by: #12

## 完成定義
merge 到 main ＋ 部署 staging ＋ 截圖貼回本 issue ＋ issue 關閉
```

### 5.3 標籤

`wave:m0`…`wave:m4`、`zone:red|yellow|green`、`app:shell|marketing|sales`、`kind:feat|fix|infra|ui|doc`、`blocked`。

`zone:red` 的 issue 一律自動加你為 reviewer。

### 5.4 第一批 issue（M0 與 M1，可直接開）

**M0 — 圍欄與設計（8 條）**

| # | Issue | 驗收 |
|---|---|---|
| M0-1 | Repo scaffold：monorepo、workspace 邊界、`make verify` 骨架 | `make verify` 在空 repo 跑得過 |
| M0-2 | Bot 帳號 ＋ branch protection ＋ CODEOWNERS | bot 推不上 `main`；bot PR 需要你批 |
| M0-3 | `AGENTS.md`（≤100 行）＋ 兩份配方（`add-object`、`add-mcp-tool`） | agent 依配方可新增一個物件 |
| M0-4 | CI 三道 gate：base-pinned tests、依賴白名單、secret scan | 故意改測試讓自己過關 → CI 紅 |
| M0-5 | Docker compose 五服務 ＋ migration harness | `up` 之後 API 可連 DB 與 MinIO；`migrate up/down` 可用 |
| M0-6 | Design tokens ＋ 基礎元件（按鈕、輸入、表格、徽章、面板） | 一頁 showcase，明暗兩套 |
| M0-7 | 五個 archetype 靜態稿（A–E） | 可在瀏覽器點，你逐個看過並給意見 |
| M0-8 | 備份與還原腳本 ＋ **一次真實演練** | 從備份還原到空機，記錄耗時 |

**M1 — 平台殼（8 條）**

| # | Issue | 驗收 |
|---|---|---|
| M1-1 | 身份與四種角色（Boss／Staff／Agent／External）＋ session | 每種角色呼叫同一 API 得到不同結果 |
| M1-2 | Tenant／Site／Group ＋ Company Profile config | 只有一個 tenant、一個 site，但結構齊 |
| M1-3 | 事件日誌（append-only）＋ outbox | 任何寫入都留下事件；可回溯一個物件的歷史 |
| M1-4 | App Registry ＋ manifest schema | 手寫一份 manifest 可註冊成功 |
| M1-5 | Contract conformance harness（四 shape） | 故意漏 `needs` → 註冊被拒，訊息指出缺哪一項 |
| M1-6 | MCP server 骨架 ＋ 工具命名 ＋ scope | Agent 只看到被授權 app 的工具 |
| M1-7 | Needs 引擎（狀態機、兩型、Email 模板） | 由 API 開一張 `decision` Need，收到 Email，狀態流轉正確 |
| M1-8 | Boss Portal v0（讀 Registry、顯示 projects／needs／schedule） | 用假的兩個 app 註冊，Portal 顯示得齊 |

**之後**：M2 Marketing（8 條）、M3 Sales 薄切片（6 條）、M4 驗證（3 條：還原演練、15 分鐘回滾、3–5 條 fitness function）。M2 之後的細項要等 M1 落地才寫得準，現在寫只會寫錯。

---

## 6. Loop engineering：一條 issue 就是一圈

### 6.1 一圈八步

```
1. 讀 issue（唯一輸入；不再問人）
2. 開分支 i-<n>-<slug>
3. 實作 ＋ 本地 make verify
4. Playwright 截圖（before / after）
5. bot 開 PR：body 貼截圖 ＋ verify 摘要 ＋ 碰了哪些路徑
6. CI：base-pinned tests、contract、依賴白名單、secret scan
7. 你只看三樣 → approve（紅區）或 auto-merge（綠區）
8. merge → 自動部署 staging → issue 自動關閉並貼 staging 連結
```

**第 7 步「只看三樣」是關鍵**：截圖、碰了哪些路徑（有沒有越界）、verify 摘要。不看 diff 的細節。這是你作為單人維護者唯一可持續的審查方式（`10` 第 9 節）。

### 6.2 三條硬規則

1. **base-pinned**：用 PR base commit 的測試與 CI 跑 PR 的程式。沒有這條，agent 最快的路是改測試。
2. **UI proof**：沒有截圖的 PR 不合併。
3. **三次不過就停**：同一 issue 連續三次 verify 不過 → 加 `blocked`、寫下「卡在哪、試過什麼」、停手。**不准繼續磨。** 磨下去只會產生更多沒人看得懂的改動。

### 6.3 並行規則（你問「多條 issue 同時做」的實際限制）

可以，但要守三條：

| 規則 | 理由 |
|---|---|
| **同時最多 3 圈**，其中**最多 1 圈碰紅區** | 兩個都改 schema 或 migration，一定衝突 |
| **只在互不相交的路徑並行**：Marketing × Sales × UI × 文件 | 同一目錄並行等於自找 merge 衝突 |
| **一條 issue 一個乾淨 session** | 上下文越長越不準（實測：短而準的 300 token 勝過 113k）；**issue 就是那個 prompt** |

所以實際節奏是這樣，不是「二十條一齊開」：

| 階段 | 並行度 | 為何 |
|---|---|---|
| M0 前期 | 2（圍欄 × 設計） | 兩者互不相干，正好並行 |
| M0 後期 ~ M1 | 2–3 | 殼的幾塊可以並行，但 migration 與 schema 串行 |
| M2 Marketing | 2–3（後端 × UI × 內容） | 同一 app 內不同層 |
| M3 Sales | 2 | 一邊 Gateway、一邊 UI |
| 穩定後 | 4 | 只在路徑完全分開時 |

**Wave 的意義**：一個 wave 內的 issue 可以並行；wave 之間有依賴，不跳。M0 跳去做 M2，等於在沒有圍欄的地上蓋屋。

---

## 7. 待你確認（三條）

1. **接受 Forge 順延到 v1.1？**（我的建議：接受。換 Kit 有實證基礎）
2. **Sales 薄切片這樣切可以嗎？** 尤其「v1 不開 Invoice、不做 Automation」——如果你現在最痛的是開票，我就把 Invoice 換進來，把 PDF 換出去。
3. **repo 名與擁有者**：建議 `billy/company-os`（private）。給我之後我可以直接開 repo、設保護、建 labels 與 M0 那八條 issue。

# Sales App 構思總覽

版本 **v0.3** ｜ 2026-11-10 ｜ 狀態：討論稿（已對齊 `01` v0.7）  
上位文件：`01-company-os-concept.md`。凡本文件未定義的，回歸上位文件。老闆版摘要見 `00-master-plan.md`。

> **v0.3 只是對齊，不改設計**：定位改為「自家基建、不公開賣」（`00` 第 7 節）；多幣種已定案，本文件所有金額一律 `{amount, currency}`；自動化屬平台級（`01` 第 4 節）；開發邊界見 `10`。這輪沒有改動 Sales 的物件與流程。
>
> 第一版不做 Sales（見 `01` 第 14 節）；本文件是第二版之後的依據。

## v0.2 修訂摘要（四條，取代 v0.1）

1. **Sales app 的定位升級：它是銷售團隊的 ERP 前端。** 不只 CRM＋報價，還要顯示庫存、應收帳、能開發票、有審批。因為 staff 不准登入 ERPNext，他們需要的資料必須在 Company-OS 內看得到。
2. **Automation 由 AI agent 撰寫，不是人寫。** 人只提出「這件事要自動化」，code 永遠由 agent 產出。
3. **Automation 的載體：Python 為主，n8n 只做接駁層。** 理由與邊界見第 11.5 節。
4. **兩件事改成可配置項**（因為同一套 OS 會裝在不同公司）：Project 邊界模式、成本價可見性（欄位級權限，Boss 在 Portal 管）。

---

## 0. 一句話

Sales app 是銷售團隊**唯一的工作台**：客戶、庫存、應收、報價、發票、提案全部在這裡，而 ERPNext 在背後由 agent 與自動化操作，人一次都不用登入。

---

## 1. 這個 app 的真正定位

一句話講清楚分野：

> **Marketing Design 是 agent 的生產線（人只在缺料時出現）；Sales 是人的工作台（agent 在背後跑）。**

同一個 Framework、同一個 Project 物件，要同時撐得住「agent 全自動」與「人機共編」兩種模式。這是 Sales 對平台殼的第一個真實壓力測試。

| | Marketing Design | Sales |
|---|---|---|
| Staff 有 platform 帳號 | 沒有 | **有** |
| Staff 在哪工作 | 自己的工具（PS／Figma／相機） | **就在 Company-OS 裡面** |
| 背後有 ERP | 沒有 | **有，而且很深**（庫存、應收、發票） |
| 對外動作 | 無 | 發郵件、發報價、開發票、見客 |

---

## 2. 邊界：ERP 前端，但不是 ERP

**是：**
- 客戶關係的唯一檔案（Customer 的關係面向）
- 銷售流程的唯一 pipeline（Project = 一個 deal）
- 報價與提案的草稿、審閱、輸出地
- **ERP 資料的唯讀視窗**：庫存可用量、在途、交期、應收帳齡、信用額餘、發票狀態
- **有限度的 ERP 操作入口**：開發票、建報價、建 SO——但都是「下命令」，不是「填表」
- Needs 的產生地（六類，見第 9 節）
- **Automation 的管理台**（第 11 節）
- 對外發送的唯一出口（永遠由人按）

**不是：**
- 不是 ERP 的克隆。不顯示總帳、不做折舊、不管生產、不碰稅務申報。
- 不是第二個真相。所有 ERP 資料只有一條寫入通道（第 3 節）。
- 不是報表工具。沒有 BI、沒有自訂查詢。
- 不是會計的介面。會計照舊用 ERPNext 原本的 UI。

### 最重要的一條設計原則：投影，不是複製

要把 ERP 資料呈現在 OS，有兩種做法，差別很大：

| | 複製（replication） | **投影（projection）** |
|---|---|---|
| 做法 | 把 ERP 的表抄一份進 OS | UI 即時經 API 讀，或短 TTL cache |
| 適合 | 少量、需要離線／需要 join 的核心資料 | 大量、常變、只讀的資料 |
| 風險 | 兩份會漂移，越抄越多，最後變成第二個 ERP | 依賴 ERP API 延遲 |

**庫存、應收帳、發票列表一律用投影，不落地。** 只有客戶交易面向、價目表做鏡像（要離線、要 join、要搜尋）。這條決定 Sales app 會不會在半年後變成一個沒人維護的 ERP 副本。

---

## 3. ERPNext 的角色：唯一的交易層，只有一個寫入通道

選 ERPNext，但不是給人用的。它是**機器對機器的交易層**。

**為甚麼人不碰 ERPNext（四條實務理由）：**
1. 它是表單地獄。業務員每天開 40 次客戶檔，不該在 2012 年的 form 上做。
2. 它的權限模型表達不了我們要的四層（Boss／Manager／Staff／會計）＋ 欄位級控制。
3. 直接操作會繞過 Company-OS 的事件與審計，出問題查不到。
4. 它是唯一真相，更不應該讓人在上面手改。

**誰還會登入 ERPNext：** 會計、審計、稅務。刻意保留，因為財務有自己的節奏與法規要求。

### 寫入通道單一化

v0.1 說「每個物件只有一個 writer」，v0.2 收緊成：

> **每個 ERP doctype 只有一條寫入通道：ERP Gateway。**

```
             ┌──────────────────┐
UI 按鈕 ───→ │                  │
Agent ─────→ │   ERP Gateway    │ ──→ ERPNext（Frappe REST API）
Automation → │  （確定性程式）   │ ←── 事件回寫
             └──────────────────┘
```

Gateway 是一個普通後端服務，**不是 agent**。它做四件事：驗證 intent、呼叫 Frappe API、寫事件日誌、回寫 OS。

**為甚麼不讓每次點擊都經 agent：** 慢、不可預測，而且「開發票」這個按鈕不應該需要推理。Agent 負責**決定寫甚麼**（建客戶時補齊欄位、判斷該不該開授權 Needs），Gateway 負責**準確地寫**。兩者分開，錯誤才好定位。

**技術：** Frappe REST API（`/api/resource/<doctype>`）＋ API token，跑在 `worker` 容器。**永不直連 MariaDB**——繞過 ORM 會弄壞 naming series、ledger、permission，修復成本極高。

---

## 4. 三種資料形態

Sales 碰到的資料按形態分三類，各有各的規則：

| 形態 | 是甚麼 | 例子 | 規則 |
|---|---|---|---|
| **Mirror**（鏡像） | 落地副本，可搜尋、可 join、可離線 | Customer 交易面向、Product／Price | 帶 `synced_at`，UI 顯示「最後同步：3 分鐘前」；只讀 |
| **Projection**（投影） | 不落地，即時查 | 庫存可用量、在途、應收帳齡、發票列表、信用額餘 | 短 TTL（30 秒–5 分鐘）；失敗時明示讀不到，不假裝 |
| **Command**（命令） | 一個 intent，不是一份資料 | 開發票、推報價、建 SO、收款登記 | 經 Gateway 執行；成功才回寫；失敗要人看得見 |

**三條硬規則：**
1. 每個物件帶 `owner_system`，只有 owner 那側能寫。
2. 鏡像與投影都必須顯示新鮮度。**看得見的舊資料，比假裝新鮮的資料安全。**
3. Command 必須 idempotent（同一個 command id 重複送，只執行一次）。

**id 對照表**獨立一張：`(os_uuid, erp_name, entity_type)`。ERPNext 用 name（如 `CUST-00042`），OS 用 uuid。

---

## 5. 概念模型

| 上位物件 | Sales 的形態 |
|---|---|
| **Project** | **一個 deal**（或一個客戶，視公司配置，見第 13 節）；`autonomy = assisted` |
| **Create** | 報價 draft、提案、郵件草稿、會議簡報、通話記錄 |
| **Needs** | 六類（第 9 節）。Sales 是 Needs 密度最高的 app |
| **Strategy Doc** | 六份（第 10 節），Manager 與 Boss 都可寫 |
| **Preference Doc** | 每位業務員一份：慣用語氣、常用折扣幅度、談判風格、書寫長度 |
| **Asset** | Customer／Product／Case／Template（四庫） |
| **Render Job** | 報價 PDF、提案 PDF／PPTX、會議簡報、發票 PDF |
| **＋ Automation** | 第 11 節，本 app 唯一新增的物件 |

---

## 6. 畫面清單（Sales app 的實際形狀）

這份清單同時是日後 app 設計的起點。九個畫面，不多：

| 畫面 | 內容 | 誰用 |
|---|---|---|
| **Pipeline（首頁）** | 我的 deals、階段、金額、下一步、逾期紅字 | 全部 |
| **客戶檔** | 關係面向（可編輯）＋ 交易面向（讀 ERP）＋ 應收帳（投影）＋ 歷史報價／發票 | Staff＋ |
| **報價** | draft、版本、推送 ERP、PDF 預覽 | Staff＋ |
| **產品與價目** | 價目（讀 ERP）、**庫存可用量／在途／交期（投影）**、成本價（受權限） | Staff＋ |
| **發票** | 列表、狀態、開立（Command）、PDF | Staff＋（開立受權限） |
| **應收帳** | 帳齡、逾期、信用額餘、收款記錄 | Staff＋ |
| **Needs** | 我的任務、逾期、已提交 | 全部 |
| **Automation** | 清單、最後成功時間、失敗、啟用／停用 | Manager＋ |
| **策略與審批** | 六份策略文件；待批清單 | Manager／Boss |

**兩個 UX 原則：**
1. **不要把 ERP 表單搬過來做得靚一點，要把它刪到剩最低限度。** 例如開發票：staff 只需揀「哪張 SO 開票」＋確認金額與買方，其餘（稅碼、科目、naming series）系統填。這是 OS 相對 ERP 的真正價值。
2. **每個畫面都要有一個 agent 入口。**「幫我開一個永達工程的 deal」、「這張報價打八折看看」、「幫我催陳先生」。這是 staff 用 MCP 做事的方式，不需要另設聊天頁。

---

## 7. 角色與權限

五種身份。權限矩陣四層：**app ／ object ／ action ／ field**，由 Boss 在 Portal 編輯（第 13 節）。

| | Boss | Manager | Sales staff | 會計 | AI Agent |
|---|---|---|---|---|---|
| 全公司總覽（Portal） | 全部 | 自己團隊 | 自己 | 無 | 唯讀 |
| 開 Project | ✅ | ✅ | ✅ | — | ✅ |
| 看所有 deal | ✅ | 團隊 | 自己 | — | 授權範圍 |
| Customer 編輯 | ✅ | ✅ | ✅ | — | ✅ |
| **Customer 刪除** | ✅ 批核 | ❌ | ❌ | — | 提交批核 |
| Product／價目 編輯 | ✅ | ✅ | ❌ | — | ✅ 經 Gateway |
| **看成本價** | ✅ | **可配置** | **可配置（預設關）** | ✅ | 需要（算毛利） |
| 看庫存／應收 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **開發票** | ✅ | ✅ | **可配置（預設關）** | ✅ | ✅ 經 Gateway |
| Strategy Doc 編輯 | ✅ | ✅ | ❌ 只讀 | — | 讀 |
| Preference Doc | ✅ 全部 | 團隊 | ❌ 不可讀 | — | 讀 |
| Automation 啟用 | ✅ | ✅ | ❌ 只提出 | — | 撰寫 |
| ERPNext 登入 | ✅ 罕用 | ❌ | ❌ | ✅ | ✅ API |

**兩個「可配置」是 v0.2 的重點：** 成本價與開票權限不寫死，因為同一套 OS 要裝在不同公司，每間公司對「業務員能看到多少」的答案不同。預設保守（關），Boss 自己開。

---

## 8. 一個 deal 怎樣走完

```
①  線索進來（email／電話／轉介／舊客）
      Staff 講一句 → agent 開 Project，查 Customer 是否已存在
      agent 讀「目標客群」策略：值不值得跟、屬哪一類

②  首次接觸
      agent 出：需求問題清單、會議簡報、第一封跟進郵件草稿
      缺料 → Needs
      Staff review → 改 → 自己按「發送」

③  需求確認
      Staff 見完客 → 口述或打字 → agent 整理成結構化記錄
      決策者、預算、時間表、競爭對手 → 寫入 Customer 關係面向
      **看庫存可用量與交期（投影），承諾才不會爆**

④  報價
      agent 用 ERP 價目組 draft（數字一定來自 ERP，不自己算）
      折扣低於底線 → 一張「報價授權」Needs
      Staff 確認 → Command 經 Gateway → 建 Quotation → 單號回寫 → PDF 回 Create

⑤  談判
      異議 → agent 按「異議處理」策略給回應建議
      每一輪改動在 Create 留版本，不覆蓋
      **同時看應收帳：這個客有沒有逾期未收，決定要不要再放帳**

⑥  成交
      Command 建 Sales Order → 交付由 ERP 走
      Staff 可直接在 OS 開票（若權限允許）→ 只揀 SO、確認金額與買方
      開完票，應收帳即時反映

⑦  收尾
      寫成 Case（客戶名、行業、問題、方案、結果、引述）
      Case 入庫 → 可被 Marketing Design 引用
```

第 ③⑤ 步是 v0.2 新增的價值：**業務員在同一個畫面就看到庫存與應收，不需要問人、不需要等會計**。這是「不准登入 ERP」能夠成立的前提。

---

## 9. Needs：六種類型

Agent 缺的不是資料，是**身體、關係、簽名權、授權**。

| 類型 | agent 缺甚麼 | 一張 Need 要寫清楚 |
|---|---|---|
| **補資料** | 資訊 | 缺哪個欄位、為甚麼要、格式要求 |
| **打電話** | 身體 | 打給誰、要問甚麼（3–5 條）、帶回的答案格式 |
| **見面** | 身體＋關係 | 見誰、目的、要談到甚麼結果、帶甚麼材料 |
| **簽名** | 簽名權 | 哪份文件、為甚麼要簽、簽完放哪裡 |
| **報價授權** | 授權 | 原價、要求折扣、低於底線多少、客戶理由、對手報價 |
| **催辦** | 持續性 | 客戶已 N 天未回、上次接觸內容、建議下一步 |

前兩類可以自動化到最後一步；後四類永遠要人。

### Needs Email 規格（已定案）

**原則：Email 只是通知，不是工作介面。** 動作在 project page 完成，不靠回覆、不靠附件。

```
主旨：[Needs] 補「陳先生直接電話」— 永達工程年度保養報價

要做甚麼
  取得陳先生（永達工程採購主管）的手機號碼。

為甚麼
  報價單要填「送貨聯絡人」，現時只有公司總機。

用在哪裡
  報價單第 2 頁 → 聯絡人欄位；同時填入客戶檔。

何時要
  11 月 14 日（週五）前，因為當日要出報價。

所屬專案
  永達工程 — 年度保養報價（階段：需求確認）

[ 開啟任務 ]

請在專案頁完成並上載，不要直接把資料回覆到這封郵件。
```

**為甚麼不靠回覆附件：** 附件散在信箱，無法標籤、無法入庫、無法重用，下次同一個客又要再問一次。走 project page 才會觸發「AI 標籤 → 入庫 → 即時回填」那條閉環。

**頻率：** 同一 project 的多張 Needs 合併一封（最多 5 項），其餘用「另有 N 項」連結。不做每日摘要。

---

## 10. Strategy Doc：六份，Manager 與 Boss 都可寫

| 策略文件 | 內容 | agent 用在哪 |
|---|---|---|
| **目標客群** | 理想客戶輪廓、行業、規模、排除條件 | 開 project 判斷優先級 |
| **報價規則** | 分級定價、最低服務量、包含／不包含、付款條件 | 組報價 draft |
| **折扣底線** | 各線折扣上限、需授權門檻、可交換條件 | 判斷是否開授權 Needs |
| **話術** | 開場、價值主張、常見問題、不同角色切入點 | 草擬郵件、簡報、問題清單 |
| **異議處理** | 常見異議＋建議回應 | 談判階段建議 |
| **跟進節奏** | 幾天沒回要跟、跟幾次、用甚麼渠道、何時放棄 | 自動開催辦 |

**Sales 的策略與 Marketing 不同：** Marketing 是「怎樣呈現」，Sales 是「怎樣判斷」。所以 Sales 的要寫成規則，不能只寫原則。

---

## 11. Automation：agent 寫的確定性程式

**出發點（你的原話，照抄成設計原則）：**
> AI agent 其實會做錯事。所以如果一個 workflow 是必須的，人應該叫 agent 寫成 Python automation，並確保所有資訊同步。

這個想法解決了整個產品最難的問題：**如何在不加審批閘的前提下，保證關鍵流程不出錯。**

答案不是加閘，是**把重複的路徑從 agent 手上拿走，變成 code**。

### 生命週期

```
Staff／Manager 提出（一句話：「每次報價推送 ERP 後，要把單號寫回 project」）
        ↓
Agent 撰寫（Python 檔案 ＋ manifest）      ← 人不寫 code
        ↓
Agent 自我驗證：lint、unit test、dry run（不寫入，只顯示會做甚麼）
        ↓
Staff／Manager 在 app 內看一次結果，啟用
        ↓
系統按觸發條件執行 → 失敗通知人（不靜默）
        ↓
要改 → 再叫 agent 改（留 diff，可回滾）
```

### 一個 Automation 帶七樣

| 欄位 | 意思 |
|---|---|
| 名稱 | 人話，例如「報價推送後回寫單號」 |
| 觸發 | 事件（quotation.pushed）／定時（每日 09:00）／手動按鈕 |
| 讀取 | 明確列出讀哪些表、哪些欄位 |
| 寫入 | 明確列出寫哪裡（OS 內部 or ERP doctype，一律經 Gateway） |
| 失敗行為 | 重試幾次、通知誰、要不要 rollback |
| 最後成功時間 | 顯示在首頁，紅色一眼看到 |
| 程式碼 | 存 MinIO，可 diff、可回滾 |

### 三條規則

1. **一旦某條路徑有 automation，agent 不再自由執行該路徑。** 只處理它拋出的例外。這是全部價值：把「機率」換成「確定性」。
2. **必須 idempotent。** 同一件事跑兩次結果一樣。做不到不准上線。
3. **寫 ERP 一律經 Gateway。** Automation 不解釋自己的寫入邏輯，只提交 intent。

---

### 11.5 Python 還是 n8n？（直接答）

**答：Python 為主，n8n 只做接駁層。不要用 n8n 做 automation 的載體。**

| | Python | n8n |
|---|---|---|
| Agent 寫得對不對 | 可 lint、unit test、dry run、diff —— **可驗證** | JSON 圖無法測試，只能人眼睇 |
| 確定性 | 寫甚麼就是甚麼 | 節點有隱含行為、資料轉換、重試語義 |
| 版本管理 | 檔案進 git／MinIO，diff 一目了然 | 邏輯在它的 DB，靠它自己的版本功能 |
| 交易性 | 可以包一個 transaction | 沒有 transaction 概念 |
| 出錯定位 | traceback 指到行 | 逐個節點看執行記錄 |
| 維護成本 | 語言已在 stack 內 | 多一個服務、多一份備份、多一處藏邏輯 |
| 第三方接駁 | 要自己寫 OAuth／retry／rate limit | **500+ 現成節點，這是它唯一強項** |

**最關鍵是「可驗證」。** 你自己講過 agent 會做錯事——所以 agent 寫的東西必須能被檢查。Python 可以讓 agent 自己跑測試、自己 diff；n8n 的 workflow 是一坨 JSON，agent 改完之後人只能開 UI 逐個節點看，等於沒有檢查。

**判斷準則一句話：**
> **判斷與同步用 Python，純接駁用 n8n。**

具體邊界：
- 一切動到 Company-OS 或 ERPNext 的邏輯 → Python（經 Gateway）
- 接第三方（WhatsApp／Lark／Brevo／Google／支付）而需要 OAuth、retry、rate limit 時 → Python 呼叫一條 n8n webhook 當 adapter，n8n 只管接駁，不管判斷

這樣 n8n 的連接器價值保留，風險（邏輯藏在另一個系統）避開。

### 第一批 Sales automation

| Automation | 觸發 | 作用 |
|---|---|---|
| 報價推送 ERP | 確認後 | 建 Quotation、取單號、回寫、存 PDF |
| SO／Invoice 狀態同步 | 每 15 分鐘 | ERP 狀態回寫 project 階段 |
| 價目快取更新 | 每日 06:00 | 拉價目表更新鏡像 |
| 庫存快照 | 每 5 分鐘 | 更新投影的短 TTL cache（避免每次開畫面都打 ERP） |
| 逾期未回覆開跟進 | 每日 09:00 | 按「跟進節奏」開 task／Needs |
| 應收帳齡快照 | 每日 07:00 | 供 Pipeline 標示風險客戶 |
| 客戶變更推送 | Customer 儲存後 | 交易面向 push ERP，記 diff |

**觀察：七條全部是「同步」與「提醒」，沒有一條是「判斷」。** 判斷永遠留給 agent 或人——automation 只做確定的事。

---

## 12. 批核：由 Boss 逐項決定

「唔加閘」的正確講法是：**預設無閘，你逐項決定哪裡要。**

| 動作 | 預設 | 理由 |
|---|---|---|
| 刪 Customer／Case／Template | **Boss 批核** | 不可逆 |
| 折扣低於底線 | **授權**（Needs，不是表單） | 業務風險 |
| 開發票 | **可配置**（預設 staff 不可） | 有稅務後果 |
| 報價對外發送 | 不需批核，但需人按 | 動作本身就是人的 |
| 編輯 Customer／Case／Template | 不需批核 | 有版本可回滾 |
| 改價目 | 不需批核，寫入需 log | 錯價由結果發現 |
| 開 project、發 Needs | 不需批核 | 日常工作 |
| Automation 啟用 | 不需批核（Manager 可） | 但要先看 dry run |

**Boss Portal 有兩樣東西：**
1. **Approvals inbox** —— 只有真的有東西時才有內容。
2. **對任何 project 留言** —— agent 會讀留言並據此修改。這是「用嘴管」而不是「用審批管」，比任何 workflow 都輕。

---

## 13. 多公司配置（Company Profile）

因為同一套 Company-OS 會裝在不同公司，有些東西不能寫死。第一版只需五項：

| 配置 | 選項 | 影響 |
|---|---|---|
| **Project 邊界模式** | 一個 deal 一個 project ／ 一個客戶一個 project（內含多 deal） | Pipeline 結構、Needs 歸屬、報價歸屬 |
| **成本價可見性** | 角色 × 是否可見（Boss 可改） | 議價行為、毛利透明度 |
| **發票開立權限** | 角色 × 是否可開 | 財務控制 |
| **批核政策** | per-object per-action | 第 12 節那張表 |
| **部門 app 啟用** | 哪些 app 註冊到這個 instance | 平台殼 |

**這一節屬於 Framework，不屬於 Sales。** 寫在這裡只為標記需求；實際落在下一步的 Framework 文件。

---

## 14. 與 Company-OS 的接口

**MCP 工具（給 agent）：**
```
sales.project.create / get / update / list
sales.customer.get / upsert
sales.product.list                        （鏡像，唯讀）
sales.stock.check                         （投影，即時）
sales.ar.get                              （投影，應收帳）
sales.quotation.draft / push              （push 經 Gateway）
sales.invoice.issue                       （Command，經 Gateway）
sales.need.create / list / absorb
sales.strategy.list / get
sales.preference.get
sales.automation.propose / run
sales.case.create
```

**向 Portal 交出的狀態（唯一對外介面）：**
```
projects:  [ {id, name, customer, stage, amount, owner, next_action, due} ]
needs:     [ {id, project, type, title, assignee, due, state} ]
approvals: [ {id, type, object, requester, since} ]
schedule:  [ {automation, next_run, last_status} ]
```
Portal 不需要、也不可以讀 Sales 的內部資料表——這是平台殼不破的關鍵。

**事件（寫入全域事件日誌）：**
```
sales.project.created / stage_changed / won / lost
sales.quotation.pushed / erp_number_assigned
sales.invoice.issued / erp_invoice_number
sales.command.failed                      ← 失敗一定要有事件
sales.need.raised / fulfilled / absorbed
sales.customer.synced_to_erp
sales.automation.enabled / failed
```

---

## 15. 未決定

1. **庫存與應收帳的資料量與更新頻率**：直接查 ERP 夠快，還是必須做快照？（直接影響第 4 節投影的實現）
2. **開票的稅務細節**：OS 完全不碰稅碼，還是要顯示稅額供人核對？
3. **Automation 的執行環境**：純標準庫沙箱？可 import 第三方？同 worker 還是獨立容器？
4. **Automation 誰可以停用**：提出者、Manager、還是只有 Boss？
5. **Case 要不要自動流入 Marketing Design**：第一版建議人手。
6. **線上收款**：要不要在 OS 顯示收款連結／對帳狀態？（涉及支付網關）
7. **ERPNext 那邊有人手改資料時的處理**：owner 是 ERP，但關係面向在 OS，方向要定。
8. **Preference Doc 在 Sales 的副作用**：業務員的偏好（談判風格、折扣慣性）會不會變成「這個人被定型」？

---

## 16. 下一步

**v0.3 更新**：開工次序已改為 **開發憲章（`10`）→ Framework → Boss Portal ＋ Marketing Design 並行**（`01` 第 14 節）。Sales 排在第二版，因為它是第一個「人機共編」的 app，要用第一版的框架去壓測，而不是同時開發。

Sales 這一輪帶出四件 Framework 必須先回答的事（**全部已定案，2026-11-10**）：

1. **Render 升為平台服務**（報價 PDF、提案、發票 PDF 都要用，不是 Marketing 私有）。
2. **Automation 升為平台級物件**（Python 撰寫、MinIO 存放、worker 執行、可 diff 可回滾）。✅ 已定
3. **Company Profile 入 Framework**（Project 邊界、成本價可見性、批核政策、app 啟用）。
4. **權限做到欄位級**，Boss 可在 Portal 編輯 —— 這條直接決定資料模型的形狀。

**Project 的兩種模式也定了：** Project 帶 `autonomy` 欄位（`auto`／`assisted`／`manual`），Framework 只負責存與傳，**行為由部門 app 決定**。Marketing 全部 `auto`，Sales 全部 `assisted`，同一套 schema。✅ 已定

**App Registry 合約：嚴格但極窄。** 只強制四個 shape —— `projects`／`needs`／`approvals`／`schedule`，四者之外不規定、不檢查、不顯示。✅ 已定

**ERP 連接不外放：** 只給真正需要的部門 app——**Sales、Operations、Finance 三個**（v0.3 修正：`01` 第 3 節已改為三個，因為營運與財務已拆成兩個 app）。Marketing Design 與 HR 不接 ERP；需要交易資料時由自己的 agent 經 MCP 呼叫對應 app 的唯讀工具。**但每個 app 仍要註冊自己可以用哪些 doctype**，這是 Gateway 的分權依據。連帶鎖定：**部門 app 之間不共享資料表，跨 app 存取一律經 MCP＋權限判斷**。✅ 已定

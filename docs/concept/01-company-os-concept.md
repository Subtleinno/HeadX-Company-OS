# Company-OS 構思總覽

版本 v0.8 ｜ 2026-11-10 ｜ 狀態：討論稿（未定稿）  
用途：這是整套產品的「單一真相文件」。之後的 Framework 設計、Boss Portal、Marketing Design app，都以這份為依據；**任何改動先改這裡，再改下面**，否則各文件會各說各話而 agent 會照着舊的做。

**如果你只想讀一份**：讀 `00-master-plan.md`（老闆版，無術語）。這份是給「要查某個決定為何這樣定」時用的。**要開工**：讀 `11-delivery-plan.md`（v1 範圍、UI 時序、GitHub 設定、issue 迴路）。

> v0.8 改動（2026-11-10）：第一版範圍再修正——**Forge 順延到 v1.1**，第一版改為「殼＋Portal＋Marketing＋Sales 薄切片」（理由見第 14 節）；Boss Portal 明確歸屬平台殼、不由 Forge 生成；新增 `11-delivery-plan.md`。
>
> v0.7 改動（2026-11-10）：新增 `00-master-plan.md` 作為入口與索引；頂部逐版 changelog 搬去 `archive/changelog-01.md`（太長，蓋過正文）；§13 未決定清單收窄至真正未定的項目。  
> 改動記錄 v0.2–v0.6 見 `archive/changelog-01.md`。

---

## 0. 一句話

Company-OS 是一間公司運作的唯一底座：一個 Docker、一個 Postgres、一個 MinIO，把公司的**策略、記憶、產出**集中在一處，讓 AI agent 同少量人類員工在同一個系統內各自做最擅長的部分，而老闆只落策略、睇全貌。

---

## 1. 起點：為甚麼不是 ERP

傳統 ERP 的隱含假設是「人是主要執行者，軟件是記錄工具」。所有設計都由此而來：表單、審批流、權限樹、月結。

Company-OS 的假設相反：

> **agent 是主要執行者，人是判斷者與補位者。**

由此推出三條，所有設計決定都要通過這三條：

1. **軟件要為 agent 而設。** MCP／API 是一等介面，UI 是給人看結果同補位用的。不是「有 API 的 ERP」，是「有 UI 的 agent 平台」。
2. **人只在 agent 做唔到的地方出現。** 所以「做唔到」必須是一條正式、可見、可追的流程（Needs），而不是錯誤處理或靜默降級。
3. **不需要審批流程。** 判斷交給人看成品：不夠好就叫 agent 再做一次。加閘只會令系統變慢、變複雜，而判斷質素不會因此提高。

### 1.1 定位：這是基建，不是產品（v0.6）

2026-11-10 定調：**不公開賣、按客戶客製；而現在其實只是要開更多生意自己用。** 這不是一個 SaaS，是你用來開公司的基建。

換句話說：**第一個客戶是你自己的生意。** 日後若有其他公司想用，做法是「拿這套東西去客製部署」，不是「開一個帳號給它們」——這個分別決定了很多取捨（見下表）。

| 可以放掉 | 為什麼 |
|---|---|
| 多租戶 SaaS 架構、向後兼容承諾、計費分級、App 市集、行銷級文檔 | 沒有外部開發者、沒有公開 API 合約、不賣 |

| 反而收緊 | 為什麼 |
|---|---|
| **資料不可失** | 這是你生意的唯一記錄；備份與還原比任何 bug 重要 |
| **變體管理** | 一旦第二間公司用，一個 codebase 就變成 N 個部署 |
| **agent 的寫入邊界** | 只有一個人有權改一切，所以「什麼不可改」必須是機器事實，不是文件願望 |

三條的落地全部在 `10-build-charter.md`：三色領土（紅／黃／綠）、六個配方、六級驗證階梯、**config ⊂ overlay ⊂ core** 的變體三層。

一句話：**「無 bug」不是可承諾的目標**——微軟出貨級軟件也有約 0.5 個缺陷／千行，DORA 2025 的團隊 change failure rate 眾數是 8–16%。可承諾的是三句：**15 分鐘內回滾；RPO ≤ 1 小時、RTO ≤ 4 小時且每季實測；單一 app 故障不影響其他 app 的讀取。**

---

## 2. 設計原則（七條，不可違反）

| # | 原則                        | 意思                                              | 反面（做錯會變成）                 |
| - | ------------------------- | ----------------------------------------------- | ------------------------- |
| 1 | **預設無閘**                   | 預設不設 approval gate／validator；**由 Boss 逐項決定哪一項要批**（是預設值，不是架構禁令） | 傳統 workflow 系統，agent 卡在半途 |
| 2 | **一個 app 一個工作台**            | 一個 app = 同一批人、同一個節奏、同一組核心物件；清單對一間公司固定（書館沒有的由 Forge 生成，見原則 7），Boss 管註冊同升級 | 無止境增生的插件市場，或把兩種節奏塞進一個 app |
| 3 | **策略由 Boss 寫，agent 只揀同跟** | 策略不是 AI 生成，是老闆手動加入                              | agent 自己發明方向，越走越遠         |
| 4 | **成品留在出身的 app**           | Marketing Design 的產出留在其 Create，不回流中央            | 中央 DAM，變成另一個要維護的倉         |
| 5 | **平台殼只做四件事**              | 切換、身份、註冊、事件                                     | 一個越長越大的 monolith          |
| 6 | **可配置優於寫死**                 | 同一套 OS 會裝在不同公司；任何業務語義（計量方式、Project 邊界、批核項、科目、職級）都要是 config，不是 enum | 一套只賣得一間公司的定製品 |
| 7 | **app 由 spec 編譯，不由 agent 自由創作** | 缺少的部門 app 由 Boss 一句話起、Forge 編譯成 App Spec；生成物只能寫 app 層，改不到框架 | 無止境增生、沒人收的孤兒 app |

第 5 條值得展開：平台殼（Frame）**不是**資料總管。它不知道一個 marketing project 裡面有幾張圖，它只知道「Marketing Design app 存在、健康、有幾個活躍 project、有幾個未完成 Needs」。所有業務資料的擁有者永遠是部門 app。

第 6 條是 2026-11-10 新增的，理由很直接：**你不要一套只為這間公司寫死的系統。** 因此「三種計量模式」「兩個 Project 邊界」「幾個批核項」這些看似具體的設計，全部要變成 `Company Profile` 內可增刪的配置。部門 app 的程式碼只有一份，行為按 Profile 不同。

第 7 條回答了第 6 條留下的最後一個洞：**如果新公司需要一個原始碼沒有的部門 app 怎麼辦？** 答案是 App Forge（`09`）——不必預先寫好所有 app，也不必改框架。Boss 講一句 → Forge 用變化軸問清問題 → 產出一份 **App Spec** → 由 App Kit 編譯成可註冊的 app。

這條看似令框架變重，實際是變薄：**加一個部門不是改框架，是加一份 spec。** 代價是 Forge 必須嚴格受限——它只能寫 app 層，六條不變量、Registry contract、fitness function 全部在它的寫入範圍之外（`09` 第 5 節）。


---

## 3. 邊界：是甚麼／不是甚麼

**是：**

- **一個 Site 一個 instance、一個 Docker**；一個 Tenant（法律實體）可以有多個 Site，一個 Group 可以有多個 Tenant（見第 11 節）
- 同一個 instance 內可以管多個品牌（各自 namespace 隔離）
- 全公司專案的唯一入口：agent 經 MCP 打進來，由平台路由到正確的部門 app
- 全公司狀態的唯一視窗：Boss Portal 看 projects／Needs／scheduling；多據點時由 Hub 匯集投影
- 策略文件的存放處與版本來源
- 公司記憶：Postgres（結構化狀態與事件）＋ MinIO（檔案與產出）

**不是：**

- 不是 ERP 引擎。不做會計憑證、不做法定報表、不做稅務。**但可以是 ERP 的前端**（見第 11 節）——人可以只在 Company-OS 工作，ERPNext 由 agent 與自動化操作。
- 不是 DAM。沒有一個中央素材庫——素材屬於各部門 app。
- 不是 workflow engine。預設沒有審批鏈；只有 Boss 明確開啟的少數動作才有批核。
- 不是 agent runtime。Company-OS **不包** AI agent；agent 是它的外部使用者，同人一樣經介面接入。
- 不是報表工具。Boss Portal 只顯示狀態，不生成分析。
- **不是 marketplace／雙邊平台。** 目標是「自己做生意的公司」，不是「撮合買賣雙方的平台」。平台需要 `Party` 抽象（買方與賣方都不是「我的客」），會牽動 Sales 全部。**明確不做**（見 `08` 第 5 節）。
- **但做渠道接駁。** WooCommerce／Shopify 這類平台是 `Commerce` app 的 **Channel Adapter**，不是要我們自建前台。商品與價格 master 在 ERPNext（推送渠道）、庫存 master 在 Operations（推送可售量）、訂單由渠道原生落 OS 做投影並觸發履行、客戶在渠道首次下單時建立映射（渠道只是 acquisition source）。**同一條原則第四次應用：master 只有一個，其餘是投影或命令。** 接駁 Shopify 不等於做 marketplace——我們沒有買方與賣方兩個 party，只有「我的貨在別人的貨架上」。

### App 圖書館（三層）

App 清單不是固定的五個，是一個**圖書館**；每間公司按業務開啟。完整說明見 `06-app-library.md`。

| 層 | App |
|---|---|
| **Tier 1｜幾乎每間公司都要** | Sales、Finance、HR、Marketing |
| **Tier 2｜視業務開啟** | Operations、Support（客服）、Booking（預約／套票）、Commerce（電商）、Product Studio（設計／模具）、Logistics（貨運） |
| **Tier 3｜特殊商業模式** | Franchise（加盟管理） |

已寫文件：Marketing（`01` 內）、Sales（`02`）、Operations（`03`）、Finance（`04`）、HR（`05`）。其餘在 `06` 有定位與邊界，未開文件。

**五個已寫的 app 已足夠驗證平台殼是否夠薄**：三種 autonomy 以外的差異、五種不同的 Needs 密度、兩個不接 ERP 的 app（Marketing 與 HR 只經 MCP 取數）。

**但圖書館只是起點，不是上限。** 圖書館沒有的部門 app，由 **App Forge** 生出來（`09`）：Boss 一句話 → Probe 問清 → App Spec → 由 App Kit 編譯 → 註冊。這條令「支援所有生意」由「預先寫好所有 app」變成「支援生成」——而生成物仍然要交出 Registry 四 shape，所以 Boss Portal 不會因為 app 是生成的就顯示不到。

### 組織層級：Site / Tenant / Group

原本寫「一間公司一個 instance」，對多據點不夠。改成三層（詳見 `07-group-tenant-site.md`）：

| 層 | 是甚麼 | 誰擁有資料 |
|---|---|---|
| **Site** | 一個地點，一個 instance，斷網仍可運作 | 庫存、預約、排班、門市現金、Project |
| **Tenant** | 一個法律實體 | 客戶、產品與價目、科目表、員工、薪酬 |
| **Group** | 老闆的持有結構（可跨公司、可加盟） | 只有投影與事件，**永不存 master** |

**一條硬規則：事件永遠向上流，master 永遠在最低那一層。** Hub 只收摘要，不看明細；Hub 死了各 site 照常運作。

### 跨 app 存取：經 MCP，不經共享資料表

部門 app 之間**不共享資料表**。Marketing 的 agent 想知道某個客戶的成交案例，不是去讀 Sales 的 DB，而是呼叫 Sales app 已註冊的 MCP 唯讀工具，並在事件日誌留痕。

這條保住兩樣東西：
1. **資料擁有者永遠是部門 app。** 沒有中央表，就沒有「順手 join 一下」的誘惑。
2. **權限按「請求者是誰」判斷，不是按「連了哪個資料庫」。** 同一個 Sales 工具，Sales 的 agent 拿到全部，Marketing 的 agent 只拿到唯讀摘要。

這也解釋了為甚麼 Marketing Design **不需要接 ERP**：它需要的任何銷售資訊，都經 agent 問 Sales 就有。ERP 連接只給真正需要的部門 app——目前是 **Sales、營運、財務** 三個（2026-11-10 更新：財務與營運已拆成兩個 app）。因為有三個，ERP Gateway 實際上會成為共用的平台服務，但**每個 app 仍要註冊自己可以用哪些 doctype**。

---

## 4. 概念模型：十二個物件

整份構思壓縮成十二個物件。之後 Framework 的 schema 就是這張表。

| 物件                 | 一句定義                                                                       | 擁有者                      | 生命週期                     |
| ------------------ | -------------------------------------------------------------------------- | ------------------------ | ------------------------ |
| **Platform Shell** | 外殼：app 切換、身份、註冊表、事件日誌                                                      | 公司                       | 永久                       |
| **Department App** | 一個部門的完整工作空間，含自己的資料、UI、專案                                                   | 該部門（boss 管註冊／升級）         | 註冊 → 上線 → 升級 → 退役        |
| **App Spec**       | 一個部門 app 的規格：物件與擁有權、`autonomy`、Registry 四 shape、能力宣告、保留政策、幣種、語言、不做的範圍。**app 由它編譯出來**（`09`） | Boss（Forge 起草）           | 起草 → 編譯 → 註冊 → 修訂（產出 migration） |
| **Project**        | 一件工作。由 staff 一句需求開始，agent 建立；帶 `autonomy` 欄位（`auto`／`assisted`／`manual`），**行為由部門 app 決定** | 部門 app                   | 草稿 → 進行中 → 完成／擱置         |
| **Create**         | 部門 app 內存放與編輯產出的地方（CRUD）；Project 的產出歸屬                                     | 部門 app                   | 隨 Project                |
| **Needs**          | agent 做唔到時開的工單，指名要甚麼、為哪個 project、哪個 placeholder                            | 部門 app（被指派給 staff）       | 開立 → 進行 → 已上載 → 已吸收 → 關閉 |
| **Strategy Doc**   | 老闆手寫的策略／SOP 文件；多份、多點分佈，agent 按任務揀                                          | Boss                     | 新增 → 修訂（保留版本）            |
| **Preference Doc** | 每位員工的偏好檔；Boss 可讀寫、agent 可讀、Staff 不可讀寫                                      | Boss                     | 持續累積                     |
| **Asset**          | 四類：Brand（identity／template）、Knowledge（文件）、Material（相／片／聲）、Diagram Template | 部門 app                   | 入庫 → 標籤 → 檢索 → 引用        |
| **Render Job**     | 一次 render 請求與結果（Hyperframes 或 derived 管線）                                        | 部門 app ＋ Render Provider | 排隊 → 執行 → 完成／失敗          |
| **Automation**     | **由 agent 撰寫、可 diff 可回滾的 Python 程式**；把重複路徑從 agent 手上拿走，換成確定性                        | 部門 app（平台級能力）            | 提出 → 撰寫 → dry run → 啟用 → 失敗／修訂 |
| **Company Profile** | 這間公司的配置：Project 邊界模式、權限矩陣、批核政策、啟用哪些 app                                          | Boss                     | 安裝時設定，隨時可改                |

> 後兩個是 Sales 一輪新增的。`Automation` **已定為平台級**（Marketing 想自動發佈、Operation 想自動對帳，同一件事）；`Company Profile` 存在的理由很簡單：同一套 OS 會裝在不同公司，有些東西不能寫死。
>
> `App Spec` 是 v0.5 新增的第 12 個。它與 `Department App` 的關係，正如 `HTML composition` 與 render 成品的關係：**前者是真相，後者是導出物。** 這個同構不是巧合，它是全份設計裡唯一被用了兩次的心智模型。

> 命名註：`Needs` 這個名在 2026 年已至少被三個產品使用（aiagent.app、SEOmatic、AgentsRoom）。功能照舊，名字待定。

### 已定的三條（2026-11-10）

1. **`autonomy` 是 Project 的欄位，行為由部門 app 決定。** Framework 只負責存與傳，不規定 `assisted` 應該長成怎樣。Marketing 全部 `auto`，Sales 全部 `assisted`，同一個 schema。
2. **App Registry 合約：嚴格但極窄。** 只強制四個 shape —— `projects`／`needs`／`approvals`／`schedule`。四者之外不規定、不檢查、不顯示。寧願 Portal 顯示得少，也不要每個新 app 都要寫一份厚重合約。
3. **Automation 是平台級物件。** 由 agent 撰寫、存 MinIO、在 worker 執行、可 diff 可回滾。任何部門 app 都可以有自己的 automation，共用同一個 runtime。

### 已定的框架邊界（v0.4，壓力測試後）

做過八間不同公司的壓力測試（`08`），十二個變化軸裡只有三條會逼框架改，其餘全部由 Company Profile 或部門 app 吸收。所以框架**只認六條不變量**：

物件與擁有權、三層組織、`autonomy`、Needs 兩型、Registry 四 shape、事件格式。

這六條之外，任何「我們公司是這樣做的」都不進框架。這條紀律決定三年後它是薄殼還是一團。

三條 breaking 的決定（**v0.5：三條全部定案**）：

1. **多幣種現在就做（已定）。** `Money = {amount, currency}`。每個金額欄位都帶幣種，Tenant 有 `base_currency`，匯率要版本化。這是唯一「不做就一定重寫」的一項。
2. **監管保留（retention）由框架強制（已定）。** 物件可帶保留政策（年限、可否刪、可否改）。病歷、財務憑證、合約不可被 UI 直接刪——這一條與「Boss 可以刪」衝突，所以必須在框架層寫死，不能交給 app 自己記。
3. **不做 marketplace／雙邊平台（已定），但做渠道接駁（v0.5 補充）。** WooCommerce／Shopify 是 `Commerce` 的 Channel Adapter，四個 master 各自只有一個（見第 3 節）。

另外四條（時間性收入、合約為中心、庫存所有權、專案進度計價）是 additive，**只留位不實作**。

---

## 5. 角色與權限

四種角色。第四種（`External`）是 2026-11-10 新增的，範圍刻意極窄。

|                        | Boss      | Staff                 | AI Agent           | External（外判） |
| ---------------------- | --------- | --------------------- | ------------------ | -------- |
| **Boss Portal**（全公司總覽） | 全部可見      | 只見自己的 Needs 與 project | 唯讀自己的 project 狀態   | 不可見 |
| **部門 app**             | 全部可見      | 自己部門                  | 經 MCP，按 project 授權 | 不可見（只有 Needs inbox） |
| **Strategy Doc**       | 讀＋寫       | 讀（在其部門 app 內）         | 讀                  | 只讀被引用的段落 |
| **Preference Doc**     | 讀＋寫（全部員工） | **不可讀、不可寫**           | 讀（只讀當前任務相關那位）      | 不可讀 |
| **Needs**              | 看全部       | 看＋做＋上載                | 開立＋驗收（吸收結果）        | 只看指派給自己的 |
| **App Registry**       | 註冊／升級／退役  | 無                     | 無                  | 無 |

**為甚麼要有 `External`：** 財務先接受外判會計師，他們要做的是「判斷」，不是「用系統」。如果把他當 Staff 拉進來，就要給部門 app 權限、要教他用整套 OS，adoption 一定失敗。他只應該見到「今日有三筆要你判斷」，附單據與附件，按確認或留言，然後離開。同一個角色日後可給外判設計、外判律師、外判 IT。

**External 的三條硬限制：** 只經 magic link／限定帳號進入、只有 Needs inbox 一個畫面、離開任務即失去存取。


兩點要寫進文件，不是改設計：

- Preference doc 的隱藏 ACL 是刻意選擇，理由是避免員工「為 AI 寫履歷」而扭曲真實工作習慣。業界主流相反（阿里雲、mem0 都主張 user-owned／透明），內部文件要記低這個 trade-off。
- Boss 對部門 app 的權力是「註冊與升級」，不是「管 project」。老闆可以看任何 project，但不在 Portal 內指派、改期、改狀態。
- **權限不止 role × object，要落到欄位。** 例如成本價：Boss 在 Portal 決定哪個角色看得到。實際權限矩陣會隨部門 app 增加而變闊，但結構固定四層：app ／ object ／ action ／ field。

---

## 6. 一個 request 怎樣走完

起點永遠一樣：**staff 對 agent 講一句人話**（例：「做一個介紹品牌的 IG Carousel」）。

**agent 依次做六件事：**

1. 經 MCP 接入 Company-OS，判斷屬於哪個部門 → 路由到 Marketing Design app
2. 在該 app 開一個 Project
3. **揀策略**：按任務性質，從多份策略文件中揀出最合適那幾份（不是一份），讀完之後才知道「這次要做甚麼、不做甚麼」
4. **四庫取材**：按策略指示去 Brand（identity／template）、Knowledge（文件）、Material（相／片）、Diagram Template 揀料
5. **組 HTML brief**：把所有選中的東西編譯成一份 HTML composition（Hyperframes 的輸入格式），包含 brand tokens、素材引用、時間軸或分頁、文案
6. **判斷齊料與否** → 兩條分支

**分支 A：齊料**

```
組好 HTML brief → 直接叫 Hyperframes render → 成品存入該 app 的 Create
→ Staff 開 Create 睇 → 可以收貨，或者叫 agent 再改（回到第 3 步，不是重新開始）
```

Project 狀態：進行中 → 完成。成品留在 Create，**不回流任何地方**。

**分支 B：缺料**

```
agent 知道自己缺甚麼 → 開 Needs（一張或多張）放入 project
→ Project 存為「半成品」（HTML brief 已存在，只是有 placeholder 未填）
→ Staff 收到需求 → 製作 → 上載
→ agent 自動標籤＋描述 → 存入 Material 庫（日後可重用）＋ 即時填入本 project 的 placeholder
→ 所有 Needs 關閉 → 回到分支 A 的 render
```

關鍵：**分支 B 不是失敗，是正常路徑。** 半成品是一個合法狀態，不是錯誤狀態。

**兩個分支共用同一個物件**：HTML composition。半成品 = 帶 placeholder 的 composition；成品 = placeholder 填好之後 render 出來的結果。不需要兩套資料結構，也不需要「匯入」步驟。

---

## 7. Needs 閉環（整個產品最值錢的部分）

為甚麼它值錢：業界多數假設 agent 要嘛做完、要嘛靜靜降級。把「做唔到」變成可見、可派工、可沉澱成重用資產的正式流程，這是真正的人機協作，而且最難被抄。

### 兩型（2026-11-10 新增）

起初只想到「人要交東西」，但 Sales 的報價授權、財務的會計判斷、合約簽名都不是交東西。所以 Needs 分兩型：

| 型 | 人要做的 | 回傳 | 例 |
|---|---|---|---|
| **`deliverable`** | 製作並上載 | 檔案 | 拍一組產品相、點貨拍照、交收據 |
| **`decision`** | 判斷／授權／簽名 | 一個決定（同意／改／否）＋ 一句理由 | 對帳例外怎麼配、這筆攤銷分幾年、報價可否低於底線、簽這份合約 |

**Decision 型的鐵律：agent 必須先做一次。** 不允許開一張空白的「你自己決定」——要附上建議、依據（哪份合約／哪條策略）、以及「同意就按」。人做複核，不做輸入。這條令 decision 型不會變成「把工作推回給人」。

**一張 Needs 必須帶七樣：**

1. 屬於哪個 Project
2. **型**（`deliverable`／`decision`）與對應位置：deliverable 對 placeholder；decision 對要判斷的那一件事
3. 要甚麼：deliverable 寫類型、尺寸、比例、格式、數量；decision 寫要判斷的是甚麼、可選項、agent 的建議
4. 為甚麼要（引用哪份策略的哪一段，讓 staff 明白脈絡，不是盲做）
5. 何時要（due）
6. 指派給誰（可以是 Staff，也可以是 `External`）
7. 狀態與歷史（誰開、誰做、何時回應、agent 何時吸收）

**狀態流轉：**

```
deliverable：開立 → 待認領 → 進行中 → 已上載 → 已吸收 → 關閉
                              ↘ 需要補件（回到進行中）
decision  ：開立 → 待認領 → 已裁決 → 已吸收 → 關閉
                              ↘ 需要更多資料（agent 補完再回「待認領」）
```

「已吸收」是關鍵一步，兩型都一樣：**上載或按確認都不等於完成**。deliverable 要等 agent 標籤、入庫、填回 project；decision 要等 agent 把決定落實成動作（改分錄、放行報價、更新策略解讀），才算閉環。

**上載之後 agent 做三件事（deliverable 型）：**

- 產生結構化 metadata：類型、內容描述、風格、可用場景、來源 project
- 存入 Material 庫，成為日後檢索的候選
- 填回本 project 的 placeholder，Project 從半成品變可 render

**裁決之後 agent 做三件事（decision 型）：**

- 把決定落成動作（可能是一條 Command 去 ERP、一次 render、一個欄位改動）
- 記錄「agent 原本建議甚麼、人改成甚麼、理由」——這是日後校準的原料
- 若理由顯示 agent 的判斷原則有偏差，寫回該部門的 Strategy Doc 草稿，等 Boss 一眼睇過

最後一條是決定型 Needs 的真正價值：**它不只是完成一件工作，它逐步把人腦裡的判斷變成文件。** 但要留意，這與「策略由 Boss 手寫」不衝突——agent 只出草稿，Boss 決定收不收。

**刻意不做：** 不上載後等人覆核標籤、不設多層驗收。標籤錯，下次檢索就會揀錯料，agent 產出變差，staff 自然會叫它再做——由結果反饋，不由流程攔截。

---

## 8. 策略層：多點分佈，不是單一 config

這裡最容易做錯。策略不是一份「公司策略」放在總部，而是**散落在系統很多位置的多份文件**，同一個 Marketing Design app 內已經有多處：

| 層   | 例子                  | 管甚麼               |
| --- | ------------------- | ----------------- |
| 品牌層 | 「Moonic 品牌語氣指引」     | 用色、字體、語氣、禁用詞      |
| 渠道層 | 「IG Carousel 製作規範」  | 尺寸、頁數、首頁規則、CTA 位置 |
| 格式層 | 「簡報頁編排規則」           | 版面、資訊密度           |
| 步驟層 | 「品牌介紹類內容的敘事順序」      | 先講甚麼、後講甚麼         |
| 範例層 | 「上次這個 campaign 的做法」 | 具體可模仿的例子          |

**agent 揀策略是一個 routing 問題，不是一次 RAG。** 它要先判斷任務類型，再逐層揀：品牌層幾乎必讀，渠道層看產出格式，步驟層看任務目的。揀錯會直接反映在成品上。

**Boss 只做兩件事：加、改。** 沒有審批流、沒有發布流程、沒有生效日。加了就即時生效，agent 下次就會揀到。

**唯一保留（零 UX 成本）：** 每個 Project 靜靜記低用了哪幾份策略、哪個版本。不顯示、不彈窗、不阻塞。目的是幾個月後老闆問「為甚麼這個產出是這樣」時，有得查。

---

## 9. Preference Doc

**是甚麼：** 每位員工一份，記錄這位員工的工作偏好——喜歡哪種排版、慣用哪種語氣、通常怎樣改 agent 的初稿、不接受甚麼。

**為甚麼要：** agent 服務同一個人久了，應該越做越接近他想要的，而不是每次都由零開始。

**ACL（已定）：** Boss 可讀可寫 ／ agent 可讀 ／ Staff 不可讀不可寫。

**存放在哪：** Company-OS 本體（不是部門 app），與 Staff 身份綁定。因為偏好跨部門有效。

**怎麼學（未定，兩條路，待選）：**

- (a) Boss 手動寫——最簡單，零風險，但落後於事實
- (b) agent 由歷次「再做一次」的修改歸納成草稿，Boss 一眼睇過就生效——自動，但需要 agent 有能力分辨「這次是特例」還是「這個人一向如此」

兩者可以並存。無論哪條，都不加審批流程，Boss 看過就算。

---

## 10. 成品：native 與 derived（範圍控制的關鍵）

Hyperframes（HeyGen 開源版）的實際輸出能力，官方文件只列：**MP4／MOV／WebM／GIF／PNG sequence／HLS**。沒有 PDF。

因此「最終產出」必須分兩層，否則 P0 會爆：

| 層           | 內容                                                                   | 由誰產出                                        |
| ----------- | -------------------------------------------------------------------- | ------------------------------------------- |
| **Native**  | 動態影片（Reels／Shorts／廣告片）、靜態視覺（IG Carousel 逐頁 PNG、海報、Banner、封面）、GIF、HLS | Hyperframes 直接 render                       |
| **Derived** | PDF、可編輯簡報、報價單／提案附件、Icon 素材包、品牌規範文件                                   | 由 PNG sequence／HTML 再轉一層（外掛 renderer 或自家封裝） |

**第一版只做 Native。** Derived 是 P1，因為它需要另一條 render 管線，與 Hyperframes 無關。

> 注意：`asset library`、`brand assets`、`version management`、`approvals`、`social-media output`、`PDF 輸出` 這些在 Hyperframes 上大多**沒有官方依據**（部分只是 roadmap 或語義不同）。不要假設它會幫我們做，這些是 Company-OS 與部門 app 自己的責任。

---

## 11. 技術底座

**一個 Site = 一個 docker compose，五個服務：**

| 服務               | 作用                                                 |
| ---------------- | -------------------------------------------------- |
| `postgres`       | 結構化狀態：專案、Needs、策略、偏好、事件、註冊表                        |
| `minio`          | 檔案：Brand assets、Knowledge docs、Materials、render 輸出 |
| `apps/platform` | 平台殼：身份、路由、註冊表、事件；同時提供 MCP server 與 HTTP API        |
| `company-os-web` | Boss Portal 與部門 app 的前端外殼（同一 shell，按角色／app 切換）     |
| `worker`         | 佇列：render job、標籤生成、索引建立                            |

**多據點時多兩個東西（選配，見 `07`）：**

| 服務 | 作用 |
|---|---|
| `hub` | 收各 site 的投影與事件、下發集團指令；**不存 master** |
| `sync` | site ↔ hub 的事件推送與主資料唯讀副本（outbox 模式） |

單店公司不需要 `hub`／`sync`；兩個容器由 Company Profile 決定是否啟動。

**兩個介面，同一套權限：**

- **MCP**：給 AI agent。工具按部門 app 分組，agent 只能呼叫被授權的 app。
- **HTTP／Web**：給人。Boss Portal 與部門 app 共用同一個前端外殼。

**Hyperframes 兩種部署（已定，兩者都要支援）：**

1. 同一部機的 Docker（低延遲、單機故障風險）
2. 同一網絡的另一部機（可獨立升級、可加 GPU）

兩者用**同一個 HTTP client**，只換 base URL。官方 producer server 提供 `POST /render`、`POST /render/stream`、`GET /render/queue`——最後一個直接餵 Boss Portal 的 scheduling。

**Postgres 與 MinIO 兩邊都要版本。** 資料版本用事件日誌（append-only），檔案版本用 object key 前綴。這是「可回滾」的唯一基礎。

**備份是這個底座的第一優先，不是附帶功能。** 理由與做法見 `10` 第 2 節：企業系統出事的主因排序是「權限與設定改錯 > 備份存在但還原不到 > migration 半途失敗 > 硬件 > 純邏輯 bug」，而大部分人的時間全押在最後一項。所以底座的驗收標準不是「備份有跑」，而是**每季真的做一次還原演練**（RPO ≤ 1 小時、RTO ≤ 4 小時）。

---

## 12. 同現有方案的分別

2026 年「AI 公司 OS」不是空白：GitHub 上有 10 萬星級的 paperclip 與 open-design、8 萬星的 Hyperframes、2 萬星的 kortix-ai/CompanyOS；商業有 aiagent.app、the-company-os.com。零件全部有人做。

分別在於**四條刻意的取捨**：

| 取捨              | 業界做法                  | 我們                    |
| --------------- | --------------------- | --------------------- |
| Boss Portal 的角色 | 主動 manage、指派、override | **只讀總覽**，不碰 project   |
| 成品歸屬            | 中央 DAM 集中管理           | **留在部門 app 的 Create** |
| MCP 路由          | 單一 app 內部             | **由中央路由到正確的部門 app**   |
| 缺料處理            | 假設 agent 做完，或靜靜降級     | **Needs 一等物件，完整閉環**   |

另外兩條反主流：**預設無 approval 閘**（Boss 可逐項開，但預設是關）、**Boss-only 隱藏 Preference doc**。前者是產品主張，後者有員工信任與合規風險，要自覺承擔。

結論：我們不是要重做引擎，是要**定義一組取捨，加一個很薄的平台殼**。底層全部有現成的可以用。

---

## 13. 未決定（我不會自己作）

**已答（2026-11-10 第三輪）**：app 清單改為三層圖書館（`06`）；CRM 不另開 app（Customer 留 Sales），客服是獨立 Support app；預約／套票是 Booking app；電商不自建前台只做整合；模具屬 Product Studio；貨運有 graduation rule；加盟不是 app 而是 tenant 結構（`07`）；語言分 UI／內容／法定三層；工種改用 Work Pattern × Pay Components × Calendar。

**已答（2026-11-10 第四輪）**：組織目標＝**形狀 B（一公司多店）**，但第一版仍是 1 Tenant : 1 Site（多店留 P1）；第一版 app 定為 **Marketing Design**（v0.7 修正為「Marketing ＋ 一個 Forge 生成的 app」，見第 14 節）；壓力測試完成（`08`），框架只認六條不變量；多幣種現在做；監管保留由框架強制；marketplace 明確不做。

**已答（2026-11-10 第五輪）**：多幣種**要做**；監管保留**框架強制**（同意）；**不做 marketplace，但做 WooCommerce／Shopify 渠道接駁**；**新增 App Forge**（`09`）——平台自己生成缺少的部門 app，令 Company-OS 不必預先支援所有生意。

**已答（2026-11-10 第六輪）**：不賣，**自家基建＋按客客製**；你一人決定所有源碼改動；agent 要知道「可改／不可改」與「開發怎樣做」；多間公司用 **variant**；要「無 bug」。落地全部在 `10-build-charter.md`（領土／配方／驗證／變體），並在 `09` 補上 Forge 的寫入邊界對應。

**已答（2026-11-10 第七輪）**：`08` 的監管保留範圍定為「所有物件可設、只有財務／醫療／合約三類預設非空」；`Contract`／`Milestone` 放 Sales；Forge 收費問題**作廢**（不賣，生成不是成本中心）；測試案例用「美容診所＋家具廠」兩間。

### 開工前只剩三條（其餘全部可以在動工之後才答）

| # | 問題 | 為什麼不能拖 | 我的建議 |
|---|---|---|---|
| 1 | **第一版除了 Marketing，要不要同時做一個由 Forge 生成的 app？** | 只做一個 app，Registry 四 shape 等於沒被驗證；Forge 也只是紙上設計 | **要**。用「生成流程」本身當第二個 app，一箭雙鵰 |
| 2 | **策略文件的真實樣本**（一份多長、什麼格式） | 這是唯一無法由推理得出的東西；agent 怎樣揀策略完全取決於它 | 給我最真實的一份（品牌語氣或 IG 規範都可以），不用整理 |
| 3 | **程式庫與 bot 帳號的形態**（GitHub 私有庫 vs 自架 Gitea） | 決定三色領土能否真的用機器擋；自架功能不齊會少一半 | **GitHub 私有庫＋一個 bot 帳號**。單人擁有者的陷阱是：agent 用你的帳號時，approvals ≥ 1 會鎖死你自己 |

### 可以在動工之後才答

Preference doc 怎麼學｜`Needs` 要不要改名｜Hyperframes 部署是否 runtime 可切換、遠端機怎樣認證｜Derived 成品（PDF／簡報／Icon 包）第一版做不做｜`External` 用 magic link 還是限定帳號｜decision 型 Needs 的聚合粒度｜UI 語言第一版幾種｜App 中文命名｜App Kit 的隔離形狀（一 app 一 container 還是共用 container）｜其餘 Forge 細節見 `09` 第 12 節。

**判斷原則：** 如果一條問題的答案會改變 schema、權限或部署拓撲，它屬於「開工前」；如果只會改變某個 app 的畫面或某份文案，它屬於「動工後」。上面只剩三條在前一類，因為其餘都已經在 `02`–`10` 收斂成「有預設值、可改」。

---

## 14. 下一步

按這個次序，一次只做一層：

1. **本文定稿** ← 現在
2. **開發憲章（`10`）落地**：紅／黃／綠領土、六個配方、六級驗證階梯、變體三層。**次序不能倒**——Framework 的程式碼要住在這些邊界裡；先寫 Framework 再想邊界，等於先建屋再畫圍欄。
3. **設計 tokens ＋ 五個版面原型**（Portal 總覽／Needs 收件箱／Project 列表詳情／Create 工作台／策略庫）。與第 2 步並行，因為互不相干；但必須在 Framework 之前，否則畫面會被迫去遷就資料模型，而不是資料模型去支撐畫面。
4. **Framework 設計**：把第 4 節的十二個物件（含 `App Spec`）、加上 `07` 的 Site／Tenant／Group 三層，變成實際 schema、API 合約、MCP 工具清單、App Registry 合約、事件格式
5. **Boss Portal ＋ Marketing Design app 並行設計**：兩者共用同一份 Framework，同時做才可以驗證「平台殼夠不夠薄」

### 第一版範圍（v0.8 修正）

v0.7 曾把「一個由 Forge 生成的 app」放進第一版，用來驗證 Registry 契約。**v0.8 收回**：

- 契約被測的條件是「**兩個不同 producer**」，不是「一個生成物」。
- **App Kit 是蒸餾，不是預測**。Kit 那 80% 鎖死骨架只能由兩個真實 app 反推；先寫 Kit 再寫 app，等於憑空猜。
- 三個未驗證的東西（手工 app ×2 ＋ Forge）互相依賴，會同時卡住。

| 版本 | 內容 | 驗證什麼 |
|---|---|---|
| **第一版** | 平台殼 ＋ **Boss Portal v0** ＋ Marketing Design（完整）＋ **Sales（一條線）** | 整條閉環、Registry 四 shape（兩個 producer）、`auto` 與 `assisted` 兩種模式、derived 成品 |
| **v1.1** | 抽出 **App Kit**，然後做 **Forge**；第一個生成目標是細而真實的 app | 生成物能否交出四 shape 並准予註冊 |
| 其後 | Operations、Finance、HR、其餘 Tier 2 | 按痛點排，概念已寫好 |

**Boss Portal 不是 Forge 生成的 app**，理由三條：它是殼不是部門（生成物不能進紅區）；它是契約的消費者，用消費者驗契約是自己驗自己；它壞了你連「哪裡壞」都看不到。

**Sales 第一版只切一條線**：Customer（關係面向）＋ ERP 鏡像、Pipeline＋Project、`decision` 型 Needs（報價授權）、Quotation 草稿 → ERP Gateway → 讀回狀態、報價 PDF。**不做** Invoice、應收投影、Automation runtime、成本價矩陣。

交付細節（GitHub 設定、issue 模板、wave、loop）見 `11-delivery-plan.md`。

**App Forge 對 Framework 的三個要求（v0.5 新增）：**

1. **Registry 合約要機器可驗**，不只是文件。它現在同時是「Portal 顯示得齊」的保證，和「生成物准不准註冊」的閘——這是全份設計裡唯一別人沒有的東西（`forge-prior-art.md`）。
2. **`App Spec` 要入 schema**，而且 `Department App` 要記低「由哪份 spec、哪個版本編譯出來」。
3. **App Kit 要與 Framework 同一日設計**。Kit 決定生成物的品質下限；如果先做 Framework 再想 Kit，生成出來的 app 會各有各的形狀，Registry 四 shape 形同虛設。

第 3 步之所以要並行，是因為 Boss Portal 只能顯示部門 app 願意交出的東西。如果先做完 Marketing Design 再設計 Portal，Portal 就會被迫去讀它的內部資料——平台殼就破了。

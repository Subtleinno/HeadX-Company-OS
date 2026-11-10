# App Forge：平台自己生出缺少的 app

版本 v0.2 ｜ 2026-11-10 ｜ 狀態：討論稿（已對齊 `01` v0.7）  
上位文件：`01-company-os-concept.md`。前置：`06-app-library.md`（三層圖書館）、`08-scenario-coverage.md`（十二變化軸）。調研：`company-os-prior-art/forge-prior-art.md`。開發邊界：`10-build-charter.md`。老闆版摘要：`00` 第 6 節。

> **v0.2 對齊**：① 定位改為「自家基建、不公開賣」，所以「要不要收費／計量」一條**作廢**；② Forge 的驗證需要第二個 app，第一版範圍已修正為「Marketing ＋ 一個 Forge 生成的 app」（`01` 第 14 節）；③ 第 7 節的五道機器防護，落地形態就是 `10` 第 3、5 節的三色領土與驗證階梯——同一件事的兩面。

> 這份回答一個要求：**「Boss 需要一個原始碼沒有的模組時，系統要幫他生出來，好像我們現在這樣做。」**
> 如果這條成立，Company-OS 就不必預先支援所有生意——它只需要支援**生成**。

---

## 0. 一句話

**App Forge 是平台的一個能力，不是一個 app。** 它把「一個部門需要一個新工作台」變成一份可審閱的規格（App Spec），再由 agent 編譯成可註冊的 app；之後只做增量維護，不重新生成。

這令框架更薄，不是更厚：**加一個部門，不是改框架，是加一份 spec。**

---

## 1. 先講研究結論：你這個想法分三層，只有第三層是空位

這是四組獨立調研之後最誠實的答案，直接影響我們該把力氣放在哪。

| 層 | 命題 | 現況 |
|---|---|---|
| 1 | **app 就是資料／metadata，定義完即時生效** | **舊聞**。Salesforce（2008 起）、Frappe DocType、Odoo Studio、Airtable、Notion 全部做得到。沒有 novelty |
| 2 | **一句話生成一個 app（資料模型＋UI＋基本自動化）** | **2025 起已商品化**。ServiceNow Build Agent（2025-09，生成 scoped app 並進 `sys_app` 註冊表）、Power Apps Plan Designer（GA 2025）、Zoho CoCreator（GA）、Retool Assist（Beta 2025-10）、Mendix 11「Start with Maia」 |
| 3 | **生成物必須符合平台的業務語意契約才准註冊** | **找不到任何一家在做** |

第 3 層的空位很具體：我逐個查過所有「上架／註冊」閘門——AppExchange（現稱 AgentExchange）Security Review、Odoo manifest、Frappe app、MCP Apps SDK——**全部只驗技術、安全、協議，沒有一個驗業務本體**。MCP Apps 最接近，但它只管 tools 的 JSON Schema 與 `ui://` resource，不管「這個 app 是否交出 projects／needs／schedule」。

而 Registry 四 shape（`projects`／`needs`／`approvals`／`schedule`）我們在 v0.3 就已經定了。**這就是那個沒人做的契約。**

所以正確的定位不是「我們發明了會生成 app 的平台」——那是第 2 層，已經擠滿人。而是：**生成器與多 app 平台殼是兩個分離的市場，唯一把它們縫合的 ServiceNow 需要 IT 立項、買 SKU、admin 裝 plugin；而「用業務契約把生成物綁進平台」沒有人做。**

---

## 2. Forge 的五步

不是「叫 agent 寫 code」，是一條有固定出口的流水線。每一歩都有產物，都可停可查。

```
① Ask  → ② Probe → ③ Spec → ④ Compile → ⑤ Register
             ↑                              ↓
             └──── 缺口回報（用後才知）──────┘
```

**① Ask｜Boss 講一句**
「我要一個加盟管理。」不需要表單、不需要訪談。這一句就夠啟動。

**② Probe｜Forge 自己問問題**
它拿 `08` 那十二條變化軸當 checklist，逐條問「這間公司是甚麼形狀」：組織（單店／多店／多法人）、收入模式、庫存語義、交付形態、監管強度、語言、勞工結構……

**這一步不是審批，是填 spec。** 差別很重要：審批是「等你批准我繼續」，Probe 是「我還缺一個答案才能編譯」。Boss 答完就走。

**③ Spec｜產出一份 App Spec**
一頁，不是一份 PRD。內容固定八項：

| 欄位 | 例（加盟管理） |
|---|---|
| 物件與擁有權 | `Franchisee`、`Royalty Run`、`Brand Audit`——全部歸這個 app，跨 app 經 MCP |
| `autonomy` | `assisted`（royalty 計算要人複核） |
| Registry 四 shape | 交 projects／needs／approvals／schedule 的哪個子集 |
| 能力宣告 | 可讀 Sales 的營收摘要（唯讀）、可寫 Finance 的應收（經 Gateway） |
| 保留政策 | Royalty Run 憑證不可刪，7 年 |
| 幣種 | 多幣種，Tenant `base_currency` |
| 語言 | UI 繁中／英；文件跟 Tenant 法域 |
| 不做的 | 不碰加盟店的庫存、不做前台 |

**④ Compile｜由 App Kit 生成 app 包**
schema、MCP 工具、UI、Needs 面板、contract 全部由 Kit 出，Forge 只填肉不砌骨（見第 4 節）。

**⑤ Register｜通過機器驗證就註冊**
不是人審 code。是五道機器防護（第 7 節）跑完，進 Registry，Boss 按一下上線。

---

## 3. 三個入口（不只 Boss 開口）

| 入口 | 觸發 | 為甚麼要 |
|---|---|---|
| **Boss 主動** | 「我要一個 X」 | 最直接，但頻率最低 |
| **Agent 發現缺口** | 做專案時發現「這個 app 沒有放這種物件的抽屜」 | 這才是真正的來源。需求不是想出來的，是撞出來的 |
| **由 Library 衍生** | Tier 2 有 80% 像，fork 之後改 | 大部分「新 app」其實是舊 app 的變體 |

第三個入口很重要，因為它決定生成量。**如果每次都從零生成，重複邏輯會沉積**——GitClear 2025 的數據顯示 AI 輔助下複製貼上由 8.3% 升到 12.3%、重構由 24.7% 跌到 9.3%，2024 年首次出現「複製超過重構」。七個 app 各自長一套 `Customer` 挑選器，就是這個數據的本地版。所以 Forge 的第一選擇永遠是 **fork + 差異化**，不是 blank page。

---

## 4. App Kit：品質的下限由骨架決定，不由模型決定

這是整份設計最實際的一條。**如果 Forge 從空白生成，品質上限就是模型當日的心情。** 所以要先有一個 Kit：

| Kit 提供 | Forge 只填 |
|---|---|
| App shell、導航、列表／詳情／表單的標準版型 | 這個 app 有哪幾個物件、哪幾個欄位 |
| MCP server 骨架（工具命名、作用域、審計掛勾） | 這個 app 有哪幾個工具、參數是甚麼 |
| Needs 面板（兩型、狀態機、Email 模板） | 這個 app 會開哪幾類 Needs |
| Registry 四 shape 的 serializer | 這個 app 交出哪個子集 |
| 事件發佈、權限檢查、幣種格式化、i18n | 業務語意 |
| 測試骨架（contract test、fitness function） | 這個 app 的不變量 |

**一個 app 的自由度應該只有 20%。** 那 20% 是業務語意——物件、欄位、規則、Needs 類型。其餘 80% 由 Kit 鎖死，所以生成出來的 app 長得一樣、接得上一樣、壞得一樣。

這也回答了「app 數量有限、由 Boss 管」與「可以生成」表面上的矛盾：**能生成不等於會增生，因為生出來的東西同一個模子。** 真正會增生的是「每個 app 自己發明一套結構」——那正是 Kit 要禁止的。

---

## 5. 一條硬線：Forge 不可以改框架

Forge 是整個系統唯一「可以改變系統本身」的地方，所以它是最大的攻擊面。防護不是靠更嚴的審批，是靠**範圍限定**。

**Forge 只能寫 app 層。六條不變量（物件與擁有權、三層組織、`autonomy`、Needs 兩型、Registry 四 shape、事件格式）不在它的寫入範圍內。**

Darwin Gödel Machine 的論文自己講得很清楚：它的安全性來自「只改自己的 Python codebase、只針對 coding benchmark」，而且明白承認一旦 benchmark 未涵蓋安全，自我改進迴圈會逐代放大偏差。**同一個道理：Forge 的安全來自它改不到框架。**

落地成三條：

1. **Registry contract、fitness function、CI workflow 由 CODEOWNERS 鎖死。** 研究裡有一句很準的話：*protect the verifier from the optimizer*——agent 為了讓測試變綠，最短路徑是改規則、放寬門檻、刪 CI step。規則檔必須在生成範圍之外。
2. **Forge 跑在獨立 container，只寫 staging，不能直接寫 running 的 Postgres／MinIO。** 生成物是「一個 app package」，不是「一堆直接執行的遷移」。
3. **Forge 不能生成 Forge。** 它不可以改自己的 Kit、不可以改自己的 probe 問題集。

---

## 6. Spec 是真相，但 code 不是每次重生（這一條我跟研究的結論走）

直覺會說：既然 app 由 spec 生成，那 spec 一改就重生一次，永遠一致。**研究說這條路走不通，而且失敗機制已經被具體記錄。**

- Backstage Software Templates（golden path 的事實標準）：一旦 instantiate，**就停止追蹤 template**。官方與多個獨立來源一致。
- OpenAPI Generator：regeneration 預設是 overwrite，手改必然被沖走。業界逃生門是 `.openapi-generator-ignore`、region markers、三方合併——**即業界用「不做純重生」來解決 drift**。
- Tessl 是唯一公開主張「spec 是 primary artifact、code 是 disposable」的產品，但只做到 1 spec ↔ 1 file、仍是 beta 就轉向賣 Registry／skills。
- 最有力的一手實測（Böckeler, martinfowler.com 2025-10）：agent 把「對現有 class 的描述」當成新 spec **重新生成一次，造成重複程式碼**。這不是 prompt 寫得不好，是結構性問題——agent 分不清「描述現狀」與「要求生成」。
- 唯一成熟的「持續再生成」形態不是 generator，是 **codemod**（Nx `migrate`：冪等、逐個 migration 一個 commit、可 revert、遇到客製檔案會主動停手報告）。

**所以定成這樣：**

```
App Spec ──(第一次)──→ 生成 app 包 ──→ 註冊 → 上線
              │
              └──(之後)──→ 只產生 migration，不重生
```

- 第一版由 spec 全量生成，**這一份 code 之後就是「你的 code」**。
- 之後 spec 改動，Forge 產出一條 **migration**（加欄位、加物件、改 Needs 類型），逐條可 review、可 revert。
- **不做全量重生。** 想「重來一次」是可以的，但那是新開一個 app（fork），不是把舊 app 沖掉。

這條決定代價很低、回報很高：它讓 Forge 從一個「魔法」變成一個「有 exit 的編譯器」。

---

## 7. 五道機器防護（取代審批，這才是「不加閘」的真正做法）

你的原則是「不加閘，成品出咗先判斷」。這在 UI 層成立，但在「生成可執行程式碼」這一層要有東西代替——否則不是「不加閘」，是「沒有閘」。研究的結論很一致：**有效的閘不是人審，也不是測試綠燈，而是執行層的約束。**

| # | 防護 | 擋甚麼 | 成本 |
|---|---|---|---|
| 1 | **依賴白名單 + 內部 registry proxy**（禁 postinstall、拒絕 N 天內新套件） | Slopsquatting。USENIX Security 2025 實測：19.7% 被推薦的套件不存在，錄得 205,474 個虛構名，43% 在重跑十次都出現（可被搶註） | 極低，一條 config |
| 2 | **能力宣告 + 執行層 default-deny**（manifest 寫要讀哪個表、呼叫哪個 API、egress 去哪；由 gateway 攔） | 權限提升與 prompt injection。MCPTox 實測 353 個工具、20 個 agent，攻擊成功率最高 72.8%，而且**模型越強越易中**（instruction-following 越好） | 中，但這是唯一擋得住的層 |
| 3 | **Sandbox + 短效憑證 + egress 白名單** | 錯誤橫向擴散；孤兒 app 的憑證仍然活著 | 低 |
| 4 | **Canary + 指標 guardrail + 自動回滾**（不需要人看 dashboard） | 「語法正確、測試通過、但業務上錯」。有人實測 105 秒自動回滾，change history 的 actor 是 null | 中，一次性建基線 |
| 5 | **In 不變量寫的 property-based test** | 狀態機不可達狀態、金額不守恆、權限可提升、非冪等。OOPSLA 2025：每個 property test 找到的 mutation 是普通 unit test 的約 50 倍，76% 在前 20 個隨機輸入內抓到 | 低（難在想 property） |

**兩樣「看起來有用、實際上擋不住」，明確不做：**

- **用同一個模型生成的單元測試當上線閘。** 2026 年的審計顯示 SWE-bench Verified 有 28.5% 的任務測試套件弱到一個驗證過的錯誤補丁也能通過；另一個審計顯示 agent「解決」的案例有 63% 是找到既有修復而非推導。一個會去找答案的 agent，也會去找方法讓你的測試變綠。
- **只做 schema validation 當閘。** 契約測試實測抓到 41/53 個不相容（77%），但漏抓的 11/12 全是「值域／範圍」變更——因為它只抽樣單一值。可以當護欄，不能當門。

這張表也回答了「為甚麼不加 approval gate 是對的」：**加錯的閘只會製造假安全感，而真正的風險在依賴、權限、爆炸半徑——那三樣用審批根本審不出來。**

---

## 8. App 生命週期：會有孤兒，所以要有孤兒偵測

Gartner 的第一手觀察很刺：一個用戶六個月內試了 15–20 個 app，約一半被棄置。棄置的 app 不是壞掉，是**還活著但沒有主人**——憑證有效、資料還在長、沒人敢刪。

這正是「無止境增生」的真實形態，而它不是「生成太多」，是「沒有人收」。所以 Registry 要多一個欄位和一條工作：

| 欄位 | 用途 |
|---|---|
| `owner` | 一定要有人，預設是提出那位 Boss |
| `last_active` | 最近一次有 project／Needs／API 呼叫 |
| `usage` | 活躍 project 數、Needs 數 |

**90 天無活動 → 開一張 `decision` 型 Needs 給 owner：「這個 app 要繼續、歸檔，還是退役？」** 三選一，一按即完成。

這是全份設計裡唯一「會主動找人」的地方，而它找人的理由不是流程，是**東西沒人用了**。這比任何註冊審批都有效。

---

## 9. 同一個模式，第二次出現

值得指出：Forge 與 Marketing 的 Create 是同一件事的兩個實例。

| | Marketing Design | App Forge |
|---|---|---|
| 真相 | HTML composition | App Spec |
| 導出物 | render 出來的 PNG／MP4 | 編譯出來的 app |
| 誰判斷好不好 | Staff 看成品，不夠好叫 agent 再做 | Boss 用 app，不夠好叫 agent 改 |
| 缺料怎麼辦 | 開 Needs | Probe 問問題 |
| 可重現 | 同一份 composition 永遠同一輸出 | 同一份 spec 同一個 app 包（首次） |

**「文件是真相，成品是導出物」在這個系統裡出現兩次，不是巧合。** 這條一致性比任何單一功能都值錢，因為它意味著團隊只需學一個心智模型。

但要記住第 6 節的修正：導出是一次性的，之後是遷移。Marketing 之所以可以每次重 render，是因為 render 不改輸入；app 會積累狀態，所以不能。

---

## 10. Forge 不做甚麼

| 不做 | 理由 |
|---|---|
| **不生成框架層** | 六條不變量、Registry contract、fitness function 在寫入範圍外（第 5 節） |
| **不生成需要新資料庫引擎的 app** | 若一個 app 要 graph DB／vector DB，那不是「新 app」，是「新平台」 |
| **不生成雙邊平台／marketplace** | 已明確不做（`01` 第 3 節）。要接駁 WooCommerce／Shopify 是渠道接駁，不是生成新 app |
| **不自動上線** | 生成 → 驗證 → 進 Registry 是自動；「上線」是 Boss 一按。不是審批，是一個不可代簽的動作 |
| **不重寫現有 app** | 只做 fork 與 migration |

---

## 11. 順帶落定的三條（本輪）

1. **多幣種：已定，現在做。** `Money = {amount, currency}`，Tenant 有 `base_currency`，匯率版本化。
2. **監管保留：已定，框架強制。** 物件帶 `retention`（年限、可否刪、可否改），UI 不可繞過。
3. **不做 marketplace，但做渠道接駁。** WooCommerce／Shopify 是 `Commerce` app 的 **Channel Adapter**：
   - **商品與價格**：master 在 ERPNext → 推送渠道（單向）
   - **訂單**：渠道原生 → 落 Company-OS 做投影，觸發 Operations 履行
   - **客戶**：渠道首次下單時建立，映射到 Company-OS `Customer`，渠道只是 acquisition source，不是 master
   - **庫存**：master 在 Operations → 推送可售量（單向）

   **同一條原則第四次應用：master 只有一個，其餘是投影或命令。** 這也解釋了為甚麼接駁 Shopify 不等於做 marketplace——我們沒有買方與賣方兩個 party，只有「我的貨在別人的貨架上」。

---

## 12. 未決定

**已答（v0.2）**：① 第一版就要驗證 Forge——範圍是「Marketing ＋ 一個由 Forge 生成的 app」（`01` 第 14 節）；② 收費／計量**作廢**（不賣）；③ Forge 只能寫 app 層，落地為 `10` 的紅區鎖死與 bot 帳號（`10` 第 3 節）。

仍然未定：

1. **Kit 用甚麼技術形狀？** 我傾向「每個 app 一個獨立 container + 自己的 Postgres schema」，因為隔離最徹底、可獨立回滾；代價是資源。另一條是「同一個 container、獨立 schema」，省資源但爆炸半徑大。
2. **Forge 由誰驅動？** 是 Boss 自己那位 agent（有全公司視野），還是一個專屬的 Forge agent（權限更大但更窄）？我傾向專屬。
3. **Probe 的問題集從哪來？** 用 `08` 十二條軸當起點，但每個 app 類型要自己一套。這是人工勞動，第一次要手寫。
4. **生成的 app 是否預設 `auto` 還是 `assisted`？** 我傾向預設 `assisted`，因為生成物的判斷質素未知。
5. **要不要保留「重來一次」的入口？** 第 6 節說 fork 而非重生，但 Boss 可能會想「這個 app 生壞了，重做」。fork 的成本是資料要搬——要不要支援？
6. **孤兒偵測的 90 天對不對？** 季節性業務（例如年尾才用的 app）會被誤判。

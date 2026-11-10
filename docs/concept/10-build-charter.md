# 開發憲章：一個人＋agent 維護一套公司系統

版本 v0.2 ｜ 2026-11-10 ｜ 狀態：討論稿（已對齊 `01` v0.7）  
上位文件：`01-company-os-concept.md`。前置：`09-app-forge.md`（Forge 寫入邊界）。調研：`company-os-prior-art/charter-prior-art.md`。老闆版摘要：`00` 第 8、9 節。

> **v0.2 對齊**：① bot 帳號與程式庫形態已升為「開工前必須答」的三條之一（`01` 第 13 節），我建議 GitHub 私有庫＋一個 bot 帳號；② **variant 層要做結構、不做第二個 variant**（目錄、`variant.yaml`、config schema 先存在）；③ 第一版範圍改為「Marketing ＋ 一個 Forge 生成的 app」（`01` 第 14 節），所以 `add-app` 配方在第一版就要真的跑一次。

> 這份回答三句話：**「我要知道什麼可以改、什麼不可以改」**、**「agent 要知道做開發時應該怎麼做」**、**「軟件要無 bug」**。
> 前兩句可以完全解決。第三句不行——但可以換成三句在工程上可驗證的承諾。

---

## 0. 一句話

**不是叫 agent 聽話，是令 agent 犯不了錯。**

四件事，次序不能調：**領土**（可以改什麼）→ **配方**（應該怎樣改）→ **驗證**（怎樣知道改壞了）→ **變體**（第二間公司怎樣用）。

---

## 1. 前提變了：不賣，所以可以放掉很多東西

你講得很清楚：不公開賣、按客戶客製、而現在其實只是要開更多生意自己用。這一改，以下全部可以丟掉：

| 可以丟掉 | 為什麼 |
|---|---|
| 多租戶 SaaS 架構 | 一個 Site 一個 instance 已經是上限，不需要 tenant 隔離做到 SaaS 級 |
| 向後兼容承諾 | 沒有外部開發者、沒有公開 API 合約 |
| 計費、方案分級、授權碼 | 不賣 |
| App 市集、plugin 生態 | 已明確不做 |
| 行銷級文檔 | 只需要給自己與 agent 看的文檔 |

但有兩樣反而**收緊**：

1. **資料不可失。** 因為這是你生意的唯一記錄。備份與還原比任何 bug 都重要（第 3 節）。
2. **變體管理。** 一旦第二間公司用，你就由「一個 codebase」變成「N 個部署」——這是唯一會令你日後無法維護的風險（第 7 節）。

**一條新的自由：你可以 greenfield 改 schema。** 但判準不是「有幾多間公司」，而是**「有幾多不可重來的狀態」**：

| 情況 | 你能不能直接改 schema |
|---|---|
| 只有一間公司、資料可以重跑 | 可以。直接 rename／drop，不需要 deprecation |
| 有真實 production 資料 | 不行，要 expand–contract |
| 有第二間公司自架、升級時序不同步 | 不行，你實際上已經有 N 個 client |

實務折衷：**由第一日起就用「輕量版 expand–contract」**——加新欄位 → backfill → 切讀取 → 下一版才 drop 舊欄位。成本只是一個 migration script 加一個版本的延遲，但買到回滾能力。這是一人團隊最值得買的保險。

---

## 2. 「無 bug」的誠實答案

我查了數據，結論很一致：**沒有一個數字支持「無 bug」是可承諾的目標。**

| 事實 | 數字 | 來源 |
|---|---|---|
| 微軟出貨級軟件的缺陷密度 | **約 0.5 個缺陷／千行** | McConnell 2004 整理 |
| 業界平均 | 約 1.0 個／千行 | Coverity 2019（明言「無論產品或語言，缺陷永遠存在」） |
| 團隊的 change failure rate 中位數 | **8–16%**（只有 8.5% 團隊做到 0–2%） | DORA 2025（近 5,000 人） |
| 事故來自「變更」的比例 | **約 70%** | Google SRE Book |
| 重大軟件事故中，設定／變更管理失敗佔比 | **62%**；人為錯誤貢獻 66–80% | Uptime Institute 2024 |
| 重大事故中「本來可以用更好管理／流程／設定避免」 | **80%** 受訪者認為是 | Uptime Institute 2024 |
| 大型復原演練中，伺服器在 SLA 內恢復的比例 | **只有 58%**；只有 13% 有編排好的還原流程 | Veeam 2024 |

**一個 20,000 行的部門 app，期望值就是約 10 個已知級缺陷在生產。** 要求零缺陷，等於要求比微軟好一個數量級——而微軟有十萬工程師。

### 換成三句可以驗證的承諾

- **任何一次變更，可在 15 分鐘內回到上一個已知良好狀態。**
- **資料 RPO ≤ 1 小時、RTO ≤ 4 小時，而且每季實測一次**（不是看備份成功日誌）。
- **單一 app 故障，不影響其他部門 app 的讀取。**

這三句可以寫進合約、可以驗、可以量。**「無 bug」不行。**

### 你的注意力放錯了方向（這是本節最重要的一點）

事故的真實排序，與你現在花時間的地方是倒轉的：

| 真實風險排序 | 你現在花時間在哪 |
|---|---|
| 1. 權限／設定誤設、變更管理失敗 | ← 幾乎沒有 |
| 2. 備份存在但還原不到 | ← 幾乎沒有 |
| 3. Schema migration 失敗／半完成 | ← 幾乎沒有 |
| 4. 硬件／第三方依賴 | ← 沒有 |
| 5. **純邏輯 bug** | ← **全部時間在這裡** |

**邏輯 bug 是最少見的類別，卻是你最花力氣防的。** 所以第 5 節的驗證階梯要把前四項放在前面，不是把測試寫得更多。

---

## 3. 第一件：領土（什麼可以改）

三色分區。每一條紅線都必須對應一個機器檢查，對應不到的就降級為黃或綠——**因為寫在文件裡的禁令，只會造出一個「更聽話地踩進禁區」的 agent。**

### 紅區：不可改（機器強制）

| 路徑／範圍 | 為什麼不可改 | 機器怎麼擋 |
|---|---|---|
| `core/schema/invariants/`（事件格式、Money 型別、retention 強制、tenant 解析） | 改了等於所有 app 一起壞 | CODEOWNERS + 架構測試 |
| `core/registry/contract/`（Registry 四 shape） | 這是 Portal 與 Forge 共用的契約 | CODEOWNERS + 契約測試 |
| `migrations/`（機制與編號，不是內容） | 編號撞了、亂序了就是資料事故 | 編號單調性檢查 + 對 staging 跑 up→down→up |
| `tests/`、`.ci/`、`CODEOWNERS` | 判卷標準 | **base-pinned proof gate**（見下） |
| `core/auth/`、權限 middleware | 一個 bug 就是全公司資料外洩 | CODEOWNERS + 專項整合測試 |
| `ops/backup/`、還原腳本 | 唯一無法用「修 code」補救的類別 | CODEOWNERS + 每季實測 |

### 黃區：要 ADR，可以改

新增物件、改事件格式（加欄位可以，改語意要 ADR）、新增服務、加 MCP 工具命名空間、改 Needs 狀態機、改 Registry 四 shape 的子集。

### 綠區：自由

app 內部 UI、查詢、文案、variant 配置、Kit 模板、報表、匯入腳本。

### 四個真正擋得住的機器手段

1. **bot 身份 + protected branch + required checks。** 單一擁有者有個陷阱：如果 agent 用你的帳號、而且 approvals ≥ 1，你會鎖死自己。所以**先開一個 bot 帳號**，這個 bot 開得到 PR，但永遠 merge 不到、approve 不到自己。
2. **Base-pinned proof gate。** 用 **PR base commit 的** tests／CI／policy 去跑 PR 的 code。這直接消滅最常見的繞過路徑——agent 改測試或改 CI 讓自己過關。這是整個機制的**地基**，其他都是輔助。
3. **架構 fitness functions，只寫 3–5 條最痛的邊界。** 例如「app 不可 import 另一個 app」、「core 不可 import app」、「只有 gateway 可以寫 ERP」。不要一次寫 30 條——沒人維護的規則會全部失效。
4. **Generated zone header + diff 檢查。** Forge 生成／Kit 產生的檔案帶 `// GENERATED — DO NOT EDIT` header，CI 重生成後 `git diff --exit-code` 必須為空。

> 一句話總結這節：**prompt 是請求，branch protection 是事實。**

---

## 4. 第二件：配方（agent 應該怎樣改）

這一節比憲章更重要。研究裡最反直覺的數據是：**叫 agent 讀的規則檔，人手寫的只令成功率 +4%，AI 自己生成的反而 −3%，而推理成本一律 +20%。** 而且機制不是「忽略」，是**過度遵從**——檔案提到某個工具，agent 每題就多用 1.6 次；最常寫的「codebase overview」一節，實證上完全沒有加快找到檔案。

所以：**憲章要短，配方要具體。**

每個配方固定五段，缺一段就不算完成：

```
recipe: add-object
前置條件：這個物件屬於哪個 app、是否已有類似物件（先搜）
步驟：schema → migration（expand 階段）→ MCP 工具 → UI 列表/詳情 → 權限 → 事件 → 測試
必跑驗證：L1 契約 + L2 不變量 + L3 migration 來回
常見錯誤：忘記加 retention、忘記在 Registry 交 shape、migration 編號跳號
完成定義：舊資料仍讀得到、新欄位可寫、其他 app 不受影響
```

第一版只需六個配方：

| 配方 | 何時用 |
|---|---|
| `add-object` | 新增一個業務物件 |
| `add-mcp-tool` | 新增一個 agent 可呼叫的介面 |
| `add-needs-type` | 新增一類 Needs（例如「要簽名」） |
| `add-variant` | 第二間公司要用同一套系統 |
| `add-migration` | 改 schema（一律 expand 先行） |
| `add-app`（接 Forge） | 生成一個新部門 app |

**配方就是 Forge 的 App Kit 的說明書。** `09` 說 Kit 鎖死 80% 骨架、Forge 只填 20% 業務語意——那 80% 的「怎麼填」就是這六個配方。兩者是同一件事的兩面：**Kit 是機器執行的部分，配方是 agent 讀的部分。**

---

## 5. 第三件：驗證（怎樣知道改壞了）

六級階梯，由快到慢。**硬約束：本機／PR 前那一層必須在 5 分鐘內跑完。**

| 級 | 內容 | 時間預算 | 抓甚麼 |
|---|---|---|---|
| L0 | 型別、schema 驗證、lint | 秒級 | 低級錯誤 |
| L1 | 契約測試（Registry 四 shape）＋架構 fitness | < 1 分鐘 | app 越界、Portal 顯示不到 |
| L2 | 不變量 property test | < 1 分鐘 | 金額不守恆、權限可提升、狀態機不可達、非冪等 |
| L3 | Migration 來回（up → down → up） | < 2 分鐘 | schema 改動會否丟資料 |
| L4 | Smoke：`docker compose up` + 真實走幾道門 | < 5 分鐘 | 「代碼上看應該可以」 |
| L5 | Canary／手動 | 手動 | 「語法對、測試綠、業務上錯」 |
| nightly | 全量整合、備份還原演練 | 不限 | 累積性腐化 |

**為什麼 5 分鐘是硬約束：** 24% 的開源專案 test suite 要跑 1 分鐘以上，8% 要 5 分鐘以上，而超過 1 分鐘那批平均 9 分鐘。認知科學那邊：被打斷後平均要 23 分鐘才回復深度專注。**所以超過 10 分鐘的 suite，你會開始不跑它——而一個沒人跑的 suite 只是昂貴的文件。**

### 三樣明確不做的驗證

1. **不追求 coverage 百分比。** ICSE 2014 用 31,000 個 test suite、5 個大型系統證明：控制 suite 大小之後，coverage 與故障偵測能力只有低至中度相關，更強的 coverage 標準也沒有額外洞察。而且 AI 生成測試可以在幾分鐘內把 coverage 衝高，assertion 卻是空的——**它量的是「有沒有執行」，不是「有沒有驗證」。**
2. **不追求 mutation score。** Google 在 20 億行代碼、每日 5 億次測試上實測：初期 85% 的 mutant 被工程師判定為無用，花了六年、兩萬人回饋才把有用比例由 15% 升到 89%。這是一人團隊養不起的。
3. **不用「AI 寫的測試」當閘。** 同一個模型會同時寫 code 與 test，偏差會同時出現在兩邊。2026 年的審計顯示：SWE-bench Verified 有 28.5% 的任務，測試套件弱到一個錯誤補丁也能通過。

### 唯一值得做形式化的地方：3–5 個不變量

AWS 的個案是全份調研裡回報最高的一項：DynamoDB 用約 **939 行 TLA+ 規約**，model checker 找到一個**會導致資料遺失**的 bug，最短錯誤軌跡 **35 個高層步驟**——而它**通過了設計審查、code review、故障注入測試與長時間壓力測試**。工程師由零開始 2–3 週可產出有用結果。

我們的候選清單（就是那 3–5 個）：

| 候選 | 為什麼值得 |
|---|---|
| 入帳一致性（借貸平衡、重複過帳） | 錯了是錢，而且是幾個月後才發現 |
| Needs 狀態機（兩型、狀態不可跳） | 錯了是工作消失，不是錯誤訊息 |
| 跨 app 同步（site → hub 事件） | 錯了是無聲的資料漂移 |
| Idempotency（重試、重複點擊） | 錯了是重複付款／重複開票 |

**不要形式化 CRUD、報表、權限 middleware。** seL4 的證明／代碼比是 20:1（8,700 行內核、20 萬行證明、約 20 人年），這種成本只值得用在「錯了會沒命」的地方。

---

## 6. 第四件：變體（第二間公司怎樣用）

**答案不是 fork，是三層：config ⊂ overlay ⊂ core。**

| 層 | 放什麼 | 判準 | 成本 |
|---|---|---|---|
| **config** | 值、標籤、稅率、編號、門檻、開關、顯示隱藏、品牌、模板文字、權限角色、現有流程的參數 | **一個懂業務但不懂寫程式的人，可否填表完成，且不需要新物件？** | O(1) code + O(N) data，升級零 merge |
| **overlay** | 只影響一間公司的新欄位／新物件、外部系統 adapter（A 客用 X 會計、B 客用 Y）、客專屬報表／列印／匯入 | 用 extension point 包住，只新增不改語意 | O(1) core + O(k) overlay |
| **core** | ≥2 間公司要的同一功能（rule of two）、任何改現有流程語意、extension point 本身、migration 機制 | 不屬於任何一間公司 | O(1) |

### 三條硬規則（否則 overlay 會腐化）

1. **禁止 per-customer long-lived branch。** 這是 2004 年就被寫成 anti-pattern 的東西，機制很清楚：第一個客開 branch 看似無痛 → bug fix 要逐個 branch merge → 分歧越大 conflict 越多 → 同一功能在不同 branch 重複開發 → 失去規模經濟。有 2020s 顧問自述：近 **40% 開發時間**用於同步客分支，security patch 由 2 小時變 2 日。
2. **overlay 只 import core，core 永遠不知道 overlay 存在。** 不准 copy core 檔案、不准互相 import。**每次 core 改動，對全部 overlay 跑 build + smoke。** 分歧要在 24 小時內現形，不要半年後在客戶的 production 上現形。
3. **overlay 是負債，要有數。** 每個 overlay 記住它為哪間公司存在、對應哪個缺口。同一功能第二間公司也要 → 按 rule of two 升上 core，overlay 那份刪掉。

### 為甚麼不把差異放進 config

因為 config 一旦要表達規則，它已經是一個程式語言——但沒有型別、沒有測試、沒有 debugger，而且只有你一個人看得懂。這是「配置複雜度時鐘」：hard-code → config → schema → 規則引擎 → DSL → 回到 hard-code，只是用一個更差的語言。

**危險訊號（三個，見到就搬回 code）：**
- config 裡出現 `if A and B then …`
- 一條 config 依賴另一條 config 的值
- 要「先查一張單」才能決定

### 一條紀律總結

**差異要盡量遲綁定：執行時 > 部署時 > 建置時 > fork。** 並把「綁定時間」寫成一張表管理。這是產品線工程唯一值得從大型工業方法論抄過來的東西，其餘工具鏈對一人團隊都是負債。

> 附帶一個官方自認的上限：WordPress 的 child theme 文件自己寫——「在 child theme 裡做大量客製，最終會變成管理惡夢；這種情況通常更適合直接 fork」。**overlay 有個臨界點，過了就是一個沒有 fork 自由的 fork。** 所以第 3 條硬規則（overlay 要有數）不是潔癖，是防止你自己走到那個點。

---

## 7. 單人維護的真正瓶頸是審查，不是寫

| 研究 | 數據 |
|---|---|
| METR RCT（16 名資深開發者、246 個真實 issue） | 用 AI **慢 19%**；開發者事前預測快 24%，事後仍以為自己快 20%。**作者 2026-02 已修正此結論（信號不可靠），但「感知與現實脫節」仍然成立** |
| DORA 2024 | AI 採用率每升 25%，**交付穩定度下降 7.2%** |
| SWE-CI（2026，100 個真實 repo、平均 233 日、71 次連續 commit） | **75% 的模型 zero-regression rate < 0.25**——四次維護三次弄壞原有功能 |

三組數據指向同一件事：**AI 令你寫得快、審得慢，而審查產能才是上限。** 所以預算要由「寫」移到「驗」，而且驗證不能靠 AI 寫的測試（同一個偏差會同時出現在兩邊）。

**具體做法：每個 PR 你只看三樣，看完就 merge 或退回。**

1. **紅區檔案改了幾個？應該永遠是 0。** 不是 0 就問「這個改動為什麼需要碰紅區」。
2. **新增了幾多個物件／工具／Needs 類型？** 對不對得上這次要解決的問題。
3. **驗證階梯跑到哪一級？** L4 有沒有跑、smoke 走了哪幾道門。

三樣之外不看程式碼細節。這不是鬆懈，是承認審查產能有限，把它用在唯一判斷不了的地方——**這個改動是不是我們要的東西**。

---

## 8. 憲章寫在哪、要多長

**格式已收斂：`AGENTS.md`。** 2025-08 發布，2025-12 交由 Linux Foundation 的 Agentic AI Foundation 托管，60,000+ 公開 repo 採用、25+ 工具原生支援；Claude Code 2026-09 起在沒有 CLAUDE.md 時 fallback 讀它。嵌套時「最近者勝」。

**但要認清它買到什麼：** 它買的是**合規性**，不是**安全性**。實證效應極細（人手寫 +4%、自動生成 −3%、成本 +20%），而且會 context rot——同一個答案，300 token 的聚焦 prompt 勝過 113,000 token 的全歷史。

所以憲章 **< 100 行**，只寫三樣：

1. **非標準工具鏈**（怎麼跑起來、怎麼跑驗證、怎麼起一個 variant）
2. **禁區清單**（每一條對應一個 CI gate；對應不到的就刪掉，或搬去 ADR）
3. **ADR index 指針**（不要寫進憲章本體）

**不寫 codebase overview。** 實證上它沒有加快 agent 找到檔案，而且佔用最多的 context。

### ADR 是第二份文件，格式有要求

用 Nygard 那套（title／status／context／decision／consequences），**必須加一節 `Rejected options`**——這一節對 agent 最有用，它防止 agent 重提你已經否決的方案。

三條紀律：
- 每條 ADR 必有 `status`（accepted／superseded）。**舊 ADR 不標 superseded，agent 會當它是現行法律執行**——有案例是 agent 加了一層 abstraction 去遷就一條過時裁決。
- superseded 必須連到取代它的那條，形成鏈。
- agent 開工前只讀 index，然後挑 3–5 條相關的，不讀全部。

（有一組 vendor 自測數據：加 ADR 之後 agent 的「錯誤轉向」由 191 次降到 20 次、token −37%、時間 −22%。方向可信，幅度未確定，別當定論。）

---

## 9. 這份憲章與 Forge 的關係

`09` 說 Forge 只能寫 app 層；這份說的就是**怎麼讓那條界線變成事實，而不是一句願望**。

| `09` 的概念 | 這份文件的落地 |
|---|---|
| Forge 只能寫 app 層 | 紅區用 CODEOWNERS 鎖；Forge 的 service account 沒有紅區寫入權 |
| App Kit 鎖死 80% 骨架 | Kit 產生的檔案帶 generated header，CI 驗 `git diff --exit-code` 為空 |
| 五道機器防護 | 就是第 5 節的驗證階梯（依賴白名單、能力宣告、sandbox、canary、PBT） |
| Probe 問清需求 | 配方 `add-app` 的前置條件 |
| App 生命週期 | `owner`／`last_active` 進 Registry，孤兒偵測開 decision 型 Needs |

---

## 10. 未決定

**已答（v0.2）**：① **Bot 帳號**——GitHub 私有庫＋一個 bot 帳號，agent 開得到 PR 但 merge／approve 不到（理由：自架 Gitea 的 protected branch 與 required checks 不一定齊，會令第 3 節四個手段少一半）；② **第一版做 variant 結構、不做第二個 variant**——目錄、`variant.yaml`、config schema 先存在。

仍然未定：

1. **單一 repo 還是 monorepo 分 packages？** 我傾向單一 repo（一人維護，多 repo 等於多份 CI），但 `core/`／`apps/`／`variants/` 要用 workspace 邊界強制。
2. **驗證階梯用什麼跑？** 一個 `make verify` 還是分層 target？我傾向一個入口，因為 agent 只會記得一個。
3. **TLA+ 那 3–5 個規約由誰寫？** 我可以起草，但需要你確認語意（尤其入帳與 Needs 狀態機）。
4. **ADR 由 agent 寫你只答「值不值得記」，還是你手寫？** 研究裡有人這樣做（四個月累積 141 條），但會有一個風險：agent 寫的 ADR 可能合理化自己的選擇。
5. **`AGENTS.md` 的禁區清單與 CI gate 是否一對一？** 我建議是，但這意味著第一天就要有 6 個 CI gate。

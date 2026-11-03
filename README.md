# company-os

**一間 AI 原生公司的作業系統。** 目標：老闆每天約兩小時處理「批准收件匣」，其餘由 AI agent 與同事完成。

私人 repo。**這裡是唯一權威來源**——如果你在別處看到不同的說法，以這裡為準。

---

## 現在的真實狀態

| 項目 | 狀態 |
|---|---|
| 願景與約束 | 已定案 |
| 要解決什麼問題 | **已寫清楚**（`PROBLEM.md`） |
| 怎樣算解決 | 有七個指標，**但基線全部空白**（`OUTCOMES.md`） |
| 用什麼方法 | 已窮舉 20 個方案並選定次序（`SOLUTION_SPACE.md`） |
| Company OS 引擎 | **可運行**（批准收件匣、政策閘道、審計、Needs） |
| 設計部分的 app | **未開始** |
| 條款自動檢查 | **已用真實影片驗證可行**（`proof/`） |

**一句話：地基與方向清楚了，app 還未開始建。**

---

## 第一次看這個 repo，照這個次序讀

| 次序 | 文件 | 讀完你會知道 |
|---|---|---|
| 1 | `PROJECT_BRIEF.md` | 我們在做什麼、做到哪、下一步 |
| 2 | `PROBLEM.md` | 要解決什麼問題（這一頁不准有解法） |
| 3 | `OUTCOMES.md` | 怎樣算解決，以及哪些基線還是空白 |
| 4 | `SOLUTION_SPACE.md` | 有哪些解法、選了哪個、**否決了什麼與原因** |
| 5 | `PLAYBOOKS/design-delivery.md` | 一份素材由開始到交付的九步流程 |

要接手做計劃的 AI，讀 `HANDOFF.md`（app 逐部分描述）。
要動手改東西的人或 agent，讀 `AGENTS.md`（工作規則與禁止清單）。

---

## 文件地圖

文件分三層。**只有第一層是權威。**

### 第一層：權威（會直接影響決策）

| 文件 | 內容 |
|---|---|
| `PROJECT_BRIEF.md` | 專案簡報：一句話、給誰用、做到哪 |
| `PROBLEM.md` | 問題定義與四層根因（不准有解法） |
| `OUTCOMES.md` | 七個成果指標、量測方法、假成功判準 |
| `SOLUTION_SPACE.md` | 20 個方案、評分、決定、否決原因 |
| `PLAYBOOKS/design-delivery.md` | 品牌素材交付的端到端流程與兩個批准點 |
| `HANDOFF.md` | 交接包：app 逐部分描述（給做計劃的 AI） |
| `HANDOFF-PROMPT.md` | 可直接貼給另一個 AI 的提示詞 |
| `AGENTS.md` | 工作規則、禁止清單、完成的定義 |

### 第二層：規範（屬於硬規則，違反即退回）

| 文件 | 內容 |
|---|---|
| `docs/company-os-design-system.md` | 介面標準：Apple HIG、白底黑 accent、禁 emoji、動效時長 |
| `docs/skill-design.md` | 一個 skill + 漸進揭露路由的設計 |

### 第三層：參考（事實記錄，不會天天讀）

| 文件 | 內容 |
|---|---|
| `docs/agent-account-setup.md` | 專用 agent 帳戶怎樣建 |
| `docs/decisions-log.md` | 決策歷史（ADR）。與第一層衝突時，以第一層為準 |
| `docs/reference/hxdesign-hands-on-findings.md` | 實際跑過參考系統後的五個發現 |
| `docs/reference/hxdesign-boundary.md` | 與參考系統的界線（商業真相 vs 創作真相） |
| `docs/reference/hxdesign-product-model.md` | 參考系統的產品模型（含**未來的**客戶端設計） |
| `docs/reference/tools-verification.md` | 點名的工具逐一查證結果（含找不到的） |
| `docs/reference/super-agent-capabilities.md` | Agent 應該會做什麼 |
| `docs/reference/design-video-capabilities.md` | 設計／影片／圖像能力現況 |

### 第四層：歷史（已淘汰，只供查證）

`docs/archive/` —— 全部已被取代，**不要照它做**。每份檔頭有歸檔原因。

---

## 目錄結構

```
README.md              你在看的這一頁
PROBLEM.md             問題
OUTCOMES.md            成果指標
SOLUTION_SPACE.md      解法與決定
PROJECT_BRIEF.md       專案簡報
HANDOFF.md             交接包（app 逐部分）
HANDOFF-PROMPT.md      給另一個 AI 的提示詞
AGENTS.md              Agent 工作規則
PLAYBOOKS/             每類工作的標準流程
engine/                Company OS 引擎（政策閘道、批准、審計、Needs、MCP）
parts/                 各部門（將來放：目錄 → 專案 → 條款 → 缺口）
skill/                 一個 skill + references/（將來）
config/                公司與品牌設定（將來）
proof/                 條款可被機器檢查的實驗（不要刪）
docs/                  規範、參考、歷史
ops/                   Windows 開機自啟與看門狗腳本
```

---

## 三條鐵律（不因任何理由放寬）

1. **批准只能由人按下。** MCP 永遠不提供 `approve` 工具。
2. **做不到的必須留下痕跡。** 沒有來源的內容不准寫，缺口要進清單或變工單。
3. **失敗要看得到。** 越權要報錯不要回空結果；空畫面要說真話不要放假的。

---

## 不要在這裡找的東西

| 這裡沒有 | 去哪裡 |
|---|---|
| 參考系統的原始碼 | `Subtleinno/Hxdesign`（唯讀，不可改） |
| 客戶端 app | 這一階段不做 |
| ERP／財務／人事／客服 | 後面的部分，未開始 |
| 已上線的生產系統 | 未上線 |

---

## 想動手？

讀 `AGENTS.md`。它寫明開工五步、十個禁止、完成的定義，以及「任務對不到任何成果指標就停下來問」。

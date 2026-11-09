# Company OS 文件入口

這是唯一入口。其他文件與這裡衝突，以這裡為準。

## 這是什麼

Company OS 是 company starter：任何一間公司裝好 Docker 就能開始運作的整套公司軟件。一部機器 = 一間公司；公司由一個 Boss portal 和多個部門 app 組成，程式碼按 app 模組化，容器按版本 profile 打包，共用同一個 Postgres 與 MinIO。AI 盡力做事，做不到的變成 Need 派給員工，老闆驗收。安裝時選國際版或大陸版：國際版有完整的對外入口，大陸版第一階段只做內網。

公司可有多個品牌，每個品牌對應一個品牌 Workspace。公司共用事務直接屬於公司，不建立公司 Workspace；公司範圍不是所有品牌集合。App 是公司工具，Workspace 是品牌工作上下文，不因切換複製 app 或改變資料歸屬、繼承政策及授權。

## 文件地圖

| 檔案 | 內容 |
|---|---|
| `README.md` | 安裝、端口、現況 |
| `AGENTS.md` | 給 AI agent 的開工規則與不變量 |
| `docs/product/MASTER-PLAN.md` | 全盤計劃；第 3.4 節為公司／品牌模式，第 14.1、14.2 節為 Base 及後續 H 系列，第 15.1 節為本輪焦點；歷史快照不當今日狀態 |
| `docs/product/DECISIONS.md` | 決策日誌，後者優先；C41–C45 記錄 Workspace、三模式及整合邊界 |
| `docs/product/BASE-UI-DESIGN.md` | 共用外殼、底座管理 UX、Agent-first、設定、模板及語系；不是完整施工規格 |
| `docs/product/WORKSPACE-APP-SCOPE-DESIGN.md` | 公司／品牌語意、三模式候選互動與接入契約；第十一節列前置規劃交付與依賴分工 |
| `docs/product/BASE-UI-HXDESIGN-ALIGNMENT.md` | Base UI 對照 HxDesign（`eb079b6`）的逐項實測表：來源檔、尺寸、差距、做法、刻意不照搬、未對齊項 |
| `docs/product/FRAME-UIUX-HANDOFF.md` | 共用外殼（Frame）UI/UX 定稿交付 v1.3：外殼行為規格（Logo 貼名稱、據點機器入口喺頁尾左下）、公司型 app 正名 Boss Portal（據點管理歸屬佢，無「底座管理」獨立入口）、後端端點接回指引、Logo 管理撤回待重設計、待裁決定與既有規則衝突；給 development manager AI 拆施工 issue 用。設計定稿，未施工 |
| `docs/design/FRAME-DESIGN-INDEX.md` | 九張 Frame 設計稿索引：Ardot 檔 `745493588675335`、每頁 node ID、`docs/design/frame/*.png` 快照、對應規格章節、施工狀態，同埋可貼去另一個 WorkBuddy session 嘅開工卡。Ardot 圖層係原始真相，PNG 係快照 |
| `docs/product/PERPLEXITY-MANAGER-PROMPT.md` | 畀 Perplexity（PM）用嘅完整 prompt：只開 GitHub issues 唔寫 code；必讀次序、UIUX 大圖、既有 issue 盤點避免撞車、E-00 總綱／F-01 裁決／F-02～F-07／D-01 序列、`Depends-on` 與 `cat:` 規則、loop 協定、本機 Docker 驗收 |
| `docs/planning-loop.md` | 規劃與施工的分工、Depends-on、範疇與並行保護 |
| `docs/testing/DEMO-PUBLIC-TESTING.md` | Demo Public Stack：UI／UX 測試、Demo 帳戶與 Cloudflare Tunnel 的隔離規則 |
| `docs/architecture/CODE-MAP.md` | 目錄、模組、分層、邊界規則、搬遷切片 |
| `docs/architecture/REPO-MAP.md` | 現況對照、入口、容器與端口表 |
| `docs/architecture/APP-DESIGN-TEMPLATE.md` | 每個 app 的設計範本 |
| `apps/<app>/DESIGN.md` | 該 app 的設計（唯一一份；app 建立時才有） |
| `docs/backup-restore.md` | 備份與還原 |
| `docs/app-db-access.md` | app 的資料庫帳號、權限矩陣、PUBLIC 收斂與配置次序 |
| `docs/trusted-entry.md` | 可信 internal 入口、入口憑證、`session.entry` 與升級影響 |

## Base／Workspace 的閱讀與施工閘門

先讀 AGENTS.md、本入口、被指派的 issue，再讀 issue 指定的設計、相關 app 的 AGENTS.md／DESIGN.md 及實際接口與測試。延續 AGENTS.md 的必讀要求，不以本段省略任何必讀文件。

### 文件責任與閱讀次序

涉及 Base／Workspace 時，先讀 MASTER-PLAN 的相關範圍及依賴，再讀 DECISIONS 的適用決策，然後讀 Workspace 核心語意及 Base 共用外殼，最後讀 issue 指定的具體契約與測試。候選互動矩陣只在 Workspace 專題維護，不在各 app 另寫一套；Base 交付目錄與次序以總綱為準。
總綱管理整體計劃與依賴；決策日誌保存理由與修訂關係；Base 定義共用管理 UX；Workspace 專題定義工作上下文、候選互動及前置規劃。這是責任分工，不授權任何文件繞過 AGENTS 不變量或本入口唯一來源。
已批准的新決策定義目標，不代表 runtime 已跟上。與舊主文、實際契約有差異時，由規劃辨別待實作缺口或規格衝突，明列方案及修訂；施工者不得自行揀一份、改權限或另造模型。

### 產品與現有實作分開

公司型只提供公司入口；品牌型主要工作入口必須選品牌；混合型提供公司及品牌入口。模式不自動決定資料歸屬或授權，引用公司設定不等於混合型。未選品牌不等於公司；跨品牌查閱另有契約。
org_unit／org_unit_edge、app_grant、policy 等唯一來源保留。品牌穩定身份、工作上下文、模式宣告及合法範圍解析須先有明確接合方案，不靠任意 type 文字、UnitScope.all、前端模式表或放寬 owner 管理 API 補洞。
模板是特殊建立起點，不是真實品牌或公司範圍。三模式與模板不授權提前設計部門業務，也不新增 MCP 動詞或讓 agent 自行批准。

### 規劃交付與開工條件

按 Workspace 專題第十一節，規劃負責品牌身份、工作上下文、模式宣告與相容、合法範圍解析、共用互動定稿及品牌／模板最小契約；不是只記錄未決或增加停工句。正式外殼與建立品牌頁依賴共同底座，不互相形成循環。
設計文件內的候選矩陣、待核對內容與未決事項不是施工授權。只按依賴已合併、範圍明確的被指派 issue 施工；文件只存在於未合併分支不等於依賴已完成。原型可用明確測試資料，不冒充正式 app、品牌或後端完成。
施工 issue 必須提供可追溯規格章節、文件基線、獨立 Depends-on 行、依賴合併條件、允許修改路徑、確定接口與錯誤／狀態規則、實際驗收指令與證據、不做及停工條件；範疇及並行保護按 planning-loop。未成熟想法留設計文件，一次只展開一張成熟施工 issue。
缺少影響切片的關鍵決策時，由規劃先提出可審查方案；worker 在 issue 提問並停止相關實作，不猜 API、角色、資料歸屬或預設品牌。若發現要改其他模組或 migration，先按規則拆獨立工作，不順手擴範圍。

### 驗證與狀態

驗收須覆蓋正常、取消、失敗及負面案例；跨品牌切換另核對目標一致、慢回應、未保存、深連結、多分頁及權限失效，並有白／深色、窄螢幕與鍵盤證據。具體命令、測試與預期結果由各 issue 依實際 repo 指定；未執行明示，不捏造輸出。
文件提交、原型通過、程式測試、PR 就緒、獨立驗收、合併及產品完成分開回報。總綱的歷史進度與估算保留日期，不用來推斷今日 GitHub 狀態或新工期。
本輪五份主文件的語意與入口對齊，不代表全部技術契約、原型、安全審查或 issue 同步已完成；受影響 issues 仍須逐張核對。B-12/H-12 責任先釐清，不建立兩個設定來源；H 系列在 Base 之後。文件更新不授權開發、部署或合併 main。

## 一個真相，一個方向

每個東西只有一個來源、一個流向。同一個事實存在兩處，其中一處就會悄悄過時。

| 事實 | 唯一來源 | 流向 |
|---|---|---|
| 有哪些 app 與導航 | `apps/<app>/manifest.json` | manifest → platform 的 app 註冊 → 我的 Apps |
| app 的路由與對外程度 | `apps/<app>/manifest.json`（`route`、`exposure`、`sensitive`） | manifest → gateway 路由表（CI 檢查一致） |
| 版本差異（入口、容器組合、端口、渠道、預設語言） | `packages/edition-profile` | edition-profile → compose、`.env.example`、`ports:check`、安裝精靈 |
| 目錄、模組與邊界規則 | `docs/architecture/CODE-MAP.md` | 規則 → `lint:boundaries` |
| 容器端口表 | `docs/architecture/REPO-MAP.md` | 文件 → edition-profile 對照檢查 |
| session 從哪個入口登入 | `auth_session.entry` | gateway 寫入 → app 驗證是否接受 |
| 哪些請求算「可信入口」 | `INTERNAL_GATEWAY_TOKEN`（只注入 gateway 與 platform） | gateway 覆寫標頭 → platform 驗證 → 寫入 `auth_session.entry` |
| 誰能進哪個 app | `app_grant` 表 | 資料庫 → platform 介面 → 各 app、我的 Apps |
| 資料形狀 | `db/migrations/<schema>/*.sql` | migration → 資料庫 → API |
| 誰可以做什麼 | `packages/policy` | policy → API → 拒絕理由 |
| 色字間距與共用元件 | `packages/design-tokens`、`packages/ui-kit` | tokens → 生成 CSS → 元件 |
| 公司設定、發件規則、門檻 | `company_setting`、`policy_rule` | 資料庫 → platform 介面 → UI、worker |
| 公司結構（brand、分部、法人） | `org_unit`、`org_unit_edge` | 資料庫 → platform 介面；品牌 Workspace 的穩定身份接合須先定契約，不另建品牌副本 |
| 我是誰（員工、夥伴） | `app_user` | 資料庫 → `GET /me`（auth/routes.ts 已讀入口；不另造身份來源） |
| 客戶是誰（國際版） | `customer_account`（與員工帳戶分開） | 資料庫 → customer-portal |
| 登入狀態 | `auth_session`（只存 token 的 SHA-256） | cookie → session |
| Need 的內容 | `need` | 資料庫 → platform 介面 → UI／MCP |
| Need 的狀態、逾期 | `need_event`（只追加）加 `due_at`，現算 | 查詢計算，不存 |
| Need 編號 | `COS-<安裝代碼>-###`，每個安裝一條序列 | 資料庫 → 介面輸出 |
| 成果檔案 | `stored_file` 加 MinIO | 單一位置，無副本 |
| 對外訊息及其批准 | `outbox`、`outbox_version`、`approval` | 草稿 → 政策 → 批准 → worker 送出 |
| 通知渠道設定 | `notification_channel`（憑證加密） | 資料庫 → worker |
| 隊列工作 | `job` | 資料庫 → worker |
| MCP token | `mcp_token`（只存 SHA-256） | 建立時顯示一次 |
| 各 app 的摘要數字 | 該 app 的摘要介面 | app → Boss portal（Boss portal 不讀別人的資料表） |
| app 的資料庫帳號與權限 | `npm run db:app-access`（角色名由 app id 決定） | 工具 → Postgres ACL → app-host |
| 審計 | `audit_log`（trigger 只准追加） | 只能寫入 |
| 被刪除的東西 | `deleted_at` | 回收桶 |
| 備份 | `BACKUP_ROOT` 的備份目錄加 manifest | 見 `docs/backup-restore.md` |

本表描述各領域唯一來源，不代表每項已有可用 API、UI 或已通過驗收。模式宣告及工作上下文的新契約尚待規劃，不在此假造 runtime 來源。
前端不准擁有自己的資料副本。API 沒回傳，畫面就顯示空狀態，不是顯示一個看起來合理的數字；若原因是拒絕或失敗則明示，不偽裝無資料。

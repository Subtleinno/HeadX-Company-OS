# Company OS 文件入口

這是唯一入口。其他文件與這裡衝突，以這裡為準。

## 這是什麼

Company OS 是 company starter：任何一間公司裝好 Docker 就能開始運作的整套公司軟件。一部機器 = 一間公司；公司由一個 Boss portal 和多個部門 app 組成，程式碼按 app 模組化，容器按版本 profile 打包，共用同一個 Postgres 與 MinIO。AI 盡力做事，做不到的變成 Need 派給員工，老闆驗收。安裝時選國際版或大陸版：國際版有完整的對外入口，大陸版第一階段只做內網。

## 文件地圖

| 檔案 | 內容 |
|---|---|
| `README.md` | 安裝、端口、現況 |
| `AGENTS.md` | 給 AI agent 的開工規則與不變量 |
| `docs/product/MASTER-PLAN.md` | 全盤計劃：架構、資料模型、權限、issue 清單、里程碑 |
| `docs/product/DECISIONS.md` | 決策日誌（後者優先） |
| `docs/product/BASE-UI-DESIGN.md` | Base 共用外殼與管理介面方向；不是完整施工規格 |
| `docs/product/WORKSPACE-APP-SCOPE-DESIGN.md` | 公司、品牌 Workspace、三模式 app 及選擇器候選互動；產品定義與待核對方案分開 |
| `docs/planning-loop.md` | 規劃與施工的分工：PM、Project、issue 與驗收 |
| `docs/architecture/CODE-MAP.md` | 目錄、模組、分層、邊界規則、搬遷切片 |
| `docs/architecture/REPO-MAP.md` | 現況對照、入口、容器與端口表 |
| `docs/architecture/APP-DESIGN-TEMPLATE.md` | 每個 app 的設計範本 |
| `apps/<app>/DESIGN.md` | 該 app 的設計（唯一一份；app 建立時才有） |
| `docs/backup-restore.md` | 備份與還原 |
| `docs/app-db-access.md` | app 的資料庫帳號、權限矩陣、PUBLIC 收斂與配置次序 |
| `docs/trusted-entry.md` | 可信 internal 入口、入口憑證、`session.entry` 與升級影響 |

## Base／Workspace 的閱讀與施工閘門

先讀 AGENTS.md、本入口、被指派的 issue，再讀 issue 指定的設計、相關 app 的 AGENTS.md／DESIGN.md 及實際接口與測試。延續 AGENTS.md 的必讀要求，不以本段省略任何必讀文件。

涉及 Workspace 時，先讀 WORKSPACE-APP-SCOPE-DESIGN.md 的核心語意，再讀 BASE-UI-DESIGN.md 的共用外殼。品牌 Workspace 一個對應一個品牌；公司範圍不是公司 Workspace，也不是所有品牌集合。三模式定義工作入口與切換，不自動決定資料歸屬或授權。

Workspace 專題澄清 Base 第七節「全公司／全部品牌」的早期含糊建議；不改變本入口所列 org_unit／org_unit_edge、app_grant、policy 等既有唯一來源。與總綱、決策、實際契約存在衝突時先列差異，在 issue 提問並停止相關實作，不自行選一套或另造模型。

設計文件內的候選矩陣、待核對內容與未決事項不是施工授權。只按依賴已合併、範圍明確的被指派 issue 施工；文件只存在於未合併分支不等於依賴已完成。不因有 app／範圍選擇器便提前開發任何部門業務。

施工 issue 必須提供可追溯的規格章節、依賴及合併條件、允許修改範圍、已核實接口與錯誤／狀態規則、驗收指令及證據要求、不做事項。缺少會影響本切片的決策時先澄清，不讓 agent 猜 API、角色、資料歸屬或預設品牌。未成熟想法先留設計文件，不當作已可施工需求。

驗收須覆蓋正常、取消、失敗及負面案例；跨品牌切換另外核對目標一致、慢回應、未保存、深連結及權限失效。具體命令、測試與預期結果由各 issue 依實際 repo 指定；未執行就明示。文件提交、原型通過、程式測試及產品完成是不同狀態，不互相代替。

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
| 公司結構（brand、分部、法人） | `org_unit`、`org_unit_edge` | 資料庫 → platform 介面 |
| 我是誰（員工、夥伴） | `app_user` | 資料庫 → `GET /auth/me` |
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

前端不准擁有自己的資料副本。API 沒回傳，畫面就顯示空狀態，不是顯示一個看起來合理的數字。

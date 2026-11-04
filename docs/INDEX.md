# Company OS 文件入口

這是唯一入口。其他文件與這裡衝突，以這裡為準。

## 這是什麼

Company OS 是 company starter：任何一間公司裝好 Docker 就能開始運作的整套公司軟件。一部機器 = 一間公司；公司由一個 Boss portal 和多個部門 app 組成，每個 app 一個容器，共用同一個 Postgres 與 MinIO。AI 盡力做事，做不到的變成 Need 派給員工，老闆驗收。

## 文件地圖

| 檔案 | 內容 |
|---|---|
| `README.md` | 安裝、端口、現況 |
| `AGENTS.md` | 給 AI agent 的開工規則與不變量 |
| `docs/product/MASTER-PLAN.md` | 全盤計劃：架構、資料模型、權限、issue 清單、里程碑 |
| `docs/product/DECISIONS.md` | 決策日誌（後者優先） |
| `docs/architecture/REPO-MAP.md` | 目錄結構、邊界規則、容器清單 |
| `docs/architecture/APP-DESIGN-TEMPLATE.md` | 每個 app 的設計範本 |
| `apps/<app>/DESIGN.md` | 該 app 的設計（唯一一份；app 建立時才有） |
| `docs/backup-restore.md` | 備份與還原 |

## 一個真相，一個方向

每個東西只有一個來源、一個流向。同一個事實存在兩處，其中一處就會悄悄過時。

| 事實 | 唯一來源 | 流向 |
|---|---|---|
| 有哪些 app 與導航 | `apps/<app>/manifest.json` | manifest → platform 的 app 註冊 → 我的 Apps |
| 誰能進哪個 app | `app_grant` 表 | 資料庫 → platform 介面 → 各 app、我的 Apps |
| 資料形狀 | `db/migrations/<schema>/*.sql` | migration → 資料庫 → API |
| 誰可以做什麼 | `packages/policy` | policy → API → 拒絕理由 |
| 色字間距與共用元件 | `packages/design-tokens`、`packages/ui-kit` | tokens → 生成 CSS → 元件 |
| 公司設定、發件規則、門檻 | `company_setting`、`policy_rule` | 資料庫 → platform 介面 → UI、worker |
| 公司結構（brand、分部、法人） | `org_unit`、`org_unit_edge` | 資料庫 → platform 介面 |
| 我是誰 | `app_user` | 資料庫 → `GET /auth/me` |
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
| 審計 | `audit_log`（trigger 只准追加） | 只能寫入 |
| 被刪除的東西 | `deleted_at` | 回收桶 |
| 備份 | `BACKUP_ROOT` 的備份目錄加 manifest | 見 `docs/backup-restore.md` |

前端不准擁有自己的資料副本。API 沒回傳，畫面就顯示空狀態，不是顯示一個看起來合理的數字。

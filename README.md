# company-os

全公司軟件的專案骨架：Fastify API、React 前端、Postgres（pgvector）、MinIO 檔案儲存，全部以 Docker Compose 起動。

## 需求

- Node.js 26.13.0（見 `.nvmrc`）
- Docker Desktop（目標是長期開機的 Windows 機）

## 首次啟動

在 repo 根目錄執行：

```powershell
copy .env.example .env
npm ci
npm run ports:check
docker compose up -d --build
```

**首次啟動前必須在 `.env` 內的 `POSTGRES_PASSWORD` 與 `MINIO_ROOT_PASSWORD` 填入自己的密碼** —— 範本刻意留空，沒有可用的預設值；留空時 `docker compose` 會即時失敗，不會起一個弱密碼的服務。

前端：<http://localhost:4210>；API：<http://localhost:4420/livez>。所有端口只綁 `127.0.0.1`，區網內其他機器連不到。

`npm run ports:check` 會檢查 `.env` 內的端口能否綁定，再探測有沒有人正在回應（容器發佈的端口「綁得上」但其實已被佔用，所以兩樣都要查）；有衝突或無法確認會列出原因，並以 exit 1 結束。

## 端口

| 服務 | `.env` 變數 | 預設 |
| --- | --- | --- |
| web | `WEB_PORT` | 4210 |
| api | `API_PORT` | 4420 |
| db | `DB_PORT` | 25432 |
| storage（S3 API） | `PORT_MINIO_API` | 29000 |
| storage（console） | `PORT_MINIO_CONSOLE` | 29001 |

## 檔案儲存

MinIO，版本與 HxDesign 相同：server `RELEASE.2025-10-15T17-29-55Z`、mc `RELEASE.2025-08-13T08-35-41Z`。上游不再發佈 Docker 映像，所以由 `docker/minio/Dockerfile` 在本機用官方原始碼的固定 tag 編譯（首次建置要數分鐘，需要連 github.com 與 Docker Hub）。授權是 AGPL-3.0，未修改原始碼，私有自架。

資料放在 Windows 資料夾（bind mount），不是 Docker volume。這是刻意的：檔案是唯一無法重新生成的資料，`docker compose down -v` 不可以刪得到它。

```
# .env
MINIO_DATA_DIR=D:/company-os-data/minio
```

Windows 路徑用正斜線。換硬碟只是改這一行；備份工具直接指向這個資料夾即可。留空時用 repo 內的 `./.data/minio`（已在 `.gitignore`），只適合試用。

**不要自己在這個資料夾放檔案。** MinIO 每個物件都是一個資料夾（內含 `xl.meta` 等檔案），手動放進去的檔案不會出現在 bucket 裡，也不會被讀到。

證明資料真的留在資料夾：

```powershell
npm run storage:smoke -- write
docker compose down -v
docker compose up -d
npm run storage:smoke -- verify
```

`write` 寫入 `_smoke/persist-check.txt`，`verify` 確認它仍然存在。console：<http://127.0.0.1:29001>（只綁本機）。

## 資料庫

Migration 是 `db/migrations/NNNN_說明.sql` 的純 SQL，API 啟動時自動套用；套不上就結束，不會起一個 schema 不完整的服務。

- 只往前加：已套用的檔案永不修改（內容一變就拒絕啟動），新檔編號接續，不可以跳號。
- 加一個 migration：新增 `db/migrations/0002_xxx.sql`，重啟 api 就會套用。
- `audit_log` 只准追加：UPDATE／DELETE／TRUNCATE 由 trigger 擋掉（SQLSTATE `42501`）。
- 整合測試用臨時資料庫 `co_test_<隨機>`，不寫入正式資料庫。

## 模組

「有哪些部門軟件」只有一個來源：`modules/<id>/manifest.json`。加資料夾就是安裝，刪資料夾就是卸載，重啟 api 生效（沒有熱重載）。

- 六個欄位：`id`（等於資料夾名）、`title`、`kind`（`console` 或 `department`）、`department`（部門模組必填，老闆台是 `null`）、`order`、`available`。
- `available: false` 代表那個軟件尚未建立，網站會照實說，不會給一個按了沒反應的入口。
- 載入時驗證：JSON 合法、欄位齊全、無未知欄位、id 等於資料夾名且格式正確、id 與 department 不重複、只有一個 console、`modules/` 下沒有孤立檔案。任何一項不合格就印出哪個檔、哪個欄位，並以 exit 1 結束。
- `GET /modules`：未登入 401；老闆見全部並依 `order` 排序；員工只見到自己部門那一個。

## 測試

```powershell
npm test                 # 單元測試（CI 跑這一個）
npm run test:integration # 整合測試，需要 storage 在跑
npm run lint
npm run build
```

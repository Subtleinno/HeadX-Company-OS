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

## 測試

```powershell
npm test                 # 單元測試（CI 跑這一個）
npm run test:integration # 整合測試，需要 storage 在跑
npm run lint
npm run build
```

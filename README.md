# company-os

全公司軟件的專案骨架：Fastify API、React 前端、Postgres（pgvector），全部以 Docker Compose 起動。

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

**首次啟動前必須在 `.env` 內的 `POSTGRES_PASSWORD` 填入自己的密碼** —— 範本刻意留空，沒有可用的預設值；留空時 `docker compose` 會即時失敗，不會起一個弱密碼的資料庫。

前端：<http://localhost:4210>；API：<http://localhost:4420/livez>。三個端口只綁 `127.0.0.1`，區網內其他機器連不到。

`npm run ports:check` 會檢查 `.env` 內的端口能否綁定，再探測有沒有人正在回應（容器發佈的端口「綁得上」但其實已被佔用，所以兩樣都要查）；有衝突或無法確認會列出原因，並以 exit 1 結束。

## 端口

| 服務 | `.env` 變數 | 預設 |
| --- | --- | --- |
| web | `WEB_PORT` | 4210 |
| api | `API_PORT` | 4420 |
| db | `DB_PORT` | 25432 |

## 測試

```powershell
npm test
npm run lint
npm run build
```

# 目錄結構與邊界

## 目標結構

```
company-os/
├── AGENTS.md  README.md  docker-compose.yml
├── apps/                         每個子資料夾 = 一個容器
│   ├── gateway/                  單一入口：路徑分流、HTTPS、cookie、Origin
│   ├── platform/                 身份、授權、設定、組織、Need、發件箱、通知、MCP、審計、隊列
│   │   ├── src/api/  src/web/    登入頁、我的 Apps、我的 Needs、設定
│   │   └── src/worker.ts         同一映像的第二個啟動入口
│   ├── boss-portal/              老闆的入口：今日、批准、各部門摘要、質素、資金
│   ├── employees/                員工名冊與 app 授權
│   ├── design/  sales/  ops-finance/  hr/  support/   部門 app（日後可再加，例如 research-dev）
│   └── <app>/  manifest.json  DESIGN.md  AGENTS.md  Dockerfile  src/api  src/web  tests/
├── packages/
│   ├── contracts/                跨 app 共用的型別與驗證（不放邏輯）
│   ├── platform-kit/             各 app 呼叫 platform 的客戶端、session 驗證
│   ├── policy/                   權限引擎（純函數）
│   ├── design-tokens/  ui-kit/   色字間距與共用元件
├── db/migrations/<schema>/       每個 schema 獨立編號，只往前加
├── profiles/default/             乾淨的 starter 預設；公司特有設定另放
├── e2e/  ops/  dev/  docker/  docs/
```

## 現況對照（2026-11-04）

| 現在 | 之後 |
|---|---|
| `apps/api` | `apps/platform`（改名；`src/auth`、`src/files`、`src/storage`、`audit.ts`、`migrate.ts` 保留） |
| `apps/web` | 登入、首次開機、外殼 → `apps/platform/src/web`；「今日」→ `apps/boss-portal` |
| `apps/api/src/modules`（載入器） | `apps/platform/src/registry`，避免與部門撞名 |
| `modules/<dept>/manifest.json` | `apps/<app>/manifest.json` |
| `scripts/` | `ops/`（backup、ports-check、storage-smoke）與 `dev/` |
| `db/migrations/000N_*.sql` | 既有檔案不搬、不改；新 schema 從 `db/migrations/<schema>/0001_*.sql` 開始 |

以上搬遷由 S1-01 執行；在它合併之前，README 描述的是現況。

## 邊界規則（CI 強制）

1. app 之間不可互相 import。
2. app 只可以用 `packages/*` 與 platform 的介面。
3. platform 不引用任何 app。
4. app 不讀別的 app 的資料表；跨 app 只經 platform 介面或摘要介面。
5. `packages/contracts` 只放型別與驗證，不放邏輯。
6. 每個 app 的資料庫帳號只能存取自己的 schema 與 platform 開放的介面。

## 容器與端口

端口規則：

1. 使用者與員工日常只連 gateway。
2. 每個容器在容器內一律監聽 8080。
3. 主機端口一律只綁 `127.0.0.1`，可由 `.env` 覆寫，由 `ports:check` 檢查。
4. 每個 app 的 `manifest.json` 宣告自己的 `route`、`debugPort`、`sensitive`。gateway 路由、compose、`.env.example`、`ports:check` 全部由 manifest 對照，CI 檢查四者一致。
5. 預設只發佈 gateway、platform、db、storage。部門 app 預設不發佈主機端口，只在 compose profile `debug` 才發佈 `debugPort`。
6. 新增 app 由 `new:app` 自動取下一個 `debugPort`；兩個 app 宣告同一個端口，`ports:check` 失敗。

| 容器 | `.env` 變數 | 預設 | 預設發佈 | gateway 路由 |
|---|---|---|---|---|
| gateway | `GATEWAY_PORT` | 4210 | 是（日常入口） | `/` |
| platform | `PLATFORM_PORT` | 4420 | 是（維運與 MCP 測試） | `/auth`、`/api`、`/mcp` |
| boss-portal | `BOSS_PORTAL_DEBUG_PORT` | 4431 | 否（debug） | `/boss` |
| employees | `EMPLOYEES_DEBUG_PORT` | 4432 | 否（debug） | `/employees` |
| design | `DESIGN_DEBUG_PORT` | 4433 | 否（debug） | `/design` |
| sales | `SALES_DEBUG_PORT` | 4434 | 否（debug） | `/sales` |
| ops-finance | `OPS_FINANCE_DEBUG_PORT` | 4435 | 否（debug） | `/ops-finance` |
| hr | `HR_DEBUG_PORT` | 4436 | 否（debug） | `/hr` |
| support | `SUPPORT_DEBUG_PORT` | 4437 | 否（debug） | `/support` |
| research-dev（預留） | `RESEARCH_DEV_DEBUG_PORT` | 4438 | 否（debug） | `/research-dev` |
| worker | 無 | — | — | — |
| db（Postgres） | `DB_PORT` | 25432 | 是 | — |
| storage（MinIO） | `PORT_MINIO_API`、`PORT_MINIO_CONSOLE` | 29000、29001 | 是 | — |

4431 至 4499 保留給 app。與現況的關係：現在的 web（4210）成為 gateway，api（4420）成為 platform，數字不變，使用者習慣的網址不變。

manifest 欄位：現有六欄位（`id`、`title`、`kind`、`department`、`order`、`available`）加上 `route`、`debugPort`、`sensitive`。載入器目前拒絕未知欄位，由 S1-01 一併放寬並加測試。

## 新增一個 app

`npm run new:app <名稱>`（S5-00 完成後）會產生資料夾、Dockerfile、manifest、`DESIGN.md`、`AGENTS.md`、資料庫 schema、gateway 路由、compose 服務、`.env.example` 的端口變數和「我的 Apps」入口。`compose profile` 決定這部機啟動哪些 app。

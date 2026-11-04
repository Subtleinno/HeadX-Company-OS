# 目錄結構與邊界

## 目標結構

```
company-os/
├── AGENTS.md  README.md  docker-compose.yml
├── apps/                         每個子資料夾 = 一個容器（gateway 是一個映像、三個實例）
│   ├── gateway/                  入口：路徑分流、HTTPS、cookie、Origin、入口標記
│   ├── platform/                 身份、授權、設定、組織、Need、發件箱、通知、MCP、審計、隊列
│   │   ├── src/api/  src/web/    登入頁、我的 Apps、我的 Needs、設定
│   │   └── src/worker.ts         同一映像的第二個啟動入口
│   ├── boss-portal/              老闆的入口：今日、批准、各部門摘要、質素、資金
│   ├── employees/                員工名冊與 app 授權
│   ├── design/  sales/  ops-finance/  hr/  support/   部門 app（日後可再加，例如 research-dev）
│   ├── customer-portal/          B2C 客戶入口（獨立容器、獨立 schema）
│   ├── supplier-portal/          供應商入口
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
7. 對客戶與供應商開放的 app 是獨立的 portal app，不與後台 app 共用容器、session 或 cookie；後台資料只經 platform 介面流入或流出。

## 入口與對外程度

三種對象，三個入口。gateway 是同一個映像、三個實例，只有路由表不同。

| 入口 | 對象 | 登入 | 能進的 app |
|---|---|---|---|
| gateway-internal | 內網員工（含 VPN） | Company OS 登入 | 全部 |
| gateway-partner | 外地員工、B2B 夥伴、供應商 | Cloudflare Access 加 Company OS 登入 | `exposure` 為 partner 的 app |
| gateway-customer | B2C 客戶 | 客戶自己的帳戶；Cloudflare WAF 限流加 Turnstile，不經 Access | `exposure` 為 customer 的 app |

- cloudflared 只指向 gateway-partner 與 gateway-customer，規則最後一條是 404。app 容器與 gateway-internal 不對外。
- 每個 app 的 manifest 宣告 `exposure`：`internal`（預設）、`partner`、`customer`。
- session 記錄入口（`entry`）。接受規則：

| app 的 exposure | 接受的 session entry |
|---|---|
| internal | internal |
| partner | internal、partner |
| customer | customer |

- 三個 gateway 都會清掉請求裡自帶的入口標記，再寫上自己的值。
- 預設對外程度（臨時答案）：internal = boss-portal、employees、ops-finance、hr、research-dev；partner = sales、support、design、supplier-portal；customer = customer-portal。platform 的登入頁與「我的 Needs」在 partner 入口可用，管理與審計頁只在 internal。

## 容器與端口

端口規則：

1. 內網員工日常連 gateway-internal；對外只經隧道連 gateway-partner 與 gateway-customer。
2. 每個容器在容器內一律監聽 8080。
3. 主機端口一律只綁 `127.0.0.1`，可由 `.env` 覆寫，由 `ports:check` 檢查。
4. 每個 app 的 `manifest.json` 宣告自己的 `route`、`debugPort`、`exposure`、`sensitive`。gateway 路由、compose、`.env.example`、`ports:check` 全部由 manifest 對照，CI 檢查四者一致。
5. 所有 app 預設發佈自己的 `debugPort`（只綁本機），方便單獨開發、測試與更新；這些端口絕不對外。
6. 新增 app 由 `new:app` 自動取下一個 `debugPort`；兩個 app 宣告同一個端口，`ports:check` 失敗。

| 容器 | `.env` 變數 | 預設 | exposure | gateway 路由 |
|---|---|---|---|---|
| gateway-internal | `GATEWAY_INTERNAL_PORT` | 4210 | — | `/` |
| gateway-partner | `GATEWAY_PARTNER_PORT` | 4211 | — | `/` |
| gateway-customer | `GATEWAY_CUSTOMER_PORT` | 4212 | — | `/` |
| cloudflared | 無 | — | — | — |
| platform | `PLATFORM_PORT` | 4420 | — | `/auth`、`/api`、`/mcp` |
| boss-portal | `BOSS_PORTAL_DEBUG_PORT` | 4431 | internal | `/boss` |
| employees | `EMPLOYEES_DEBUG_PORT` | 4432 | internal | `/employees` |
| design | `DESIGN_DEBUG_PORT` | 4433 | partner | `/design` |
| sales | `SALES_DEBUG_PORT` | 4434 | partner | `/sales` |
| ops-finance | `OPS_FINANCE_DEBUG_PORT` | 4435 | internal | `/ops-finance` |
| hr | `HR_DEBUG_PORT` | 4436 | internal | `/hr` |
| support | `SUPPORT_DEBUG_PORT` | 4437 | partner | `/support` |
| research-dev（預留） | `RESEARCH_DEV_DEBUG_PORT` | 4438 | internal | `/research-dev` |
| customer-portal | `CUSTOMER_PORTAL_DEBUG_PORT` | 4439 | customer | `/` |
| supplier-portal | `SUPPLIER_PORTAL_DEBUG_PORT` | 4440 | partner | `/supplier` |
| worker | 無 | — | — | — |
| db（Postgres） | `DB_PORT` | 25432 | — | — |
| storage（MinIO） | `PORT_MINIO_API`、`PORT_MINIO_CONSOLE` | 29000、29001 | — | — |

4431 至 4499 保留給 app。與現況的關係：現在的 web（4210）成為 gateway-internal，api（4420）成為 platform，數字不變。

manifest 欄位：現有六欄位（`id`、`title`、`kind`、`department`、`order`、`available`）加上 `route`、`debugPort`、`exposure`、`sensitive`。載入器目前拒絕未知欄位，由 S1-01 一併放寬並加測試。

## 新增一個 app

`npm run new:app <名稱>`（S5-00 完成後）會產生資料夾、Dockerfile、manifest、`DESIGN.md`、`AGENTS.md`、資料庫 schema、gateway 路由、compose 服務、`.env.example` 的端口變數和「我的 Apps」入口。`compose profile` 決定這部機啟動哪些 app。

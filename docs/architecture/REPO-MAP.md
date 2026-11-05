# 入口、容器與端口

目錄結構、模組、分層與邊界規則只在 `docs/architecture/CODE-MAP.md`；這份只放現況對照、入口與容器端口表。

## 現況對照（2026-11-04）

| 現在 | 之後 | 切片 |
|---|---|---|
| `apps/api` | `apps/platform`（改名；`src/auth`、`src/files`、`src/storage`、`audit.ts`、`migrate.ts` 保留） | R2 |
| `apps/web` | 登入、首次開機、外殼 → platform；「今日」→ `apps/boss-portal`；共用元件 → `packages/ui-kit`、`packages/app-shell` | R3 |
| `apps/api/src/modules`（載入器） | `apps/platform/src/modules/registry` | R4 |
| `modules/<dept>/manifest.json` | `apps/<app>/manifest.json` | R4 |
| `db/migrations/000N_*.sql` | 既有檔案不搬、不改；新 schema 從 `db/migrations/<schema>/0001_*.sql` 開始 | R5 |
| 單一 web 加單一 api 的 compose | 多容器 compose、app-host、edition-profile | R6 |
| `scripts/` | `ops/`（backup、ports-check、storage-smoke）與 `dev/` | R6 |

在這些切片合併之前，README 描述的是現況。

## 入口與對外程度

入口按版本而定。gateway 是同一個映像，按版本 profile 起不同實例，只有路由表不同。

| 入口 | 對象 | 登入 | 能進的 app | 大陸版 | 國際版 |
|---|---|---|---|---|---|
| gateway-internal | 內網員工（含 VPN） | Company OS 登入 | 全部 | 有 | 有 |
| gateway-partner | 外地員工、B2B 夥伴、供應商 | Cloudflare Access 加 Company OS 登入 | `exposure` 為 partner 的 app | 無 | 有 |
| gateway-customer | B2C 客戶 | 客戶自己的帳戶；Cloudflare WAF 限流加 Turnstile，不經 Access | `exposure` 為 customer 的 app | 無 | 有 |

- 大陸版沒有 cloudflared 與對外 gateway，session 的 `entry` 只有 internal 一個值。
- 國際版：cloudflared 只指向 gateway-partner 與 gateway-customer，規則最後一條是 404；app 容器與 gateway-internal 不對外。
- 每個 app 的 manifest 宣告 `exposure`：`internal`（預設）、`partner`、`customer`。接受規則：

| app 的 exposure | 接受的 session entry |
|---|---|
| internal | internal |
| partner | internal、partner |
| customer | customer |

- 三個 gateway 都會清掉請求裡自帶的入口標記，再寫上自己的值。
- 預設對外程度（臨時答案，國際版）：internal = boss-portal、employees、ops-finance、hr、research-dev；partner = sales、support、design、supplier-portal；customer = customer-portal。platform 的登入頁與「我的 Needs」在 partner 入口可用，管理與審計頁只在 internal。

## 容器與端口

端口規則：

1. 端口按容器宣告，不按 app。端口與容器組合由 `edition-profile` 決定，`.env` 可覆寫。
2. 每個容器在容器內一律監聽 8080。
3. 主機端口預設只綁 `127.0.0.1`。唯一例外是 gateway-internal：它綁管理者選定的 LAN 位址，並配合主機防火牆限制公司子網，讓同事的電腦能連線。Docker 在沒有指定位址時會把端口綁到所有網絡介面，所以安裝器不可使用未指定位址的設定。
4. app 容器、platform、資料庫與 MinIO 的端口永不對 LAN 或互聯網發佈。
5. 單獨開發、測試或更新某個 app：用 `APP_SET=<該 app>` 起一個 app-host，使用開發用的本機端口。
6. `ports:check` 按目前版本的 edition-profile 檢查端口能否綁定、有沒有人佔用（Windows 上會指出佔用的程序與 PID；識別不到就明說），並確認 compose 與 `.env.example` 一致。

| 容器 | `.env` 變數 | 預設 | 大陸版 | 國際版 |
|---|---|---|---|---|
| gateway-internal | `GATEWAY_INTERNAL_PORT` | 4210 | 有 | 有 |
| gateway-partner | `GATEWAY_PARTNER_PORT` | 4211 | 無 | 有 |
| gateway-customer | `GATEWAY_CUSTOMER_PORT` | 4212 | 無 | 有 |
| cloudflared | 無 | — | 無 | 有 |
| platform（含 worker） | `PLATFORM_PORT` | 4420 | 有 | 有 |
| apps（全部 app） | `APPS_PORT` | 4431 | 有 | 無 |
| apps-internal | `APPS_INTERNAL_PORT` | 4431 | 無 | 有 |
| apps-partner | `APPS_PARTNER_PORT` | 4432 | 無 | 有 |
| supplier-portal | `SUPPLIER_PORTAL_PORT` | 4433 | 無 | 有 |
| customer-portal | `CUSTOMER_PORTAL_PORT` | 4434 | 無 | 有 |
| db（Postgres） | `DB_PORT` | 25432 | 有 | 有 |
| storage（MinIO） | `PORT_MINIO_API`、`PORT_MINIO_CONSOLE` | 29000、29001 | 有 | 有 |

4431 至 4499 保留給 app 容器。與現況的關係：現在的 web（4210）成為 gateway-internal，api（4420）成為 platform，數字不變；以上是 R6 完成後的目標，現在 README 的端口表仍是現況。

## 新增一個 app

`npm run new:app <名稱>`（S5-00 完成後）會產生資料夾、manifest、`DESIGN.md`、`AGENTS.md`、資料庫 schema、gateway 路由、edition-profile 的容器歸屬和「我的 Apps」入口。啟用哪些 app 由 edition-profile 與 compose profile 決定。

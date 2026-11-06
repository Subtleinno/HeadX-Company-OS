# 入口、容器與端口

目錄結構、模組、分層與邊界規則只在 `docs/architecture/CODE-MAP.md`；這份只放現況對照、入口與容器端口表。

## 現況對照（2026-11-06）

R1 至 R6、R8 已合併。下表是每一片在 `main` 上的實際結果，按 GitHub 的 issue 與目錄實況核對；「目標」代表尚未做到。

| 切片 | issue | 實際結果 |
|---|---|---|
| R1 | #71 | 邊界檢查與 `lint:boundaries` 已加入，並附故意違反的測試 |
| R2 | #72 | `apps/api` 已改名 `apps/platform` |
| R3 | #73 | 只做了一半：抽出 `packages/design-tokens`、`ui-kit`、`app-shell`、`i18n`（issue 標題：網站外觀與行為不變）。`apps/web` 仍是完整的 Vite 前端加 nginx，登入、首次開機與外殼沒有搬進 platform，「今日」沒有搬到 `apps/boss`。這部分仍是目標，未見對應 issue |
| R4 | #74 | manifest 已搬到 `apps/<id>/manifest.json`，載入器在 platform。`apps/boss` 目前只有 `manifest.json`；現行 id 是 `boss`，不是文件早前寫的 `boss-portal` |
| R5 | #75 | migration 執行器已支援舊的平目錄與每 schema 編號 |
| R6 | #76 | 已有 `packages/edition-profile` 與端口一致性檢查；issue 標題註明不改任何容器 |
| R8 | #77 | `apps/app-host` 骨架已存在，`APP_SET` 留空時不載入任何 app。R7 沒有找到對應 issue |
| scripts | — | `scripts/` 仍在（backup、ports-check、storage-smoke 等）；`ops/` 與 `dev/` 目錄不存在，屬目標 |

`packages/` 現況只有 `app-shell`、`contracts`、`design-tokens`、`edition-profile`、`i18n`、`policy`、`ui-kit`。`platform-kit` 與 `db-kit` 不存在，屬目標。

`README.md` 描述 `main` 的現況；下面的入口與容器端口表描述目標，與現況的差別另列在「容器與端口」一節末。

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

4431 至 4499 保留給 app 容器。

**現況與上表的差別（2026-11-06，已核對 `docker-compose.yml` 與 `.env.example`）：**

- `docker-compose.yml` 裡真的存在的只有五個服務：`db`、`storage`、`api`、`gateway-internal`、`apps`。其中 `apps` 在 `apps` profile 之下，預設 `docker compose up` 不會啟動它。表內其餘容器都是目標，尚未有容器。
- `api` 服務由 `apps/platform/Dockerfile` 建置，服務名仍然是 `api`，不是 `platform`；`gateway-internal` 由 `apps/web/Dockerfile` 建置（nginx）。端口 4210 與 4420 不變。服務名一旦改成 `platform`，`.env.example` 的 `BACKUP_QUIESCE_CONTAINERS` 預設值（指向 compose 依專案名與服務名自動生成的 api 容器名）也要一併改，否則備份會停不到容器而失敗；`tools/rename/rename-guard.test.ts` 的允許清單也要同步調整。
- 現況的環境變數是 `API_PORT`（預設 4420），`PLATFORM_PORT` 在 `.env.example` 與 compose 都不存在，上表的 `PLATFORM_PORT` 是目標名稱。`WEB_PORT` 是 `GATEWAY_INTERNAL_PORT` 的舊名，仍然生效。
- `APPS_PORT` 與 `APP_SET` 在 `.env.example` 內，只屬大陸版（`apps` profile）。

## 新增一個 app

`npm run new:app <名稱>`（S5-00 完成後）會產生資料夾、manifest、`DESIGN.md`、`AGENTS.md`、資料庫 schema、gateway 路由、edition-profile 的容器歸屬和「我的 Apps」入口。啟用哪些 app 由 edition-profile 與 compose profile 決定。

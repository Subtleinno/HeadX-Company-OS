# 程式碼地圖與模組化規則

狀態：設計稿加現況標註（2026-11-06）。決策見 `docs/product/DECISIONS.md` 的 C31 至 C33。搬遷切片 R1 至 R6、R8 已合併，但並非全部照原設計完成：目錄圖與 package 表描述的是目標，實際在 `main` 上有什麼，看各節的「現況」標註與「搬遷切片」表。入口、容器與端口表在 `docs/architecture/REPO-MAP.md`；這份只放目錄、模組與邊界規則，兩處不重複。

## 原則

1. 邊界靠程式碼規則，不靠容器數量。容器是打包選擇，按版本 profile 組合。
2. 底座與 UI 基礎共用，部門 app 只寫自己的流程。
3. 每個模組只經 `index.ts` 對外，內部檔案不許外部 import。
4. 搬動不改行為：搬動前後同一組測試全過，一片一個 PR。

## 目錄（目標）

```
company-os/
├── apps/
│   ├── gateway/            入口：路徑分流、cookie、Origin、入口標記（同一映像，按 profile 起實例）
│   ├── platform/           身份、授權、組織、Need、檔案、發件箱、通知、MCP、審計、隊列
│   │   └── src/modules/<name>/index.ts   identity authz org need files outbox notify mcp audit jobs registry
│   ├── app-host/           執行器：讀 APP_SET，載入對應的 app，掌管每個 app 自己的資料庫連線
│   ├── boss-portal/  employees/  design/  sales/  ops-finance/  hr/  support/  research-dev/
│   ├── customer-portal/  supplier-portal/        國際版才啟用
│   └── <app>/
│       ├── manifest.json  DESIGN.md  AGENTS.md
│       ├── src/index.ts      只匯出 registerApi 與 web 入口
│       ├── src/api/          路由與驗證
│       ├── src/domain/       純邏輯，不引用 Fastify 或資料庫
│       ├── src/db/           查詢，只碰自己的 schema
│       ├── src/web/          React 畫面
│       └── tests/
├── packages/               共用底座，見下表
├── db/migrations/<schema>/ 每個 schema 獨立編號，只往前加
├── ops/  dev/  docker/  e2e/  docs/
```

### 目錄現況（2026-11-06，已核對 `main`）

- `apps/` 實際有：`app-host`、`boss`、`design`、`hr`、`ops_finance`、`platform`、`sales`、`support`、`web`。
- 沒有 `apps/gateway`。README 稱 gateway-internal 由原本的 web 容器改名而來；`apps/web` 仍是完整的 Vite 前端加 nginx，沒有被拆掉。
- `apps/boss` 只有 `manifest.json`，目錄與 id 都是 `boss`，不是 `boss-portal`。`design`、`hr`、`ops_finance`、`sales`、`support` 的內容這次未逐個打開核實；README 稱現時沒有任何真實的部門 app。
- 資料夾與 id 用底線寫法（`ops_finance`），上面目標圖與其他文件寫連字號（`ops-finance`）；README 的 manifest 表顯示 id 用底線、路由用連字號（`/ops-finance`）。
- `apps/platform/src` 實際按功能分資料夾：`agents`、`auth`、`db-access`、`files`、`grants`、`jobs`、`modules`、`org`、`settings`、`staff`、`storage`，另有 `app.ts`、`audit.ts`、`db.ts`、`logging.ts`、`migrate.ts`、`pagination.ts`、`server.ts`、`worker.ts`。這與上面目標圖的 `src/modules/<name>/index.ts` 一律放進 `modules/` 的寫法不同；`modules/` 內現時放載入器（見下）。
- 根目錄實際有 `apps`、`config`、`db`、`docker`、`docs`、`packages`、`profiles`、`scripts`、`tools`。`scripts/` 仍在，`ops/` 與 `dev/` 不存在；`e2e/` 這次未核實。

manifest 欄位：`id`、`title`、`kind`、`department`、`order`、`available`，加上 `route`、`exposure`、`sensitive`。端口不寫在 manifest，由 edition-profile 與 REPO-MAP 的容器端口表決定。R4 已完成：載入器在 `apps/platform/src/modules/registry/index.ts`，九個欄位全部納入驗證，未知欄位仍然拒絕。

## 共用 packages

| package | 內容 | 規則 | 現況（2026-11-06） |
|---|---|---|---|
| `contracts` | 跨 app 共用的型別與驗證 | 不放邏輯 | 已存在 |
| `platform-kit` | 各 app 呼叫 platform 的客戶端、session 驗證 | 只依賴 contracts | 不存在，目標 |
| `policy` | 權限引擎 | 純函數，不碰資料庫 | 已存在（#82） |
| `db-kit` | 資料庫連線、migration 執行器 | 只有 platform 與 app-host 可用 | 不存在，目標；migration 執行器現時在 `apps/platform/src/migrate.ts` |
| `edition-profile` | 國際版／大陸版的啟用項目（入口、渠道、預設語言、容器組合、端口） | 版本差異只寫在這裡，app 內不寫「如果是大陸版」 | 已存在（#76） |
| `design-tokens` | 色字間距 | 生成 CSS | 已存在（#73） |
| `ui-kit` | 共用元件 | 不認識任何部門 | 已存在（#73） |
| `app-shell` | 頁面外殼、導航、登入守衛、空狀態與錯誤畫面 | 只依賴 ui-kit、platform-kit、i18n | 已存在（#73）；依賴的 platform-kit 尚不存在 |
| `i18n` | 繁體／簡體字串與格式 | 字串不寫死在元件裡 | 已存在（#73） |

`packages/` 另有 `README.md`。

### 映像怎樣拿到這些 package

`packages/*` 的 `main`／`exports` 指向 `src/index.ts`；api 映像照樣搬來源進去，靠 Node 的型別剝離執行，不經 `dist`。這有兩個後果，各有守門測試：

1. `apps/platform/Dockerfile` 要逐個 `COPY` platform 依賴的 workspace package —— `npm ci` 前一次 `package.json`、build 前一次完整來源、runtime stage 再一次。少一行，`npm ci` 之後 `node_modules/@company-os/<name>` 就沒有符號連結，`tsc` 以 TS2307／exit 2 失敗（`apps/platform/test/modules/dockerfile-workspaces.test.ts`）。
2. 這些 package 內的相對匯入要寫 `.ts`。`rewriteRelativeImportExtensions` 會令 `tsc` 產出的 `dist` 仍然寫 `.js`，兩個消費端都正確。寫 `.js` 的話，tsc、vitest、容器 CI 全部看不出來，只有真正的容器以 `ERR_MODULE_NOT_FOUND` 起不來（`apps/platform/test/modules/packages-raw-ts.test.ts`）。

## 分層

每個 app 與每個 platform 模組都用同一個方向：`web` 經 platform-kit 和 contracts 呼叫 api；`api` 呼叫 `domain`；`domain` 呼叫 `db` 介面。反方向的 import 一律是錯誤。`domain` 不引用 Fastify、資料庫或 React，所以可以直接單元測試。

## 邊界規則（CI：`npm run lint:boundaries`）

1. app 之間不可互相 import。
2. app 只可以用 `packages/*` 與 platform 的介面（經 platform-kit）。
3. platform 不引用任何 app。
4. 任何 package 與模組只能經 `index.ts` 或 package.json 的 `exports` 被引用，不可引用它的子資料夾。
5. 不允許循環依賴。
6. 分層方向不可反轉（web → api → domain → db）。
7. 每個 app 的資料庫帳號只能存取自己的 schema 與 platform 開放的介面；不讀別的 app 的資料表。
8. 對客戶與供應商開放的 app 是獨立的 portal，不與後台 app 共用容器、session 或 cookie。

工具：R1 實作邊界檢查（候選 dependency-cruiser 加 ESLint），並附「故意違反」的測試證明規則真的有效。型別層面用 TypeScript project references（`composite`）與 `tsc -b`，npm workspaces 負責連結。根目錄現有 `.dependency-cruiser.mjs`，與 R1 的工具選擇一致。

## app-host 與部署打包

一個 app 對外只提供 `registerApi(app, ctx)` 與建置好的 web。`app-host` 是同一個映像，啟動時讀 `APP_SET`（例如 `sales,support,design`），只載入這些 app；每個 app 用自己的資料庫帳號與連線池，從 secrets 按 app id 取得。

打包規則：

1. 曝露程度（exposure）不同的 app 不得同一個容器，這樣外部入口的漏洞碰不到內網 app 的記憶體與資料庫憑證。
2. customer-portal 與 supplier-portal 一律獨立容器。
3. platform（含 worker）、gateway、Postgres、MinIO 不與 app 共用容器。
4. 單獨開發、測試或更新某個 app：用 `APP_SET=<該 app>` 起一個 app-host。

| 容器 | 大陸版 | 國際版 | APP_SET |
|---|---|---|---|
| gateway-internal | 有 | 有 | — |
| gateway-partner、gateway-customer、cloudflared | 無 | 有 | — |
| platform（含 worker） | 有 | 有 | — |
| apps（全部 app） | 有 | 無 | boss-portal、employees、design、sales、ops-finance、hr、support、research-dev |
| apps-internal | 無 | 有 | boss-portal、employees、ops-finance、hr、research-dev |
| apps-partner | 無 | 有 | sales、support、design |
| supplier-portal | 無 | 有 | supplier-portal |
| customer-portal | 無 | 有 | customer-portal |
| Postgres、MinIO | 有 | 有 | — |

上表是目標。現況只有 gateway-internal、platform、apps（`apps` profile，預設不啟動，`APP_SET` 留空）、Postgres、MinIO 五個容器，見 REPO-MAP。

## 搬遷切片

每片不改行為、一個 PR、前後同一組測試全過。詳細驗收在建立 issue 時才寫。R1 至 R6 取代原來的 S1-01。

| 切片 | 內容 | 風險 | 狀態（2026-11-06） |
|---|---|---|---|
| R1 | 加 `packages/*` 到 workspaces、邊界檢查與 `lint:boundaries`、project references；不搬任何檔案 | 低 | 已合併（#71） |
| R2 | `apps/api` 用 `git mv` 改名 `apps/platform`，只改路徑與 import；S3 SDK 從根 package.json 移進 platform | 低 | 已合併（#72） |
| R3 | 拆 `apps/web`：登入、首次開機、外殼歸 platform，「今日」歸 boss-portal；抽出 ui-kit、app-shell、design-tokens、i18n | 中 | 部分完成（#73）：只抽出四個 package，`apps/web` 沒有拆，「今日」仍在 web。拆 web 的部分尚無 issue |
| R4 | `modules/<dept>/manifest.json` 移成 `apps/<app>/manifest.json`，載入器移到 platform 的 registry，放寬欄位並加測試 | 中 | 已合併（#74） |
| R5 | migration 執行器同時支援舊的平目錄與新的每 schema 編號（先做小實驗，確認既有三個 migration 不受影響） | 中，最需要先驗證 | 已合併（#75） |
| R6 | app-host、compose 多服務骨架、edition-profile（大陸版與國際版）、按容器的端口表與 `ports:check` 對照 | 中 | 部分完成：edition-profile 與端口對照在 #76（不改任何容器）；app-host 骨架在 #77（R8）；compose 仍是五個容器，沒有擴展成多服務 |
| R8 | app-host 骨架（原計劃沒有這一片，由 R6 分出） | — | 已合併（#77） |

原計劃沒有 R7，GitHub 上也找不到 R7 的 issue。

## 測試與交接

1. 每片由開發管理者先寫驗收指令（測試、`lint:boundaries`、`docker compose config`、`ports:check`），再交 WorkBuddy。
2. WorkBuddy 只改被指派的範圍，PR 描述貼實際指令與輸出。
3. ZCode 獨立重跑同一組指令，另加「故意違反邊界」的變異測試（例如在一個 app 裡 import 另一個 app），確認 CI 會失敗。失敗清單寫在 PR 留言。
4. WorkBuddy 只修留言列出的項目，不順手加功能；通過才合併，才開下一片。

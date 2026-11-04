# 程式碼地圖與模組化規則

狀態：設計稿（2026-11-04）。決策見 `docs/product/DECISIONS.md` 的 C31 至 C33。搜遷由 R1 至 R6 切片執行，在它們合併之前，現有程式碼仍是單一 api 加單一 web。

## 原則

1. 邊界靠程式碼規則，不靠容器數量。容器是打包選擇，按版本 profile 組合。
2. 底座與 UI 基礎共用，部門 app 只寫自己的流程。
3. 每個模組只經 `index.ts` 對外，內部檔案不許外部 import。
4. 搜動不改行為：搜動前後同一組測試全過，一片一個 PR。

## 目錄

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

## 共用 packages

| package | 內容 | 規則 |
|---|---|---|
| `contracts` | 跨 app 共用的型別與驗證 | 不放邏輯 |
| `platform-kit` | 各 app 呼叫 platform 的客戶端、session 驗證 | 只依賴 contracts |
| `policy` | 權限引擎 | 純函數，不碰資料庫 |
| `db-kit` | 資料庫連線、migration 執行器 | 只有 platform 與 app-host 可用 |
| `edition-profile` | 國際版／大陸版的啟用項目（入口、渠道、預設語言、容器組合） | 版本差異只寫在這裡，app 內不寫「如果是大陸版」 |
| `design-tokens` | 色字間距 | 生成 CSS |
| `ui-kit` | 共用元件 | 不認識任何部門 |
| `app-shell` | 頁面外殼、導航、登入守衛、空狀態與錯誤畫面 | 只依賴 ui-kit、platform-kit、i18n |
| `i18n` | 繁體／簡體字串與格式 | 字串不寫死在元件裡 |

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

工具：R1 實作邊界檢查（候選 dependency-cruiser 加 ESLint），並附「故意違反」的測試證明規則真的有效。型別層面用 TypeScript project references（`composite`）與 `tsc -b`，npm workspaces 負責連結。

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

每個容器的主機端口只綁本機，gateway-internal 綁管理者選定的 LAN 位址。端口表由 R6 更新；在它合併之前，REPO-MAP 現有的端口表仍是現況，而「端口按容器、不按 app」的規則以 C32 為準。

## 搜遷切片

每片不改行為、一個 PR、前後同一組測試全過。詳細驗收在建立 issue 時才寫。

| 切片 | 內容 | 風險 |
|---|---|---|
| R1 | 加 `packages/*` 到 workspaces、邊界檢查與 `lint:boundaries`、project references；不搬任何檔案 | 低 |
| R2 | `apps/api` 用 `git mv` 改名 `apps/platform`，只改路徑與 import；S3 SDK 從根 package.json 移進 platform | 低 |
| R3 | 拆 `apps/web`：登入、首次開機、外殼歸 platform，「今日」歸 boss-portal；抽出 ui-kit、app-shell、design-tokens、i18n | 中 |
| R4 | `modules/<dept>/manifest.json` 移成 `apps/<app>/manifest.json`，載入器移到 platform 的 registry，放寬欄位並加測試 | 中 |
| R5 | migration 執行器同時支援舊的平目錄與新的每 schema 編號（先做小實驗，確認既有三個 migration 不受影響） | 中，最需要先驗證 |
| R6 | app-host、compose 多服務骨架、gateway-internal 綁 LAN 位址、edition-profile（大陸版與國際版）、端口表更新 | 中 |

## 測試與交接

1. 每片由開發管理者先寫驗收指令（測試、`lint:boundaries`、`docker compose config`、`ports:check`），再交 WorkBuddy。
2. WorkBuddy 只改被指派的範圍，PR 描述貼實際指令與輸出。
3. ZCode 獨立重跑同一組指令，另加「故意違反邊界」的變異測試（例如在一個 app 裡 import 另一個 app），確認 CI 會失敗。失敗清單寫在 PR 留言。
4. WorkBuddy 只修留言列出的項目，不順手加功能；通過才合併，才開下一片。

# 交接：由這一頁開始

> `docs/INDEX.md` 是文件地圖，`AGENTS.md` 是規則。這一頁只管四件事：
> **現在有什麼、怎樣跑起來、下一步做什麼、哪幾個坑別踩。**

最後更新：2026-11-11（老闆與 AI 共同確認）

## 一句話現況

平台殼有真畫面，Boss Portal 的據點目錄可以真讀真寫，Design app 的品牌清單可以真讀真寫。
Needs 能看、能認領，但**還不能在介面上開立**。其餘四個部門 app 仍然灰掉，並如實寫明未建。

## 1. 程式碼在哪

| 項目 | 位置 |
|---|---|
| 唯一 repo | `github.com/Subtleinno/HeadX-Company-OS` |
| **唯一工作目錄** | `/Users/riderhin/Dev/Dev/Github/HeadX-Company-OS` |
| 舊 repo | `Subtleinno/company-os` **已歸檔（唯讀）**，local remote 名為 `archive`，只用來讀歷史 |
| 預設分支 | `main` |
| 工作分支 | `task/<issue 號>-<短英文名>` |

**只有一個 worktree、一個資料夾，名字就是 repo 名。** `git worktree list` 應該只回一行。
以前有兩個 worktree（一個掛 `main`、一個施工），其中一個長期缺 `config/`、`docker/`、`tools/`，
兩個資料夾又都叫 `company-os`，結果「邊個才係真」講不清。2026-11-11 已合併成一個（C81）。

工作區（`/Users/riderhin/WorkBuddy/2026-11-10-11-37-04`）本身沒有程式碼副本。

## 2. 五分鐘跑起來

```bash
cd /Users/riderhin/Dev/Dev/Github/HeadX-Company-OS
set -a && . ./.env && set +a
docker compose -p company-os-needs up -d --build
```

種示範資料（可重覆跑，會把據點目錄還原成三行）：

```bash
set -a && . ./.env && set +a
docker compose -p company-os-needs exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < scripts/seed-frame-demo.sql
```

| 服務 | 位址 |
|---|---|
| 網頁 | http://127.0.0.1:5210 |
| API | http://127.0.0.1:5420 |
| Postgres | 127.0.0.1:35432 |
| MinIO API／主控台 | 39000／39001 |

帳戶（本機 demo 專用，不是真實憑證）：

| 角色 | 帳號 | 密碼 |
|---|---|---|
| 老闆 | `boss@company.local` | `Frame-needs-2026!` |
| 員工 | `staff@company.local` | 同上（用來看權限不足畫面） |

改完程式碼要看到畫面，需要重建前端容器：

```bash
set -a && . ./.env && set +a
docker compose -p company-os-needs build gateway-internal api && \
  docker compose -p company-os-needs up -d gateway-internal api
```

## 3. 現在看得到什麼

| 路由 | 畫面 | 狀態 |
|---|---|---|
| `#/` | 今日（Needs 列表、認領） | 可用 |
| `#/boss` | Boss Portal 總覽（四個事實） | 可用，其餘數字未接 |
| `#/boss/sites` | 據點目錄（三行） | 可用，可批准 |
| `#/boss/sites/add` | 新增據點 | 第一、二步可用，第三步端點未存在 |
| `#/design` | 品牌（清單、新增） | 可用 |
| `#/design/brand/settings/color` | 品牌設定之下四個章節 | 章節導覽可用，內容未接 |

`staff@company.local` 直接開 `#/boss` 會見到全螢幕權限說明，冇任何選單外流。

## 4. 邊份文件管邊件事

| 想知道 | 去邊 |
|---|---|
| **這套東西是什麼**（設計真相） | `docs/CONCEPT.md` |
| 外殼版面、四層導覽、據點目錄規則 | `docs/product/FRAME-UIUX-HANDOFF.md`（v1.4 已按落地版本改） |
| 介面長成什麼樣（唯一真相） | `docs/design/frame/frame-0*.png` |
| **公司層／品牌層、三種 app 模式、Context 管寫 vs Lens 管讀** | `docs/product/SCOPE-MODEL.md` |
| **對外公開 vs 只准內網／VPN、跨機入口** | `docs/product/MULTI-MACHINE-ACCESS.md`、`docs/trusted-entry.md` |
| 為什麼這樣決定 | `docs/product/DECISIONS.md`（後者優先，現到 C85） |
| 目錄、分層、邊界 | `docs/architecture/CODE-MAP.md` |
| 端口、容器 | `docs/architecture/REPO-MAP.md` |
| 邊啲後端功能仲未有畫面 | `docs/product/BACKEND-FUNCTIONS-MAP.md` |
| 備份與還原 | `docs/backup-restore.md` |
| 未來部門 app 的構思（做到那個 app 才讀） | `docs/concept/future/` |
| 已取代的舊計劃（不是真相） | `docs/archive/` |

外殼程式碼：`packages/app-shell/src/FrameShell.tsx`。
前端接駁：`apps/web/src/frame/`（`AppFrame`、`appNav`、`FrameApps`）＋ `apps/web/src/boss/`、`apps/web/src/design/`。
後端：`apps/platform/src/directory/`（品牌與據點）、`apps/platform/src/needs/`、`apps/platform/src/modules/`。
資料表：`db/migrations/0011_brands_sites.sql`。

## 5. 下一步：頁面隊列

工作方式是**老闆逐頁設計、AI 逐頁實作**。隊列在 GitHub issue，一頁一張，做完關掉。
未開的頁寫在 issue「頁面隊列」內。

優先次序（老闆 2026-11-11 定的方向：先把兩個 app 的頁面做齊，功能之後逐個做深）：

1. Design app 其餘模組的頁（素材、知識、創作）
2. Boss Portal 其餘頁（憑證與金鑰、批准紀錄、管理級成員、操作紀錄）
3. Needs 詳情頁與「我負責」分頁

## 6. 坑（都係實測踩過，唔好再踩）

1. **測試要 `npx vitest run --no-file-parallelism`**。滿載並行會 timeout 十幾個檔。
2. `apps/web/test/gates.test.ts` 會把註解裡的 `#184` 當成 hex 色碼，web 內只寫「issue 184」。
3. emoji 閘門連箭頭都當 emoji：U+2194（雙向箭頭）、U+2192（單向箭頭）都會令測試紅。
4. i18n 有四條凍結 SHA-256；改既有文案會四條全紅，要一併更新並在 PR 講明原因。
5. `--hx-frame-accent-fg` 同 accent 係同一個藍；藍底按鈕的文字要用 `--hx-chrome-white`。
6. 前端不准寫死 app id；app 清單與路由一律由 `/modules` 拿（有靜態閘門）。
7. `modulePages` 一律傳空；第二行沒有東西就整條不畫。
8. 選中章節的麵包屑有四格，第一格來自 manifest 的 `title`，不要在 i18n 另存一份。
9. 截圖用 Playwright：`/Users/riderhin/.workbuddy/binaries/python/envs/default/bin/python`。

## 7. 工作方式（老闆 2026-11-11 定）

- 老闆設計 UI、逐頁講清楚每個功能點怎樣運作；AI 負責令它成真。
- 老闆不是工程師：**回報要講「在哪個畫面看得到」，不要講技術細節。**
- 不對外發送、批准，永遠由人按；其餘預設不加閘。
- 現在刻意不做：MCP、生產部署、備份演練。等頁面成形之後再排。
- 本機 Docker 就是驗收環境，老闆可以即時自己看。
- GitHub 沒有 Pro，分支保護開不到；靠「一個 PR 一件事、CI 綠、AI 自己修紅燈」代替。

## 8. 誠實的未做清單

- Needs：開立（MCP 端）、交貨、吸收、驗收、詳情頁、我負責分頁
- Design：素材、知識、創作三個模組的頁
- Boss Portal：憑證與金鑰、批准紀錄、管理級成員、操作紀錄
- 新增據點第三步（要後端收確認檔的端點）
- 備份從未做過一次真正的「刪庫再還原」實測
- 6 個 app 之中仍然只有 2 個有畫面
- 完全未部署到生產環境

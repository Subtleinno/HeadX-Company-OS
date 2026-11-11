# 交接：由這一頁開始

> `docs/INDEX.md` 是文件地圖，`AGENTS.md` 是規則。這一頁只管四件事：
> **現在有什麼、怎樣跑起來、下一步做什麼、哪幾個坑別踩。**

最後更新：2026-11-11 深夜（品牌模組規格定稿：五頁、版本、策略；程式未動，夜間 loop 由 #33 開始）

## 開新 session 時，貼這一句就夠

> 讀 `docs/product/HANDOFF.md`，然後按 §5 的頁面隊列，做我在 issue 指定的那一頁。只做那一頁。

夜間 loop（無人值守）貼這一句：

> 讀 `docs/product/HANDOFF.md` §5 與 `AGENTS.md` 的〈Loop（無人值守）〉，由 #33 開始，一次一張，做到 #39（共九張，#41 排在第八）。撞到規格空白就停手寫低，不要問、不要猜。

新 session 不要期望記得以前的事；這一頁就是全部的入場卷。

**這一頁如果與程式碼不一致，以程式碼為真相，並即刻回來改這一頁。** 不要因為「文件沒說可以改」就讓它繼續講錯 —— 過時的手冊比沒有手冊更貴。

## 一句話現況

登入已經按身份落地：老闆去 Boss Portal，員工去所屬部門（現時只有 Marketing Design），
未指派部門的員工會被擋住並講明原因。Boss Portal 的「人員與部門」可以真建立員工、真指派部門、
真停用登入、真恢復（停用的逆操作）、真重設密碼。Design 的品牌頁可以真讀真寫，會記住每位員工上次工作的品牌，
而開新品牌的入口只給老闆。其餘四個部門 app 仍然灰掉，並如實寫明未建。

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
npm run install:stack
```

一條命令做齊：查 Node／Docker → 建 `.env` 並產生四個密鑰 → 端口檢查 → 建置 → 啟動 → 等健康 → 開老闆帳戶。
**重跑安全**：已有的 `.env` 值不會被覆寫，已存在的帳戶不會被重建。Mac 與 Windows 都是同一條命令（詳見 README）。

種示範資料（可重覆跑，會把據點目錄還原成三行）：

```bash
npm run seed:frame
```

不用 `docker compose exec … < file.sql`：PowerShell 不支援 `<` 重定向，那條命令在 Windows 上行不通。

| 服務 | 位址 |
|---|---|
| 網頁 | http://127.0.0.1:4210 |
| API | http://127.0.0.1:4420 |
| Postgres | 127.0.0.1:25432 |
| MinIO API／主控台 | 29000／29001 |

帳戶（本機 demo 專用，不是真實憑證）：

| 角色 | 帳號 | 密碼 |
|---|---|---|
| 老闆 | `boss@company.local` | `Frame-needs-2026!` |

**員工帳戶不再需要手動建。** 老闆登入 → `人員` → `人員與部門` → 右上「新增員工」，
填名稱、電郵、初始密碼即可。員工第一次登入會被強制改密碼，改完才按部門落地。
要試「未指派部門」「部門未開放」那兩張閘，就在同一頁把部門設回未指派。

改完程式碼要看到畫面，重建映像再起：

```bash
npm run deploy:build && docker compose up -d
```

## 2.5 對外存取（開發期，Cloudflare Tunnel）

現時已經開通：**<https://hxd.subtle-inno.com>** → 本機 `127.0.0.1:4210`。

雲端設定在 Cloudflare 後台（dashboard-managed tunnel），本機只有一個系統服務連出去：

| 項目 | 位置 |
|---|---|
| 連接器 | `/Users/riderhin/.local/bin/cloudflared` |
| 開機自動起 | `/Library/LaunchDaemons/com.cloudflare.cloudflared.plist`（`RunAtLoad` ＋ `KeepAlive`） |
| token | `/Library/Application Support/com.cloudflare.cloudflared/token` |
| 指向 | dashboard → Public Hostname → `http://localhost:4210` |
| 日誌 | `/Library/Logs/com.cloudflare.cloudflared.{out,err}.log` |

**cloudflared 刻意不在 compose 內**：它指去已經只綁 loopback 的 4210，跑在主機就沒有第二個要同步的設定；而且它是全機共用，不屬於這套 app。

換機或搬到 Windows：後台建 tunnel 拿 token → 加 Public Hostname（`HTTP` → `localhost:4210`）→ `cloudflared service install <TOKEN>`。repo 內沒有任何東西要改。

只有一個網址對外。**`api`（4420）、`storage`（MinIO 主控台）、`apps`、`db` 都不經這條隧道** —— 多開一個，就是多一道繞過入口憑證與 CSRF 前哨的門。

驗證一句就夠：

```bash
curl -s https://hxd.subtle-inno.com/api/auth/state    # 應回 {"setupRequired":false,"signedIn":false}
```

> **現在的保安級別＝只有 app 自己的登入。** 任何人拿到網址都見到登入頁，試得出密碼就入得去。開發期可以接受，**但不可以這樣開始管理公司資料**；正式用之前還要做兩件：換掉 demo 密碼、加 Access 政策。決策 C89 有寫。
>
> **Always Use HTTPS 已開（2026-11-11 實測）。** `http://hxd.subtle-inno.com` 與 `http://subtle-inno.com` 都回 301 跳 https，明文的門已封。剩下 `COOKIE_SECURE` 仍然 `false` —— 因為本機 `http://127.0.0.1:4210` 要能登入；等不再需要本機 http 入口時才可以開。

## 3. 現在看得到什麼

**登入之後去哪**（`apps/web/src/frame/useLanding.ts`，落點的唯一判斷處）：

| 身份 | 落點 |
|---|---|
| 老闆 | `#/boss` |
| 員工（有部門、該部門已開放） | 該部門 app 的 `route`，現時即 `#/design` |
| 員工（未指派部門） | 全螢幕「未獲指派部門，請聯絡老闆」＋登出，不給空選單 |
| 員工（部門存在但前端未實作） | 全螢幕講明是哪個部門、未開放 |

落點只在**剛登入**那一刻決定一次。之後在左側欄自由走，`#/` 仍然是「今日」，不會被彈走。

| 路由 | 畫面 | 狀態 |
|---|---|---|
| `#/` | 今日（Needs 列表、認領） | 可用 |
| `#/boss` | Boss Portal 總覽 | 可用，其餘數字未接 |
| `#/boss/sites` | 據點目錄（三行） | 可用，可批准 |
| `#/boss/sites/add` | 新增據點 | 第一、二步可用，第三步端點未存在 |
| `#/boss/people/members` | 人員與部門：名單、建立員工（可一併選部門）、改部門、停用、恢復、重設密碼 | 可用，全部真寫入 |
| `#/design` | 品牌首頁：清單、新增品牌（只老闆）、記住上次品牌 | 可用 |
| `#/design/brand/settings/*` | 品牌設定之下四個章節（標誌／識別／色彩／字體） | 章節導覽可用，內容未接 |
| `#/needs`、`#/files`、`#/account` | 需求、檔案、個人帳戶 | 可用 |

品牌模組正按 #33 至 #39、#41 重做：五頁（品牌主頁／標誌／色彩／字體／語氣）加自定義頁，不再有儀表板、渠道、版本頁，「品牌識別」一併移走，品牌清單移入品牌切換。落地一張改一張 —— 上面每一行都是**今日真相**，不是計劃。

員工直接開 `#/boss` 會見到全螢幕權限說明，沒有任何選單外流（2026-11-11 用真員工帳戶實測）。
Boss Portal 的導覽是四組：總覽｜據點與機器｜人員｜存取紀錄。

## 4. 邊份文件管邊件事

| 想知道 | 去邊 |
|---|---|
| **這套東西是什麼**（設計真相） | `docs/CONCEPT.md` |
| **登入落點與帳戶（C91、C92）** | `docs/product/LOGIN-AND-ACCOUNT.md` |
| 外殼版面、四層導覽、據點目錄規則 | `docs/product/FRAME-UIUX-HANDOFF.md`（v1.5：品牌模組已改五頁，冇章節） |
| 介面長成什麼樣 | **由老闆當面定**。`docs/design/frame/frame-0*.png` 是歷史參考稿，**不是真相** —— 2026-11-11 老闆明確講過，不要拿它們當規格 |
| **公司層／品牌層、三種 app 模式、Context 管寫 vs Lens 管讀** | `docs/product/SCOPE-MODEL.md` |
| **對外公開 vs 只准內網／VPN、跨機入口** | `docs/product/MULTI-MACHINE-ACCESS.md`、`docs/trusted-entry.md` |
| 為什麼這樣決定 | `docs/product/DECISIONS.md`（後者優先；C91、C92 先見 `LOGIN-AND-ACCOUNT.md`） |
| 目錄、分層、邊界 | `docs/architecture/CODE-MAP.md` |
| 端口、容器 | `docs/architecture/REPO-MAP.md` |
| 邊啲後端功能仲未有畫面 | `docs/product/BACKEND-FUNCTIONS-MAP.md` |
| 備份與還原 | `docs/backup-restore.md` |
| 未來部門 app 的構思（做到那個 app 才讀） | `docs/concept/future/` |
| 已取代的舊計劃（不是真相） | `docs/archive/` |

外殼程式碼：`packages/app-shell/src/FrameShell.tsx`。
前端接駁：`apps/web/src/frame/`（`AppFrame`、`appNav`、`FrameApps`）＋ `apps/web/src/boss/`、`apps/web/src/design/`。
後端：`apps/platform/src/directory/`（品牌、據點、我的品牌）、`apps/platform/src/staff/`（帳戶與部門）、`apps/platform/src/needs/`、`apps/platform/src/modules/`。
資料表：`db/migrations/0001`–`0012`，最近三支是 `0010_needs.sql`、`0011_brands_sites.sql`、`0012_user_brand_focus.sql`。**真相以 `db/migrations/` 為準**，這一行只是指路。

## 5. 下一步：品牌模組（夜間 loop 的次序）

工作方式是**老闆逐頁定、AI 逐頁實作**。一頁一張 issue，一張分支一個 PR，做完關掉。

**2026-11-11 夜這一輪按下面次序跑，不要重排。** 前一張 PR 合併 `main` 之後才開下一張。loop 的規矩在 `AGENTS.md` 的〈Loop（無人值守）〉；老闆給這一輪的授權範圍在 `DECISIONS.md` C100，不延伸到之後任何一輪。

| 位 | issue | 這一張交付什麼 | 為什麼在這一位 | 狀態 |
|---|---|---|---|---|
| 1 | #33 | 品牌頁版本：只加不改，現行用算的 | 其餘八張都要版本 | 未開始 |
| 2 | #34 | Boss Portal 策略：六槽全文，只有老闆可改 | #32 要六個槽都有全文 | 未開始 |
| 3 | #32 | 品牌模組五頁、導覽；自定義頁的建立／改名／刪除 | 後面四頁要掛在這一張的導覽上 | 未開始 |
| 4 | #35 | 色彩頁（角色名由它定） | 字體與標誌都要引用它的角色 | 未開始 |
| 5 | #38 | 字體頁 | 標誌的字標要引用它 | 未開始 |
| 6 | #36 | 標誌頁 | 要引用色彩角色與字體，所以排在她們之後 | 未開始 |
| 7 | #37 | 語氣頁 | 不依賴任何視覺頁，放這裡不影響任何一張 | 未開始 |
| 8 | #41 | 自定義頁（零到多張）：每張自己的 brief，各自的版本鏈 | 要引用色彩、字體、語氣三頁，所以排在她們之後 | 未開始 |
| 9 | #39 | 品牌主頁（集大成） | 要讀所有現行頁，包括自定義頁 | 未開始 |

每張做完就把狀態改成「已完成（merge SHA）」。跑完之後才回到原本的隊列：Design 其餘模組（素材、知識、創作）、Boss Portal 其餘頁、Needs 詳情。

**每一張的完成閘（缺一項就不算完）：**

1. 先寫會 fail 的測試，貼實際輸出。
2. `npm test`、`npm run test:integration`、`npm run lint`、`npm run lint:boundaries`、`npm run build` 全綠。
3. 重建本機 Docker，用真瀏覽器走一次；回報只講「在哪個畫面看得到」。
4. 文件在同一個 PR 已同步：上面 §3 的路由表、`DECISIONS.md`（有新規則才加）、`BACKEND-FUNCTIONS-MAP.md`（有新端點才加）。
5. 無 TODO、無範圍外檔案。

**2026-11-11 已完成並上線**（全部在 `main`，三個容器對得上）：

| issue | 內容 |
|---|---|
| #12 | 指派員工部門（`PATCH /staff/:id/department`） |
| #13 | Boss Portal／人員與部門：名單、建立員工、指派部門 |
| #14 | 登入後按身份落地 |
| #15 | Design 記住每位員工上次工作的品牌 |
| #19 | 只有老闆可以開新品牌（前端如實講） |
| #24 | 停用登入、重設密碼（#13 漏做的部分） |
| #30 | 停用之後可以恢復（停用的逆操作，不改密碼、不開 session） |

現在不做：HR app、員工個人頁。Marketing Design 打開後第一眼的內容由老闆逐頁定。

## 6. 坑（都係實測踩過，唔好再踩）

1. **測試已經鎖死在 `vitest.config.ts`（`fileParallelism: false`）。** 不需要在指令後面加 `--no-file-parallelism`。這條以前寫在這裡靠人記，結果 CI 跑 `npm test` 時不記得，就會偶發紅一個檔。
2. `apps/web/test/gates.test.ts` 會把註解裡的 `#184` 當成 hex 色碼，web 內只寫「issue 184」。
3. emoji 閘門連箭頭都當 emoji：U+2194（雙向箭頭）、U+2192（單向箭頭）都會令測試紅。
4. i18n 有四條凍結 SHA-256；改既有文案會四條全紅，要一併更新並在 PR 講明原因。**新增鍵要用精確鍵或新前綴排除，不可以用一個大前綴把已交付的鍵一齊放走**（那等於拆閘）。
5. `--hx-frame-accent-fg` 同 accent 係同一個藍；藍底按鈕的文字要用 `--hx-chrome-white`。
6. 前端不准寫死 app id；app 清單與路由一律由 `/modules` 拿（有靜態閘門）。
7. 第二行導覽（模組下的子頁）由 `position.navModule.groups` 推出來傳給外殼，**不要傳空**。傳空等於把已實作的子頁藏起來。
8. 選中章節的麵包屑有四格，第一格來自 manifest 的 `title`，不要在 i18n 另存一份。
9. **表格加欄一定要量寬度。** `.boss-sites` 用 `table-layout: fixed` 加百分比欄寬；四欄已經佔滿 100%，硬加第五欄會被壓成 0px，按鈕飛出卡外。截圖縮細看不出來（字被擠成直排），要 `getBoundingClientRect()` 量。
10. **`grep "a\|b"`（BRE 交替）在這個環境會靜默回空**，看起來像「檔案裡沒有這段」。要用 `grep -E` 或 Grep 工具。
11. 截圖用 Playwright。本機已 cache Chromium（`~/Library/Caches/ms-playwright/chromium-1248/`），用 `playwright-core` 加 `createRequire` 由 Node 跑，比裝 Python 版快。

## 7. 工作方式（老闆 2026-11-11 定，2026-11-11 晚補充）

- 老闆設計 UI、逐頁講清楚每個功能點怎樣運作；AI 負責令它成真。
- **不要等老闆的 UI 設計稿才開工。** 先把要求做成可以在 Docker 裡真的用，老闆用完直接提意見。
- 老闆不是工程師：**回報要講「在哪個畫面看得到」，不要講技術細節。**
- **規矩由老闆定，不是由文件定。** 文件與程式碼不一致時，以程式碼為真相，即刻改文件，不要「等 issue」。
- 不對外發送、批准，永遠由人按；其餘預設不加閘。
- 現在刻意不做：MCP、生產部署、備份演練。等頁面成形之後再排。
- 本機 Docker 就是驗收環境，老闆可以即時自己看。
- GitHub 沒有 Pro，分支保護開不到；靠「一個 PR 一件事、CI 綠、AI 自己修紅燈」代替。
- **夜間 loop 是老闆逐輪授權的。** 規矩在 `AGENTS.md`（一次一張、先紅後綠、綠燈才合、撞到空白就停手寫低、不問人也不猜）；授權只覆蓋當晚那一輪，不會自動延伸到下一輪。

## 8. 誠實的未做清單

- Needs：開立（MCP 端）、交貨、吸收、驗收、詳情頁、我負責分頁
- Design：品牌模組正在重做（#33 至 #39、#41）；未完成之前，畫面上仍然是舊的四個章節（標誌／識別／色彩／字體）加品牌清單
- Design：素材、知識、創作三個模組的頁
- Boss Portal：憑證與金鑰、批准紀錄、管理級成員、操作紀錄
- 新增據點第三步（要後端收確認檔的端點）
- 備份從未做過一次真正的「刪庫再還原」實測
- 6 個 app 之中仍然只有 2 個有畫面（boss、design）
- 完全未部署到生產環境；對外只有 Cloudflare Tunnel 一條，保安級別仍是「只有 app 自己的登入」
- HR app 現在不開。員工個人頁現在不設計。

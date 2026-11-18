# 交接：由這一頁開始

> `docs/INDEX.md` 是文件地圖，`AGENTS.md` 是規則。這一頁只管四件事：
> **現在有什麼、怎樣跑起來、下一步做什麼、哪幾個坑別踩。**

最後更新：2026-11-17（行銷設計四個模組已清空；Marketing Design 完整產品總圖已由老闆修訂為 `MARKETING-DESIGN-BLUEPRINT.md` v4.1；本頁部分路由與空殼描述仍是舊施工記錄，待目前工作樹驗證及部署後同步）

> **2026-11-17 老闆指示（已施工）：**`#/design/create/projects`、`#/design/create/outputs`、`#/design/material/library`、`#/design/knowledge/list`、`#/design/templates/library` 連同依附的 Project Detail／創作工作台／Composition／Render／HyperFrames／MCP，前後端一併刪除，只留空骨架（第二行頂欄、左欄、內容區三塊全空，冇頁名、冇麵包屑、冇佔位字），由老闆重做。platform 的 `projects` 與 `carousel` 模組、contracts 的 `project`／`carousel` 型別、相關 API 與整合測試已移除；DB 的 `design.*` migration 檔與資料表保留（已套用的 migration 只向前，未刪資料）。以下舊段落凡講「Projects 可用」「素材／知識／模板已接 CRUD」，一律以這一段為準。

> **新 session 的產品入口：**先讀 `MARKETING-DESIGN-BLUEPRINT.md` v4.1。它已整合完整 Carousel 業務鏈、最新 Project Library／Knowledge 截圖資訊架構、五模組專用左欄、多格式骨架、HyperFrames、MCP／Skills、App／Brand selector、Boss／Super Admin、據點與機器，以及真實完成／未完成狀態。不要再由舊對話重新推測產品。
>
> **目前核心事實：**Carousel 資料模型、HTTP API、正式 MCP、創作工作台與 Library 已有本機程式及多項歷史測試記錄；但 HyperFrames 真實五張 PNG／ZIP 仍未驗收，最新工作樹亦未完成最後 lint／全量測試與 Docker 部署。不得把本頁舊「未做 MCP」或空殼描述當作最新決定，也不得宣稱完整生成閉環已完成。
>
> **本機依賴核對（不是執行驗收）：**`package-lock.json` 鎖定 HyperFrames `0.9.56` 與 `@modelcontextprotocol/sdk` `1.32.2`。HyperFrames Docker CLI／Render 可用性仍待實測；MCP initialize 實際協商的 protocol version 尚未記錄，不得由 SDK 版本推斷。Project State 的目標與本機程式差距見藍圖第 5 節。
>
> **2026-11-17 GitHub 施工佇列已重置：**老闆指示主要 agent 停止實作、只作規劃與管理，由 DeepSeek V4.1 Flash 執行。舊 53 張 issues（open＋closed）已全部刪除；完整備份在 `.workbuddy/github-backup/issues-before-v4.1-reset-2026-11-17.json`。新總控是 **#110**，批次為 #111–#120。每張已詳列 `docs/research/`（由既定研究稿正式提交）的必讀方案、程式範圍、施工步驟與驗收；這是**無人值守自主 loop**：前置未完成就自行完成，規格空白用 v4.1＋研究稿＋程式收斂，不向老闆提問或等待批准。每個可見增量都要即時更新 Docker UI，並在 issue 回報畫面、真實問題、證據與下一動作，讓老闆不靠程式碼也能持續看到進度。
>
> **v4.1 基線已正式進 main：**PR #121 六項 checks 全綠後 squash merge，merge commit `192fd97560ddd294307450dbc25e12260fa6385f`。已直接由 `origin/main` 驗證 v4.1、owner-reviewed 原稿、`docs/research/` 與 stage4f；DeepSeek 不需要本機 `Perplexity idea/` 或文件分支。藍圖 §4 已加入 A–H／N／P 管線及階段輸入輸出表，§5 最新目標為八狀態（含 `needs_revision`、`accepted_at`）。
>
> **老闆審閱原稿：**未修改副本保存於 `docs/product/reviewed/MARKETING-DESIGN-BLUEPRINT-v4.1-owner-reviewed.md`；產品正本仍是上層 `MARKETING-DESIGN-BLUEPRINT.md`。
>
> **2026-11-16 Marketing Design v3 歷史入口：**舊規劃追蹤 #93–#105；實際範圍與收斂次序已由上述 v4.1 總圖取代。舊 Ardot：`https://ardot.tencent.com/file/748070210348880`；本輪創作工作台 Ardot：`https://ardot.tencent.com/file/748129148813297`。
>
> **2026-11-16 全產品施工邊界：**產品範圍是整個 HeadX-Company-OS，包括 Boss Portal、共享外殼與其他部門 app；Marketing Design 只是第一條逐塊交付線，不是唯一可修改的程式區域。老闆已授權主要 agent 管理整個項目並以新規則取代舊範圍鎖，詳見 `AGENTS.md`「項目管理與施工規則」及 C128。若正確實作必須改共享導覽、權限、Frame、Boss Portal 或其他 app，可以直接施工，不必用局部 workaround 避開；但要保持單一業務真相與對象擁有權，並補上受影響 app 的測試及真瀏覽器驗收。#94 已把 768 平板導覽收回共享 `frame.css`，Design 與 Boss Portal 都以真瀏覽器驗證五個入口完整可見。交付仍一次完成一個可驗收縱切片，不把「全產品由同一位 agent 開發」理解成同時重寫所有模組。

## 開新 session 時，貼這一句就夠

> 讀 `AGENTS.md` 的新施工規則與 `docs/product/HANDOFF.md`，以 §5 作現況起點，按老闆最新目標完成一個可用縱切片。需要改共享外殼、Boss Portal、platform 或其他 app 時直接一併完成，並補跨應用測試及文件。

夜間 loop（無人值守）貼這一句：

> 讀 `docs/product/HANDOFF.md` §5 與 `AGENTS.md` 的〈Loop（無人值守）〉，由 #33 開始，一次一張，做到 #39（共九張，#41 排在第八）。撞到規格空白就停手寫低，不要問、不要猜。

新 session 不要期望記得以前的事；這一頁就是全部的入場卷。

**這一頁如果與程式碼不一致，以程式碼為真相，並即刻回來改這一頁。** 不要因為「文件沒說可以改」就讓它繼續講錯 —— 過時的手冊比沒有手冊更貴。

## 一句話現況

登入已經按身份落地：老闆去 Boss Portal，員工去所屬部門（現時只有 Marketing Design），
未指派部門的員工會被擋住並講明原因。Boss Portal 的「人員與部門」可以真建立員工、真指派部門、
真停用登入、真恢復（停用的逆操作）、真重設密碼。Marketing Design 由 Create／Projects 進入，
五個頂層模組是 Create、Brand、Materials、Knowledge、Templates；Needs 留在外殼。
Brand 既有頁可以真讀真寫，會記住每位員工上次工作的品牌，開新品牌的入口只給老闆。
Create（作品與成品）、Materials、Knowledge、Templates 現時只有固定路由與空骨架：前後端已於 2026-11-17 清空，畫面上只剩第二行頂欄、左欄與內容區三塊空白（`AppFrame` 的 `blank`），冇頁名、冇麵包屑、冇「未提供」佔位字，等老闆由零重做。
其餘四個部門 app 仍然灰掉，並如實寫明未建。

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
| `#/boss/policy/brand` | 品牌頁策略：六個槽的標準全文、每次儲存新增一版 | 可用，全部真寫入 |
| `#/design`、`#/design/create/projects` | Create／Project Library（作品庫） | 2026-11-18 重做：左欄「資料夾 → 專案集」樹＋頂部格式過濾（ALL／PPT／排版／Video，格式可動態新增），右欄專案卡片網格。三層都有 CRUD，專案可複製、可自由搬到另一個專案集。後端 `apps/platform/src/project-library`，前端 `apps/web/src/design/CreateLibrary.tsx` |
| `#/design/create/projects/:id/brief` | Project Detail | 已刪除；深連結落到 Create 空白頁 |
| `#/design/create/outputs` | Create／Outputs | 2026-11-17 前後端已清空，只留空骨架：第二行／左欄／內容區全空，冇頁名、冇佔位字（待重做） || `#/design/material/library` | Materials | 2026-11-17 前後端已清空，只留空骨架：第二行／左欄／內容區全空，冇頁名、冇佔位字（待重做） |
| `#/design/knowledge/list` | Knowledge | 2026-11-17 前後端已清空，只留空骨架：第二行／左欄／內容區全空，冇頁名、冇佔位字（待重做） |
| `#/design/templates/library` | Templates | 2026-11-17 前後端已清空，只留空骨架：第二行／左欄／內容區全空，冇頁名、冇佔位字（待重做） |
| `#/design/brand/home` | 品牌主頁：這個品牌是誰（一段）、標誌的預設用法、色彩角色的樣本、字體層級的樣本、語氣短例、每一頁的入口（含每張自定義頁）、缺頁 | 可用，全部真寫入（#39）；#94 保留深連結 |
| `#/design/brand/color` | 色彩：九個寫死的角色分三組、淺色與深色各一套值、HEX／RGB／CMYK、階、准用與不准組合（即時算對比）、標誌可用角色 | 可用，全部真寫入（#35） |
| `#/design/brand/type` | 字體：四個層級（display／heading／body／caption）各自指定家族、尺寸、行距、字重、最小尺寸、文字顏色；家族與授權（最多兩個）、中英配對、備用字、行長、對齊、錯誤用法 | 可用，全部真寫入（#38） |
| `#/design/brand/logo` | 標誌：五類資產（Logo／Wordmark／Mark／Monogram／App icon 與 favicon 合起來一類）、主標誌、四種顏色模式各自的最小尺寸（螢幕 px／印刷 mm）與對應色彩頁角色、安全範圍 X、方向與組合、背景、何時用／怎樣用、錯誤用法 | 可用，全部真寫入（#36） |
| `#/design/brand/tone` | 語氣：三到五個聲音特質（每個一句做、一句不做，兩邊都附實際句子）、禁用詞、繁中與英文是否並用、五個情境（說明／邀請／拒絕／致歉／出問題）的例句 | 可用，全部真寫入（#37） |
| `#/design/brand/p/<slug>` | 自定義頁（零到多張）：自己的名、brief、版本鏈、改名、刪頁，加上那一頁自己的內容（決定什麼／不准決定什麼／規則／例子／錯誤例子／引用哪些角色） | 可用，全部真寫入（#41） |
| `#/needs`、`#/files`、`#/account` | 需求、檔案、個人帳戶 | 可用 |

品牌模組正按 #33 至 #39、#41 重做：五頁（品牌主頁／標誌／色彩／字體／語氣）加自定義頁，不再有儀表板、渠道、版本頁，「品牌識別」一併移走，品牌清單移入品牌切換。落地一張改一張 —— 上面每一行都是**今日真相**，不是計劃。

#33 已落地：頁與版本是真的（`brand_page`／`brand_page_version`，0013），現行用算的，版本只加不改由 trigger 強制。

#32 已落地：品牌模組的頁清單由後端推出來（C104）—— 左側就是五頁加已加的自定義頁，次序是建立次序，不再有儀表板／渠道／版本／品牌識別，品牌清單移入頂欄品牌切換。自定義頁是零到多張（C101），網址 `#/design/brand/p/<slug>`，建立時三樣齊（顯示名、slug、brief）並且要答「這一頁是不是其實屬於其中一頁」。誰可以改這個品牌的頁是 (品牌, 人) 一對的授權（C103，`brand_editor`，0015），在 `#/boss/people/members` 授予；老闆永遠可以改，所以不在名單裡。

#34 已落地：策略是真的（`brand_policy_version`，0014），六個槽各有第 1 版全文，只加不改由 trigger 強制。**一份策略、六個槽，不是逐品牌一份**（C102）—— 同一類頁的專業標準不因換品牌而變，品牌之間的分別住在各品牌自己的頁。每一版品牌頁記住它當時用的策略版本（`brand_page_version.policy_version_id`），所以改策略不會重寫已經做好的頁。

#35 已落地：色彩頁不是自由文字框，是一張**有角色的表**（C105）—— 九個角色名寫死在程式裡（`brand.primary`／`brand.secondary`／`ink`／`paper`／`muted`／`surface`／`success`／`warning`／`danger`），分品牌色／閱讀色／功能色三組，功能色不可進標誌；淺色與深色共用同一批名字、各有一套值；未填的角色標「缺」，不填近似色；准用與不准組合即時算 WCAG 對比（內文 4.5:1、大字 3:1）；螢幕看 HEX 與 RGB（RGB 由 HEX 算，不另存），印刷看 CMYK。內容存成版本鏈裡的一段 JSON，所以舊版讀得返；現行是舊的自由文字就講讀不到，不假裝「全部缺」。

#38 已落地：字體頁同樣是一張表（C106），不是「揀一個好看的字」—— 四個層級各自指定家族、尺寸、行距、字重、最小尺寸與文字顏色；家族最多兩個（中英各一剛好用滿），有名、有授權、有可嵌入的檔三樣齊才算可用；缺授權或缺中文就標缺，**不會用系統預設字充當品牌字**（備用字只作渲染後備）。尺寸一定要帶單位（`18` 不是 18 像素）。文字顏色只可以揀色彩頁的角色名，這一頁沒有色值欄位。

#36 已落地：標誌頁是一份**標誌系統**（C107），不是一個上載按鈕 —— 資產只分五類（Logo／Wordmark／Mark／Monogram／App icon 與 favicon 合起來一類，所以同一類不可以有第二個），主檔一定要向量（svg／ai／eps／pdf），位圖只作預覽；四種顏色模式（品牌單色 `brand.primary`、單色正 `ink`、反白 `paper`、深底深色 `surface`）**只引用色彩頁的角色**，這一頁沒有任何色值欄位，色彩頁未定那個角色就標缺；最小尺寸分模式、分螢幕與印刷，而且一定要寫單位（`24` 與 `24mm` 都不算 px）；安全範圍 X、方向與組合、背景、何時用、怎樣用、錯誤用法逐項。字標用的家族只**引用**字體頁，不在這一頁決定。現行是舊的自由文字就講讀不到，不畫假資產。

#37 已落地：語氣頁是一份**聲音**（C108），不是三個形容詞 —— 三到五個特質，每個要寫一句做、一句不做，兩邊都要有實際句子（只有形容詞就標「只有形容詞（未附句子）」並列進缺）；禁用詞逐個加；繁中與英文是否並用要三選一（只用繁中／繁中為主夾專有名詞／中英並用），未答就是缺，不由系統代答；五個情境（說明、邀請、拒絕、致歉、出問題）各有實際會講出口的句子。這一頁沒有任何顏色、字體、標誌欄位，也不寫渠道尺寸與頁數。

#41 已落地：自定義頁是**第六種頁**（C109），不是「第六頁」—— 一個品牌可以零到多張，每張打開都是**那一張自己**的 brief 與內容，不是同一份範本換了標題。一張自定義頁有六欄（決定什麼、不准決定什麼、規則、例子、錯誤例子、引用哪些角色），另加一個「重編」；四樣來源即時讀：通用槽原文（撞了就停手，講明哪兩句撞，通用槽贏）、這一頁的 brief（少於 10 個字就講「未寫這一頁要決定什麼」，不自己編方向）、色彩與字體頁（**只引用名字**，那一頁未定值就在角色名旁標「缺」，這一頁不存色值、不定家族）、語氣頁（例子會拿它的禁用詞查，中了就當場指出，錯誤例子不查）。引用只認名字：打錯的角色名讀入時丟掉，不會留一個永遠缺的引用。「重編」不是叫 AI 作文，也不改內容：按一下就是按現在的通用槽與四樣來源落一版（記住當時用的是哪一版策略），手寫的欄位原封不動，舊版仍在。改了通用槽之後三張頁都不會自己變，要逐張按重編。它刻意**不**清走「色彩頁或字體頁未有值」的引用 —— 那是缺，不是失效，清走等於替設計師刪了他寫的一句「這一頁用品牌主色」。現行是舊的自由文字就講讀不到，並給「重新開始一張表」。

#39 已落地：品牌主頁是**集大成**（C110），不是第二套識別 —— 它自己只決定兩件事（「這個品牌是誰」那一段、標誌預設用哪一個顏色模式），其餘四塊全部即時由來源頁砌出來：色彩樣本只畫色彩頁真的有 HEX 的角色、字體樣本逐個層級列出家族名與尺寸（並如實講樣本用系統字渲染，因為字體頁只記名與授權）、語氣短例拿第一個特質「做的句子」（形容詞不是句子）、標誌用法引用標誌頁的主標誌與色彩頁的角色。入口清單**由後端推出來**：三張自定義頁就是三條獨立入口，不是一條「自定義頁」。缺分兩種講法 —— 整頁未有現行版本（「未有現行版本：色彩、字體……」）與頁有了但有幾項未填（「字體頁有層級未指定家族」），因為要做的事不同；但同一個缺只講一次，而且是**一項一行的列表**，不是用「；」串成的長句。「整頁未有版本」看頁清單判斷，不看解析結果（空字串解出來是「零資產」的合法文件，會把「未有版本」講成「未有主標誌」）。「重編」與自定義頁同一個道理：不改內容，按現在的來源落一版，手寫的這段與揀了的模式原封不動；第一版都未有時那一塊不出現。

員工直接開 `#/boss` 會見到全螢幕權限說明，沒有任何選單外流（2026-11-11 用真員工帳戶實測）。
Boss Portal 的導覽是五組：總覽｜據點與機器｜人員｜策略｜存取紀錄。

## 4. 邊份文件管邊件事

| 想知道 | 去邊 |
|---|---|
| **這套東西是什麼**（設計真相） | `docs/CONCEPT.md` |
| **Marketing Design v3 要做甚麼、為何重做、縱切片與施工次序** | `docs/product/MARKETING-DESIGN-BLUEPRINT.md`（#93） |
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
資料表：`db/migrations/0001`–`0015`，最近三支是 `0013_brand_pages.sql`、`0014_brand_policy.sql`、`0015_brand_editor.sql`。**真相以 `db/migrations/` 為準**，這一行只是指路。

## 5. 下一步：Marketing Design v3（目前有效佇列）

**開工總閘：#93 的本機藍圖、本頁更新與正確程式基線必須先經 PR 發布並合併。** 一次一張，前一張 PR 合併 `main` 才開下一張；本佇列本身不是無人值守 loop 授權。

| 位 | issue | 交付 | 開工前額外閘 | 狀態 |
|---|---|---|---|---|
| 1 | #94 | Marketing Design 導覽、路由與誠實空狀態 | #93 文件基線已合併 | 功能已完成；待 integration 基線 #108 與 PR 合併 |
| 2 | #95 | Project／Brief 與外部 agent 接手狀態 | U3 已由 C129 落實 | 功能完成；真 DB、前端、Docker、三寬度真瀏覽器驗收通過；生產 agent 未宣稱接通 |
| 3 | #96 | Need 詳情、交付／裁決與吸收閉環 | #95 已合併 | 待施工 |
| 4 | #97 | Materials 相片入庫、權利與詳情 | U5 預設權利；Files 共享權限必須在本張明確補齊 | 待施工 |
| 5 | #98 | Materials 檢索、L1／L2 與黃金查詢集 | 不以 pgvector 為前置 | 待施工 |
| 6 | #99 | Knowledge 來源、核對權限、chunk 與 citation | #98 已合併 | 待施工 |
| 7 | #100 | Templates manifest、fixtures、lint 與 Carousel 三件套 | #99 已合併 | 待施工 |
| 8 | #101 | Composition、placeholder、Provenance 與修訂 | #100 已合併 | 待施工 |
| 9 | #102 | HyperFrames carousel-png、Render Job 與 Output | U4 endpoint／認證／本機拓撲 | 待施工 |
| 10 | #103 | Brand Home v3 品牌中樞 | 不重寫十一頁 payload | 待施工 |
| 11 | #104 | Boss Portal 只讀摘要與來源 app 導向 | 不可直讀部門業務表 | 待施工 |
| 12 | #105 | Moonic IG Carousel 全閉環與兩品牌驗收 | 真 agent／renderer；不得以 fixture 冒充 | 待施工 |

**現況不要誤判：**Need 目前沒有完整 detail／event／absorption API；Files 不能假設已支援部門素材與 Output 共享；Boss 沒有四 shape 的現成 summary provider registry；repo 沒有正式 Playwright harness。各 issue 已列明程式範圍、範圍外與驗收；需要額外共享基礎設施時停下另開 issue，不夾帶。

---

以下 §5–§5.2 是**已完成的歷史記錄**，不再授權新工作；#89 已於 2026-11-16 標記由 v3 取代並關閉，未完成項目不應再開工。

工作方式是**老闆逐頁定、AI 逐頁實作**。一頁一張 issue，一張分支一個 PR，做完關掉。

**2026-11-11 夜這一輪按下面次序跑，不要重排。** 前一張 PR 合併 `main` 之後才開下一張。loop 的規矩在 `AGENTS.md` 的〈Loop（無人值守）〉；老闆給這一輪的授權範圍在 `DECISIONS.md` C100，不延伸到之後任何一輪。

| 位 | issue | 這一張交付什麼 | 為什麼在這一位 | 狀態 |
|---|---|---|---|---|
| 1 | #33 | 品牌頁版本：只加不改，現行用算的 | 其餘八張都要版本 | 已完成（`297b9a3`） |
| 2 | #34 | Boss Portal 策略：六槽全文，只有老闆可改 | #32 要六個槽都有全文 | 已完成（`504bbfd`） |
| 3 | #32 | 品牌模組五頁、導覽；自定義頁的建立／改名／刪除 | 後面四頁要掛在這一張的導覽上 | 已完成（`2dbe2a7`） |
| 4 | #35 | 色彩頁（角色名由它定） | 字體與標誌都要引用它的角色 | 已完成（`294bd93`） |
| 5 | #38 | 字體頁 | 標誌的字標要引用它 | 已完成（`2d91949`） |
| 6 | #36 | 標誌頁 | 要引用色彩角色與字體，所以排在她們之後 | 已完成（`6d2cffd`） |
| 7 | #37 | 語氣頁 | 不依賴任何視覺頁，放這裡不影響任何一張 | 已完成（`d0c758c`） |
| 8 | #41 | 自定義頁（零到多張）：每張自己的 brief，各自的版本鏈 | 要引用色彩、字體、語氣三頁，所以排在她們之後 | 已完成（`4df6ac1`） |
| 9 | #39 | 品牌主頁（集大成） | 要讀所有現行頁，包括自定義頁 | 已完成（`e1b7a03`） |

每張做完就把狀態改成「已完成（merge SHA）」。跑完之後才回到原本的隊列：Design 其餘模組（素材、知識、創作）、Boss Portal 其餘頁、Needs 詳情。

### 5.1 Loop 之後（老闆看過畫面再要求的）

九張合併之後，老闆 2026-11-12 打開 `#/design` 的反應是「我係UI度唔係好見到D乜」，並要求每一頁都要有「指示」與「只有 Boss 管理到的策略」。這一輪不是 loop，是老闆直接下的指令，一張一張做。

| issue | 這一張交付什麼 | 狀態 |
|---|---|---|
| #53 | 每頁頂部「這一頁」：現況（版本／缺口數／引用）＋ 策略（第二個入口，只有老闆可改）＋ 給 AI Agent 的接口 | 已完成（`a50a85c`） |

決定寫在 `DECISIONS.md` C111。

**每一張的完成閘（缺一項就不算完）：**

1. 先寫會 fail 的測試，貼實際輸出。
2. `npm test`、`npm run test:integration`、`npm run lint`、`npm run lint:boundaries`、`npm run build` 全綠。
3. 重建本機 Docker，用真瀏覽器走一次；回報只講「在哪個畫面看得到」。
4. 文件在同一個 PR 已同步：上面 §3 的路由表、`DECISIONS.md`（有新規則才加）、`BACKEND-FUNCTIONS-MAP.md`（有新端點才加）。
5. 無 TODO、無範圍外檔案。

### 5.2 品牌模組 v2（2026-11-12 起，取代 §5 的頁清單）

老闆 2026-11-12 判定第一版「不是用品牌思維設計」，交付設計稿與 v2 規格（#55）。頁清單由五頁改為九頁，裁決見 `DECISIONS.md` C112；設計稿正本在 `docs/product/ui/brand/`（`00-design-system.md`、`01`–`10` 各畫面規格、`png/` 十一張）。

**次序（一次一張，前一張合併 `main` 才開下一張）：**

| 位 | issue | 交付 | 狀態 |
|---|---|---|---|
| 1 | #55 | 總綱：C112 裁決＋本節規則，不寫程式 | 已完成（`1cfa3e1`） |
| 2 | #56 | 策略 v2：九槽全文、規則 id 表 | 已完成（`817c2ed`） |
| 3 | #57 | 資料外殼與四種輸出（HTML／tokens／prompt 包／PDF 介面） | 已完成（`f1be911`） |
| 4 | #58 | 缺口與 Need：兩型、一鍵建立 | 已完成（`7473a8f`） |
| 5 | #59 | 驗證規則：一個 id 一個 checker | 已完成（`a33856c`） |
| 6 | #60 | 頁清單與專屬系統建議 | 已完成（`e9b93f0`） |
| 7 | #61 | 平台頁（先做，確認 payload 形狀） | 已完成（`bc3524b`） |
| 8 | #62 | 色彩頁：色值唯一出處、替代色、版本差異 | 已完成（`485ed5a`） |
| 9 | #63 | 字體頁 | 已完成（`8f12b29`） |
| 10 | #64 | 標誌頁 | 已完成（`cdc25d0`） |
| 11 | #65 | 語氣頁 | 已完成（`e333afc`） |
| 12 | #66 | 圖像頁 | 已完成（`b41dc46`） |
| 13 | #67 | 品牌主頁 v2 | 已完成（`8a319b3`） |
| 14 | #68 | 應用層：已核准範例與成功 prompt | 已完成（`a205425`） |
| 15 | #69 | 整合驗收與響應式 | 已完成（`86a2976`；回報見 `BRAND-V2-ACCEPTANCE.md`） |

**2026-11-12 補記（#87，不在十五張之內）**：0017 只放寬了固定頁的 CHECK，**冇為既有品牌插入 platform／image／examples**，所以舊品牌永遠只有五頁，而畫面不報錯（`withBrandPages()` 只畫後端回的幾頁）。`db/migrations/0020_brand_fixed_pages_backfill.sql` 補齊八頁並對齊次序（C127）。`ensureFixedPages()` 保持 `do nothing`，補次序只在 migration 做一次。

**共通規則（與 #55 同步；正本在 #55，這裡是給每個 session 讀的鏡像）：**

1. 內容是帶型別的 payload，HTML 是輸出。每頁＝payload＋renderer；HTML、tokens.json、prompt 包、A4 PDF 都由 payload 渲染。資料庫不存 HTML 當內容。
2. 「每個品牌長相不同」由 payload 的 layout 控制（區塊的選擇、次序、重點與理由）。放不進區塊詞彙的版面用受限 `custom_block`，不得含色值。
3. 色值只住在色彩頁 payload；其他頁與 renderer 只引用角色名。`gates.test.ts` 的「色值只放 tokens.css」要擴到品牌 renderer 與 `custom_block`。
4. 重做不是疊加：拆掉被取代的舊程式，不准新舊並存。#33 的版本機制保留。
5. 策略正文只住 #56；其他 issue 只引用槽名與規則 id。
6. 可量化規則有 id（例：`color.r2`），寫在策略句尾，由 #59 的 checker 一一對應。
7. 缺就標缺，不准虛構；每個缺是一個缺口，可建立 Need（#58），一律以 Needs 呈現（C69），不另造缺口頁。
8. 每個決定附理由；每頁有真實內容的示範與反例，不用 Lorem ipsum 或 Your Brand。
9. 每張頁面 issue 定義自己的 payload schema，並同時給 tokens 映射與 prompt 包映射；改 payload 必須同時更新兩個映射。
10. 畫面照設計稿。沒有對應 png 或規格與 issue 衝突，停下回報，不自己畫。1024、768 寬度依 Frame v1.5 第 2.9 節。
11. 權限：只有老闆改策略與開新品牌；品牌設計師與老闆編輯頁；員工只讀。
12. 遵守 Frame 硬規則：無搜尋（C63）、無深色 UI（C65）；外殼只用黑灰白；藍色只用於寫入或確認的主要按鈕；畫面內只有產品文案，沒有說明用的 meta 文字。

**差異可數**（頁面類 issue 的完成條件）：同一張頁在兩個內容不同的品牌之間，最少兩項實質差異（品牌主頁四項），PR 貼對照與截圖；少於此數視為未做完。

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

### 5.3 品牌建立（brand guide，stage0–4h）：每格是一個工作單位（2026-11-17）

`/#/design/brand/dashboard` 是 12 個階段的引導，內容正本在 `Perplexity idea/Branding`
（引擎在 `apps/platform/src/brand-guide/engine/reference/`）。老闆 2026-11-17 定下的
使用方式，取代之前「檢視／編輯／AI Agent 三個 tab」的做法：

1. **格上只放內容**：一張卡＝一個區塊，顯示位置編號、名稱、已選內容與決策摘要；
   右上角是已填進度（`2/2`），有檔案時左邊多一個 `檔案 n` 標籤，唔使開卡就知
   邊幾格放過料（只計未移除的附件）。
   卡上**沒有**工具列，也**沒有**「點擊卡片即可編輯」之類的提示字。
2. **點卡＝打開這一格**（`SectionCardOpen`）：卡橫跨整行，頂欄右邊依次是
   `複製 Prompt`、`睇 Prompt`、`儲存`、`×`（關閉）。下面由選項、決策、檔案、
   歷史排落去。改選項後按「儲存」，卡不會關，仲可以繼續寫決策、放檔案。
   改動未存就關（或跳去另一格）會問一句，不會靜靜丟走。
3. **每張卡有位置編號**（`00.1`、`04A.7`…，在 stage 內連續、跨 stage 唯一）。
   編號是給人與 agent 共用的對位。
4. **每張卡有一份可複製的 prompt**（`apps/web/src/design/brand-block-prompt.ts`），
   內容跟住目前選擇即時更新（用 draft，未儲存都複製到最新）：位置、識別碼
   （brand／stage／block）、已選、未選、可選項、要求與回覆格式。
   文字全部住在 i18n（`brandBuild.block.prompt.*`），結構在 module。
5. **prompt 帶上決策**：`## 目前決策（現況）`（連作者與時間，agent 寫的會標
   `AI Agent（名）`）＋`## 之前的決策（新到舊，共 n 版）`（最多列 5 版）。
   prompt 本身可在卡內直接改：`儲存 Prompt` 寫入 `prompt_override`，
   `還原自動版本` 清空回到跟選項走的那一版。自訂版畫面會講明「改選項不會自動更新」。
6. **檔案**：上載／預覽／下載／移除（走既有 `/files` 檔案層）。圖片、PDF、
   純文字、影音在卡內預覽；其他類型只給下載。列表顯示大小、上載日期與上載者
   （`uploadedByName`）。**沒有改名** —— 顯示名就是原檔名，改名只會令「當時放低
   的是哪一份」講不清。下載用 `/api/files/:id?download=1`，由伺服器回
   `attachment`（不靠前端 `download` 屬性）。
7. **每張卡有一段決策記錄**：與 AI／人討論完，把結論寫落去。每次內容有變就留一版。
   由 agent 寫入的會顯示「由 AI Agent（名） · 時間」，人寫的顯示「由 名 · 時間」。
8. **每張卡有自己的歷史**：決策版本 ＋ 檔案加減（移除都保留，連移除者），時間倒序；
   agent 寫的版本標「決策（AI Agent）」。「清除決策」只清現況，不刪歷史。

資料：`db/migrations/0026_brand_guide_block.sql` 三張表 ——
`brand_guide_block`（現況）、`brand_guide_block_revision`（追加版本）、
`brand_guide_block_file`（附件，`removed_at` 標記）。
`0027_brand_guide_block_prompt.sql` 加 `prompt_override`、`decision_agent_id`
（現況由哪隻 agent 寫）、revision 的 `agent_id`。
路由在 `apps/platform/src/brand-guide/block-routes.ts`：
`GET …/:stage/blocks`、`PUT …/blocks/:blockId/decision`、
`PUT …/blocks/:blockId/prompt`、`POST／DELETE …/blocks/:blockId/files[/:attachmentId]`。
寫入要品牌編輯權，讀要登入；每次寫入都留 audit。

### 5.4 Agent 經 MCP 寫回決策（2026-11-17）

「同 agent 傾完，它自己存」不是靠人手貼：prompt 最後一節 `## 寫回系統（MCP）`
直接寫明工具名與三個識別碼，agent 讀完就知怎寫。

- **平台端**：`apps/platform/src/brand-guide/agent-routes.ts`
  `GET /agent/brand-guide/blocks?brandId=&stage=`、
  `PUT /agent/brand-guide/blocks/:blockId/decision`。
  認證是 `requireAgent`（43 字元 Bearer token），再要 **`design` app 的有效授權**，
  否則 403；每次寫入 audit `brand.guide.block.decision.agent`，並記 `agent_id`。
  回傳 `written: false` 代表內容與現況相同（沒有新版本），不是失敗。
  編號與名稱沿用紀錄，agent 不會無意改掉位置標籤。
- **MCP server**：`tools/mcp-brand-guide/server.mjs`（stdio，`@modelcontextprotocol/sdk`）
  工具：`brand_block_list`、`brand_block_get`、`brand_block_save_decision`。
  設定範本：`tools/mcp-brand-guide/mcp-config.example.json`。
- **接線步驟**：`#/admin/staff` 開一個 agent → `#/admin/grants` 給它 `design`
  授權（active）→ 簽發 token → 把 token 放進 MCP 設定的 `HEADX_AGENT_TOKEN`。
  token 只是憑證，不寫入 repo。
- 人在畫面看到的決策、歷史與 agent 寫入的是同一份資料：沒有第二套「AI 的答案」。

**不要做**：把舊的逐維度提示詞清單搬返去（`brandBuild.agent.prompts*` 已刪），
或者把 `檔案／決策／歷史` 按鈕放返上格面 —— 這些都屬於「打開之後」那一層。
卡片上的 prompt 是唯一入口。

`AI Agent (JSON)` 只匯出**已填的決策**與**已上載的檔案**（連檔案位置
`<origin>/api/files/<fileId>`），一格都未填就只顯示一句空狀態
（老闆 2026-11-17：沒有打算一次填滿一版）。結構在
`apps/web/src/design/brand-agent-input.ts`（純函式，`apps/web/test/brand-agent-input.test.ts`
鎖住「只帶有內容的格、已移除檔案不匯出、檔案要有絕對網址」），
DOM 標記是 `data-brand-agent-json` / `data-brand-agent-empty`。
**不要**把 brief／state 倒回去 —— 那份長 JSON 會吃掉 agent 的 context，
而且未填的欄位會被當成已決定。

### 5.5 00 業務基礎搬到 Boss Portal（2026-11-17）

老闆定：`00 業務基礎` 講的是「這門生意怎麼運作」，不是品牌設計的一部分，
所以**由 Design 搬去 Boss Portal**，同一個區塊只留一個入口。

- **Boss Portal › 品牌**：左側欄一頁一個品牌（導覽由 `/brands` 清單即時砌出來，
  每頁 key 就是品牌 id，網址 `#/boss/brand/<id>`）。只有一個品牌時左欄仍然列出
  （`AppFrame` 的 `listSinglePage`），因為它是一個清單，不是一頁。
- **品牌頁內容**：`BrandBusinessStage`（`apps/web/src/design/BrandScreen.tsx`）
  直接開 `StageDetail` 的 `stage0`，沒有「返回」與上／下一站。填寫、儲存、prompt、
  檔案、決策、歷史與 agent 寫入全部沿用 0026／0027 那三張表，沒有第二份資料。
- **Boss 首頁**：四個 KPI 數（據點／待批准／品牌／Needs）撤走，改成「全公司業務」：
  每個品牌一節，顯示業務畫布、單位經濟、起步清單、準備度檢查
  （`BrandBusinessSummary`，只讀）。跨品牌匯總未做，等老闆另行定案。
  副標用新鍵 `boss.overview.leadBusiness`，舊鍵 `boss.overview.lead` 原封不動。
- **Design 品牌建立**：由 `01 定位與張力` 開始（`BUILD_STAGES` 濾走 `stage0`），
  總覽是 11 張階段卡；`stageFromStorage` 也只接受這 11 個，舊的 session 記錄
  指住 `stage0` 會自動退回總覽。`STAGES` 仍然保留 12 個（引擎與 MCP 要對位）。

### 5.6 新增品牌搬到 Boss Portal（2026-11-17 晚）

老闆：「新增品牌掣不應該在 Design app，帶來 `#/boss/brand/`。」

- **`#/boss/brand` 是「全部品牌」頁**（`apps/web/src/boss/BrandsScreen.tsx`）：
  一行一個品牌（名、代碼、「打開」），整行是一條 hash 連結。頁頭主要動作是
  `新增品牌`，按下去在清單上面打開 `BrandCreateForm`
  （`apps/web/src/boss/BrandCreateForm.tsx`）。
- **品牌模組是常駐的**（`BOSS_NAV` 直接有第一頁 `brands`）。之前是「有品牌才
  splice 一個模組出來」，結果一個品牌都未有時 `#/boss/brand` 到不了，連第一個
  品牌都無處可開。現在品牌清單只決定「後面接幾個品牌頁」。
- **錯 id 要老實講**：`#/boss/brand/<id>` 解不到時，`resolveNav` 會退回模組第一頁；
  `BossPortal` 因此再看一次 `path[1]`，分三種講法：讀緊／讀唔到／真的找不到
  （`boss.brand.notFound`）。三種都不可以靜靜畫返清單。
- **Design 不再有建立入口**：`design.brand.{add,newCode,...,empty,lead,homeLead,count}`
  已刪（`design.brand.lead` 有插值，`packages/i18n/test/i18n.test.ts` 的插值清單
  同步移除）。沒有品牌時 `NoBrand` 只講一句去哪裡開，並給老闆一個
  `去 Boss Portal 開品牌` 的按鈕（`navigatePath('/boss','brand')`）；
  非老闆仍然見到 `design.brand.ownerOnly`。
- 驗收：`app-nav.test.ts` 斷言 Boss 模組順序（overview／brand／sites／people／access）
  與「品牌模組第一頁永遠是 `brands`」；實測新增品牌 → 清單與左欄同時多一行 →
  點入去 27 張 00 卡；重複代碼回 409 並顯示「呢個品牌代碼已經存在」；
  `#/boss/brand/nope` 顯示找不到；390px 無橫向溢出。

### 5.7 階段頁的四格 KPI 撤走（2026-11-17 晚）

老闆：「We don't need this in everywhere.」指每一站都重複一次的
`已填欄位／未填欄位／填寫區塊／需要留意` 四格。

- **已刪**：`StageDetail` 的 `.brand-dash__kpis` 整組，以及只服務這四格的
  CSS（`.brand-dash__kpi*`）與 i18n 鍵（`brandBuild.dash.{done,fields,missing,todo,watch,blocks,detail,openDetail,missingHint,allFilled,checksCount}`）。
- **仍然有進度**：頂欄那條 `6%` ＋ `1/17 欄位` 就是唯一的進度顯示（`brandBuild.dash.fieldsN`），
  填一格就動。「需要留意」改由頁尾 `檢查` 一節逐條講，不再只報一個數。
- 因為 `StageDetail` 同時服務 Design 01–10 與 Boss 00，改一次兩邊一齊清。
- 順手修窄螢幕：`.brand-cardgrid` 在 720px 以下原本用 `minmax(400px, 1fr)`，
  390px 會撐出 30px 橫向捲軸；改單欄，並給 `.brand-dash`／`__body`／`__band`
  加 `minmax(0, 1fr)`、卡片 `min-width: 0`，實測 390px 溢出 0。

### 5.8 04A–04H 獨立成「品牌集」（brand set，2026-11-17 晚）

> **同日晚上再收窄**：04A 核心識別與 04G 治理搬回品牌層、04F 行銷內容搬去
> Boss Portal › Marketing。所以品牌集現在只裝 **04B–04E、04H**。見 §5.9。

老闆：「04A-04H 應該 set 成一個 Brand set —— 一套可以重複套用到任何產品／設計／
輸出的做法。左欄管理品牌集，一個資料夾裝多套（例如 2026 有四套），可以自由搬、
複製、改名、安全刪除。」

- **01–03 留在品牌總覽**（`#/design/brand/dashboard`，只出三張階段卡）。
  其餘 04 不在品牌總覽的卡片裡：那三格是「品牌建立」的流程，04 是做法。
- **品牌集是新的收納層**（0028）：`brand_set_folder`（資料夾，只分類）＋
  `brand_set`（一套 04 的做法，`folder_id` 為 null 就是未分類）。左欄是一棵
  「資料夾 → 品牌集」的樹，搜尋、展開收起、逐行選單（開啟／改名／移到／複製／
  刪除）與「已刪除 → 還原」都在 `apps/web/src/design/BrandSetsRail.tsx`。
- **答案跟著品牌集走**：`brand_guide_state` 與 `brand_guide_block` 各加
  `brand_set_id`（null＝品牌層）。唯一鍵因此拆成兩條 partial index，否則兩個
  品牌集永遠只存得一份答案。所有 block／state／brief 端點收 `?setId=`，由
  `brand-guide/set-scope.ts` 一次判斷（不屬於這個品牌 404、已刪除 409、
  01–03 帶 setId 400）。
- **規矩寫死在 store**（`apps/platform/src/brand-sets/store.ts`）：
  刪資料夾不刪品牌集（回到未分類）；刪品牌集是軟刪可還原；複製只抄現況
  （決策、選擇、仍在掛的檔案），不抄歷史；撞名自動加「（2）」。
- **路由**：`#/design/brand/stage/<stage>`（01–03）、`#/design/brand/sets/<id>`
  與 `#/design/brand/sets/<id>/<stage>`（04）。品牌模組在 `DESIGN_NAV` 有
  `dashboard` 與 `sets` 兩頁，但都 `subbar: false`（頁籤會同左欄講同一件事）；
  麵包屑因此講得對。外殼新增 `hideSidebar`：品牌模組自己有一條左欄，外殼那條
  收起來，免得同時出現兩條「品牌」欄。
- **MCP**：`brand_block_list`／`brand_block_get`／`brand_block_save_decision`
  加選填 `setId`，agent 要改某一套品牌集就講清楚是哪一套。
- 驗收：`apps/platform/test/integration/brand-set.integration.test.ts` 八條
  （兩集互不覆蓋、已填數、複製不抄歷史、搬資料夾、刪資料夾不刪集、軟刪／還原、
  01–03 帶 setId 被拒、別人的集 404）；`apps/web/test/brand-set-route.test.ts`
  鎖網址解析；Docker `:4210` 實測建集→寫 04A 決策→另一集仍然空白→複製→
  刪除→還原，390px 窄螢幕無橫向溢出。

### 5.9 04A／04G 回品牌層、04F 搬去 Boss Portal › Marketing（2026-11-17 晚）

老闆：「核心識別其實唔常改，品牌集就成日改」＋「04G 治理都搬上左欄，唔好住品牌集」
＋「04F 行銷內容搬去 Boss Portal，我自己管，唔想其他同事見到我嘅行銷策略，
而且行銷策略係全公司共用。」

- **三個 stage 三種歸屬**，寫死在 `apps/platform/src/brand-guide/set-scope.ts`：

  | stage | scope | 資料怎存 |
  | --- | --- | --- |
  | 04A 核心識別、04G 治理 | 品牌層 | `brand_id` 有值、`brand_set_id` null |
  | 04B–04E、04H | 品牌集 | `brand_set_id` 有值 |
  | 04F 行銷內容 | 公司層 | `brand_id` null、`brand_set_id` null |

  `SET_STAGES` 因此只剩五個；`COMPANY_STAGES` 只有 `stage4f`。品牌集頁面帶住
  04A／04G 的 `?setId=` 會被 400 `set_stage_mismatch` 擋住，不會靜靜寫一份無人讀到的答案。
- **左欄**（`BrandSetsRail.tsx`）：品牌總覽（01–03）之後是兩個固定項
  `04A 核心識別`、`04G 治理`（`data-brand-rail-stage`），之後才是「品牌集」那棵樹。
  它們的網址是 `#/design/brand/stage/stage4a`、`…/stage4g`，與 01–03 同一組路由。
- **公司層 04F**（0029）：`brand_guide_state`／`brand_guide_block` 的 `brand_id`
  改為可空，加 `check (brand_id is not null or brand_set_id is null)`，另加
  `brand_guide_state_company_key_idx`（`(stage) where brand_id is null`）與
  `brand_guide_block_company_key_idx`（`(stage, block_id) where brand_id is null`）。
  普通的 unique index 會把 null 當成彼此不同，所以公司層一定要另開一條。
- **路由** `apps/platform/src/marketing/routes.ts`：`/company/guide/:stage/...`
  （schema／state／brief／blocks／decision／prompt／files），與品牌那組同形，
  前端只換一個 base。**每個端點都先驗 `role === 'owner'`**：不是老闆就是 403
  `owner_only`，連讀都不行 —— 「看不到」是需求本身，不是副作用。
- **前端**：`apps/web/src/api.ts` 把九條端點收成一個 `GuideEndpoints` 物件
  （`brandGuideApi(brandId, setId)` 與 `companyGuideApi()`），`StageDetail` 收一個
  `api` prop，畫面只有一份。`CompanyMarketingStage` 由 `BossPortal` 在
  `BOSS_NAV.marketing` 那頁渲染（`#/boss/marketing`）。
- 驗收：`apps/platform/test/integration/company-marketing.integration.test.ts` 五條
  （老闆寫讀、員工讀寫都 403、未登入 401、公司層與品牌層互不覆蓋、非 04F 打公司路徑 404）；
  `brand-set.integration.test.ts` 收緊成「01–03、04A、04F、04G 帶 setId 全部 400」；
  `apps/web/test/brand-set-route.test.ts` 鎖住 04A／04G 在品牌層、04F 不在品牌模組。
  Docker `:4210` 實測：左欄兩個固定項、`#/boss/marketing` 出 04F 十二張卡、
  手打 `#/design/brand/stage/stage4f` 退回品牌總覽、390px 無橫向溢出、零 console error。

### 5.10 AI Agent (JSON) 推到「一組階段」層；階段按鈕撤走（2026-11-17 晚）

老闆：「Each brandset, 核心識別, 治理, 品牌總覽 should have AI Agent (JSON)」
＋「we don't need 階段 buttons」。

- **匯出本來只有單階段**（`StageDetail` 頂欄一個 `AI Agent (JSON)`，內容是
  `{brand, stage, decisions, files}`）。04A／04G 是品牌層的階段頁，所以一直有；
  缺的是**總覽層**：品牌總覽（01–03）與每個品牌集（04B–04E、04H）都是一組階段，
  沒有一個「階段」可以按。
- **新增 `buildScopeAgentInput`**（`apps/web/src/design/brand-agent-input.ts`）：
  ```
  { brand, scope: { kind: 'brand' | 'brand-set', id, name, stages: ['01','02','03'] },
    stages: [{ id, code, name, decisions, files }] }
  ```
  決策與檔案按階段分開 —— 同一個位置編號（`04B.1`）在每套品牌集都會出現，
  攤平就分不出是邊一份。空階段不輸出（同單階段匯出原則一樣：未填的站列出來
  只會令 agent 以為「決定過，只是內容是空」）。位置編號用 `Intl.Collator`
  數字排序（`04A.2` 要排 `04A.10` 之前）。
  單階段與整個範圍共用同一個 `collect()`，所以「只帶已填決策／只帶未移除檔案／
  檔案連位置」三條規則只有一份實作，不會一邊漏 `removedAt`。
- **畫面**：`BrandOverview` 收一個 `agent` prop（api／品牌／scope），進度條右邊
  多一個 `AI Agent (JSON)`（`data-brand-scope-agent-toggle`），面板用同一組
  `.brand-agent` 樣式。按下去才逐站 `api.blocks(stage)`（3 站或 5 站），
  打開總覽不會先打幾個 request。載入失敗可重試、全空就講清楚為甚麼是空。
- **階段按鈕撤走**：`StageDetail` 刪了「上一階段／下一階段」與 `onNavigateStage`，
  只剩 `AI Agent (JSON)`（與非 Boss 頁的「返回總覽」）。理由：那一串次序其實是
  左欄那棵樹的事，人由左欄進去比在頁尾猜「下一站是甚麼」清楚。
  連帶刪 `brandBuild.stage.prev`／`next` 兩條文案與 `BUSINESS_STAGES`／
  `MARKETING_STAGES` 兩個只用來排次序的常數。
- **同時修一個真 bug**：`GuideEndpoints` 的 `?setId=` 一度拼在 `/blocks` 之前，
  實際送出 `…/guide/stage4b?setId=xxx/blocks` —— 伺服器只看到 `stage4b` 加一個
  空 query，於是品牌集裡面每一格都 404（品牌層沒有 query，所以 01–03 一直正常，
  看起來像「只有品牌集壞了」）。現在 `guideEndpointsOf(base, scope)` 一律
  「砌好完整路徑，最後才接 query」，並由 `apps/web/test/guide-endpoints.test.ts`
  鎖住四條實際 URL。
- 驗收：`brand-agent-input.test.ts` 9 條（新增 3 條 scope 例子）、
  `guide-endpoints.test.ts` 4 條；Docker `:4210` 真瀏覽器實測四個位置都出到 JSON
  （總覽寫 01 一格、品牌集寫 04B 一格、04A 寫一格、04G 寫一格，截圖後全部刪回）、
  階段按鈕在畫面完全搜不到、390px 溢出 0、零 console error。

### 5.11 範圍層 Prompt：品牌總覽、品牌集、04A、04G 都有「複製／睇／改」（2026-11-17 晚）

老闆：「Each brandset, 核心識別, 治理, 品牌總覽 should have Prompt as other
cards having 複製 Prompt and 睇 Prompt (with edit prompt)」
＋「each brand set inside 04B–04H, each brand set inside things that have prompt
should have its own `## 識別碼`, because there will be multiple Brand set」。

**先講第二件事，因為它是資料錯誤而不是文案問題**：`block_id`（例如 `set:tension`）
在每一套品牌集都一樣，而原本卡片 prompt 的 `## 識別碼` 只有
`brand / stage / block`。同一個品牌開兩套做法，兩張卡片的 prompt 除了決策內容
之外一模一樣 —— agent 寫回時分不出是哪一套，就會改錯另一套的同一格。
現在：

- `buildBlockPrompt` 收 `setId`／`setName`，品牌集內會多一行
  `set: <id>（<name>）`，寫回參數亦變成
  `brandId=…、stage=…、setId=…、blockId=…`（MCP 的
  `brand_block_save_decision` 本來就收 `setId`）。
- `PromptContext` 加 `setId`／`setName`；`StageDetail` 收 `setName`，
  `BrandScreen` 由 `activeSet?.name` 傳入。品牌層（01–03、04A、04G）不傳，
  prompt 不會多一行空 `set:`。

**第一件事**：總覽層與 04A／04G 現在有自己那一段 Prompt。

- **新表 `brand_guide_prompt`（0030）**：`brand_id`、`brand_set_id`、`scope`、
  `prompt_override`、`updated_by`。空字串＝用自動版本（跟住決策更新）。
  為什麼不塞進 `brand_guide_state.state`：state 是 stage 引擎的輸入，brief 由它
  算出來；一段幾千字的 prompt 放進去，等於叫引擎讀一件它不認識的東西。
  為什麼 `scope` 是文字而不是 stage：品牌總覽不是 stage（它是 01–03 合計），
  而 04A 雖然是 stage，它的 prompt 也不是 state。scope 值：
  `brand`（品牌總覽）、`set`（一套品牌集）、`stage4a`／`stage4g`（單頁模組）。
- **路由** `apps/platform/src/brand-guide/prompt-routes.ts`：
  `GET|PUT /brands/:brandId/scope-prompt/:scope?setId=`。scope 與 setId 不匹配
  一律 400 `invalid_scope`（品牌層用 `set`、品牌集用 `brand`、04A 帶 setId），
  寧可講錯，都不要靜靜寫入一個無人讀到的位置。寫要品牌編輯權，員工 403。
- **Prompt 內容** `apps/web/src/design/brand-scope-prompt.ts`（純函式，有測試）：
  `範圍`（品牌／範圍／階段）→ `進度`（逐站 % 與未填數）→
  `已經定咗嘅決策`（每格一段，含 `## 識別碼：<編號> <名稱>` 與
  `brand / set / stage / block` 四行）→ `仲未傾嘅區塊`（叫 agent 用
  `brand_block_list`，不要自己猜有幾多格）→ 討論規則／要做嘅事／回覆格式／
  寫回系統。空範圍仍然可用（講明未有決策），不會出一段空殼。
- **畫面**：`BrandOverview` 進度條右邊多 `複製 Prompt` 與 `睇 Prompt`；
  `StageDetail` 只會在 `scopePrompt` 為真時出現（`BRAND_FIXED_ENTRIES`，
  即 04A／04G）。面板（`ScopePromptPanel`）重用卡片的 textarea 與
  `儲存 Prompt`／`還原自動版本`，所以兩處手感一樣。
  總覽的兩個面板（Prompt 與 AI Agent JSON）**共用同一份區塊紀錄**：
  一次過載入，按下去才抓，開過就重用；複製未開面板都可以（先載入再砌）。
- 驗收：`brand-scope-prompt.test.ts` 6 條（每格識別碼、兩套品牌集分得出、
  品牌層冇 `set:`、單階段範圍、空範圍、進度不造假）；
  `brand-block-prompt.test.ts` 加 1 條（品牌集卡片 prompt 帶 set 與 setId）；
  `brand-scope-prompt.integration.test.ts` 8 條（存得返、兩套互不覆蓋、
  scope 不匹配 400、空字串＝還原、員工 403、未登入 401、跨品牌 404）。
  Docker `:4210` 真 Chrome：總覽與 04A 都出到含 `## 識別碼` 的 prompt、
  品牌集 prompt 帶 `set: <id>（<name>）` 與 `setId=`、自訂版 reload 後仍在、
  品牌集內卡片 prompt 同樣帶 set 與 setId、390px 溢出 0、零 console error。

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
12. **`.frame-subbar` 自己寫了 `display: flex`，會蓋過 `hidden` 的 `display: none`。** 沒有頁籤時它仍然佔一格 0px 高，把 `.frame-body` 頂落一行，footer 就升到畫面中間。已在 `frame.css` 用 `.frame-subbar[hidden] { display: none }` 加 `grid-row` 明確定位修好。
13. **前端不要每次 render 都 `brandGuideApi(...)` 一個新物件。** `StageDetail` 的 `load` 依賴 `api`，物件一換就重新抓資料，變成無限迴圈。要在 `useMemo` 裡固定（見 `StageDetail` 的 `brandApi`）。
14. **`brand_guide_state`／`brand_guide_block` 有三個 scope。** 寫入時 upsert 的 `on conflict` 一定要對中同一條 partial index（公司層／品牌層／品牌集），否則 Postgres 會報「對不上任何唯一約束」。改動時三個分支一齊看。
15. **同一個 `block_id` 在每套品牌集都一樣。** 任何 prompt／寫回只要少了
    `setId`，agent 就會改到另一套的同一格。卡片 prompt 與範圍 prompt 都要帶
    `set:` 那一行，`GuideEndpoints` 的路徑亦要帶 `?setId=`。
16. **範圍 prompt 不要放進 `brand_guide_state.state`。** state 是 stage 引擎的
    輸入，多一個幾千字的 key 會令 brief／completeness 的計算變得不可預期。
    自訂版本住 `brand_guide_prompt`（0030），自動版本由前端即時砌。
17. **query string 一定要接在路徑最尾。** `…/guide/stage4b?setId=x/blocks` 不是「多一個參數」，而是「路徑只到 stage4b，後面全被當成 query 值」——伺服器回 404，而品牌層沒有 query 所以完全正常，看起來像「只有品牌集壞了」。`api.ts` 的 `guideEndpointsOf` 現在是「先砌完整路徑，最後才 `withScope()`」；改 URL 時用 `guide-endpoints.test.ts` 對實際字串，不要只看有沒有 200。

## 7. 工作方式（老闆 2026-11-11 定，2026-11-11 晚補充）

- 老闆設計 UI、逐頁講清楚每個功能點怎樣運作；AI 負責令它成真。
- **不要等老闆的 UI 設計稿才開工。** 先把要求做成可以在 Docker 裡真的用，老闆用完直接提意見。
- 老闆不是工程師：**回報要講「在哪個畫面看得到」，不要講技術細節。**
- **規矩由老闆定，不是由文件定。** 文件與程式碼不一致時，以程式碼為真相，即刻改文件，不要「等 issue」。
- 不對外發送、批准，永遠由人按；其餘預設不加閘。
- 現在刻意不做：生產部署、備份演練。等頁面成形之後再排。品牌引導的 MCP
  讀寫已落地（見 5.4）；其他模組的 MCP 工具仍未做。
- 本機 Docker 就是驗收環境，老闆可以即時自己看。
- GitHub 沒有 Pro，分支保護開不到；靠「一個 PR 一件事、CI 綠、AI 自己修紅燈」代替。
- **夜間 loop 是老闆逐輪授權的。** 規矩在 `AGENTS.md`（一次一張、先紅後綠、綠燈才合、撞到空白就停手寫低、不問人也不猜）；授權只覆蓋當晚那一輪，不會自動延伸到下一輪。

## 8. 誠實的未做清單

- Needs：開立（MCP 端）、交貨、吸收、驗收、詳情頁、我負責分頁
- Design：品牌模組 v2 已完成（#55–#69；七頁＝主頁／平台／色彩／字體／標誌／語氣／圖像＋已核准範例）
- Design：Create（作品／成品）、Materials、Knowledge、Templates 於 2026-11-17 連同 projects／carousel 後端一併清空，只留空骨架；重做時由零建立資料模型、API、MCP 與畫面，不再沿用舊 Composition／Render／HyperFrames 實作
- Design：品牌版本的介面（後端有 `brand_release` 與每頁版號，前端未曝露）
- Boss Portal：憑證與金鑰、批准紀錄、管理級成員、操作紀錄
- 新增據點第三步（要後端收確認檔的端點）
- 備份從未做過一次真正的「刪庫再還原」實測
- 6 個 app 之中仍然只有 2 個有畫面（boss、design）
- 完全未部署到生產環境；對外只有 Cloudflare Tunnel 一條，保安級別仍是「只有 app 自己的登入」
- HR app 現在不開。員工個人頁現在不設計。

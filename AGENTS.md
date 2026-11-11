# AGENTS.md

給在這個 repo 工作的 AI agent。開工前依次讀：**這一份 → `docs/CONCEPT.md`（設計真相）→ `docs/INDEX.md`（文件入口）→ `docs/product/HANDOFF.md`（今日現況）→ 你要改的 app 的 `AGENTS.md` 與 `DESIGN.md`（如果有）→ 你被指派的 issue**。

若 `CONCEPT.md` 與本檔衝突，以 `CONCEPT.md` 為設計真相、本檔為施工紀律；兩者意思相反時停手，在 issue 提問，不要自己揀一份。

## 這個 repo 是什麼

HeadX Company OS：一間公司運作的唯一底座，全部放在這個 repo，全部跑在 Docker。一次安裝 = 一個 Site（一個地點的營運單位），主機是公司自己的電腦。

**這不是 ERP，也不是 SaaS。是老闆開公司用的基建。** 設計真相在 `docs/CONCEPT.md`，這裡只講施工紀律。

- **agent 是主要執行者，人是判斷者與補位者。** 接口是一等公民；畫面是給人看結果與補位。
- **Boss Portal 對業務只讀。** 它只看各 app 交出的四個 shape（projects／needs／approvals／schedule），**不讀別人的資料表**；不在 Portal 內指派、改期、改狀態。**唯一的例外是帳戶**：建立員工、指派部門、停用登入、重設密碼都在 Portal（C92）——帳戶是身份，屬於 platform，不是任何部門的業務資料。
- 每個部門是一個獨立的 app 模組，有自己的資料與畫面：設計、銷售、營運、財務、人事、客服（日後再加）。清單對一間公司固定，老闆管註冊與升級。原始碼沒有的 app 由 **App Forge** 生成（`docs/concept/09-app-forge.md`），不是手寫。
- 所有容器共用同一個 Postgres 與同一個 MinIO。身份、授權、Need、審計、設定與背景隊列屬於 platform，不屬於任何一個 app。
- **AI 做不到的才變成 Need**——不是錯誤訊息，不是靜靜降級。Need 兩型：`deliverable`（交東西）與 `decision`（下判斷；agent 必須先做一次並附建議，不是原封把問題丟給人）。
- **預設不加閘**（原則 1）：不預設 approval gate、不預設 validator。批核是老闆逐項開啟的設定，不是架構預設。
- **對外可達性只能向下收窄**：manifest 的 `exposure` 是硬上限，部署決定今次開幾道門，畫面只誠實顯示你而家喺邊道門。現時只開 `gateway-internal` 一道。見 `docs/CONCEPT.md` 第 9 節。
- 這個 repo 不執行 AI 模型。AI 是外部客戶端（MCP／HTTP），同人一樣經介面接入。

## 開工規則

1. 只做「依賴的 issue 全部已合併」的 issue。否則在 issue 留言說明並停止。
2. 一張 issue = 一個分支 = 一個 PR。分支名：task/<issue 號>-<短英文名>。
3. 先寫會 fail 的測試，再寫實作。
4. PR 描述四段：為什麼／改了什麼／驗證（貼實際指令與實際輸出）／不做什麼。
5. issue 裡的驗收指令沒有全部通過，不要宣稱完成。
6. 超出 issue 範圍的想法，開新 issue，不要順手做。
7. 規格有空白或互相矛盾：停下，在 issue 留言提問，不要猜。
8. **不要新增說明文件，但要修現有的。** `docs/` 與各 app 的 `DESIGN.md` 如果與程式碼不一致，以程式碼為真相，**即刻改文件**——不要等 issue，也不要留著一份講錯的手冊（過時的手冊比沒有手冊更貴）。純粹「想加一份新文件」才要 issue。**`AGENTS.md` 可以改，但每次改動必須在 `docs/product/DECISIONS.md` 留一條**（C86、C93）；改動任何一條「不變量」要老闆明確同意，不是你自己判斷。
9. 只改你被指派的 app 資料夾。要改 `packages/` 或 platform，必須有獨立的 issue。
10. app 之間不可互相 import；只能用 `packages/` 與 platform 的介面。搬動檔案的 issue（R1 至 R6）不改行為，搬動前後同一組測試必須全過。

## 已定案的技術決定（要換請先開 issue 說明理由）

- 語言：TypeScript（strict）。Node 用當日 LTS，版本同時寫在 .nvmrc 與 Dockerfile。
- npm workspaces（`apps/*` 與 `packages/*`）；後端 Fastify；前端 React＋Vite；單元測試 Vitest；e2e 測試 Playwright。
- 程式碼按 app 模組化，邊界由 `npm run lint:boundaries` 強制；容器是打包選擇：同一個 `app-host` 映像用 `APP_SET` 載入 app，曝露程度不同的 app 不同容器。細節見 `docs/architecture/CODE-MAP.md`。
- 入口：gateway 是同一個映像，按版本 profile 起實例（internal；國際版另有 partner、customer）。國際版對外只經 Cloudflare Tunnel（cloudflared）連到 gateway-partner 與 gateway-customer；大陸版沒有 cloudflared。**現時實際只開一道門 `gateway-internal`**——partner／customer 的 profile 與 exposure 語義已存在，但未部署；不要因為 profile 裡寫得出來就當它已開通。
- 版本差異（入口、容器組合、端口、渠道、預設語言）只寫在 `packages/edition-profile`，app 內不寫地區判斷。
- 資料庫：一個 Postgres，每個 app 一個 schema、一個資料庫帳號，只能存取自己的 schema 與 platform 開放的介面。純 SQL migration，每個 schema 獨立編號 NNNN_說明.sql，只往前加，不改已套用的檔案。
- 檔案儲存：MinIO，版本固定（server RELEASE.2025-10-15T17-29-55Z、mc RELEASE.2025-08-13T08-35-41Z），不可升級；由官方原始碼在本機建置，不修改上游程式碼，資料放在 host 資料夾（bind mount）。MinIO 是 AGPL-3.0，私有自架已接受。大陸版需要預先建置的映像或離線安裝包（S2-06）。
- 不使用 Redis。背景工作用 Postgres 隊列。
- 部署：Docker Compose。目標機器是長期開機的 Windows（Docker Desktop），即公司自己的電腦。所有維運腳本用 Node 寫，不依賴 bash。.ps1 檔必須是 UTF-8 with BOM；.cmd 檔不得含中文。
- 端口：按容器宣告，由 edition-profile 決定，`.env` 可覆寫；容器內一律 8080；主機端口預設只綁 127.0.0.1，唯一例外是 gateway-internal，它綁管理者選定的 LAN 位址並配合防火牆限制公司子網。不可使用未指定位址的發佈設定。新增或更改端口，必須同時更新 edition-profile、compose 與 .env.example，並讓 `npm run ports:check` 通過。端口表見 `docs/architecture/REPO-MAP.md`。
- 語言：介面、commit、PR、程式註解一律繁體中文（香港）；程式識別字用英文。大陸版預設簡體中文介面。
- 介面風格：Apple HIG。白底黑字、chrome（頂欄、側欄、浮層）黑灰白、`#0057FF` 只用於內容區主要按鈕與空狀態圖示、`#B8F36B` 已停用（包括現有品牌標誌方塊），不再把綠色寫成點綴色；系統字體堆疊、平鋪內容用細線分隔、浮層可用柔和陰影、不用 emoji、不用紫色漸層。（#153 主色 A，2026-11-09）

## 不變量（違反即退回，即使測試通過）

1. **對外發送永遠由人按下。** agent 只做到草稿／準備發送為止；approve 類工具不在 MCP 可用範圍。注意這不是「AI 做任何事都要批」——預設無閘（原則 1），只有老闆明確開啟的動作才需批核。
2. **AI 不能直接對外發訊息。** 草稿留在系統內，等 staff 或老闆按下發送。
3. 做不到的必須留痕。沒有來源的內容不准寫，缺口要變成 Need。
4. 失敗要看得見。越權要報錯，不要回空結果；空畫面要說真話，不用假資料。
5. 狀態盡量用算的，不要存。新增狀態值，必須同時有寫入它的程式。
6. 審計記錄只准追加，由資料庫 trigger 強制。
7. 刪除一律是軟刪除（deleted_at）。
8. 一個事實只有一個來源、一個方向。前端不保存資料副本。
9. 門檻與政策寫在資料裡，不寫死在程式。不可為了讓測試通過而放寬門檻。
10. 密碼、token、金鑰不進 repo、不進日誌、不在 API 回應中回傳。.env 不進 git。
11. 不複製授權不明的程式碼；不使用 tldraw。
12. app 不讀別的 app 的資料表。跨 app 只經 platform 介面或摘要介面。
13. 敏感 app 的授權要老闆批准。授權、改權限、改設定一律寫審計。
14. 每個 app 的 manifest 必須宣告 `exposure`。internal 的 app 只接受 internal 入口的 session；partner 的 app 接受 internal 與 partner；customer 的 app 只接受 customer，且與後台 app 不共用容器、session 或 cookie。（對外入口只在國際版啟用；大陸版只有 internal。）
15. 國際版的對外入口只有 cloudflared 指向 gateway-partner 與 gateway-customer。任何 app 容器、gateway-internal、資料庫與 MinIO 的端口都不得對互聯網發佈；除 gateway-internal 外都不得對 LAN 發佈。大陸版沒有任何對外入口。唯一例外是 Demo Public Stack（C52）：它是一個獨立隔離環境，可以用 gateway-internal 映像，只由 cloudflared 經獨立 Demo 子網域指向該 Demo 入口，不發佈任何主機端口，並且不得指向正式資料庫、正式 storage、正式 API 或正式老闆／員工帳戶。契約見 `docs/deployment/demo-public-stack.md`。
16. 模組與 package 只經 `index.ts` 或 `exports` 對外；app 之間不互相 import；分層方向為 web → api → domain → db；`npm run lint:boundaries` 必須通過。
17. 版本差異只寫在 `packages/edition-profile`。app 內不寫「如果是大陸版」之類的判斷。

## 完成的定義

- issue 內的驗收指令全部通過，實際輸出貼在 PR。
- 至少一個「會 fail 的測試」證明檢查真的有效。
- CI 全綠。
- 沒有 TODO，沒有「稍後補」。
- 沒有修改 issue 範圍以外的檔案。

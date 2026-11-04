# AGENTS.md

給在這個 repo 工作的 AI agent。開工前先讀完這一份，然後讀 `docs/INDEX.md`、你要改的 app 的 `AGENTS.md` 與 `DESIGN.md`（如果有），最後讀你被指派的 issue。

## 這個 repo 是什麼

company-os 是一間公司的整套軟件，全部放在這個 repo，全部跑在 Docker。一部機器 = 一間公司，主機是公司自己的電腦。

- Boss portal 是老闆的入口，看各部門的運作、產物質素與營運。
- 每個部門是一個獨立的 app 模組，有自己的介面與資料：員工、設計／內容／網站、銷售、營運財務、人事、客服（日後會再加，例如研發）。程式碼按 app 模組化，容器按版本 profile 打包。
- 安裝時選國際版或大陸版。國際版有三個入口（內網、夥伴經 Cloudflare Access、客戶）和 customer-portal、supplier-portal；大陸版第一階段只有內網入口。登入後只看到被授權的 app。
- 所有容器共用同一個 Postgres 與同一個 MinIO。身份、授權、Need、發件箱、審計、設定、MCP 與背景隊列屬於 platform，不屬於任何一個 app。
- AI 盡力做事；AI 做不到的才變成 Need 派給員工，員工上傳成果，老闆驗收。
- 這個 repo 不執行 AI 模型。AI 是外部客戶端，經 MCP 連入，只能用固定六個動詞：browse、read、write、find、render、help。

## 開工規則

1. 只做「依賴的 issue 全部已合併」的 issue。否則在 issue 留言說明並停止。
2. 一張 issue = 一個分支 = 一個 PR。分支名：task/<issue 號>-<短英文名>。
3. 先寫會 fail 的測試，再寫實作。
4. PR 描述四段：為什麼／改了什麼／驗證（貼實際指令與實際輸出）／不做什麼。
5. issue 裡的驗收指令沒有全部通過，不要宣稱完成。
6. 超出 issue 範圍的想法，開新 issue，不要順手做。
7. 規格有空白或互相矛盾：停下，在 issue 留言提問，不要猜。
8. 不要新增說明文件，也不要改這個檔案，除非 issue 明確要求。`docs/` 與各 app 的 `DESIGN.md` 只在 issue 指定時才改。
9. 只改你被指派的 app 資料夾。要改 `packages/` 或 platform，必須有獨立的 issue。
10. app 之間不可互相 import；只能用 `packages/` 與 platform 的介面。搬動檔案的 issue（R1 至 R6）不改行為，搬動前後同一組測試必須全過。

## 已定案的技術決定（要換請先開 issue 說明理由）

- 語言：TypeScript（strict）。Node 用當日 LTS，版本同時寫在 .nvmrc 與 Dockerfile。
- npm workspaces（`apps/*` 與 `packages/*`）；後端 Fastify；前端 React＋Vite；單元測試 Vitest；e2e 測試 Playwright。
- 程式碼按 app 模組化，邊界由 `npm run lint:boundaries` 強制；容器是打包選擇：同一個 `app-host` 映像用 `APP_SET` 載入 app，曝露程度不同的 app 不同容器。細節見 `docs/architecture/CODE-MAP.md`。
- 入口：gateway 是同一個映像，按版本 profile 起實例（internal；國際版另有 partner、customer）。國際版對外只經 Cloudflare Tunnel（cloudflared）連到 gateway-partner 與 gateway-customer；大陸版沒有 cloudflared。
- 版本差異（入口、容器組合、端口、渠道、預設語言）只寫在 `packages/edition-profile`，app 內不寫地區判斷。
- 資料庫：一個 Postgres，每個 app 一個 schema、一個資料庫帳號，只能存取自己的 schema 與 platform 開放的介面。純 SQL migration，每個 schema 獨立編號 NNNN_說明.sql，只往前加，不改已套用的檔案。
- 檔案儲存：MinIO，版本固定（server RELEASE.2025-10-15T17-29-55Z、mc RELEASE.2025-08-13T08-35-41Z），不可升級；由官方原始碼在本機建置，不修改上游程式碼，資料放在 host 資料夾（bind mount）。MinIO 是 AGPL-3.0，私有自架已接受。大陸版需要預先建置的映像或離線安裝包（S2-06）。
- 不使用 Redis。背景工作用 Postgres 隊列。
- 部署：Docker Compose。目標機器是長期開機的 Windows（Docker Desktop），即公司自己的電腦。所有維運腳本用 Node 寫，不依賴 bash。.ps1 檔必須是 UTF-8 with BOM；.cmd 檔不得含中文。
- 端口：按容器宣告，由 edition-profile 決定，`.env` 可覆寫；容器內一律 8080；主機端口預設只綁 127.0.0.1，唯一例外是 gateway-internal，它綁管理者選定的 LAN 位址並配合防火牆限制公司子網。不可使用未指定位址的發佈設定。新增或更改端口，必須同時更新 edition-profile、compose 與 .env.example，並讓 `npm run ports:check` 通過。端口表見 `docs/architecture/REPO-MAP.md`。
- 語言：介面、commit、PR、程式註解一律繁體中文（香港）；程式識別字用英文。大陸版預設簡體中文介面。
- 介面風格：Apple HIG。白底黑字、accent 黑色 #000、系統字體堆疊、綠色 #B8F36B 只當點綴、平鋪內容用細線分隔、浮層可用柔和陰影、不用 emoji、不用紫色漸層。

## 不變量（違反即退回，即使測試通過）

1. 批准只能由人按下。MCP 永遠沒有 approve 工具。
2. AI 不能直接對外發訊息。一律寫入發件箱，由規則決定放行或交老闆批准。
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
15. 國際版的對外入口只有 cloudflared 指向 gateway-partner 與 gateway-customer。任何 app 容器、gateway-internal、資料庫與 MinIO 的端口都不得對互聯網發佈；除 gateway-internal 外都不得對 LAN 發佈。大陸版沒有任何對外入口。
16. 模組與 package 只經 `index.ts` 或 `exports` 對外；app 之間不互相 import；分層方向為 web → api → domain → db；`npm run lint:boundaries` 必須通過。
17. 版本差異只寫在 `packages/edition-profile`。app 內不寫「如果是大陸版」之類的判斷。

## 完成的定義

- issue 內的驗收指令全部通過，實際輸出貼在 PR。
- 至少一個「會 fail 的測試」證明檢查真的有效。
- CI 全綠。
- 沒有 TODO，沒有「稍後補」。
- 沒有修改 issue 範圍以外的檔案。

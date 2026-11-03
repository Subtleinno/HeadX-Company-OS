# AGENTS.md

給在這個 repo 工作的 AI agent。開工前先讀完這一份，然後讀你被指派的 issue。

## 這個 repo 是什麼

company-os 是一間公司的整套軟件，全部放在這個 repo，全部跑在 Docker。

- Company OS（老闆台）只有老闆一個人用。
- 部門軟件給員工用：設計／內容／網站、銷售、營運 ERP＋財務、人事、客服＋CRM。
- 所有部分共用同一個資料庫、同一個檔案儲存、同一套登入。
- AI 盡力做事；AI 做不到的才變成 Need 派給員工，員工上傳成果，老闆台看得到所有 Need 有沒有完成。
- 這個 repo 不執行 AI 模型。AI 是外部客戶端，經 MCP 連入，只能用固定六個動詞：browse、read、write、find、render、help。

## 開工規則

1. 只做「依賴的 issue 全部已合併」的 issue。否則在 issue 留言說明並停止。
2. 一張 issue = 一個分支 = 一個 PR。分支名：task/<issue 號>-<短英文名>。
3. 先寫會 fail 的測試，再寫實作。
4. PR 描述四段：為什麼／改了什麼／驗證（貼實際指令與實際輸出）／不做什麼。
5. issue 裡的驗收指令沒有全部通過，不要宣稱完成。
6. 超出 issue 範圍的想法，開新 issue，不要順手做。
7. 規格有空白或互相矛盾：停下，在 issue 留言提問，不要猜。
8. 不要新增說明文件，也不要改這個檔案，除非 issue 明確要求。

## 已定案的技術決定（要換請先開 issue 說明理由）

- 語言：TypeScript（strict）。Node 用當日 LTS，版本同時寫在 .nvmrc 與 Dockerfile。
- npm workspaces；後端 Fastify；前端 React＋Vite；單元測試 Vitest；e2e 測試 Playwright。
- 資料庫：Postgres。純 SQL migration，檔名 NNNN_說明.sql，只往前加，不改已套用的檔案。
- 檔案儲存：MinIO，版本必須與 HxDesign 相同（server RELEASE.2025-10-15T17-29-55Z、mc RELEASE.2025-08-13T08-35-41Z），由官方原始碼在本機建置，不修改上游程式碼，資料放在 host 資料夾（bind mount）。MinIO 是 AGPL-3.0，私有自架已接受。
- 不使用 Redis。背景工作用 Postgres 隊列。
- 部署：Docker Compose。目標機器是長期開機的 Windows（Docker Desktop）。所有維運腳本用 Node 寫，不依賴 bash。.ps1 檔必須是 UTF-8 with BOM；.cmd 檔不得含中文。
- 所有對外端口都可由 .env 覆寫，並提供 npm run ports:check。
- 語言：介面、commit、PR、程式註解一律繁體中文（香港）；程式識別字用英文。
- 介面風格：跟 HxDesign（Apple HIG 實作）。白底黑字、accent 黑色 #000、系統字體堆疊、綠色 #B8F36B 只當點綴、平鋪內容用細線分隔、浮層可用 HxDesign 陰影、不用 emoji、不用紫色漸層。

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

## 完成的定義

- issue 內的驗收指令全部通過，實際輸出貼在 PR。
- 至少一個「會 fail 的測試」證明檢查真的有效。
- CI 全綠。
- 沒有 TODO，沒有「稍後補」。
- 沒有修改 issue 範圍以外的檔案。

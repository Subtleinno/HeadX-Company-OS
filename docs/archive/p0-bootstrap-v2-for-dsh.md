> **已歸檔（2026-11-03）**
> 原本回答：P0 建置 Super Agent 的任務書。
> 為何失效：P0 已完成。
> 現在看：無需替代。
# P0 任務書 v2:建置 Super Agent(給 DeepSeek Harness 自己執行)
關聯文件:company-os-master-plan.md(請先完整閱讀)
範圍:只做 P0。完成後停下,等待使用者批准;不得自行開始 P1。

## 分工
- 使用者手動完成(Step A):安裝 DSH、輸入模型 API Key、建立 GitHub repo 與 Token。
- DSH 執行(Step 1 至 Step 5):隔離、權限底座驗證、安裝 Super-agent 原型、驗收。
- 由使用者審核後手動套用:任何權限、審批、沙箱、熔斷開關的設定檔。

建議在專用 VM 或獨立機器上進行,不要用主要工作機。

## Step A:使用者手動(DSH 不得代做)
1. 安裝 Node.js(版本以官方 README 為準),執行 `npx @deepseek-ai/dsh web`,Web UI 只綁定 127.0.0.1。
2. 在 UI 自行輸入模型 API Key。
3. 在 GitHub 建立私人 repo「company-os」,並開啟 main 的 branch protection(需審查、禁止 force push)。
4. 建立 fine-grained Token:僅限 company-os;權限限於建立分支與 PR 所需的最小範圍;不含 admin、workflows、secrets。Token 由使用者在需要時親自輸入。
5. 把本文件與 company-os-master-plan.md 放入 DSH 工作區。

## 給 DSH 的規則(貼入第一則訊息)
1. 不輸入、猜測或儲存任何 API Key、Token、密碼;需要時停下請使用者輸入。
2. 保持目前的權限預設(workspace-write + 詢問批准),不得切換到 danger-full-access。
3. 不得修改自己的權限、審批、沙箱、熔斷開關設定;只能「提出設定草稿」,由使用者審核後手動套用。
4. 不使用 sudo;不得掛載 Docker socket;不得以 root 執行任何 Agent 或容器。
5. 寫入全域設定、開放網路埠、授予 GitHub 權限、安裝第三方插件前,先說明並等待批准。
6. 與 repo 實際文件不一致時,以 repo 為準並回報差異。
7. 所有動作寫入 ~/dsh-install-log.md(不含任何密鑰)。
8. 每完成一個 Step 就停下回報,等使用者說「繼續」。

## Step 1:環境檢查
- 確認 Node.js、pnpm(corepack enable)、git、Docker 可用及版本,缺漏先回報。
- 閱讀 DSH repo 的 SAFETY.md 與官方文件(https://deepseek-harness.github.io/deepseek-harness/),摘要與 P0 相關的權限、沙箱、審批、headless、Schedule 說明。DSH 為 developer preview,可能有破壞性變更。

## Step 2:容器隔離
- 為未來的 Agent 工作建立 Docker 部署(可參考社群映像 runzhliu/deepseek-harness-docker;使用前先審查其 Dockerfile 與 README)。
- 要求:非 root、盡量唯讀根檔案系統、只掛載專用工作目錄、資源限制、預設不開放對外埠、不掛載 Docker socket。
- 社群映像預設為單人、受信任的開發環境,不是多租戶沙箱;因此規劃為「每個品牌/每條線一個容器、各自金鑰」,P0 只建立 company-os 一條線。
- 驗證:容器內程序無法讀取宿主機其他目錄。每個 docker 指令逐條向使用者說明並取得批准。

## Step 3:權限與審批底座(只驗證與提出草稿)
- 驗證預設沙箱與審批行為;在 headless 模式下,需詢問的動作預期會被自動拒絕(預設拒絕),請實測並記錄證據。
- 提出「全域熔斷開關」草稿(例如一個停用所有寫入金鑰/暫停排程的腳本),由使用者審核後手動套用,再由 DSH 協助測試。
- 查證 DSH 與模型供應商是否有每日用量上限機制;沒有的話記為 P1 待辦。

## Step 4:安裝 Super-agent 原型
- Clone https://github.com/deepseek-ai/dsh-superagent-prototype 至 ~/dsh-superagent。這是研究原型,非官方產品。
- 完整閱讀 README.md、SETUP.md,以及 docs 中 philosophy、authorization、deployment 相關文件。
- 依 SETUP.md 進行:一次只問使用者一個簡短問題,先展示完整計畫並取得同意,再安裝設定。
- 目標 repo 僅限 company-os(不得連 HxDesign 正式 repo)。GitHub 指令白名單僅限使用者本人帳號。
- 不啟用飛書(留到 P6)。
- 執行 `pnpm check`(型別檢查、測試、建置)並回報。

## Step 5:驗收測試
- [ ] Web UI 只綁定本機
- [ ] 在 company-os 開一個低風險 issue(如新增 README),Super-agent 建立 work item、在獨立 Session 工作並開出 PR,而不是直接推送
- [ ] 嘗試被禁止的動作(直接推 main、讀取金鑰檔、寫入工作區外),確認被擋下並有紀錄
- [ ] headless 模式下需批准的動作被自動拒絕
- [ ] 熔斷開關經測試可用
- [ ] 日誌與 git 歷史中沒有任何密鑰
- [ ] 容器內無法讀取宿主機其他目錄
停下,以繁體中文輸出:已完成項目、版本、問題、待使用者決定事項。

## 交棒:Super Agent 的初始待辦(使用者審核後,逐一建為 company-os 的 issue)
每個 PR 需使用者批准合併並附測試。PR 描述須列出:目的、風險級別、測試結果、可能影響、回滾方式。
1. 專案骨架:TypeScript monorepo、測試、CI、提交規範、docs 目錄(放入 master plan)。
2. 不可變審計日誌模組(只可追加、雜湊鏈;含請求者/動作/參數/結果)。
3. 風險分級(L0–L4)與動作登錄表(每個工具/動作登記級別與金額上限),以資料檔管理並有測試。
4. 政策閘道 v0:依級別放行/擋下/轉入批准;冪等鍵;預設拒絕與逾時取消;熔斷開關。
5. 批准收件匣 MVP:請求清單、每日摘要(依類型分組)、顯示依據與影響、批准/退回(結構化理由代碼)、記錄批准耗時。
6. 與 DSH 審批機制的銜接(先閱讀官方插件開發文件與 approval 服務;DSH 原生僅有詢問/不詢問,分級邏輯由閘道負責)。
7. 指標儀表板:每日審批時間、推翻率/修改率、失敗與重試、用量成本。
8. P2 準備:為 HxDesign 測試 fork 擬定開發線設定(僅 PR 權限),以及策略庫存取方案(待使用者決定:Agent 可否讀內容,或只讀結構)。

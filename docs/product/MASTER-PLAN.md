# Company OS 全盤計劃（Starter v1）

狀態：草稿 v1。本文件是 Company OS 的 source of truth；之後逐節 review，改動以 commit 記錄，並同步第 18 節決策日誌。

版本：2026-11-04　起點：main = 72e563d　撰寫：Company OS 開發管理者
讀者：老闆（看第 1、13、15、17 節）、ZCode（QA／QC）、WorkBuddy（實作）

---

## 1. 這是什麼，要做到什麼

Company OS 是 company starter：任何一間公司裝好 Docker 就能開始運作的整套公司軟件底座。一間公司一個安裝，全部自架、本機優先，不是多公司共用的雲端服務。裝完是空的：沒有假部門、沒有假資料，第一次開機由老闆建立唯一的老闆帳戶，再由安裝精靈設定公司。

運作模型：AI 盡力做事；AI 做不到的才變成 Need 派給員工；員工交成果，老闆驗收。AI 是外部客戶端，只經 MCP 的六個動詞（browse、read、write、find、render、help）連入，本 repo 不執行任何模型。所有對外訊息一律先進發件箱，由規則決定放行或交老闆批准，MCP 永遠沒有 approve 工具。

「完成」的定義（整個計劃的終點）：
1. 老闆打開「今日」，看到真實的待驗收、逾期、卡住的 Need，沒有一個數字是假的。
2. 員工登入後只看到自己的 Need 與所屬部門，能提交成果。
3. AI 能經 MCP 讀取授權範圍的資料、建立 Need、交出草稿，但不能批准、不能直接對外發送。
4. 對外訊息（內部通知、B2B Email、客戶 WhatsApp）全部經發件箱，老闆批准後才送出。
5. 五個部門各有一條真實可用的流程。
6. 另一間公司可以用一鍵安裝加公司範本匯入快速開始。

## 2. 設計原則

### 2.1 十一條不變量（AGENTS.md，違反即退回）
批准只能由人按；AI 不能直接對外發訊息；做不到的必須留痕；失敗要看得見；狀態盡量用算的；審計只准追加（資料庫 trigger）；刪除一律軟刪除；一個事實只有一個來源、一個方向；門檻與政策寫在資料裡；密碼、token、金鑰不進 repo、日誌、API 回應；不複製授權不明的程式碼。

### 2.2 從 HxDesign 繼承的習慣
1. 一個真相，一個方向：每種事實有唯一來源與流向，見第 4 節。
2. 能算的不存：缺口、逾期、狀態、儀表板數字全部查詢計算。
3. 繼承，不複製：部門預設值、Need 類型、公司範本都由資料列提供，讀取時解析。
4. 編號即地址：每個 Need 有全安裝唯一編號，編號可貼進訊息，AI 憑編號就知道該把成果交到哪裡。
5. 成品是資料表，預覽頁是地址。
6. 畫面誠實：未接上的功能寫「未接上」；灰掉的按鈕就是真的不能按；空狀態說真話。
7. 一行只給一個訊號；收起的是「不能做的事」，不是資訊。
8. 每一道門都要走一次：驗收時用真實瀏覽器走完所有入口，不是走到同一個終點就算。
9. 軟刪除加回收桶；還原子項時母項一併還原。
10. 決策日誌記錄當時的原話、裁定與理由，並標明「臨時答案」或「長遠答案」。

### 2.3 Starter 專屬原則
- 固定層與設定層分開：不變量、平台骨架、權限引擎固定；驗收規則、隔離開關、發件規則、金額門檻、通知渠道、語系、啟用部門全是設定項，預設值齊全。
- 出貨是空的；只有第二間公司真的需要不同時，才把某件事變成設定項。
- 設定改動本身是敏感動作，一律寫審計。

## 3. 系統架構

### 3.1 容器（Docker Compose，端口一律只綁 127.0.0.1，可由 .env 覆寫）
| 容器 | 作用 |
|---|---|
| db | Postgres。資料在 host 資料夾 C:\company-os-data |
| storage | MinIO（官方原始碼建置，版本固定），資料在 host bind mount |
| api | Fastify。登入、Need、發件箱、MCP 端點 |
| web | React＋Vite 的靜態外殼 |
| worker | 與 api 同一個映像、不同啟動命令。處理隊列：逾期檢查、session 清理、通知與發送 |
| tunnel（可選） | 對外入口，等 S1-15 決定方案 |

不使用 Redis；背景工作用 Postgres 隊列（SELECT … FOR UPDATE SKIP LOCKED）。

### 3.2 程式結構
- apps/api、apps/web、apps/worker（共用 packages）。
- packages/policy：權限引擎，純函數，唯一回答「誰可以做什麼」。
- packages/design-tokens：色、字、間距的唯一來源，與 HxDesign 對齊。
- modules/<name>/manifest.json：功能與導航的唯一來源；刪資料夾即卸載；壞 manifest 容器 exit 1。
- db/migrations/NNNN_說明.sql：只往前加。

### 3.3 資料流方向（單向）
資料庫 → API → 畫面／MCP。前端不保存資料副本。AI 的任何寫入先進收件匣，經 Keep 後才成為可用資料；對外訊息先進發件箱，經政策放行或老闆批准後才由 worker 送出。

## 4. 一個真相表（Company OS 版）
| 事實 | 唯一來源 | 流向 |
|---|---|---|
| 有哪些功能與導航 | modules/*/manifest.json | manifest → registry → GET /modules → 導航 |
| 資料形狀 | db/migrations/*.sql | migration → 資料庫 → API |
| 誰可以做什麼 | packages/policy | policy → API → 拒絕理由 |
| 色字間距 | packages/design-tokens | tokens → 生成 CSS → 元件 |
| 公司設定、發件規則、門檻 | company_setting、policy_rule | 資料庫 → GET /settings → UI、worker |
| 我是誰 | app_user | 資料庫 → GET /auth/me |
| 我登入了沒有 | auth_session（只存 token 的 SHA-256） | cookie → session |
| Need 的內容 | need | 資料庫 → API → UI／MCP |
| Need 的狀態、逾期、是否卡住 | need_event（只追加）加 due_at，現算 | 查詢計算，不存 |
| Need 編號 | COS-### 全安裝唯一序列 | 資料庫 → API 輸出 → UI chip |
| 成果檔案 | stored_file 加 MinIO | 單一位置，無副本 |
| 對外訊息及其批准 | outbox、outbox_version、approval | 草稿 → 政策 → 批准 → worker 送出 |
| 隊列工作 | job 表 | 資料庫 → worker |
| MCP token | mcp_token（只存 SHA-256） | 建立時顯示一次 |
| 審計 | audit_log（trigger 只准追加） | 只能寫入 |
| 被刪除的東西 | deleted_at | 回收桶 |
| 備份 | BACKUP_ROOT 的備份目錄加 manifest | 見 docs/backup-restore.md |

## 5. 領域模型

以下為欄位級規格，S1-06 與 S1-02 的 issue 以此為準。

### 5.1 設定層
- company_setting(key, value jsonb, updated_at, updated_by)：key 唯一。每次變更寫審計。
- policy_rule(id, domain, condition jsonb, action, priority, enabled, created_at)：例如 domain=outbox，condition={channel:whatsapp, category:quote}，action=require_approval。條件欄位可用 amount_gte 這類門檻。沒有任何規則命中時，預設 require_approval。
- 種子檔只負責第一次填入，之後以資料庫為準。

### 5.2 身份
- app_user(id, email, display_name, role, password_hash, disabled_at, must_change_password, created_at)。role ∈ owner、staff。已有「只允許一位 owner」的唯一索引。
- agent_identity(id, name, created_by, disabled_at)：沒有密碼；預設零權限。
- department_member(user_id, department, is_lead)：is_lead 第一版保留不用。
- mcp_token(id, agent_id, token_hash, scopes jsonb, expires_at, revoked_at)：scopes 為部門乘動詞。

### 5.3 Need
- need_type(id, department, name, schema jsonb, default_due_hours)：Need 的欄位定義在資料裡，不為某間公司預先建欄位。
- need(id, ref_no, department, type_id, title, blocked_work_ref, ai_tried, why_ai_cannot, deliverable_spec, acceptance_criteria, due_at, created_by_kind, created_by_id, assignee_id, cancelled_at, created_at)。
- need_event(id, need_id, kind, actor_kind, actor_id, payload jsonb, created_at)。kind ∈ created、assigned、commented、submitted、returned、verified、cancelled。表由 trigger 保護，只准追加。
- 現算狀態：未指派、已指派、已提交、已退回、已完成（verified）、已取消；逾期 = due_at 已過且未完成、未取消。
- 每個 Need 必填：卡住的是哪件工作（編號）、AI 已試過什麼、為什麼 AI 做不到、要交什麼、怎樣算完成、期限。缺一項不能建立。

### 5.4 成果與收件匣
- deliverable(id, need_id, kind, stored_file_id, body, version, submitted_by_kind, submitted_by_id, inbox_state, created_at)。kind ∈ file、text、link、html。
- inbox_state ∈ pending_keep、kept、archived。人手提交直接 kept；agent 提交為 pending_keep；Keep 可撤回成 archived，不刪除。

### 5.5 發件箱
- outbox(id, channel, category, target, created_by_kind, created_by_id, current_version, created_at)。
- outbox_version(id, outbox_id, version, subject, body, content_hash, created_at)：版本不可變。
- approval(id, outbox_version_id, decision, decided_by, decided_at, reason)：只接受人類 session。批准綁 content_hash；批准後任何改動就是新版本，必須重批。
- 狀態現算：草稿、待批准、已批准、已送出、已退回、送出失敗。只有 worker 有權限轉成已送出。
- delivery_log(id, outbox_version_id, channel, attempt, result, created_at)。

### 5.6 其他
- job(id, kind, payload, run_at, attempts, locked_at, last_error, done_at)。
- audit_log：已存在，只准追加。登入失敗的 target 為 HMAC hash，不存明文 email（#65）。

## 6. Need 生命週期

1. 建立：AI 或老闆建立，必填欄位齊全；產生 COS-###；寫 created 事件與審計。
2. 指派：老闆指派給員工（或依部門規則預設）；寫 assigned。
3. 處理：員工可留言（commented）。
4. 提交：員工上傳檔案或貼文字，寫 submitted；AI 提交的成果進收件匣待 Keep。
5. 驗收：依設定，預設老闆驗收。通過寫 verified；退回必填原因，寫 returned，回到員工。
6. 取消：寫 cancelled，附原因。
7. 逾期：worker 定期檢查，只產生「逾期」事件供通知與今日頁；狀態仍由查詢計算。
8. AI 接手：Need 完成後，AI 經 MCP 讀到 verified 的成果，繼續原工作。

規則：人能手動設定的只有「驗收」；其餘轉換都由「做了那件事」觸發，並記錄是人還是 agent。

## 7. 角色與權限

| 動作 | 老闆 | 員工 | agent |
|---|---|---|---|
| 建立 Need | 可 | 可（自己部門） | 可（授權部門） |
| 指派 Need | 可 | 否 | 否 |
| 看 Need | 全部 | 自己的與所屬部門（隔離開關開時） | 授權範圍 |
| 提交成果 | 可 | 可 | 可，進收件匣 |
| Keep | 可 | 可（自己部門） | 永遠不可 |
| 驗收或退回 | 可 | 否（預設） | 永遠不可 |
| 批准發件 | 可 | 否 | 永遠不可 |
| 改公司設定與政策 | 可 | 否 | 否 |
| 管理員工與 agent | 可 | 否 | 否 |
| 看審計 | 可 | 否 | 否 |
| 刪除 | 軟刪除 | 軟刪除自己建立的 | 否 |

越權必須報錯，不回空結果；不存在與越權的外部回應一致（同一個 404），避免洩漏。最後一位 owner 不可停用。員工沒有電郵重設密碼，由老闆重設，首次登入強制改密碼；改密碼會撤銷其他 session。

## 8. 發件箱與批准

1. 任何對外訊息（內部通知、B2B Email、客戶 WhatsApp）先寫成 outbox 草稿。
2. 政策引擎讀 policy_rule：命中放行規則的類別直接進送出隊列；否則進待批准。預設全部待批准。
3. 老闆在批准收件匣看到內容、渠道、收件人，按批准、退回或修改。
4. 批准綁定 content_hash；修改產生新版本，重新批准。
5. 只有 worker 能送出，並寫 delivery_log；失敗重試，超過次數進死信，在今日頁可見。
6. 渠道：員工用 Lark（國際版）與飛書（大陸）；B2B 用 Email；客戶用 WhatsApp Business。三者信任等級不同，政策可分別設定。

## 9. MCP 契約

固定六個動詞，工具數永遠是 6；新能力是新增資源詞彙，不是新增工具。
- browse(path)：列出可存取的資源樹（部門、Need、成果）。
- read(ref)：讀單一資源，ref 可用 COS-###。
- find(query, scope)：搜尋，只回傳授權範圍。
- write(resource, op, payload)：op 限定 need.create、need.comment、need.submit、deliverable.draft、outbox.draft。結果一律進收件匣或發件箱草稿。
- render(ref, format=html)：回傳自包含 HTML（brief 或成品預覽），媒體以 data URI 內嵌，有大小上限，超過明說。
- help(topic)：回傳目前身分的可用能力、授權範圍、已知缺口。

保證：沒有 approve、send、delete；每次呼叫寫審計並記錄 agent 身分；越權報錯；token 只存 SHA-256、建立時顯示一次、可撤銷；有每日用量上限、速率限制與全域總開關。無來源的內容不准寫入（不變量 3）。

## 10. 設定項與預設值

| 設定 | 選項 | 預設 |
|---|---|---|
| 驗收規則 | 老闆／部門主管／交了就算 | 老闆 |
| 部門隔離 | 開／關 | 關（全公司可見） |
| 發件規則 | 每個渠道與類別：放行或批准 | 全部批准 |
| 付款金額門檻 | 金額乘幣別 | 全部批准 |
| 通知渠道 | 站內／Lark／飛書／Email／WhatsApp | 只在站內 |
| 公司語系 | 繁體／簡體 | 繁體 |
| 啟用部門 | 模組開關 | 全部關 |
| 逾期寬限 | 小時 | 0 |
| AI 營運者與費用上限 | agent 連線 | 未設定 |

## 11. 介面設計

- 風格：HxDesign。白底黑字，accent 黑色 #000，系統字體堆疊，綠 #B8F36B 只當點綴，平鋪內容用細線分隔，不用 emoji，不用紫色漸層。錯誤文字用 #d70015（白底對比 5.4:1）。
- 導航：頂欄為 Company OS、今日、Needs、批准（老闆）、部門、設定；員工只看我的 Needs 與所屬部門。
- 畫面：首次開機、登入、今日、Needs 清單、Need 詳情（#/need/COS-001）、提交成果、批准收件匣、部門首頁、設定、帳戶管理、審計檢視、agent 活動頁。
- 規則：每個列表一行只給一個訊號；繼承或鎖定的內容收起但保留摘要；空狀態說真話並指出下一步；手機 390×844 不得橫向捲動；焦點落在第一個欄位。

## 12. 部門模組：第一條真實流程

| 部門 | 第一條流程 | 之後才做 |
|---|---|---|
| Design／內容／網站 | 專案與 brief、缺口轉 Need、成品預覽與交回 | 排版與網站編輯器、策略引擎 |
| Sales | 客戶與商機、報價草稿→批准→寄出、跟進提醒 | 合約、報表 |
| 營運財務 | 採購申請、付款申請與門檻、憑證歸檔 | 完整會計、庫存 |
| 人事 | 員工檔案、請假審批、入職清單 | 薪酬、考勤 |
| 客服 CRM | 問題記錄、回覆草稿→批准→發出、升級為 Need | 工單、滿意度 |

每個部門的 Need 類型用資料定義，不預先寫死欄位。

## 13. 里程碑

| 里程碑 | 內容 | 老闆看到什麼 |
|---|---|---|
| M0 | 收尾：#65、#66、#68 | 無新畫面 |
| M1 | S1-01 至 S1-13 | 第一個完整閉環：建立 Need、員工提交、老闆驗收，今日頁全是真資料 |
| M2 | S1-14 至 S1-16 | 安裝精靈；員工可從外部安全登入 |
| M3 | S2-01 至 S2-11 | AI 經 MCP 建 Need、交草稿；批准收件匣 |
| M4 | S3-01 至 S3-06 | Lark、飛書、Email、WhatsApp 通知與出口 |
| M5 | D-01 至 D-04 | Design 部門真流程 |
| M6 | SA、OF、HR、SU | 其餘四部門各一條真流程 |
| M7 | O-01 至 O-09 | 一鍵安裝、範本匯出匯入、升級路徑、安全審查 |

## 14. 完整 issue 清單

大小：S=1 小時、M=2 小時、L=4 小時（含 WorkBuddy 實作、QA 驗收與一次退回的預期）。級別：A=安全、審計、權限、金錢、對外發送，完整規格加變異測試；B=產品功能，真實瀏覽器端到端加單元測試；C=文件或小修，CI 即可。

| ID | 階段 | 標題 | 依賴 | 大小 | 級別 | 驗收重點 |
|---|---|---|---|---|---|---|
| P0-65 | 0 收尾 | #65 登入失敗審計去識別化（進行中） | — | M | A | HMAC-SHA256 keyed hash，限流改用 hash，pepper 缺失則啟動失敗 |
| P0-66 | 0 收尾 | #66 scrypt N=2^17 與舊雜湊升級 | P0-65 | M | A | maxmem 128MiB、登入時升級、截短雜湊回 false 不回 500 |
| P0-68 | 0 收尾 | #68 HxDesign 研究與對齊文件 | — | S | C | 把 HxDesign 習慣寫成 Company OS 可引用的對照 |
| P0-64 | 0 收尾 | #64 第二粒實體碟後跨碟備份還原驗收 | 硬體：第二粒實體碟 | M | A | 真實跨碟備份→驗證→還原→登入→檔案可下載 |
| P0-45 | 0 收尾 | #45 ports:check 顯示佔用者 PID | — | S | C | 端口衝突時指出是哪個程序 |
| S1-01 | 1 Starter 底座 | Starter 總綱落地：INDEX 一個真相表、DECISIONS、MASTER-PLAN | P0-68 | S | C | 只寫文件；之後所有 issue 引用它 |
| S1-02 | 1 Starter 底座 | 公司設定與政策表（company_setting、policy_rule）與種子檔 | S1-01, P0-66 | M | A | 設定在資料不在程式；改動寫審計；預設值齊全；裝完是空的 |
| S1-03 | 1 Starter 底座 | 權限引擎 packages/policy：角色×動作×部門 | S1-02 | M | A | 越權必報錯；純函數；一個真相 |
| S1-04 | 1 Starter 底座 | 員工與 agent 帳戶（後端與 API） | S1-03, P0-65, P0-66 | L | A | staff 由老闆建立；agent 為 service identity、預設零權限、token 只存 SHA-256；最後一位 owner 不可停用 |
| S1-05 | 1 Starter 底座 | 外殼（二）：導航由 /modules 生成、依角色顯示、部門空頁誠實、改密碼 | S1-04 | M | B | 改密碼撤銷其他 session；空頁說真話 |
| S1-06 | 1 Starter 底座 | Need 核心資料模型：need、need_type、need_event、COS-### 序列 | S1-03 | L | A | 事件只追加（trigger）；狀態與逾期用算的；編號不回收 |
| S1-07 | 1 Starter 底座 | Need API：建立／指派／留言／取消／讀取 | S1-06 | M | A | 越權與不存在回應一致；全部寫審計 |
| S1-08 | 1 Starter 底座 | Need 清單與詳情 UI（老闆與員工） | S1-07, S1-05 | L | B | #/needs 與 #/need/COS-001；逾期標示；空狀態 |
| S1-09 | 1 Starter 底座 | 成果提交：上傳檔案或貼文字，綁檔案層 | S1-07 | M | A | 沿用 #60 的上傳補償；成果不覆蓋舊版 |
| S1-10 | 1 Starter 底座 | 驗收與退回：規則讀設定 | S1-09, S1-02 | M | A | 退回必填原因；驗收是唯一手動狀態轉換 |
| S1-11 | 1 Starter 底座 | 老闆台「今日」：待驗收、逾期、卡住 | S1-08, S1-10 | M | B | 全部由查詢計算；零假數字 |
| S1-12 | 1 Starter 底座 | 背景隊列（Postgres SKIP LOCKED）、worker 容器、兩個真實 job | S1-06 | L | A | 逾期檢查、過期 session 清理；失敗重試與死信可見 |
| S1-13 | 1 Starter 底座 | 垂直切片端到端驗收（Playwright） | S1-05, S1-08..S1-12 | M | B | 建立→指派→提交→驗收→退回→重交；里程碑 M1 |
| S1-14 | 2 可遠端使用 | 安裝精靈 v1：公司名稱、語系、啟用部門、批准預設 | S1-02, S1-05 | L | B | 寫入設定表；可重跑檢視；不放假資料 |
| S1-15 | 2 可遠端使用 | 對外入口與安全：HTTPS 隧道、Secure cookie、Origin 白名單、入口限流 | S1-04 | L | A | 先決：老闆決定入口方案（域名／隧道／VPN） |
| S1-16 | 2 可遠端使用 | 員工帳戶管理 UI：建立、停用、重設密碼（無電郵重設） | S1-04, S1-05 | M | B | 重設後強制首次登入改密碼；全審計 |
| S2-01 | 3 AI 接入 | MCP 契約與 token：scope=部門×動詞、一次顯示、可撤銷 | S1-03, S1-04 | M | A | token 只存 SHA-256；契約文件即規格 |
| S2-02 | 3 AI 接入 | MCP 握手：initialize、tools/list（固定六個）、ping、help | S2-01 | M | A | 工具數永遠 6；沒有 approve |
| S2-03 | 3 AI 接入 | browse / read / find | S2-02, S1-07 | L | A | 越權報錯不回空；結果帶編號 |
| S2-04 | 3 AI 接入 | write：need.create / comment / submit / deliverable.draft | S2-03, S1-09 | L | A | 一律進收件匣；沒有 send、approve、delete |
| S2-05 | 3 AI 接入 | Keep 與收件匣：agent 產出待 Keep；人手即 kept；可撤回成 archived | S2-04 | M | A | 閘門對稱：取用與產出都要 Keep |
| S2-06 | 3 AI 接入 | 發件箱核心：版本不可變、政策引擎、狀態機、只有 worker 能送 | S1-02, S1-12 | L | A | AI 不能直接對外發訊息 |
| S2-07 | 3 AI 接入 | 批准收件匣：僅人類 session；批准綁內容 hash | S2-06, S1-11 | L | A | 批准後改動＝新版本需重批 |
| S2-08 | 3 AI 接入 | render：回傳自包含 HTML（brief、成品預覽） | S2-03 | M | B | 無外部資源；超大媒體明說不內嵌 |
| S2-09 | 3 AI 接入 | agent 控制：總開關、每日用量、速率限制、異常暫停、活動頁 | S2-04 | M | A | 一鍵停止所有 agent |
| S2-10 | 3 AI 接入 | AI 閉環驗收：測試 MCP client 跑完整循環 | S2-04..S2-09 | M | B | 里程碑 M3 |
| S2-11 | 3 AI 接入 | browse 外部資料（可選）：結果必帶來源與取用時間 | S2-04 | M | A | 沒有來源不准寫入（不變量 3） |
| S3-01 | 4 通知與出口 | 渠道抽象：adapter、delivery_log、重試、加密憑證 | S2-06 | L | A | 憑證加密；不進日誌 |
| S3-02 | 4 通知與出口 | Lark 國際版：員工 Need 通知 | S3-01 | M | B | 只帶連結與標題，不帶敏感內容 |
| S3-03 | 4 通知與出口 | 飛書（大陸）：獨立帳號體系 | S3-01 | M | B | 與 Lark 分開設定 |
| S3-04 | 4 通知與出口 | Email（B2B）出口 | S3-01, S2-07 | M | A | 只經發件箱批准後送出 |
| S3-05 | 4 通知與出口 | WhatsApp Business（客戶）出口 | S3-01, S2-07 | L | A | 模板與時間窗規則先向官方文件查證 |
| S3-06 | 4 通知與出口 | 通知偏好與每日摘要 | S3-02 | S | B | 可關閉；預設只推重要 |
| D-01 | 5 Design 部門 | Design：專案、DSN-### 編號、brief 渲染、缺口轉 Need | M3 | L | B | 沿用 HxDesign 的繼承與編號概念 |
| D-02 | 5 Design 部門 | Design：成品預覽頁與交回 | D-01 | M | B | 成品是資料表，預覽頁是地址 |
| D-03 | 5 Design 部門 | Design：知識與素材缺口規則（資料定義） | D-01 | M | B | 缺口用算的 |
| D-04 | 5 Design 部門 | Design：與 HxDesign 對接（連結編號與成品，不複製） | D-02 | M | B | 一個事實只有一個來源 |
| SA-01 | 6 其餘部門 | Sales：客戶與商機最小表 | S2-04 | M | B | 軟刪除、審計 |
| SA-02 | 6 其餘部門 | Sales：報價草稿→發件箱→批准→寄出 | SA-01, S3-04 | L | A | 對外動作 |
| SA-03 | 6 其餘部門 | Sales：跟進提醒轉 Need | SA-01 | S | B |  |
| SA-04 | 6 其餘部門 | Sales：今日卡片 | SA-01 | S | B |  |
| OF-01 | 6 其餘部門 | 營運財務：供應商與採購申請 | S2-04 | M | B |  |
| OF-02 | 6 其餘部門 | 營運財務：付款申請、金額門檻、批准 | OF-01, S2-07 | L | A | 金額門檻放資料 |
| OF-03 | 6 其餘部門 | 營運財務：憑證歸檔與月結匯出 | OF-02 | M | B |  |
| OF-04 | 6 其餘部門 | 營運財務：訂單與庫存對接（先研究） | OF-01 | L | B | 先做研究 issue 再定 |
| HR-01 | 6 其餘部門 | 人事：員工檔案，敏感欄位存取審計 | S1-04 | M | A | 敏感資料 |
| HR-02 | 6 其餘部門 | 人事：請假申請與審批 | HR-01 | M | B |  |
| HR-03 | 6 其餘部門 | 人事：入職／離職清單轉 Need | HR-01 | M | B |  |
| SU-01 | 6 其餘部門 | 客服：問題記錄入口 | S2-04 | M | B |  |
| SU-02 | 6 其餘部門 | 客服：回覆草稿→批准→發出 | SU-01, S3-05 | L | A | 對外動作 |
| SU-03 | 6 其餘部門 | 客服：升級為 Need | SU-01 | S | B |  |
| SU-04 | 6 其餘部門 | 客服：知識庫 | SU-01 | M | B |  |
| O-01 | 7 Starter 化與營運 | 觀察與警報頁：佇列積壓、備份年齡、儲存健康 | S1-12 | M | B |  |
| O-02 | 7 Starter 化與營運 | 備份排程與加密 | P0-64 | M | A | 第二碟到位後 |
| O-03 | 7 Starter 化與營運 | 升級路徑與 migration 預檢 | S1-01 | M | A | starter 升版不破壞已有公司 |
| O-04 | 7 Starter 化與營運 | 公司範本匯出／匯入 | S1-02, S1-14 | L | A | starter 核心：把一間公司的設定複製給另一間 |
| O-05 | 7 Starter 化與營運 | 簡體語系 | S1-05 | M | B |  |
| O-06 | 7 Starter 化與營運 | 一鍵安裝（Windows／Mac） | S1-14, O-03 | L | B |  |
| O-07 | 7 Starter 化與營運 | 審計檢視與匯出 | S1-15 | M | B |  |
| O-08 | 7 Starter 化與營運 | 外部安全審查與修補 | D-04 | L | A |  |
| O-09 | 7 Starter 化與營運 | 使用手冊 | 全部 | M | C | issue 明確要求才寫 |

## 15. 時間估算

假設：只有一個 WorkBuddy 序列施工，每日約 6 個有效小時，另加 30% 緩衝（退回、環境問題、需求澄清）。

| 階段 | issue 數 | 序列工時 | 日曆估算（6 有效小時/日，含 30% 緩衝） |
|---|---|---|---|
| 0 收尾 | 5 | 8 小時 | 約 1.7 個工作日 |
| 1 Starter 底座 | 13 | 33 小時 | 約 7.2 個工作日 |
| 2 可遠端使用 | 3 | 10 小時 | 約 2.2 個工作日 |
| 3 AI 接入 | 11 | 30 小時 | 約 6.5 個工作日 |
| 4 通知與出口 | 6 | 15 小時 | 約 3.2 個工作日 |
| 5 Design 部門 | 4 | 10 小時 | 約 2.2 個工作日 |
| 6 其餘部門 | 15 | 35 小時 | 約 7.6 個工作日 |
| 7 Starter 化與營運 | 9 | 24 小時 | 約 5.2 個工作日 |
| 合計 | 66 | 165 小時 | 約 35.8 個工作日（約 7.2 星期） |

M1（第一個完整可用的 Company OS）共 13 張 issue、33 小時，約 7.2 個工作日。若 WorkBuddy 連續運行、不受環境中斷影響，可縮短到約 2 至 3 天；以上為保守估計。

不能由開發管理者縮短的時間：第二粒實體碟到貨（P0-64）、域名或隧道方案的決定（S1-15）、Lark／飛書應用的建立與審批（S3-02、S3-03）、WhatsApp Business API 的申請（S3-05）。這些是外部依賴，應盡早啟動，與開發並行。

## 16. 品質與流程制度

### 16.1 驗收級別
A 級：完整規格、先寫會 fail 的測試、變異測試證明檢查有效、QA 獨立重跑。B 級：真實瀏覽器走完整流程加單元測試。C 級：CI 通過即可。

### 16.2 分工
- 開發管理者：寫 issue 全文（直接建立在 GitHub）、裁定合併、維護總綱與決策日誌。
- ZCode：獨立驗收、催 PR、必要時機械式 push 與開 PR，不改程式碼。
- WorkBuddy：實作。
- 老闆：回答業務問題、決定外部依賴、驗收畫面。

### 16.3 完成定義
分支已 push、PR 已開並指向 main、PR 描述含為什麼／改了什麼／驗證（實際指令與輸出）／不做什麼、CI 全綠、至少一個會 fail 的測試、沒有 TODO、沒有改 issue 範圍以外的檔案。沒有 PR 不算完成。

### 16.4 其他規則
- 一張 issue 一個分支一個 PR，分支名 task/<號碼>-<短英文名>。
- 依賴未合併，不開工。
- 超出範圍的想法開新 issue。
- 規格有空白或矛盾：停下，留言提問。
- 正式庫在每次驗收前後必須乾淨；測試一律用拋棄式資料庫與 bucket。

## 17. 風險

| 風險 | 影響 | 對策 |
|---|---|---|
| 單碟，備份與資料在同一粒碟 | 碟壞全失 | 已有備份程式；盡早取得第二粒實體碟完成 P0-64；之前不得宣稱已有災難保護 |
| 部門流程猜錯 | 返工 | 垂直切片先行；Need 類型與規則放資料；每個部門先做一條流程 |
| WorkBuddy 環境不穩 | 進度停頓 | 完成定義含 PR；ZCode 可機械式補 push；進度以 GitHub 為準 |
| AI 營運者未定 | M3 之後的實測延後 | MCP 客戶端可替換；用自家測試 client 驗收 |
| 外部渠道規則變動 | 通知出口返工 | adapter 隔離；先查證官方文件再寫 issue |
| 過度設定 | 複雜度膨脹 | 只有第二間公司需要才新增設定項 |
| 敏感資料外洩 | 嚴重 | A 級驗收；審計；token 與憑證不進日誌；對外入口前不開放遠端 |
| env.backup 在 Windows 為明文且權限寬 | 備份碟被讀取 | 文件已披露；第二碟到位後做磁碟加密或備份加密（O-02） |

## 18. 決策日誌（初稿）

- C01 一間公司一個安裝；自架 Docker；不做多租戶。
- C02 Company OS 是 starter：出貨為空，設定在資料，種子檔只負責第一次填入。
- C03 AI 是外部客戶端，只經 MCP 六動詞；MCP 永遠沒有 approve。
- C04 對外訊息一律先進發件箱；預設全部需批准。
- C05 批准機制放平台層。HxDesign 的 D08 移除了批准，但那只適用於創作；Company OS 有對外動作，以不變量 1 為準。
- C06 Need 狀態與逾期用算的；唯一手動轉換是驗收。
- C07 Need 編號 COS-### 全安裝唯一、不回收。
- C08 背景隊列用 Postgres，不用 Redis。
- C09 垂直切片優先；先閉環、後橫向複製部門。
- C10 驗收分 A、B、C 三級。
- C11 與 HxDesign 的關係：先並存，只連結編號與成品；Need 閉環穩定後再決定是否搬入。（臨時答案）
- C12 第一版通知只在站內；Lark、飛書、Email、WhatsApp 在 M4。（臨時答案）
- C13 最後一位 owner 不可停用；員工密碼由老闆重設，無電郵重設。

## 19. 待老闆確認（均有預設，可改）

1. 驗收規則：預設老闆驗收。
2. 部門隔離：預設關。
3. 第一條真實 Need 的例子（用作測試用例）。
4. 對外入口方案：域名、隧道或 VPN；員工是否有遠端與大陸網路需求。
5. 與 HxDesign 的關係（C11）。
6. 付款金額門檻的數字與幣別。
7. AI 營運者與每月費用上限。
8. 是否需要簡體介面。
9. 第二粒實體碟的到貨時間。

## 20. 下一步

1. #65、#66 完成並驗收。
2. 建立 S1-01（總綱落地）並合併；之後 S1-02 起依序施工。
3. M1 完成後，用真實瀏覽器與老闆一起走一次閉環，再開始 M2 與 M3。

# Company OS 全盤計劃

狀態：草稿，2026-11-06 對齊現況（見第 13、14、15、16 節的「現況」標註）。本文件是計劃的 source of truth。一個真相表在 `docs/INDEX.md`，決策日誌在 `docs/product/DECISIONS.md`，目錄、模組與邊界規則在 `docs/architecture/CODE-MAP.md`，入口、容器與端口表在 `docs/architecture/REPO-MAP.md`，每個 app 的設計在 `apps/<app>/DESIGN.md`。

版本：2026-11-04（2026-11-06 加現況對照）　撰寫：Company OS 開發管理者（現由 Perplexity Space 的 PM 角色擔任，見 `docs/planning-loop.md`）
讀者：老闆（看第 1、2、13、15 節）、ZCode（QA／QC）、WorkBuddy（實作）

## 1. 這是什麼

Company OS 是 company starter：任何一間公司裝好 Docker 就能開始運作的整套公司軟件。全部自架，裝完是空的，由老闆建立帳戶後再設定公司。

- 一部機器 = 一間公司，主機是公司自己的電腦。香港與大陸各裝一份，是兩間獨立公司，帳戶分開；往來當作兩間公司的交易，用 Email 傳單據。兩部機之間沒有跨機連線。
- 安裝時選版本：國際版全部都做，包括三層入口、customer-portal、supplier-portal、Cloudflare 與全部通知渠道；大陸版第一階段只做內網，通知以站內為主，選配企業微信與飛書。兩版同一份程式碼，差異只在 `edition-profile`。國際版（繁體）優先交付（C38）。安裝由 UI 精靈協助。
- 一間公司可以有多個 brand 和多個國家分部，由老闆在「公司結構」自行定義，不鎖定。
- 公司由一個 Boss portal（老闆的入口）和多個部門 app 組成。程式碼按 app 模組化，邊界由 CI 強制；容器按版本打包，可獨立更新。Postgres 與 MinIO 是共用底座。
- 高機密的 app 只留在內網。國際版另外讓外地員工、B2B 夥伴與 B2C 客戶經 Cloudflare Tunnel 使用被開放的 app，分成夥伴與客戶兩層。
- AI 盡力做事；AI 做不到的才變成 Need 派給員工；員工交成果，老闆驗收。AI 是外部客戶端，只經 MCP 六動詞（browse、read、write、find、render、help）連入，MCP 永遠沒有 approve 工具。
- 所有對外訊息先進發件箱，由規則決定放行或交老闆批准。

「完成」的定義：
1. 老闆登入後在 Boss portal 看到真實的待驗收、逾期、卡住的 Need，沒有一個數字是假的。
2. 員工登入後只看到被授權的 app 和自己的 Need，能提交成果。
3. AI 經 MCP 讀取授權範圍的資料、建立 Need、交出草稿，但不能批准、不能直接對外發送。
4. 對外訊息全部經發件箱，老闆批准後才送出。
5. 每個部門 app 都有一條真實可用的流程；新增部門只需要一個 app 範本。
6. 同事的電腦可以從公司內網連到 Company OS；國際版的外地員工、B2B 夥伴、供應商與 B2C 客戶可以安全地從互聯網使用被開放的 app，而高機密 app 無法從互聯網開啟。
7. 另一間公司可以用安裝精靈加公司範本快速開始，選國際版或大陸版。

## 2. 架構

```
大陸版
內網 ──► gateway-internal ──► platform  apps（全部部門 app，一個 app-host）
                                  └──── 共用 Postgres（一個 schema 一個 app）與 MinIO

國際版
內網／VPN ──► gateway-internal ───────────────┐
互聯網 ══ Cloudflare 隧道 ══ cloudflared ──┬─► gateway-partner（Access＋登入）──┤
                                          └─► gateway-customer（無 Access）───┤
                                                                              ▼
platform  apps-internal  apps-partner  supplier-portal  customer-portal
   └──────────────── 共用 Postgres（一個 schema 一個 app）與 MinIO ──────────┘
```

- gateway：同一個映像，按版本起實例，路由表不同。統一 cookie、Origin 與入口標記；之後的 HTTPS 只改這裡。
- platform：身份、授權、設定、組織、Need、成果、發件箱、通知、MCP、審計、隊列。這些是跨部門的事實，不屬於任何 app。worker 是同一映像的第二個啟動入口。
- app-host：同一個映像，用 `APP_SET` 載入 app，每個 app 用自己的資料庫帳號。曝露程度不同的 app 不同容器。
- Boss portal：老闆的入口。彙整各 app 的摘要介面，不直接讀它們的資料表。
- 部門 app：員工、設計、銷售、營運財務、人事、客服，日後可再加（例如研發部）。每個 app 提供摘要介面給 Boss portal。
- portal app：customer-portal 與 supplier-portal，專門對客戶與供應商開放，只在國際版。
- 邊界與分層：見 `docs/architecture/CODE-MAP.md`，由 `lint:boundaries` 在 CI 強制。

### 2.1 兩個版本的分別只寫在 edition-profile

`packages/edition-profile/src/index.ts` 是版本差異的唯一來源。容器、端口、入口、通知渠道與預設語言都從這裡出來；`docker-compose.yml`、`.env.example` 與 `docs/architecture/REPO-MAP.md` 的端口表要跟它一致，由 `consistency.test.ts` 在 `npm test` 內逐項核對。所以下面講的是「這個 profile 的意思是甚麼」，不是第二份清單；要看端口數字，去 REPO-MAP 那張表（它才是被 CI 對照的那一份）。

`EDITION` 決定用哪一份 profile，預設 `intl`。寫錯的值會即時報錯，不會默默當成國際版。

**國際版（`EDITION=intl`）**

- 入口：`internal`、`partner`、`customer` 三層。
- 通知渠道：站內、Email、Lark、飛書、WhatsApp Business、企業微信、釘釘、SMS、Slack、Teams、Telegram、通用 webhook。
- 預設語言：`zh-HK`。
- 容器：現有 `gateway-internal`、`platform`、`db`、`storage`；計劃中 `gateway-partner`、`gateway-customer`、`cloudflared`、`apps-internal`、`apps-partner`、`supplier-portal`、`customer-portal`。

**大陸版（`EDITION=cn`）**

- 入口：只有 `internal`。session 的 `entry` 只會是 `internal`。
- 通知渠道：站內、企業微信、飛書。後兩者都是出站、可選，由管理者逐個啟用。
- 預設語言：`zh-CN`。
- 容器：`gateway-internal`、`platform`、`apps`、`db`、`storage`。全部部門 app 在同一個 `apps` 容器，因為沒有對外入口，不需要按曝露程度分容器。
- 不含：`gateway-partner`、`gateway-customer`、`cloudflared`、`apps-internal`、`apps-partner`、`supplier-portal`、`customer-portal`。

兩件容易搞錯的事：

- 大陸版是「profile 不啟用外部入口」，不是把功能刪掉。日後要開放，要另開決策與審查；只寫文件不算開放，改 profile 才算，沒改 profile 就等於沒開。
- 兩版都不會因為通知整合而打開公網回調、遠端登入或外部 AI 連入。通知只帶必要摘要與內網連結；使用者不在公司網絡時連結打不開是預期行為。

**現時實際做得到哪一步。** 上面只有 `gateway-internal`、`platform`、`apps`、`db`、`storage` 五個容器真的存在於 `docker-compose.yml`；標為計劃中的一律未有容器。安裝精靈（C36）與大陸版的離線安裝包、簡體語系（S2-06、S2-07）都未有。國際版現時起得來的仍然只有內網那一層，對外三層要等階段 8。

## 3. 身份、授權、組織

### 3.1 角色與授權
- 老闆帳戶是整套軟件的 super admin，可進任何 app、改任何設定。
- 每個 app 有自己的 super admin 與成員。
- 員工 app 是全公司名冊，也是授權申請的入口。它的 super admin 可以提出「某人進某 app」的授權申請。
- 敏感 app 的授權要老闆批准。「敏感」是 app 的設定，預設財務、人事、員工、Boss portal 為敏感。
- 授權狀態：申請 → 已批准 → 生效；授予管理員身份只有老闆或該 app 的 super admin 能做。全部寫審計。
- agent 是 service identity，沒有密碼，預設零權限，只經 MCP token 行事。
- 登入後的首頁是「我的 Apps」：只列出被授權的 app。

### 3.2 組織單位（不鎖定）
- `org_unit`：名稱、類型（老闆自訂，例如 brand、分部、法人、團隊）、國家、貨幣、時區、語言。
- `org_unit_edge`：上下級關係，一個單位可以有多個上級（例如「Brand A 在香港」同時屬於 Brand A 與香港分部）。
- 資料掛在最底層單位；上層數字往下彙總算出，不另存。
- 設定（批准門檻、通知渠道、語言、貨幣）掛在單位上，沒設定就往上繼承，最上面是整間公司。
- 授權可限定範圍：某人在某個 app 只看某些單位，或全部。
- 裝完只有一個單位：公司本身。老闆在「公司結構」頁自己加，並可選預設範本（單一 brand、多 brand、多國分部）。
- 金額永遠存為數字加貨幣；合併顯示時用有日期的匯率，同時顯示原幣與換算後數字。

### 3.3 入口與對象

| 入口 | 對象 | 登入 | 能進的 app | 大陸版 | 國際版 |
|---|---|---|---|---|---|
| gateway-internal | 內網員工（含 VPN） | Company OS 登入 | 全部 | 有 | 有 |
| gateway-partner | 外地員工、B2B 夥伴、供應商 | Cloudflare Access（一次性 PIN，限定電郵名單）加 Company OS 登入 | exposure 為 partner 的 app | 無 | 有 |
| gateway-customer | B2C 客戶 | 客戶自己的帳戶（一次性連結或驗證碼）；Cloudflare WAF 限流加 Turnstile，不經 Access | exposure 為 customer 的 app | 無 | 有 |

- 內網存取（兩版）：gateway-internal 綁管理者選定的 LAN 位址並配合主機防火牆限制公司子網；其餘端口只綁本機。內部 HTTPS 與員工裝置的憑證信任流程另行驗證（S2-02）。
- 大陸版沒有 cloudflared、對外 gateway、外部帳戶與 portal；session 的 `entry` 只有 internal。大陸版不得因通知整合而打開公網回調或遠端登入。
- 國際版：cloudflared 只指向 gateway-partner 與 gateway-customer，規則最後一條是 404；app 容器與 gateway-internal 不對外。
- 每個 app 的 manifest 宣告 `exposure`：internal（預設）、partner、customer。session 記錄入口（`entry`）。internal 的 app 只接受 internal；partner 的 app 接受 internal 與 partner；customer 的 app 只接受 customer。海外員工從隧道登入，打得開 sales，打不開財務，必須先接 VPN。
- 三個 gateway 都會清掉請求裡自帶的入口標記，再寫上自己的值。
- 夥伴與供應商是 `app_user` 的一種（kind = partner），只能被授權到 partner 的 app；對外登入頁加 IP 限流與 TOTP 雙重驗證。
- 客戶是獨立的 `customer_account`，與員工帳戶分開，只能看自己的記錄，沒有 app 授權流程。
- 預設對外程度（臨時答案，國際版）：internal = boss-portal、employees、ops-finance、hr、research-dev；partner = sales、support、design、supplier-portal；customer = customer-portal。platform 的登入頁與「我的 Needs」在 partner 入口可用，管理與審計頁只在 internal。
- portal 模式：customer-portal 與 supplier-portal 是獨立容器、獨立 schema，不與後台 app 共用 session 或 cookie。portal 只寫入自己的 schema 與 platform 的 Need；後台 app（support、ops-finance）經 platform 介面接手處理，不讀 portal 的資料表。

## 4. 領域模型（platform schema）

- 設定：`company_setting(key, value, updated_by)`；`policy_rule(domain, condition, action, priority, enabled)`，沒有規則命中時預設需批准。
- 組織：`org_unit`、`org_unit_edge`。
- 身份：`app_user(kind: owner|staff|partner, must_change_password, disabled_at)`、`customer_account`、`agent_identity`、`auth_session(entry: internal|partner|customer)`、`mcp_token`。
- 授權：`app_registry(app, sensitive, exposure)`、`app_grant(user, app, role, scope, state, requested_by, approved_by)`。
- Need：`need_type`（欄位定義在資料裡）、`need`、`need_event`（只追加）。每個 Need 必填：卡住的是哪件工作、AI 已試過什麼、為什麼 AI 做不到、要交什麼、怎樣算完成、期限。編號 `COS-<安裝代碼>-###`。
- 成果：`deliverable(kind, inbox_state: pending_keep|kept|archived)`；人手提交直接 kept，agent 提交待 Keep，Keep 可撤回成 archived。
- 發件箱：`outbox`、`outbox_version`（不可變）、`approval`（只接受人類 session，綁 content_hash）、`delivery_log`。
- 通知：`notification_channel`（憑證加密）。
- 隊列：`job`。審計：`audit_log`（登入失敗的 target 為 HMAC hash，不存明文 email）。

狀態與逾期一律由查詢計算，不存。人能手動設定的只有「驗收」。

## 5. Need 生命週期

建立（AI 或老闆，必填欄位齊全）→ 指派 → 留言 → 提交成果 → 驗收或退回（退回必填原因）→ 取消。逾期由 worker 定期檢查，只產生事件供通知與「今日」頁。Need 完成後，AI 經 MCP 讀到驗收通過的成果，繼續原工作。

## 6. 發件箱與通知渠道

1. 任何對外訊息先寫成 outbox 草稿。
2. 政策引擎讀 `policy_rule`：命中放行規則才直接送出，否則進待批准，預設全部待批准。
3. 老闆在批准收件匣看內容、渠道、收件人，批准、退回或修改。批准綁 content_hash，修改產生新版本，重新批准。
4. 只有 worker 能送出，寫 `delivery_log`；失敗重試，超過次數進死信，在 Boss portal 可見。
5. 渠道目錄：站內、Email、Lark、飛書、WhatsApp Business、企業微信、釘釘、SMS、Slack、Teams、Telegram、通用 webhook，按組織單位啟用。國際版可啟用全部；大陸版以站內為主，選配企業微信與飛書，且都是出站、可選。個人微信自動化不列入已承諾能力。第一期通知只帶必要摘要與內網連結；使用者不在公司網絡時連結打不開是預期行為。
6. 兩間公司（香港與大陸）之間的往來，視為對外交易，用 Email 範本傳送單據。
7. 通知不能取代 Company OS 的批准與審計；第三方訊息有資料出站風險，不能宣稱資料完全不離開主機。

## 7. MCP 契約

固定六個動詞，工具數永遠是 6；新能力是新增資源詞彙，不是新增工具。
- `browse(path)` 列出可存取的資源；`read(ref)` 讀單一資源，ref 可用 Need 編號；`find(query, scope)` 搜尋授權範圍。
- `write(resource, op, payload)`：op 限定 need.create、need.comment、need.submit、deliverable.draft、outbox.draft，結果一律進收件匣或發件箱草稿。
- `render(ref, format=html)` 回傳自包含 HTML；`help(topic)` 回傳目前身分的能力、授權範圍與已知缺口。
- 保證：沒有 approve、send、delete；越權報錯；每次呼叫寫審計；token 只存 SHA-256、顯示一次、可撤銷；有每日用量上限、速率限制與全域總開關；無來源的內容不准寫入。

## 8. 設定項與預設值

| 設定 | 選項 | 預設 |
|---|---|---|
| 版本 | 國際版／大陸版 | 安裝時必選 |
| 驗收規則 | 老闆／部門主管／交了就算 | 老闆 |
| 部門隔離 | 開／關 | 關 |
| 發件規則 | 每個渠道與類別：放行或批准 | 全部批准 |
| 付款金額門檻 | 金額乘貨幣 | 全部批准 |
| 通知渠道 | 渠道目錄 | 只在站內 |
| 公司語系 | 繁體／簡體 | 國際版繁體，大陸版簡體 |
| 啟用的 app | edition-profile 與 compose profile | 全部關 |
| app 敏感度 | 每個 app 一個開關 | 見 3.1 |
| app 對外程度 | internal／partner／customer | 見 3.3（國際版） |
| 內網 LAN 位址與允許子網 | 管理者選定 | 安裝精靈設定 |
| 對外網域 | 夥伴入口與客戶入口的主機名稱（國際版） | 未設定（不啟動 cloudflared） |
| Access 允許名單 | 電郵或網域（國際版） | 空（拒絕所有人） |
| 安裝代碼 | 例如 HK、CN | 必填 |
| 逾期寬限 | 小時 | 0 |

## 9. 介面

- 風格：Apple HIG。白底黑字，accent 黑色 #000，系統字體堆疊，綠 #B8F36B 只當點綴，平鋪內容用細線分隔，不用 emoji，不用紫色漸層。錯誤文字 #d70015。所有 app 共用 `design-tokens`、`ui-kit` 與 `app-shell`；字串走 `i18n`。
- 畫面：登入頁、我的 Apps、我的 Needs、Need 詳情、設定、公司結構（platform）；今日、批准收件匣、各部門摘要（Boss portal）；名冊與授權（employees）；請求單、報價確認、訂單進度（customer-portal，國際版）；發票與文件提交、採購單與付款進度（supplier-portal，國際版）；安裝精靈（本機）。
- 規則：一行只給一個訊號；繼承或鎖定的內容收起但保留摘要；空狀態說真話；手機 390×844 不得橫向捲動。

## 10. 各 app 的第一條流程

| app | 對外程度 | 第一條流程 | 之後才做 |
|---|---|---|---|
| employees | internal | 名冊、授權申請、指派 | 組織圖 |
| design | partner | 專案與 brief、缺口轉 Need、成品預覽與交回 | 排版與網站編輯器 |
| sales | partner | 客戶與商機、報價草稿→批准→寄出 | 合約、報表 |
| ops-finance | internal | 採購申請、付款申請與門檻、憑證歸檔 | 完整會計、庫存 |
| hr | internal | 員工檔案、請假審批、入職清單 | 薪酬、考勤 |
| support | partner | 問題記錄、回覆草稿→批准→發出、升級為 Need | 工單、滿意度 |
| customer-portal（國際版） | customer | 客戶帳戶、請求單、報價確認、訂單進度 | 付款、發票下載 |
| supplier-portal（國際版） | partner | 發票與文件提交、採購單與付款進度 | 供應商評分 |
| research-dev | internal | 流程待老闆說明 | — |

「對外程度」只在國際版有意義；大陸版所有 app 都只經 gateway-internal。

## 11. 新增部門

新增部門只需要：`npm run new:app <名稱>`、填 `DESIGN.md`、在 edition-profile 與 compose profile 啟用。範本產生資料夾、manifest（含 exposure）、schema、gateway 路由、edition-profile 的容器歸屬與「我的 Apps」入口；CI 自動發現新 app 並套用同一套測試與邊界檢查。

## 12. 兩間公司（香港與大陸）

兩部機各自獨立：各有老闆、員工、brand、資料庫與 MinIO，沒有跨機連線。老闆看兩邊要登入兩次。版本是安裝時的選擇，不依機器位置自動決定。大陸資料留在大陸機；任何境外存取的法律責任仍在公司，需專業意見（見決策 C24）。大陸版不使用 Cloudflare Tunnel，所以沒有連線品質問題；但映像下載與更新的可達性要在真實大陸網絡測試（S2-06）。

## 13. 里程碑

里程碑編號按階段，不等於交付先後；交付順序見第 15 節。

| 里程碑 | 階段 | 老闆看到什麼 |
|---|---|---|
| M0 | 0 收尾 | 無新畫面 |
| M1 | 1 底座與第一個閉環 | 登入頁、我的 Apps、員工名冊與授權、Boss portal 今日頁，以及 Need 閉環 |
| M2 | 2 安裝與兩個版本 | 安裝精靈、LAN 存取、公司結構頁（簡體介面與大陸版離線安裝包屬大陸版專屬，排在最後） |
| M3 | 3 AI 接入 | AI 建 Need、交草稿；批准收件匣 |
| M4 | 4 通知與出口 | 全部通知渠道 |
| M5 | 5 app 範本與 Design | 新增部門有標準做法；第一個部門 app |
| M6 | 6 其餘部門 | 銷售、營運財務、人事、客服各一條真流程 |
| M7 | 7 Starter 化與營運 | 公司範本匯出匯入、備份排程、一鍵安裝程式、升級路徑 |
| M8 | 8 國際版對外入口 | 三層入口、Cloudflare、外部帳戶、客戶與供應商入口 |

**現況（2026-11-06）：** M0 未完成，因為 #64（跨碟備份驗收）仍是 open，等第二粒實體碟。M1 未達成：階段 1 的後端底座大部分已合併，但登入頁、我的 Apps、employees、Boss portal 外殼、Need 整條鏈與端到端驗收都還沒有 issue。M2 至 M8 未開始（S2-03 的後端部分除外）。老闆今天能看到的，仍然只有建立老闆帳戶、登入與一個誠實的空「今日」頁。

## 14. issue 清單

本節是規劃藍圖，不是已建立的 issue 清單（見決策 C40，取代 C39）：issue 依 `docs/planning-loop.md` 先總綱、後單張，一次只展開一張。下面表格裡的編號是總綱編號；哪些已對應 GitHub issue，看表後的「GitHub 對照」。

大小：S=1、M=2、L=4 小時（含實作、QA 驗收與一次退回的預期）。級別：A=安全、審計、權限、金錢、對外發送，完整規格加變異測試；B=產品功能，真實瀏覽器端到端加單元測試；C=文件或小修。每張 issue 的完整驗收，在建立時才寫。標題標明「大陸版專屬」或「國際版」的只屬該版，未標示的兩版共用。

| ID | 標題 | 依賴 | 大小 | 級別 |
|---|---|---|---|---|
| P0-65 | #65 登入失敗審計去識別化（已關閉） | — | M | A |
| P0-66 | #66 scrypt N=2^17 與舊雜湊升級（已關閉） | P0-65 | M | A |
| P0-64 | #64 跨碟備份還原驗收（等第二粒實體碟；目前唯一 open 的 issue） | 硬體 | M | A |
| P0-45 | #45 ports:check 顯示佔用者（已關閉） | — | S | C |
| R1 | 邊界與工具：packages/* 加入 workspaces、lint:boundaries、project references、故意違反測試；不搬任何檔案 | — | M | A |
| R2 | apps/api 改名 apps/platform（git mv），S3 SDK 移進 platform | R1 | S | B |
| R3 | 拆 apps/web：登入、首次開機、外殼歸 platform，「今日」歸 boss-portal；抽出 ui-kit、app-shell、design-tokens、i18n | R2 | L | B |
| R4 | manifest 移到 apps/<app>/，載入器移到 platform 的 registry，欄位 route、exposure、sensitive | R2 | M | A |
| R5 | migration 執行器雙模式（舊平目錄與每 schema 編號），先做小實驗 | R2 | M | A |
| R6 | app-host、compose 多服務骨架、edition-profile、按容器的端口表與 ports:check 對照 | R3, R4, R5 | L | A |
| S1-02 | gateway-internal：路徑分流、cookie、Origin、入口標記 | R6 | M | A |
| S1-03 | CI 按 app 路徑分流；manifest／compose／.env.example／edition-profile 一致性 | R1, R4 | M | B |
| S1-04 | 公司設定與政策表加種子檔 | R6, P0-66 | M | A |
| S1-05 | 組織單位：org_unit、多上級、設定繼承 | S1-04 | M | A |
| S1-06 | 權限引擎 packages/policy：角色×app×範圍×入口 | S1-05 | M | A |
| S1-07 | app 註冊與授權：狀態機、敏感 app 要老闆批准、exposure 與 entry 規則 | S1-06 | L | A |
| S1-08 | 員工與 agent 帳戶（後端） | S1-07, P0-65, P0-66 | L | A |
| S1-09 | 登入頁與「我的 Apps」首頁 | S1-02, S1-08 | M | B |
| S1-10 | employees app：名冊、授權申請、指派 | S1-09 | L | B |
| S1-11 | Boss portal 外殼與授權批准收件匣 | S1-09 | M | B |
| S1-12 | Need 核心資料模型 | S1-06 | L | A |
| S1-13 | Need API | S1-12 | M | A |
| S1-14 | Need 清單與詳情 UI | S1-13, S1-09 | L | B |
| S1-15 | 成果提交 | S1-13 | M | A |
| S1-16 | 驗收與退回 | S1-15, S1-04 | M | A |
| S1-17 | Boss portal「今日」 | S1-14, S1-16, S1-11 | M | B |
| S1-18 | 背景隊列與 worker | S1-12 | L | A |
| S1-19 | 垂直切片端到端驗收（里程碑 M1） | S1-10, S1-17, S1-18 | M | B |
| S2-01 | 安裝引擎：環境檢查、.env 與秘密生成、compose 啟動、健康檢查、失敗重試 | S1-04, S1-09, R6 | L | B |
| S2-02 | 內網存取：gateway-internal 綁 LAN 位址、主機防火牆指引、內部 HTTPS 與憑證信任 | S1-02 | L | A |
| S2-03 | 帳戶管理：改密碼、重設、停用（無電郵重設） | S1-08 | M | B |
| S2-04 | 公司結構頁：老闆自訂 brand、分部、法人 | S1-05, S1-09 | M | B |
| S2-05 | 安裝精靈 UI：版本選擇、環境檢查、LAN 設定、老闆帳戶、app 與渠道、進度與驗證 | S2-01, S2-02 | L | B |
| S2-06 | 大陸版專屬：離線安裝包與映像可達性測試（需真實大陸網絡） | S2-01 | M | A |
| S2-07 | 大陸版專屬：簡體語系 | S1-09, R3 | M | B |
| S3-01 | MCP 契約與 token | S1-06, S1-08 | M | A |
| S3-02 | MCP 握手 | S3-01 | M | A |
| S3-03 | browse / read / find | S3-02, S1-13 | L | A |
| S3-04 | write：need.create / comment / submit / deliverable.draft | S3-03, S1-15 | L | A |
| S3-05 | Keep 與收件匣 | S3-04 | M | A |
| S3-06 | 發件箱核心 | S1-04, S1-18 | L | A |
| S3-07 | 批准收件匣 | S3-06, S1-11 | L | A |
| S3-08 | render | S3-03 | M | B |
| S3-09 | agent 控制：總開關、用量、速率、異常暫停 | S3-04 | M | A |
| S3-10 | AI 閉環驗收（里程碑 M3） | S3-04..S3-09 | M | B |
| S3-11 | browse 外部資料（可選）：必帶來源 | S3-04 | M | A |
| S4-01 | 渠道抽象與目錄、加密憑證、重試、按版本顯示渠道 | S3-06 | L | A |
| S4-02 | Email 出口 | S4-01, S3-07 | M | A |
| S4-03 | Lark | S4-01 | M | B |
| S4-04 | 飛書（大陸版優先實測） | S4-01 | M | B |
| S4-05 | WhatsApp Business | S4-01, S3-07 | L | A |
| S4-06 | 企業微信（大陸版優先實測） | S4-01 | M | B |
| S4-07 | 釘釘 | S4-01 | M | B |
| S4-08 | SMS、Slack、Teams、Telegram、通用 webhook | S4-01 | M | B |
| S4-09 | 通知偏好與每日摘要 | S4-03 | S | B |
| S5-00 | app 範本與 new:app 指令（含 app-host 註冊與 edition-profile 歸屬） | S1-03, R6 | L | B |
| D-01 | design：專案、brief、缺口轉 Need | S5-00, S3-10 | L | B |
| D-02 | design：成品預覽與交回 | D-01 | M | B |
| D-03 | design：知識與素材缺口規則 | D-01 | M | B |
| SA-01 | sales：客戶與商機最小表 | S5-00 | M | B |
| SA-02 | sales：報價草稿→批准→寄出 | SA-01, S4-02 | L | A |
| SA-03 | sales：跟進提醒轉 Need | SA-01 | S | B |
| SA-04 | sales：摘要介面 | SA-01 | S | B |
| OF-01 | ops-finance：供應商與採購申請 | S5-00 | M | B |
| OF-02 | ops-finance：付款申請、金額門檻、批准 | OF-01, S3-07 | L | A |
| OF-03 | ops-finance：憑證歸檔與月結匯出 | OF-02 | M | B |
| OF-04 | ops-finance：訂單與庫存對接（先研究） | OF-01 | L | B |
| HR-01 | hr：員工檔案，敏感欄位存取審計 | S5-00, S1-10 | M | A |
| HR-02 | hr：請假申請與審批 | HR-01 | M | B |
| HR-03 | hr：入職與離職清單轉 Need | HR-01 | M | B |
| SU-01 | support：問題記錄入口 | S5-00 | M | B |
| SU-02 | support：回覆草稿→批准→發出 | SU-01, S4-05 | L | A |
| SU-03 | support：升級為 Need | SU-01 | S | B |
| SU-04 | support：知識庫 | SU-01 | M | B |
| RD-01 | research-dev：流程研究（待老闆說明） | S5-00 | S | C |
| O-01 | 公司範本匯出與匯入 | S2-01, S1-05 | L | A |
| O-02 | 一鍵安裝程式打包（Windows，之後 Mac） | S2-05 | L | B |
| O-03 | 升級路徑與 migration 預檢 | R5 | M | A |
| O-04 | 備份排程與加密 | P0-64 | L | A |
| O-05 | 觀察與警報頁 | S1-18 | M | B |
| O-06 | 審計檢視與匯出 | S1-08 | M | B |
| O-08 | 兩間公司往來單據的 Email 範本（採購單、出貨通知） | S4-02 | M | B |
| O-10 | 使用手冊 | 全部 | M | C |
| O-11 | research-dev app（流程確定後） | RD-01 | M | B |
| S8-01 | 國際版：gateway-partner 與 gateway-customer 實例、session entry 規則 | S1-02, S1-07 | M | A |
| S8-02 | 國際版對外入口與安全：cloudflared、Access 政策、WAF 限流、Turnstile、HTTPS | S8-01 | L | A |
| S8-03 | 國際版外部身份：夥伴（app_user kind=partner）與客戶（customer_account） | S1-08, S8-02 | L | A |
| S8-04 | 國際版對外登入的 TOTP 雙重驗證與 IP 限流 | S8-03 | M | A |
| CP-01 | customer-portal：客戶帳戶與請求單 | S5-00, S8-03, S1-13 | L | B |
| CP-02 | customer-portal：報價確認與訂單進度 | CP-01, SA-02 | M | B |
| SP-01 | supplier-portal：發票與文件提交 | S5-00, S8-03, S1-15 | L | B |
| SP-02 | supplier-portal：採購單與付款進度 | SP-01, OF-02 | M | B |
| S8-09 | 國際版外部安全審查與修補 | D-03, CP-01 | L | A |

### GitHub 對照（2026-11-06，按 GitHub issue 標題核對）

只列已有 GitHub issue 的項目；上表其餘項目都還沒有 issue。

| 總綱編號 | GitHub | 狀態 |
|---|---|---|
| P0-65 | #65 | 已關閉 |
| P0-66 | #66 | 已關閉 |
| P0-64 | #64 | open（#61 的驗收債務；#61 已關閉） |
| P0-45 | #45 | 已關閉（PR #111） |
| R1 | #71 | 已關閉 |
| R2 | #72 | 已關閉 |
| R3 | #73 | 已關閉，但只抽出四個共用 package；拆 apps/web 的部分沒有做，也沒有 issue（見 CODE-MAP） |
| R4 | #74 | 已關閉 |
| R5 | #75 | 已關閉 |
| R6 | #76 | 已關閉，只含 edition-profile 與端口一致性檢查，不改容器 |
| （總綱沒有） | #77 | R8：app-host 骨架，由 R6 分出，已關閉 |
| S1-02 | #78 | 已關閉 |
| S1-03 | #79 | 已關閉 |
| S1-04 | #80 | 已關閉 |
| S1-05 | #81 | 已關閉 |
| S1-06 | #82 | 已關閉 |
| S1-07 | #83 | 已關閉 |
| S1-08 | #84 | 已關閉（員工與 agent 身份底座，後端） |
| S1-18 | #85 | 已關閉（比 S1-09 至 S1-17 先做） |
| S2-03 | #86 | 已關閉（後端；比其餘階段 2 先做） |
| （總綱沒有，底座補漏） | #87、#88、#103 | 可信 internal 入口與 session.entry、app 專用資料庫帳號、api 映像補帶 packages/policy；皆已關閉 |
| （總綱沒有，研究與決策） | #68、#70 | HxDesign 研究觀察報告、版本範圍決策與研究紀錄；皆已關閉 |

「底座補漏」是總綱原本沒有的類別：施工時發現規格缺口或映像漏帶，另開 issue 補上（見 C40）。

## 15. 時間估算與交付順序

假設：一個 WorkBuddy 序列施工，每日約 6 個有效小時，另加 30% 緩衝。

| 階段 | issue 數 | 序列工時 | 日曆估算 |
|---|---|---|---|
| 0 收尾 | 4 | 7 小時 | 約 1.5 個工作日 |
| 1 底座與第一個閉環 | 24 | 63 小時 | 約 13.7 個工作日 |
| 2 安裝與兩個版本 | 7 | 20 小時 | 約 4.3 個工作日 |
| 3 AI 接入 | 11 | 30 小時 | 約 6.5 個工作日 |
| 4 通知與出口 | 9 | 21 小時 | 約 4.5 個工作日 |
| 5 app 範本與 Design | 4 | 12 小時 | 約 2.6 個工作日 |
| 6 其餘部門 | 16 | 36 小時 | 約 7.8 個工作日 |
| 7 Starter 化與營運 | 9 | 24 小時 | 約 5.2 個工作日 |
| 8 國際版對外入口 | 9 | 28 小時 | 約 6.1 個工作日 |
| 國際版（繁體）：階段 0 至 8，不含 S2-06、S2-07 | 91 | 237 小時 | 約 51.4 個工作日（約 10.3 星期） |
| 大陸版專屬追加：S2-06、S2-07 | 2 | 4 小時 | 約 0.9 個工作日 |
| 全部 | 93 | 241 小時 | 約 52.2 個工作日（約 10.4 星期） |

大陸版專屬追加的估算不含真實大陸網絡測試所需的外部等待時間。

交付順序（C38，國際版繁體優先）。依賴關係仍然有效，批次內按依賴順序施工：

| 批次 | 內容 |
|---|---|
| W1 | 階段 0 與階段 1：先收尾，再做 R1 至 R6，再做底座與第一個閉環（M1） |
| W2 | 階段 2，不含 S2-06、S2-07：安裝引擎、LAN 與內部 HTTPS、帳戶管理、公司結構頁、安裝精靈 |
| W3 | S8-01 至 S8-04：國際版對外入口、Cloudflare、外部身份、對外登入雙重驗證 |
| W4 | 階段 3、4、5：AI 接入、通知與出口、app 範本與 Design |
| W5 | 階段 6 與 CP-01、CP-02、SP-01、SP-02：其餘部門與客戶、供應商入口 |
| W6 | 階段 7 與 S8-09：Starter 化、營運與國際版外部安全審查 |
| W7 | 大陸版專屬：S2-06、S2-07，以及飛書與企業微信的真實網絡實測 |

M1（階段 0 至 1）是第一個完整可用的 Company OS，約 15.2 個工作日；WorkBuddy 連續運行時可縮短。外部依賴縮短不了，應盡早啟動：第二粒實體碟、國際版的對外網域與 Cloudflare 帳戶、WhatsApp Business API 申請；以及較後期才用到、但審批耗時的 Lark、飛書、企業微信應用審批與真實大陸網絡的映像下載測試。

**現況（2026-11-06）：** 目前在 W1 之內。已完成：階段 0 的 P0-65、P0-66、P0-45（P0-64 等硬體）；階段 1 的 R1 至 R6（R3 與 R6 只部分完成）、R8、S1-02 至 S1-08、S1-18；階段 2 的 S2-03（後端）。這些在 2026-11-04 至 11-05 合併。未開始（沒有 issue）：S1-09 至 S1-17 與 S1-19，即登入頁與「我的 Apps」、employees、Boss portal 外殼、整條 Need 鏈、「今日」、端到端驗收。上面的工時估算沒有按實際速度重新校準。

## 16. GitHub 與流程制度

### 16.1 驗收級別與完成定義
A 級：完整規格、先寫會 fail 的測試、變異測試、QA 獨立重跑。B 級：真實瀏覽器走完整流程加單元測試。C 級：CI 通過。完成 = 分支已 push、PR 已開並指向 main、PR 描述含為什麼／改了什麼／驗證／不做什麼、CI 全綠。沒有 PR 不算完成。

### 16.2 分工
- 開發管理者（PM）：寫 issue 全文並建立在 GitHub、裁定合併、維護本文件與決策日誌。建立或更新 GitHub 內容之前，必須先把完整全文給老闆看並由老闆確認；批准只能人按。issue 一次只展開一張（見 C40 與 `docs/planning-loop.md`）。
- ZCode：獨立驗收、催 PR、必要時機械式 push 與開 PR，不改程式碼；對 R 系列切片另加「故意違反邊界」的變異測試。
- WorkBuddy：實作，一次一片，只改被指派的範圍。
- 老闆：回答業務問題、決定外部依賴、驗收畫面。

### 16.3 repo 設定
- 每個 app 有自己的 `AGENTS.md`，寫明只能改自己的資料夾。
- CI 按路徑分流：只改某個 app，只跑該 app 與它依賴的 packages；邊界 lint 全跑。
- 標籤：`app:<名稱>`、`area:platform`、`tier:A|B|C`、`phase:0..8`、`batch:W1..W7`、`blocked:external`、`edition:intl`、`edition:cn`、`needs-refine`。planning-loop 另外規定 `cat:<範疇>` 與 `status:building`。
- 里程碑：M0 至 M8。Project 看板欄位：階段、批次、級別、app、大小、依賴。
- main 的分支保護：必須經 PR、CI 綠燈、禁止強制推送。**現況（2026-11-06）：** 經 GitHub API 查詢，main 的 `protected` 欄位為 false；這個欄位可能不反映新版 rulesets，需老闆到 GitHub 網頁 Settings 核實。在核實之前，不應假設分支保護已生效。
- issue 範本已加入 `.github/ISSUE_TEMPLATE/task.md`；PR 範本待確認 `.github/pr-evidence` 的要求後再加。
- 標籤、里程碑、Project、分支保護與倉庫描述，需要在 GitHub 網頁上設定（我的連接器沒有這些工具）。標籤、里程碑與 Project 的實際設定，這次沒有核實。

## 17. 風險

| 風險 | 對策 |
|---|---|
| 單碟，備份與資料在同一粒碟 | 盡早取得第二粒實體碟完成 P0-64；之前不宣稱已有災難保護 |
| 容器多，一部公司電腦要跑 | 大陸版合併成少數容器；先量測空載與三個 app 同時運行的記憶體與 CPU；compose profile 只啟動需要的 app |
| 多 schema 與多帳號的 migration 複雜 | R5 先做小實驗，確認執行器兼容既有 migration |
| 搬遷改壞行為 | R1 至 R6 一片一個 PR；搬動前後同一組測試；ZCode 加變異測試 |
| LAN 位址變動、電腦睡眠導致同事連不上 | 安裝精靈提示固定 IP 或主機名稱、關閉睡眠；驗收包含重開機與 IP 變更 |
| 端口綁定不當暴露給整個網絡 | 不用未指定位址的發佈；只有 gateway-internal 綁 LAN 位址；防火牆限制公司子網 |
| 內部 HTTPS 憑證在員工電腦不被信任 | S2-02 驗證流程；不教使用者長期忽略瀏覽器警告 |
| 部門流程猜錯 | 垂直切片先行；Need 類型放資料；每個 app 先做一條流程 |
| WorkBuddy 環境不穩 | 完成定義含 PR；ZCode 可機械式補 push；進度以 GitHub 為準 |
| 國際版對外入口被攻擊或繞過 | 隧道只指向兩個 gateway；app 容器端口只綁本機；session entry 規則；WAF 限流、Turnstile、TOTP；Access 名單預設為空 |
| 客戶入口被濫用（註冊、爆破、爬取） | 客戶只看自己的記錄；一次性連結或驗證碼；限流；portal 與後台完全分離 |
| 大陸資料與境外存取的法律責任 | 專業意見；系統只做審計與政策控制（C24） |
| 大陸版映像與套件下載不可達 | 離線安裝包與受控更新來源（S2-06）；不採用未驗證的公共鏡像清單；真實網絡測試 |
| 個人微信整合期望過高 | 只承諾企業微信與飛書的官方 API；個人微信自動化不列入承諾 |
| 外部渠道規則變動 | adapter 隔離；先查證官方文件再寫 issue |
| 規格依賴尚未存在的程式碼而寫錯 | 標 `needs-refine`；agent 開工前必須看到規格已補全，否則停下提問 |
| 過度設定 | 只有第二間公司需要才新增設定項 |
| env.backup 在 Windows 為明文 | 第二碟到位後做磁碟或備份加密（O-04） |

## 18. 待老闆確認（均有預設）

1. 交付順序：已確認，國際版（繁體）優先，大陸版專屬項目最後（C38）。
2. 驗收規則：預設老闆驗收。
3. 部門隔離：預設關。
4. 第一條真實 Need 的例子（作測試用例）。
5. 國際版對外 app 清單（預設見 3.3）：是否有經銷商或代理需要 partner portal。
6. 國際版對外網域、Cloudflare 帳戶與方案（WAF、Turnstile 所需），以及 Access 允許名單。
7. 研發部的流程與敏感度。
8. 付款金額門檻與貨幣。
9. AI 營運者與每月費用上限。
10. 主機規格與作業系統、Docker 授權是否適用於公司使用。
11. 內部 HTTPS 方案與員工電腦的信任方式。
12. 第二粒實體碟的到貨時間。

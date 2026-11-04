# Company OS 決策日誌

最新在下方，後者優先。標明（臨時答案）的，是之後可以改的。

- C01 一部機器 = 一間公司。香港與大陸各裝一份，是兩間獨立公司，帳戶分開；兩間公司之間的往來當作兩間公司的交易，經發件箱用 Email 傳單據。兩部機之間沒有跨機連線。
- C02 Company OS 是 starter：出貨為空，設定在資料，種子檔只負責第一次填入。
- C03 AI 是外部客戶端，只經 MCP 六動詞連入；MCP 永遠沒有 approve。
- C04 對外訊息一律先進發件箱；預設全部需批准。
- C05 批准只能由人按下；批准機制放在 platform 層，不放在任何一個 app。
- C06 Need 的狀態與逾期用算的；唯一的手動轉換是驗收。
- C07 Need 編號為 `COS-<安裝代碼>-###`（例如 `COS-HK-001`），每個安裝一條序列，不回收。安裝代碼是設定項。
- C08 背景隊列用 Postgres，不用 Redis。
- C09 垂直切片優先：先跑通一個閉環，再橫向複製部門。
- C10 驗收分 A、B、C 三級（見總綱）。
- C11 一個 app = 一個容器。Boss portal 是其中一個。每個 app 可以獨立更新與重啟，不影響其他 app。
- C12 身份、授權、Need、發件箱、審計、設定、MCP、隊列屬於 platform，不屬於任何一個 app。
- C13 一個 Postgres，每個 app 一個 schema、一個資料庫帳號。migration 每個 schema 獨立編號，只往前加，由 platform 的執行器依序套用。已套用的既有 migration 不搬、不改。
- C14 app 之間不互相引用，只用 `packages/` 與 platform 的介面；Boss portal 只讀各 app 的摘要介面，不讀它們的資料表。
- C15 單一登入頁；登入後只看到被授權的 app（我的 Apps）。
- C16 老闆帳戶天生是整套軟件的 super admin；每個 app 有自己的 super admin；員工 app 的 super admin 可以申請授權，敏感 app 的授權要老闆批准。
- C17 員工 app（名冊與授權）與 HR app（請假、入職、檔案）分開；員工 app 永遠安裝，HR app 選裝。
- C18 公司結構用通用組織單位：`org_unit` 加多上級關係加設定繼承。brand、國家分部、法人由老闆自訂類型，不鎖定。金額按單位的貨幣記帳，合併顯示時用有日期的匯率並同時顯示原幣。
- C19 通知渠道全部準備：渠道目錄加 adapter，按單位啟用。第一批：站內、Email、Lark、飛書、WhatsApp Business、企業微信、釘釘、SMS、Slack、Teams、Telegram、通用 webhook。各渠道在大陸是否可用要實測。（臨時答案）
- C20 新增部門用 app 範本與 `new:app` 指令；compose profile 決定這部機啟動哪些 app。
- C21 「敏感」是 app 的設定，預設財務、人事、員工、Boss portal 為敏感；研發部待定。（臨時答案）
- C22 公司特有的設定放在 `profiles/<公司>/`，不放進 starter 的預設。
- C23 第一階段的 Boss portal 只看本機這間公司。老闆看兩間公司，要登入兩次。
- C24 大陸的資料留在大陸機。任何境外存取（包括 VPN 回公司）的法律責任仍在公司，需專業意見；系統只負責審計與按政策控制。兩部機之間不建立跨境連線。
- C25 端口與路由以各 app 的 manifest 為唯一來源（`route`、`debugPort`、`exposure`、`sensitive`）。容器內一律 8080；主機端口只綁 127.0.0.1；所有 app 預設發佈自己的 `debugPort`（只綁本機，絕不對外），方便單獨開發、測試與更新。gateway 路由、compose、`.env.example`、`ports:check` 由 CI 檢查與 manifest 一致。端口表見 `docs/architecture/REPO-MAP.md`。
- C26 三種對象，三個入口：內網員工用 gateway-internal；外地員工、B2B 夥伴與供應商經 Cloudflare Tunnel 到 gateway-partner，先過 Cloudflare Access（一次性 PIN，限定電郵名單）再登入 Company OS；B2C 客戶經 Cloudflare Tunnel 到 gateway-customer，不經 Access，用客戶自己的帳戶，並由 Cloudflare WAF 限流與 Turnstile 保護。三個 gateway 是同一個映像、三個實例。cloudflared 只指向後兩者。
- C27 每個 app 的 manifest 宣告 `exposure`（internal、partner、customer，預設 internal）。session 記錄登入入口（`entry`）：internal 的 app 只接受 internal；partner 的 app 接受 internal 與 partner；customer 的 app 只接受 customer。高機密 app 因此即使被授權，也不能從隧道開啟，必須在內網或 VPN。
- C28 外部身份：夥伴是 `app_user` 的一種（kind = partner），只能被授權到 partner 的 app；客戶是獨立的 `customer_account`，與員工帳戶分開，只能看自己的記錄，沒有 app 授權流程。客戶 session 不被任何非 customer 的 app 接受。
- C29 對客戶與供應商開放的 app 是獨立的 portal app：獨立容器、獨立 schema、不與後台 app 共用 session 或 cookie。portal 只寫入自己的 schema 與 platform 的 Need；後台 app 經 platform 介面接手，不讀 portal 的資料表。第一批：customer-portal（請求單、報價確認、訂單進度）與 supplier-portal（發票與文件提交、採購單與付款進度）。
- C30 預設對外程度：internal = boss-portal、employees、ops-finance、hr、research-dev；partner = sales、support、design、supplier-portal；customer = customer-portal。platform 的登入頁與「我的 Needs」在 partner 入口可用，管理與審計頁只在 internal。（臨時答案）

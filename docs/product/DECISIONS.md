# Company OS 決策日誌

最新在下方，後者優先。標明（臨時答案）的，是之後可以改的。

- C01 一部機器 = 一間公司。香港與大陸各裝一份，是兩間獨立公司，帳戶分開；兩間公司之間的往來當作兩間公司的交易，經發件箱用 Email 傳單據。不做跨機聯邦，也不做夥伴連結。
- C02 Company OS 是 starter：出貨為空，設定在資料，種子檔只負責第一次填入。
- C03 AI 是外部客戶端，只經 MCP 六動詞連入；MCP 永遠沒有 approve。
- C04 對外訊息一律先進發件箱；預設全部需批准。
- C05 批准機制放 platform 層。HxDesign 的 D08 移除了批准，但那只適用於創作；Company OS 有對外動作，以不變量 1 為準。
- C06 Need 的狀態與逾期用算的；唯一的手動轉換是驗收。
- C07 Need 編號為 `COS-<安裝代碼>-###`（例如 `COS-HK-001`），每個安裝一條序列，不回收。安裝代碼是設定項。
- C08 背景隊列用 Postgres，不用 Redis。
- C09 垂直切片優先：先跑通一個閉環，再橫向複製部門。
- C10 驗收分 A、B、C 三級（見總綱）。
- C11 與 HxDesign 的關係：先並存，只連結編號與成品；Need 閉環穩定後再決定是否搬入。（臨時答案）
- C12 一個 app = 一個容器。Boss portal 是其中一個。單一入口（gateway）、單一網址，用路徑分流。
- C13 身份、授權、Need、發件箱、審計、設定、MCP、隊列屬於 platform，不屬於任何一個 app。
- C14 一個 Postgres，每個 app 一個 schema、一個資料庫帳號。migration 每個 schema 獨立編號，只往前加，由 platform 的執行器依序套用。已套用的既有 migration 不搬、不改。
- C15 app 之間不互相引用，只用 `packages/` 與 platform 的介面；Boss portal 只讀各 app 的摘要介面，不讀它們的資料表。
- C16 單一登入頁；登入後只看到被授權的 app（我的 Apps）。
- C17 老闆帳戶天生是整套軟件的 super admin；每個 app 有自己的 super admin；員工 app 的 super admin 可以申請授權，敏感 app 的授權要老闆批准。
- C18 員工 app（名冊與授權）與 HR app（請假、入職、檔案）分開；員工 app 永遠安裝，HR app 選裝。
- C19 公司結構用通用組織單位：`org_unit` 加多上級關係加設定繼承。brand、國家分部、法人由老闆自訂類型，不鎖定。金額按單位的貨幣記帳，合併顯示時用有日期的匯率並同時顯示原幣。
- C20 通知渠道全部準備：渠道目錄加 adapter，按單位啟用。第一批：站內、Email、Lark、飛書、WhatsApp Business、企業微信、釘釘、SMS、Slack、Teams、Telegram、通用 webhook。各渠道在大陸是否可用要實測。（臨時答案）
- C21 新增部門用 app 範本與 `new:app` 指令；compose profile 決定這部機啟動哪些 app。
- C22 「敏感」是 app 的設定，預設財務、人事、員工、Boss portal 為敏感；研發部待定。（臨時答案）
- C23 公司特有的設定放在 `profiles/<公司>/`，不放進 starter 的預設。
- C24 第一階段的 Boss portal 只看本機這間公司。老闆看兩間公司，要登入兩次。
- C25 大陸的資料留在大陸機。任何境外存取（包括 VPN 回公司）的法律責任仍在公司，需專業意見；系統只負責審計與按政策控制。兩部機之間不建立跨境連線。

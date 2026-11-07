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
- C25 端口與路由以各 app 的 manifest 為唯一來源（`route`、`debugPort`、`exposure`、`sensitive`）。容器內一律 8080；主機端口只綁 127.0.0.1；所有 app 預設發佈自己的 `debugPort`（只綁本機，絕不對外），方便單獨開發、測試與更新。gateway 路由、compose、`.env.example`、`ports:check` 由 CI 檢查與 manifest 一致。端口表見 `docs/architecture/REPO-MAP.md`。（已被 C32、C35 修訂）
- C26 三種對象，三個入口：內網員工用 gateway-internal；外地員工、B2B 夥伴與供應商經 Cloudflare Tunnel 到 gateway-partner，先過 Cloudflare Access（一次性 PIN，限定電郵名單）再登入 Company OS；B2C 客戶經 Cloudflare Tunnel 到 gateway-customer，不經 Access，用客戶自己的帳戶，並由 Cloudflare WAF 限流與 Turnstile 保護。三個 gateway 是同一個映像、三個實例。cloudflared 只指向後兩者。（適用國際版，見 C34）（Demo Public Stack 的例外見 C52）
- C27 每個 app 的 manifest 宣告 `exposure`（internal、partner、customer，預設 internal）。session 記錄登入入口（`entry`）：internal 的 app 只接受 internal；partner 的 app 接受 internal 與 partner；customer 的 app 只接受 customer。高機密 app 因此即使被授權，也不能從隧道開啟，必須在內網或 VPN。
- C28 外部身份：夥伴是 `app_user` 的一種（kind = partner），只能被授權到 partner 的 app；客戶是獨立的 `customer_account`，與員工帳戶分開，只能看自己的記錄，沒有 app 授權流程。客戶 session 不被任何非 customer 的 app 接受。（適用國際版）
- C29 對客戶與供應商開放的 app 是獨立的 portal app：獨立容器、獨立 schema、不與後台 app 共用 session 或 cookie。portal 只寫入自己的 schema 與 platform 的 Need；後台 app 經 platform 介面接手，不讀 portal 的資料表。第一批：customer-portal（請求單、報價確認、訂單進度）與 supplier-portal（發票與文件提交、採購單與付款進度）。（適用國際版）
- C30 預設對外程度：internal = boss-portal、employees、ops-finance、hr、research-dev；partner = sales、support、design、supplier-portal；customer = customer-portal。platform 的登入頁與「我的 Needs」在 partner 入口可用，管理與審計頁只在 internal。（臨時答案，適用國際版）
- C31 程式碼邊界與部署容器分開（修訂 C11）：邊界由程式碼規則與 CI 強制，每個 app 仍是獨立的模組；容器是打包選擇，按版本 profile 組合。理由：各部門的底座與 UI 基礎很大機率相同，適度模組化比一個 app 一個容器更省資源，邊界卻同樣嚴格。當前內部實作細節見 `docs/architecture/CODE-MAP.md`。
- C32 同一個 `app-host` 映像用 `APP_SET` 決定載入哪些 app，每個 app 用自己的資料庫帳號與連線池。曝露程度不同的 app 不得同一個容器；customer-portal 與 supplier-portal 一律獨立容器。修訂 C25：端口改按容器發佈，不再每個 app 一個 `debugPort`；單獨開發、測試或更新某個 app，用 `APP_SET=<該 app>` 起一個 app-host。大陸版的全部 app 可在同一個 `apps` 容器，因為沒有外部入口。端口表見 `docs/architecture/REPO-MAP.md`。
- C33 共用底座與 UI：`packages/` 包括 contracts、platform-kit、policy、db-kit、edition-profile、design-tokens、ui-kit、app-shell、i18n。每個模組只經 `index.ts` 對外；app 之間不互相 import；分層方向為 web → api → domain → db；CI 加 `lint:boundaries`，並附「故意違反」的變異測試。國際版與大陸版的差異只寫在 `edition-profile`，app 內不寫地區判斷。
- C34 版本範圍：國際版全部都做（三層入口、customer-portal、supplier-portal、Cloudflare Tunnel、Access、WAF、Turnstile、全部通知渠道）；大陸版第一階段只做內網（只有 gateway-internal，不含 cloudflared、partner 與 customer gateway、外部帳戶與 portal），通知以站內為主，選配企業微信與飛書（出站、可選）。兩版同一份程式碼與資料模型，差異只在 `edition-profile`。大陸版不得因通知整合而打開公網回調或遠端登入。個人微信自動化不列入已承諾能力。研究紀錄見 issue #70。C26 至 C30 描述的是國際版。
- C35 兩版都用公司自己的電腦作主機。員工經 gateway-internal 存取：它綁管理者選定的 LAN 位址並配合主機防火牆限制公司子網；其餘容器端口只綁 127.0.0.1。內部 HTTPS 與憑證信任流程待驗證（S2-02）。修訂 C25：主機端口預設只綁本機，gateway-internal 是唯一例外。
- C36 UI 安裝精靈：兩版共用，在主機本機啟動，不假設 Docker 或 Company OS 已運行；步驟包括選版本、環境檢查、資料與備份位置、LAN 設定、老闆帳戶、app 與渠道、部署與健康檢查。國際版多一步對外入口設定（預設不啟用）。大陸版提供有版本與校驗值的離線安裝包（S2-06）。步驟全文見 issue #70。
- C37 交付順序（臨時答案，待老闆確認）：先交付大陸版（階段 0 至 7，內網），國際版的對外入口與 portal（階段 8）在後。（已被 C38 取代）
- C38 交付順序（老闆已確認，取代 C37）：國際版（繁體）優先，包括三層對外入口、customer-portal、supplier-portal；大陸版專屬項目（離線安裝包 S2-06、簡體語系 S2-07，以及企業微信與飛書的真實網絡實測）排在最後。批次見總綱第 15 節。
- C39 全部 issue 一次過建立在 GitHub，由 AI agent 按依賴順序施工，不再逐批慢慢開。每張 issue 有範圍、依賴、驗收指令與「不做什麼」；規格依賴尚未存在的程式碼時，標籤加 `needs-refine`，agent 開工前必須看到規格已補全，否則依開工規則第 7 條停下提問。（已被 C40 取代）
- C40 規劃方式（取代 C39）：issue 不再一次過建立。依 `docs/planning-loop.md`，先總綱、後單張，一次只展開一張施工 issue。總綱第 14 節的 93 張清單是規劃藍圖，不是已建立的 issue；實際 issue 編號與總綱編號的對照，以 GitHub 為準。底座施工期間出現的補漏項（例如 #87、#88、#103）以「底座補漏」類別另開 issue，並在同一個 PR 內把決策落進本文件。

## 2026-11-07：公司、Workspace 與 Base 整合

以下記錄產品及規劃決策，不代表程式已實作、測試通過或文件分支已合併。互動細節見 `docs/product/WORKSPACE-APP-SCOPE-DESIGN.md`；其中標明候選與未決的部分仍須核對，不因寫進決策日誌就變成已完成的技術方案。

- C41 公司與品牌 Workspace（補充 C01、C18、C23）：一部機器代表一間公司；公司可有多個品牌，每個品牌對應一個品牌 Workspace。公司共用事務直接屬於公司，不建立虛構的公司品牌或公司 Workspace。App 是公司工具，Workspace 是品牌工作上下文；選品牌不複製 app、員工身份或公司共用設定。停止使用「Workspace 服務整間公司」的含糊描述，改為「Workspace 機制可供不同部門 app 使用，每個品牌 Workspace 仍只代表一個品牌」。
- C42 三套可重用 App 行為模式（補充 C20、C33）：公司型只提供公司工作入口；品牌型主要工作入口必須指定品牌；混合型同時提供公司與品牌入口。模式定義入口及共用切換，不自動決定每類資料歸屬或授權。引用公司設定不等於混合型。公司範圍不是所有品牌集合；跨品牌查閱或操作另有明確契約。切換不搬移、複製、重新歸屬資料或授權。先設計中性的三模式共用行為，不提前設計任何部門業務。
- C43 組織、資料歸屬與授權的分界（澄清 C18）：保留通用組織單位、多上級及設定繼承方向，不以本次產品名詞另造一份品牌真相。品牌身份與 org_unit 的穩定對應須由規劃明確定義，不能靠任意可改 type 文字或名稱推斷。總綱「資料掛最底層單位」不再作所有公司資料的全域規則；須分開公司歸屬、品牌歸屬與組織關聯，各 app 資料類別在其獨立設計階段說明。UnitScope 的 all／units／subtree 是授權範圍，不等於公司／品牌工作上下文；缺失目標不當作公司或全部。既有組織、授權及政策來源保留，實際欄位與介面接合尚未定案。
- C44 模板與建立品牌（補充 C02，不取代 starter 空白原則）：建立品牌有從空白／從模板兩個入口。模板 Workspace 是受管理的特殊起點，不是真實營運品牌或公司範圍，不混入普通品牌工作清單。用戶複製後修改自己品牌，不改原件；不製造假營運數字。產品所稱 Super Admin 的現有角色映射、模板可見性、複製白名單、版本及失敗規則須先核對。模板不迫使 Base 提前開發部門內容；HxDesign 只作參考，不整套移植。品牌與模板刪除遵守既有軟刪除及人工批准不變量，不照搬 HxDesign 的硬刪除。此處不新增所有刪除都需批准的政策。
- C45 完整規劃先於施工（補充 C40）：保留 B-01 至 B-12 用戶交付編號；先完成品牌身份、工作上下文、三模式宣告、合法範圍解析、共用外殼行為及建立品牌／模板的接合規劃，再按模組邊界一次一張拆成熟施工切片。原型可用明確測試資料，不冒充正式 app 或品牌；正式外殼與建立品牌頁依賴共同底座，不互相形成循環。規劃負責關鍵方案，施工 agent 不自行猜 API、品牌身份、角色或權限。三模式宣告的唯一來源、驗證及舊 app 相容方案未定，不直接向現有 manifest 加未知欄位。Depends-on 依 planning-loop 用獨立行列實際 issue 編號；每張列明允許路徑、確定契約、實際驗收指令與證據。先對齊本決策、總綱、Base、Workspace 與 INDEX，再逐張同步受影響 issue；未核實的 GitHub 狀態保留日期或明示未知。H 系列留 Base 之後，B-12/H-12 設定責任先釐清，不建立兩個設定來源。文件更新不授權開發、部署或合併 main。

### 2026-11-07 增補：#118 最小 v0.3 施工邊界

以下五項由老闆確認，作為 `#118 [B-01] Base UI 外殼` 的最小施工契約。它們只就 #118 收窄施工邊界，不廢除 C41–C45 的其餘要求：品牌身份、完整工作上下文、三模式宣告來源及合法範圍解析仍未定，B-02 至 B-12 的前置規劃照原文處理。模式、品牌與範圍的完整方案一日未定，一日不得由施工把這五項解讀成已具備後端能力。

- C46 App 模式是 UI 工作入口，不是授權或資料歸屬（補充 C42）：公司型、品牌型、混合型只定義 Base UI 的入口與切換行為，不決定授權、資料歸屬、資料可見性、grant scope 或後端權限；模式不得自動建立、複製、收窄、擴大、撤銷或改變授權。公司型不要求品牌，亦不等於 `UnitScope.all`。品牌型必須有明確品牌目標；混合型必須明確顯示公司／品牌入口。本階段模式來源只限 #118 的明確原型測試資料，不得寫入正式 manifest、registry 或正式品牌資料。
- C47 品牌身份與員工可見範圍暫緩（補充 C43）：本輪不建立品牌資料表、品牌目錄、品牌角色、品牌授權或員工可見品牌 API。不得把 `org_unit.type`、任意字串、`null`、localStorage 或前端硬編清單當作品牌身份來源。`GET /org-units` 維持 `requireOwner`，不得為員工選擇器放寬。員工品牌選擇器在未有安全範圍查詢契約前列為阻塞，不得以管理 API、假資料或前端猜測代替。原型只可使用明確的「品牌甲／品牌乙」測試資料，並清楚標示為 prototype fixture。
- C48 深連結只做最小可還原導航（補充 C41）：深連結只表達「app、工作範圍及頁面」的導航狀態，不代表授權、資料歸屬或後端存取。最小格式為 `#/app/:appId/:scope?/:page?`，實際格式以現有 router 與測試可行性為準，並在 PR 記錄。不支援的組合必須如實顯示，不得偽裝可用。深連結不得繞過 `requireUser`、entry 判斷、policy engine、manifest registry 或既有權限。
- C49 深色模式屬 #118 必做範圍（補充 C42、C33）：在 `packages/` 內補齊深色 design token、主題切換及必要樣式。白色仍是主要設計基準，深色必須同時可用。不得改變既有業務語意、API、權限或審計。
- C50 真實 app 不屬於 #118（補充 C45）：現有六個 manifest 全部 `available: false`，維持不變；不得把原型 app、假 app 或測試資料寫入正式 registry／manifest。原型只使用明確的 App A／B／C 測試資料，並清楚標示為 prototype fixture。「我的 Apps」及真實 app 接駁屬 B-06，不在 #118 完成。
- C51 第二步只有一個「返回」（老闆 2026-11-07 決定，修正 WORKSPACE 第 6 節字面）：切 app 需要選範圍時，第二步只提供一個「返回」按鈕，不並列「返回」與「取消」。理由：這一步從未離開原本的 app，兩個名字做同一個結果只會令人以為其中一個有分別。按下去只收掉這一步，保留原 app、原範圍、原頁面，不建立或改動授權，不搬移資料歸屬，不寫網址，不顯示成功畫面。未保存確認是另一個情境，該處的「取消」指「取消離開」，與本條無關，維持原樣。

### 2026-11-07 增補：Demo Public Stack（issue #145）

- C52 Demo Public Stack 是獨立隔離環境，不是第四個入口（修訂 C26、AGENTS.md 第 15 條的唯一例外）：為 UI／UX 測試而設的公開 Demo，必須使用獨立的 compose project（`company-os-demo`）、獨立 Postgres 資料庫、獨立 storage volume 與 bucket、獨立環境變數檔、獨立 Demo 帳戶。它可以用 `gateway-internal` 映像，只由 cloudflared 經獨立 Demo 子網域指向該 Demo 入口，並且**不發佈任何主機端口**；不得指向正式資料庫、正式 storage、正式 API、正式老闆或員工帳戶。正式 stack 的三層入口與「端口不得對互聯網發佈」規則完全不變，本條不授權把正式 `gateway-internal` 放上公網。理由：測試要在真實瀏覽器發生，但正式資料不可以因此暴露；與其讓人自行解讀，不如把隔離條件寫成可檢查的契約。契約、部署、更新、清除與驗收見 `docs/deployment/demo-public-stack.md`；隔離由 `npm run demo:check` 與 `scripts/demo-stack.test.ts` 強制。未決：Demo 子網域、Access／WAF／Turnstile、資料保留期、是否長期運行、第一批啟用的 app。

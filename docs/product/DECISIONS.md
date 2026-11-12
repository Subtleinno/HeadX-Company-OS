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

### 2026-11-09 增補：#153 裁決落地（issue #156）

來源：https://github.com/Subtleinno/company-os/issues/153（老闆裁決留言）。以下條目只記錄決定同落地次序，不代表程式、色票或 UI 已經實作；本張純文件，唔改任何程式碼。日期一律 2026-11-09。

- C53 主色 A：以 Frame v1.3 為準，Chrome（頂欄、側欄、浮層）黑灰白；`#0057FF` 只喺內容區主要按鈕同空狀態圖示；停用 `#B8F36B`，包括現有品牌標誌方塊，唔再寫「綠色只作點綴」。原因：舊 `AGENTS.md` 色彩條目同 #147「設計方向（鎖死）」同設計稿兩套並存。取代：`AGENTS.md` 介面風格色彩條目、#147 嘅黑 accent 寫法、`BASE-UI-DESIGN.md` 第 3 節、`FRAME-UIUX-HANDOFF.md` 第 5 節「主色」衝突列。落地次序：#156 先改文件，#154（F-02P）先可寫入新色票，#158（F-02）移除使用處並更新 gates，#159 退役 `--hx-brand-green` token（淺色同深色兩區塊）；本張唔改程式。來源：#153 主色 A。
- C54 Q1 A：總部主機 = 登記／批准／入口中心（trust hub），唔係即時跨機查詢或合併報表。原因：後者要改 C01／C24／`MASTER-PLAN.md` §236 並過法律同安全評估，唔可以用 UI 捷徑做。取代：無（維持 C01、C24、§236）；唔開跨機 endpoint issue，日後要即時查閱另開決策輪次。來源：#153 Q1 A。
- C55 Q2 C：Frame 階段據點與機器只有 owner 可見，非 owner 顯示**具體原因**嘅 permission denied（頁 08）。原因：現有後端冇「管理級」grant 等級，UI 唔可以自己猜權限。取代：無；唔新增 grant 等級，「管理級」留到 Boss Portal 階段另開 `cat:platform` issue 定義。來源：#153 Q2 C。
- C56 Q3 A：總部批准 ≠ 該機授權；入口只開新分頁，由該機自己驗身份同授權。原因：安全底線，總部目錄唔代表跨機身份。取代：無（補充 C01／C24）。來源：#153 Q3 A。
- C57 Q4 A（現階段按 B 執行）：Logo 管理另開深度重設計輪次，排喺 Boss Portal／Design app 之後，第一題先裁資料來源。原因：v1.0 四頁 Logo CRUD 已撤回，資料模型（A／B／C 三方案）未定。取代：無；F-08 繼續停工、只保留字標 fallback，唔落實任何上傳／CRUD、唔喺前端自建第二份真相；3.4 三方案只係輸入，唔喺本條拍板。來源：#153 Q4 A。落地位置：`FRAME-UIUX-HANDOFF.md` 第 1.4、3.4 節。
- C58 Q5 B（補充 C47）：沿用現有 owner 端點，`GET /org-units` 維持 `requireOwner`，唔為 UI 放寬；員工 Brand selector 暫不做。原因：品牌穩定身份 ↔ org_unit 對應（C43）同安全唯讀範圍契約（C47）未定。取代：無（補充 C47）；Frame v1 先落地公司型路徑，未接之前如實顯示阻塞／空狀態，唔用假資料。來源：#153 Q5 B。
- C59 Q6 C（補充 C45／C46）：暫不宣告模式，只列 manifest 六個 app；頁 02「公司型・敏感」改由現有 `kind`＋`sensitive` 直接呈現，唔加 `mode` 欄位、唔喺前端自建模式真相。原因：manifest 現時只接受既有欄位，三模式宣告嘅唯一來源未定。取代：無；三模式正式契約同合法範圍解析留到 Q5 嗰輪一併定。來源：#153 Q6 C。落地位置：`FRAME-UIUX-HANDOFF.md` 頁 02 描述、#160 範圍第 5 點。
- C60 Q7 A／Q8 A／Q9 A（附邊界）：(Q7) Frame v1 只做到 768，360px 另開設計＋施工輪次排喺 F-02 之後，唔阻塞 Frame 開工；F-02 唔准用 `overflow: hidden` 或收起捲軸遮問題，驗收要留 360px 唔破版嘅基本證據。(Q8) 公司 Logo 欄位渲染兩次（App selector 嘅 app 名＋頁尾本機公司名），係同一個欄位渲染兩次，唔係兩份資料真相。(Q9) 頁 06–09 定稿為 Boss Portal 第一批據點管理畫面嘅**視覺／互動規格**，但 (1) 唔係施工授權；(2) `manifest.json` 嘅 `available: false` 維持不變（C50），直到 Q1／Q3 跨機契約同 Q2 權限等級落地；(3) 完整業務頁（今日／批准收件匣／部門摘要）仍然未開始，F-09 照排 Frame 全部完成之後。原因：避免把概念畫面當成已批規格。取代：無；`FRAME-UIUX-HANDOFF.md` 第 1.6／2.9／2.7／6.3 節同 `FRAME-DESIGN-INDEX.md` 按此改。來源：#153 Q7 A、Q8 A、Q9 A。
- C61 既有 issue 處理（#118 A／#147 A／#148 A）：#118 併入 F-02（#158），由老闆自己 close，PM 唔好 close；搬過去要保留 #118 增補嘅硬閘門（原型雙向切換走查、`requireOwner` 唔放寬、負面測試、白／深色、窄螢幕、鍵盤證據、未執行指令如實寫），唔留兩套外殼規格。#147 A／B 兩個 P0 獨立繼續、唔等 Frame，C 項搬入 F-02；#147「設計方向（鎖死）」跟主色 A 同 #148 A。#148 A 取消：唔再參考 HxDesign 做 UI 基準，Frame v1.3（Ardot `745493588675335` ＋ `docs/design/frame/*.png`）係唯一 UI 真相，HxDesign 只作歷史參考；由老闆自己 close，PM 唔好 close。原因：唔留兩套 UI 標準。取代：`BASE-UI-DESIGN.md` 第 2 節舊外殼參考、`BASE-UI-HXDESIGN-ALIGNMENT.md` 嘅基準地位（檔保留）、`docs/INDEX.md` 文件地圖。來源：#153 既有 issue 段。

### 2026-11-10 增補：Frame 色彩、外殼與 Needs（issue #184）

來源：老闆 2026-11-10 對 Frame 導出稿（`docs/design/frame/*.png`）與 Needs 位置的指示。以下係落地規則，唔係新建議；除 C65 撤銷 C49 之外，其餘都係補充。

- C62 色彩只有白、灰、黑，加一個藍（補充 C53）：Frame 全部畫面只准用導出稿取樣得到的 `#FFFFFF`、`#F5F6FA`、`#E1E4E8`、`#F0F1F3`、`#191919`、`#6E6E6E`、`#A3A3A3`，以及 `#0057FF`。**不准暖色中性**（米色、淺啡、「紙張」色）—— 之前原型用 `#F7F5F1`／`#EBE8E1` 屬錯，已改回上列 token。所有顏色經 `packages/design-tokens`，`apps/web/test/gates.test.ts` 禁止其他檔案出現 hex／rgb。原因：老闆原話「the correct should be only by White Gray Black, should not have light brown」。
- C63 唔做全站搜尋：Frame 頂欄唔設搜尋框，亦唔設「即將推出」的假入口。原因：老闆原話「we actually don't need search」。取代：任何把搜尋列入 Frame 必做範圍的規格（包括 `FRAME-UIUX-HANDOFF.md` 舊版第 2.3 節）。
- C64 主要按鈕唔用黑色（補充 C53）：藍 `#0057FF` 係唯一「寫入／確認」用色；次要動作同「離開」用外框；近黑只作文字與選中態底色，唔作按鈕底色。原因：老闆原話「we don't need black」。取代：C53 之後任何以近黑作主要按鈕的寫法。
- C65 唔做深色 UI（**撤銷 C49**）：只做淺色一套，唔提供主題切換，唔維護深色 token 對照。原因：老闆原話「yes, actually we don't need dark UI」。注意：撤銷嘅只係「深色模式屬必做範圍」；既有程式若有主題切換，移除與否按實際使用處另計，唔可以靜靜留一個撳完冇分別的掣。
- C66 權限不足係獨立全螢幕狀態（補充 C55）：唔顯示 app selector、模組第二行、左側欄、頁尾。原因：留低外殼等於把整個選單結構送給無權限的人；亦唔應該用「空畫面」假裝已載入。C55 要求顯示具體原因，維持。
- C67 空狀態唔放撳唔到的圖示：空狀態只講「而家冇嘢，同下一步係咩」。之前原型放了 `+` 但冇作用，已移除。原因：一個睇得見而撳完冇反應的掣，比冇呢個掣更差。
- C68 四層位置各有分工（補充 C46、C51、C60）：(1) 第一行左邊 = app selector + 品牌 selector；(2) 第一行右邊／第二行 = 該 app 的模組（例如 Marketing Design 的 Brand／Material／Knowledge／Create），呢層係 app 的模組；(3) 左側欄 = 當前模組的頁面，呢層先係「頁」；(4) breadcrumb 只表達「我而家喺邊」，唔兼做導航選單。768 寬度下模組第二行唔可以整行消失，要收成一個「模組・<名稱> ▾」按鈕。
- C69 Needs 住喺 Frame 外殼，唔係一個 app（補充 C06、C12）：(1) 頂欄右邊一個 `Needs <數目>` 掣，去 Needs 頁；(2) 任何會產生 Need 的頁面，右邊有該頁的 Needs 側欄，最多 4 件、逾期先、可以自己收起（同左側欄一樣有掣），1280 以下自動收起；(3) 逾期唔上頂欄，只喺 Needs 頁同逐件 Need 顯示（紅色日期）；(4) Need 由 agent 自動開立，人只認領同驗收；(5) 計數由後端一次過回，唔由前端加總 —— 前端加總在清單只載 50 筆時一定錯。若日後證實做唔到跟頁面走，先退成獨立 app，但頂欄嗰個掣位置不變。

### 2026-11-10 增補：Frame 四層、模組註冊與據點目錄（issue 185）

來源：老闆 2026-11-10「你可以完成成個 Frame、Boss Portal 同 Marketing Design app」。以下係施工時定落嘅規則。

- C70 四層位置最終版（修正 C68 第二層用法）：(1) 第一行左邊 = app selector（＋品牌 selector，如果呢個 app 有品牌範圍）；(2) 第一行右邊 = 該 app 的**模組**（Design：品牌／素材／知識／創作；Boss Portal：總覽／據點與機器／存取紀錄）；(3) **左側欄 = 當前模組的頁**（品牌主頁／Dashboard／品牌設定…）；(4) **章節**（品牌標誌／品牌識別／色彩／字體）只喺被選中嗰頁之下展開。因此 `modulePages`（第二行）一律傳空，第二行冇頁就整條唔畫 —— 一條空白 bar 會令人以為載入失敗。breadcrumb 只表達「我而家喺邊」，四格：app／模組／頁／章節。
- C71 `/modules` 公開 `route`。以前刻意唔公開，係因為冇任何畫面接得住；而家 Boss Portal 同 Design 有真畫面，唔公開就等於要前端自己寫一份「app id ↔ 網址」對照表 —— 兩份清單，總有一份會過時。前端只可以用 `route` 認返邊個 app，**不准**在 `apps/web` 出現 manifest app id 字面值（`apps/web/test/app-selector-live.test.tsx` 的靜態閘門維持）。
- C72 據點目錄只講事實：顯示「狀態」「憑證指紋（頭尾幾位）」「最後憑證交換日期」，**冇「在線」燈**（設計稿 frame-06 自己講明）。待批准嘅據點，入口欄放「批准」而唔係「檢視憑證」—— 憑證只存 hash，建立之後就攞唔返，放一個攞唔返憑證嘅掣就係假功能。已登記但冇填入口網址嘅據點顯示破折號，唔畫一個連唔到嘅分頁。
- C73 `available` 的意思係「有冇畫面接得住」，唔係「想唔想開」。Boss Portal 同 Design 已有真畫面，所以 `available: true`；其餘四個部門 app 仍然係 `false`。`registry.test.ts` 由「六個全部 false」改為「只有 boss 同 design 係 true」，並保留一句：未建立嘅軟件唔會假裝可用。
- C74 app 名稱只有一個來源：manifest 的 `title`（補充 C71）。之前麵包屑第一格用 `i18n` 另一份字串，於是同一個 app 喺同一畫面有兩個名（左上角 selector 講一個、麵包屑講另一個）。現在頁面只交「模組／頁／章節」，第一格由 `FrameApps` 用 `/modules` 回的 `title` 補上；`AppNav` 不再有 `rootKey`。同時把兩個 manifest 標題對齊設計稿（frame-02／06）：`boss` → `Boss Portal`、`design` → `Design`。原因：兩份事實總有一份會過時，而用戶一眼就見到。
- C75 左側欄最頂一行小標係「頁面 PAGES」（跟設計稿 frame-06），講「呢條欄列嘅係頁」；**分組標題只喺一個模組真有兩組以上時才出現**（Boss Portal：據點 MACHINES／權限與稽核）。只有一組頁的模組唔加標題 —— 嗰個標題只會重複上面個模組名，或者重複「頁面 PAGES」。已刪 `design.group.*` 五個重複鍵。
- C76 頁標題用**頁名**，唔用模組名（**刻意偏離**設計稿 frame-06）。frame-06 的標題係「據點與機器」，同正上方已選中的模組 tab 完全一樣，等於同一頁講兩次同一句；而麵包屑最後一格係「據點目錄」。改為標題＝據點目錄，模組名留返喺模組 tab 同麵包屑第二格。除呢一項外，其餘版面（表頭底色、卡片、狀態「已登記・本機」、主要動作帶「＋」、卡內備註）一律跟 frame-06。

### 2026-11-11 增補：單一 repo、不買 Pro、工作模式（老闆定）

- C77 **正式 repo 只有 `Subtleinno/HeadX-Company-OS` 一個**；`Subtleinno/company-os` 已歸檔成唯讀，local remote 名 `archive`，只讀歷史。本地工作目錄資料夾名仍然叫 `company-os`，係歷史遺留，內容就是 HeadX —— 為免再有第二份，工作區外面那兩個同名資料夾（純文件夾與舊 clone）已清走。理由：兩個 repo 同時可寫，總有一邊會落後，而落後那邊會有人開錯。
- C78 **不買 GitHub Pro**，因此分支保護開不到（GitHub 對 private repo 回 403）。補償方式不是加審批，而是三件事：(1) 一個 PR 一件事；(2) PR 前 CI 六個檢查必綠；(3) CI 紅燈由 AI 自己修，唔交返老闆。老闆原話：「if it show error, please AI agent (you) to fix」。呢條取代 `ci.yml` 註解裡「分支保護只需要求 ci-ok」的假設 —— 機器擋唔到，靠人不靠閘，但這個「人」係 AI 自己。
- C79 **MCP、生產部署、備份演練一律暫緩**（老闆 2026-11-11：未到時候、進度未夠）。本機 Docker Compose 就係驗收環境，老闆可以即時自己看。呢三項不是取消，是排在頁面成形之後；備份演練仍然是上生產前必須做的一次實測（見 `HANDOFF.md` 第 8 節）。
- C80 **工作模式：老闆逐頁設計 UI，AI 逐頁實作。** 老闆會講清楚每個功能想怎樣運作，AI 負責令它成真；GitHub issue 就是隊列，一頁一張，做完關掉。回報規則：講「在哪個畫面看得到」，唔講技術細節 —— 老闆不是工程師，看不到的改動等於沒做。這條同時解釋為什麼本輪之後的優先次序是「先做齊頁面，再逐個做深功能」。

### 2026-11-11 增補：單一 worktree、範圍與可達性兩個軸、設計底稿入庫

來源：老闆 2026-11-11「Can we have only one main worktree and the folder have to call HeadX-company-os」「it have different Workspace level, some can be public (able to public with cloudflare tunnel), some cannot, only able to use VPN to access. Some workspace is in Company level, some is in Brand level… Do you agree? or actually if we can have Workspace setting option to select for security option will be better?」

- C81 **只有一個 worktree，資料夾名 = repo 名 `HeadX-Company-OS`**（修正 C77 最後一句）。之前本機有兩個 worktree：`Dev/Dev/Github/company-os` 掛 `main`，`WorkBuddy/Worktrees/company-os/main-13a6ab60` 係施工位。問題不只是名一樣，而是**施工位那個長期缺 `config/`、`docker/`、`tools/`、`tsconfig.base.json`**，兩邊「邊個才係真」講不清。已把施工位獨有的三樣（`.env`、`.data`、設計底稿）搬去主目錄，然後刪走施工位、把主目錄改名。現在 `git worktree list` 只回一行。舊 repo `Subtleinno/company-os` 歸檔狀態已覆核（`isArchived: true`，只讀）。
- C82 **範圍（Scope）與可達性（Reachability）係兩個軸，唔可以合成一個「workspace 安全等級」開關。** 老闆問是否用 workspace 設定揀安全選項 —— 方向對（要有一個地方睇得到、揀得到），但**唔可以係一個 per-workspace 開關**，理由係三件具體事實：
  1. **兩個軸答唔同問題。** Scope 答「我喺邊個上下文工作、寫入落邊」。Reachability 答「呢個請求由邊道門入嚟」。合併之後，同一個控件會同時改寫入目標同網絡曝露，而兩者失敗後果完全不同。
  2. **公司層資料跟唔到品牌 workspace。** 財務、人事、Boss Portal 屬公司層，唔屬任何品牌。若「公開」係品牌 workspace 的屬性，就會出現「品牌 A 設成公開，員工喺品牌 A 頁面按入財務，財務忽然公開咗」—— 冇人做過這個決定，但資料已經出咗去。
  3. **曝露係部署形狀，唔係數值。** 「公開」在技術上等於一條 hostname ＋ 一個 gateway ＋ 一個 cookie domain。改它要重新部署、要換 tunnel ingress，唔可能即時生效；做成 checkbox 只會令人以為撳完就生效。
  **正確次序係三層，而且只能向下收窄，永遠不能向上放寬：**
  | 層 | 內容 | 誰決定 | 現況 |
  |---|---|---|---|
  | 1 硬上限 | app manifest `exposure`（internal／partner／customer） | 寫喺 repo，改要 PR | **已實作**，`packages/policy` 有 `ENTRY_MATRIX`，`entry_not_allowed` 有真 HTTP 測試 |
  | 2 部署形狀 | 一個安裝開幾道門、Cloudflare tunnel 指去邊個 gateway | 部署時決定（infra） | 只有 `gateway-internal` 一道門；partner／customer 未開 |
  | 3 顯示與意圖 | 你而家喺邊道門、呢個 app 准唔准由呢道門入 | UI 誠實呈現 | 權限不足已有全螢幕說明；未做「對外存取」頁 |
  一句：**manifest 講「最多可以去到邊」，部署講「今次開幾道門」，UI 只講「你而家喺邊」。** 任何一層都唔可以由 UI 直接提高上限。
- C83 **設計底稿收入 repo。** `SCOPE-MODEL.md`（範圍模型：公司／品牌、三種 app 模式、Context 管寫 vs Lens 管讀）、`MULTI-MACHINE-ACCESS.md`（跨機入口：總部係登記／批准／入口中心，唔係資料隧道）、`BACKEND-FUNCTIONS-MAP.md`（端點對照）原本只存在 `.workbuddy/design/`，而該目錄**在 `.gitignore` 裡面**，所以 repo、GitHub、任何新 session 都看不到。老闆講「i think it is a good design, let's get them back」—— 呢個係真正風險：設計存在但無人讀得到，等於唔存在。已收入 `docs/product/`，各自加一段來源與時效說明；`loop-engineering-worker-v1.1.md` 屬過期授權書，收入 `docs/design/archive/`，並在檔頭寫明「唔可以再用」。
- C84 **「對外存取」頁排在頁面隊列之後，形態已定。** Boss Portal → 設定 → 對外存取，只做三件事：(1) 顯示目前生效的門（例：「內部網絡」）；(2) 三個具名 profile 供選擇（`僅內網` / `內網＋VPN` / `內網＋指定 app 可經 tunnel`）；(3) 改動一律標「需重新部署才生效」，並列出「即使公開，以下仍然只限內網」，該清單由 `exposure: internal` 的 manifest 自動生成，**不由人手勾**。呢頁在 `exposure` 落地之前唔開工 —— 開一個撳完唔會生效的掣，比唔開更差。

### 2026-11-11 增補：文件收斂成一份概念真相（老闆要求）

來源：老闆 2026-11-11「i see the folder have a lot of files, that's make me hard to manage, and also may makes you confuse and work slow… i actually need that level of doc to remind me and remind you what is the truth of design. Can you find me back the docs that i was created with you?… let's make the repo clean」

- C85 **`docs/` 收斂成「三份真相 ＋ 一個入口」。** 真相三份：`docs/CONCEPT.md`（這套東西是什麼）、`docs/product/HANDOFF.md`（今日做到哪）、`docs/product/DECISIONS.md`（為甚麼這樣定）。入口一份：`docs/INDEX.md`，三段式（讀概念／看現況／查細節）。其餘文件只做細節或歷史，不需要順序讀。

  為甚麼要這樣做——**問題不是檔案多，是同時有三套「真相」在互相覆蓋**：(1) `docs/concept/` 十三份 2026-11-10 的構思（七原則、十二物件、Needs 兩型）；(2) `docs/product/MASTER-PLAN.md` 2026-11-07 的舊全盤計劃（國際版／大陸版、gateway 三入口、customer-portal／supplier-portal、發件箱、MCP 六動詞）；(3) `SCOPE-MODEL.md`＋`FRAME-UIUX-HANDOFF.md`＋`DECISIONS.md` 這批真正在施工的。三套的世界觀直接衝突——最明顯一對：舊計劃寫「所有對外訊息先進發件箱，由規則決定放行或交老闆批准」，新概念寫「預設無閘」。而 `AGENTS.md`（每個 agent 開工第一份讀的）站的是舊計劃那邊。任何 agent 讀完都會同時拿到兩份相反的指令，這就是「你會混亂、會慢」的機制，不是錯覺。

  具體做法：
  | 動作 | 內容 |
  |---|---|
  | 新建 | `docs/CONCEPT.md` v2.0 —— 由 iCloud 的 `Headx-company-os-concept.md` v0.1（老闆原稿）、`concept/01` v0.8、C1–C84 合併而成。十二節，一頁讀完，生意語言為主 |
  | 重寫 | `docs/INDEX.md` —— 三段式入口；刪掉「規劃交付與開工條件」「驗證與狀態」等舊規劃體系語言（三十行），保留「一個真相，一個方向」全表（那是硬資產） |
  | 改寫 | `docs/concept/README.md` —— 由「專案 README」改成「概念附錄索引」，明寫主真相在 `CONCEPT.md` |
  | 歸檔 | 8 份到 `docs/archive/`：`MASTER-PLAN-2026-11-07`、`00-master-plan-v1.0`、`BASE-UI-DESIGN-2026-11-07`、`BASE-UI-HXDESIGN-ALIGNMENT-2026-11-07`、`WORKSPACE-APP-SCOPE-DESIGN-v0.3`、`PERPLEXITY-MANAGER-PROMPT`、`planning-loop`、`12-ui-brief` |
  | 移入子目錄 | 9 份到 `docs/concept/future/`：`02`–`08`（各部門 app 構思）、`11-delivery-plan`、`strategy-doc-questions` |
  | 修正 | `AGENTS.md` 的「這個 repo 是什麼」與不變量 1、2；`HANDOFF.md` 第 4 節文件地圖；`README.md` 文件表；`FRAME-UIUX-HANDOFF.md` §6.2 讀次序；`FRAME-DESIGN-INDEX.md` 開工卡 |
  | 同步 | `tools/rename/rename-guard.test.ts` 的 `OLD_PATH_ALLOWLIST` 加 `docs/archive/`（歸檔是歷史，允許提舊路徑） |

  **改文件的規矩從此寫進入口**：任何概念改動先改 `docs/CONCEPT.md`，再同步 `DECISIONS.md` 記一條，最後才改下面的細節文件。三處各說各話是這次混亂的成因，不能再發生。

- C86 **`AGENTS.md` 的權限從「不准改」放寬為「改要一併記決策」。** 原文第 8 條寫「不要改這個檔案，除非 issue 明確要求」。問題是它自己是世界觀的載體：舊計劃被取代之後，它仍在教 agent「批准只能由人按下」「六個動詞」「國際版三個入口」。留著不改，等於每天都派一份過時的指令給所有 agent。新規則：`AGENTS.md` 可以改，但每次改動必須在 `DECISIONS.md` 留一條，並在 PR 描述寫明改了哪一條不變量與為甚麼。**不變量本身仍然不是隨手可改的**——改一條不變量要老闆明確同意，不是 agent 自己判斷。

### 2026-11-11 增補：清乾淨 Docker、改 compose project 名、一鍵安裝

來源：老闆 2026-11-11「let's delete all the Company-os Docker, then use the latest one to install again. (Make sure this project must able to install in Mac / Windows) In github, i want to archive the company-os, keep HeadX-Company-OS」

- C87 **清掉三個舊 compose project，只留一套，並把 project 名改為 `headx-company-os`。**

  當日實際存在三套在跑：`company-os`（舊資料夾，資料夾本身已不存在，容器仍在）、`company-os-demo`（公開 Demo）、`company-os-needs`（施工時用 `-p` 起的名字）。三套共用同一部機、同一個 owner 帳戶概念，任何人看 `docker ps` 都分不出哪一套才是真的。全部移除：12 個容器、3 個 db volume、7 個映像、3 個網絡，加上 repo 的 `.data/` 與 `~/Dev/Dev/company-os-demo-data/`。

  **改名的範圍刻意切在「名字」而不動「資料身份」**：
  | 改 | 不改 |
  |---|---|
  | compose project 名 → `headx-company-os`（容器變成 `headx-company-os-api-1`） | Postgres 資料庫名 `company_os` |
  | MinIO 映像 tag → `headx-company-os-minio:…` | MinIO bucket `company-os` |
  | `BACKUP_QUIESCE_CONTAINERS` → `headx-company-os-api-1` | 備份目錄 `<root>/company-os/<id>` |

  理由：容器名是**今日在跑的這套**的身份，要同 repo／資料夾一致；bucket、資料庫名、備份目錄是**資料的身份**，改了就與舊備份對不上，換取的好處只是好看。

  `scripts/deploy-revision.mjs` 的 `DEFAULT_PROJECT` 不再寫死，改為讀 `docker-compose.yml` 的 `name:`；`tools/rename/rename-guard.test.ts` 由「凍結字串」改成「斷言備份腳本的容器名等於 compose 的 `name:` ＋ `-api-1`」。兩處都是同一個原則：**會漂移的值不要手抄兩份**。

- C88 **安裝收成一句 `npm run install:stack`，Mac 與 Windows 跑同一段程式。**

  舊 README 要人先 `copy .env.example .env`，再手動填四個密碼（Postgres、MinIO、登入審計 HMAC、內網入口憑證），其中 `COMPANY_OS_BACKUP_ROOT` 還要另外指到另一粒碟。實務結果：新機安裝失敗的第一名原因就是這一步，而失敗訊息是 compose 講的「請先複製 .env.example 為 .env」—— 與真正原因（某個值是空）無關。

  新做法：`scripts/install.mjs`，只用 Node 與 `docker` 兩個外部程式（**不用 bash、不用 PowerShell**），所以 Mac 與 Windows 跑的是同一段程式，不是兩份會各自腐壞的腳本。八步：查 Node／Docker／daemon → 補 `npm ci` → 建 `.env` 並自動產生四個密鑰（已有的值不覆寫）→ 端口檢查 → 建置 → 啟動 → 等健康 → 開老闆帳戶並印出帳密。

  兩個附帶決定：
  1. **老闆帳戶由安裝腳本代開。** 系統本身有 `POST /auth/setup`（只在一個 owner 都未有的時候接受），但**網頁還沒有對應畫面**。不代開就會出現「裝好但登入不到」。這是暫時的補位，不是長期設計 —— 第一版安裝精靈（UI）落地時，這一步應該搬回畫面。
  2. **`.gitattributes` 由逐個資料夾改成全 repo `* text=auto eol=lf`。** 原本只鎖 `db/migrations/*.sql`、`apps/web/docker-entrypoint.d/*.sh` 與一個已經不存在的 `modules/**/*.json`。只要是 COPY 進 Linux 映像的文字檔，換行不同就會建出與 Mac／CI 不同的映像，而畫面上完全看不出來。實測改動前 repo 內 CRLF 檔數為 0，所以這條是純保險，沒有一次性 renormalize 的大量 diff。

### 2026-11-11 增補：開發期用 Cloudflare Tunnel 對外

來源：老闆 2026-11-11「i need to able to use cloudflare tunnel to work with Headx-Company-OS, i like to assign URL name for it… make sure whole HeadX-Company-OS can be public via cloudflare (it is only for development now) we will move to higher security once we really using the software for managing company」

- C89 **對外只開一條 Cloudflare Tunnel，指向 `gateway-internal`，其餘一概不對外。連接器跑在主機上，不在 compose 內。**

  這是第一次讓這套系統離開 `127.0.0.1`。先把「哪一道門」寫清楚，因為開錯一道門，之後所有權限設計都會被繞過：

  | 對外 | 不對外 |
  |---|---|
  | `gateway-internal`（網頁 ＋ `/api`）＝ `http://localhost:4210` | `api`（4420）—— 繞過 nginx 就沒有入口憑證與 CSRF 前哨 |
  | | `storage`（MinIO 主控台 29001）—— 那不應該是最先被互聯網看見的東西 |
  | | `apps`（app-host）與 `db` |

  **為甚麼是 outbound tunnel 而不是 port forward**：連接器主動連去 Cloudflare，主機不開任何入站端口、不需要固定 IP、不需要在路由器打洞。六個容器端口一個都沒改，仍然只綁 `127.0.0.1`，`scripts/config-guard.test.ts` 那條仍然綠。

  **為甚麼連接器在主機、不在 compose（這一條推翻了本決策的初稿）**：初稿寫成 compose 加一個 `tunnel` 服務（profile `tunnel`，憑證放 `.data/cloudflared`，配 `scripts/tunnel.mjs` 建 tunnel）。落地時走的是另一條路：**Cloudflare 後台建 tunnel（dashboard-managed）＋ 本機 `cloudflared service install <TOKEN>`**。後者更好，理由三條：

  1. **ingress 規則存在 Cloudflare 雲端，本機只有一個 token。** 沒有 `config.yml` 要跟 repo 同步，也沒有「repo 寫的規則與後台改的規則不一致」這個坑。
  2. **它指去 4210，也就是已經只綁 loopback 的入口。** 放在 compose 網路內雖然可以直連 `gateway-internal:80`，但要為容器多養一份設定，換來的只是省一次 loopback 跳轉。
  3. **它是全機共用的一個服務，不屬於這套 app。** launchd 開機就起，不依賴 Docker Desktop 是否已經起好。

  代價（已寫進 HANDOFF §2.5）：換機要重做三步；不能 `npm run tunnel:down` 收起，要用 dashboard 停或 `launchctl bootout`。**初稿的 `scripts/tunnel.mjs`、compose 的 `tunnel` 服務與四條 `tunnel:*` npm script 已全部撤回** —— 它們要靠 `cloudflared tunnel login` 產生的 `cert.pem`，而 dashboard-managed tunnel 根本不用那個檔；兩套並存等於又製造「兩份真相」。

  **`COOKIE_SECURE` 維持 `false`**：同一套 stack 同時要服務 `http://127.0.0.1:4210` 與 `https://hxd.subtle-inno.com`，設 `true` 會令本機 http 登入失效。代價是對外那個 cookie 沒有 Secure 旗標 —— 而 Cloudflare 現時**未開 Always Use HTTPS**（實測 `http://` 仍然回 200 不跳轉），即明文 http 一樣送得出這個 cookie。**這條要在正式對外之前修好**（開 Always Use HTTPS；到時只留 https 入口，`COOKIE_SECURE` 就可以開）。

  **2026-11-11 補記：Always Use HTTPS 已開**（Cloudflare → SSL/TLS → Edge Certificates → Always Use HTTPS = On）。實測 `http://hxd.subtle-inno.com` 與 `http://subtle-inno.com` 均回 `301 Moved Permanently`，明文的門已封；這是全 zone 設定，`subtle-inno.com` 底下其他子域名同樣只走 https。**`COOKIE_SECURE` 仍然 `false`**，理由是同一套 stack 要服務本機 `http://127.0.0.1:4210`；等不再需要本機 http 入口（或改用本機 https）才開。剩下未做的兩件：換掉 demo 密碼、加 Access 政策。

  **保安級別如實講**：現在唯一閘門是 app 自己的登入頁，密碼是 demo 密碼 `Frame-needs-2026!`。這是「開發期可接受」，不是「可以開始用」。正式管理公司資料之前必須做三件：(1) 換掉 demo 密碼；(2) Cloudflare 開 Always Use HTTPS（**2026-11-11 已完成**）；(3) 加 Access 政策（只准指定 email 過得去）。

  **來源 IP 的實測結果**：nginx 日誌的 `remote_addr` 是 `172.20.0.1`（docker bridge gateway），但 `X-Forwarded-For` 帶有真實訪客 IP（實測見到 `218.190.15.227`），所以審計查得到人。登入限流 `password-throttle` 是按 **user id** 而不是按 IP，所以不會出現「一人試錯、全公司被鎖」。到要做按 IP 封鎖那天，才需要令 nginx 讀 `CF-Connecting-IP`。

- C90 **取消「Demo stack」這套並行環境，改為同一套 stack 經主機上的 Cloudflare Tunnel 對外。**（修訂 C52）

  C52 定過一個獨立的 `company-os-demo` project：零主機端口、named volume、獨立 bucket、獨立 secret，只經 cloudflared 對外，給 browser-use AI 做 UI／UX 測試。**這套從未部署過。** 2026-11-11 清 Docker 時它連同另外兩套一併刪掉，而它的 8 個檔案（`docker-compose.demo.yml`、`.local.yml`、`.env.demo.example`、`scripts/demo-stack*.{mjs,ts}`、兩份文件）在 repo 內孤立存在，沒有任何東西 import 它們。

  殺掉的理由不是「檔案多」，而是它與 C89 講相反的話：C52 明文寫「**正式 stack 仍然只經內網 `gateway-internal`**」，而 C89 讓這一套對外。兩份契約並存的話，下一個 agent 一定會挑錯那份。

  更根本的理由：**Demo stack 的前提是「測試一套假的、用真的那套」。** 但現在要測的恰恰是「真的那套經隧道之後長什麼樣」—— 假的環境測不到 DNS、測不到 HTTPS、測不到 cookie 在 https 下的行為。而維護兩套的代價已經用事實證明：它存在四天，部署次數 0。

  執行：兩份文件 `git mv` 入 `docs/archive/`（附上被誰取代）；`docker-compose.demo*.yml`、`.env.demo.example`、`scripts/demo-stack*` 直接刪除 —— 留著就可 `docker compose -f docker-compose.demo.yml up` 復活一套叫 `company-os-demo` 的舊 stack，正是昨日清掉的東西。`package.json` 的 `demo:check` 一併移除，`.gitignore` 的 `!.env.demo.example` 例外一併清掉。

  仍然有效的原則（不因 Demo stack 消失而失效）：**對外只經一條隧道、只指向 `gateway-internal`、不開其他入口。** 這三條現在寫在 C89、`README.md` 的「對外存取」與 `docs/product/HANDOFF.md` §2.5。

### 2026-11-11 晚增補：文件不許過時、CI 不許偶發紅

來源：老闆 2026-11-11「規矩不是我寫的，規矩由我定斷，請將所有有問題的東西 fix 晒佢」。

背景是上一輪我報告「HANDOFF 未更新，但規矩係冇 issue 唔改 `docs/`，要更新就開一張 issue 我做」。老闆的回應指出問題的本質：**那條規矩不是他定的，是他收貨時看到的一份文件。** 一條令「明知寫錯卻不能改」的規矩，比沒有規矩更貴。

- C93 **文件與程式碼不一致時，改文件，不要等 issue。**（修訂 AGENTS.md 開工規則 8）

  原文：「`docs/` 與各 app 的 `DESIGN.md` 只在 issue 指定時才改。」

  問題：`HANDOFF.md` 當時同時寫著六件已經不成立的事 —— 「登入後仍然全部去 `#/`」、「帳戶頁未做」、「員工帳戶現時不存在」、「`modulePages` 一律傳空」、「資料表只有 0011」、「介面唯一真相是 frame PNG」。每一件都是這一天之內被改掉的，而規矩令它們只能繼續留在紙上。下一個 session 讀到的是這一份，不是程式碼。

  新規則：**`docs/` 與各 app 的 `DESIGN.md` 與程式碼不一致時，以程式碼為真相，即刻改文件。** 純粹「想新增一份文件」才要 issue。`AGENTS.md` 仍然可以改，但改動要記在這裡（C86 不變）。

  同時把「不要等老闆的 UI 設計稿才開工」寫進 HANDOFF §7：先做成可以在 Docker 裡真的用，老闆用完直接提意見。

- C94 **測試的單進程是配置，不是口訣。**

  `HANDOFF` §6 第 1 條一直寫「測試要加 `--no-file-parallelism`」，但 CI 跑的是 `npm test`，它不會讀 §6。結果 PR #25 第一次跑 CI 紅在 `setup-form.test.tsx`（1 failed / 1660 passed），同一個 commit 原封重跑全綠。

  會偶發紅的閘門，久了就被當成 flake；那時真正的紅燈也會被「重跑一次」蓋掉。所以 `fileParallelism: false` 寫進 `vitest.config.ts`，不再靠人記得。代價是 CI 慢一點，換來的是紅燈一定有原因。

### 2026-11-11 晚增補：停用一定要有恢復

來源：老闆「停用之後當然需要恢復的路，請照去做」。

- C95 **停用與恢復是一對，缺一邊就是壞產品。**

  停用（#24）上線之後是單程：按錯人、同事放假回來、離職同事回巢，老闆只能另開一個新帳戶。舊 email 一直被佔住，同一個人的 `app_grant` 授權歷史也接不回同一個身份 —— 為了解決「舊 cookie 仍然有效」這個小風險，製造一個長期的資料問題。

  實作邊界（寫在 `staff/store.ts` 的 `enableStaffAccount` 之上）：

  1. 恢復只恢復「可以用原本的密碼登入」。**不改密碼、不動 `must_change_password`、不開 session。** 停用期間被重設過密碼的人，恢復之後照樣要改密碼。
  2. **不撤銷 session**：停用那一刻已經全部撤銷，停用期間也簽發不到。審計再寫一句「已撤銷」就是假話。
  3. 審計寫 `staff.enable`，`detail.wasDisabledSince` 記低停用起點，日後可以與對應的 `staff.disable` 對得上。
  4. 前端（`MembersScreen`）：停用的那一行**只保留「恢復」**，停用與重設都收起。成功提示不可以只講「已恢復」—— 他未指派部門、或者部門 app 未開放的話，登入一樣見不到任何畫面，這兩句要一併講。

  實作時才發現的洞：`actionError` 原本只在面板（停用／重設）裡面渲染，而恢復沒有面板，所以「後端說本來就沒有停用」這種失敗會**完全沒有畫面**（200 以外什麼都看不到）。已在成員格補一個「面板沒有開時才用」的錯誤位；恢復失敗現在看得到。


### 2026-11-11 夜：品牌模組的五頁、版本、策略與權限

來源：老闆定下十條界線，要求「先對稿，改 issue，唔准在程式裡自己揀一邊」，並認可「現行版本用算的」。八張 issue（#32 至 #39）已按這幾條改寫；程式未動。（2026-11-11 深夜補第九張 #41 自定義頁，見 C100。）

- C96 **品牌模組只有五頁；版本住在各頁，不另開一頁。**

  五頁固定：品牌主頁、標誌、色彩、字體、語氣（鍵 `home`、`logo`、`color`、`type`、`tone`）。自定義頁另計，走 `#/design/brand/p/<slug>`，`slug` 與顯示名都不可以撞五頁。**自定義頁不是一張，是零到多張**（C101）。

  不設儀表板、渠道、版本頁。品牌清單只留在品牌切換，只有老闆能開新品牌。

  理由：版本另開一頁，同一個版本就有兩個入口，總有一邊會過時；渠道是成品的事，不是品牌的事。現況差距：程式現時仍有儀表板、渠道、版本，以及一個「品牌識別」章節 —— 識別不在五頁之內，也沒有一頁定義它，由 #32 一併移走，不要留空殼當第六頁。

- C97 **版本只加不改；現行用算的，不是一個旗標。**

  一個版本是整頁快照：內容、當時用的策略版本、當時的檔案。

  - 每次儲存就是一個新版本，不改舊版。
  - **現行＝該頁最新、未被刪除的版本**，每次查詢算出來。不存「邊個係現行」這個欄位，所以永遠不會有兩個現行，也不會有人刪完之後沒有現行。
  - 回滾＝「用這一版」：以舊內容另存一個新版本，成為現行。**歷史不改寫**，不是把指針撥回去。
  - 引用只有兩種：這個版本是不是某頁的現行；有沒有被已出街成品釘住。主頁讀的是各頁現行，不是釘住某個版本，所以不要建第三種「主頁引用」表 —— 那張表永遠是空的，然後「刪被引用的版本」這條驗收永遠測不到。
  - 刪除是軟刪除加審計；跨品牌的 id 一律當作不存在，不回「無權限」（那等於確認它存在）。
  - 已知取捨：回滾會多一版。換來的是不會有兩個現行。

- C98 **品牌頁的編輯權是品牌級權限，不是職位。**

  老闆改策略；有編輯權的人改頁；其他員工只讀 —— 只讀是**看得到、改不了**，不是看不到。

  授予在 Boss Portal 人員頁，逐個品牌；`role` 仍然是 `staff`。這是權限，不是新部門，不是新職位。

  畫面上不出現「品牌設計師」四個字，讀的人會當它是一個職位。寫「可以改這個品牌的頁」。

- C99 **策略本身有版本；頁版本釘住它。**

  六個槽（品牌主頁、標誌、色彩、字體、語氣、自定義頁通用）每次儲存是一個新版本，只加不改。

  頁版本記低當時用的策略版本，所以改策略不會靜靜改寫已做好的頁，也不會改寫已出街成品釘住的內容。不做這一步，「版本是整頁快照，包括當時的規則」就是假話。

- C100 **Loop Engineering 只覆蓋 2026-11-11 夜這一輪（#32 至 #39，另加 #41）。**

  次序：`#33 → #34 → #32 → #35 → #38 → #36 → #37 → #41 → #39`（理由見 `HANDOFF.md` §5）。色彩與字體排在標誌之前，因為標誌只可以引用她們的角色名與字體，倒過來做會先造一個滿是「缺」的標誌頁，之後又要返轉頭。

  #41 是後補的：原本八張只覆蓋五頁，自定義頁有位置（#32）有規則（#34 的通用槽）有版本（#33），卻沒有一張說它的內容由誰做、怎樣存 —— 加頁會加出一個永遠寫著「未完成」的位置。所以補一張，排在 #37 之後（它要引用色彩、字體、語氣），#39 之前（主頁要讀得到它）。

  這一輪的授權：CI 全綠、驗收齊、真瀏覽器走過，即自動 squash merge；撞到規格空白就停手寫低、跳下一張；不改產品規則、不開新 issue、不改 issue 正文。

  授權**不延伸到之後任何一輪**，同 2026-11-09 那一輪一樣。規則本體在 `AGENTS.md` 的〈Loop（無人值守）〉；`AGENTS.md` 這一節就是本條的落地（開工規則 8 要求的記錄）。

### 2026-11-12 凌晨：自定義頁是「第六種頁」，不是第六頁

- C101 **自定義頁可以有零到多張，每張獨立。**

  老闆原話：「自定義的其實應該不只一頁，是隨品牌設計師的需要增加。」

  - 每張有自己的顯示名、自己的 `slug`、自己的 brief、自己的版本鏈。A 頁出新版不會動到 B 頁。
  - 建立時一次過要三樣：顯示名、`slug`、一句「這一頁要決定什麼」（brief）。缺一不可以建 —— 沒有 brief 的頁就是沒有方向，建了只會在主頁多一個永遠缺的入口。
  - **brief 屬於那一頁，不屬於策略。** 通用規則只在 `#34` 的「自定義頁通用」槽；某頁的 brief 抄進通用槽，之後每一張頁都會被同一份 brief 污染。
  - 衝突時通用槽贏。真的撞上（brief 要求一件通用槽禁止的事）就停手講明哪兩句撞，不要自己選一邊。
  - 顯示名可以改；**`slug` 建立後不可改**（改了等於另一張頁，舊連結斷，畫面多一條死路）。要搬就新建再刪舊。
  - 刪一張＝軟刪除該頁與它的全部版本，寫審計；任何版本被已出街成品釘住就拒絕並講明釘在哪。
  - 左側次序＝建立次序，不按最後修改時間排（否則改完一頁它會跳位，人會以為按錯）。

  理由：設計師的需要不是固定的。把自定義頁做成一張，等於逼他之後把三件事塞進同一頁；而共用一條版本鏈，會令 A 頁的改動看起來像改了 B 頁。

### 2026-11-12 凌晨：策略是一份、六個槽

- C102 **品牌頁策略是公司一份，六個槽；只加不改；每一版頁記住它當時用的策略版本。**

  issue #34 講「Boss Portal／策略／品牌頁策略」，六個槽的全文它自己寫齊。實作時要釘死四件事，否則兩個人都覺得自己照 issue 做，做出兩套：

  - **一份，不是逐品牌一份。** 策略講的是「這一類頁要怎樣做」——同一類專業標準不會因為換品牌而變成另一套；品牌之間的分別住在各品牌自己的頁（色彩、字體、語氣）。逐品牌一份，同一個標準要改 N 次，改漏一個品牌就出現兩套做法而沒有人知道。
    - 它放在公司範圍的 Boss Portal（`#/boss/policy/brand`），不是品牌模組：品牌模組的左側只放「這個品牌的頁」，而策略不是一頁（#32）。
    - 真有一日要每品牌一套，加一個 nullable `brand_id` 落槽表（null＝公司通用）就可以，不需要推翻。
  - **只加不改，連軟刪除都沒有。** 品牌頁版本可以軟刪除舊版（#33），策略不行：一個已出街的成品可能引用某一版策略，那一版要永遠讀得返。資料庫兩條 trigger 擋 UPDATE 同 DELETE；API 沒有 PUT／PATCH／DELETE。要改就另存一版。
  - **版號逐槽計。** 改標誌槽不會令色彩槽多一版 —— 兩件事無關，共用一條版號會令「色彩改了第 5 版」出現而色彩一個字都冇改過。
  - **每一版頁記住當時用的策略版本**（`brand_page_version.policy_version_id`）。所以老闆改了策略，已經做好的頁不會被靜靜重寫；畫面上寫得出「這一版是照第 2 版策略做的」。`null`＝未記錄（策略功能之前的版本），畫面講「未記錄」，不假設第 1 版。用回舊版時，策略引用照抄來源那一版 —— 內容來自那一版，就不應該同時聲稱自己用的是今天的標準。

  **第一版全文寫在 migration（0014），不是程式裡的常數。** 策略正文只有一個住處：資料庫。程式再放一份，兩份總有一份會過時，而畫面上看不出哪一份才是真的。之後所有改動經介面另存新版，不會回頭改那個檔。

  **誰可以改**：只有老闆（`requireOwner`）。讀取是任何登入者 —— 擋在讀取只會令日後 agent 與員工 lookup 時得到一個看不出原因的 403。員工在畫面上開不到這一頁（Boss Portal 本身是老闆專用），但那是外殼的結果，不是策略的規則。


### 2026-11-12 凌晨：品牌編輯權掛在品牌上，不是職位

- C103 **「可以改這個品牌的頁」是 (品牌, 人) 一對的授權；不是職位、不是部門、不改 `role`。**

  issue #32 第 11 點要求老闆可以在人員頁把某個員工設為「可以改這個品牌的頁」。這一句很容易被實作成第三種角色，所以釘死：

  - 授權表是 `brand_editor (brand_id, user_id)`，一個人可以有兩三個品牌、一個品牌可以幾個人。加了幾張自定義頁都一樣涵蓋 —— 授權掛在品牌，不是逐頁。
  - `role` 仍然是 `staff`。多開一個 `brand_designer` 角色會令之後每一個權限判斷都要多問一次「這個 role 算不算可以」，而答案會隨時間漂移。
  - **老闆不寫進這張表。** 他永遠可以改；寫進來只會出現「老闆被移除了編輯權」這種講不通的狀態。所以畫面只講「你永遠可以改，所以你不在名單裡」。
  - 寫入路徑的守衛由 `requireOwner` 改成 `requireUser` + handler 內 `canEditBrand()`：`canEditBrand` 要讀品牌 id，而那只有 handler 內才拿到；preHandler 拿不到。
  - **前端不決定可不可以做**：`GET /brands/:id/pages` 回一個 `canEdit` 給畫面決定顯示什麼，但每一條寫入後端都自己再問一次。只把按鈕變灰，等於用畫面假裝安全。
  - 畫面上不用「品牌設計師」四個字：讀的人會當它是一個職位，然後問為甚麼 HR 沒有這個職位。

  理由：能改哪個品牌是工作分配，不是身份。同一個人今天做 Moonic、下個月做另一個品牌，改的是分配，不應該要改他的帳戶。

### 2026-11-12 凌晨：品牌模組的導覽由後端頁清單推出來

- C104 **品牌模組左側那一組頁，是後端回的清單；自定義頁的網址是 `p/<slug>`，與五頁分開。**

  issue #32 要求「左側看到起步五頁，以及已加的自定義頁，次序是建立次序」。這一條如果做成前端硬編碼五頁 + 另外畫一段自定義頁，就會出現兩個「這個品牌有哪幾頁」的答案。

  - `GET /brands/:id/pages` 回的那一份清單是唯一來源，`withBrandPages()` 把品牌模組整組頁換走（連五頁的名都由資料庫來）。加一張頁，左側、頁籤、麵包屑同時出現，不需要前端改一行。
  - **次序不重排**：後端按 `sort_order`（固定頁 10–50，自定義頁由 60 起遞增）回。按最後修改時間排會令改完一頁就跳位；按字母排會令「包裝／攝影／命名」變成「命名／包裝／攝影」。
  - 自定義頁的導覽鍵是 `p/<slug>`，網址 `#/design/brand/p/<slug>`；五頁是 `#/design/brand/<鍵>`。兩者永遠不撞 —— 就算有人把頁改名做 `logo`，技術上也撞不入。`resolveNav` 因此要先把網址段落拼返做一段才比對頁鍵。
  - 五個固定鍵 (`home`／`logo`／`color`／`type`／`tone`) 不可以改名：鍵是網址的一部分。自定義頁不可以用這五個鍵（資料庫有 check，程式先講得清楚）。
  - 移走的三頁各有原因：儀表板與渠道沒有一頁定義它們；版本住在各頁自己裡面（#33）；「品牌識別」不在五頁之內，留一個空殼當第六頁只會令人以為它存在。
  - 品牌清單不再是頁：它住在頂欄的品牌切換。一個品牌都未有時，品牌模組講明「還沒有品牌，只有老闆可以開第一個」，不是白畫面。

  理由：頁會一直加。任何「前端要知道有哪幾頁」的寫法，都要在加頁那一日改一次前端；而漏改的那一次，用戶見到的是「加完之後不見了」。

- C105 **色彩頁存的是「有角色的表」，不是自由文字；角色名寫死在程式裡，色值只住在這一頁。**

  issue #35 的驗收是「看到的是有角色的色，不是一排沒有名字的色塊」與「缺的角色標成缺」。這兩句在自由文字裡無法成立：一整段文字裡沒有「哪個角色有值」這件事，畫面只能把文字印出來。

  - 角色名是程式常數（`apps/web/src/design/brandColors.ts` 的 `COLOR_ROLES`），九個：`brand.primary`、`brand.secondary`、`ink`、`paper`、`muted`、`surface`、`success`、`warning`、`danger`，分品牌色／閱讀色／功能色三組。**不可以用戶新增角色**：標誌頁與字體頁引用的是名字，名字一浮動，兩邊都覺得自己跟足規則，但接不上。
  - 淺色與深色**共用同一批名字**，各一套值。不發明 `light.ink` —— 標誌頁寫 `ink` 的時候不會知道指哪一個。`surface` 只在深色要求，所以淺色模式不標它「缺」，標「深色用」。
  - 缺就是缺：角色未有 HEX 就標「缺」，不填近似色。**留白不擋儲存** —— 擋住只會令人亂填一個色交差，那正是策略禁止的事。只有「一個色都未填」才不讓儲存（那等於空版本）。
  - 色值只住在「色彩」頁的版本內容（#33 的版本鏈），內容是一段 JSON。其他頁只准寫角色名，不准另存色值。
  - RGB 由 HEX 算，不另存；CMYK 由人填（印刷）。准用／不准組合即時算 WCAG 對比（內文 4.5:1、大字 3:1），**算出來給人看，不用來擋儲存** —— 低於標準是事實，要不要還是一個設計決定。
  - 功能色不可進標誌：不只是畫面不畫那個勾，讀入時也把功能色由 `logoRoles` 剔除（`parseColorDoc`）。
  - 現行內容不是這份 JSON（例如 #33 年代留下的自由文字）就講「讀不到當中的角色」，**不畫九行假的「缺」**。有編輯權的人可以用一個鍵重設成一張空表。
  - 這一頁不出現標誌的安全範圍、最小尺寸、何時用哪個 mark —— 那些屬 #36。

  理由：角色是**跨頁的契約**。契約寫在程式裡可以由測試守住（`apps/web/test/brand-colors.test.ts`），寫在自由文字裡只會隨下一次打字漂移。

- C106 **字體頁是「層級 × 家族」的約束表；缺授權或缺中文就是缺，不用系統字頂上。**

  issue #38 的驗收是「看到的是有角色的層級，不是只有一個字體名稱」與「缺授權或缺中文，標成缺，沒有用系統字充數」。

  - 四個層級（`display`／`heading`／`body`／`caption`）與兩個腳本（`latin`／`chinese`）寫死在 `apps/web/src/design/brandType.ts`；其他頁（#36 的字標）引用的是這幾個名字。
  - 一套品牌**最多兩個家族**（策略原文）。畫面在第二個之後不再出現「新增家族」，讀入時第三個直接丟掉 —— 不是變灰，是不存在。
  - 一個家族可用要三樣齊：有名、有授權、有可嵌入的檔（`familyUsable`）。任何一樣缺，它與**引用它的層級**一併標缺。缺中文或缺英文時，畫面明講「不會用系統預設字充當品牌字」，也不拿備用字頂上。
  - 尺寸一定要帶單位（`px`／`rem`／`pt`）。只寫 `18` 當場講、當場標缺：它不是 18 像素。行距可以是倍數（`1.5`）或帶單位（`26px`、`120%`）。
  - 文字顏色**只揀色彩頁的角色名**（`COLOR_ROLES`，主要是 `ink` 與 `muted`）。這一頁沒有色值欄位 —— 不發明色，也不留第二個放色的地方。
  - 留白同樣不擋儲存，只有「一個層級都未填」才不讓存。現行內容不是這份 JSON（舊的自由文字）就講讀不到，不畫四行假層級。
  - 標誌的最小尺寸與安全範圍不在這一頁（#36），字標也不在這裡重畫。

  理由：與 C105 同一個 —— 跨頁要引用的是**名字與數值**，寫在自由文字裡，下一個引用的頁面就只能靠猜。

- C107 **標誌頁是「資產 + 用法」的系統表；色值只引用色彩頁的角色，尺寸只在這頁定，字族只引用字體頁。**

  issue #36 的驗收是「看到的是這個品牌的標誌系統，不是空導覽」、「缺的地方標成缺，沒有假標誌」、「改一段之後重新載入仍然是改過的」。這三句在一個上載按鈕上無法成立。

  - 資產只分**五類**（`ASSET_KINDS`：`logo`／`wordmark`／`mark`／`monogram`／`appicon`），App icon 與 favicon 合起來一類，所以是五不是六。**同一類不可以有第二個**：多出來的在讀入時丟掉，加滿之後「新增資產」不是變灰，是不出現。
  - 主檔一定要向量（`svg`／`ai`／`eps`／`pdf`），位圖只作預覽。主檔填了但不是向量就標「主檔要向量」，不會同時說「未填」。
  - 四種顏色模式寫死（`LOGO_MODES`）：`brand` → `brand.primary`、`mono` → `ink`、`reverse` → `paper`、`onDark` → 深色那套的 `surface`。**這一頁沒有色值欄位**（連 `input type=color` 都沒有）；色彩頁未定那個角色就標「缺（色彩頁未定 X）」，不填近似色。深底取深色那套，不是淺色同名角色 —— 那是「把標誌放在深色底上」，不是主題切換。
  - 最小尺寸**分模式、分螢幕與印刷**：螢幕一定要 `px`、印刷一定要 `mm`，`24` 與 `24mm` 都不算 px。空白是「未填」（上面那句摘要已講），只有填了而單位錯才當場紅字 —— 四行一齊紅只會令人學到「紅色等於未填」。
  - 安全範圍 X、方向與組合、背景、何時用、怎樣用、錯誤用法逐項填；錯誤用法是逐條清單，不是一段文字。
  - 字標用的家族只是**引用**字體頁的家族 id（下拉），這一頁不定家族、不重畫字標。字體頁未有任何家族就講「未有可引用的家族」。
  - 留白不擋儲存；只有「一件資產都沒有、所有欄目都空」才不讓存（那等於空版本）。主標誌指去一個已經不存在的資產，當作未指定，不靜靜指去第一個。
  - 現行內容不是這份 JSON（舊的自由文字）就講「讀不到當中的資產」，**不畫五類假的「缺」**；有編輯權的人可以用一個鍵重設成空表。

  理由：標誌的專業判斷不在「哪個圖好看」，而在「哪一件、在甚麼底上、最小幾大、不准怎樣用」。這四件事全部是可引用的名字與數值，寫成表才守得住（`apps/web/test/brand-logo.test.ts`），寫成一段文字就只會隨下一次打字漂移。

- C108 **語氣頁存的是「特質 × 場合」的句子表；只有形容詞沒有句子就是缺，中英並用要人答。**

  issue #37 的驗收是「看到特質和對照句子，不是三個形容詞」。策略原文再補一句：不准只有「專業、友善、創新」這類形容詞。

  - 結構寫死在 `apps/web/src/design/brandTone.ts`：三到五個特質（`MIN_TRAITS`／`MAX_TRAITS`），每個有名、做、做的句子、不做、不做的句子五格。**五格齊才算一個特質**；有名但句子缺，畫面標「只有形容詞（未附句子）」，並在缺的摘要裡列出是哪幾個。
  - 情境固定五個（`SITUATION_KEYS`：說明、邀請、拒絕、致歉、出問題），每個要一句**真的會講出口**的話。同一把聲音、五個場合 —— 不是五套語氣。
  - 繁中與英文是否並用是三選一（`BILINGUAL_MODES`：只用繁中／繁中為主夾專有名詞／中英並用），**未答就是缺**，不由系統代答一個預設。
  - 禁用詞是逐條清單。一個都沒有就是缺。
  - 留白不擋儲存；只有「一個特質都未寫、所有欄目都空」才不讓存。現行內容不是這份 JSON（舊的自由文字）就講讀不到，**不畫三個假特質**。
  - 這一頁**沒有任何跨頁引用**：沒有色值、沒有家族、沒有標誌資產。它也不寫渠道尺寸與頁數 —— 語氣是講法，不是版面。
  - 版本預覽抽特質名（`traitNamesInText`）。預覽只有 160 字元，特質名寫在 JSON 最前面，所以抽得到頭一兩個；抽不到就講抽不到。

  理由：與 C105／C106／C107 同一條線 —— 「這個品牌怎樣說話」是可引用的句子，不是可以感覺的氣氛。寫成表，才能在下一次有人寫文案時指得出「這句犯了哪一條」。

- C109 **自定義頁是「第六種頁」，不是第六頁：零到多張，每張只寫自己；四樣來源缺就標缺，brief 與通用槽相撞就停手。**

  issue #41 的驗收是「同一個品牌加三張自定義頁，三張打開是三份不同的內容，不是同一份換了標題」、「brief 留得太空就講未寫這一頁要決定什麼」、「brief 要求通用槽禁止的事就停手並講明是哪兩句撞」。這三句要求的是「一張頁有自己的來源」，不是「一份範本有六個空位」。

  - **零到多張**（C101）：這一頁寫的是「任何一張自定義頁」的規則，不是某一張的內容 —— 包裝的盒型、攝影的打燈都是那一頁自己的事。結構寫死在 `apps/web/src/design/brandCustom.ts`，六欄（`CUSTOM_SECTIONS`：決定什麼／不准決定什麼／規則／例子／錯誤例子／引用哪些角色）。brief 住在 `brand_page.brief`，內容住在版本鏈的 JSON，不另開一張表。
  - **brief 要夠具體才算數**：少於 `BRIEF_MIN_CHARS`（10）個字就當「只寫了名詞」（可以寫得很空泛）。空與太短分開講：空是「未寫這一頁要決定什麼」，太短會把 brief 原文引出來講「一句講得出這一頁要決定什麼」。兩種情況都**不自己編一個方向**。
  - **brief 與通用槽相撞就停手**：只用「發明／自創／自己定／重新設計……＋色／顏色／字體／標誌／logo」與「渠道尺寸／頁數」這兩組講法去認（`INVENT_ASSET_PATTERN`／`CHANNEL_SCOPE_PATTERN`），認到就引通用槽裡明寫「不准發明」的那一句出來對質，通用槽贏。**只看 brief，不看頁面內容** —— 頁面的「不准決定什麼」本來就會寫「不發明新標誌」，那是守規則。通用槽讀不到就講讀不到，不假裝相撞、也不靜靜放行。
  - **引用只認名字**：色彩角色與文字層級都是 checkbox，值住在色彩頁與字體頁。打錯的名字讀入時**丟掉**（`knownRoles` 只留 `COLOR_ROLES` 與 `TYPE_ROLES` 有的），不留一個永遠缺的引用。色彩頁只有 CMYK 沒有 HEX 也算缺 —— 螢幕上沒有那個色。
  - **禁用詞只查「例子」**：錯誤例子是故意示範錯的東西，拿它去查禁用詞就等於不准寫錯誤例子。中了就當場紅字講出是哪幾個字，不埋在長長的「未填」裡。
  - **「重編」不是叫 AI 作文，也不改內容**：按一下就是按現在的通用槽與四樣來源落一版（記住當時用的是哪一版策略），手寫的文字原封不動，舊版仍在；改了通用槽之後三張頁都不會自己變，要逐張按重編（issue #41 驗收）。它**不清走**「那一頁未有值」的引用 —— 缺不是失效，清走等於替設計師刪了他寫的一句「這一頁用品牌主色」；真正失效的名字（不在那一頁的詞彙表）在讀入時已經丟掉。原本寫成「重編會清走已失效的引用」，在真瀏覽器走查時見到 `typeRoles:["heading"]` 被無聲刪走，所以改。
  - 留白不擋儲存；只有「六欄全空」才不讓存（空版本沒有內容）。現行內容不是這份 JSON（舊的自由文字）就講讀不到，並給「重新開始一張表」，不畫六個假的「缺」。
  - 中文字詞（認 brief 用的正則、找通用槽那一句用的字）住在 `packages/i18n/src/zh-words.ts`：`tools/i18n-guard` 會掃 `apps/web/src` 之內任何中文（連正則都當字串咬），而 i18n 是唯一允許有中文的地方。**不開守門例外** —— 例外一開，就再也分不出「這是詞庫」還是「這是我懶得抽字串」。

  理由：與 C105／C106／C107／C108 同一條線 —— 一頁的專業標準要能被**引用**（名字、句子、數值），寫成一段自由文字就只會隨下一次打字漂移。而自定義頁多一層：它連「要決定什麼」都不是系統可以代答的，所以 brief 是它的來源，缺就標缺。

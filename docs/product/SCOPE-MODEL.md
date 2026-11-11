> **收入 repo 的來源**：原檔 `.workbuddy/design/SCOPE-MODEL.md`（2026-11-09，長期 gitignored，repo 內從來看不到）。2026-11-11 收入 `docs/product/`，內文不改，只換檔名與交叉引用。
>
> **讀之前要知道**：第 1–9 節（公司／品牌、三種 app 模式、Context 管寫 vs Lens 管讀）係現行設計依據，同 `WORKSPACE-APP-SCOPE-DESIGN.md` 一齊讀。第 10、12–16 節係外殼 v3 → v1.3 的演變紀錄，當中「第二層頂欄」「底座管理」等講法**已被 C70–C76 取代**（現行外殼係四層：app selector → 模組 → 頁 → 章節；公司型 app 已正名 Boss Portal）。第 17 節係交付紀錄。

# company-os 範圍模型（UI 設計依據）

日期：2026-11-09
來源：Billy 對話 + `docs/product/WORKSPACE-APP-SCOPE-DESIGN.md`、`MASTER-PLAN.md` §3.4／§236、`DECISIONS.md` C41–C51、六份 `apps/*/manifest.json`

---

## 1. 一間公司 ＝ 一部機器 ＝ 一個 Docker 安裝

- 公司係固定邊界，**唔係可切換嘅 scope**。左下角固定顯示一間公司名；頂欄唔設公司切換器。
- 多國／多公司 ＝ 多部機，各有老闆、員工、品牌、DB、MinIO，**冇跨機連線**（`MASTER-PLAN.md` §236）。而家老闆睇兩邊要登入兩次。
- 未來「一次登入多台機」屬帳戶／入口層嘅新決定，唔係本機 scope 切換。未定之前唔畫假入口、唔放撳落去冇反應嘅掣。

## 2. 公司／品牌／Workspace

- 一間公司可有多個品牌，每個品牌對應一個品牌 Workspace（C41、WORKSPACE §2）。
- 公司共用事務直接屬於公司，**唔虛構「公司 Workspace」或「公司品牌」**。
- App 係公司工具；Workspace 係品牌工作上下文。選品牌唔複製 app、員工身份或公司共用設定。
- 品牌型部門（設計等）每品牌有自己嘅團隊／工作範圍；財務、人事喺公司層。

## 3. 三種 app 模式（C42）

| 模式 | 工作入口 | 頂欄範圍控件 |
|---|---|---|
| 公司型 | 只提供公司範圍 | 普通資訊標示「公司範圍」，**唔做失效下拉** |
| 品牌型 | 必須指定品牌 | 「品牌 · 名稱」selector |
| 混合型 | 公司或指定品牌 | 明確二選一 |

模式定義入口同切換行為，**唔決定資料歸屬或授權**。

## 4. 四條紅線（畫 UI 唔可以踩）

1. **公司範圍 ≠ 所有品牌資料集合**。跨品牌查閱／彙總係另一份契約，唔可以用 brand filter 冒充。
2. **公司型 app 唔提供品牌切換**（WORKSPACE §4、§7）。
3. **「未選品牌」唔等於公司範圍**；Brand selector 唔設「全部品牌」。「所有可存取品牌」係額外查閱能力，唔係公司範圍別名。
4. **切換範圍唔改資料歸屬、繼承政策或授權**（C42／C46）。Security level 屬 grant 層，同 scope 層要分開顯示。

## 5. 安全等級（現有 manifest，唯一來源）

| App | 範圍提議 | sensitive |
|---|---|---|
| 老闆台 boss | 公司型 | true（只限老闆） |
| 設計／內容／網站 design | 品牌型 | false |
| 銷售 sales | 品牌型 | false |
| 營運與財務 ops_finance | 公司型 | true（需老闆批准） |
| 人事 hr | 公司型 | true（需老闆批准） |
| 客服與 CRM support | 品牌型 | false |

六個 app 全部 `available: false`，app-host 零 API、零頁。敏感 app 授權只准老闆批准。

## 6. 後端尚未支援（唔可以畫成已駁好）

- manifest 只接受九個既有欄位，**冇「模式」欄位**；三模式宣告來源未定（WORKSPACE §11.3、C45／C50）。
- 品牌身份接合、工作上下文契約、合法範圍解析未定；**C47 把員工品牌選擇器列為阻塞**。
- `GET /org-units` 係 `requireOwner`，唔可以為員工 selector 放寬。
- 因此畫面嘅「品牌 A／B／C」、公司型／品牌型分類都係**明確原型資料**，唔係正式 registry 或 API 回應。

## 7. v2 設計稿決定

畫布：`company-os App UI v2`（Ardot fileId `745493588675335`）

- **「員工與 Agent」＝公司型狀態**：頂欄 App selector「底座管理」＋純文字「公司範圍」，無品牌下拉。
- **「我的 Apps」＝混合型狀態**：頂欄 App selector ＋「品牌 A」selector ＋「改用公司範圍」；表格列出六個 app 嘅模式、品牌、安全等級、我的存取、狀態。
- 兩頁左下角固定「本機公司／滿月堂集團／香港 · 一機一公司」。
- 頂欄 selector 答「用乜工具」，範圍控件答「喺邊個工作上下文」；兩者都唔係授權證據。

## 8. Billy 已拍板（2026-11-09）

1. **公司型 app 接受冇品牌下拉** ✓ — 顶栏只做普通資訊標示「公司範圍」，唔做失效下拉。
2. **左側 nav 隨 app 切換** ✓ — 底座八頁收做 App selector 入面一個「底座管理」入口，唔再同部門 app 選單並存。
3. **三種視圖都要** ✓ — 有時睇全公司、有時睇單一品牌、有時睇部門財務。處理方法見第 9 節（拆兩層，唔塞入同一個 selector）。
4. **跨機要深入思考** ✓ — 另開 `MULTI-MACHINE-ACCESS.md`，本機 UI 唔加公司切換器。

## 9. 三種視圖：工作上下文（管寫）vs 查閱維度（管讀）

第 3 點唔可以用「加多一個『全部品牌』選項」解決 — 會直接踩 C42「公司範圍 ≠ 全部品牌加總」同 C46「模式唔改授權／歸屬」。正確拆法：

| 層 | 控件位置 | 答嘅問題 | 會唔會改授權／歸屬 |
|---|---|---|---|
| **工作上下文 Context** | 頂欄（App selector 右邊） | 我而家喺邊個工作上下文？寫入落邊？ | 唔會；由 app 模式＋合法範圍解析決定，切換要重驗 |
| **查閱維度 Query lens** | 內容區工具列 | 呢份資料用乜維度切片去讀？ | 唔會；只讀，切換重新向後端查詢 |

三種 lens：

| Lens | 資料來源 | 額外能力／限制 |
|---|---|---|
| 全公司 | 公司層帳目 ＋ 跨品牌彙總 | 跨品牌彙總係**獨立契約／獨立授權**，唔係「公司範圍」別名；畫面要標「只讀」 |
| 品牌 | 單一品牌 Workspace | 須有該品牌 grant；Brand selector 唔設「全部品牌」 |
| 部門 | 依 org_unit 維度分攤 | 屬第四個維度（部門），唔係品牌；敏感 app 要老闆批准 |

一句：**Context 管寫，Lens 管讀**。喺 Brand context 底下可以開「全公司彙總」只讀 view，但寫入仍然落 Brand A；反之喺 Company context 睇品牌 A 報表，唔代表可以去寫品牌 A（WORKSPACE §3／§7）。
財務頁實作：頂欄固定「公司範圍」（公司型），內容區先有「全公司／品牌／部門」segmented control；維度狀態列標明資料來源、只讀、寫入目標。

> 落地前仍須補：跨品牌彙總契約、部門維度授權、合法範圍解析（WORKSPACE §11.2 六項交付）。畫面上嘅品牌 A／B、金額、人員名全部係**明確原型示意值**，唔係 API 回應。

## 10. 外殼 v3（2026-11-09 重畫，跟 Billy 提供嘅截圖 look）

畫布：`company-os App UI v2`（Ardot fileId `745493588675335`），舊 dense 版兩頁已刪。

| 頁 | 狀態 | 展示重點 |
|---|---|---|
| 01 Design app | 品牌型・Workspace 下拉展開 | 跟足截圖：hamburger／App selector／Workspace selector／app 主選單（品牌・知識・素材・創作）／右側工具／Super Admin；補上截圖缺嘅 App selector；極淺灰工作欄、大量留白、誠實空狀態卡 |
| 02 App selector 展開 | 同一殼第二狀態 | 六個部門 app（品牌型／公司型＋敏感標記）＋「底座管理」一個入口 |
| 03 營運與財務 | 公司型 | 頂欄無品牌下拉；內容區三種查閱維度；維度狀態列；表格同時見到公司層／品牌／部門三種來源 |
| 04 底座管理 | 公司型 | 左欄換成底座八頁，對照 01／03 證明 nav 隨 app 切換；真實表格＋詳情面板 |

視覺：白底、幼 1px 線、極淺灰 #F7F7F8 卡、克制 6–12px 圓角、黑底白字選中 pill、`#B8F36B` 只作狀態點、無 emoji、無紫色漸層、無陰影（浮層除外）。
四張均經截圖檢查，`capture_layout(problemsOnly)` 對 03／04 回傳空（無溢出、無裁切）。
**已被第 12 節 v4 取代（2026-11-09 下午）**，舊四張（含財務頁、底座管理頁）已由畫布刪除。

## 11. 關聯底稿

- `BACKEND-FUNCTIONS-MAP.md` — 後端端點與頁面對照（規格放呢度，唔放入畫面）
- `MULTI-MACHINE-ACCESS.md` — 跨機身份／入口／授權分離，Stage 0/1/2 與紅線

## 12. 外殼 v4（2026-11-09 下午，Billy 新指示）

> 2026-11-11：品牌模組已定為五頁（品牌主頁／標誌／色彩／字體／語氣，C96），冇 Dashboard、品牌設定、渠道、版本紀錄。本節及第 13 至 16 節提到嘅品牌頁名係當時紀錄，**唔係現行規格**。

畫布同一份 `company-os App UI v2`（Ardot fileId `745493588675335`），舊四頁全刪，重畫五頁，**只談 Frame**。

### 12.1 五個決定

1. **字級／字距回推大一級**：舊版 12px 底太細、似縮細桌面圖。新 scale：UI 15px、小字 13–14px、頁標題 40px／行高 48、副標 17px／26、卡標題 22px／30、內文 16px／26；欄高 72／60，內容 padding 56／48，觸控目標 ≥ 40px。
2. **第二層頂欄**：第一層＝全域（hamburger／App selector／Brand selector／模組分頁／右側工具）；第二層＝目前模組嘅分頁，例如 Brand module 有「品牌主頁・Dashboard・品牌設定・標誌與識別・色彩・字體・渠道與策略・版本紀錄」。原本放喺左側欄嘅模組頁索引搬上第二層，左側固定欄取消，內容全闊。
3. **移除 lime yellow，改用 Behance 藍**：主色 `#0057FF`（Behance brand blue），柔和底 `#EAF0FF`，表面 `#F5F6FA`，線 `#E1E4E8`，字 `#191919`／`#6E6E6E`／`#A3A3A3`。已建立 `Frame Tokens` variable set。`#B8F36B` 全線停用。
4. **Workspace → Brand**：selector 直接寫「品牌 · Moonic 滿月堂」；下拉群組「品牌 BRANDS」，項目「新增品牌／品牌設定」，**唔設「全部品牌」**。只在 Design app 嘅品牌上下文用，唔係通用 workspace 概念。
5. **未討論嘅 app 唔畫**：Finance 三查閱維度頁、底座管理員工頁全部刪除。App selector 仍列出 manifest 六個 app（全部「未啟用」）＋一個「底座管理」入口，但**唔代表已設計任何一個 app 嘅畫面**。

### 12.2 交付順序（Billy 定）

**Frame → Boss portal → Design app（第一個要落實嘅部門 app）**。而家只做 Frame，用 Design app 做示例上下文，內容區保持誠實空狀態「呢頁仲未接內容」，冇假資料、冇假統計。

### 12.3 回應「唔 responsive」

- 全部橫向容器用 `fill_container` + 彈性空間，唔寫死右側座標；內容區隨闊度收 padding。
- 五頁：`01` 1440 預設、`02` App selector 展開、`03` Brand selector 展開、`04` 1024 筆電（收右側工具、收兩個模組頁、padding 32）、`05` 768 平板（四個模組分頁收成「模組 · 品牌 ▾」下拉、模組頁收成三個＋「→」捲動提示、搜尋欄收窄）。
- 左下角固定「本機公司／滿月堂集團／香港 · 一機一公司」改放頁尾固定列，唔再靠 250px 左欄。
- 浮層狀態把底層麵包屑／頁標題設 `opacity:0`（**唔用 `visible:false`**，後者會令 auto-layout 重排、內容卡跳位），避免大標題被切出一截爛字。

### 12.4 保留紅線

公司範圍 ≠ 全部品牌加總；公司型 app 無品牌下拉；Brand selector 無「全部品牌」；切換範圍唔改授權／歸屬；跨機仍係 `Tenant boundary`（見 `MULTI-MACHINE-ACCESS.md`），本機 UI 無公司切換器。

**已被第 13 節 v5 取代（2026-11-09 下午較晚）**，第 12 節嘅「無左側欄、外殼用藍」兩點作廢；字級、Brand 命名、兩層頂欄、交付順序仍有效。

## 13. 外殼 v5 ＋ 總部據點管理（2026-11-09 下午較晚，Billy 新指示）

同一畫布 `745493588675335`，舊五頁全刪重畫，並新增四頁跨機管理畫面，**只談 Frame 同平台底座，未設計任何部門 app 內容**。

### 13.1 四個外殼決定

1. **三層外殼只用黑／灰／白**：第一層頂欄、第二層頂欄、左側導覽（含兩個 selector 浮層）全部 monochrome — 選中態用 `#191919` 黑 pill（第一層模組）／`#F0F1F3` 灰 pill＋黑字（第二層頁面、左側子頁）＋黑左指示條。**Behance 藍 `#0057FF` 只留內容區**（主要按鈕、空狀態圖示），唔再出現喺 chrome。另開 `Chrome Tokens` variable set 管住呢組色，方便之後整套轉色。
2. **左側欄＝第二層頂欄嘅子頁導覽**：第二層保留模組層級頁面（品牌主頁／Dashboard／品牌設定）；選「品牌設定」時左側欄列出佢嘅子頁（品牌標誌・品牌識別・色彩・字體／渠道與策略・版本紀錄），點擊前往特定頁。**同第 12.1(2) 節「左側固定欄取消」相反，以本節為準**。
3. **頁尾唔再講安裝邊界**：刪走「香港 · 一機一公司」同「單機安裝 · 無跨機連線」兩句。改為「本機公司／滿月堂集團／香港」，右側只留「總部主機」角色標示。
4. **三個 selector／nav 狀態**：App selector 下拉、Brand selector 下拉全部黑灰白；下拉狀態底層用 `opacity:0.3` 淡化（**唔用 `visible:false`**，避免 auto-layout 重排），App 狀態另外把麵包屑＋頁首設 `opacity:0`，避免大標題被切出半個字。

### 13.2 九頁現況

| 頁 | 內容 |
|---|---|
| 01 | 1440 預設外殼・兩層頂欄・左側子頁導覽・誠實空狀態 |
| 02 | App 選擇器展開（六個 manifest app 全部未啟用＋底座管理入口） |
| 03 | Brand 選擇器展開（Moonic／HxDesign／Subtle Inno，無「全部品牌」） |
| 04 | 1024 筆電・側欄 200・收右側工具同「創作」 |
| 05 | 768 平板・四個模組收成「模組 · 品牌 ▾」・側欄 180 |
| 06 | 據點與機器｜總部目錄（Boss／管理級） |
| 07 | 新增據點機器｜三步憑證（進行到步驟 2） |
| 08 | 權限閘門｜非管理級（誠實狀態，唔係灰色失效掣） |
| 09 | 個人帳戶｜我的其他安裝（跨機入口，開新分頁） |

06–09 用同一個「底座管理・公司型」外殼示範：**公司型 app 無品牌下拉**（頂欄改純文字「公司範圍」）、第二層換成「總覽／據點與機器／存取紀錄」、左側欄自動換成據點子頁 — 印證「左側 nav 隨 app 切換」。

### 13.3 跨機設計立場（重要）

Billy 講「connect other region machine through the Head office machine」。呢句同既有 C01／C24／§236「兩機冇跨機連線」有衝突，所以我**唔當佢係即時資料連線**，而係定義做：

> 總部主機 ＝ **登記／批准／入口中心**（trust hub），唔係資料隧道。

- 總部只保存：據點目錄（公司名・地區・機器代號）、狀態、公鑰指紋、最後一次憑證交換、入口連結。
- 每部地區機仍然自己嘅 DB、自己嘅老闆、自己授權、自己審計；總部登記**唔等於**該機授權。
- 入口只係開新分頁去該機，由該機自己驗身份同授權；目錄**唔顯示即時在線／離線狀態**。
- 新增流程用一次性邀請憑證＋對方回傳確認檔（非同步、經人批准），沿用 C01 發件箱語意。
- 權限：只有 **Boss（owner）＋管理級**可以新增／批准／撤銷；管理級係**本機 grant 等級**，唔跨機自動繼承；其他角色連選單都唔顯示，直接入網址見「需要老闆或管理級授權」狀態。

詳細模型見 `MULTI-MACHINE-ACCESS.md` 第 10 節。**若 Billy 其實想要即時跨機查詢／合併報表，呢個係另一個決定，要先改 C01／C24／§236 並過法律同安全評估，唔可以用 UI 捷徑做。**

### 13.4 保留紅線

內容區全部係原型示意值（據點名、憑證指紋、日期、角色），未接任何 API；冇畫假資料統計。所有 app 仍標「未啟用」。`apps/web`、backend、db、platform 一行未郁。交付順序仍然 **Frame → Boss portal → Design app**，目前只完成 Frame（連帶一組平台底座嘅據點管理概念畫面）。

## 14. [已被第 15 節取代] Frame v1.0：Logo／Boss CRUD／交付文件／GitHub（2026-11-09 傍晚）

**本節已被第 15 節 v1.1 取代**：頂欄最左身份標誌組、四頁 Logo CRUD、右上個人帳戶跨機入口三點全部作廢／撤回；本節只保留做演變紀錄。文件交付同 GitHub（#150／分支／PR #151）嘅事實仍然有效，文件已升 v1.1。

Billy 確認：`This is already the Company-OS (Frame) I want`，並要求補 Logo、Boss CRUD、寫文件、上 GitHub。以下係當時 v1.0 狀態。

### 14.1 頂欄身份標誌組（全部 9 頁都加咗）

- 品牌型頁 01–05：最左插入「公司 Logo ＋ 1px 分隔線 ＋ 目前 Brand Logo ＋ Boss 下拉箭嘴」，用 `M(nodeId, parent, 0)` 放到 hamburger 前。節點 `10:1306`／`10:1317`／`10:1328`／`10:1339`／`10:1350`。
- 公司型頁 06–09：只顯示公司 Logo，**唔顯示 Brand Logo**。節點 `10:1361`／`10:1367`／`10:1373`／`10:1379`。
- 1440／1024／768／公司型四種狀態都已截圖驗證：兩枚或一枚 Logo 可見、頂欄無疊位、chrome 無藍。
- Logo 群全部黑灰白示意，唔引入 `#0057FF`。

### 14.2 新增四頁（畫布共 13 頁）

| 頁 | 節點 | 內容 |
|---|---|---|
| 10 | `10:1385` | 標誌管理｜公司 Logo 卡（96px 預覽、檔案資料、最後更新、回退字標、取代／移除）＋品牌 Logo 表（Moonic／HxDesign 已上傳、Subtle Inno 未上傳）＋權限提示＋表尾邊界備註 |
| 11 | `10:2005` | 上傳／取代對話框｜拖放區、SVG／PNG・正方形・≤ 2 MB・透明底建議、替代文字、頂欄 32／清單 48／登入頁 96 三種預覽、取消／移除現有標誌／儲存標誌 |
| 12 | `10:1703` | 頂欄 Logo 下拉｜管理公司標誌／管理品牌標誌（目前品牌）／上傳規格／查看變更紀錄；標明非老闆唔會見到 |
| 13 | `10:1823` | 切換品牌後｜Brand selector 改 HxDesign、Brand Logo 換成 HxDesign、Company Logo 不變；空狀態講明切範圍只改顯示同工作上下文 |

規則：公司型只顯示公司 Logo；品牌型顯示公司＋目前品牌 Logo；切 Brand 時 Company Logo 不變、Brand Logo 同步；未上傳顯示系統字標唔用假圖；**只有 Boss（owner）見到 CRUD 入口**；移除＝軟刪除並留審計；標誌只改顯示，**唔改品牌穩定身份、資料歸屬或授權**。

### 14.3 後端誠實缺口（一定要保留）

- `apps/platform/src/settings/schema.ts` 嘅 `SettingKey` 只有 7 個（`edition`、`install_code`、`company_locale`、`acceptance_rule`、`department_isolation`、`overdue_grace_hours`、`notification_channels`），**冇 logo key**。
- `apps/platform/src/files/routes.ts` 有通用檔案層（POST／GET／HEAD／DELETE、200 MiB、MinIO、`stored_file`、soft delete），但全部 `requireUser`，**冇** Boss-only logo metadata、company／brand 綁定、alt text、active version。
- `apps/platform/src/org/routes.ts` 全組 `requireOwner`，唔可以為員工 Brand selector 放寬。
- 結論：頁 10–13 係**設計規格，唔係已駁好功能**；工程化要另開 platform／db 獨立 issue，先裁決資料模型，唔可以由前端自建第二份真相。

### 14.4 視覺驗證（兩輪截圖）

第一輪捉到：標誌管理頁左欄「標誌 LOGOS」重複兩次＋據點頁殘留「管理級成員」；對話框預覽誤用公司「M」Logo（目標係 HxDesign）；對話框底部過空；彈層底層大標題出現半截字。修正：

- `D("10:1437")`／`D("10:2057")` 清走重複分組；間距 12→20；第二組改「存取與稽核／誰可以管理／操作紀錄」。
- `D("10:2196")` 後用 `svg` 插 HxDesign 雙斜線預覽（`10:2248`），`M(..., "10:2195", 0)` 放回拖放區最左。
- `U("10:2189", {height:548, y:176})` 收緊對話框彈性空白。
- `10:2073`／`10:2075`（對話框底層）同 `10:1770`／`10:1772`（下拉底層）設 `opacity:0`，**唔用 `visible:false`**（會令 auto-layout 重排）。
- 第二輪截圖：三頁無裁切、無疊字、無半截字；頁 13 頂欄 Logo 同步正確。

### 14.5 正式交付文件同 GitHub

- 本地：`docs/product/FRAME-UIUX-HANDOFF.md`（356 行）— 做咗乜、點運作（外殼解剖／selector／Context vs Lens vs Tenant boundary／Logo／trust hub／responsive／tokens／狀態語意）、後端接回指引（約 50 端點對照、10 條零畫面、F-01～F-10 拆法、issue 必備欄位）、Q1–Q7 待拍板、同 `AGENTS.md`／#147／`BASE-UI-DESIGN.md` 嘅衝突。
- `docs/INDEX.md` 文件地圖加一列，維持唯一入口。
- GitHub：issue **#150**、分支 `task/150-frame-uiux-handoff`、PR **#151**（base `main`），**未合併**；一条 issue＝一分支＝一 PR，PR 四段（為什麼／改了什麼／驗證實際輸出／不做什麼）齊。
- 內建 GitHub MCP 對 private repo 起 404，改用本機 `git`／`gh`（已登入 `Subtleinno`，admin／push／pull）。

### 14.6 重要：主色衝突未裁決

本輪設計 chrome 黑灰白＋內容區 `#0057FF`、停用 `#B8F36B`；但 `AGENTS.md` 第 42 行同 issue #147「設計方向（鎖死）」仍寫黑 accent `#000`＋`#B8F36B`。文件第 5 節已明確列為**阻塞：未裁決**，要嘛改規則／#147，要嘛改設計稿，**唔可以兩邊並存**。身份標誌組放最左亦屬對 `BASE-UI-DESIGN.md` §2 頂欄順序嘅擴充，裁決後要同步修文件。

### 14.7 狀態

Frame UIUX 定稿、GitHub 已管理；**Boss portal 未開始、Design app 未開始**；後端／`apps/web`／db／platform 依然一行未郁。交付順序仍然 **Frame → GitHub → Boss portal → Design app**。Q1–Q3（跨機 connect 定義、management grade、新機是否需該機老闆再批准）仍未由 Billy 拍板。

## 15. Frame v1.1 三點修正（2026-11-09 傍晚較晚，Billy 新指示）

Billy 原話：`Sorry, there are some thing still need to adjust, so you have to update the docs you just did.` 三點：

1. **Company／Brand Logo 唔放頂欄最左**：要「stick with the Company department app name (with Company logo), and Brand name with the Brand logo」。
2. **Logo 管理之後先深度重設計**：`i think we need re-design them deeply later`。
3. **據點機器由 left bottom 管理**，唔好用右上 `user management` 部分。

### 15.1 畫布實作（回到 9 頁）

- 九頁頂欄最左「身份標誌組」全刪（`10:1306`／`1317`／`1328`／`1339`／`1350`／`1361`／`1367`／`1373`／`1379`），最左還原做 hamburger，順序回到 `BASE-UI-DESIGN.md` §2。
- 公司 Logo 20px 插入各頁 App selector 最左（貼 app 名）；品牌 Logo 20px 插入五張品牌型頁 Brand selector 最左（貼品牌名）；公司型頁無 Brand selector → 無品牌 Logo。頁尾另插 16px 公司 Logo 貼「本機公司／滿月堂集團」名。
- **移除四頁**：`10:1385`／`10:2005`／`10:1703`／`10:1823`。唔留作廢舊稿（Billy「不留舊物」規則）；Logo 管理所有決定（上傳規格、替代文字、三種預覽、軟刪除、變更紀錄、頂欄下拉）撤回。
- 據點入口：右上個人帳戶選單撤走 → `10:1290` 改名「左下本機公司選單｜據點與機器」，`x:24, y:508`（高 329，底 837，頁尾線 855，留 18px）；頁 09 根節點改名「09 本機公司身份｜據點與機器入口（左下）」；App 下拉 `10:580` 由「底座管理 · 據點與機器」還原「底座管理」；八張頁尾插「據點與機器 ▾」（頁 09 用 ▴ 表已展開）。
- 頁 08（非管理級）頁尾**唔加入口**，只補公司 Logo；`10:965`「Super Admin」改「設計主管」，同權限閘門文案一致。

### 15.2 技術坑（今次新中）

- `U(nodeId, {svg:...})` **唔支援換圖**：只會改到 `name`，SVG 子元素完全無郁。要 `D(舊圖示)` → `I(parent, {type:"frame", ..., svg:"<svg...>"})` → `M(newId, parent, 0)` 三步。
- `batch_edit` operations 唔接受純字串變數定義（`co="..."` 會 `Skipped unparseable line`），SVG 要**每行 inline 寫入** `I()`；只有 `I()` 回傳嘅 binding 可以用。
- 新插 footer 文字節點要按 index 排位：`M(new, footer, 5)`（順序：公司 Logo／狀態點／本機公司／公司名／地區／入口／彈性空間／主機角色）。

### 15.3 文件同 GitHub

- `docs/product/FRAME-UIUX-HANDOFF.md` 升 **v1.1**（398 行）：新增 1.4 撤回記錄；D11–D14；1.3 九頁；2.1／2.2／2.6／2.7／2.8／2.9／3.2／3.4／3.5／3.7／Q4／Q8／第 5 節／6.3／6.4 全部同步。`docs/INDEX.md` 該列改 v1.1 描述。
- **未郁**：後端／`apps/web`／db／platform／`AGENTS.md`。3.4 仍如實講 `settings/schema.ts` 無 logo key、`files/routes.ts` 只有通用檔案層、`org/routes.ts` 全 requireOwner；F-08 標「撤回，停工」。
- GitHub：同一 issue **#150**、同一分支 `task/150-frame-uiux-handoff`、同一 **PR #151**，加 commit `57bd2e0`，PR 標題／描述改 v1.1、issue 補 comment；**未合併**。PR 描述如實寫「產品測試未執行」。
- 主色衝突（chrome 黑灰白＋內容區 `#0057FF` vs `AGENTS.md` 第 42 行／#147 黑 accent `#000`＋`#B8F36B`）**仍未裁決**；Q1–Q8 全未答，當中 Q8 係今次新增：公司 Logo 到底貼邊個名稱（本稿暫按 App selector app 名＋頁尾公司名）。

### 15.4 狀態

Frame v1.1 定稿、GitHub 已管理；**Boss Portal 完整業務頁未開始、Design app 未開始**；Logo 管理撤回待深度重設計。兩輪截圖驗證（7＋4 張）無裁切／疊字／溢出；`capture_layout(problemsOnly)` 無 `OUTSIDE_PARENT`。順序仍然 **Frame → GitHub → Boss Portal → Design app**。

> **第 15 節已被第 16 節局部取代**：v1.1 仍保留「App 下拉『底座管理』入口」呢個寫法，v1.2 起該入口刪走、公司型 app 正名 **Boss Portal**。其餘三點（Logo 貼名、Logo 管理撤回、據點入口喺左下）繼續有效。

## 16. Frame v1.2 命名裁決：底座管理 → Boss Portal（2026-11-09 17:10 後）

Billy 原話：`one small thing forgot to ask you update, it actually not the 底座管理, it is the Boss portal`。

### 16.1 改名揭出嘅結構矛盾

一直被稱作「底座管理」嘅**公司型 app**，正確身份係 **Boss Portal**（manifest `boss`，公司型・敏感，只服務老闆／管理級），唔係一個獨立「平台底座」工具。改字之前畫布有個真實矛盾：頁 02 App selector 下拉同時列出 `10:564`「老闆台 Boss Portal」（六個 manifest app 之一）同分隔線下 `10:579`「底座管理」入口 —— 同一個 app 被畫咗兩次。「底座管理」係早期為咗示範「左側 nav 隨 app 切換」而虛構嘅第七個入口，唔係 repo 既有 app。

**所以呢次唔係單純 rename**，係清走虛構入口並統一歸屬。

### 16.2 畫布實作（仍 9 頁）

- `D("10:578")` 分隔線、`D("10:579")` 底座管理入口（連子節點 `10:580`／`10:581`）；`10:558` 下拉由七項回復六項 manifest app。`10:564` 統一改「Boss Portal」，`10:563` 改名「App Boss Portal」。
- 頁 06–09 頂欄「目前 App」改「Boss Portal」：`10:627`／`788`／`949`／`1110`；麵包屑上層改「Boss Portal ／ 據點與機器 ／」：`10:708`／`871`／`1032`／`1193`。
- `10:1305` 左下選單邊界提示補「屬 Boss Portal 嘅據點管理」。第二層「總覽／據點與機器／存取紀錄」、左側欄子頁、頁尾左下入口位置**完全唔變**；品牌型頁 01–05 頂欄仍然「Design」。
- 字串核對（`batch_read` JSONL）：`底座管理` 0、`底座` 0、`老闆台` 0、`Boss Portal` 11。四張截圖（頁 01／02／06／09）無裁切疊字溢出，下拉無懸空分隔線；頁 09 `capture_layout(problemsOnly)` 只剩既有大面積留白候選警告，無 `OUTSIDE_PARENT`。

### 16.3 文件同 GitHub

- `docs/product/FRAME-UIUX-HANDOFF.md` 升 **v1.2**（424 行）：新增 **1.6 命名裁決**、**D15**、**Q9**；改 D3／D9／D14、1.3 頁 02、1.5、2.2、2.3、2.7、2.8、3.2、3.5（F-09／F-10）、3.7、第 5 節衝突表、6.1 詞表、6.3、6.4。`docs/INDEX.md` 該列同步。
- **誠實位（重要）**：以往寫「Boss portal 未開始」，但頁 06–09 其實已經係 Boss Portal 嘅據點管理概念畫面。1.5／6.3 改為「Boss Portal **完整業務頁**（今日／批准收件匣／部門摘要）未開始」；四頁仍係 Frame 階段用嚟示範公司型外殼、nav 切換同權限閘門嘅概念畫面，未接 API、未定稿、未經裁決。**Q9** 問：係咪當佢第一批已定稿畫面，定係 Boss Portal 階段要重新設計。未答之前唔好當已批規格，亦唔好改 `manifest.json` 嘅 `available: false`。
- GitHub：同一 issue **#150**、同一分支 `task/150-frame-uiux-handoff`、同一 **PR #151**，加 commit `933ecb0`，PR 標題／描述改 v1.2、issue 補 comment；**未合併**，純文件、產品測試如實寫「未執行」。
- **未郁**：後端／`apps/web`／db／platform／`manifest.json`／`AGENTS.md`／`DECISIONS.md`；C01／C24／§236 無改。3.4 Logo 缺口、F-08 停工維持。

### 16.4 狀態

Frame v1.2 定稿、GitHub 已管理；**Boss Portal 完整業務頁未開始、Design app 未開始**；Logo 管理撤回待深度重設計。主色衝突（`AGENTS.md` 第 42 行／#147 vs chrome 黑灰白＋內容區 `#0057FF`）同 **Q1–Q9** 全部未裁決。順序仍然 **Frame → GitHub → Boss Portal → Design app**。

> **第 16.3 節「未合併」已被第 17 節取代**：PR #151 之後已合併落 `main`。

## 17. v1.3 交付：設計稿落 GitHub ＋ Perplexity PM prompt（2026-11-09 17:40 後）

Billy 確認 `This is the Computer OS Frame with Boss Portal basic functions`，並要求「Perplexity 做 Manager 開 GitHub issues、WorkBuddy（另一個 session）做真工作、最後本機 Docker 見到最新版」。同時講「I hope you also uploaded the design to GitHub already」—— **實情係之前只上咗文件，九張設計稿從未入 repo**，呢個係 loop 會斷嘅位，已如實更正並補做。

### 17.1 補做嘅三件

1. `docs/design/frame/*.png`：由 Ardot `745493588675335` 匯出 9 張（1440×900 ×7、1024×768、768×768），369,877 bytes；抽驗頁 01／09 圖檔完整無損。
2. `docs/design/FRAME-DESIGN-INDEX.md`（67 行）：Ardot 網址、9 個 node ID、檔名對照、對應 handoff 章節、施工狀態、**WorkBuddy 開工卡**（可成段貼去另一個 session）；寫明 Ardot 圖層係原始真相、PNG 只係快照。
3. `docs/product/PERPLEXITY-MANAGER-PROMPT.md`（249 行）：PM 只開 issue 唔寫 code；依 `docs/planning-loop.md` 嘅 PM／Worker 分工、`Depends-on`、`cat:`、`status:building`。含 E-00 總綱、F-01 裁決、F-02P／F-02～F-07、D-01 部署序列；盤點既有 #118–#129／#143／#145／#147／#148 避免撞車；loop 協定；本機 Docker 驗收。

### 17.2 順手修嘅兩個規格矛盾

- handoff F-02「允許改 `apps/web`＋`packages/design-tokens`＋`packages/ui-kit`」違反 `AGENTS.md` 第 9 條同 `planning-loop` 嘅 `cat:packages` 全場獨佔 → PM prompt 拆成 `cat:packages` 先行＋`cat:web` 後繼，handoff 3.5 加註。
- handoff 6.2 叫 PM 讀 `.workbuddy/design/BACKEND-FUNCTIONS-MAP.md`，但該檔 gitignored、GitHub 冇 → 改為用 handoff 3.2／3.3 對照 repo 實際 `routes.ts`。

### 17.3 GitHub 狀態（重要轉變）

- `docs/product/FRAME-UIUX-HANDOFF.md` 升 **v1.3**（447 行）：新增 1.7、0 節兩條規則、3.5 註、6.2／6.3／6.4 更新；`docs/INDEX.md` 加兩列。
- issue #150 補咗 AGENTS.md 第 8 條嘅明確文件授權；同一分支加 commit `e436f14`，PR #151 標題／描述改 v1.3。
- **PR #151 已合併落 `main`**（merge commit `ecc9ac0`），issue **#150 已關閉**。原因：Perplexity 同日後 Worker 要由 default branch 直接讀到文件同設計圖；PR 未合併時 `main` 冇呢批資產，loop 會斷。純文件同圖檔、零產品程式，可用 revert 還原。`gh api ...?ref=main` 已驗證四個檔案可讀。
- 本機 Docker（只作 D-01 依據，**未重建**）：正式 `company-os` 4210／4420、Demo `company-os-demo` 4211／4421，8 個容器 healthy。UI/UX 測試只可喺 Demo stack（`docs/testing/DEMO-PUBLIC-TESTING.md`）；#143 未合併，唔可以聲稱有 `deploy:revision`。

### 17.4 狀態

Frame UIUX 同 GitHub 交付**全部完成**；**Perplexity 未執行、施工 issues 未開、WorkBuddy 工程未開始、本機 Docker 未更新**。後端／`apps/web`／db／platform／`manifest.json`／`AGENTS.md`／`DECISIONS.md` 依然一行未郁。主色衝突同 Q1–Q9 未裁決；順序仍然 **Frame → GitHub → Boss Portal → Design app**。

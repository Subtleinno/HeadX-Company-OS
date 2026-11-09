# Company OS — Frame UI/UX 交付文件

| 項目 | 內容 |
|---|---|
| 版本 | v1.2（2026-11-09 命名裁決） |
| 日期 | 2026-11-09 |
| 狀態 | **Frame 設計定稿；公司型 app 正名 Boss Portal；Logo 管理撤回待重設計；未施工** |
| 讀者 | Development manager AI（Perplexity）及接手嘅開發團隊 |
| 設計稿 | `company-os App UI v2`，Ardot fileId `745493588675335`（可編輯圖層，9 頁 1440×900） |
| 相關底稿 | `.workbuddy/design/00-backend-functions.md`、`01-scope-model.md`、`02-multi-machine-access.md`（本機設計底稿，gitignored，唔入 repo） |
| 交付順序 | **Frame → GitHub → Boss Portal → Design app**；本文件只完成 Frame。頁 06–09 係 Boss Portal 嘅據點管理概念畫面，完整業務頁未開始（第 1.6 節／Q9） |

> **一句摘要**：呢份係一套持久共用外殼（Frame）嘅 UI/UX 規格，唔係任何部門 app 嘅業務頁；所有畫面都係可編輯原型，內容係明確示意值，**未接任何 API、未改一行 backend／db／platform／apps/web**。

> **v1.1 改咗乜**：老闆三點修正 —— (1) 公司／品牌 Logo 唔再放頂欄最左獨立組，改為貼住各自名稱；(2) Logo 管理四頁全部撤回，之後先深度重設計；(3) 據點機器入口由右上個人帳戶搬去頁尾左側本機公司身份位。第 1.4、2.7、2.8、3.4、3.5、4、5 節係受影響章節。

> **v1.2 改咗乜**：老闆補充命名裁決 —— *「it actually not the 底座管理, it is the Boss portal」*。一直被稱作「底座管理」嘅公司型 app 正名為 **Boss Portal**；畫布刪走同「老闆台 Boss Portal」重複嘅第七個入口，頁 06–09 歸屬 Boss Portal，頂欄／麵包屑／下拉全部統一。詳見第 1.6 節；連帶影響見 1.5、1.3、2.2、2.3、2.7、2.8、3.2、3.5、3.7、4、5、6.1、6.3、6.4。

---

## 0. 點用呢份文件（畀 Development Manager AI）

你嘅任務係：**引導團隊將已經完成嘅後端功能，逐頁接返入呢個 Frame**，唔係重新設計 UI。

使用次序：

1. 先讀 `AGENTS.md` → `docs/INDEX.md` → 本文件第 2 節（UI 點運作）→ 第 3 節（接回指引）。
2. 第 2 節係**行為規格**：每層殼放乜、點互動、邊啲狀態唔可以簡化。
3. 第 3 節係**施工對照**：邊個畫面用邊條 endpoint、邊啲仲未有、邊啲要另開 issue。
4. 第 4、5 節係**停工位**：未拍板嘅決定同既有規則衝突。見到呢啲，按 `AGENTS.md` 第 7 條「停下、喺 issue 提問、唔好猜」，唔好自己揀一份。
5. 本文件**唔係施工授權**（`docs/INDEX.md`「產品與現有實作分開」）。每頁仍要一張獨立 issue、一個分支、一個 PR、一組會先 fail 嘅測試。
6. **第 1.4 節嘅撤回範圍唔可以當規格**：Logo 管理未定稿，唔好由嗰度拆施工 issue。
7. **第 1.6 節嘅命名裁決要貫徹**：「底座管理」唔係一個 app，唔好喺施工時重建第七個入口；據點管理屬 Boss Portal。頁 06–09 係概念畫面，未答 Q9 之前唔好當成已批規格。

---

## 1. 呢輪做咗乜（What was done）

### 1.1 由「規格板」改成「真 App UI」

第一版畫咗十張「後端端點／驗收要點」對照板，被退貨：*「looks like a presentation no an app UI」*。根因係畫面入面有 meta／規格文字，用戶見到嘅唔係產品。

已推倒重來，定下一條硬規則：**畫面內所有字都必須係產品文案**，表格、詳情、表單、空狀態、權限狀態、hover／selected／disabled 全部要係可操作介面；端點對照一律放文件（即本文件第 3 節），唔放入畫面。

### 1.2 已完成嘅設計決定

| # | 決定 | 內容 |
|---|---|---|
| D1 | 兩層頂欄 | 第一層全域，第二層目前模組嘅頁面級導覽 |
| D2 | 左側欄職責 | 服務**第二層頂欄選中頁**嘅子頁；例如「品牌設定」→ 品牌標誌／品牌識別／色彩／字體／渠道與策略／版本紀錄，點擊前往特定頁 |
| D3 | 左側 nav 隨 app 切換 | 公司型（Boss Portal）換成「總覽／據點與機器／存取紀錄」＋對應子頁；**唔設「標誌管理」頁** |
| D4 | Chrome 只用黑灰白 | 第一層、第二層、左側欄、兩個 selector 浮層全部 monochrome；選中態黑 pill／灰 pill＋黑左指示條 |
| D5 | Behance 藍只留內容區 | `#0057FF` 只用於主要按鈕、空狀態圖示；停用 lime yellow `#B8F36B`（**與 AGENTS.md 衝突，見第 5 節**） |
| D6 | 字級回推大一級 | UI 15px、小字 13–14px、頁標題 40/48、副標 17/26、卡標題 22/30、內文 16/26；欄高 72／60；內容 padding 56／48；觸控目標 ≥ 40px |
| D7 | Workspace → Brand | selector 直接寫「品牌 · Moonic 滿月堂」，下拉群組「品牌 BRANDS」，**唔設「全部品牌」** |
| D8 | 頁尾唔講安裝邊界 | 刪走「一機一公司／單機安裝」；改「本機公司／滿月堂集團／香港」，右側「總部主機」 |
| D9 | 未討論嘅 app 唔畫 | Finance app、其他部門業務頁全部唔畫；App selector 只列 manifest 六個 app（全部「未啟用」），「Boss Portal」係其中之一；**唔另設「底座管理」入口** |
| D10 | Responsive | 1440 預設／1024 筆電／768 平板三種狀態；`fill_container`＋彈性空間，唔寫死右側座標 |
| D11 | Logo 唔係頂欄左側獨立區 | 公司 Logo 貼住 App selector 嘅公司／部門 app 名稱；品牌 Logo 貼住 Brand selector 嘅品牌名；頁尾本機公司名旁亦帶公司 Logo。頂欄最左還原做側欄開關 |
| D12 | 公司型／品牌型 Logo | 公司型 app 無 Brand selector → 無品牌 Logo；品牌型 app 先有品牌 Logo。切 Brand 時公司 Logo 不變、品牌名同品牌 Logo 一齊換 |
| D13 | Logo 管理撤回 | 標誌管理／上傳對話框／頂欄 CRUD 選單／切品牌狀態四頁**全部撤走**，唔屬 Frame 定稿，留待之後深度重設計（第 1.4 節） |
| D14 | 據點機器入口改左下 | 由頁尾左側「本機公司」身份位開「據點與機器」，**唔放右上個人帳戶／用戶選單**；App 選擇器唔另設「底座管理」入口，避免雙入口 |
| D15 | 公司型 app 正名 | 一直稱「底座管理」嘅公司型 app 其實係 **Boss Portal**（manifest `boss`，公司型・敏感）。畫布、頂欄、麵包屑、下拉、文件全部統一；頁 06–09 歸屬佢，刪走重複嘅第七個入口（第 1.6 節） |

### 1.3 九頁設計稿（v1.2 現況）

| 頁 | 節點 | 狀態 | 展示重點 |
|---|---|---|---|
| 01 | `10:13` | 1440 預設 | 兩層頂欄・左側子頁導覽・誠實空狀態・Logo 貼名・左下據點入口 |
| 02 | `10:122` | App selector 展開 | 六個 manifest app（全部未啟用），「Boss Portal」標公司型・敏感；**無額外「底座管理」入口** |
| 03 | `10:231` | Brand selector 展開 | Moonic／HxDesign／Subtle Inno，無「全部品牌」 |
| 04 | `10:340` | 1024 筆電 | 側欄 200px、收右側工具、收模組頁、padding 收窄 |
| 05 | `10:449` | 768 平板 | 模組分頁收成「模組 · 品牌 ▾」、側欄 180px |
| 06 | `10:597` | 據點與機器・總部目錄 | Boss／管理級先見到；純目錄，無假在線燈 |
| 07 | `10:758` | 新增據點機器・三步憑證 | 進行到步驟 2；一次性邀請憑證（72h、單次） |
| 08 | `10:919` | 權限閘門・非管理級 | 直入網址見誠實狀態；**頁尾唔顯示據點入口**，右上身份改「設計主管」 |
| 09 | `10:1080` | 本機公司身份・據點與機器入口（左下） | 由頁尾左側開啟嘅選單；列出其他據點同管理入口；開新分頁，由該機自己驗身份 |

九頁已完成兩輪版面同截圖驗證：1440／1024／768／公司型／下拉狀態／左下選單／對話框／權限閘門都有目視檢查，無裁切、疊字、溢出。頁 06–09 嘅公司型外殼，v1.2 起歸屬 **Boss Portal**（第 1.6 節）。

### 1.4 撤回記錄：Logo 管理（重要，唔好當規格）

v1.0 曾經畫咗四頁 Logo CRUD：`10:1385` 標誌管理、`10:2005` 上傳／取代對話框、`10:1703` 頂欄 Boss CRUD 下拉、`10:1823` 切換品牌後 Logo 同步。老闆 2026-11-09 再指示：**「For the logo management part, i think we need re-design them deeply later」**。

處理：

- 四頁已由畫布**移除**，畫布回到九頁；唔留「作廢但仍存在」嘅舊稿，避免下次開工撞到新舊兩套。
- 佢哋嘅設計決定（上傳規格、替代文字、三種預覽尺寸、軟刪除、變更紀錄、頂欄下拉捷徑）**全部撤回**，唔係已批規格、唔納入施工序列、唔好畀 Perplexity 拆 issue。
- 保留落文件嘅只有「**顯示**」規則（第 2.7 節）同「**後端缺口**」事實（第 3.4 節），畀日後深度重設計做輸入。
- 重設計要重新答：Company Logo 同 Brand Logo 分別由邊個資料來源持有、Boss 之外邊個可以改、上傳／取代／移除係咪同一頁、版本同審計點記、同品牌穩定身份點分開。**喺答之前，唔好落實任何 Logo 功能，亦唔好喺前端自建第二份真相。**

> 順帶一個仍要老闆確認嘅語意：D11 講「公司 Logo 貼住公司／部門 app 名稱」，本稿實作係 App selector 嘅 app 名＋頁尾本機公司名各帶一枚公司 Logo；如果原意只係指頁尾公司名，要喺裁決時講清楚（第 4 節 Q8）。

### 1.5 刻意唔做

- 唔設計 Boss Portal **完整業務頁**（今日、批准收件匣、部門摘要）—— 下一階段；頁 06–09 只係 Frame 階段用嚟示範公司型外殼／權限嘅據點管理概念畫面，唔等於 Boss Portal 已設計完成（第 1.6 節／Q9）。
- 唔設計 Design app 業務頁 —— Frame 之後先做 Boss Portal，再輪到 Design app。
- 唔定稿任何 Logo 管理／CRUD 介面 —— 撤回，見第 1.4 節。
- 唔改 `apps/web`、`packages/*`、`apps/platform`、`db/*`、`AGENTS.md`。
- 唔假造 API 回應、統計數字、在線狀態、部門業務資料。
- 唔畫「全部品牌」、公司切換器、即時跨機資料連線。
- 唔喺右上個人帳戶／用戶選單放入口去其他地區機。
- 唔再使用「底座管理」作為 app 名，唔喺 App selector 重建第七個入口。

### 1.6 v1.2 命名裁決：底座管理 → Boss Portal

老闆 2026-11-09 補充：*「it actually not the 底座管理, it is the Boss portal」*。即係一直被稱作「底座管理」嘅**公司型 app**，正確身份係 **Boss Portal**（manifest 嘅 `boss`，公司型・敏感，只服務老闆／管理級），唔係一個獨立嘅「平台底座」工具。

改之前畫布有個結構矛盾：App selector 下拉同時列出「老闆台 Boss Portal」（六個 manifest app 之一）同分隔線下嘅「底座管理」入口 —— 同一個 app 被畫咗兩次。「底座管理」係早期為咗示範「左側 nav 隨 app 切換」而虛構嘅第七個入口，唔係 repo 既有 app。

v1.2 處理：

- **刪走**下拉嘅分隔線同「底座管理」獨立入口（`10:578`／`10:579`），下拉回復六個 manifest app，App 名統一「Boss Portal」。
- 頁 06–09 四張公司型畫面全部歸屬 Boss Portal：頂欄「目前 App」、麵包屑上層由「底座管理」改「Boss Portal」；第二層「總覽／據點與機器／存取紀錄」同左側欄子頁保持不變，因為佢哋本來就係據點管理嘅模組頁。
- 頁 09 左下選單邊界提示補明「屬 Boss Portal 嘅據點管理」；入口位置**完全唔變**（仍然頁尾左下，唔係右上個人帳戶）。
- 品牌型頁 01–05 頂欄仍然「Design」，唔受影響。

**連帶影響（要如實講，唔好當已完成）**：文件以往寫「Boss portal 未開始」，但頁 06–09 其實已經係 Boss Portal 嘅據點管理概念畫面。兩者唔矛盾嘅講法係 —— 呢四頁係 **Frame 階段用嚟示範公司型外殼、nav 切換同權限閘門嘅概念畫面**，未接 API、未定稿、未經裁決；Boss Portal 嘅**完整業務頁（今日、批准收件匣、部門摘要）仍然未開始**。呢個分別要由老闆喺 Q9 拍板，未答之前唔好將頁 06–09 當成已批規格，亦唔好改 `manifest.json` 嘅 `available: false`。

---

## 2. UI/UX 點運作（How it works）

### 2.1 外殼解剖

```
┌──────────────────────────────────────────────────────────────────────┐
│ ① 第一層 全域頂欄  72px  monochrome                                  │
│ ☰ [公司Logo Design▾] [品牌Logo 品牌·名稱▾] [模組分頁…]  ⌕ ⌘K 繁 通知 ? avatar │
├──────────────────────────────────────────────────────────────────────┤
│ ② 第二層 模組頁頂欄  60px  monochrome                               │
│ 品牌主頁   Dashboard   [品牌設定]                              ⋯       │
├──────────────┬───────────────────────────────────────────────────────┤
│ ③ 左側子頁   │ ④ 內容區                                              │
│ 248 / 200 /  │ 麵包屑 → 頁標題＋副標＋主要動作 → 內容／表格／空狀態  │
│ 180px        │ 藍色只喺呢度出現                                      │
│ 選中頁嘅子頁 │                                                       │
├──────────────┴───────────────────────────────────────────────────────┤
│ ⑤ 頁尾 44px  [公司Logo] ● 本機公司 滿月堂集團 香港 據點與機器▾  總部主機 │
└──────────────────────────────────────────────────────────────────────┘
```

**層級責任**：① 揀工具同工作上下文；② 揀目前模組嘅頁；③ 揀該頁嘅子頁；④ 做嘢；⑤ 永遠提醒身處邊間本機公司，**並提供據點機器入口**。① 唔重複 ② 嘅選單，② 唔重複 ③ 嘅子頁。

### 2.2 第一層全域頂欄

由左至右固定順序：

1. **側欄開關（hamburger）** — 頂欄最左，還原 `BASE-UI-DESIGN.md` §2 嘅順序。
2. **App selector** — 答「用乜工具」；`公司 Logo ＋ app 名稱 ＋ 下拉箭嘴`。列出 `/modules` 俾呢個用戶睇到嘅 app，未啟用照列但標明「未啟用、不可進入」。「Boss Portal」係公司型・敏感 app，據點與機器管理歸屬佢；**唔另設「底座管理」入口，亦唔帶「據點與機器」字眼**（第 1.6 節）。
3. **Brand selector**（只限品牌型）— 答「喺邊個工作上下文」；`品牌 Logo ＋ 「品牌 · 名稱」＋ 下拉箭嘴`。公司型改做純文字「公司範圍」，**唔做失效下拉，亦唔顯示品牌 Logo**。
4. 模組分頁 — 隨 app 切換，例如 Design app：品牌／知識／素材／創作。
5. 彈性空間。
6. 右側工具 — 搜尋／⌘K／語系／通知／說明／avatar／身份。**據點機器唔喺呢度**。

> App selector 右邊先係範圍控件，順序唔可以掉轉（`BASE-UI-DESIGN.md` §2）。Logo 係名稱嘅附屬視覺，**唔係獨立身份區、唔係獨立按鈕、唔帶 Boss 下拉**；呢點係 v1.1 相對 `BASE-UI-DESIGN.md` 嘅新細節，裁決後要補入文件（第 5 節）。

### 2.3 第二層頂欄 ＋ 左側子頁導覽

- 第二層只放**模組層級**頁面。Design app 示例：品牌主頁／Dashboard／品牌設定；Boss Portal 示例：總覽／據點與機器／存取紀錄。
- 左側欄列出**目前選中頁**嘅子頁，並分組；選中態係 `#F0F1F3` 灰 pill＋黑字＋3px 黑左指示條。
- 切 app 換整套第二層＋左側欄；切第二層頁換左側欄內容；點左側子頁進特定頁，內容區標題、麵包屑、動作同步變。
- 「品牌標誌」只係**導覽目的地名稱**（沿用老闆「Brand Settings → Brand logo…」例子），內容區仍係誠實空狀態；**唔代表 Logo 管理已設計**。
- 右側「⋯」更多操作同頁內搜尋屬內容區工具，唔屬導覽。

### 2.4 內容區同狀態

麵包屑 → 頁標題＋副標＋主要動作 → 內容。所有未接內容嘅頁一律顯示**誠實空狀態**：「呢頁仲未接內容／而家只畫外殼；呢頁會喺 Design app 階段接入真實模組內容」。唔放 KPI、唔放示例統計、唔放按咗冇反應嘅掣。

必須保留嘅元件狀態：hover、selected、disabled、focus、empty、error、permission denied、loading、stale/conflict。`docs/INDEX.md` 第 98 行講清楚：**API 冇回傳就顯示空狀態，唔好顯示一個睇落合理嘅數字；若原因是拒絕或失敗要明示，唔好偽裝無資料。**

### 2.5 App / Brand selector 互動流程

```
登入 → GET /me（身份、must_change_password）
   → GET /modules（可見 app）
   → 逐 app 問 GET /app-grants/access/:appId（可否進入）
   → App selector 決定 app 模式
        ├─ 公司型：範圍位顯示純文字「公司範圍」，無品牌下拉、無品牌 Logo
        ├─ 品牌型：顯示 Brand selector，載入該用戶可存取品牌（契約未定，見第 4 節）
        └─ 混合型：明確二選一，唔好靜靜預設
   → 切換範圍：重新驗證合法範圍 → 重載該範圍資料
        → 麵包屑／第二層／左側欄／Brand 名稱＋品牌 Logo 同步
```

切換**唔改**資料歸屬、繼承政策或授權；每次切換要重新向後端驗證，唔好用上一頁 cached 嘅授權結果。公司 Logo 跟 app／公司名，唔隨品牌切換而變。

### 2.6 三層分離：Context／Query lens／Tenant boundary

| 層 | 控件 | 答嘅問題 | 會唔會改授權／歸屬 |
|---|---|---|---|
| **工作上下文 Context** | 頂欄 App／Brand selector | 我而家喺邊度？寫入落邊？ | 唔會；由 app 模式＋合法範圍解析決定 |
| **查閱維度 Query lens** | 內容區工具列（只讀） | 呢份資料用乜維度切片去讀？ | 唔會；切換重新查詢 |
| **跨機 Tenant boundary** | **頁尾左側本機公司身份位**／總部目錄 | 我要去另一間公司嘅機 | 唔會；另一部機自己驗身份授權 |

**Context 管寫，Lens 管讀**。三種查閱維度（全公司／品牌／部門）唔可以靠加一個「全部品牌」選項解決 —— 會直接踩 `DECISIONS.md` C42「公司範圍 ≠ 全部品牌加總」同 C46。全公司彙總係**獨立契約／獨立授權、只讀**；部門係 org_unit 維度，唔係品牌。

### 2.7 Company / Brand Logo 顯示規則（只講顯示，唔講管理）

| 情境 | 顯示 |
|---|---|
| 品牌型 app（Design app） | App selector：`公司 Logo ＋ app 名稱`；Brand selector：`品牌 Logo ＋ 品牌名`；頁尾：`公司 Logo ＋ 本機公司名` |
| 公司型 app（Boss Portal／據點管理） | App selector：`公司 Logo ＋ app 名稱`；無 Brand selector → **無品牌 Logo**；頁尾同樣帶公司 Logo |
| 切換 Brand | 公司 Logo 不變；Brand selector 嘅**品牌名同品牌 Logo 一齊換** |
| 未上傳 Logo | 名稱旁顯示系統字標／省略圖示，唔好用假圖、唔好顯示破圖 |
| 非 Boss | 同樣只見到名稱旁標誌；**Frame 階段根本冇任何管理入口** |

硬性約束：

- Logo **唔再放頂欄最左獨立組、唔帶下拉箭嘴、唔係按鈕**。佢只係「名稱」嘅視覺附屬，尺寸 20px（頂欄）／16px（頁尾），跟隨相鄰文字嘅對齊同色彩。
- 標誌只改顯示，**唔改品牌穩定身份、資料歸屬、繼承政策或授權**；品牌身份唔可以只靠 Logo 或顏色辨識（`WORKSPACE-APP-SCOPE-DESIGN.md`）。
- **所有 Logo 管理／CRUD 已撤回**（第 1.4 節）。Frame 唔提供上傳、取代、移除、替代文字、版本紀錄、變更紀錄、權限提示頁。
- 呢啲標誌圖案全部係原型示意（黑灰白），未接任何檔案或設定 API。

### 2.8 跨機據點管理（頁 06–09）

Billy 講「connect other region machine through the Head office machine」。呢句同 `MASTER-PLAN.md` §236／C01／C24「兩機冇跨機連線」有衝突，所以設計上**唔當佢係即時資料隧道**：

> **總部主機 ＝ 登記／批准／入口中心（trust hub）**，唔係資料隧道。

- 總部只保存據點目錄（公司名・地區・機器代號）、狀態、公鑰指紋、最後一次憑證交換、入口連結。
- 各地區機仍有自己嘅 DB、老闆、員工、品牌、MinIO、授權同審計；**總部批准 ≠ 該機授權**。
- 入口只開新分頁去該機，由該機自己驗身份；目錄**唔顯示即時在線／離線綠燈**，唔做合併報表，唔自動同步員工／角色／品牌。
- 新增流程：填資料 → 一次性邀請憑證（72h、單次）→ 對方回傳確認檔、核指紋、老闆批准（非同步，沿用 C01 發件箱語意）。
- 權限：**Boss（owner）＋管理級**先可新增／批准／撤銷；管理級係**本機 grant 等級**，唔跨機繼承；其他角色連選單都唔顯示，直入網址見「需要老闆或管理級授權」狀態（頁 08 右上身份已改「設計主管」，頁尾入口唔顯示）。

**入口位置（v1.1 新裁決）**：

| 位置 | v1.0 | v1.1 |
|---|---|---|
| 右上 avatar／個人帳戶選單「我的其他安裝」 | 有（頁 09） | **撤走** |
| App selector 底部「底座管理」獨立入口 | 有（同「老闆台 Boss Portal」重複） | **整項刪走**；六個 manifest app 中嘅「Boss Portal」先係唯一身份 |
| **頁尾左側本機公司身份位「據點與機器 ▾」** | 無 | **唯一入口**；點開喺頁尾上方靠左彈出選單，列出其他據點＋「據點與機器（管理）」 |

**App 身份（v1.2 正名）**：頁 06–09 所屬嘅公司型 app 係 **Boss Portal**（manifest `boss`，公司型・敏感）。據點與機器係佢嘅一個模組頁，唔係另一個叫「底座管理」嘅 app。App selector 下拉由七項回復六項，唔再有分隔線下嘅重複入口（第 1.6 節）。權限模型維持一致：Boss（owner）＋管理級先可新增／批准／撤銷。

理由：據點同機器屬**公司／主機層**，唔屬個人帳戶設定；放右上有三個壞處 —— 會被當成個人偏好、會被誤會係單點登入／跨機身份、會同用戶選單嘅個人操作撈亂。放頁尾左側，同「本機公司」身份綁埋，用戶先會理解成「呢部機同其他機嘅關係」。頁 09 展示嘅係呢個左下選單展開，唔係個人帳戶頁。

### 2.9 Responsive

| 闊度 | 頂欄 | 左側欄 | 內容 |
|---|---|---|---|
| 1440 | 完整工具＋四個模組分頁 | 248px | padding 56／48 |
| 1024 | 收部分右側工具、收「創作」 | 200px | padding 收窄 |
| 768 | 四個模組收成「模組 · 品牌 ▾」 | 180px | 內容卡同頁內搜尋收窄，模組頁收三個＋「→」捲動提示 |

三種闊度都要保留頁尾左側嘅公司 Logo、公司名同「據點與機器」入口；空間不足先收右側「總部主機」標示。所有橫向容器用 `fill_container`＋彈性空間。**360px 未設計** —— issue #147 要求 360px 真正可用，屬未閉合缺口（第 4 節）。

### 2.10 視覺語言

- 兩套 variable set：`Frame Tokens`（accent `#0057FF`、accentSoft `#EAF0FF`、ink `#191919`、secondary `#6E6E6E`、muted `#A3A3A3`、border `#E1E4E8`、surface `#F5F6FA`、字級欄高）；`Chrome Tokens`（chromeInk／chromeSecondary／chromeMuted／chromeSurface／chromeSelected／chromeBorder／chromeWhite、sidebarWidth 248、barPrimaryHeight 72、barSecondaryHeight 60）。
- Logo 用黑灰白示意，唔引入新色、唔用藍、唔用陰影；浮層可用柔和陰影；其餘無陰影、無 emoji、無紫色漸層；1px 幼線分隔、6–12px 圓角。
- 介面文案繁體中文（香港）；`AGENTS.md` 第 41 條同樣規定介面／commit／PR／註解用繁中。

### 2.11 狀態同錯誤語意（接回時唔可以簡化）

- 「批准」≠「生效」：`approved`／`active` 要分開呈現。
- `stale_version` 如實顯示，**唔可以自動重送**。
- `password_change_required` 唔係「冇權限」，要帶去個人帳戶頁。
- `entry_untrusted`、`app_not_enabled`、`grant_missing` 要轉述具體原因，唔好摺成一句「失敗」。
- 查唔到（network／5xx）**唔可以當成「不允許」，亦唔可以當成「允許」**，要明講查唔到。
- 未啟用 app 要列出但標明「未啟用、不可進入」。
- 敏感 app（`boss`／`ops_finance`／`hr`）授權要老闆批准；授權、改權限、改設定一律寫審計。
- 非管理級直入據點頁要顯示**具體原因**，唔係灰色失效掣；同時頁尾入口唔顯示。

---

## 3. 後端接回指引（畀 Development Manager AI）

### 3.1 不變前提

1. 所有業務 API 喺 `apps/platform`（容器內 4420）；前端一律叫 `/api/...`，nginx 去掉 `/api` 前綴。
2. 三道閘門：入口守衛（gateway token＋`X-Company-OS-Entry: internal`）、CSRF、初始密碼（`must_change_password` 期間只放行 `GET /me` 同 `POST /auth/change-password`）。
3. 六個 manifest app 全部 `available: false`；app-host **零條部門 API、零頁部門畫面**（`docs/architecture/CODE-MAP.md`）。
4. 約 50 條 platform 端點／11 組；前端約 36 條已有呼叫。
5. `AGENTS.md` 第 9 條：**只改被指派嘅 app 資料夾**；要改 `packages/` 或 platform 必須有獨立 issue。第 2 條：一張 issue ＝ 一個分支 ＝ 一個 PR。第 3 條：先寫會 fail 嘅測試。
6. `docs/INDEX.md`「一個真相，一個方向」：app 清單唯一來源 manifest；公司結構唯一來源 `org_unit`／`org_unit_edge`；app_grant 決定存取；`company_setting`／`policy_rule` 係設定同政策來源；**前端唔保存資料副本**。

### 3.2 畫面 ↔ 端點對照

| Frame 表面 | 後端來源 | 現況 |
|---|---|---|
| 登入／開機／改密碼／個人帳戶 | `GET /auth/state`、`POST /auth/setup`、`POST /auth/login`、`POST /auth/logout`、`POST /auth/change-password`、`GET /me` | 已完成：前端已有 |
| App selector／我的 Apps | `GET /modules`、`GET /app-grants/access/:appId` | 已完成；`route`／`exposure`／`sensitive` 唔對外輸出，前端唔可以自建 app 清單 |
| 頂欄 App／Brand 名稱、頁尾本機公司 | `GET /me`＋安裝／公司設定 | 注意：公司顯示名嘅唯一來源未定案（第 4 節 Q5）；**名稱旁 Logo 嘅資料來源完全未定**（3.4） |
| Brand selector | `GET /org-units`（**`requireOwner`**） | 阻塞：C47 — 員工品牌 selector 未定契約，**唔可以為咗 UI 放寬 owner API** |
| 第二層／左側子頁導覽 | manifest ＋ 各 app 自己嘅頁面定義 | 阻塞：部門 app 未有頁面；Frame 階段導覽係原型 |
| 公司設定 | `GET /settings`、`PUT /settings/:key` | 已完成；一個 key 一次保存 |
| 組織／繼承 | `GET｜POST｜PATCH｜DELETE /org-units*`、`/org-units/:id/settings*` | 已完成；繼承由後端算，唔好喺前端重算 |
| 員工／Agent | `POST｜GET /staff*`、`/agents*`、`/agents/:id/grants*`、`/agents/:id/access/:appId` | 已完成；全組 `requireOwner` |
| App 授權流程 | `/app-grants*`（申請／批准／生效／拒絕／撤銷／PATCH） | 已完成；`GET /app-grants/:id` 單筆詳情未完成 |
| 政策規則 | `GET｜POST｜PATCH｜DELETE /policy-rules*` | 未完成：前端零畫面；`profiles/default/policy-rules.json` 實際係 `[]`，要顯示誠實空狀態 |
| 檔案上傳／列表／下載 | `POST /files`、`GET /files`、`GET｜HEAD /files/:id`、`DELETE /files/:id` | 未完成：前端零畫面；nginx 已放寬 200 MiB |
| Logo 顯示／管理 | **無專用 endpoint** | 阻塞：管理已撤回（1.4）；顯示來源未定（3.4） |
| 據點與機器（Boss Portal 嘅概念畫面，頁 06–09，入口喺頁尾左下） | **無 endpoint** | 阻塞：概念畫面；要改 C01／C24／§236 先可施工；`boss` app 仍 `available: false` |
| 儲存診斷 | `GET /health/storage` | 未完成：維運向，唔係用戶頁 |

### 3.3 後端完備但前端零畫面（10 條用戶向＋1 條維運）

| 功能群 | 端點數 | 接回時注意 |
|---|---|---|
| 政策規則 | 4 | `api.ts` 完全冇對應函式；唔好放示例規則，種子檔係空陣列 |
| 檔案層 | 5 | 上傳 binary body＋`x-file-name`＋可選 `x-content-sha256`；soft delete；可見性由 store SQL 依 viewer 決定 |
| 授權單筆詳情 | 1 | `GET /app-grants/:id`，睇唔到一律當 404 |
| 儲存診斷 | 1 | 維運向，`GET /health/storage` |

### 3.4 Logo 顯示／管理嘅真實缺口（**最重要**）

Frame 而家只保留「名稱旁顯示」，管理已撤回；但**兩個層次嘅後端契約都未存在**，唔可以當成「駁好」：

- `apps/platform/src/settings/schema.ts` 嘅 `SettingKey` 只有 `edition`、`install_code`、`company_locale`、`acceptance_rule`、`department_isolation`、`overdue_grace_hours`、`notification_channels` —— **冇** `company_logo_file_id`／`brand_logo_file_id`。
- `apps/platform/src/files/routes.ts` 有通用檔案層（upload／list／GET／HEAD／DELETE、200 MiB、MinIO、`stored_file`、soft delete），但全部 `requireUser`，**冇** Boss-only logo metadata、company／brand 綁定、alt text、active version、變更紀錄。
- `apps/platform/src/org/routes.ts` 全部 `requireOwner`；要列品牌唔可以為普通用戶放寬。

日後深度重設計要裁決嘅資料模型（三選一，或另提方案；**呢三個只係輸入，唔係本輪已批規格**）：

| 方案 | 做法 | 風險 |
|---|---|---|
| A | 新增 `company_setting` key 指向 `stored_file.id` | 品牌係 org_unit 維度，一條公司 key 裝唔到逐品牌 logo；要延伸 org_unit_setting |
| B | 獨立 platform logo metadata API＋表 | 最清楚，但要新 migration／新 schema／新審計，屬獨立 issue |
| C | 直接用 `stored_file` reference＋前端綁定 | **違反唯一來源同「前端唔保存副本」**，唔建議 |

連帶要答：Boss-only 權限、soft delete 後嘅回退字標、alt text、active version、審計事件、快取失效（切品牌即時同步名稱旁標誌）。**喺裁決＋重設計之前，唔好落實任何 Logo 上傳／管理功能，亦唔好喺前端自建第二份設定真相。**

### 3.5 建議施工拆法（每格一張 issue／一個分支／一個 PR）

| 順序 | Issue 範圍 | 允許改 | 依賴 |
|---|---|---|---|
| F-01 | 裁決第 4、5 節嘅決定（純文件／決策，唔寫 code） | `docs/product/DECISIONS.md` 等 | 無 |
| F-02 | 建立共用 Frame component（兩層頂欄＋左側子頁導覽＋頁尾＋tokens＋名稱旁標誌位） | `apps/web`、`packages/design-tokens`、`packages/ui-kit` | F-01 |
| F-03 | App selector／我的 Apps 接回 `/modules`＋`/app-grants/access/:appId` | `apps/web` | F-02 |
| F-04 | 身份、設定、組織、員工／Agent、授權五組既有畫面搬入 Frame | `apps/web` | F-02 |
| F-05 | 政策規則新頁（誠實空狀態）接回 4 條 endpoint | `apps/web` | F-02 |
| F-06 | 檔案層新頁接回 5 條 endpoint | `apps/web` | F-02 |
| F-07 | 授權單筆詳情 `GET /app-grants/:id` | `apps/web` | F-04 |
| F-08 | **Logo 管理／CRUD：撤回，唔喺呢條序列施工** | 無（等第 1.4 節深度重設計＋3.4 契約裁決） | 停工 |
| F-09 | Boss Portal **完整業務頁** | 另行規劃；頁 06–09 概念畫面要一併決定係保留、重畫定作廢（Q9） | Frame 全部完成 |
| F-10 | Design app（第一個部門 app） | 另行規劃 | Boss Portal |

> F-08 保留編號只係方便對照舊版；**佢唔係一張可以開工嘅 issue**。日後重設計要另開新 issue，唔好重用呢格。

### 3.6 每張施工 issue 必備（`docs/INDEX.md`「規劃交付與開工條件」）

可追溯規格章節、文件基線、獨立 `Depends-on` 行、依賴合併條件、允許修改路徑、確定接口同錯誤／狀態規則、實際驗收指令同證據、不做項、停工條件。

驗收要有正常／取消／失敗／負面案例；跨品牌切換另核對目標一致、慢回應、未保存、深連結、多分頁、權限失效；要有淺／深色、窄螢幕、鍵盤證據。**未執行嘅指令要如實寫「未執行」，唔好捏造輸出。**

### 3.7 明確唔做

- 唔改 backend／db／platform，除非獨立 issue 明確授權。
- 唔為咗 UI 放寬 `requireOwner`、唔自建 app／品牌清單、唔喺前端重算繼承或授權。
- 唔新增 `MCP` 動詞、唔畀 agent 自行批准、唔靜靜合併 main。
- 唔用原型示意值冒充正式資料；唔將「文件提交」當成「產品完成」。
- 唔將撤回嘅 Logo 管理頁當成已批設計；唔喺右上個人帳戶重建據點機器入口；唔再用「底座管理」做 app 名或另設入口。

---

## 4. 待拍板決定（未答之前唔好施工）

| # | 問題 | 點解重要 |
|---|---|---|
| Q1 | 「經總部連接其他地區機」係咪真係指**目錄／批准／入口中心**？定係想要即時跨機查詢／合併報表？ | 後者要先改 C01／C24／§236 並過法律同安全評估，唔可以用 UI 捷徑做 |
| Q2 | 「管理級」喺後端點定義？複用 owner／staff role，定係新增 grant 等級？ | 現有後端冇呢個等級；未定就畫唔到權限閘門嘅真實判斷 |
| Q3 | 新機登記係咪要**該機老闆再批准一次**？ | 「總部批准 ≠ 該機授權」係安全底線 |
| Q4 | Logo 管理要點深度重設計？顯示／上傳／權限／版本／審計係咪同一頁？ | v1.0 四頁已撤回；未答之前 F-08 停工，見 1.4／3.4 |
| Q5 | 公司顯示名／品牌穩定身份嘅接合方案（C47） | 員工 Brand selector 仍然被列為阻塞 |
| Q6 | manifest 嘅 app「模式」欄位由邊度宣告？ | manifest 現時只接受九個既有欄位，冇 mode；三模式宣告未定 |
| Q7 | 360px 手機闊度點收？ | issue #147 要求 360px 真正可用；Frame 現時只到 768 |
| Q8 | 「公司 Logo 貼住公司／部門 app 名稱」係咪指 App selector 嘅 app 名＋頁尾本機公司名？定只係頁尾公司名？ | 影響公司 Logo 出現幾多次、同由邊個欄位讀；本稿暫按前者實作（D11、1.4） |
| Q9 | 頁 06–09（據點與機器）而家歸屬 Boss Portal，係咪當佢第一批已定稿畫面？定係 Frame 階段嘅外殼示範、Boss Portal 階段要重新設計？ | 影響「Boss Portal 未開始」嘅講法同 F-09 範圍；未答之前唔好將概念畫面當成已批規格，亦唔好改 manifest 嘅 `available: false` |

---

## 5. 同既有規則／文件嘅衝突（要正式裁決，唔好靜靜改）

| 衝突 | 現有寫法 | 本輪設計 | 處理 |
|---|---|---|---|
| **主色** | `AGENTS.md` 第 42 行：accent 黑色 `#000`、`#B8F36B` 只當點綴；issue #147「設計方向（鎖死）」同樣寫黑 accent | chrome 黑灰白，**內容區**主要按鈕用 Behance 藍 `#0057FF`，停用 lime yellow | 阻塞：**未裁決**。要嘛改 `AGENTS.md`＋#147，要嘛改設計稿。唔可以兩邊並存 |
| **第一層頂欄順序** | `BASE-UI-DESIGN.md` §2：側欄開關 → App selector → 範圍 → app 主選單 → 工具 | v1.1 撤走最左身份標誌組，順序**回到 §2** | 已完成：順序一致；但「名稱旁帶 Logo」係新細節，裁決後要補入 §2，唔好當舊文件已寫 |
| **據點機器入口位置** | 既有文件無明訂；v1.0 放右上個人帳戶選單 | v1.1 改頁尾左側本機公司身份位，右上撤走 | 新決定，未寫入 `DECISIONS.md`／`MASTER-PLAN.md`；裁決後補，唔好兩套入口並存 |
| **左側欄** | v4 曾寫「左側固定欄取消」，內容全闊 | v5 起：左側欄＝第二層頂欄選中頁嘅子頁導覽 | 以 v5 為準；舊決定作廢 |
| **HxDesign 對照** | `BASE-UI-HXDESIGN-ALIGNMENT.md` 只對 #118 外殼；#148 另做完整 UX 語言 | 本輪 Frame 冇逐項對照 HxDesign 實測證據 | 注意：#148 未完成；合流時要補對照，唔好兩套標準並存 |
| **狀態真實性** | 不變量 4「空畫面要說真話」 | Frame 全部內容係原型示意值，已明確標示 | 已完成：一致；施工時要換成真 API |
| **公司型 app 命名** | 以往設計底稿稱「底座管理」，並喺 App selector 另設一個入口 | v1.2 正名為 **Boss Portal**，即 manifest 嘅 `boss`；刪走重複入口，頁 06–09 歸屬佢 | 新決定，未寫入 `DECISIONS.md`；裁決後補，唔好兩個名並存 |

---

## 6. 附錄

### 6.1 詞表

| 詞 | 意思 |
|---|---|
| Frame | 共用持久外殼；兩層頂欄＋左側子頁導覽＋內容區＋頁尾 |
| 公司型／品牌型／混合型 | app 嘅工作入口模式（C42）；**唔決定**資料歸屬或授權 |
| Context | 頂欄工作上下文，管寫入 |
| Query lens | 內容區只讀查閱維度（全公司／品牌／部門） |
| Tenant boundary | 一機一公司；跨機屬另一部機，唔係另一個 lens |
| Trust hub | 總部主機作為登記／批准／入口中心，唔係資料隧道 |
| Chrome | 第一層、第二層、左側欄、浮層；只用黑灰白 |
| 本機公司身份位 | 頁尾左側；帶公司 Logo、公司名、地區，同「據點與機器」唯一入口 |
| Boss Portal | 只服務老闆／管理級嘅公司型・敏感 app（manifest `boss`）；據點與機器管理歸屬佢；Frame 階段只畫咗概念畫面，完整業務頁未開始 |

### 6.2 施工前必讀

`AGENTS.md` → `docs/INDEX.md` → `docs/product/BASE-UI-DESIGN.md` → `docs/product/WORKSPACE-APP-SCOPE-DESIGN.md` → `docs/product/DECISIONS.md`（C41–C51）→ `docs/product/MASTER-PLAN.md` §3.4／§236 → `docs/architecture/CODE-MAP.md` → `.workbuddy/design/00-backend-functions.md`（本機底稿，端點逐條對照）。

### 6.3 交付狀態

- 已完成：Frame UI/UX 設計定稿（9 頁可編輯圖層，已通過兩輪版面同視覺驗證）。
- 已完成：本文件已入 repo 並經 GitHub PR 管理（v1.1／v1.2 修訂同一分支／PR）。
- 撤回：Logo 管理四頁，待深度重設計；F-08 停工。
- 未完成：Boss Portal **完整業務頁**設計（未開始）；頁 06–09 只係歸屬佢嘅概念畫面（Q9）。
- 未完成：Design app 設計同工程（未開始）。
- 未完成：後端功能逐頁接回 UI（未開始；由 development manager AI 依第 3 節拆 issue）。
- 未裁決：主色衝突、Q1–Q9；後端／`apps/web`／db／platform 依然一行未郁。

### 6.4 版本紀錄

| 版本 | 日期 | 內容 |
|---|---|---|
| v1.0 | 2026-11-09 | Frame 13 頁定稿；含頂欄左側身份標誌組、Logo CRUD 四頁、右上個人帳戶跨機入口；交畀 Perplexity 嘅初版文件 |
| v1.1 | 2026-11-09 | 老闆三點修正：Logo 改貼名稱、Logo 管理撤回、據點機器入口改頁尾左下；畫布回復 9 頁；D11–D14、1.4、2.7、2.8、3.4、3.5、Q4／Q8、第 5 節同步修訂 |
| v1.2 | 2026-11-09 | 命名裁決：公司型 app「底座管理」正名 **Boss Portal**；刪走下拉重複嘅第七個入口、頁 06–09 頂欄／麵包屑統一；新增 1.6、D15、Q9，並改寫 1.5／6.3 釐清「Boss Portal 完整業務頁未開始」 |

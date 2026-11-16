# HeadX Marketing Design：完整產品總圖與施工正本

版本 v4.1｜2026-11-17｜取代 v4.0 及 v3.1 的舊施工順序與已過時 UI 假設

> **這份文件回答：我們究竟正在建立甚麼、各模組如何合作、甚麼已經完成、甚麼仍不能假裝完成。**
>
> 新 session 先讀 `AGENTS.md`，再讀本文，然後讀 `docs/product/HANDOFF.md` 及實際程式。不要再由零猜產品，也不要把某張舊 issue、舊 Ardot 畫面或某段對話當成完整方向。
>
> **狀態原則：**本文同時記錄目標與現況，兩者必須分開。程式存在不等於已部署；API 測試通過不等於真實作品已生成；Render Job 有資料庫記錄不等於 PNG 已存在。
>
> **v4.1 變更摘要：**見文末附錄 A。主要是：HyperFrames 指令與環境需求對照官方文件重新標註「已驗證／待實測」；補上 MCP 協議版本釘選；釐清 Render 解像度與研究稿 2x 設定的差異；補齊 Project State 定義、MCP 工具命名對照與 Docker 驗收細節。

---

## 0. 文件與真相的優先次序

1. **老闆最新明確決定**優先於舊文件及舊設計稿。
2. **可運行程式、資料庫與真實輸出檔案**是現有能力的最終證據。
3. **本文**是 Marketing Design 的完整產品方向、模組邊界及驗收正本。
4. `HANDOFF.md` 記錄部署與施工現況；如未同步，必須修正，不可沿用過時描述。
5. `DECISIONS.md` 保存全域歷史決策；較新決定優先。
6. `docs/research/` 是既定研究與原型來源，不是現成產品，也不需要每位 worker 全部重讀。**研究稿中與本文衝突之處（例如 2x 輸出倍率、`approval.request` 審批、`hf.*` 工具名）以本文為準。**
7. Ardot 是視覺協作稿；老闆最新提供的產品截圖是目前 UI 的主要參考。程式落地後要同步 Ardot，不可只留下設計稿而沒有產品。

目前創作工作台的 Ardot 檔：
`https://ardot.tencent.com/file/748129148813297`

### 0.1 本文中的「驗證標記」

為避免把未驗證的事寫成事實，本文凡涉及外部工具與現況，一律標記：

- **[已驗證]**：已對照官方文件或實際執行確認。
- **[待實測]**：來自內部記錄或推斷，必須在 Docker／Linux 實測後才能當事實。
- **[本機工作樹]**：只存在於開發機，未部署。

### 0.2 本輪明確覆蓋 v3.1 的舊規則

以下由老闆於 2026-11-17 定案，優先於 v3.1 及任何仍引用舊規則的文件：

1. **MCP 納入本輪正式範圍。** 取代「第一版不做 MCP／之後再選配」；HTTP、MCP 與 UI 必須共用正式身份、Store、DB、Storage 與 Render 業務鏈。
2. **施工採單一自主 Loop。** 建議次序是 #111 → #120，一次一張，不並行修改同一批程式。若目前工作需要尚未完成的前置，worker 在同一工作單元先完成前置再返回；這不是並行開工，也不等待老闆放行。驗收完成後可合併並繼續下一張。
3. **規格空白不再停工猜問。** 取代 v3.1「規格空白或矛盾就停手、不猜」：worker 必須先用本文、`docs/research/` 與實際程式取得答案；仍有空白時採最小一致方案，在 PR 記錄假設與取捨並繼續。身份安全、資料歸屬、append-only、真 Output 與不得假冒能力等硬規則不可因此被繞過。
4. **研究稿正式可讀位置是 `docs/research/`。** 本機未追蹤的 `Perplexity idea/` 不再是 worker 的必要依賴；GitHub、CI 與本機都應能讀到同一份已提交方案庫。
5. **目前 Ardot 正本是 `748129148813297`。** 取代舊 `748070210348880` 作本輪創作工作台、Project Library 與 Knowledge 畫面的同步目標；老闆最新截圖仍是具體 UI 參考。
6. **進度必須可見。** 每個可見增量即時更新 Docker UI；錯誤在相關頁面顯示，issue 回報網址、截圖、實際驗證與下一動作。沒有相關畫面截圖及實際操作證據，不算完成該 PR。

---

## 1. 一句話產品定義

**HeadX Marketing Design 是一個持續管理品牌、素材、知識、模板與作品，讓人類和 AI Agent 在同一份資料上合作，並能真正生成、修訂、下載及追溯社交內容成品的創作作業系統。**

它不是：

- Project CRUD 或 Brief 閱讀器。
- 只有漂亮卡片、沒有業務能力的 Dashboard。
- 把 Perplexity 原型逐頁照搬的表單集合。
- 只供一次性生成、沒有版本與來源的 AI 玩具。
- 只做 Carousel、日後不能承載 Presentation／Video／Reels 的封閉工具。
- 自動對外發布平台。

### 第一個必須真正完成的作品閉環

由一個明確品牌的 Project 開始，使用：

- Brand identity 與固定 Brand Release
- Materials
- Knowledge 與具體 chunk citation
- Carousel Templates
- Composition
- HyperFrames
- PNG／ZIP Output
- Provenance

最終使用者必須能在 UI 看見、預覽及下載真實作品。

---

## 2. 不可違反的產品原則

1. **先完成作品，再擴大平台。** 不再為重寫而重寫，不在第一條閉環前發明新框架。
2. **同一件事實只有一個來源。** UI、HTTP API、MCP 與 Agent 使用同一業務 Store；不可有 SQLite 副本或前端假資料成為第二真相。
3. **Composition 是作品內容真相。** HTML 是由指定 Composition version 產生的渲染輸入，不可獨立手改成另一份稿件。
4. **版本追加，不改寫歷史。** 原始要求、Brief、Knowledge Version、Composition、Output、Output File 與 Provenance 必須可追溯。
5. **舊成品不受品牌後續修改影響。** Composition 建立時固定 Brand Release。
6. **狀態由事實推導。** 不由不同頁面隨意寫一個萬能 status 字串。
7. **沒有能力就誠實顯示。** 不放假 Render、假 AI 進度、假 Output、假模板、假統計或無反應按鈕。
8. **創作流程預設無額外審批。** 基本登入、Agent 身份、權限與審計仍保留；不另加權利／授權 workflow 阻擋第一條創作路徑。（此決定優先於研究稿中的 `approval.request`。）
9. **對外發布永遠由人操作。** 現階段交付下載與複製，不自動發佈到 Instagram 或其他平台。
10. **UI 改動必須看得見。** API 或資料層更新必須有對應畫面入口；部署後回報使用者在哪裡看到。
11. **速度與收斂優先。** 必要 API、DB、MCP、真檔案與 build 驗證不能省；不重複進行沒有新資訊的瀏覽器測試或主觀美化。

---

## 3. 公司、品牌、App、身份與權限

### 3.1 全域模型

- 一個 HeadX 安裝代表一間公司及其本機資料邊界。
- 公司可有多個 Brand；Marketing Design 是**品牌型 App**。
- App selector 回答「使用哪個工具」；Brand selector 回答「目前在哪個品牌工作」。
- 兩個 selector 都不是授權證據，不會因切換而複製資料、改變資料歸屬或擴大權限。
- Brand 工作上下文永遠是一個明確品牌；不可用「全部品牌」冒充公司範圍或跨品牌授權。
- App 清單、名稱、route 與可用狀態由 server manifest 提供，前端不可另寫一份硬編碼清單。

### 3.2 身份

| 身份 | 主要能力 |
|---|---|
| Boss／Owner | 公司級 Super Admin；人員、部門、策略、品牌建立、據點與機器等全域管理 |
| Staff | 在已授予的 App／Brand 範圍工作；建立及編輯實際創作資料 |
| 外部 AI Agent | 以獨立 service identity 與 Bearer token 經 HTTP／MCP 工作；沒有資料庫憑證 |
| Renderer | 執行明確 Render Job；不是業務資料擁有者，也不能自行改 Composition |

「Super Admin」描述身份與管理能力，不代表可在 UI 繞過資料歸屬、跨機信任或審計規則。

### 3.3 據點與機器

- 保持現有 Boss Portal 全域入口，不在 Marketing Design 內另造機器管理。
- 入口位於公司／Boss 管理區；權限依現行 owner／super admin 規則及最新正式文件。
- 總部目錄、入口或批准不等於另一部機自動授予本機身份權限。
- 不在創作 UI 加公司切換器、跨機即時查詢或虛構在線狀態。

---

## 4. 完整業務流程

```text
人輸入原始工作要求
  → 建立 Project＋不可變 Project Request
  → Agent 或人整理 Brief
  → 選取目前 Brand，並在 Composition 建立時固定 Brand Release
  → 搜尋及選擇 Materials
  → 搜尋及選擇 Knowledge Doc／Version／Chunk
  → 按 Project Format 選擇 Template versions
  → 建立 Composition version
  → Lint／來源檢查
  → 建立 HyperFrames Render Job
  → Renderer 讀取固定 Composition＋Brand Release＋原始素材
  → 產生逐頁 PNG 與 ZIP
  → Output／Output File 寫入 MinIO 與 Postgres
  → Provenance 記錄所有來源、版本、actor 與 render 資訊
  → 人預覽、下載或建立下一個 Composition revision
```

### 沒有外部模型時

系統可以使用**確定性組稿**：

- 文案只取 Project、Brief 及真實 Knowledge chunk。
- 素材只取使用者或 Agent 實際選擇的 Material。
- 缺 Knowledge 時回報 `knowledge_required`，不可虛構內容。
- UI 不可寫成「AI 正在思考」或假裝模型已完成工作。

### 修訂

- 原 Composition 與 Output 不變。
- 由舊 Composition 建立新版本，保留修改者、時間與來源。
- 局部改封面不應無故重寫所有內頁。
- 新 Render 必須指向明確 Composition version。

---

## 5. 核心資料對象

| 對象 | 責任 | 關鍵規則 |
|---|---|---|
| Project | 一件持續可找回的創作工作 | 屬一個 Brand、一個 Format；Library 的基本單位 |
| Project Request | 人最初輸入的要求 | 不可變，不被 Brief 覆寫 |
| Brief Version | 整理後的目的、受眾、內容與限制 | append-only；記 actor 與 request identity |
| Agent Run | 哪個 Agent 何時接手及做到哪裡 | 與真人操作分開記錄 |
| Brand Page Version | 品牌穩定規則 | typed payload、版本鏈；Brand 模組擁有 |
| Brand Release | 一次創作使用的品牌頁版本組合 | Composition 建立時固定 |
| Material | 原圖、預覽、描述、來源與技術資料 | 必須屬目前 Brand；原檔可讀回 |
| Knowledge Doc | 一份知識的穩定身份與目前版本 | 搜尋、文件樹及狀態管理入口 |
| Knowledge Version | 某版 Markdown、metadata 與 sources | append-only |
| Knowledge Chunk | 可引用及檢索的具體段落 | 引用必須對上 doc/version/chunk |
| Template | 某 Format／Role 的可重用版型契約 | id、version、slots、限制與 manifest |
| Composition | 一次作品的 typed slides 與所有 refs | 作品真相；保存 lint 與版本鏈 |
| Render Job | 一次對指定 Composition 的輸出請求 | queued／running／succeeded／failed 等真實狀態 |
| Output | 一次成功產出的作品集合 | 指向 Project 與 Composition version |
| Output File | PNG、ZIP 等實際檔案 metadata | 檔案必須存在、可讀、可下載及可驗證（含 sha256） |
| Provenance | 成品為何如此生成的來源鏈 | 品牌、素材、知識、模板、渲染與 actor 均可追 |

### Project Format

目前共用三個值：

```ts
'carousel' | 'presentation' | 'video'
```

- Video 包含日後 Instagram Reels 等短影片工作。
- 三種格式共用 Project、Brief、Library、來源與權限骨架。
- **只有 Carousel 目前正在實作完整 Composition／Render。**
- Presentation 與 Video 可以建立、分類及管理 Brief，但不可顯示未實作的 Carousel 編輯器或假 Render 按鈕。

### Project State

對外狀態由事實推導，建議推導規則如下（**實作須與此一致，若程式現行定義不同，先查明再改本表**）：

| 狀態 | 推導條件 |
|---|---|
| `awaiting_agent` | 有 Project Request，尚無 Agent Run 認領，也無 Brief |
| `planning` | 已有 Agent Run 或 Brief，尚無 Composition |
| `waiting_materials` | Brief 已有，但 Composition／Lint 回報缺 Material 或 Knowledge |
| `ready_to_render` | 有通過來源檢查的 Composition，且無 active Render Job、無 Output |
| `rendering` | 存在 queued／running 的 Render Job |
| `produced` | 存在成功 Output，且尚未被人標記收到 |
| `received` | 人已明確確認收到（下載或按「已收到」）；不代表對外發布 |

Composition、active Render Job 及 Output 必須參與推導；UI 不可自行維護另一份狀態。有新的 Composition revision 時，狀態依最新 Composition 重新推導，但舊 Output 仍可在 Outputs 找到。

**程式核對（2026-11-17，[本機工作樹]）：**上表是產品目標，不是現況驗收。目前 `deriveProjectState()` 的實際優先次序為 `received → produced → rendering → waiting_materials → ready_to_render → planning → awaiting_agent`，並有以下未接通差距：

1. Store 傳入的 `openNeedCount` 目前固定為 `0`；Composition／Lint 缺料也未轉成 Needs，因此 `waiting_materials` 尚未按上表工作。
2. `hasCompleteComposition` 目前只檢查是否有 Composition id，沒有證明來源檢查或 Lint 通過。
3. `receivedAt` 目前固定為 `null`；下載與「已收到」都尚未形成收回事實，因此實際 Project 不會由 Store 進入 `received`。
4. `hasOutput` 的判斷先於 active Render Job；有舊 Output 時，新 revision 正在 Render 仍會顯示 `produced`。
5. 目前只查 latest Output 是否存在，沒有比較它與最新 Composition revision，因此「新 revision 後重新推導」尚未實作。

施工時應先補事實來源與測試，再把這段標為已接通；不可只改狀態文字。

---

## 6. 五個永久模組與各自責任

五個入口必須一直可見：

```text
Create｜Brand｜Materials｜Knowledge｜Templates
```

Needs、搜尋、語言、通知、幫助及帳戶屬全域外殼，不是第六個業務模組。

### 6.1 Create

分成兩種清楚不同的工作模式：

#### Project Library：找作品

- 顯示目前 Brand 的所有 Projects。
- 可搜尋標題及管理工作上下文。
- 左側以 All Projects、Carousel、Presentation、Video 等真實格式分類及數量組織。
- Outputs 是已完成成品入口，不是另一批 Project。
- 右側使用老闆最新參考圖的**緊湊視覺預覽卡**，不是巨型展示卡，也不是只有文字的密集表格。
- 有真實 Output 時顯示第一張真實 PNG 作預覽。
- 未有 Output 時顯示明確的格式／標題 cover fallback，不可放 Unsplash 假作品。
- 每張卡顯示標題、Brand、格式、真實狀態、Brief／版本或更新資訊，並可進入 Editor。
- Library 必須能承載大量 Project；搜尋、分類與路由不可只在幾張示範卡上成立（分頁或虛擬捲動）。

#### Project Editor：做作品

- 預設進入「創作」而不是 Brief。
- Carousel Editor 包含頁序列、中央 4:5 畫布、右側內容編輯及來源狀態。
- 可選 Materials／Knowledge、自動組稿、直接編輯標題／正文／CTA、儲存新版本、發起 HyperFrames Render。
- Outputs tab 顯示真實 PNG／ZIP 與 Provenance。
- Brief tab 保留原始要求、現行 Brief 與歷史版本。
- AI Agent tab 顯示真實 Agent 狀態、MCP 配置與可用工具，不把 Agent 資訊塞進 Brief 閱讀區。

### 6.2 Brand

- Brand Home 是品牌中樞與摘要，不建立第二套品牌規則。
- 固定頁與自定義頁沿用現有 typed payload 和版本鏈。
- 左欄列出目前品牌的實際頁面與分組，方便直接切換。
- 顏色、字體、Logo、語氣等規則由各來源頁擁有；Composition 只引用固定 Release。
- 不把一次 campaign 的目標、CTA 或方向候選自動寫入品牌真相。

### 6.3 Materials

- 提供實際上載、搜尋、列表、預覽及資料編輯。
- 左欄是有功能的來源分類，不是重複導航。
- 原圖、preview、描述、tags、來源與尺寸要可追。
- View／Edit／AI Agent 使用同一份 Material 資料。
- 第一條閉環以 PNG／JPEG／WebP 圖片為主；影片 Segment、VLM 描述與完整權利系統不可假稱已完成。
- Render 前須檢查圖片解像度是否足夠覆蓋其在 1080×1350 畫布上的使用尺寸（研究稿建議不低於輸出尺寸 80%），不足時在 Lint 提示，不阻擋。

### 6.4 Knowledge

- 主左欄使用**可搜尋、可展開的文件樹**，符合老闆最新 Knowledge 截圖。
- 文件樹直接驅動右側文件選擇，不在內容區再放一個重複的文件列表側欄。
- 可按全部、未核對、已核對、過期等真實狀態過濾。
- 主區顯示文件 metadata、來源、版本、Markdown、chunks 與引用。
- View 用於閱讀；Edit 用於新增文件或明確追加目前文件的新版本；AI Agent 提供精簡可執行資料。
- 「新增」與「編輯」不可共用含糊的 fallback selection；新增時不得誤存到另一份文件。
- Knowledge 核對是證據狀態，不是作品發布審批。

### 6.5 Templates

- 依內容格式分類，顯示真實存在的模板。
- Carousel 第一組是三件套：cover／body／cta。
- 每個模板顯示 id、version、role、slots、required／optional、字數限制與 Agent manifest。
- Presentation／Video 未有模板時顯示誠實空狀態，不顯示 Carousel 卡片冒充跨格式支援。
- 完整 Template Studio、fixtures 管理與 AI 改版不是目前第一閉環的額外前置。

---

## 7. UI 資訊架構正本

### 7.1 全域頂欄：保留，不重新發明

沿用現有 Frame，包括：

- App selector
- Brand selector
- 五個永久模組入口
- Needs
- 既有搜尋／語言／通知／幫助／帳戶等全域入口
- 左下公司身份與 Boss 管理入口

原因：這些控制承載多 App、多 Brand、身份、Needs 及公司級能力，不是 Project 工具列。格式選擇不得搬進全域頂欄。

### 7.2 第二層與左欄分工

- 第二層只放目前模組少量、有意義的工作上下文切換；Create 可切換作品格式。
- 左欄負責目前模組的實際 Library、資料夾、文件、頁面與搜尋。
- 不可把所有格式、文件與工具都擠進第二行 tabs。
- 不同模組必須有不同且有實際用途的左欄。

| 模組 | 左欄內容 |
|---|---|
| Create | Library 搜尋、All Projects、格式資料夾與數量、Outputs |
| Brand | Brand Home、固定頁、自定義頁與分組 |
| Materials | 搜尋、全部素材、實際來源分類 |
| Knowledge | 搜尋、狀態分類、可展開文件樹 |
| Templates | 內容格式分類與真實模板集合 |

### 7.3 Library 與 Editor 不可混為一頁

```text
Project Library
  搜尋／資料夾／格式／預覽卡／狀態
        ↓ 選一件作品
Project Editor
  頁序列／畫布／內容／來源／Render／Output
        ↓ 返回
原本 Library 位置與格式上下文
```

### 7.4 View／Edit／AI Agent

這不是三份內容，而是同一份資料的三種工作方式：

- **View**：快速理解內容、來源、版本與狀態。
- **Edit**：人類直接修改並保存新版本。
- **AI Agent**：精簡、結構化、可執行的工作契約；包括 ids、版本、限制與允許動作，不是把整個頁面 HTML 複製給模型。

### 7.5 視覺與互動

- 乾淨、現代、克制，以內容密度和清晰層級為先。
- 保留既有全域設計語言；內容區使用共享 design tokens，不在模組 CSS 再寫一套色值。
- 不用紫色漸層、emoji、無意義玻璃效果或裝飾性 Dashboard 圖表。
- 每個頁面要有 loading、empty、error、success 與 permission 狀態。
- 主要動作名稱對應真能力，例如「儲存為新版本」「用 HyperFrames 產生 PNG」。
- 所有入口最終都要在真實 UI 走通；不能只靠程式推斷可用。

---

## 8. Carousel Composition 契約

### 8.1 基本結構

- 3–10 頁。
- 第一頁 role 必須是 `cover`。
- 最後一頁 role 必須是 `cta`。
- 中間為一個或多個 `body`。
- 每個 body 頁至少要有一個真實 Knowledge citation。
- 第一條驗收作品為五頁：封面＋三個知識內頁＋CTA。

### 8.2 每版 Composition 必須固定

- Project 與 Format
- Brand Release
- Slides 與順序
- 每頁 Template id／version
- Material ids 與使用位置
- Knowledge docId／versionId／chunkId
- 文案與 CTA
- Lint 結果
- Actor、request identity、建立時間
- 前一版 Composition（如屬修訂）

### 8.3 檢查原則

- Material 必須屬目前 Project Brand。
- Knowledge doc／version／chunk 必須互相匹配。
- 引用不可因列表顯示而自動變成可信；必須指向真實資料庫記錄。
- 缺料應顯示明確問題；不可生成無來源醫療、法律或效果承諾。
- 檢查結果與 Render 是否成功是兩件事，不可互相冒充。
- Lint 項目（沿用研究稿）：文字溢出 slot、對比度低於 WCAG AA 4.5:1、IG 安全區被侵佔、字體未載入、圖片解像度不足。Lint 只標記，不等同 Render 成功。

---

## 9. HyperFrames 正式 Render 路線

### 9.1 固定決定

- Renderer 是 **HyperFrames**（HeyGen 開源的 HTML→影片／畫面框架），不是自行命名的一套截圖器。
- 目前實作固定 CLI version：`0.9.56` **[待實測：官方文件僅說明「以安裝版本為準」，須在 Docker 以 `hyperframes --version` 確認此版本存在且可安裝]**。[本機工作樹] `package-lock.json` 的確鎖定 `hyperframes@0.9.56`；這只證明依賴已安裝並鎖版，不證明 Docker CLI 或 Render 可用。
- Carousel 根尺寸：每頁 **1080×1350**，根元素必須有明確像素尺寸。
- HTML composition 包含多個 timed scenes 與單一 paused GSAP timeline，註冊於 `window.__timelines["<composition-id>"]`，頁面載入時同步建立。
- 正式流程先 `hyperframes check`，再按每頁時間點執行 `hyperframes snapshot`。
- 不使用另一套 renderer 冒充 HyperFrames；如日後有降級路徑，必須在 UI 和 Provenance 明示。
- **輸出倍率決定：** 交付 PNG 以 1080×1350 為準，不採用研究稿 `01-Hyperframes` 的預設 2x（那是 PPT 用途）。如日後要 2x，另立 Output Profile，並在 Provenance 記錄。

### 9.2 指令對照

官方文件 [已驗證]：`npx hyperframes check`（瀏覽器、版面、動態、對比檢查，支援 `--json`）、`npx hyperframes snapshot --at <t1,t2,...>`（擷取指定時間點 PNG，不需完整 render）。官方 skill 指出需要 **Node.js 22+ 與 FFmpeg**；snapshot 預設輸出於 `.hyperframes/artifacts/snapshots/`。

目前實作命令形狀：

```text
hyperframes check --json --no-cache --no-craft --timeout=60000
hyperframes snapshot --at=0.5,1.5,... --no-end --output=<dir> --json
```

其中 `--json`、`--at` 屬已驗證用法；**`--no-cache`、`--no-craft`、`--timeout`、`--no-end`、`--output` 在我檢視的官方頁面摘錄中未見，標為 [待實測]**。實施前執行 `hyperframes check --help` 與 `hyperframes snapshot --help`，以實際輸出為準；若旗標不存在，CLI 會報錯，必須移除而非忽略。

### 9.3 Render 輸入

由固定 Composition version 產生臨時 HyperFrames project：

- `index.html`
- `hyperframes.json`
- `meta.json`
- 本地 `assets/gsap.min.js`
- 所需品牌字體與素材原件

渲染不可依賴外部網絡偶然成功；字體、Script、圖片與瀏覽器環境必須可重現。HTML 規則（官方「靜默錯誤」清單）：不用 `Date.now()`、未設種子的 `Math.random`、網絡請求；不用 `repeat: -1`；不 tween `display`／`visibility`；全螢幕背景放在鋪滿的子元素而非根元素；跨檔案 id 不可重複；文字內不用 `<br>`；截圖前等 `document.fonts.ready`；每頁在「動畫完成」時間點取格（研究稿 `settled` 規則），避免截到入場動畫半途。

### 9.4 Output

預期儲存：

```text
outputs/{projectId}/{jobId}/slide-01.png
outputs/{projectId}/{jobId}/slide-02.png
...
outputs/{projectId}/{jobId}/ig-carousel.zip
```

每個 PNG 必須檢查實際像素尺寸（1080×1350）與頁序；ZIP 必須實際包含完整頁組並記錄 sha256。失敗時：

- Render Job 標記 `failed` 並保存真錯誤。
- 清理已上載的孤立檔案。
- 不建立假的成功 Output。
- UI 顯示可理解失敗狀態。

### 9.5 目前尚未越過的關鍵阻塞

Mac 實測中，自訂 Composition 與官方 blank project 均出現：

```text
Requesting main frame too early!
```

曾嘗試調整 timeline duration、`--no-browser-gpu` 與系統 Chrome，仍未解決；本機 `doctor` 亦顯示 FFmpeg／FFprobe 環境缺口。

**根因線索（推斷，[待實測]）：**這條錯誤訊息是 Puppeteer 的已知錯誤（公開問答中描述為在選取元素或等待 selector 時過早存取 main frame）。由於官方 blank project 同樣失敗，較可能是**本機 Chrome／Puppeteer 版本、頁面導航競態或環境（含 FFmpeg 缺口）問題，而非 HeadX Composition 本身**。排查順序：

1. 先補齊 FFmpeg／FFprobe，執行 `hyperframes doctor` 至全綠。
2. 確認 Node.js ≥ 22。
3. 使用 HyperFrames 自行管理的 Chrome，而非系統 Chrome，並在 Docker 內重試。
4. 先官方 blank project，再 HeadX Composition。
5. 記錄真命令、完整錯誤與根因。

**因此目前不能宣稱 HyperFrames 已成功出圖。** 下一步是在預定 Docker／Linux 環境驗證完整 CLI、Chrome、字體及 FFmpeg 依賴，並實際打開輸出檔案。Docker 內以非 root 執行 Chrome 時，注意 sandbox 與 `--no-sandbox` 需求、共享記憶體（`/dev/shm`）大小及 CJK 字型安裝（否則中文會變方塊）。

---

## 10. HTTP API、MCP 與 Creative Skills

### 10.1 共用業務入口

Browser 與 Agent 可以走不同 adapter，但必須共用：

- Agent Bearer token／人類 session
- App grant 與 Brand scope
- Postgres／MinIO
- Carousel Store 與 Project Store
- 冪等、版本、audit 與 Provenance
- 同一個 `renderCarousel()` 業務流程

### 10.2 MCP

正式 Transport：**Streamable HTTP**，單一端點 `/mcp`，使用官方 `@modelcontextprotocol/sdk` [已驗證：Streamable HTTP 自 2025-03-26 規格取代舊 HTTP+SSE，要求單一 endpoint；客戶端每個 JSON-RPC 訊息以 HTTP POST 送出，Accept 須同時列出 `application/json` 與 `text/event-stream`]。

**協議版本釘選（新增）：**MCP 規格草案已出現 2026-07-28 修訂，改變了 Streamable HTTP 的行為（例如每個 POST 須帶 `MCP-Protocol-Version` 等請求 metadata header，伺服器對客戶端互動改用 MRTR）。因此：

- 在 `HANDOFF.md` 記錄目前實作的 MCP 協議版本與 SDK 版本。
- 驗收用的「官方 MCP client」必須與該版本相符。
- 若升級 SDK 或協議版本，須重跑 initialize／tools／resources 驗收，並確認舊 client 向下相容。

[本機工作樹] `package-lock.json` 目前鎖定 `@modelcontextprotocol/sdk@1.32.2`，server 與官方 client 測試使用同一 package。實際 initialize 協商出的 MCP protocol version 尚未記錄，不可由 SDK 版本自行推斷；須在下一次整合驗收讀取並記錄。

Resources：

- `headx://create/guide`
- `headx://hyperframes/guide`

核心 Tools（命名統一用底線；研究稿的 `brand.get_rules`、`asset.search`、`hf.*` 為舊命名，不再使用）：

- `create_map`
- `brand_get_rules`
- `asset_search`
- `kb_search`
- `kb_get`
- `template_list`
- `project_get`
- `project_claim`
- `brief_submit`
- `composition_submit`
- `job_submit`
- `job_status`
- `review_checklist`
- `tool_doctor`

`job_submit(type='hyperframes')` 必須與 UI 使用同一條 Render 業務鏈。

### 10.3 L0–L3 漸進式讀取

| 層級 | 內容 | 目的 |
|---|---|---|
| L0 | 品牌與創作地圖、數量、能力與限制 | 開始工作，不一次讀完整資料庫 |
| L1 | Material／Knowledge／Template 搜尋卡片 | 以 id、summary、tags、狀態收窄 |
| L2 | 選中項目的詳情與 Knowledge chunks | 判斷是否適用及建立引用 |
| L3 | 原圖、完整 Markdown、完整原件 | 只在精確製作或視覺判斷時讀取 |

### 10.4 Creative Skills

`headx-creative-pack-MCPSkill` 中的 creative-director、brand-guardian、hyperframes-production 等是 Agent 工作指引：

- 它們不擁有另一份業務資料。
- 不可繞過身份、版本、來源或權限。
- 不可把「建議」自動變成品牌真相或人類決策。
- 正式交付要驗證實際 MCP client 合約，而不是只檢查 `/mcp` route 存在。
- 官方 HyperFrames skills 須與 CLI 版本一致（`npx hyperframes skills update`），以安裝版本為準。

---

## 11. 技術架構與資料一致性

### 11.1 技術棧

- Frontend：React＋hash routing
- Backend：Fastify＋Postgres
- Shared contracts：`packages/contracts`
- Shared shell：`packages/app-shell`
- Design tokens：`packages/design-tokens`
- Storage：MinIO／Storage interface
- Renderer：HyperFrames CLI（Node.js 22+、FFmpeg、Chrome）
- Agent interface：HTTP＋MCP Streamable HTTP

### 11.2 Append-only

以下歷史不可被普通 Update 改寫：

- Project Request
- Agent Run 歷史事實
- Brief Version
- Knowledge Version
- Composition Version
- Output
- Output File
- Provenance

Migration trigger 與 integration tests 要提供反證，而不是只靠程式習慣。

### 11.3 冪等

Project、Brief、Composition、Render Job 等寫入使用：

- `Idempotency-Key`
- request hash
- actor／request identity

同 key 同 request 應回同一結果；同 key 不同 request 必須拒絕，不可重複產生作品或 Render。

### 11.4 交易可見性

Transaction 內建立資料後，讀回必須使用同一 DB client；不可改用 pool 查一個尚未 commit、對外不可見的版本。

---

## 12. 目前真實施工狀態

最後整理：2026-11-17。以下是**本機工作樹 [本機工作樹]**狀態，不等於已部署給老闆使用。下列「曾通過」皆為歷史記錄，不是當前證據。

### 12.1 已有實際程式

- Project／原始要求／Brief／Agent Run 與版本 API。
- `ProjectFormat` 已接入 contracts、建立輸入、Store 及前端建立表單。
- Carousel migration：Material、Knowledge、Composition、Render、Output、Provenance。
- 確定性自動組稿。
- HyperFrames project 生成、Render orchestration、MinIO Output 路徑與失敗處理。
- Carousel HTTP API 與正式 MCP adapter。
- Creative Workspace、Materials、Knowledge、Templates、Outputs 頁面。
- Create Library 格式分類、搜尋與 compact preview cards。
- Knowledge 文件樹及明確 create-versus-version 行為。
- 非 Carousel Project 隱藏不適用的 Carousel Render 流程。

### 12.2 曾實際通過的驗證（歷史）

- Contracts、Platform、App Shell、Web builds 曾在相關修改後通過。
- 15 項 database／migration／Project／MCP integration tests 曾通過。
- Design focused tests 曾通過，涵蓋建立、Brief、格式過濾、搜尋、組稿、Render API 回饋與 Output。
- 58 項 shared-shell tests 曾通過。
- 67 項 i18n contract tests 曾通過。
- 官方 MCP client initialize、tools、resources 及同一份 Project 讀取曾通過。
- Knowledge 新增／追加版本 regression test 曾通過。

**注意：** 這些測試通過不涵蓋 HyperFrames 真實出圖；Render 相關測試若使用 stub／fixture，不可當作 Render 已驗收。

### 12.3 目前仍不能算完成

1. **HyperFrames 真實五張 PNG／ZIP 未驗收。**
2. **最新 migration 與 UI 尚未正式部署到 Docker 給老闆使用。**
3. 最後一輪 design-token CSS 搬移曾被中斷，必須重新 build、lint 與跑測試；不可沿用先前綠燈當作目前工作樹證據。
4. 完整測試曾發現舊 navigation assertions 與一個高並行 setup timeout；要分別收尾及確認。
5. 最新 Project Library／Knowledge 參考畫面尚未完整同步 Ardot。
6. HANDOFF、路由表、BACKEND FUNCTIONS MAP 與最終交付狀態仍有舊描述，完成部署時必須同步。
7. Presentation／Video／Reels 只有共同 Project 骨架，尚未有各自完整 Renderer。
8. 完整 Needs 交付／吸收、完整 Materials 權利系統、Posts／WordPress、Boss 跨模組摘要不是本條 Carousel 閉環已完成能力。
9. MCP SDK 套件版已在本機 lockfile 核對為 1.32.2；實際協商的協議版本仍未記錄（見 10.2）。
10. Project State 目標與現行 Store 有五項已查明的差距（見第 5 節程式核對），不得以狀態名存在就當流程已接通。

---

## 13. 現在唯一應執行的收斂順序

### Step 1：收尾目前工作樹

- 完成 Creative CSS 色值到 shared design tokens 的遷移。
- 重跑 contracts／platform／app-shell／web builds。
- 重跑 migration、Carousel、Project、MCP integration tests。
- 重跑相關 Web tests、完整 suite、i18n、lint、boundaries 與 `git diff --check`。
- 修真正由本輪引起的回歸；不再改產品架構。

### Step 2：在 Docker 打通真實 HyperFrames

- 對照 `docs/research/Tools/HYPERFRAMES.md` 與官方 CLI／Skills。
- 補齊 Linux image 的 Node.js 22+、Chrome、FFmpeg／FFprobe、CJK 字型與 HyperFrames（目標 0.9.56，先確認可用）。
- 以 `--help` 核對 9.2 所列旗標。
- 先用官方 blank project 證明環境（`hyperframes doctor` 全綠、`check`、`snapshot` 成功），再用 HeadX Composition。
- 記錄真命令、真錯誤與根因，不盲目換 renderer。

### Step 3：完成一個真作品

- 建立或選取一個 Carousel Project。
- 選真 Brand、Materials、Knowledge 與三件套 Templates。
- 建立五頁 Composition。
- 產生五張 1080×1350 PNG 及 ZIP。
- 實際打開每張圖檢查文字、頁序、素材與品牌，不只檢查 HTTP 201。
- 下載 ZIP，檢查檔案與 Provenance。
- 再做一次局部修訂，確認舊 Output 不變。

### Step 4：部署與可見驗收

- 套用 migrations，重建並啟動 Docker stack。
- 讓老闆從 Create Library 實際走一次建立、組稿、Render、預覽與下載。
- 最後才做一次針對性瀏覽器驗收，不重複無目的巡頁。
- 同步 Ardot、HANDOFF、DECISIONS、BACKEND FUNCTIONS MAP 與項目記憶。

**在 Step 3 完成前，不開始另一輪全站 UI 重設計，也不擴展到完整 Presentation／Video Studio。**

---

## 14. 第一條閉環 Definition of Done

只有全部成立才可說「完整 IG Carousel 已完成」：

### 使用者路徑

- [ ] 在正確 Brand 下建立 Carousel Project。
- [ ] 原始要求與 Brief 可讀回，重新整理不消失。
- [ ] 能選擇真 Materials 與 Knowledge。
- [ ] 能組成並直接編輯五頁作品。
- [ ] 能儲存 Composition 新版本。
- [ ] 能按真按鈕發起 HyperFrames Render。
- [ ] 能在同一 Project 看見五張實際 PNG。
- [ ] 能下載每張 PNG 與完整 ZIP。
- [ ] 能查看 Provenance。
- [ ] 能修訂並保留舊版 Output。
- [ ] Library 找回作品時顯示真實預覽及正確狀態。

### 檔案與來源

- [ ] 五張 PNG 都是 1080×1350，頁序正確。
- [ ] ZIP 可打開且包含同一組實際檔案（sha256 一致）。
- [ ] 沒有空白、純雜訊、錯頁或外部占位圖；中文字體正常顯示，無方塊字。
- [ ] 每個 body 頁引用真 Knowledge chunk。
- [ ] 使用固定 Brand Release 與 Template versions。
- [ ] 舊 Output 不因 Brand 或 Knowledge 後續修改而改變。
- [ ] Render 失敗不會留下假成功 Output。

### Agent 與工程

- [ ] 官方 MCP client 可完成同一條必要工作鏈。
- [ ] HTTP／MCP／UI 操作相同業務資料。
- [ ] 冪等、append-only、權限及交易測試通過。
- [ ] build、test、integration、lint、boundaries 全綠。
- [ ] 最新 Docker 部署與實際 UI 驗收完成。
- [ ] 文件與 Ardot 不再描述舊空殼為現況。
- [ ] MCP 協議版本與 SDK 版本已記錄於 HANDOFF。

---

## 15. 明確延後，不阻塞目前閉環

- 自動發佈到 Instagram／Facebook／其他平台。
- 完整權利審批、肖像授權 workflow 或多層作品 approval。
- Presentation 原生逐元素 PPT 編輯器（研究稿 A 級圖片 PPT 可作為日後第一版）。
- Video／Reels 完整剪輯、配音、音樂與 MP4 Render。
- 影片 Segment 切鏡與大型 VLM pipeline。
- pgvector 與大型統一索引平台。
- 完整 Template Studio 與大批量模板生成。
- Posts／SEO／WordPress 發佈鏈。
- 完整 Brand Foundation／Stage 0–4H 表單化。
- Needs dedupe、bundle、外判與通知升級。
- 跨機即時資料查詢或中央可寫業務資料庫。

這些項目可以在架構中保留位置，但不可令第一條 Carousel 閉環繼續等待。

---

## 16. 既定研究來源索引

不要再猜方案；需要細節時按主題讀以下來源：

| 主題 | 來源 |
|---|---|
| 整體工作與漸進式路由 | `docs/research/How HeadX work/` |
| Materials 與 L0–L3 | `How HeadX work/03-Materials-素材檢索.md` |
| Templates、slots、三件套 | `How HeadX work/04-Templates-模組.md` |
| Knowledge、chunks、citations | `How HeadX work/05-Knowledge與Posts.md` |
| Create、Composition、Output、Provenance | `How HeadX work/06-Create模組與漸進式路由.md` |
| HyperFrames HTML 管線 | `How HeadX work/01-Hyperframes-HTML轉PPT管線.md` |
| HyperFrames CLI 與環境 | `docs/research/Tools/HYPERFRAMES.md`；官方文件 https://hyperframes.heygen.com/packages/cli |
| Edit／View／AI Agent 與品牌階段 | `docs/research/Branding/` |
| MCP 與 Creative Skills | `docs/research/headx-creative-pack-MCPSkill/`；MCP 規格 https://modelcontextprotocol.io |
| App／Brand／權限／據點與機器 | `docs/product/SCOPE-MODEL.md`、`FRAME-UIUX-HANDOFF.md`、`MULTI-MACHINE-ACCESS.md`、`DECISIONS.md` |

研究原型可作業務依據，但不可把原型裡的本地 mock、SQLite、假 Output 或未執行 worker 當成已接通產品。注意：`Tools/HYPERFRAMES.md` 內的版本描述（v0.1.15）與規則已較舊，**以實際安裝版本與官方文件為準**。

---

## 17. 下一位 Agent 的開工規則

1. 先讀本文，不要只讀最後一則對話或一張舊 issue。
2. 明確說出目前在做哪一個縱切片，以及它如何通向真 Output。
3. 修改前讀實際相關程式；不重讀所有研究資料，不重新發明已拍板方向。
4. 每次改動都保持 UI、HTTP、MCP、DB 與文件的一致。
5. 不把程式碼存在、測試 fixture、job row 或設計稿當成作品已生成。
6. 不回頭改全域 App／Brand selector，除非老闆有新的明確決定。
7. 不把 Library 再改回大卡片牆，也不把 Knowledge 文件樹藏回內容區雙側欄。
8. 不新增沒有實際能力的 Presentation／Video 按鈕。
9. 每完成一個可驗收步驟，更新本文的現況、HANDOFF 與 `.workbuddy/memory/`。
10. 若發現本文與程式不一致，先查明並即時修正文件；不要讓下一個 session 再付一次理解成本。
11. 引用外部工具行為（CLI 旗標、版本、協議）時，必須標明 [已驗證] 或 [待實測]。

---

## 18. 最終要記住的核心

**我們不是在建一個有很多模組名稱的 App。**

我們在建一個能長期累積公司品牌與內容資產、讓人和 Agent 共同創作、每次都能找回作品與來源，並且第一時間真正交付可下載 IG Carousel 的系統。

目前資料骨架、MCP 與主要畫面已經推進很多，但**真正 HyperFrames 出圖及 Docker 可用版本仍是未完成的核心交付**。後續所有工作都應圍繞這個事實收斂，而不是再用更多設計或文件掩蓋它。

---

## 附錄 A：v4.0 → v4.1 變更記錄

| 位置 | 變更 | 原因 |
|---|---|---|
| 0, 0.1 | 新增驗證標記；明訂與研究稿衝突時以本文為準 | 避免未驗證內容被當事實 |
| 5 Project State | 補上各狀態推導條件，標明 `received` 含義 | 原文只列名稱，定義不明 |
| 6.3 | 加入圖片解像度 Lint | 對應研究稿 80% 規則 |
| 8.3 | 列出 Lint 項目 | 原文未具體 |
| 9.1 | 版本 0.9.56 標為待實測；決定輸出為 1080×1350（非 2x） | 官方文件未確認此版本；與研究稿 2x 衝突 |
| 9.2 | 區分已驗證與待實測旗標 | 官方資料僅確認 `check --json`、`snapshot --at` |
| 9.3 | 補官方靜默錯誤規則與字體等待 | 可重現渲染 |
| 9.5 | 補根因線索與排查順序、Docker 注意事項 | 該錯誤為 Puppeteer 類錯誤；FFmpeg 缺口與 Node 22+ 需求 |
| 10.2 | 新增 MCP 協議版本釘選；標明工具命名統一用底線 | 規格已有 2026-07-28 修訂；研究稿用 `.` 命名 |
| 12 | 明示「曾通過」為歷史；新增第 9 項未完成 | 避免舊綠燈被當證據 |
| 14 | 新增中文字體、sha256、MCP 版本記錄項 | 提高驗收可檢查性 |

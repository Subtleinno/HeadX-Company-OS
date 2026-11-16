# Marketing Design v3：產品、架構與開發藍圖

版本 v3.1 ｜ 2026-11-16 ｜ 追蹤：GitHub issue #93 ｜ 施工佇列：#94–#105

> 這份是 **Marketing Design app 的目標藍圖與單一領域入口**。它整合 `Perplexity idea/`、現行 Brand 實作及 Company OS 邊界，讓下一位 agent 不必重讀整個資料夾。
>
> 它**不會即時改變現行程式碼的現況**：現況仍以 `HANDOFF.md` 與程式碼為準；全域原則仍以 `CONCEPT.md` 為準；施工仍須遵守 `AGENTS.md` 與被指派的 issue。
>
> 本文的「已定」是由現行 Company OS 原則、已有程式或老闆今次明確要求直接支持的取捨；「建議」與「待拍板」不得被 worker 當成已拍板事實。

---

## 0. 下一位 agent 怎樣讀

### 開工前

1. 按 `AGENTS.md` 讀完全域入口文件。
2. 讀本文，理解 Marketing Design 的完整方向。
3. 只讀被指派 issue 列出的程式檔與 UI 畫面；不要重讀 `Perplexity idea/` 全部原型。
4. 只開工依賴已完成的 issue；本文不是一次過做完整個藍圖的授權。

### 三種狀態不可混淆

| 類別 | 意思 | 例子 |
|---|---|---|
| **現有能力** | 今日 repo 已有程式與資料表 | Brand typed payload、版本、gaps、輸出、Needs 基本列表與認領 |
| **v3 目標** | 今次要施工的新閉環 | Projects、Materials、Templates、Composition、Render、Provenance |
| **外部能力** | 不在此 repo 執行，只經介面接入 | LLM、VLM、HyperFrames、Blender、ComfyUI、外部 agent |

### UI/UX 正本

Ardot：`https://ardot.tencent.com/file/748070210348880`

設計檔內的畫面是 v3 施工參考；本文負責解釋對象、邊界、狀態與驗收。兩者衝突時，先停下在 issue 問清，不自行補規格。

---

## 1. 一句話與成功定義

**Marketing Design 是一個由人提出工作、外部 agent 組織可信資料與品牌規則、系統保存半成品與成品、人透過 Needs 補位，並能追查每個產出為何如此生成的創作作業系統。**

成功不是「Brand 有很多頁」或「畫面有 AI 按鈕」，而是：

- 一句要求能建立一個可追蹤的 Project。
- agent 能由少量索引開始，逐步選到正確品牌、策略、知識、素材與模板。
- 缺料會留下合法半成品及清楚 Needs，不會亂填或靜靜降級。
- 成品可 render、可修訂、可下載，且每個來源與版本都查得回。
- Brand 改版不會改寫舊成品；下一次修訂才選用新版本。
- Boss Portal 看見跨部門摘要，但不接管部門工作。
- 系統沒有模型或外發能力時，畫面會誠實講，不假裝已生成或已發布。

---

## 2. 為何 Brand v2 被判失敗

### 2.1 不是欄位不夠，而是作業對象不完整

現有 Brand v2/v2.1/v2.2 的強項是「一份品牌頁 payload，衍生 HTML、tokens、prompt、PDF」。但 Perplexity 原型描述的其實是完整生命週期：

```text
業務假設
  → 市場與品牌定位
  → 創意方向與感官世界
  → 語言聲音
  → 識別與設計系統
  → 專業製作
  → 渠道應用
  → 治理、使用與反饋
```

若只把這些階段繼續加成 Brand 固定頁，會造成四個問題：

1. **探索與真相混在一起。** 候選方向、未驗證假設與已選定規則看似同等有效。
2. **品牌與單次工作混在一起。** 一次 campaign 的目標、渠道、CTA 不應永久寫入品牌識別。
3. **資料頁與產出斷開。** Brand 填完後，沒有 Projects／Materials／Templates／Create 把它變成作品。
4. **頁面無止境增生。** Stage 0–4H 若逐項變成強制順序頁，會再形成一套很長、很難使用的表單。

### 2.2 必須保留的現有基礎

今次不是第三次無理由推倒。以下能力直接保留並擴展：

- 每頁一份 **typed payload**；HTML、tokens、prompt、PDF 是派生輸出。
- `brand_page_version` 只追加、不改寫歷史；現行版本由查詢算出。
- `brand_release` 保存各頁版號組合，供成品釘住來源。
- `PageSchema` 共通模式：

```ts
normalize(raw)
gaps(payload)
layout(payload)
tokens(payload)
prompt(payload)
```

- 色值只住色彩頁；其他頁與 renderer 只引用色彩角色。
- `document.gaps` 是缺口真相；`brand_gap` 只記 Need 關聯。
- 檢查為 `pass / fail / undetermined`，只報告，不阻止儲存。
- 閱讀態與編輯態分開；無權者不見假編輯入口。
- 現有固定頁鍵：`home`、`platform`、`color`、`type`、`logo`、`tone`、`image`、`mascot`、`examples`、`video-long`、`video-short`。
- 本地 migration `0024` 已把 mascot 從 image 搬到獨立頁，並以新增版本保留歷史。

### 2.3 不再沿用舊施工線

#89 的未完成項目屬舊 Brand v2.1 逐頁修補，不是 v3 閉環施工順序。已完成程式保留；未完成項目不應與 v3 issues 同時開工。是否保留個別修正，由對應 v3 issue 明確吸收，不由 worker 同時跟兩份清單。

---

## 3. 不可違反的產品邊界

1. **agent 是主要執行者，人是判斷者與補位者。**
2. **預設無閘。** 「人選定方向」是記錄決策，不是為所有儲存加 approval workflow。
3. **策略由老闆寫，agent 只選與跟。** agent 可建議修訂，不可自行改策略正文。
4. **業務資料由部門 app 擁有。** Boss Portal 不直接讀其他 app 的資料表。
5. **成品留在出身的 app。** 不回流成中央第二份真相；原料與成品不可混為一庫。
6. **平台殼只做切換、身份、註冊、事件。** 不把路由、模板、品牌頁等業務規則搬進 Frame。
7. **Needs 是正常人機協作，不是錯誤頁。** 上載或裁決後必須吸收，才算閉環。
8. **沒有來源不寫成事實。** 可以保存有 placeholder 的 composition，不可虛構品牌、知識或權利。
9. **對外發送永遠由人按下。** 第一版只做下載／複製，不做自動發布。
10. **此 repo 不執行 AI 模型。** LLM／VLM 是外部 client 或 provider；第一版不做 MCP。
11. **一個事實只有一個來源。** 索引、Boss 摘要、搜尋卡片均是可重建投影，不是可寫副本。
12. **畫面必須誠實。** 沒有 agent、render 或資料時顯示實際狀態，不畫假進度、假分數或假數字。

---

## 4. 核心對象與擁有權

### 4.1 對象總表

| 對象 | 負責回答 | 擁有者 | 備註 |
|---|---|---|---|
| **Brand Page** | 這個品牌穩定、可重用的規則是甚麼 | Marketing Design／Brand | 沿用現有頁與版本鏈 |
| **Brand Release** | 某次產出當時用了哪些品牌頁版本 | Brand | 現有快照概念 |
| **Brand Foundation Project** | 品牌建立／重塑時探索了甚麼、選了甚麼、證據是甚麼 | Create／Projects | 一種 Project 類型，不是另一個 app |
| **Project** | 今次要完成哪一件工作 | Create／Projects | 包括一般營銷與品牌建立工作 |
| **Brief** | 目的、受眾、渠道、格式、語言、限制、期限 | Project | 原始要求與 agent 整理稿要可分別追溯 |
| **Strategy Doc** | 這類工作應依循哪些標準 | 老闆；Boss Portal 編輯 | 多份、分層；agent 記錄選用版本 |
| **Asset / Segment / Description** | 有哪些原料；哪一段適合這個用途 | Materials | Segment 是檢索單位 |
| **Rights / Consent** | 這份原料能否在指定用途使用 | Materials | 不由畫面外觀推測授權 |
| **Knowledge Doc / Chunk / Citation** | 內容依據在哪份來源、哪一段 | Knowledge | AI 不可自行標 verified |
| **Template / Version / Slot / Fixture** | 這類版面有哪些可填位與限制 | Templates | HTML 版型＋manifest＋測試夾具 |
| **Composition / Version** | 今次作品如何填版、哪些地方留空 | Create | typed slots＋HTML；placeholder 合法 |
| **Output Profile** | 同一份 composition 要輸出成甚麼 | Create／Render | PNG、Carousel、PPT、PDF、MP4 等 |
| **Render Job / Output** | 哪次 render 產生了哪些檔案 | Create＋外部 renderer | renderer 不是業務真相 |
| **Provenance** | 成品用了哪些物件與版本 | Create | 品牌、策略、知識、素材、模板均可追 |
| **Need / Need Event / Need Link** | 哪件事需要人補位、如何回覆與吸收 | Platform＋所屬部門 | Boss 只看投影 |
| **Route Log** | agent 為何讀了、選了或拒絕了哪些資料 | Create | 用於除錯，不是另一份內容真相 |
| **Feedback / Revision** | 人收貨、手改或要求重做時改了甚麼 | Create | 形成下一次工作的輸入 |

### 4.2 三種「品牌相關工作」不可混為一談

| 類型 | 內容 | 完成後留下 |
|---|---|---|
| **穩定品牌真相** | 已選定的定位、語氣、色字標誌、圖像規則 | Brand Page 新版本；必要時形成 Brand Release |
| **品牌建立／重塑 Project** | 訪談、業務假設、候選定位、方向比較、未決問題 | 專案證據與決策；被選定的內容由有權者寫入 Brand Page |
| **單次營銷 Project** | campaign 目標、主題、渠道、CTA、期限、單次素材 | Composition、Output、Provenance、Feedback |

**硬規則：候選方向不可因存在於 Project 就自動成為 Brand 真相；一次 campaign 的選擇也不可自動改寫 Brand。**

### 4.3 Stage 0 業務資料的建議邊界

Stage 0 的產品、客戶、收費、渠道、市場、團隊、目標、限制、命名、資產與單位經濟資料，**不應全部複製進 Brand**。

建議：

- 原始訪談、假設、計算與證據留在 Brand Foundation Project。
- 對品牌創作有長期作用的已選定摘要，才提升為 `platform` 或其他 Brand Page 的欄位。
- 產品、價格、客戶、財務等已有公司主檔時，只保存來源引用與策略摘要，不建立 Marketing 的第二份主檔。
- 此邊界屬待拍板事項 U1；第一條 IG Carousel 縱切片不依賴 Stage 0 全量實作。

---

## 5. Brand v3：由資料頁變成品牌中樞

### 5.1 Brand Home 的五個責任

1. **看清品牌。** 立場、品牌一句話、目前 release、關鍵識別與語氣摘要。
2. **看清可用程度。** 哪些頁有現行版本、哪些有缺口、哪些檢查無法判斷。
3. **進入來源頁。** 每項摘要追到擁有它的頁與版本，不在 Home 建第二份規則。
4. **開始工作。** 以目前品牌建立 Project；品牌建立／重塑也由這裡發起。
5. **看見使用與影響。** 最近 Projects／Outputs、被哪些成品引用、哪些舊範例使用舊 release。

Brand Home 不是假儀表板，不顯示沒有資料來源的分數、完成率或趨勢圖。

### 5.2 固定頁與新增內容的取捨

第一條縱切片**不改寫現有十一頁 payload，也不先加一批新固定頁**。新內容按下列方式歸位：

| 原型內容 | v3 歸位 |
|---|---|
| Stage 0 業務探索 | Brand Foundation Project；選定摘要才進 Brand |
| Stage 1 定位、核心張力、Anti-Persona、信任依據 | 已選定位進 `platform`；候選、張力與反例留在 Project 作決策證據 |
| Stage 2 材質、光線、觸感、動態、情緒與反關鍵詞 | 建議日後增設可選 `direction` 頁；候選方向與同觸點比較留在 Project |
| Stage 3 Voice／Tone、語言規則、禁用詞、正反例 | `tone`；Voice 是固定聲音，Tone 是情境變化 |
| Stage 4A 識別任務、Logo、色彩、字體、輸出需求 | `logo`、`color`、`type`、`image`；方向候選仍在 Project |
| Stage 4B Surface、Pattern、印刷與工藝 | 可選 `direction`／自定義頁；打樣與授權記錄屬治理資料 |
| Stage 4C Motion、聲音、影片、字幕、節奏 | 現有 `video-long`／`video-short`；日後可評估獨立 `motion`，不屬第一版 |
| Stage 4D 產品、3D、CMF、BOM-lite | 後續專業模組；工程規格須專業人士驗證 |
| Stage 4E UI、服務、空間 | 後續可選專業模組，不塞進核心 Brand 表單 |
| Stage 4F 渠道、漏斗、內容結構、CTA、合規、成效 | Strategy、Templates、Output Profiles、Projects、Feedback；不是九十一個 Brand 頁 |
| Stage 4G 打樣、授權、命名、RACI、例外 | Release、Provenance、Rights、策略設定與事件記錄 |
| Stage 4H 風格庫、生成契約、參考圖、評估集 | `examples`、Template／Output provenance、生成記錄；不用主觀分數冒充品質 |

### 5.3 候選方向與「預設無閘」如何共存

- agent 可以建立多個 **AI 提案**，每個附理由、證據、風險與適用觸點。
- 候選方向必須用**相同內容、相同觸點**比較，不只比漂亮 moodboard。
- 人按「選用」記錄 `selected_by`、`selected_at`、理由；這是決策事實，不是多層批核。
- 有權編輯品牌的人仍可正常儲存 Brand Page；檢查不通過也不阻止。
- AI 不可把提案標成人已選定，也不可自行改寫策略正文。
- 上游核心方向改變時，系統列出受影響的模板、範例、composition 與 outputs；舊成品不自動重寫。

### 5.4 每個探索類別都有三個合法答案

`不適用`、`未決定`、`自訂`。

「不適用」不是缺；「未決定」才可形成 decision Need；「自訂」不能繞過型別、權利、安全與來源規則。

---

## 6. Create：由一句要求到成品

### 6.1 主流程

```text
人輸入一句要求
  → 系統建立 Project＋原始要求
  → 外部 agent 讀 L0 地圖，整理 Brief
  → 逐層選策略、知識、模板與素材
  → 寫 Route Log 與來源理由
  → 建立 Composition
       ├─ 缺料：保留 placeholder＋建立 Needs
       │     → 人交付／裁決
       │     → agent 吸收、入庫、回填
       │     → 重新檢查
       └─ 齊料：Lint＋檢查
  → 建立 Render Job（外部 renderer）
  → Output 存入 Create＋Provenance
  → 人收貨或要求局部修訂
```

### 6.2 Project 狀態是事實的投影

建議對外顯示：

| 顯示狀態 | 根據 |
|---|---|
| 待 agent 接手 | 有原始要求，未有有效 agent run／Brief |
| 規劃中 | agent 正在路由或整理 Brief |
| 等待補料 | 有未完成 Needs；composition 可已存在 |
| 可輸出 | 必要 slots 齊、沒有未處理的阻塞缺口 |
| 輸出中 | 有 queued／running Render Job |
| 已產出 | 至少一個有效 Output |
| 需修訂 | 有進行中的 Revision |
| 已收貨 | 有明確 `accepted_at` 事實 |

**不新增一個可由不同程式隨意寫入、最後彼此矛盾的萬能 status 欄。** 具體儲存與推導方式由 Project issue 定義及測試。

### 6.3 沒有 agent 時的誠實行為

- 「新增 Project」只保證要求已保存，不假裝 AI 已即時理解。
- 畫面顯示「等待外部 agent 接手」；可提供「複製請求」供人交給 agent。
- agent 離線是連線狀態，不自動開 Need；只有工作需要人的資料或判斷才開 Need。
- agent 回傳的 Brief、Composition 與建議均記錄 actor、時間與版本。

### 6.4 修訂不是由零開始

修訂保存原 composition，複製成新版本，只重新路由受影響部分。例：換封面相片不應重寫全部文案；改 Brand Release 時則要列出受影響 slots、規則與輸出。

---

## 7. 漸進式路由與索引

### 7.1 四層讀取

| 層 | 內容 | 使用時機 |
|---|---|---|
| **L0 地圖** | 品牌摘要、各模組索引、數量、最近更新、agent 能力與限制 | 每個 Project 開始 |
| **L1 卡片** | id、標題、summary、狀態、tags、必要 facets | 初步篩選；一次小批量 |
| **L2 詳情** | 選中頁的相關欄位、知識 chunk、Segment Description、Template manifest | 確定可能使用 |
| **L3 原件** | 完整 Markdown、HTML、原圖、影片、完整版本資料 | 必須精確複製或視覺判斷時 |

原型的 token 數字是**可配置初始建議**，不是寫死常數。預算由策略設定，每次超出要記理由。

### 7.2 選擇次序

1. 先用品牌、地區、語言、渠道、格式、權利等硬條件收窄。
2. 策略：品牌層 → 渠道層 → 格式層 → 步驟層 → 範例層。
3. 知識：只選有效、適用地區正確且狀態可用的文件與段落。
4. 模板：先硬過濾輸出與 slots，再按內容形狀、用途、品牌限制與系列關係選 Top-3。
5. 素材：按模板逐 slot 搜尋；先看 L1／L2，需要構圖判斷才看 L3。
6. 不合用可換說法重搜一次；仍缺就建立有規格的 Need，不無限搜尋。

### 7.3 索引只是投影

若採用統一 `index_card`，它必須：

- 由事件或重建程式從各模組真相生成。
- 可全量刪除再重建，不丟業務資料。
- 不允許前端或 agent 直接改卡片來修改原物件。
- 記錄 `source_id`、`source_version` 與索引更新時間。

第一版可先用各模組 L0/L1 API 組成路由 facade，避免為了「統一索引」再建一個過早的大平台。

---

## 8. Materials：可找、可用、可追的原料

### 8.1 模型

```text
Asset（原檔、技術資料、來源、權利）
  → Segment（相片一段；影片每鏡一段，含時間與關鍵幀）
  → Description（固定詞彙＋結構化欄位＋少量自由描述）
```

第一版只做**相片**：每張一個 Segment。影片切鏡、語音、音樂、圖像向量與 GPU 佇列延後。

### 8.2 入庫與使用

- 人手上載是主要路徑；Needs 交付也是重要入口。
- 原檔、縮圖與代理檔分開；原檔不可因代理檔可重生而降低備份等級。
- 去重、尺寸、方向、EXIF 等可由確定性程式處理。
- VLM 描述由外部 provider 回傳；系統保存 provider、模型、時間與結果版本。
- 人只處理地點不確定、肖像同意、權利不明、詞表新增等需要判斷的項目。
- AI 生成、圖庫、客戶提供與真人拍攝永久可分辨。

### 8.3 檢索與評估

```text
結構過濾 → 關鍵字／同義詞 → 可選向量 → 按用途與安全區重排
```

- 回傳卡片必附「為何入選」與權利／同意警告。
- 模組內搜尋與篩選是 Materials 功能，不是被禁止的全站搜尋。
- 建立 30–50 條真實查詢的黃金集，先看 **Recall@5、非香港／不可用誤入率、實際採用率**。
- pgvector、權重與模型選型必須由黃金集實測，不把原型公式當定律。

---

## 9. Knowledge 與 Posts

### 9.1 Knowledge 必須早於第一條完整閉環

原規劃把 Knowledge 放後，但第一條 IG Carousel 已要求「已驗證知識」，所以最小 Knowledge 必須提前：

- Markdown 正文＋frontmatter。
- 來源、擷取日、適用地區、有效期、`review_by`、語言與敏感級別。
- `unverified / verified / outdated`；AI 只能提交未驗證提案。
- 人核對來源後才可標 verified；這是證據狀態，不是通用審批鏈。
- L1 摘要、L2 chunk、引用 Citation；沒有依據的宣稱要標出。
- 法規與醫療資料只作提醒，不能冒充法律或醫療意見。

### 9.2 Posts 屬 Create 的輸出家族，不是知識真相

- Knowledge 是來源；Posts 是整理後文章。
- Posts 的編輯與輸出日後放 Create，與其他 composition 共用素材、知識引用與版本。
- 第一版文章輸出建議乾淨 HTML＋SEO 資料；Gutenberg 與 WordPress REST 延後。
- 外部發布始終由人操作。

---

## 10. Templates 與 Render

### 10.1 Template 的四個部分

1. `template.html`／CSS：版型與 slots。
2. `manifest`：家族、角色、輸出、slot 型別與限制、適用／避免情況、品牌需求。
3. `fixtures`：短文、長文、邊緣內容、缺圖與不同方向素材。
4. 版本與預覽：同一版本可重現，預覽由真實模板與品牌資料生成。

第一條縱切片只需要 IG Carousel 三件套：封面、內頁、CTA。完整 Template Studio、AI 草稿改版與跨渠道大批量模板延後。

### 10.2 品牌變身不是只換色

至少可由資料改變：

- 色彩角色與字體層級。
- Logo 模式與安全範圍。
- 圖形語言／ motif 與表面規則。
- 留白、對齊、區塊次序與版式節奏。
- 標題長度、敘事與語氣。
- 圖像選擇與安全區。

驗收不能只看兩張不同顏色的圖；至少要有兩項非色彩差異。

### 10.3 Composition 與 placeholder

- DB 保存 typed slot values、refs、template version、brand release、lint 與版本。
- HTML composition 可存 MinIO；它是同一版本的派生可讀稿，不另成可隨意修改的第二真相。
- placeholder 必須含 `need_id`、slot、需求規格與目前狀態。
- Need 吸收後建立新 composition version；不改寫已 render 的舊版本。

### 10.4 HyperFrames 與 Output Profiles

HyperFrames 是外部 Render 層，不是業務資料庫。

- scene 宣告 `still_at`；靜態輸出建議 `settled`。
- 等字體載入、檢查溢出與安全區；失敗要可見。
- 第一版輸出 `carousel-png`。
- PPT 先做每頁圖片的 A 級；混合型之後才做；原生逐元素轉換不作承諾。
- Blender 只接受模板 ID＋白名單參數；Lottie 入庫要檢查 expressions、腳本、尺寸與預覽。兩者均不在第一條縱切片。

---

## 11. Needs：完整的人機協作閉環

### 11.1 兩型與必填內容

| 型 | 人交付 | agent 必須先給 |
|---|---|---|
| `deliverable` | 檔案、資料、相片、影片、文字 | 用途、規格、數量、格式、為何需要、引用位置、驗收條件 |
| `decision` | 選擇、判斷、授權與理由 | **建議方案、依據、風險、選項與建議後的動作** |

每張 Need 只問一件事，並連到 Project 及 composition slot／Brand gap 等實際位置。

### 11.2 狀態與吸收

```text
deliverable：開立 → 待認領 → 進行中 → 已交付 → 已吸收 → 關閉
                              ↘ 需要補件，回進行中
decision：   開立 → 待認領 → 已裁決 → 已吸收 → 關閉
                       ↘ 需要更多資料，補完再裁決
```

- 不可由「已上載」直接當完成。
- 吸收包括結構化入庫、建立來源版本、回填 placeholder、重跑檢查與通知 Project。
- 吸收失敗要留在已交付並顯示實際錯誤，不能假裝關閉。
- Need Event 只追加；狀態與逾期盡量由事件與時間算出。

### 11.3 介面

- 頂欄 Needs：全app收件箱與「我負責」。
- 頁面右欄：只看此 Project／Brand Page／Composition 的相關 Needs。
- Need 詳情：要做甚麼、為何、規格、agent 建議、附件、回覆、吸收結果與完整事件。
- 拍攝 Need 可附構圖、光線、方向、留白、參考圖；參考圖預設不是可直接出街素材。

### 11.4 延後但保留位置

去重、Need Link、多 Project 共用、拍攝 Bundle、路線與日程、外判 magic link、批次 decision 與通知升級。它們不是第一條縱切片的隱藏前置。

---

## 12. Provenance、版本與反饋

### 12.1 每個 Output 必須能回答

- 用了哪個 Brand Release、哪些頁與版本？
- 選了哪些 Strategy Docs 與版本？
- 引用了哪些 Knowledge Doc／Chunk／來源？
- 用了哪些 Material Segments、權利與描述版本？
- 使用了哪些 Template versions 與 Output Profile？
- 哪個 agent／人做了甚麼決定？何時？
- 哪些 Needs 曾阻塞，如何被吸收？
- render log、lint、檢查結果是甚麼？

### 12.2 版本規則

- Brand Page、Knowledge、Template、Composition、Description 等內容版本只追加。
- Output 永遠釘住建立時的來源版本。
- 上游改變只產生「有新版／可能受影響」的提示，不靜靜改舊成品。
- 已核准範例保留當時版本；重用時先列出新舊差異。
- 可重建的索引、縮圖與預覽不冒充內容版本。

### 12.3 反饋不是主觀風格分數

記錄具體結果：採用、拒絕、手改、修訂原因、素材不合、文案無依據、模板溢出、權利缺失等。這些資料可改善排序與提出策略修訂草稿；不產生沒有證據的「品牌相符度 92 分」。

---

## 13. Boss Portal 與策略

### 13.1 總覽只看摘要

Marketing Design 經摘要介面提供：

- 活躍 Projects 與目前階段。
- 未完成、逾期、阻塞 Needs。
- 最近 Outputs 與待修訂數。
- 已配置的 schedule／deadline 摘要。
- 如老闆開啟特定批核項，才出現 approvals；否則不畫空批核儀表。

Portal 不讀 Brand／Project／Output 的業務表，不在 Portal 改期、指派、吸收或改 Project 狀態。點卡片進入 Marketing Design 處理。

### 13.2 甚麼可以在 Boss Portal 寫

- 既有帳戶與部門管理例外照舊。
- Strategy Docs／品牌頁策略由老闆在 Portal 編輯，因策略是老闆擁有的設定，不是 Project 業務操作。
- 公司級批核配置、權利預設與 agent／provider 設定由有權老闆管理；密鑰不可回顯。

### 13.3 全公司 Needs 是投影

不是把部門 Needs 複製成中央可寫表，也不是 SQL UNION 各部門私有表。各部門透過 Registry／platform 介面提供一致卡片與 summary；Portal 顯示並導向來源 app。

---

## 14. 資訊架構與 UI/UX 規則

### 14.1 頂層模組

```text
Marketing Design
├─ Create
│  ├─ Projects
│  └─ Outputs
├─ Brand
│  ├─ 品牌主頁
│  └─ 現有固定頁與自定義頁
├─ Materials
├─ Knowledge
└─ Templates
```

- Needs 住外殼，不另建第六個業務模組。
- Posts 日後是 Create 的輸出家族，不提前增加頂層 tab。
- Create 的 Project detail 是工作台；Outputs 是成品庫，兩者共用同一批 Project／Composition 對象。
- Brand selector 永遠選一個明確品牌，沒有「全部品牌」寫入上下文。

### 14.2 關鍵畫面

| 畫面 | 主要問題 | 主要動作 |
|---|---|---|
| Create／Projects | 現在有哪些工作，卡在哪裡 | 新增 Project |
| Project Detail | 這件工作的 Brief、來源、缺口、稿件與輸出是甚麼 | 依階段只有一個主動作 |
| Need Detail | 人要交付／判斷甚麼，agent 建議是甚麼 | 交付或裁決 |
| Materials | 有哪些原料，權利與適用性如何 | 上載素材 |
| Material Detail | 這段素材能否用於目前用途 | 修正權利／建立使用引用 |
| Knowledge | 哪些知識可用、過期或被引用 | 新增知識 |
| Knowledge Edit | 內容與來源是否完整 | 儲存新版本；有權者核對狀態 |
| Templates | 哪個版型適合這個用途 | 新增／檢視模板 |
| Template Detail | slots、fixtures、品牌預覽與 lint 如何 | 儲存草稿／建立版本 |
| Brand Home | 品牌目前是誰、可否用、最近如何用 | 用此品牌建立 Project |
| Brand Page | 這一頁決定甚麼、來源與缺口是甚麼 | 編輯並儲存新版本 |
| Boss Portal | 全公司工作與補位負載如何 | 導向來源 app |

### 14.3 Frame 視覺與互動硬規則

- Apple HIG、白底黑字、系統字體堆疊；chrome 只用黑灰白。
- `#0057FF` 只用於內容區主要寫入／確認動作與合法空狀態圖示。
- 無全站搜尋、無深色 UI、無紫色漸層、無 emoji。
- 平鋪內容用細線與留白分組；浮層才用柔和陰影。
- 1440／1024／768 三個寬度都要真瀏覽器驗收；768 單欄、次要面板變抽屜或堆疊。
- 不為「看起來豐富」加假圖表、假統計、假 badge 或裝飾性卡片。
- 每個資料畫面都要有 loading、empty、error、success、permission 狀態。
- 主要按鈕用真能力命名：`建立 Project`、`儲存新版本`、`建立 Render Job`；沒有模型執行時不寫「AI 立即生成」。
- 所有 API／資料層改動都必須有可見畫面入口與真瀏覽器路徑。

### 14.4 Edit／View／Agent 的落地方式

不增加一套混亂的全域三頁導覽：

- **View**：預設閱讀態，顯示決策、來源與狀態。
- **Edit**：有權者明確按編輯；儲存後回閱讀態。
- **Agent**：由伺服器同一 payload 生成的精簡輸出／抽屜，供複製與外部 agent API 使用；不是前端另砌一份摘要。

---

## 15. 外部 agent、模型與 provider 邊界

```text
Browser／Staff／Boss
       │
       ▼
Company OS API＋Permissions＋Postgres／MinIO
       ▲
       │ 同一套權限、版本與事件
       │
外部 agent（LLM 在 Company OS 外）
       │ 讀 L0–L3；提交 Brief、提案、Composition、Route Log、吸收結果
       │
外部 VLM／生成模型／HyperFrames 等 providers
```

- 第一版使用有權限的 HTTP 介面；MCP 是之後的可選 adapter。
- 外部 agent 沒有資料庫憑證，不可繞過 API 權限。
- 每次寫入帶 actor、request identity、來源版本與事件。
- provider 設定與密鑰不進 repo、日誌或 API 回應。
- 敏感素材能否送雲端由策略決定；provider 離線不可靜靜改走另一條路。
- 模型分工、成本與 token budget 以實測決定，不寫死某個模型永遠最好。

---

## 16. 第一條驗收縱切片

### 16.1 只驗證一件完整作品

**Moonic 滿月堂：一個關於經期前日常照顧的五頁 IG Carousel。**

- 香港真實生活場景、真人實拍、權利與肖像同意明確。
- 至少一份由合資格人士核對的 Knowledge，引用到具體段落；不作療效保證。
- 使用 Brand Release、三個 Carousel Template 角色與一個明確 Output Profile。
- 過程中刻意缺一张封面相片，完整走一次 deliverable Need 與吸收。
- 外部 agent 與 renderer 是實際接入的 client／provider；測試可用 fixture，但不可把 fixture 當生產整合成功。

示範內容只用於驗收，不可寫死成所有品牌的預設資料。

### 16.2 必經路徑

1. Staff 在 Create 輸入一句要求並建立 Project。
2. 外部 agent 讀 L0，整理 Brief，記錄所選策略。
3. agent 選取 Brand、Knowledge、Templates 與 Materials，留下 L0–L3 Route Log。
4. 封面缺圖：建立有拍攝規格的 Need，同時能預覽帶 placeholder 的五頁 composition。
5. Staff 在 Need 詳情上載相片；系統入庫，agent 完成 Description／Rights 檢查並吸收。
6. Need 只有在回填新 composition version 後才關閉。
7. 建立 Render Job，產生五張 1080×1350 PNG，存回 Create。
8. 人查看 Output、Provenance 與檢查，要求一次局部修訂，再產生新版本。
9. Boss Portal 看見正確摘要，點擊只導向 Marketing Design，不能在 Portal 改狀態。
10. 所有公開發布仍由人在外部平台完成。

### 16.3 完成閘

- 五張圖真實存在、可開、可下載，尺寸與頁序正確。
- 沒有無來源知識、過期權利、未處理 placeholder 或假品牌資料。
- Provenance 覆蓋所有品牌、策略、知識、素材、模板與輸出版本。
- 改 Brand 後舊 Output 不變；新 Revision 明確選用新舊 release。
- 同一模板套到第二個內容不同的品牌，至少有兩項非色彩差異且不崩版。
- Need 不可跳過吸收；重複交付與吸收失敗有可見處理。
- agent 離線、render 失敗、權限不足、空庫均有真實畫面。
- 1440／1024／768 無橫向溢出、文字裁切或無法觸達的 Needs。
- 真瀏覽器走完側欄、頁面按鈕與空狀態等所有新建入口，不只跑 API 測試。

### 16.4 必跑工程驗證

```bash
npm test
npm run test:integration
npm run lint
npm run lint:boundaries
npm run build
npm run deploy:build && docker compose up -d
```

另加相關 migration 反證、權限測試、Render provider 合約測試與 Playwright 路徑。未執行的項目必須如實列明。

---

## 17. 分期與施工依賴

### Phase 0：統一規格

- #93：本文、取捨、UI/UX、第一輪 issues。
- 完成前不開實作；舊 #89 不得與新線並行。

### Phase 1：工作骨架

1. **#94** Marketing Design v3 導覽、路由與誠實空狀態。
2. **#95** Project／Brief、外部 agent 接手狀態與 Project Detail；開工前須回答 U3。
3. **#96** Need 詳情、回覆、吸收與 Project 關聯。

### Phase 2：可信來源

4. **#97** Materials 相片入庫、Asset／Segment／Description、權利與詳情；開工前須回答 U5。
5. **#98** Materials 混合檢索、L1／L2、黃金查詢集與使用回饋。
6. **#99** Knowledge Markdown、來源、verified 權限、chunk 與 citation。
7. **#100** Templates manifest、slots、fixtures、lint 與 IG Carousel 三件套。

### Phase 3：組稿與輸出

8. **#101** Composition、placeholder、Provenance、外部 agent 寫入與修訂版本。
9. **#102** HyperFrames `carousel-png`、Render Job、Output 儲存與下載；開工前須回答 U4。

### Phase 4：中樞與整合驗收

10. **#103** Brand Home v3，接上目前 release、Projects、Outputs、Needs 與來源頁。
11. **#104** Boss Portal 的 Marketing Design／Needs 只讀摘要與策略入口。
12. **#105** 第一條 IG Carousel 全閉環、兩品牌差異、響應式、Docker 與文件驗收。

**實際施工次序是 #94 → #105，一次只開工一張，前一張 PR 合併後才開下一張。** 每張 issue 已列明 Ardot frame、Depends-on、現有程式範圍、明確授權的 platform／contracts 範圍、範圍外與先紅後綠驗收。若施工發現還需要未被授權的共享 UI、storage、provider 或 app-host 基礎設施，必須停下由規劃者另開獨立 issue，不可夾帶。

現況反證已納入 issues：Need 現時只有列表／summary／claim，沒有完整 detail、事件與吸收 API；Files 的員工讀取主要是自己上載的檔案，不可假設已支援部門素材／Output 共享；Boss 目前沒有四 shape 的 summary provider registry；repo 亦沒有正式 Playwright harness。以上都不是現成能力。

### Phase 5：縱切片證明後才擴展

- Need 去重、Bundles、拍攝清單、外判與通知。
- 圖片型 PPT、PDF、Posts／SEO、乾淨 HTML。
- 完整 Template Studio、更多社交格式與黃金集擴充。
- 影片 Segment、語音、音樂、GPU provider 佇列。
- Creative Direction 固定頁與完整品牌建立／重塑流程。

### Phase 6：專業與自我生長

- Motion、Sound、3D、Product、UI／Service／Space 等可選專業模組。
- Framework Engine：先手寫 Spec 驗證，再開放 AI 提議；啟用、L1 沙盒與 L2 晉級另決策。
- Recipes、使用統計與策略修訂建議。
- Blender、Lottie、更多 Render adapters。
- 外部發布接駁只在獨立授權後設計，且最後按發送永遠是人。

**刻意不一次開齊所有後續 issues。** 第一條閉環會暴露真實資料與 UX 問題；過早把 P5/P6 寫成施工命令，只會重複今次「各自很好、合起來不連」的問題。

---

## 18. 原始構思採納矩陣

| 來源／構想 | 決定 | 調整與理由 |
|---|---|---|
| Edit／View／Agent 三視圖 | **調整採納** | 同一 typed 資料；落地為閱讀、編輯與 server-generated Agent 輸出，不另造三套真相 |
| L0–L3 漸進式路由 | **採納** | token 數字可配置；索引是可重建投影 |
| Project Brief＋Route Log＋Composition＋Provenance | **採納** | 狀態盡量由事實推導；版本只追加 |
| Asset→Segment→Description | **採納** | 第一版只做相片；影片之後 |
| 混合檢索＋黃金查詢集 | **採納** | 權重、pgvector 與模型須實測 |
| Template slots／manifest／fixtures／lint | **採納** | 先三個 Carousel 角色，完整 Studio 延後 |
| 同模板跨品牌不只換色 | **採納** | 成為硬性驗收 |
| HyperFrames＋Output Profile | **採納** | 外部 renderer；第一版只做 Carousel PNG |
| 圖片型 PPT | **延後採納** | IG Carousel 證明後做；混合 PPT 再後 |
| Knowledge 來源、有效期、地區、verified | **採納並提前** | 第一條閉環需要已驗證知識；AI 不可自證 |
| Posts／WordPress 乾淨 HTML | **延後** | 歸 Create 輸出家族，不另建中央內容庫 |
| Needs 兩型、decision 先建議、已吸收才完成 | **採納** | 與 Company OS 核心完全一致 |
| Needs dedupe／Bundle／外判 | **延後採納** | 不阻塞第一條閉環 |
| Framework Engine | **延後** | 先證明手寫 schemas 與完整閉環，避免先造通用引擎再造產品 |
| Stage 0 商業與單位經濟 | **調整採納** | 留在 Brand Foundation Project；公司主檔不在 Marketing 複製 |
| Stage 1 定位、核心張力、Anti-Persona | **採納** | 選定事實與探索證據分層保存 |
| Stage 2 感官與材質方向 | **延後採納** | 建議可選 `direction` 頁；待 U2 拍板 |
| Stage 3 Voice／Tone | **採納** | 擴充現有 `tone`，不改歷史 slot key |
| Stage 4A 同內容同觸點比較候選 | **採納** | 是方向選擇的驗收方法，不是額外 approval gate |
| Stage 4B–4E 專業模組 | **延後** | 按品牌業務選用，不成全公司必經流程 |
| Stage 4F 十二渠道、九十一模板 | **作資料來源，非首期規格** | 平台政策與尺寸需持續查證；先一個渠道 |
| Stage 4G 治理 | **分散採納** | 落在 release、rights、provenance、策略與例外事件 |
| Stage 4H 生成契約與評估 | **採納** | 不採用主觀風格分數冒充品質 |
| Creative Director／Brand Guardian skills | **調整採納** | 只作外部 agent 工作指引；不得覆寫無閘、權限與不缺料原則 |
| Creative Pack MCP 原型 | **不視為現有能力** | 只有部分核心邏輯曾測試；完整 worker／MCP／自動觸發未驗收 |
| 全渠道自動發布 | **拒絕列入目前計劃** | 與對外發送由人按下的不變量不符 |

---

## 19. 待老闆拍板，不阻塞已界定的第一步

| ID | 問題 | 建議 | 何時必須回答 |
|---|---|---|---|
| **U1** | Stage 0 Business Context 的長期擁有者 | 探索留 Project；公司主檔只引用；選定品牌摘要進 Brand | 實作品牌建立／重塑前 |
| **U2** | 是否新增可選 `direction` 固定頁 | 是，但第一條縱切片後；先重用現有頁與 Project 候選 | 實作 Creative Direction 前 |
| **U3** | 外部 agent 第一版 HTTP 身份與授權形式 | 用 request-scoped service identity＋現有 policy，不給 DB 憑證 | Project issue 開工前 |
| **U4** | HyperFrames 的實際 endpoint、認證與本機測試拓撲 | 外部 provider；repo 只保存可配置 base URL 與安全契約 | Render issue 開工前 |
| **U5** | 員工上載素材的預設權利 | 不明預設「需確認」；公司自家擁有須老闆策略明確設定 | Materials issue 開工前 |
| **U6** | AI 生成圖作成品是否一律 decision Need | 建議公開用途預設需要；內部參考不必，最終由策略配置 | AI 生成素材前 |
| **U7** | pgvector 與中文／英文檢索方案 | 先結構＋關鍵字，黃金集 spike 後決定 | 向量檢索 issue 前 |
| **U8** | `Needs` 的產品顯示名 | 功能與 key 暫不改，避免無謂 migration | 純命名決定，隨時可後置 |

worker 不得把「建議」欄直接寫成已拍板規格；若某 issue 需要答案，應在該 issue 停下列出證據。

---

## 20. 現有文件與程式的遷移規則

### 20.1 文件責任

| 文件 | 責任 |
|---|---|
| `docs/CONCEPT.md` | 全域 Company OS 真相；本文不改寫它 |
| `docs/product/DECISIONS.md` | 新決策落地時追加；建議不得偷寫成已裁決 |
| `docs/product/HANDOFF.md` | 今日程式、路由與已完成能力；每張實作 PR 同步 |
| **本文** | Marketing Design v3 目標、對象邊界、分期與原始構思取捨 |
| `docs/product/ui/brand/` | 現有 Brand v2 的實作歷史與對照；不再是新 v3 整體方向正本 |
| `docs/product/MATERIAL-MODULE-PLAN.md` | 早期素材規劃；新工作以本文與對應 v3 issue 為入口，保留其中有價值的 provider／權利細節 |
| `Perplexity idea/` | 原始研究與原型；不再要求每個 worker 全讀，不把原型聲稱為現有能力 |
| Ardot 設計檔 | v3 目標畫面；施工 issue 必須指定相關 frame |

### 20.2 程式遷移

- 不修改已套用 migration；只新增。
- Brand 固定頁與 payload 遷移要保留舊版本，以新增版本搬資料。
- 不重寫已存在的 Brand Release、Output 或 Provenance 歷史。
- 目前主要業務實作仍在 `apps/web` 與 `apps/platform`；`apps/design` 只有 manifest。
- 新 issues 必須遵守現行 `web → api → domain → db` 與 package 邊界，不可假裝獨立 app-host 搬遷已完成。
- 若要搬入真正 `apps/design/src`，另立不改行為的遷移 issue，不夾在功能 PR。
- 新舊 UI 不得長期雙軌；每張 issue 說明取代哪個入口、保留哪些歷史路由與資料。

### 20.3 Git／GitHub 現況注意

- 本機曾有兩個 Brand v2.1/v2.2 恢復提交尚未出現在 GitHub `origin/main`。
- `Perplexity idea/` 目前是未跟蹤目錄。
- 因此「本機文件存在」不等於下一個 GitHub worker 能讀到；交付施工前要把相關文件與正確基線經 PR 發布。
- 不自動提交或推送原始 Perplexity 檔；是否把研究原文入庫由老闆另決定。

---

## 21. Worker 施工檢查表

每張實作 issue 都必須回答：

1. 這張只改哪一個對象與哪一條使用者路徑？
2. Depends-on 是否全部合併？是否拿到最新正確基線？
3. UI 對應 Ardot 哪個 frame？1440／1024／768 如何排列？
4. 資料唯一來源是甚麼？哪些只是投影？
5. 哪些是外部 agent／provider，repo 內實際只做甚麼？
6. 空、錯、離線、無權、缺料、重複提交如何顯示？
7. 版本、事件、Provenance、軟刪除與審計如何保留？
8. 哪個測試會先紅？如何證明它不是永遠綠的假檢查？
9. 使用者在 Docker 畫面哪裡看到改動？所有入口是否都走過？
10. 不做甚麼？是否把後期功能偷塞進第一版？

**任何規格空白或矛盾：停手，在 issue 寫證據與具體問題，不猜。**

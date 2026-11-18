# HeadX Brand 模組：五層（Layer）重構方案

版本 v4｜2026-11-18｜狀態：**已施工（步驟 1–7 完成，Docker 已部署）**

> 這份文件是「五層」重構的完整設計方案。老闆 2026-11-18 提出：現在把品牌分成「品牌總覽、
> 核心識別、治理、品牌集」是按 *stage 順序* 切，但真正該按 *用途層* 切。本文把那個想法
> 變成可施工的規格。
>
> **本文不是施工正本。** 施工正本仍是 `MARKETING-DESIGN-BLUEPRINT.md`。本文通過老闆審閱後，
> 才把決定合併進正本，並開 issue 施工。

---

## 0. 問題：現在錯在哪裡

現在品牌模組的導航主軸是 **stage 順序**：

```text
品牌總覽（01 定位、02 材質感官、03 語言語氣）
04A 核心識別        ← 品牌層固定項
04G 治理            ← 品牌層固定項
品牌集（可多套）
  04B 圖形表面
  04C 動態影音
  04D 3D 產品
  04E UI 與空間
  04H 風格庫與 AI
```

問題：**一個「用途產出物」被 stage 拆散在幾個不同地方**，而一個 stage 又同時餵幾個不同的
產出物。

| 例子 | 真相 |
|---|---|
| 色彩／字體 tokens | 住在 04A（`colorSys`／`typeSys`），但 04B 表面、04E UI 也有 token 級決定（`radiusScale`、`density`、`spacingBase`）。一個「tokens」事實散落三處。 |
| 動態 tokens | 04C 的 `easeStyle`／`motionScale` 是 token，但 04C 的 `videoFormat`／`storyStyle` 是「影片規格」，屬模板層。 |
| 守門規則 | 04G 治理有稽核，04H 有 `aiPolicy`／`provenance`，04B／04E 有對比檢查。同一個「檢查」職責散落三處。 |

結論：**stage 是「填寫順序」，layer 是「資產分類」。** 使用者（人與 agent）真正要找的是
後者——「我要呢個品牌嘅 tokens」，唔係「我要去 04A 加 04B 加 04E 湊出 tokens」。

---

## 1. 目標模型：五個層＋一個「不入層」

每個層是**一個會持續累積的產出物**，由若干 stage 的 *部分欄位* 供料。

| # | 層 | 一句話用途 | 由哪些 stage 供料 | 產出物 | 現況 |
|---|---|---|---|---|---|
| 1 | **design.md**（規則與原因） | 講「點解咁樣做」 | 01 定位、02 材質感官、03 語言語氣、04A 的識別方向／架構／Logo 概念 | 一份合併的設計說明（`.md`） | 材料齊，缺一份合併文件 |
| 2 | **tokens**（鎖死數值） | 講「數值係咩」 | 04A 色彩／字體／Logo 規格、04B 表面、04C 動態、04E UI、04D CMF | 一組 token 檔（色／字／間距／圓角／動態） | 大致齊全 |
| 3 | **模板**（限制版面） | 講「版面點限制」 | 04F 模板庫、04E 元件規格、04C 影片規格、04D 3D 運鏡規格 | 模板庫（cover／body／cta、元件、影片、3D） | 社群貼文已齊 |
| 4 | **範例**（教味道） | 講「咁樣算唔算好」 | 04H 風格庫、03 範例句 | 風格庫＋範例對照 | 偏弱，缺真實成品 |
| 5 | **檢查與視覺複核**（守門） | 講「點樣算合格」 | 04H 守門、04F 合規／披露／掃描、04B／04E 對比、04E 政策、04G 規則 | 檢查規則＋視覺複核 | 規則檢查有，視覺複核弱 |
| 6 | **未分類／待管理** | 收「狀態／紀錄／專業領域」 | 4A 登記狀態、4G 登記冊、4B 印刷、4E 空間、4D 工程 | 日後各自長成管理區 | 暫不歸五層 |

> **第六類「不入層」**：狀態／紀錄（登記冊）、印刷政策、實體空間、工程資料，都是
> 「帶狀態」或「專業領域」的欄位，不是五層任何一層的產出物。它們仍找得到、仍可管理，
> 但不污染五層產出物，日後可各自獨立成區（登記冊、印刷規格、空間規格、工程規格）。

### 1.1 每個層的「成熟度」作為第一眼狀態

層不是「填完/未填完」的 stage，而是**資產的成熟度**：

- **design.md**：缺一份合併文件（材料本身已齊）。
- **tokens**：大致齊全（要補「一份真正的 token 檔」而不是散落的選項）。
- **模板**：社群貼文已齊，影片／元件規格待補。
- **範例**：偏弱，缺真實成品。
- **檢查**：規則檢查有，視覺複核弱。

---

## 2. Stage → Layer 的精確對應

這是最需要老闆確認的一節。**鐵律：每個欄位只歸一個層。** 判斷準則不是看欄位名，
而是看它**回答的問題**：

| 欄位回答的問題 | 歸屬 |
|---|---|
| 「用多少／是甚麼數值」（色值、字號、圓角、間距、動態參數、CMF 色樣） | **tokens** |
| 「點解咁樣做」（宣言、理由、張力、個性、概念） | **design.md** |
| 「版面／規格點限制」（版型、元件規格、影片規格、3D 運鏡規格） | **模板** |
| 「咁樣算唔算好」（參考、風格庫、範例句） | **範例** |
| 「不可超過／必須達到」（門檻、政策、檢查規則） | **檢查** |
| 「狀態／紀錄」（有沒有向量檔、測試了沒有、核准紀錄） | **不入層**（登記冊／治理） |

### 2.1 design.md 層（規則與原因）

| 來源 stage | 貢獻欄位 | 備註 |
|---|---|---|
| 01 定位與張力 | 全部（品牌名、宣言、核心張力、反人格） | 純規則與原因 |
| 02 材質感官 | 全部（材質、感官描述、語氣形容） | 純規則與原因 |
| 03 語言語氣 | 語氣宣言、性格、語言規則 | 純規則與原因 |
| 04A 核心識別 | `arch`（架構）、`brief`（識別方向、個性刻度 `dials`、關鍵字 `keywords`） | 只取「方向與原因」 |
| 04A 核心識別 | `logoType`（Logo 類型）、`logoStyle`（Logo 風格）、`logoConcept`（Logo 概念） | Logo 的概念與風格屬 design.md |

### 2.2 tokens 層（鎖死數值）

**只收「用多少／是甚麼數值」。門檻、政策、狀態一律排除。**

| 來源 stage | 貢獻欄位 |
|---|---|
| 04A | `colorSys`（色票、角色、色值）、`typeSys`（字體登記與排版數值） |
| 04A | `logoVariants`（變體清單）、`langLockup`（雙語主次）、`clearSpace`（淨空間數值） |
| 04B | `radiusScale`、`elevation`、`fillOpacity`、`borderWidth`、`patDensity`、`patContrast`（目標比值）、`texBlend`、`focusRing`（焦點框寬度數值）、`bleed`（出血數值） |
| 04C | `easeStyle`、`motionScale`、`choreo`、`distance`、`gradProp`、`gradLoop`（可量化動態參數） |
| 04E | `density`、`spacingBase`、`typeBase`、`themeMode`、`iconStyle`（UI 數值） |
| 04D | CMF 色樣表（`c_primary`／`c_secondary`／`c_accent`／`c_ink`／`c_paper` 色值）、材質、表面處理（`cmf`） |

> 排除項（見 2.6）：`cmykPolicy`／`p3Policy`／`tacLimit`（印刷政策與上限，第一版標
> 「印刷專用，暫不入層」）；`vectorStatus`／`minSizeStatus`（狀態，非數值，歸登記冊）；
> `a11yTarget`（無障礙目標＝門檻，歸檢查層）；`hookRule`（內容規則，歸模板層）。

### 2.3 模板層（限制版面）

| 來源 stage | 貢獻欄位 |
|---|---|
| 04F | 模板庫（整組：cover／body／cta、尺寸、版型） |
| 04E | `navPattern`、`labelPos`、`errorPattern`（元件規格） |
| 04C | `videoFormat`、`storyStyle`、`shot`、`composition`、`lighting`、`capStyle`、`capContrast`、`sb1/sb2/sb3`（影片規格與 storyboard）、`hookRule`（開頭抓人規則，內容規則非數值） |
| 04D | 3D 風格（`style3d`）、運鏡（`cam3d`）、燈光（`light3d`）、渲染規格（`quality3d`、`lens`、`turntable`） |

> 排除項（見 2.6）：`targetPolicy`／`focusPolicy`（政策＝門檻，歸檢查層）；
> 4D 的 BOM／認證／測試（工程資料，不入層）。

### 2.4 範例層（教味道）

| 來源 stage | 貢獻欄位 |
|---|---|
| 04H | `lib`（風格庫）、`refs`（參考）、`models`、`gens` |
| 03 | `samples`（「像我們／不像我們」範例句，`on_voice`／`off_voice`）——**已確認是資料欄位，非靜態文字** |

### 2.5 檢查與視覺複核層（守門）

**只收「不可超過／必須達到」的門檻與政策。**

| 來源 stage | 貢獻欄位 |
|---|---|
| 04H | `aiPolicy`、`reviewLevel`、`disclosurePolicy`、`provenance`、`seedPolicy`、`refPolicy`（守門規則） |
| 04F | `disclosures`（披露）、`claimTypes`（宣稱類型）、`reviewFlow`（審稿流程）、宣稱關鍵字掃描 `scanText`、`altText`、`emojiPolicy`（合規／披露／掃描規則） |
| 04B | 對比檢查門檻（「文字對背景 ≥ 4.5:1」等——與 2.2 的 `patContrast` 數值分開） |
| 04E | `a11yTarget`（無障礙目標）、`targetPolicy`（觸控目標最小值）、`focusPolicy`（焦點外框政策）、對比檢查門檻（「元件 ≥ 3:1」等） |
| 04G | 治理規則（`prohibited` 禁止、`approval_mode` 核准模式） |

### 2.6 不入層（第六類：日後管理）

**新增一個「不入層」歸類**，把「狀態／紀錄／專業領域」欄位統一收在這裡，
五層之外仍找得到、仍可管理，但不污染任何一層的產出物。

| 來源 stage | 欄位 | 原因 |
|---|---|---|
| 4A | `vectorStatus`、`minSizeStatus`、`reg.logo`（Logo 登記狀態） | 狀態，非數值；性質接近登記冊 |
| 4G | 登記冊（打樣／授權／例外／RACI／核准紀錄） | 帶狀態的管理紀錄，不是規則 |
| 4B | `cmykPolicy`、`p3Policy`、`tacLimit`（印刷政策與上限） | 印刷專用，對社群貼文用處不大（README：CMYK 值只是近似，不能當官方印刷色） |
| 4E | `cctPolicy`、`cleanPolicy`、`crowdPolicy`、無障礙尺寸、門寬／通道／迴轉 | 實體空間體驗，與社群貼文產物無關 |
| 4D | BOM、認證提醒（`compliance`）、測試（`proto`）、供應鏈（`supply`）、永續主張（`sustainClaim`）、IP 狀態 | 工程資料；README：只作方向記錄，須由工程師／專業人士驗證，不是工程圖／BOM／認證文件 |

> 「不入層」是第六類，在左欄以「未分類／待管理」呈現，日後可各自長成獨立管理區
> （如登記冊、印刷規格、空間規格、工程規格），但現在不強塞進五層。

### 2.7 跨階段 token 衝突

4E 會讀取 4B 的圓角、陰影、邊框、焦點外框，並轉成元件規範。若兩邊都能改同一組
token，投影層必須**偵測衝突**（同一個 token 在兩個 stage 有不同值時，在 tokens 層
標示「4B 與 4E 衝突」，並指出來源，不靜默取其一）。施工時 `buildTokenFile()` 要
以 token 名為 key 做去重＋衝突偵測。

---

## 3. 資料層：層是投影，不落表

### 3.1 決定（依老闆 2026-11-18 確認）

**層是投影，不是第二份真相，因此不新增 `brand_layer` 表。** 每次讀取層時即時由
stage 事實合成（純函式）。stage 仍是「填寫與討論」的單位；層是「閱讀與匯出」的入口。

唯一的例外：層的自訂 prompt（`prompt_override`）要持久化，**reuse 0030 的
`brand_guide_prompt` 表**，把 `scope` 從現有的 `brand`／`set`／`stage4a`…擴充到
`layer:<kind>`（例如 `layer:tokens`）。這不是第二份業務真相，只是「這層要點樣同
agent 交代」的語氣調整，與 stage 事實無關。

### 3.2 層的內容怎麼來（純函式合成）

- `design.md` 層：由 01／02／03／04A(方向＋Logo 概念) 的已填決策，經 `buildDesignDoc()`
  純函式合成 Markdown。
- `tokens` 層：由 04A(色／字／Logo 規格)／04B／04C(動態)／04E(UI) 的已填 token 欄位，
  經 `buildTokenFile()` 合成（JSON / CSS custom properties / Figma tokens 格式）。
- 其他三層（模板／範例／檢查）：首版先做「分組檢視」（把散落欄位聚合顯示），
  「真實產出物」視覺複核與範例成品屬後續階段。

### 3.3 每個關鍵決定要有 rationale（依老闆審閱意見）

純函式合成只會輸出「選了甚麼」，可能淪為機械式選項清單，缺「點解咁選」。

好消息：4A 的 41 個選項已帶 `explanation`／`feel`（傳達感受）／`fit`（適用）／`avoid`
（避免）等欄位，可直接併入合成結果。但「**為甚麼這個品牌選這個**」仍需要人寫。

建議：**每個關鍵決定加一個簡短 `rationale` 欄位**（存在對應 stage 的 block／decision），
由人或 AI 提案後確認。`buildDesignDoc()` 把 `rationale` 併入，而非只印選項標籤。

### 3.4 匯出檔必須標核准狀態（依老闆審閱意見）

各 stage 的 `approval.state` 目前固定為 `draft`（4E 的 `spaceSpec` 等皆寫死
`{state:"draft",approved_by:null}`），而 4A 已有「已核准／需修訂／下游影響」的機制。

因此：**層的匯出檔（`.md`／token 檔）必須標明每一段的來源欄位是 `draft` 還是 `approved`**
（以及 `approved_by`），否則 agent 會把草稿當正式規則。

- 施工時先把各 stage 的 `approval.state` 從硬編碼 `draft` 改為**可寫入的事實**
  （人能核准、能標下游影響）。
- `buildDesignDoc()`／`buildTokenFile()` 在每段輸出核准狀態標記（例如 `> 狀態：草稿`）。

---

## 4. 導航與路由

### 4.1 左欄（完全取代）

左欄主軸由 stage 順序改為五個層，外加一個「不入層」第六類：

```text
Brand Module 左欄
  design.md（規則與原因）   ← 層 1
  tokens（鎖死數值）        ← 層 2
  模板（限制版面）          ← 層 3
  範例（教味道）            ← 層 4
  檢查與視覺複核（守門）     ← 層 5
  ─────────────────────
  未分類／待管理            ← 第六類（狀態／登記冊／印刷／空間／工程）
  品牌集（仍可有多套，作為「維度」存在）
```

- 品牌集不再做主結構，而是**每個層內可選的維度**：進入 tokens 層時，可選「品牌層」
  或某個品牌集（04B–04E 的 token 住品牌集）。
- **「未分類／待管理」收第六類欄位**（§2.6）：4A 登記狀態、4G 登記冊、4B 印刷政策、
  4E 空間、4D 工程資料。它們仍找得到、仍可管理，但不污染五層產出物，日後各自長成
  獨立管理區。

### 4.2 路由

```text
#/design/brand/layer/design-doc
#/design/brand/layer/tokens
#/design/brand/layer/templates
#/design/brand/layer/examples
#/design/brand/layer/checks
#/design/brand/layer/unfiled        ← 第六類
#/design/brand/layer/<kind>?setId=<uuid>   ← 品牌集維度
```

**哪些層接受 `?setId=`（品牌集維度）：**

| 層 | 是否收 `?setId=` | 原因 |
|---|---|---|
| design.md | 否 | 01–03 是品牌層，只有一份 |
| tokens | **是** | 04B 表面、04E UI 的 token 住品牌集 |
| 模板 | **是** | 04C 影片、04E 元件的規格住品牌集 |
| 範例 | **是** | 04H 風格庫住品牌集 |
| 檢查 | **是** | 04B／04E 對比檢查住品牌集 |
| 未分類 | 視內容而定 | 登記冊跟品牌、空間跟品牌、工程跟品牌集 |

> 判斷準則：**只要該層有欄位來自 04B–04E（品牌集），就要收 `?setId=`**。design.md
> 全部來自品牌層（01–03、04A 方向），所以不收。

### 4.3 stage 編輯入口不消失

層是「讀取與合成」的入口；**編輯仍回到 stage**。層頁面上的每一段，都可跳回對應的
stage／區塊去改，改完層即時重新合成（沿用 12 秒輪詢或按需重算）。

---

## 5. 前端改動範圍

| 檔案 | 改動 |
|---|---|
| `apps/web/src/design/BrandScreen.tsx` | 移除 `BRAND_FIXED_ENTRIES`／`SET_STAGE_ENTRIES` 主軸；新增 `LayerScreen` 與 `parseLayerRoute` |
| `apps/web/src/design/BrandSetsRail.tsx` | 改為「五層＋未分類＋品牌集維度」，不再是 stage 固定項 |
| `apps/web/src/design/layer/`（新） | `LayerScreen.tsx`、`DesignDocView.tsx`、`TokenView.tsx`、`UnfiledView.tsx`、`buildDesignDoc.ts`、`buildTokenFile.ts`（純函式） |
| `apps/web/src/api.ts` | 新增 `fetchLayer`／`saveLayerPrompt` 端點 |

## 6. 後端改動範圍

| 檔案 | 改動 |
|---|---|
| `apps/platform/src/brand-guide/layer.ts`（新） | `buildDesignDoc()`／`buildTokenFile()` 純函式，從 stage state 合成（含 rationale、核准狀態標記、token 衝突偵測） |
| `apps/platform/src/brand-guide/layer-routes.ts`（新） | 讀取／匯出層（`GET .../design.md`、`GET .../tokens`） |
| `apps/platform/src/brand-guide/prompt-routes.ts` | scope 擴充 `layer:<kind>` |

> **核准狀態與 rationale 是獨立的一步**（見 §9 步驟 1），不與 layer 純函式混做。
> 先在 4A 已有機制上擴展，再推廣到其他 stage。

## 7. 交付與驗收

1. 五個層＋「未分類」在左欄可見，取代 stage 順序主軸。
2. `design.md` 層：合成視圖 + 匯出 `.md` 檔（可下載），每段標 rationale 與核准狀態。
3. `tokens` 層：合成視圖 + 匯出 token 檔，每段標核准狀態，並偵測 4B／4E 跨階段衝突。
4. 其餘三層：至少「分組檢視」把散落欄位聚合，講得出成熟度。
5. 每個層每一段可跳回對應 stage 編輯，改完層即時重算。
6. 品牌集作為維度仍可用，不丟失 04B–04E 的答案；模板／範例／檢查層支援 `?setId=`。
7. 第六類「未分類」收納登記冊／印刷／空間／工程欄位，日後可獨立成區。
8. 全套測試、build、i18n、lint 綠。

## 8. 已解決與剩餘開放問題

**已由老闆審閱拍板（2026-11-18，兩輪）：**

1. 不落 `brand_layer` 表——層是投影，即時合成；`prompt_override` reuse 0030。
2. 判斷準則：數值→tokens、門檻/政策→檢查、狀態/紀錄→不入層、概念→design.md、
   規格→模板、參考→範例。
3. `vectorStatus`／`minSizeStatus` 是狀態（非數值），歸不入層（登記冊性質）。
4. `targetPolicy`／`focusPolicy` 是政策，歸檢查層；`a11yTarget` 是門檻，歸檢查層。
5. `cmykPolicy`／`p3Policy`／`tacLimit` 印刷專用，第一版標「不入層」。
6. 4D 拆開：CMF/材質→tokens、3D 風格/運鏡/燈光→模板、BOM/認證/測試→不入層。
7. 跨階段 token 衝突（4B↔4E）需偵測。
8. 範例層由 04H + Stage3 `samples`（已確認為資料欄位）供料。
9. `?setId=`：tokens／模板／範例／檢查 四層都收（因都取自 04B–04E）；design.md 不收。
10. 新增第六類「不入層／未分類」。
11. 核准狀態改成可寫入是**獨立一步**，先在 4A 擴展再推廣。

**剩餘待定（施工時逐欄核對，不阻塞方案）：**

1. 04B／04E 的「對比檢查」欄位逐欄確認：數值歸 tokens、門檻歸檢查層，每個欄位
   只落一處（`buildTokenFile()` 以 token 名為 key 去重＋衝突偵測）。

## 9. 施工次序（通過審閱後）

1. **核准狀態與 rationale（獨立一步）**：先把 4A 已有的「已核准／需修訂／下游影響」
   機制做成可寫入事實，加 `rationale` 欄位；再推廣到其他 stage。
2. layer 純函式（`buildDesignDoc`／`buildTokenFile`）＋ token 衝突偵測＋測試。
3. 後端 layer routes（讀取＋匯出）。
4. 前端左欄改五層＋未分類＋LayerScreen。
5. design.md 與 tokens 的合成視圖＋匯出。
6. 其餘三層分組檢視＋第六類「未分類」。
7. Docker 實測＋文件同步。

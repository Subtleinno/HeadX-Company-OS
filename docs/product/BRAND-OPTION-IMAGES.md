# 品牌卡選項圖：哪些選項需要圖、怎麼生成

版本 v3｜2026-11-18｜狀態：**全量視覺選項圖生成中**（v2 的 266 張只覆蓋 stage2／4b／4c／4d）

> 老闆 2026-11-18：品牌卡大部分是視覺判斷，純文字講不清「霧面陶瓷」同「清透玻璃」
> 的分別。每個需要圖的選項要配一張實物示意圖，用內網 Qwen-Image 2.1 生成。

---

## 0. 兩條原則

### 圖跟著源碼走

選項庫本身就是系統的一部分（`0025` 的 seed、`engine/reference/*.options.js`），
圖是同一份參考資料的另一半。所以：

- 檔案位置：`apps/platform/assets/brand-options/<stage>/<dimension>/<optId>.webp`
- 跟其他源碼一齊 commit；新環境一裝就有圖
- 不進 DB、不進 MinIO —— 否則新機一裝就沒有圖，而「沒有圖」與「生成失敗」
  在畫面上長得一樣，沒有人分得出

前端拿到的網址是 `/api/brand-options/<stage>/<dimension>/<optId>.webp`，由 API 讀檔
回傳；schema 回應會把 `img` 併進每個選項，前端見到 `img` 才畫圖框（沒有圖不留空位）。

**為什麼要多一層 dimension**：同一個 stage 內 `opt_id` 會跨維度重複 ——
stage2 的 `ceramic` 同時是「材質」與「表面」，`flat`／`hard` 同時是「表面」與
「光線」。平放一層的話，後生成的一張會靜靜蓋掉前一張，而畫面完全正常（只是圖錯）。
分一層之後，路徑本身就是完整的識別；`option-images.ts` 以 `cat` 的 key（就是
dimension）去對圖，同一個 id 在不同維度可以有兩張不同的圖。

### 同一組圖要有同一個主角

一組幾十張並排看時，「同一套」比「每張都漂亮但各不相同」有用得多。所以：

- 樣本類（材質／表面／紙材／工藝）＝ 同一種方形樣本，同樣 45° 俯視、淺灰背景
- 鏡位／構圖／打光／情緒 ＝ 同一個靜物（木桌上的素色陶瓷杯、亞麻布、乾枝）
- 3D 材質／表面處理 ＝ 同一顆材質球；3D 風格／外觀／場景／運鏡 ＝ 同一個小物件

---

## 1. 判斷標準：這個選項「用講的夠不夠」

| 選項在答甚麼 | 要圖嗎 | 理由 |
|---|---|---|
| 一個**材質／工藝／表面**是甚麼質感 | **要** | 質感是視覺事實，文字只能近似 |
| 一種**光線／氛圍**是甚麼感覺 | **要** | 差別在色溫與過渡，「柔」講不出來 |
| 一個**畫面構圖／鏡位**長怎樣 | **要** | 版面關係只能看 |
| 一組**色票** | **要**（可直接畫色塊，不必生圖） | 顏色是精確值 |
| 一句**品牌宣言／語氣規則** | 不要 | 文字就是本體 |
| 一組**業務資料**（行業、收入、客群） | 不要 | 不是視覺 |
| 一條**合規／治理規則** | 不要 | 門檻與條文 |
| 一個**登記狀態**（有沒有向量檔） | 不要 | 狀態 |

---

## 1b. v3 擴充：不再只做「材質／鏡位」四個 stage

老闆 2026-11-18 指出：「我見到有圖，先容易判斷」。v2 只做了 stage2／4B／4C／4D，
但 04A 的 Logo／字體／配色、04E 的空間與 UI、04F 的版面與渠道、04H 的 AI 素材類型
同樣是視覺判斷。v3 把 `TEMPLATE_OF` 擴到所有能用一張靜態圖說清楚的維度：

- **標誌與字體**：抽象幾何記號／筆畫標本（不寫品牌名，不造假的 letterform）
- **配色**：直接用色塊畫色票，不用照片（AI 實物照必定偏色）
- **介面與版面**：灰階佔位塊組成的 card／wireframe，只看結構不造內容
- **空間**：無人室內照，看材料、光線、空間類型
- **聲音與動態**：波形／示意圖，把音色、節奏、位移翻成看得見的東西
- **程序與零件**：製造、測試、元件的實景或示意
- **AI 素材類型**：幾何示意，避免畫出假介面

仍然不生成的是「文字就是本體」或「狀態／門檻／條文」的維度：`stage0` 業務資料、
`stage1` 概念文字（張力刻度除外）、`stage3` 語言語氣、`stage4g` 治理、
`4E` 的真元件與平面圖、`4F` 的真模板縮圖。見第 3 節。

---

## 2. 已生成的圖（按 stage）

全部 **1,287 張、約 21MB**，`apps/platform/assets/brand-options/<stage>/<dimension>/`。
v3 新增了 04A／04E／04F／04H 與 02 的詳細設定；v2 的 266 張是其中一部分。

| stage | 張數 | 圖種 |
|---|---:|---|
| stage1 定位與張力 | 8 | 8 個張力刻度的中間態 |
| stage2 材質感官 | 127 | 樣本磚／觸感特寫／光與氛圍／影像風格／UI 表面設定 |
| stage4a 核心識別 | 162 | 標誌記號／字體筆畫／色票／個性刻度／輸出與淨空 |
| stage4b 圖形表面 | 163 | 印刷工藝／紙材／圖案／陰影／描邊填色與漸變 |
| stage4c 動態影音 | 235 | 鏡位／打光／情緒／動態示意／聲音波形／影像風格 |
| stage4d 3D 與產品 | 197 | 材質球／渲染風格／產品外觀／3D 場景／燈光與運鏡／製造程序 |
| stage4e UI 與空間 | 175 | 室內照／材料與光線／UI 狀態與版面／通路與動線 |
| stage4f 行銷內容 | 169 | 版位／渠道／鉤子／漏斗／模板與簡報結構 |
| stage4h 風格庫與 AI | 51 | AI 素材類型與用途的幾何示意 |

> `stage2.material` 內有 9 個其實是「光與氣」或液體（`mist`／`afterglow`／
> `moonlight`／`candle`／`scope`／`steam`／`aurora`／`water`／`crystal`），
> 生成時改用氛圍圖或水面質感 —— 月光不可能是一塊磚，水面不是閃電。

---

## 3. 刻意不生成的（有理由，不是漏）

| 範圍 | 數量 | 為什麼不生成 |
|---|---|---|
| `stage0` 全部 | 業務資料 | 不是視覺 |
| `stage1` 文字概念（category／pain／value／keywords 等） | 不要 | 概念與宣言，文字就是本體；8 個張力刻度有圖 |
| `stage3` 全部 | 語言語氣 | 語氣規則，圖會被讀成風格指定 |
| `stage4g` 全部 | 治理條文 | 門檻與條文 |
| `stage4h.provenance` | 來源紀錄 | 狀態 |
| `stage2.motionsound`（15） | 動態與聲音 | 一半是聲音（波形／節奏），一幀照片表達不了；硬配圖會誤導 |
| `stage2.avoidMaterials`（12） | 避免材質 | 是「不要」清單；配一張漂亮圖反而被讀成推薦 |
| `stage4c.distance`（4） | 位移距離（8px／16–24px） | 像素位移在靜態圖上不存在 |
| `stage4c.choreo`（4） | 編排次序（同時／錯開） | 次序要動才看得到，單幀只能造假 |
| `stage4e.components`／`wayfinding`（16＋8） | 真元件與導視牌 | 應由真元件截圖與 SVG 平面圖呈現，AI 生圖會失真（假按鈕、亂文字）；`zones` 已用空間照 |
| `stage4f` 真模板輸出 | 版式縮圖 | 應由模板引擎直接渲染；現在的圖是「結構示意」，不是真的模板卡 |

這批要用真渲染而不是生圖，是另一條工作，不在這份文件範圍。

---

## 4. 生成方式

```bash
# 生一個（或幾個）dimension
node scripts/gen-option-images.mjs --stage stage2 --dimension material
node scripts/gen-option-images.mjs --stage stage2 --dimension tactile,surface,light,atmosphere,imagery

# 只生 5 張試味道
node scripts/gen-option-images.mjs --stage stage2 --dimension material --limit 5 --force

# 只看 prompt，不出圖
node scripts/gen-option-images.mjs --stage stage4b --dimension processes --dry-run
```

```bash
# 全量（每個 stage 的所有「需要圖」維度；每 stage 視數量約 1–25 分鐘）：
for st in stage1 stage4a stage4b stage4c stage4d stage4e stage4f stage4h stage2; do
  node scripts/gen-option-images.mjs --stage "$st"
done

# 只重生一個選項／換 seed
node scripts/gen-option-images.mjs --stage stage2 --dimension atmosphere --opt deepnight --force --offset 1
```

- 已有檔案的選項會跳過（`--force` 才重生），所以可以隨時中斷再跑
- 同一格每次生成用同一個 seed（由 `stage/dimension/optId` 雜湊），重跑不會換一個樣子
- 預設 512×384（4:3），生成後即轉 WebP q90：一張約 16KB，1,287 張約 21MB。需要 `cwebp`
  （`brew install webp`）—— 這是生成時的工具，執行期只讀檔
- **範本按維度選**（`TEMPLATE_OF`）：樣本磚／觸感特寫／紙樣／印刷工藝／圖案平鋪／
  陰影／氛圍光影／攝影風格／取景／打光／材質球／渲染風格／產品外觀／3D 場景／運鏡。
  用錯範本比沒有圖更差 —— 月光畫成一塊磚就是錯的東西
- 鏡頭運動（橫搖、急搖、手持…）靜止一幀表達不了，所以另有一張逐選項的
  **視覺翻譯表**（`VISUAL_HINT`）：把「跟拍」翻成「主體清晰、背景有輕微水平拖影」，
  把「俯衝」翻成「高角度俯視」。沒有這張表，13 個鏡位會變成 13 張普通照片
- **零文字**是硬規則：圖上出現任何字母／數字／標誌，都會被讀成品牌訊息
- 平台名（`Instagram`／`TikTok`／`LinkedIn`…）會由 `SAFE_LABEL` 換成中性描述，
  否則模型會畫出假介面與真字
- 抽象形容詞（安靜／溫暖／未來…）靠 `SCENE_HINT` 落成看得見的物體與光線；
  只丟中文形容詞，出來全是同一道彩虹

## 5. 視覺驗收迴圈（不是只看檔案在不在）

1. 用 Pillow 把同一 stage 的圖排成 contact sheet（8 欄、每格 200px、檔名標在下面）
2. 逐張看有沒有：畫錯東西（水面畫成閃電）、人手出現在不該有的地方、
   淡到看不見（UI 示意圖）、可讀文字（假 Logo／假平台畫面）、
   一整組長得一模一樣（氛圍／個性刻度）
3. 改 prompt（`TEMPLATES`／`SCENE_HINT`／`VISUAL_HINT`）或用 `--offset 1` 換 seed 重生
4. 重生後再看 contact sheet，直到同組圖放在一起看得出差別

v3 實際抓到並修掉的：晨霧有奇怪暗點、深夜仍出彩虹、水面畫成城市閃電、
`springy` 畫成鵝卵石、3D 場景出現人手、圖案平鋪淡到空白、
UI 邊框圖全是淡灰小卡片、`deepnight` 換 seed、平台名畫出真字。

**已知殘留**：少數選項名本身含「金句卡／標題＋文字」等字樣，Qwen 仍會在圖上畫出
不可讀的假中文字（`templateTypes/tp_quote` 最頑固）。已換中性標籤與抽象範本，
仍無法 100% 防止。這些圖只能當「版式結構示意」，不可當成可抄的文字或模板。

---

## 6. 驗收

1. 有圖的選項在卡片上見到縮圖（4:3、圓角、與文字同一格）
2. 沒有圖的選項不留空框
3. 圖跟源碼一齊 commit，新環境一裝就有
4. `GET /api/brand-options/<stage>/<dimension>/<optId>.webp` 回 `image/webp`；
   未登入一律 401（不向外透露路徑是否存在）；登入後無圖回 404、`.png`／`.jpg` 回 404

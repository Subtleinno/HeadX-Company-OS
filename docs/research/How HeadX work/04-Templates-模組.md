# 04 · Templates 模組

版本 v0.1 ｜ 狀態：規劃稿

## 0. 一句話

Template = **一份寫好一次、可以隨品牌自動變身、人可手改、AI 會揀的 HTML 版型。** 它是 Create 的零件，也是品牌感的主要載體。

## 1. 設計目標

1. 同一個模板，換品牌就換外觀（色、字、Logo、圖形語言、語氣長度）。
2. 人可以直接改，並即時看到結果與試生成。
3. AI 在適當時候知道該揀哪個模板、為甚麼揀、有甚麼限制。
4. 覆蓋你會用到的所有格式：social、PPT、網頁、文件。

## 2. 模板家族（首批清單）

| 家族 | 規格 | 備註 |
|---|---|---|
| IG 單圖 | 1080×1350（4:5）、1080×1080 | PNG |
| IG Carousel | 每頁 1080×1350，3–10 頁 | 逐頁 PNG |
| IG／FB Story、Reels 封面 | 1080×1920 | 影片或單圖 |
| Reels／Shorts／TikTok 影片 | 1080×1920，含字幕、轉場 | MP4 |
| FB／LinkedIn 貼文圖 | 1200×630、1080×1080 | PNG |
| Threads／X 圖卡 | 依平台 | PNG |
| 小紅書圖文 | 1080×1440（3:4） | PNG |
| PPT／簡報 | 1920×1080 | 見 01 |
| 海報／A4 單張 | 依印刷尺寸 | PDF（需出血另議） |
| 網站橫幅、文章封面 | 1600×900 等 | PNG |
| 電郵頁首 | 600 寬 | PNG |
| 影片片頭／片尾／下三分之一字幕 | 依片規格 | MP4 |

> 平台尺寸會變，尺寸放在 Output Profile（見 01），不寫死在模板內。

## 3. 模板的結構

一個模板是一個資料夾（存 MinIO），並在 Postgres 有一筆索引。

```text
template/ig-carousel-cover-bold/
├── template.html          版面（含 slot 標記）
├── template.css           只用 brand tokens 變數，不寫死顏色字體
├── manifest.json          身份、規格、slot、限制、使用建議（給人與 AI）
├── fixtures/              測試內容（短文案、長文案、直圖、橫圖、缺圖）
│   ├── short.json
│   ├── long.json
│   └── edge.json
└── thumbs/                自動產生的預覽圖（每個品牌一張）
```

### 3.1 Slot（可填位）

```html
<section class="slide" data-scene="1" data-still-at="settled">
  <img data-slot="hero_image" data-slot-type="image" data-aspect="4:5" />
  <h1 data-slot="headline" data-slot-type="text" data-max-chars="18"></h1>
  <p  data-slot="subline"  data-slot-type="text" data-max-chars="40"></p>
  <div data-slot="logo" data-slot-type="brand-logo" data-variant="auto"></div>
</section>
```

Slot 類型：`text`、`richtext`、`image`、`video`、`brand-logo`、`list`、`number`、`cta`、`qr`、`audio`。

### 3.2 品牌變身：Tokens

模板只使用 CSS 變數，由品牌資料注入：

```css
:root {
  --brand-primary: ...;   --brand-secondary: ...;  --brand-bg: ...;
  --brand-ink: ...;       --brand-accent: ...;
  --font-display: ...;    --font-body: ...;
  --radius: ...;          --shadow: ...;
  --graphic-motif: url(...);   /* 品牌圖形語言 */
  --logo-light: url(...);  --logo-dark: url(...);
  --voice-length: short|medium|long;   /* 影響文案長度建議 */
}
```

**三層疊加：** `品牌 tokens`（全局）→ `模板 variant`（例如深色／淺色）→ `單次調整`（AI 或人微調，只記在該 Project）。

## 4. manifest.json（給人與 AI 讀）

```json
{
  "id": "ig-carousel-cover-bold",
  "version": 3,
  "family": "ig-carousel",
  "role": "cover",
  "outputs": ["carousel-png"],
  "size": { "w": 1080, "h": 1350 },
  "slots": [
    { "key": "hero_image", "type": "image", "required": true,
      "needs": { "orientation": "portrait", "safe_area": "bottom_third_empty" } },
    { "key": "headline", "type": "text", "required": true, "max_chars": 18 },
    { "key": "subline", "type": "text", "max_chars": 40 }
  ],
  "use_when": ["介紹新服務", "系列文章開場", "強主題宣告"],
  "avoid_when": ["資訊密集", "需要多張圖並列"],
  "content_shape": { "text_amount": "low", "image_count": 1 },
  "tone_fit": ["bold", "confident"],
  "pairs_with": ["ig-carousel-body-list", "ig-carousel-cta-end"],
  "brand_constraints": { "requires_logo": true, "min_contrast": 4.5 },
  "variants": ["light", "dark"],
  "status": "active",
  "agent_summary": "大標題＋單張直幅主圖的封面。標題不超過18字；主圖下三分之一要留空。適合宣告性內容。"
}
```

`agent_summary` 是 **Agent 頁**用的 1–2 句摘要（約 40–60 token），讓 AI 不必讀整個 manifest 就能初選。

## 5. 人手編輯工具（Template Studio）

### 5.1 介面

```text
┌─ 左：模板庫與檔案樹 ─┬─ 中：預覽區 ───────────┬─ 右：屬性與檢查 ─┐
│ 家族篩選             │ 品牌切換（A／B／C）      │ Slot 列表         │
│ 搜尋                 │ 內容夾具切換（短/長/邊緣）│ Tokens 綁定       │
│ 版本記錄             │ 尺寸／平台切換           │ manifest 表單     │
│                      │ 畫面縮放、安全區疊圖     │ 檢查結果（Lint）  │
├──────────────────────┴──────────────────────────┴───────────────────┤
│ 下：程式碼面板（HTML／CSS，Monaco 編輯器；可摺疊）                    │
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 必備功能

| 功能 | 說明 |
|---|---|
| 即時預覽 | 改碼或改屬性後 <1 秒更新（瀏覽器內 iframe，不經後端） |
| 品牌切換 | 一鍵看同一模板在不同品牌下的樣子 |
| 夾具切換 | 短文、長文、直圖、橫圖、缺圖，立刻看到溢出或崩版 |
| 安全區疊圖 | 顯示 IG／Story／PPT 的安全邊界 |
| **試生成** | 按鈕呼叫 Render Job，產出真正 PNG／MP4／PPT，並顯示耗時 |
| Slot 面板 | 以表單新增、改名、設限制，自動同步 HTML 標記 |
| Token 綁定檢查 | 發現寫死顏色／字體時標紅，建議換成變數 |
| Lint | 見第 6 節 |
| 版本 | 每次儲存為草稿；「發布」才變 active；可回滾 |
| AI 助手 | 側欄：「幫我做一個深色版」「這個模板改成 9:16」→ 產生**草稿版本**，由人預覽後採用 |
| 匯入 | 貼入 HTML，自動辨識文字與圖片位置，建議 slot |

### 5.3 Edit／View／Agent 對應

| 頁 | 內容 |
|---|---|
| **Edit** | Template Studio（上述） |
| **View** | 模板畫廊：縮圖（可切品牌）、規格卡、使用建議、使用次數與採用率 |
| **Agent** | 精簡索引：id、家族、角色、`agent_summary`、slot 要求、`use_when／avoid_when`；不含 HTML 原碼 |

## 6. 品質檢查（Lint）

- 溢出（在長文夾具下文字超出框）。
- 對比度（對所有已啟用品牌的 tokens 組合檢查）。
- 寫死顏色／字體／尺寸。
- Slot 沒有最大字數或沒有後備值。
- 安全區被侵佔。
- 字體缺失。
- 缺夾具（發布前至少要有 short／long／edge）。
- 影片模板：動畫時長與 `still_at` 是否宣告。

**發布門檻：** 無「錯誤」級項目；「警告」可保留並記錄原因。

## 7. AI 如何揀模板（路由）

```text
輸入：brief（目的、渠道、內容量、素材情況、品牌語氣）
 ① 硬過濾：輸出類型／尺寸吻合；status=active；品牌允許
 ② 內容形狀：文字量、圖片數、有無數據圖表 → 對 content_shape
 ③ 用途匹配：use_when／avoid_when
 ④ 品牌適配：tone_fit、品牌 tokens 是否滿足 brand_constraints
 ⑤ 系列一致：若是 carousel，按 pairs_with 組成封面＋內頁＋結尾
 ⑥ 歷史採用率：同品牌同渠道被採用多的加分
 ⑦ 回傳 Top-3＋理由；若 Top-1 的 slot 需求素材不足，附 coverage 缺口（→ Needs）
```

### MCP 工具

```text
templates.find(brief, limit=3)           → 卡片（agent_summary＋理由＋缺口）
templates.get(id)                        → manifest（不含 HTML）
templates.fill(id, slots, brand_id)      → 回傳 composition（HTML，帶 tokens）
templates.suggest_variant(id, brand_id)  → 建議 light/dark 與調整
templates.propose_edit(id, change)       → 建立草稿版本（人確認）
templates.record_use(id, project, outcome)
```

### 微調規則

AI 在 `templates.fill` 後可作小幅調整（間距、字號 ±2 級、顏色在 token 範圍內）；**不可改 manifest 的限制、不可繞開 token。** 大改須走 `propose_edit`。

## 8. 資料表

```sql
create table template (
  id text primary key,
  family text not null,
  role text,
  status text not null default 'draft',   -- draft | active | deprecated
  current_version int not null default 1,
  agent_summary text,
  tags text[],
  created_at timestamptz default now()
);

create table template_version (
  template_id text references template(id),
  version int,
  manifest jsonb not null,
  storage_prefix text not null,           -- MinIO 路徑
  lint_report jsonb,
  published_by uuid, published_at timestamptz,
  primary key (template_id, version)
);

create table template_use (
  id uuid primary key, template_id text, version int,
  project_id uuid, brand_id uuid,
  outcome text,                           -- adopted | modified | rejected
  reason text, created_at timestamptz default now()
);
```

## 9. 品牌感如何落實（避免只是換顏色）

1. **圖形語言**：品牌的線條、形狀、邊框、圖案放入 token（`--graphic-motif`），模板必須使用。
2. **版式節奏**：品牌的留白、對齊方式、網格寫成 `layout rules`，模板須遵守。
3. **語氣長度**：`voice-length` 影響標題字數建議。
4. **動態規則**：影片模板的緩動曲線、轉場風格由品牌動態 token 決定。
5. **禁區**：品牌禁用的搭配（如特定顏色組合）進 Lint。

## 10. 分期

1. P1-a：5 個模板（IG 單圖、Carousel 三件套）＋ manifest ＋ 品牌 tokens。
2. P1-b：Template Studio 的預覽、品牌切換、夾具、Lint、試生成。
3. P1-c：`templates.find` 路由與採用率回饋。
4. P2：PPT、Story、Reels、小紅書、海報。
5. P2+：AI 助手產生草稿版本。

## 11. 風險

| 風險 | 對策 |
|---|---|
| 模板越做越多、重複 | 家族＋角色命名規範；增生偵測（見 02） |
| 換品牌後崩版 | 發布前對所有啟用品牌跑 Lint |
| AI 亂改模板 | 只能產生草稿版本，發布由人 |
| 字體授權 | 字體清單附授權記錄（見 08） |

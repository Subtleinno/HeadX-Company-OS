# 06 · Create 模組與漸進式揭露路由（Progressive Disclosure Routing）

版本 v0.1 ｜ 狀態：規劃稿

## 0. 一句話

Create 把 **品牌、策略、知識、素材、模板** 組成產出（影片、IG、PPT、文章），同時確保 AI **永遠只讀剛好夠用的資料**。核心是一個**分層索引＋路由器**，而不是把所有資料塞進 context。

## 1. 為甚麼需要漸進式路由

| 問題 | 後果 |
|---|---|
| 全部讀入 | context 爆炸、成本高、AI 變笨（資料太雜） |
| 讀太少 | 沒有品牌感、沒有依據、亂編 |
| 沒有索引 | 每次都靠 AI 猜去哪找 |

**解法：四層揭露（L0–L3），每層有 token 預算；路由器決定下一步讀甚麼。**

## 2. 四層揭露

| 層 | 內容 | 預算 | 何時讀 |
|---|---|---|---|
| **L0 地圖** | 公司與品牌一頁摘要＋各模組索引目錄（有甚麼、各多少、最近更新） | ≤ 500 token | 每個 Project 開始必讀 |
| **L1 卡片** | 每個物件一張卡（id、標題、summary、狀態、標籤） | 每張 40–80 token；一次最多 15 張 | 路由挑選候選時 |
| **L2 詳情** | 選中物件的相關部分（段落、欄位、manifest、Description） | 每個 ≤ 400 token | 確定要用時 |
| **L3 原件** | 完整 HTML、全文、實際圖片影片 | 按需 | 要精確複製或視覺判斷時 |

**硬規則：** 每個 Project 的總讀取預算（預設）≈ 6,000 token；超出須由路由器說明理由，並記錄。

## 3. 資料來源與卡片

| 模組 | 卡片來源 |
|---|---|
| Brand | 品牌檔案摘要、tokens 摘要、語氣摘要 |
| Strategy | 策略文件卡（層級：品牌層／渠道層／格式層／步驟層／範例層） |
| Knowledge | `kb_doc.summary` |
| Materials | Segment 卡（見 03） |
| Templates | `agent_summary`（見 04） |
| Posts | 文章摘要（見 05） |

所有卡片由**同一個索引表**提供（見第 8 節），所以路由器只需要一種查詢方式。

## 4. 路由器（Router）流程

```text
輸入：用戶一句話（例：「做一個介紹新療程的 IG carousel，用香港相」）

Step 0  讀 L0（地圖）
Step 1  理解任務 → 產生 Brief（見第 5 節）
Step 2  揀策略：品牌層（必讀）→ 渠道層 → 格式層 → 步驟層 → 範例層（各取 L1，再取 L2）
Step 3  揀知識：kb.search → L1 → 對有用的取 L2 段落；kb.check_claims 預備
Step 4  揀模板：templates.find → Top-3＋理由 → 取 manifest（L2）
Step 5  揀素材：按模板 slots 與 Brief，逐 slot 呼叫 materials.search（L1）→ 取 L2 → 必要時 L3
Step 6  缺口判斷：materials.coverage / 知識缺口 / 決策缺口 → 開 Needs（07）
Step 7  組裝 composition（templates.fill）→ Lint → Render
Step 8  自檢：kb.check_claims、品牌檢查、素材授權檢查
Step 9  存入 Create，寫入 Provenance（來源記錄）
```

### 路由原則

1. **先窄後寬**：先用過濾條件（渠道、品牌、地區、語言）縮小，再搜尋。
2. **先卡片後詳情**：沒有看過卡片，不可直接讀 L3。
3. **一次只讀一個層級的下一步**：避免一次拉 50 個詳情。
4. **缺就問，不要猜**：缺資料開 Needs，不要憑空填。
5. **記住用過甚麼**：同一 Project 內不重複讀取（快取）。

## 5. Brief（任務單）

Brief 是路由的「方向盤」，由 AI 先產生，人可確認或修改。

```json
{
  "goal": "介紹新療程，引導預約",
  "channel": "instagram",
  "format": "carousel",
  "pages": "5-7",
  "audience": "30–45 歲、香港居民",
  "tone_hint": "專業但親切",
  "language": "zh-Hant-HK",
  "must_include": ["療程名稱", "預約方式"],
  "must_avoid": ["療效保證", "對比他牌"],
  "material_policy": "human_preferred",
  "deadline": "2026-11-20",
  "autonomy": "assisted"
}
```

## 6. 做出「品牌感」的機制

不是只換顏色，而是下列都來自品牌資料：

| 面向 | 來源 | 在產出的體現 |
|---|---|---|
| 視覺 | tokens、圖形語言、版式規則 | 模板自動套用 |
| 語氣 | 品牌語氣指引、禁用詞、範例句 | 文案生成與檢查 |
| 敘事 | 步驟層策略 | 頁面順序、開場與收結 |
| 真實感 | Materials 的真人真地素材 | 優先選用香港實拍 |
| 可信 | Knowledge（已驗證） | 內容依據與引用 |
| 一致 | 範例層（過往成功產出） | 作為模仿參考 |

**品牌檢查（產出前自動）：** 是否使用品牌色板內的顏色、字體是否為品牌字體、有無禁用詞、Logo 位置與留白、語氣關鍵詞、有無使用非品牌風格素材。檢查結果是清單，不是分數。

## 7. 自我生長（Self-growing）索引

「自我生長」指：資料增加時，索引與路由自動跟上，無需人手維護。

1. **事件驅動**：任何物件新增／修改／刪除發出事件 → worker 更新卡片與 L0 地圖。
2. **使用統計**：每次路由記錄「讀了甚麼、用了甚麼、丟了甚麼」。常被採用的卡片排序提高；長期不用的標記冷門。
3. **自動建議**：
   - 常被一起使用的組合 → 建議存成「配方（Recipe）」，例如「香港景點 IG 系列」。
   - 常出現的缺口 → 建議新增知識、素材或模板，並開 Needs。
   - 重複出現的新類型資料 → 建議新框架（見 02）。
4. **L0 地圖自動重寫**：每日或每次大量變更後重生，並保持在預算內。

### 配方（Recipe）

```json
{
  "id": "recipe-hongkong-heritage-carousel",
  "applies_to": { "channel": "instagram", "format": "carousel", "topic": "香港景點" },
  "steps": {
    "strategy": ["str-brand-voice", "str-ig-carousel-spec", "str-travel-narrative"],
    "knowledge_query": "type:regulation OR tag:歷史建築",
    "templates": ["ig-carousel-cover-bold", "ig-carousel-body-photo", "ig-carousel-cta-end"],
    "material_filters": { "place.area": "香港島", "consent": "ok" }
  },
  "success_rate": 0.82,
  "uses": 17
}
```

配方可由 AI 提議、人確認；使用後可大幅降低路由的探索成本。

## 8. 資料表

```sql
-- 統一索引（所有模組的卡片）
create table index_card (
  id text primary key,                 -- 'tpl:ig-carousel-cover-bold' / 'kb:...' / 'mat:...'
  module text not null,                -- brand|strategy|knowledge|material|template|post
  title text, summary text,            -- summary 即卡片內容
  tags text[], facets jsonb,           -- 供過濾：地區、渠道、語言、狀態
  token_cost int,                      -- 卡片 token 估算
  status text, updated_at timestamptz,
  use_count int default 0, adopt_rate numeric
);

create table project (
  id uuid primary key, brief jsonb, autonomy text, status text,
  created_by text, created_at timestamptz default now()
);

create table route_log (               -- 路由紀錄
  id uuid primary key, project_id uuid, step text,
  read_layer text,                     -- L0..L3
  object_id text, tokens int, decision text, created_at timestamptz default now()
);

create table composition (
  id uuid primary key, project_id uuid, version int,
  template_id text, template_version int, brand_id uuid,
  html_key text, slots jsonb, lint jsonb
);

create table output (
  id uuid primary key, project_id uuid, composition_id uuid,
  profile_id text, file_keys jsonb, status text
);

create table provenance (              -- 這個產出用了甚麼
  output_id uuid, object_id text, role text,   -- strategy|knowledge|material|template
  version int, detail jsonb
);
```

## 9. MCP 工具（Create 對 agent）

```text
create.start(request)                       → 建立 Project＋Brief 草稿
create.map()                                 → L0
create.route(project_id, step)               → 路由器建議下一步與要讀的 L1
create.build(project_id)                     → 組 composition
create.render(project_id, profile)           → 開 Render Job
create.review(project_id)                    → 品牌檢查＋claims＋素材授權
create.revise(project_id, instruction)       → 回到第 2–5 步局部重做，不從零開始
create.save_recipe(project_id)               → 提議存成配方
```

## 10. 狀態機（Project）

```text
草稿 → 規劃中 → 缺料（有未完成 Needs，半成品合法） → 可 render → 已產出 → 已收貨
                                                   ↘ 需修訂（回到規劃中）
```

「缺料」不是失敗，是正常路徑；composition 帶 placeholder，Needs 完成後自動填回。

## 11. 自主程度（autonomy）

| 值 | 行為 |
|---|---|
| `auto` | 齊料即 render，產出直接放入 Create |
| `assisted` | 關鍵步驟（模板選擇、文案、AI 圖採用）以 decision Needs 請人確認 |
| `manual` | AI 只提供建議，人操作 |

預設：社交內容 `auto`；涉及醫療／療效／法規敏感內容強制 `assisted`。

## 12. 成效與回饋

- **人的動作**：收貨、要求重做、手改，皆記錄原因分類（風格不對／文案不對／素材不合／模板不合）。
- 回饋影響：模板與素材的採用率、配方成功率、策略文件的修訂建議（只出草稿，由你決定）。

## 13. 分期

1. P0：L0–L2 路由（卡片索引、route_log），單一渠道（IG carousel）。
2. P1：模板路由、composition、Render、品牌檢查。
3. P2：Knowledge 檢查、配方、PPT／文章產出。
4. P3：自我生長建議（缺口、配方、新框架）。

## 14. 驗收測試（建議）

- 同一個 brief，總讀取 token ≤ 預算。
- 抽查 20 個產出，全部有 Provenance，且素材與知識可回溯。
- 換品牌後，同一個 brief 的外觀與語氣明顯不同。
- 刪掉一個素材，系統能指出受影響的產出。

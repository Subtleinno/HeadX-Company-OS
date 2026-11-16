# 05 · Knowledge（知識庫）與 Posts（文章）

版本 v0.1 ｜ 狀態：規劃稿

## 0. 兩個部分

| 部分 | 性質 | 類比 |
|---|---|---|
| **Knowledge** | 行業知識、規矩、法規，作為產出內容的**來源** | Obsidian vault |
| **Posts** | 已整理好的 HTML 文章（含相片影片），可直接複製到 WordPress | 內置 blog 編輯器 |

關係：`Knowledge →（被引用）→ Posts / Create 產出`。Posts 完成後也可以反過來成為「已整理資料」供 Create 引用。

---

# Part A · Knowledge

## A1. 原則

1. 檔案是 **Markdown**，人可直接讀寫、可離線。
2. 每份知識都要有 **來源、可信度、有效日期、適用地區**。沒有來源的只能標「未驗證」。
3. AI 引用知識時，必須能回溯到哪份、哪一段。
4. 法規類知識**只作提醒，不是法律意見**，須專業人士確認。

## A2. 結構

```text
knowledge/
├── industry/          行業知識（例：中醫、餐飲、旅遊）
├── regulation/        規矩與法規（香港、平台政策、廣告守則）
├── product/           產品與服務事實
├── audience/          受眾洞察
├── faq/               常見問題與標準答案
├── glossary/          術語表（含粵語／英文）
├── cases/             案例與客戶故事（需同意）
└── playbooks/         內容手冊（敘事順序、渠道做法）
```

## A3. 每份文件的格式

```markdown
---
id: kb-reg-ad-medical-hk-001
title: 香港醫藥廣告宣稱注意事項
type: regulation
jurisdiction: [HK]
status: verified        # unverified | verified | outdated
confidence: high        # low | medium | high
sources:
  - title: 官方條例／指引名稱
    url: https://…
    retrieved: 2026-11-16
effective_from: 2026-01-01
review_by: 2027-05-01
tags: [廣告, 醫療宣稱, 禁用詞]
applies_to_brands: [all]
sensitivity: normal      # normal | internal | restricted
summary: 用一至兩句說明本文重點（供 Agent 頁使用）。
---

# 正文（Markdown）
…可用 [[wikilink]] 連到其他知識，如 [[kb-glossary-療效宣稱]]。
```

`summary` 是漸進式揭露的關鍵：AI 先讀 summary，再決定要不要讀全文。

## A4. 驗證流程（「已驗證知識」怎樣來）

```text
來源 → AI 摘錄與整理（標「AI提案」）→ 人核對來源 → 標 verified＋寫 sources
                                                   ↓
                                        到期前提醒 review_by → 重新核對或標 outdated
```

- AI **不可**自行把知識標為 verified。
- 過期（`review_by` 已過）的知識，Agent 頁標「需覆核」，且 AI 引用時須在產出旁附警告。
- 法規類每季一次自動提醒覆核。

## A5. 連結與圖譜

- `[[wikilink]]` 與反向連結，建立知識網。
- 解析後存 `kb_link` 表，供「相關知識」與影響分析（改一條法規，哪些文章引用了它）。

## A6. 資料表

```sql
create table kb_doc (
  id text primary key,
  type text, title text, status text, confidence text,
  jurisdiction text[], tags text[],
  summary text, body_md text,
  sources jsonb, effective_from date, review_by date,
  sensitivity text default 'normal',
  version int default 1, updated_at timestamptz default now()
);
create table kb_link (from_id text, to_id text, primary key(from_id, to_id));
create table kb_chunk (            -- 切段，供檢索
  id uuid primary key, doc_id text, heading text, text text,
  embedding vector(1024)           -- 維度視所用模型而定
);
create table kb_citation (          -- 哪個產出引用了哪段知識
  output_id uuid, doc_id text, chunk_id uuid, quoted text
);
```

## A7. 檢索（給 AI）

與 Materials 同一套漸進式：

| 層 | AI 看到 |
|---|---|
| L0 | 知識地圖（資料夾＋每夾文件數＋最近更新），約 200 token |
| L1 | 搜尋結果：id＋標題＋summary＋status＋有效期 |
| L2 | 相關段落（chunk），不是整份 |
| L3 | 全文（極少需要） |

### MCP

```text
kb.search(query, filters{type,jurisdiction,status}, limit)  → L1
kb.get(id, section?)                                        → L2/L3
kb.related(id)                                              → 連結
kb.check_claims(draft_text, jurisdiction)                   → 對稿件逐句找依據，標出「無依據／相衝突」
kb.propose(doc)                                             → 新增或修改（AI提案）
```

`kb.check_claims` 很重要：產出前自動檢查稿件的宣稱有無知識依據。

## A8. Edit／View／Agent

| 頁 | 內容 |
|---|---|
| Edit | Markdown 編輯器（左）＋預覽（右）；frontmatter 表單；來源欄位；Wikilink 自動完成；匯入／匯出整個 vault（zip） |
| View | 文件列表、狀態燈（verified／outdated）、到期提醒、被哪些產出引用 |
| Agent | 知識地圖＋每份的 summary、status、適用地區；不含全文 |

---

# Part B · Posts（可貼到 WordPress 的文章）

## B1. 定位

Posts 是「**已整理資料**」：內含相片、影片、段落、SEO 資料，人可以像寫 blog 一樣手動更新，完成後**一鍵複製乾淨 HTML**，貼進 WordPress。

## B2. 文章資料

```json
{
  "id": "post-2026-11-hongkong-heritage-guide",
  "title": "香港歷史建築漫遊：半日路線",
  "slug": "hongkong-heritage-half-day-route",
  "seo": {
    "title": "香港歷史建築半日路線｜大館、中環街市",
    "description": "跟住呢條半日路線，輕鬆行完港島歷史建築重點景點。",
    "focus_keyword": "香港歷史建築路線",
    "canonical": null,
    "og_image": "material:xxxx"
  },
  "excerpt": "…",
  "category": ["旅遊"], "tags": ["香港", "歷史建築"],
  "language": "zh-Hant-HK",
  "blocks": [ … ],
  "status": "draft",
  "sources": ["kb-…"],
  "published_url": null
}
```

### 區塊（Blocks）

`heading` `paragraph` `list` `quote` `image`（引用 Materials，含 alt、caption）`video`（嵌入或連結）`callout` `table` `cta` `faq`（可產生 FAQ schema）`divider` `html`（受限）

## B3. SEO 規則（編輯器內即時提示）

| 項目 | 建議 |
|---|---|
| SEO Title | 約 50–60 字元內；含主要關鍵字；與 H1 不必相同 |
| SEO Description | 約 120–160 字元；有行動提示 |
| Slug | 英文小寫＋連字號；穩定不變 |
| H1 | 全文只有一個 |
| 圖片 | 每張有 alt；檔案經壓縮 |
| 內部連結 | 至少 2 個 |
| 可讀性 | 段落不過長；小標題間距合理 |

以上是起始建議，SEO 實務變化快，數值可在設定中調整。

## B4. 輸出到 WordPress

三種輸出，皆為一鍵複製：

1. **乾淨 HTML**（僅語意標籤，無多餘 class），可貼入「自訂 HTML」區塊。
2. **Gutenberg 區塊 Markup**（帶 `<!-- wp:paragraph -->` 註解），貼入程式碼編輯器後保留區塊結構。
3. **SEO 資料表**：Title／Description／Slug／Excerpt／分類／標籤，供貼到 Yoast／Rank Math 欄位。

**圖片處理：** 輸出時圖片使用你網站的媒體庫網址（需先上載）或附「圖片清單＋建議檔名＋alt」。第一版建議附清單，避免自動上傳的權限複雜度。

> 之後可選：以 WordPress REST API 直接建立草稿。須處理認證與權限，列為 P3。

## B5. 與 Knowledge、Materials 的關係

- 每段落可標「依據」連到 `kb_doc`（不一定顯示給讀者）；發布前 `kb.check_claims` 跑一次。
- 圖片、影片引用 Materials 的 Segment；素材的 `consent` 與授權在發布前檢查。
- 文章內的重點可由 Create 抽出，做成 IG carousel 或短片（同源產出，見 06）。

## B6. Edit／View／Agent

| 頁 | 內容 |
|---|---|
| Edit | 區塊編輯器（類 Notion／blog）；右側 SEO 面板與檢查；素材挑選器（搜尋 Materials）；預覽（桌面／手機）；「複製 HTML／Gutenberg／SEO」 |
| View | 文章列表（狀態、更新日、依據的知識、SEO 分數燈）；單篇閱讀版 |
| Agent | 文章摘要（主題、受眾、關鍵訊息、sources、可重用的圖與段落）；不含全文 |

### MCP

```text
posts.search(query, filters)        → L1 卡片
posts.get(id, blocks?)              → 摘要或指定區塊
posts.draft(brief, kb_refs, material_refs) → 產生草稿（AI提案）
posts.check(id)                     → SEO、依據、素材授權檢查
posts.export(id, format)            → html | gutenberg | seo
```

## B7. 分期

1. P2-a：Knowledge 的 Markdown 儲存、frontmatter、搜尋、Edit／View。
2. P2-b：`kb.search`／`kb.check_claims`、與 Create 串接。
3. P2-c：Posts 編輯器＋SEO 面板＋HTML 匯出。
4. P3：Gutenberg 輸出、WordPress REST 草稿。

## B8. 風險

| 風險 | 對策 |
|---|---|
| 法規知識過期 | `review_by` 提醒；Agent 頁標需覆核 |
| AI 寫出無依據宣稱 | `check_claims`；醫療／療效類強制 decision Needs |
| 貼進 WordPress 後樣式走樣 | 輸出只用語意 HTML，樣式交給主題 |
| 圖片版權 | 發布前檢查授權與同意 |

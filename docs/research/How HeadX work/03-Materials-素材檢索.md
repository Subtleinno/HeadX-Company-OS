# 03 · Materials 素材檢索（相片／影片）

版本 v0.1 ｜ 狀態：規劃稿

## 0. 為甚麼以往難做好（診斷）

常見失敗原因，也是本設計要解決的：

1. **描述太自由**：AI 每次用不同詞彙描述同一類畫面，日後搜不到。
2. **只靠向量搜尋**：語意相近但「不是香港」「不是這個品牌」的素材混進來。
3. **整段影片一個描述**：影片裏有十個畫面，只描述成一句。
4. **沒有「可用性」資訊**：不知道版權、人物同意、方向、可否裁切。
5. **沒有回饋**：被選用或被拒絕的紀錄沒有回流，檢索永遠不進步。

解法：**固定分類（taxonomy）＋結構化描述＋混合檢索（過濾→關鍵字→向量→重排）＋使用回饋。**

## 1. 資料模型：Asset → Segment → Description

```text
Asset（一個檔案）
 ├── 技術資料：hash、尺寸、時長、EXIF、GPS、拍攝日期、相機
 ├── 來源：human_shot | ai_generated | stock | client_provided
 ├── 權利：擁有者、授權、人物同意、可商用、到期日
 └── Segment（可檢索單位）
      ├── 相片：1 個 segment（整張）
      └── 影片：每個鏡頭 1 個 segment（含 start/end、關鍵幀）
           └── Description（結構化描述，見第 3 節）
```

**檢索的單位是 Segment，不是檔案。**

## 2. 入庫管線（Ingestion）

```text
上載（人，或 Needs 完成）
 ↓ 1 去重：sha256；近似重複（感知哈希）
 ↓ 2 技術資料：EXIF/GPS/時長；影片轉代理檔（720p）＋縮圖
 ↓ 3 影片切鏡頭（場景偵測）→ 每鏡頭抽 1–3 張關鍵幀
 ↓ 4 AI 結構化描述（固定 JSON）＋ 人臉／車牌／招牌敏感偵測
 ↓ 5 位置解析：GPS → 香港地點辭典（見第 4 節）
 ↓ 6 嵌入：描述文字向量；（選配）圖像向量
 ↓ 7 寫入 Postgres＋全文索引
 ↓ 8 人輕量確認（見第 7 節）
 ↓ 9 事件：asset.ready → 更新索引卡（見 06）
```

建議以背景 worker 處理；單個素材處理失敗不影響其他。

## 3. 結構化描述（Description Schema）

AI 必須輸出以下 JSON，欄位值盡量取自**固定詞表**（第 4 節），自由文字只放在 `caption` 與 `notes`。

```json
{
  "caption": "黃昏的大館正面，遊人在廣場拍照",
  "subject": ["landmark", "crowd"],
  "place": { "id": "hongkong.tai-kwun", "confidence": 0.93 },
  "scene": "outdoor-heritage",
  "time_of_day": "golden-hour",
  "weather": "clear",
  "season_hint": null,
  "people": { "count": "many", "identifiable": false, "consent": "unknown" },
  "shot": { "type": "wide", "angle": "eye-level", "movement": "static" },
  "orientation": "landscape",
  "colors": ["#C8A27A", "#3B4A63"],
  "mood": ["warm", "calm"],
  "text_in_image": [],
  "brand_marks": [],
  "quality": { "sharpness": "ok", "exposure": "ok", "noise": "low" },
  "usable_for": ["cover", "hero", "story-bg"],
  "avoid_for": ["close-up-people"],
  "safe_areas": { "top_third_empty": true, "center_empty": false },
  "notes": ""
}
```

**重點欄位：**
- `usable_for` / `safe_areas`：告訴 Create 這張圖適合放在哪裏、哪裏可以疊字。
- `people.consent`：人物同意狀態，影響可否使用。
- `place.id`：統一地點代號，不用自由文字。

## 4. 固定詞表與香港地點辭典

### 4.1 詞表（controlled vocabulary）

放在 Postgres，由你與 AI 共同維護，AI 可「提議新詞」，人確認後才加入：

- `subject`、`scene`、`mood`、`shot.type`、`time_of_day`、`usable_for`
- 每個詞有：代號、中文名、同義詞（含粵語口語、英文）、說明

### 4.2 香港地點辭典（Gazetteer）

```sql
create table place (
  id text primary key,              -- 'hongkong.tai-kwun'
  name_zh text, name_en text,
  aliases text[],                   -- 大館, 舊中區警署, Tai Kwun
  area text,                        -- 香港島/九龍/新界/離島
  lat numeric, lng numeric, radius_m int,
  kind text,                        -- heritage | casino | food | nature | transport
  shoot_notes text
);
```

GPS 落在半徑內即自動匹配；沒有 GPS 的相片由 AI 以畫面辨認，並標示信心值，低於 0.8 的進「待人確認」。

## 5. 檢索：混合＋漸進式

### 5.1 四步

```text
Query（來自 Create 的 brief，例如「大館黃昏，直幅，留空放標題」）
 ① 結構化過濾（SQL）：place、orientation、可商用、consent、來源
 ② 關鍵字（全文索引，含同義詞展開）
 ③ 向量相似（描述向量；選配圖像向量）
 ④ 重排：依 brief 的用途（safe_areas、usable_for、品牌色調）評分
 ↓
回傳「卡片」：id、縮圖、caption、place、理由（為何入選）、衝突警告
```

### 5.2 分數（簡單可解釋，非黑盒）

```text
score = 0.35·過濾吻合 + 0.20·關鍵字 + 0.25·向量 + 0.10·版面適配 + 0.10·歷史採用率
```

權重可調，每次回傳附「為何入選」。

### 5.3 漸進式揭露（給 AI agent）

| 層 | AI 看到 | 大小 |
|---|---|---|
| L1 | 搜尋結果卡片（id＋一句 caption＋標籤） | 每張約 40–60 token |
| L2 | 單張完整 Description JSON | 約 300 token |
| L3 | 實際圖片／影片（需要視覺判斷時才載入） | 按需 |

AI 預設只讀 L1，選出候選才讀 L2，真的要比較構圖才看 L3。

## 6. MCP 工具（對 agent 的介面）

```text
materials.search(query, filters, limit=8)      → L1 卡片
materials.get(id)                              → L2 描述
materials.similar(id, limit=5)                 → L1 卡片
materials.coverage(brief)                      → 這個 brief 缺甚麼（供開 Needs）
materials.record_use(id, project_id, outcome)  → 回饋：採用／拒絕／原因
materials.propose_tag(id, tag)                 → 提議新詞（人確認）
```

`materials.coverage` 是關鍵：它在檢索不足時回傳「缺口清單」，直接餵給 Needs（見 07）。

## 7. 人的角色：輕量確認，不是逐張審核

- 預設**不阻擋**：AI 描述入庫即可被檢索，但標 `AI描述`。
- 人只處理三類佇列：①地點信心低；②人物同意未知且畫面有人；③AI 想新增詞表。
- 被 Create 採用或拒絕的素材，回饋自動改善排序；多次被拒的描述進「待修正」。

## 8. 來源與權利

| 來源 | 預設處理 |
|---|---|
| 人拍攝（真實） | 優先；記錄拍攝者、日期、是否有肖像同意 |
| AI 生成 | 標 `ai_generated`；是否用於成品由人決定（decision Needs）；保存 prompt 與模型 |
| 客戶／第三方提供 | 記錄授權範圍與到期日 |
| 圖庫 | 記錄授權類型與編號 |

顯示在 Agent 頁：**`avoid_for`、`consent`、`license`** 一律先讀，不符合就不選。

## 9. 儲存與索引

| 內容 | 位置 |
|---|---|
| 原檔 | MinIO：`materials/original/{yyyy}/{sha256}` |
| 代理檔、縮圖、關鍵幀 | MinIO：`materials/derived/...` |
| 描述、詞表、地點、回饋 | Postgres |
| 向量 | Postgres（pgvector）；資料量大時再評估獨立向量庫 |
| 全文 | Postgres 全文索引（需配置中文分詞） |

> 備註：是否使用 pgvector 屬於技術選型，請在實作前小規模驗證中文、粵語、英文混合檢索的效果。

## 10. 評估（這是以往缺少的一環）

建立「黃金查詢集」：由你寫 30–50 條真實會用的查詢，並標出理想結果。每次更改詞表、模型或權重，自動跑一次並看：
- **Recall@5**：理想素材有沒有出現在前 5 名。
- **誤入率**：非香港或不可用素材出現的比例。
- **採用率**：Create 實際採用的比例（長期指標）。

## 11. 影片的特別處理

- 切鏡頭後，每鏡頭獨立描述；整部影片另有「摘要」與「故事結構」欄位。
- 對白或旁白：自動轉字幕，進入全文索引。
- 背景音樂另建 `audio` 類型素材（情緒、速度、可商用）。

## 12. 分期

1. P0-a：相片入庫＋結構化描述＋地點辭典＋過濾搜尋。
2. P0-b：加入向量與重排，建立黃金查詢集。
3. P0-c：影片切鏡頭。
4. P1：回饋學習、`coverage` 接 Needs。

## 13. 風險

| 風險 | 對策 |
|---|---|
| AI 描述錯誤（地點認錯） | 信心值＋待確認佇列＋黃金查詢集監測 |
| 個人資料（人臉、車牌） | 標記 `identifiable`、預設不用於公開成品，除非有同意（須專業確認私隱合規） |
| 中文／英文檢索不準 | 同義詞表＋分詞測試 |
| 素材量大時變慢 | 先過濾後向量；索引分區 |

# 我實際跑過 HxDesign 之後，學到的五件事

日期：2026-11-03
方法：把 HxDesign 完整部署在本機 Docker（不碰原 repo），用瀏覽器實際操作、直接查資料庫、讀它的目錄檔

---

## 一、部署結果（可以自己打開看）

| 項目 | 值 |
|---|---|
| 網址 | `http://127.0.0.1:3210` |
| 帳號 | `subtleinno@gmail.com` |
| 密碼 | `HxDesign-local-2026` |
| 角色 | super admin（第一個帳號） |
| 資料庫 | `127.0.0.1:15432`（避開你原本佔用的 5432） |
| 對外服務 | api 8420、web 3210、studio 3002、minio 59000/59001 |

**只改了主機端口。** 沒有動原 repo 一行程式碼，沒有動你現有的容器。

三個 Windows 專屬的坑，處理方式記在這裡：

| 問題 | 原因 | 解法 |
|---|---|---|
| 5432 綁定失敗 | 你的 moonic-web-postgres 已佔用 | 覆寫檔改 15432 |
| 55432 綁定失敗 | Windows 把 55416–55515 保留給 Hyper-V／WSL | 改用 15432 |
| 起動後畫面說「連不上 api」 | 忘記跑 migration，資料庫 0 張表 | 用一次性容器 `docker compose run --rm api node scripts/migrate.mjs` |

第四個要留意：Docker Compose 的 `ports` 預設是**追加**不是取代，所以覆寫檔要用 `!override`，否則會同時綁舊端口與新端口。

---

## 二、最重要發現：Strategy 不是概念，是**一份 41KB 的目錄檔**

你之前講 Strategy，我以為那是未實作的設計。**它已經做好了。**

位置：`modules/create/catalog/video.json`

```
version · kind · note
channels · formats
strategies[11] · kits[...]
```

### 每一條策略的結構（真實內容，逐欄說明）

```json
{
  "id": "st-vid-caption",
  "key": "video.caption-spatial-story",
  "title": { "zh": "字幕空間敘事", "en": "Caption spatial story" },
  "summary": { "zh": "讓字幕成為構圖的一部分，靜音也能讀懂畫面與產區。", "en": "..." },
  "scope": {
    "stages": ["awareness", "consideration"],
    "platforms": ["instagram", "tiktok", "youtube"],
    "formats": []
  },
  "priority": 85,
  "body": {
    "purpose": "給靜音滑動的觀眾；前 2 秒用字幕建立空間與懸念。",
    "pillars": "主體進場、手的比例、產區地景。",
    "tone": "短句、具體名詞；一句一個資訊點，不用驚嘆號堆疊。",
    "cadence": "每週 2–3 支短片；同一批素材可重剪成 9:16 與 1:1。",
    "dos": "做：字幕留在安全區、關鍵詞加粗。不做：把字幕壓在介面按鈕上。",
    "missing": "缺產區或批次旁白稿時，先開 Need；不要用無來源的形容詞填滿字幕。"
  },
  "mandatory": [
    { "id": "r1", "text": "字幕需全程存在，且可在播放器中關閉。", "kind": "lint",     "check": "caption-track" },
    { "id": "r2", "text": "字幕不得進入平台介面遮擋區。",             "kind": "lint",     "check": "safe-zone" },
    { "id": "r3", "text": "前 2 秒需出現整支片的主張。",               "kind": "guidance", "check": "hook-2s" }
  ]
}
```

### 為什麼這個結構很聰明

| 設計 | 好處 |
|---|---|
| `key` 有命名空間（`video.*`） | 不同創作類型（網站／排版／影片／3D）各有自己的目錄，不會撞名 |
| `title` / `summary` 多語言物件 | 介面語言可換，策略本身不重寫 |
| `scope.platforms` / `stages` / `formats` | **只列這個渠道用得上的策略**；你在介面上看到的就是那六個，不是全部十一個 |
| `priority` 55–88 | super admin 排的優先次序，介面直接照排 |
| `body` 有 purpose / pillars / tone / cadence / **dos** / **missing** | 不只是「怎麼做」，還有「缺什麼時候怎麼辦」 |
| **`mandatory` 帶 `kind` 與 `check`** | **這是關鍵：策略不只是建議，是可以機器檢查的條款** |

### 最後那一點，我認為是整個 HxDesign 最值錢的設計

`mandatory` 裡面有一項：

```json
{ "kind": "lint", "check": "safe-zone" }
```

意思是：**「字幕不得進入平台介面遮擋區」這件事，可以由程式驗證，而不是靠人記得。**

所以策略不是一份文件，是：

```
策略 = 意圖（body） + 可驗證的條款（mandatory.lint）
```

這令 AI agent 的輸出可以被**自動把關**，而不是只能靠人看。

**我要把這個模式抄進入門套件。** 這是本次最大的收穫。

---

## 三、資料模型比我想像的完整

`create_project` 有 27 個欄位，直接對應你講的整個流程：

| 欄位 | 對應你講的 |
|---|---|
| `kind` `title` `status` | 創作類型、名稱、草稿狀態 |
| `channel` `sub` `format` | 渠道、子渠道、格式（決定尺寸、安全區、長度） |
| **`strategy`** | **策略**（這裡存的是 key） |
| **`kit`** | **分鏡套件**（策略對應的幕次與秒數） |
| `intent` | 這份創作要達成什麼、給誰看、不要什麼 |
| `narration` `music` `voice` | 旁白稿、背景音樂、聲音 |
| **`knowledge`** (jsonb) | **勾選過的知識來源**——AI agent 只可以講這裡的事實 |
| **`gaps`** (jsonb) | **缺口**——匯出時記成待補，不硬湊 |
| `parent_id` | 子專案（一組 Reels 的每一集） |
| `ref_no` | `HX-001` 編號 |

**`knowledge` 與 `gaps` 這一對是靈魂：**

> AI agent 只可以講你在 `knowledge` 勾選過的事實。
> 沒有來源的地方進 `gaps`，變成「待補」，不會自己挑一個。

**它把「AI 會不會亂講」變成一個資料結構問題，而不是一個提示詞問題。**

---

## 四、介面文案本身就是產品規格

我在 Create 看到這幾句，認為比任何規格文件都準確：

| 位置 | 原文 |
|---|---|
| 空白狀態 | 「先選渠道與策略，再補知識與意圖。**缺口會變成待補，不會硬湊。**」 |
| 影片空白 | 「按『新創作』開始。渠道、格式、**策略**與分鏡來自 **super admin 的目錄**，你選的是**組合**，不是從零輸入。」 |
| 策略區 | 「只列這個渠道用得上的；**數字是 super admin 的優先次序**。」 |
| 分鏡套件 | 「這個策略的幕次與秒數；文案由你在下面寫，**套件不夾帶別人的文案**。」 |
| 知識來源 | 「AI agent 只可以講這裡勾選過的事實。」 |
| 空資料 | 「這是**真狀態**，不是載入失敗」「沒有用假卡片、假統計」 |

**「你選的是組合，不是從零輸入」** —— 這一句總結了設計師在 AI 時代的工作。

**「套件不夾帶別人的文案」** —— 這個原則防止了套版感，同時保護了品牌獨特性。

---

## 五、我對「重建在 Company-OS 一個 repo」的建議

你的方向是對的：使用者只需安裝一次。但**不是把 HxDesign 搬過去，而是把它的「模式」搬過去，再重寫。**

### 應該抄的五個模式（不是抄程式碼）

| # | 模式 | 為什麼 |
|---|---|---|
| 1 | **`mandatory` + `kind: lint` + `check`** | 策略變成可自動驗證的條款 |
| 2 | **`knowledge`（勾選的事實）+ `gaps`（缺口）分離** | 把「AI 亂講」變成資料結構問題 |
| 3 | **目錄即資料**（`catalog/*.json`，版本化在 git） | 改策略＝改檔案＝有 diff、可回滾 |
| 4 | **`scope` 過濾**（只列用得上的） | 介面不會塞爆人 |
| 5 | **`ref_no` 編號即地址** | `HX-001` 可以口頭講、可以貼進對話 |

### 應該保留的紀律

| 紀律 | 為什麼 |
|---|---|
| 空狀態誠實（「這是真狀態，不是載入失敗」） | 假資料會令 agent 與人都判斷錯 |
| 不用假卡片、假統計 | 同上 |
| 匯出時記缺口，不硬湊 | 這是產品誠信的核心 |
| 用 DB trigger 保證 append-only | 應用層會忘記 |
| 越權要報錯，不回空結果 | 空結果看起來像成功 |

### 重建的次序（我建議）

```
第一步：Company-OS 加一個 create 模組骨架
        └── catalog/*.json（策略目錄即資料）
        └── create_project（27 欄位的簡化版）
        └── mandatory 檢查器（先做 safe-zone 與 caption-track 兩個）

第二步：一個 skill（SKILL.md + references/ 漸進揭露）

第三步：把 Company OS 的閘道接上，L2/L3 動作進批准收件匣

第四步：設計／影片／圖像三條生產線接到這個模組
```

**先做 `mandatory` 檢查器**，因為它是整套東西唯一能「自動判斷做得好不好」的地方。沒有它，策略只是文字。

---

## 六、怎麼啟動與關閉（以免你以為它壞了）

```powershell
# 啟動
cd "C:\Users\Billy Chung\src\hxdesign-reference"
docker compose -f docker-compose.yml -f "C:\Users\Billy Chung\AppData\Local\Temp\hx-compose-override.yml" --env-file .env up -d

# 關閉（保留資料）
docker compose -f docker-compose.yml -f "C:\Users\Billy Chung\AppData\Local\Temp\hx-compose-override.yml" --env-file .env stop

# 完全移除（含資料庫資料）
docker compose -f docker-compose.yml -f "C:\Users\Billy Chung\AppData\Local\Temp\hx-compose-override.yml" --env-file .env down -v
```

**Studio 容器（3002）一直在重啟。** 它是 HyperFrames 的時間軸編輯器，需要瀏覽器環境；
它不影響 api 與 web，所以主流程可用。這件事已記在缺口，不假裝正常。

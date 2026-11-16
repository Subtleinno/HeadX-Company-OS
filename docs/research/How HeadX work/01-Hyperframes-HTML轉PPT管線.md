# 01 · Hyperframes 取單格 → PPT／PDF／PNG 管線

版本 v0.1 ｜ 狀態：規劃稿

## 0. 一句話

Hyperframes 是 **Render 層**。我們的真相是 **HTML composition**；影片只是其中一種導出。要做 PPT，就是**不輸出影片，只取某一格（通常第一格或指定時間點）**，把每格變成一頁。

> 說明：你已實測此做法可行。本文把它變成可重複、可驗收的規格；實作前仍建議用你現有的一份 composition 做 spike（見第 9 節）。

## 1. 為甚麼這個設計成立

- 同一份 HTML 可以輸出：影片（MP4）、靜態圖（PNG）、IG carousel（逐頁 PNG）、PPT（逐頁圖片或可編輯元素）、PDF、網頁。
- 所以「產出類型」不是 app 的分支，而是 **Output Profile**（輸出規格）的差別。
- 模板（見 04）只寫一次，換 Output Profile 就換輸出。

## 2. 概念模型

```text
Composition（HTML，帶 slots 與 brand tokens）
   └── Scene / Slide 1..n（每頁一個 scene，帶時間軸）
Output Profile（輸出規格）
   ├── video-mp4      解像度、fps、音軌
   ├── still-png      取第 t 秒的一格；尺寸；倍率
   ├── carousel-png   每個 scene 一張
   ├── ppt-image      每個 scene 一頁，圖片鋪滿
   ├── ppt-hybrid     背景圖＋可編輯文字框
   └── pdf            每個 scene 一頁
```

## 3. 取格規則（Frame Selection）

每個 scene 在 composition 內聲明 `still_at`：

| 值 | 意思 |
|---|---|
| `0` | 第一格（預設） |
| `end` | 動畫完成後的最後一格 |
| `2.5s` | 指定秒數 |
| `settled` | 等所有入場動畫結束再截（建議，避免截到半途） |

**為甚麼要 `settled`：** 動畫類模板的第一格常是「元素還未入場」的空畫面。模板作者要為靜態輸出準備一個「完成狀態」。若模板沒有宣告，預設取 `end`，並在預覽提醒。

## 4. 三種 PPT 等級（由簡到難）

| 等級 | 做法 | 優點 | 限制 | 建議 |
|---|---|---|---|---|
| A. 圖片 PPT | 每頁一張高解像 PNG 鋪滿 | 100% 還原品牌外觀；最穩 | 文字不可編輯 | **第一版** |
| B. 混合 PPT | 背景（圖形、相片）為圖，文字／標題為可編輯文字框 | 客戶能改字；外觀仍接近 | 字體須安裝或內嵌；需 slot→座標映射 | **第二版** |
| C. 原生元素 PPT | HTML 元素逐個轉成 PPT 形狀 | 完全可編輯 | CSS 效果大量失真；成本高 | 不建議 |

### B 級的做法

1. 模板的每個文字 slot 帶 `bbox`（由 render 後的 DOM 量得座標）。
2. 輸出時：先把文字 slot 隱藏，render 背景圖；再用 PPTX 函式庫在相同座標放文字框，套用字體、字號、顏色（來自 brand tokens）。
3. 字體：若 PPT 使用者機器沒有該字體，會被替換。處理方式：輸出時提示「建議安裝字體包」，並附字體授權說明（見 08）。

## 5. 管線

```text
Create 產生 composition
   ↓
Lint（見第 7 節）
   ↓
Render Job（Output Profile = ppt-image）
   ↓  對每個 scene：載入 → 等 settled → 截圖（2x）
PNG 序列（存 MinIO）
   ↓
Packager（python-pptx 或同類）
   ↓  16:9、每頁鋪滿；備註欄放講稿；alt text 放描述
.pptx（存 Create）
```

## 6. 資料模型（Postgres）

```sql
create table output_profile (
  id text primary key,            -- 'ppt-image'
  kind text not null,             -- video | still | carousel | ppt | pdf
  width int, height int, scale numeric default 2,
  frame_rule text default 'settled',
  options jsonb default '{}',
  version int not null default 1
);

create table render_job (
  id uuid primary key,
  project_id uuid not null,
  composition_id uuid not null,
  composition_version int not null,
  profile_id text not null references output_profile(id),
  status text not null,           -- queued | running | done | failed
  error jsonb,
  outputs jsonb,                  -- [{scene, file_key, sha256}]
  created_at timestamptz default now()
);
```

## 7. Lint（render 前自動檢查，失敗不阻擋，只標記）

- 文字溢出 slot 的框。
- 對比度低於 WCAG AA（4.5:1）。
- 安全區（IG 上下留白、PPT 邊距）被侵佔。
- 字體未載入（落回預設字體）。
- 圖片解像度低於輸出尺寸的 80%。
- 有 `still_at` 但動畫未結束。

## 8. 備註、講稿與無障礙

- PPT 的**備註欄**放該頁講稿（來自 Create 的 storyboard）。
- 每頁圖片加 **alt text**（來自素材描述或 slot 文字）。
- PDF 輸出時保留文字層是 B 級才有的能力；A 級為純圖片 PDF。

## 9. 先做一個 Spike（半天到一天）

驗收三件事：
1. 用你現有一份 composition，輸出 5 頁 PNG（取 `settled`）。
2. 組成 .pptx，在 PowerPoint 與 Keynote 打開外觀一致。
3. 同一份 composition 換另一個品牌 tokens，外觀正確切換。

## 10. 風險與對策

| 風險 | 對策 |
|---|---|
| 截圖時字體未載入 | render 前等 `document.fonts.ready` |
| 動畫截到半途 | 強制 `settled` 規則 |
| PPT 檔案太大 | 圖片用 JPEG 質素 90 或 WebP；超過限制提示 |
| 客戶要改字 | 提供 B 級，或同時附上 HTML／Figma 式說明 |
| 動態效果（轉場）丟失 | 明示：PPT 為靜態；動態請輸出影片 |

## 11. 與其他文件的關係

- 模板與 slots：見 04。
- 路由與組裝：見 06。
- 失敗或缺素材時的 Needs：見 07。

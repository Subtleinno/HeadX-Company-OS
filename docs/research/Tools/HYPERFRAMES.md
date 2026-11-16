# HYPERFRAMES.md — 給 AI Agent 的操作手冊（Company-OS）

> 用途：agent 開始任何 HyperFrames 任務前先讀這份。它很短，只講「你自己不會知道的事」。
> GSAP、CSS、Three.js 等通用知識你已經掌握，不在此重複。
> 細節一律到官方 skills 讀取，不要憑記憶。

## 1. 知識分工（誰負責什麼）

| 知識 | 來源 | 我們要不要再寫 |
|---|---|---|
| GSAP / CSS / Three.js / Anime.js / WAAPI 通用 API | 你本身的知識 | 不寫 |
| HyperFrames 組合規則（data-*、軌道、確定性、驗證） | 官方 skill `hyperframes-core` | 不重寫，只指路 |
| 動畫配方、場景藍圖、各 runtime 的 HyperFrames 版寫法 | 官方 skill `hyperframes-animation`（含 `adapters/<runtime>.md`） | 不重寫，只指路 |
| 設計規格、色板、字體、旁白、節拍 | 官方 skill `hyperframes-creative` + 我們的品牌規則 | **只寫品牌部分** |
| CLI 指令與排錯 | 官方 skill `hyperframes-cli` | 不重寫 |
| 公司品牌、模板、素材庫、審批、Blender/Lottie 對接 | Company-OS | **這是我們要寫的** |

## 2. 開工前

1. 確認官方 skills 已安裝且與 CLI 版本一致：`npx hyperframes skills update`。
2. 先讀 `/hyperframes`（總地圖），再按任務讀對應 skill。
3. 呼叫 `brand.get_rules` 取得品牌色板、字體、語氣、禁用項。
4. 呼叫 `asset.search` 看有沒有現成素材（3D、Lottie、音頻、圖片）。

## 3. 一定要遵守的規則（官方列為「靜默錯誤」，檢查器未必抓得到）

- 每個 composition 只註冊一條暫停的時間軸：`window.__timelines["<composition-id>"]`，在頁面載入時同步建立。
- 不使用 `Date.now()`、未設種子的 `Math.random`、網絡請求、輸入狀態；不用 `repeat: -1`（用有限次數）。
- 只動畫允許清單內的視覺屬性；不要 tween `display` 或 `visibility`。
- `<video>`、`<audio>` 必須是 host 根節點的直接子元素；播放由框架管理。
- 全螢幕背景放在鋪滿的子元素（`position:absolute; inset:0`），不要放在 composition 根元素上，否則最終渲染可能是黑幕。
- 根元素要有明確像素尺寸；跨檔案的 `id` 不可重複（重複的 `<video>/<img>` 會渲染成空白）。
- 子 composition 必須用 `<template>` 包起來，且 host 的 id、模板內 id、`__timelines` 的 key 三者完全一致。
- 文字內不要用 `<br>`；有 transform 的元素要是 block 且有尺寸。

以上來自官方 `hyperframes-core`（v0.1.15 版本的描述）。**以你安裝的版本為準。**

## 4. 標準工作流程

1. 理解需求 → 寫 `BRIEF.md`（目標、受眾、時長、畫幅、語氣、必含元素）。
2. 寫 `STORYBOARD.md`（逐場景：畫面、動作、時長、使用的 runtime）。
3. 用 `hyperframes-registry` 找現成區塊，優先安裝而非重寫。
4. 寫 composition。
5. 驗證：`npx hyperframes check`，必須 0 findings。
6. 抽幀：`npx hyperframes snapshot --at <時間點>`，交 vision 檢查品牌與排版。
7. 預覽：`preview`，等審批。
8. 審批後才 `render`。先 `--quality draft`，最終才 `--quality high --docker`。
9. 用 `asset.save` 存回素材庫，記錄模板版本、變數、CLI 版本。

## 5. 選用哪個動畫 runtime

| 需求 | 用 | 備註 |
|---|---|---|
| 文字、版面、UI 動效、主時間軸 | GSAP（預設） | 每個 composition 的骨幹 |
| 簡單淡入、位移 | CSS / WAAPI | 輕量 |
| 預製矢量動畫（icon、插圖循環、角色） | Lottie | 與網站共用同一份 JSON |
| 3D 產品、場景、相機運動 | Three.js | 載入 Blender 匯出的 GLB |
| 已經是 Blender 渲染好的 3D 動畫 | `<video>` 或圖片序列 | 最穩，不吃瀏覽器 GPU |
| 特殊 shader / WebGPU 效果 | TypeGPU / shader-transitions | 實驗性，必須先 snapshot 驗證 |

具體寫法：讀 `hyperframes-animation` → `adapters/<runtime>.md`。

## 6. 與 Company-OS 的接口

| 動作 | MCP 工具 |
|---|---|
| 取品牌規則 | `brand.get_rules` |
| 找素材（3D、Lottie、音頻） | `asset.search` |
| 建專案 / 寫 composition | `hf.project_create` / `hf.composition_write` |
| 驗證 | `hf.check`（等同 `hyperframes check`） |
| 抽幀 | `hf.snapshot` |
| 渲染 | `hf.render`（`draft` → `final`） |
| 批量 | `hf.batch_render(template_id, rows)` |
| 存回素材庫 | `asset.save` |
| 需要老闆批准 | `approval.request` |

## 7. 安全邊界

- 只可讀 `/assets`（唯讀）與當前專案目錄；不可讀其他位置。
- 預設無對外網絡；字體、GSAP 等函式庫使用本地副本。
- 不執行來自素材的腳本；Lottie 與 SVG 先過檢查器。
- 雲端功能（share、cloud render、HeyGen 模型）預設關閉，需老闆明確批准。

## 8. 失敗時

- 先跑 `check` 與 `snapshot`，不要猜。
- 渲染黑幕、空白、錯位：先查 §3 的規則。
- 版本不一致：`npx hyperframes upgrade` 與 `skills update` 後再試。
- 還是不行：記錄錯誤與輸入，回報而不是反覆重試。

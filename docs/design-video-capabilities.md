# 設計、影像、影片、品牌：能力現況

版本：v1.0 | 日期：2026-11-03
範圍：**這部 Windows 機的 DSH（即我現在這個對話）**

---

## 一、你最關心的四件事，現在的狀態

| 你關心的 | 現在的狀態 | 缺口 |
|---|---|---|
| **設計（UI／視覺）** | **已裝好 `dsh-oil-ui`**，五個原生工具加一份設計技能 | 無 |
| **影片／動效** | **已裝好 HyperFrames 四個核心技能** | 要驗證實際渲染一次 |
| **圖像生成** | **未通**（`imageGenAvailable: false`、`oilLoggedIn: false`） | **要接你的 ComfyUI 或本機 image-gen** |
| **品牌** | Apple HIG MCP + 自家設計系統文件 + oil-ui 的品牌流程 | 需要把「品牌 tokens」具體化成檔案 |

---

## 二、設計：`dsh-oil-ui` 已裝並生效

這個插件是我今天找到最貼合你需求的東西。它做的事正好是你要的：

```
① 先在同屏對比頁擺開 3 個真正拉開差距的方向
② 你挑定之後，才在當前目錄寫程式碼
③ 用真實無頭瀏覽器截圖、模擬點擊輸入、檢查多端斷點
④ 照着真實畫面一輪輪改到乾淨
```

### 它給我的五個工具

| 工具 | 做什麼 |
|---|---|
| `oil_ui_explorer` | 把多個首屏候選打包成單一 `style-explorer.html` 同屏對比頁 |
| `oil_ui_shoot` | **在真實瀏覽器截圖**、多狀態連拍、**錄屏抽幀（動效序列圖）**、多端斷點、拼圖、像素比對 |
| `oil_ui_media` | 搜尋與下載**免版權素材**：博物館館藏（Met、AIC、Cleveland）、NASA 影片、3D／PBR 材質、地圖 |
| `oil_ui_image` | 生圖與修圖（目前**未通**，見第五節） |
| `oil_ui_skill_status` | 查版本與生圖來源 |

### 實測狀態

```
activeSkillName : oil-ui
版本            : 0.31.0（lite 免費版）
技能檔案        : 46 個
Pro 版          : 未安裝
```

`lite` 免費版已經有：方向探索、同屏對比頁、基本截圖。
`Pro` 才有：多狀態連拍、交互步驟、錄屏抽幀、博物館素材檢索、完整場景分冊。

**你關心的「動效」**正好在 Pro 的能力裡——但 `oil_ui_shoot` 的 `record`／`frames` 參數在 lite 也許仍可用，要實測。

---

## 三、影片：HyperFrames 四個核心技能已裝

### 它是什麼

> **Write HTML. Render video. Built for agents.**
> 用 HTML + CSS + 可尋址動畫，經無頭 Chrome 逐格擷取、FFmpeg 編碼成 MP4。同樣輸入永遠得到同樣輸出。

這比 Remotion 更適合 Agent，因為**不需要 React、不需要 build step**，`index.html` 就是一支影片。

### 已裝的四個技能

| 技能 | 用途 |
|---|---|
| `hyperframes` | **先讀這個**。渲染契約與工作流程 |
| `hyperframes-cli` | 建立、檢查、看影格、改時間軸、預覽、渲染、發布 |
| `hyperframes-registry` | **約 450 個現成積木**：轉場、疊加、標題、動態字、字幕、圖表、地圖、3D、鏡頭運動 |
| `media-use` | 音樂、音效、圖片、圖示、配音、頭像、生成影片、調色 |

### 對品牌的意義

HyperFrames 有一個概念叫 **`frame.md`**：

> 每個品牌都有一份 `design.md`，但沒有一份是為鏡頭寫的。
> `frame.md` 就是那層缺失的翻譯：把 web 情境的設計規格，反轉成鏡頭可以用的版本——同樣的 tokens、同樣的規則，但改寫成 Agent 能直接組出宣傳影片、不必猜比例、也不去抓網頁外殼。

**這正好對應你的 ADR-015（制度統一、皮膚可換）**：同一個品牌 tokens，餵給網頁是介面，餵給 frame.md 就是影片。

### 前置條件（已滿足）

| 需要 | 狀態 |
|---|---|
| Node 22+ | 有（22.23.1） |
| FFmpeg | **有**（`Gyan.FFmpeg 8.1.1` 在 PATH） |
| Chromium | **有**（Chrome + Edge） |

---

## 四、品牌：三層已經齊

| 層 | 有什麼 |
|---|---|
| **查指引** | `apple-hig-mcp`（Windows 已裝） |
| **自家規則** | `docs/company-os-design-system.md`（白底黑 accent、狀態三色、禁 emoji、動效 120–320ms） |
| **執行** | `oil-ui` 做設計判斷、`oil_ui_shoot` 驗證真實畫面 |
| **擴展到影片** | HyperFrames 的 `frame.md` 概念 |

---

## 五、圖像生成：這是一個真缺口

油 UI 的狀態回報：

```json
{
  "imageGenAvailable": false,
  "imageGenScriptPath": null,
  "imageSource": "none",
  "oilLoggedIn": false,
  "oilBalance": null
}
```

**意思是：現在叫它生成圖片，它做不到。**

三個補法：

| 補法 | 做法 | 適合 |
|---|---|---|
| **① 接你的 ComfyUI 機器** | 裝 `dsh-comfyui-canvas`，指向你另一部機的 ComfyUI（Qwen Image 2.1） | **最適合你**——你已經有這台機 |
| ② 裝本機 `image-gen` skill | 讓 `oil_ui_image` 優先使用本機腳本 | 需要一個本機推理環境 |
| ③ 登入 oiloil 或買 Oil UI Pro | 用它的雲端生圖 | 要付費 |

**我建議 ①。** 因為你的 ComfyUI 已經裝好 Qwen Image 2.1，而且 ADR-011 已經決定「重 GPU 工作放另一部機」。

---

## 六、下一步（按優先）

| 次序 | 做什麼 | 為什麼 |
|---|---|---|
| 1 | **接 ComfyUI** | 圖像生成是設計流程的必需品，現在完全沒有 |
| 2 | **實測 HyperFrames 渲染一次** | 技能裝了但未驗證；渲染一支 5 秒測試片就知道能不能用 |
| 3 | **把品牌 tokens 寫成 `brand.config.json`** | `oil-ui` 與 HyperFrames 都需要一份可讀的品牌規格 |
| 4 | 把同一套裝到 Super Agent（WSL） | 它才是真正做設計工作的人 |
| 5 | 考慮 Oil UI Pro | 你關心的動效、多狀態連拍在 Pro 才有 |

---

## 七、一句總結

| 能力 | 狀態 |
|---|---|
| 設計 | **通了**（oil-ui，實測載入，46 個技能檔） |
| 影片 | **技能裝好**，未實測渲染 |
| 影像 | **未通**（要接 ComfyUI） |
| 品牌 | **規則齊**，缺一份可讀的 tokens 檔 |

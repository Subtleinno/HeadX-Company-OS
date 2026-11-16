# HeadX Creative Pack — 安裝清單（你只需做一次）

用法目標：你只講需求（例如「幫我做一支 15 秒新產品宣傳片」），agent 自己讀品牌、搵素材、揀工具、製作、檢查、交付。

## A. 要安裝的 MCP

| # | MCP | 來源 | 用途 | 狀態 |
|---|---|---|---|---|
| 1 | **headx-creative**（本包 `mcp/`） | 我們開發 | 品牌規則、素材庫、模板、任務、Lottie 生成與安全檢查、審批、經驗記錄、HyperFrames/Blender 任務 | 核心邏輯已在沙盒測試；MCP 外殼與 Blender 部分未測 |
| 2 | Blender 官方 Lab MCP | Blender 官方 | **只用於探索／開發新模板**，不給自動管線（它會不設防執行 LLM 代碼） | 可選 |
| 3 | cavalry-mcp | 社群（Kydaix） | 你有 Cavalry 授權時，匯出 Lottie | 可選，使用前審查代碼 |

HyperFrames 沒有單獨 MCP：它走官方 CLI + Skills，由 headx-creative 的 `job_submit(type="hyperframes")` 呼叫。

## B. 要安裝的 Skills

官方（HyperFrames）：
```bash
GIT_LFS_SKIP_SMUDGE=1 npx skills add heygen-com/hyperframes
npx hyperframes skills update
```
我們開發（本包 `skills/`，複製到你的 agent 的 skills 目錄；各 agent 目錄不同，按其文件）：
1. `headx-creative-director` — **總指揮，主動模式**（入口）
2. `headx-brand-guardian` — 品牌把關
3. `headx-hyperframes-production` — 影片流程（公司層）
4. `headx-blender-production` — 3D／產品渲染流程
5. `headx-lottie-production` — Lottie 流程與安全

格式遵守 Agent Skills 規格（name 小寫連字號、與資料夾同名；description ≤ 1024 字）。

## C. 系統需求
- Python 3.10+，`pip install -r mcp/requirements.txt`
- Node.js 22+、FFmpeg（HyperFrames）
- Blender 4.x/5.x（設定 `BLENDER_BIN`）
- 可選：Docker（確定性渲染）

## D. 安裝步驟
1. 解壓本包；`pip install -r mcp/requirements.txt`
2. 把 `mcp/mcp-config.example.json` 內容（改好路徑）加入你的 agent 的 MCP 設定。
3. 安裝上面的 skills。
4. 對 agent 說：「呼叫 tool_doctor，告訴我缺甚麼。」
5. 對 agent 說：「幫我設定品牌」並提供 logo/色板/字體（它會用 brand_set_rules）。
6. 放入你的 3D 檔（GLB）並說：「把 /path/xxx.glb 入庫」。

## E. 日常用法（你只需要這樣講）
- 「幫我做一個網站載入動畫，用品牌藍色。」
- 「用呢個椅子模型出 3 張產品圖同一段轉盤，再做一支 15 秒社交短片。」
- 「做一支 30 秒新品發佈片，要有數字計數同我個產品轉盤。」
Agent 會自己：讀品牌 → 搵素材 → 揀 Lottie/Blender/HyperFrames → 製作 → 檢查 → 要你批准 → 入庫 → 回報。

## F. 已測試 / 未測試（誠實清單）
已在沙盒測試（Python 邏輯）：Lottie 生成與驗證（拒絕 expressions、URL、錯誤參數）、素材庫、品牌色檢查、任務記錄、審批、經驗記錄、缺工具時的錯誤處理、skills 格式。
**未測試**：FastMCP 外殼在你的 agent 內連線、Blender worker（需要你的 Blender 實跑；先用一個 GLB 測 still）、HyperFrames 任務（需要 Node+CLI；旗標以 `--help` 為準）、Lottie 在 lottie-web 的視覺效果、skills 被你的 agent 自動觸發的準確度。
第一次實測順序：tool_doctor → lottie_generate → blender still → hyperframes check_only。

## G. 尚未開發（下一批）
HyperFrames 專案自動建立工具、模板庫（品牌字卡、產品轉盤）、TTS/Whisper 語音 worker、無縫圖案 Blender 模板、審批後台介面。

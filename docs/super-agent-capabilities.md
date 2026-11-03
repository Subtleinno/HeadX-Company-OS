# Super Agent 的能力清單

版本：v1.0 | 日期：2026-11-03
狀態：**建置中**（這一頁是「它要會做什麼」的契約，不是「它現在會做什麼」的清單）

---

## 為什麼要有這份文件

你講過一句很準的話：

> 「Right now, it is still not yet the right time to start the development, because actually we need to install right plugins / MCP / Skills... make sure it is powerful enough to handle all kind of project.」

這是對的。**Agent 的能力上限決定它可以接什麼 project。** 如果它只會改 TypeScript，它永遠做不了 ERP；如果它看不懂別人的系統，它永遠只會抄。

所以這份文件回答一個問題：**要接住「公司入門套件」的所有工作，它需要哪些能力？**

---

## 一、四類 project，四組能力

「公司入門套件」要交付的不是一個 app，是四類：

| # | 類型 | 例子 | Agent 需要什麼能力 |
|---|---|---|---|
| **A** | 自家新寫的系統 | Company OS、入門套件骨架 | 寫程式、測試、CI、設計系統（已有） |
| **B** | 改造別人的系統 | **把 ERPNext 逆向理解，重做成 AI 原生 ERP** | **逆向工程** + 讀大型 codebase + 理解資料模型 |
| **C** | 接駁外部系統 | WordPress、ERPNext、會計 | API／MCP 接駁、爬網頁、讀文件 |
| **D** | 內容與設計 | 品牌素材、文案、網站 | 視覺、圖像生成、設計規格（已有部分） |

**B 是關鍵。** 因為你明確講過：想用 REA 逆向 ERPNext，重做成更易用、AI 原生的 ERP。這是整套計劃裡最有價值、也最難的一步。

---

## 二、能力清單（按優先次序）

### 第一級：沒有它做不了 B 類

| 能力 | 工具 | 狀態 | 備註 |
|---|---|---|---|
| **逆向工程** | `rea-agents`（RAE）v6.7.0，MCP stdio | **已安裝到 Super Agent** | 見第三節 |
| **讀大型 codebase** | 內建 `grep`／`glob`／`read` + 專案索引 | 部分 | 需要一個 codebase 索引工具（見第四節） |
| **資料庫結構理解** | RAE 的 `SQLite` 檢查 + 直接連 DB | 部分 | ERPNext 用 MariaDB，要另配 |

### 第二級：沒有它做不了 C 類

| 能力 | 工具 | 狀態 |
|---|---|---|
| 瀏覽器操作 | `dsh-browser`（Windows 已裝） | **WSL 未裝** |
| 視覺（看圖、OCR） | `@liustack/modlens`（Windows 已裝） | **WSL 未裝** |
| 網頁擷取與分析 | RAE 的 `analyze-web-bundle`、`capture-web-screenshot` | 已裝但**需要瀏覽器** |

### 第三級：令它做得更好

| 能力 | 工具 | 狀態 |
|---|---|---|
| 記憶（跨 session） | `dsh-mnemon` | WSL 未裝 |
| 多 Agent 協作 | `@nanmicoder/dsh-agent-teams` | WSL 未裝 |
| Apple HIG 查詢 | `apple-hig-mcp` | WSL 未裝 |
| Skills / MCP 管理 | `dsh-skill-mcp-panel` | **已裝到 Super Agent** |
| Company OS 閘道 | 自家 `company-os` MCP | WSL 未裝 |

---

## 三、RAE 已裝好（第一個真正的能力）

### 它現在在哪

```
WSL Ubuntu
├── Node 24.11.0（新裝，因為 RAE 要求 22.23.4+ 或 24.x）
├── rea-agents 6.7.0（npm 全域）
└── Super Agent 的 superagent profile
    └── MCP 伺服器 rea（stdio，已載入，健康）
```

設定寫在 `~/.dsh/profiles/superagent/cordis.patch.yml`：

```yaml
- insert:
    - id: panel-mcp-rea
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: rea
        command: /home/riderhin/nodejs24/bin/node
        args:
          - /home/riderhin/nodejs24/lib/node_modules/rea-agents/scripts/rea.mjs
          - --mcp
```

實測：直接餵 `initialize` 給它，回 `{"serverInfo":{"name":"rea","version":"6.7.0"}}`。Super Agent 重啟後健康狀態全綠。

### 它會做什麼（對我們有用的部分）

| 對 ERPNext 逆向有用的能力 | 做什麼 |
|---|---|
| `analyze-web-bundle` | 抓頁面的 JS bundle，靜態分析出模組、路由、API 呼叫 |
| `capture-browser-scenario` | 跑一個有界的瀏覽器場景，記錄網路請求與結果 |
| `export-web-scripts` | 把頁面腳本存出來，之後離線分析 |
| `inspect` / `inspect-web-network-captures` | 理解一個網站實際呼叫哪些 API |
| `analyze-javascript-application` | 靜態重建 Electron／JS app |

### 它做不到的（要老實講）

| 缺口 | 影響 | 補法 |
|---|---|---|
| **沒有原生分析引擎**（Hopper／Ghidra／IDA） | 做不到「反編譯 binary」 | 我們暫時不需要；ERPNext 是開源的，讀原始碼比反編譯有效 |
| **WSL 內沒有瀏覽器** | `analyze-web-bundle` 等網頁類功能跑不到 | 要裝 Chromium（Playwright） |
| 不能直接連 MariaDB | 讀不到 ERPNext 的實際資料表 | 另配一個 DB 檢查工具 |

### 一個重要的判斷

**對 ERPNext 這種開源系統，「逆向」的真正含義不是反編譯，而是：**

1. 讀它的原始碼與文件 → 理解資料模型與工作流
2. 實際操作它的介面（RAE 的瀏覽器能力）→ 看真實行為
3. 連它的資料庫 → 看真實結構
4. 然後設計一個 AI 原生的替代品

RAE 幫到第 2 步。第 1、3 步要靠別的工具。**這一點我不想含糊，因為它決定要不要花時間裝 Ghidra（結論：暫時不需要）。**

---

## 四、下一步要裝什麼（按次序）

| 次序 | 裝什麼 | 為哪一類 project | 前置條件 |
|---|---|---|---|
| 1 | **Chromium**（Playwright）到 WSL | B、C 類 | 可能要 sudo 安裝系統依賴 |
| 2 | **dsh-browser** 到 Super Agent profile | C 類 | 與 Chromium 配合 |
| 3 | **company-os MCP** 到 Super Agent profile | 全部（這是閘道） | Company OS 引擎要在 WSL 能連到 |
| 4 | **dsh-mnemon**（記憶） | 全部 | 無 |
| 5 | **modlens**（視覺） | D 類 | 要一個視覺引擎端點 |
| 6 | **codebase 索引**（自建或第三方） | B 類 | 未有定案 |
| 7 | **DB 檢查工具**（MariaDB／Postgres） | B 類 | 要有資料庫連線 |

**第 1 至 4 是「現在就該做」的。** 第 6、7 要等你確認 ERP 方向之後再決定。

---

## 五、我要提醒的一件事

「裝更多工具」不等於「更強」。

真正的瓶頸有三個，工具只解決第一個：

| 瓶頸 | 工具能解決嗎 |
|---|---|
| 有沒有能力做（會不會用瀏覽器、會不會逆向） | **可以** |
| 知不知道要做什麼（上下文、規格、公司規則） | 靠 `AGENTS.md` 與 issue 寫得夠清楚 |
| 做完之後有沒有人把關 | 靠 Company OS 的閘道與批准 |

所以你之後會見到我一直問你「規格是什麼」，而不是一直裝工具。**因為第二個瓶頸是裝不回來的。**

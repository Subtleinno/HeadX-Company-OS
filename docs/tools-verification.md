# 你點名的工具：逐一查證結果

版本：v1.0 | 日期：2026-11-03
方法：直接查 npm registry（不是靠記憶、不是靠搜尋結果的轉述）。**找不到的如實寫找不到。**

---

## 一、可以裝到 Super Agent 的（DSH 插件／MCP）

| 你點名的 | npm 套件 | 版本 | 是什麼 | 建議 |
|---|---|---|---|---|
| Billion-context | `billion-context` | 0.1.212 | 上下文壓縮：同樣內容用少 5 倍 token，可支援超長 session | **值得試**，但要觀察它會不會改變回答質素 |
| dsh-genui | `@changfenhuang/dsh-genui` | 0.15.0 | 在回覆內渲染互動圖表、表單、儀表板 | 對「Dashboard」有用，但那是介面層，不是能力層 |
| dsh-genui（另一支） | `dsh-genui` | 0.3.1 | 同上，較舊的分支 | 用 scoped 那個 |
| dsh-image-gen | `dsh-image-gen` | 0.10.2 | 圖像生成（Gemini／OpenAI／Seedream） | **你已經有 ComfyUI 機器**，重複；除非要它的 API |
| dsh-context | `dsh-context` | 0.80.2 | 上下文儀表板與管理 | 診斷用，非必要 |
| dsh-im | `dsh-im` | 1.0.5 | IM 橋樑：經 IM 指揮、通知、批准 | 屬 P6（飛書階段） |
| dsh-skills-manager | `dsh-skills-manager` | 0.2.0 | 全域／工作區安裝與管理技能 | **被安全閘擋住**（需 `allow-version`），未裝 |
| dsh-market | `dshmarket` | 1.73.9 | 視覺化插件市場 | Windows 已裝；WSL 未裝 |
| dsh-agent-teams | `@nanmicoder/dsh-agent-teams` | 0.1.28 | 多 Agent 團隊協作 | Windows 已裝；WSL 可裝 |
| dsh-oil-ui | — | — | **npm 上找不到** | 可能改了名或不在 npm |
| openmanusbot | — | — | **npm 上找不到** | 同上 |
| andy-liquid | — | — | **npm 上找不到**（只有 Shopify Liquid 之類的無關套件） | 可能是設計資源，不是 npm 套件 |
| Stageshow | `stageshow` | 0.0.0 | **空殼**（無版本、無描述）。另有 `svelte-stageshow`：Svelte 5 的「假產品 UI 框架」預覽工具 | 不是 DSH 插件，是前端元件庫，暫不需要 |

---

## 二、不是 DSH 插件，而是設計資源

這些你點名的東西**不是給 Agent 的能力**，是給介面的資產：

| 名稱 | 是什麼 | 用途 |
|---|---|---|
| `tabler` | `@tabler/icons` 3.50.0，MIT，高品質 SVG 圖示集 | Company OS 的圖示 |
| `lucide` | `lucide` / `lucide-react` 1.67.0，MIT，線性圖示集 | 同上，風格更接近 Apple HIG |
| `google/fonts` | Google Fonts 的字型 repo（不是 npm 套件） | 字型 |
| `apple-human-interface` | 不是 npm 套件；我們已有 `apple-hig-mcp`（Windows 已裝） | HIG 查詢 |

**我的判斷**：`lucide` 最貼近你的設計系統（線性、單色、跟隨 `currentColor`），`tabler` 選擇更多。建議**二選一**，不要兩套混用。

---

## 三、Skills（技能）

你點名的三個：`content-strategist`、`dbskill`、`xhs-writer-skill`

**在 npm 上全部找不到。** 它們應該是以 `SKILL.md` 形式存在的技能包（skills.sh / GitHub），不是 npm 套件。

**要裝它們需要**：找到它的 repo → 放進 DSH 的技能根目錄。這件事我可以做，但要先確認來源，我不想隨便抓一個同名 repo 就裝（這是供應鏈風險）。

---

## 四、Qwen3.5-4B-3D-Coder

這是**模型**，不是插件。它在 npm 找不到，屬正常。

要用它需要：下載模型權重 + 一個推理服務（Ollama／vLLM）。你的機器已裝 Ollama。**但 4B 模型的能力遠低於現在用的模型**，我建議先確認它的用途（3D 生成？代碼？），再決定要不要下載幾 GB。

---

## 五、你真正問的那件事：怎樣用「說明文件」來開發

你問得很好。像 ERPNext 這種系統，**它的 help docs 是幾百頁的產品知識**，如果能讓 Agent 直接查，它就不用靠猜。

### 三條路，各有適用場景

| 做法 | 工具 | 適合 | 限制 |
|---|---|---|---|
| **① 把文件抓成本地檔案，用 `grep`／`read` 查** | RAE 的網站分析 + 內建檔案工具 | 幾百頁、要精確引用原文 | 只能全文搜尋，不懂語義 |
| **② 本地 RAG（語義搜尋）** | `mcp-local-rag`、`docs-rag-mcp` | 幾千頁、要「找相關段落」 | 要建索引、要 embedding 模型 |
| **③ 直接查線上文件 API** | `@upstash/context7-mcp`（Context7） | 主流開源庫的最新文件 | ERPNext 未必在它的索引內 |

### 我的建議

**先做 ①，需要時才做 ②。**

理由：
1. ERPNext 的文件是靜態網站，抓下來就是一堆 Markdown／HTML。
2. 我們的 DSH 已經有 `grep`、`read`、`glob`，**查檔案是它最擅長的事**，不需要額外索引。
3. RAG 要建索引、要 embedding 模型、要維護，而且在「幾百頁」這個規模，grep 的準確度其實更高（因為不會有語義漂移）。

**具體做法**（下一步可以做）：

```
docs/erpnext/
├── index.md            ← 目錄，說明每一頁講什麼
├── accounts/           ← 會計
├── stock/              ← 庫存
├── selling/            ← 銷售
├── buying/             ← 採購
└── ...
```

開一個 issue 叫 `@subtle-agent` 用 RAE 把文件抓下來、整理成上面這個結構，並寫一份 `index.md`。**這會是它第一個真正有用的任務。**

---

## 六、這次實際裝了什麼

### 已裝（Super Agent 的 `superagent` profile）

| 項目 | 狀態 |
|---|---|
| Node 24.11.0 | 已裝（RAE 要求） |
| `rea-agents` 6.7.0 | 已裝 |
| **`dsh-mnemon`**（記憶） | **已裝** |
| **`dsh-browser`**（瀏覽器操作） | **已裝** |
| **Chromium（Playwright）** | **已裝，而且實測可用** |
| `dsh-skill-mcp-panel` | 已裝 |

### Chromium 不需要 sudo

我原本以為要你輸入密碼裝系統依賴。**實測不用。** Playwright 自己標了 `DEPENDENCIES_VALIDATED`，而直接執行：

```
$ chrome-headless-shell --version
Google Chrome for Testing 156.0.8078.4

$ chrome-headless-shell --headless --dump-dom https://example.com
<!DOCTYPE html><html lang="en"><head>...<title>Example Domain</title>...
```

**真的抓到頁面。** 所以你不需要做任何事。

### 未裝（要你決定）

| 項目 | 為什麼未裝 |
|---|---|
| `dsh-skills-manager` | 被安全閘擋住（`dsh plugin allow-version`），要不要放行由你決定 |
| `billion-context` | 會改變上下文處理方式，屬「行為改變」而非「能力新增」，建議單獨試 |
| `dsh-agent-teams` | 多 Agent 協作，等真的需要時再裝 |
| `dshmarket` | 插件市場介面，Windows 已有 |
| `dsh-genui` / `dsh-image-gen` / `dsh-context` / `dsh-im` | 各自有更適合的時機（見第一節） |

---

## 七、驗證

```
Super Agent 重啟後：
  setup.problem: null
  agent: subtle-agent
  九項健康全部 ready
```

沒有載入錯誤（日誌中只有 `deepseek-account` 的網絡噪音與 SQLite 實驗性警告，與新插件無關）。

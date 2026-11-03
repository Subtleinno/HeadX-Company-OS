# Company OS 引擎

`engine/` 是 Company OS 的引擎：政策閘道、審計日誌、Needs 工單、熔斷開關，以及批准收件匣的網頁介面。它以 Node.js（22.19 或以上）直接執行 TypeScript，執行期零外部依賴。

## 這個目錄是什麼

Company OS 的原則是「所有寫入都經同一個閘道，所有決定都留下記錄」。引擎把這些原則變成可執行的程式碼：

- **政策閘道**（`src/core/gateway.ts`）：每個寫入動作都先經這裡判定。判定順序固定為熔斷、品牌隔離、動作登記、L4 禁止、金額上限、風險級別；未登記的動作一律拒絕。
- **風險分級與動作登錄表**（`config/actions.json`）：L0 至 L4 的分級是資料，不是程式邏輯，改分級不需改程式碼。
- **審計日誌**（`src/audit/audit-log.ts`）：只可追加、以 SHA-256 串成雜湊鏈的 JSON Lines 日誌。每一筆都與上一筆相連，改動任何一筆的內容都會令之後的雜湊對不上。
- **Needs 工單**（`src/needs/needs-board.ts`）：Agent 撞牆時（影片、實拍、實物設計等）開工單交給人。`attempted` 為必填，防止未嘗試就開單。
- **熔斷開關**（`src/core/gateway.ts`）：一個指令暫停所有動作，包括唯讀動作。
- **批准收件匣**（`src/server.ts`、`public/`）：只綁定本機的網頁介面，人在這裡批准或拒絕 L2、L3 請求。
- **MCP 伺服器**（`src/mcp-server.ts`）：以 stdio 提供工具給模型，但**不提供批准工具**。

## 快速開始

需求：Node.js 22.19 或以上，以及 pnpm（本倉庫使用 pnpm 12，見根目錄 `README.md`）。

```bash
cd engine
pnpm install
pnpm check
pnpm ui
```

- `pnpm install`：安裝 TypeScript 與 Node 型別定義。
- `pnpm check`：執行型別檢查（`tsc --noEmit`）加全部測試（`node --test`）。
- `pnpm ui`：啟動網頁介面，預設為 http://127.0.0.1:3083，只綁定 `127.0.0.1`。設定環境變數 `COMPANY_OS_PORT` 可以改埠。

首次啟動會自動建立 `data/`。資料目錄可以用環境變數 `COMPANY_OS_DATA` 指向其他位置。

## CLI 用法

在 `engine/` 目錄執行：

```bash
node src/cli.ts evaluate --action reports.read --company hx --brand hxdesign
```

`evaluate` 會輸出 JSON，其中 `decision` 是 `allow`、`deny` 或 `ask`；`ask` 代表已建立批准請求，等待人處理。幾個常用例子：

```bash
# 需要人批准的對外動作（L2）
node src/cli.ts evaluate --action publish.social --company hx --brand hxdesign --actor agent

# 列出待批准請求
node src/cli.ts approval list

# 由人批准或拒絕（只應由人執行）
node src/cli.ts approve <批准請求 id> --by founder --note "已核對"
node src/cli.ts reject <批准請求 id> --by founder --note "不需要"

# 驗證審計日誌的雜湊鏈
node src/cli.ts audit verify

# 熔斷開關與健康檢查
node src/cli.ts breaker status
node src/cli.ts health
```

`node src/cli.ts` 不帶參數會列出全部命令。`--amount` 以仙（cents）為單位；`--key` 是冪等鍵；`--param k=v` 可以附加其他動作參數。`audit export` 會匯出完整審計日誌。

## MCP 伺服器

```bash
node src/mcp-server.ts
```

伺服器以 stdio 傳輸 JSON-RPC 2.0，適合由 MCP 客戶端以子進程方式啟動。提供的工具包括 `company_os_evaluate`、`company_os_list_actions`、`company_os_pending_approvals`、`company_os_needs_create`、`company_os_needs_list`、`company_os_needs_deliver`、`company_os_audit_verify`、`company_os_breaker_status` 與 `company_os_health`。

客戶端設定範例（`cwd` 請改成實際路徑）：

```json
{
  "mcpServers": {
    "company-os": {
      "command": "node",
      "args": ["src/mcp-server.ts"],
      "cwd": "/absolute/path/to/company-os/engine"
    }
  }
}
```

這個伺服器**不提供批准工具**。模型可以從 `company_os_evaluate` 得知一個動作需要人批准，但永遠不能自行批准或拒絕。批准與拒絕只會出現在網頁介面與 CLI，而且只應由人執行。

## 資料檔位置與意義

執行時資料放在 `engine/data/`，首次啟動自動建立：

| 檔案 | 意義 |
|---|---|
| `data/audit.jsonl` | 審計日誌。JSON Lines，一行一筆，只可追加；每筆以 SHA-256 與上一筆組成雜湊鏈。改動任何一筆的內容都會令之後的雜湊對不上，`audit verify` 會指出斷點；不要手動編輯。 |
| `data/approvals.json` | 批准請求。由政策閘道建立，網頁介面、CLI 與 MCP 共用；以原子寫入保存，避免半寫入的檔案。 |
| `data/needs.json` | Needs 工單。記錄 Agent 交給人的工作，狀態由 `open` 經 `assigned`、`delivered` 走到 `accepted` 或 `rejected`。 |

`node src/cli.ts audit verify` 驗證整條雜湊鏈；`node src/cli.ts audit export` 輸出完整日誌。測試或實驗時，可以用 `COMPANY_OS_DATA` 指向暫存目錄，避免污染日常資料。

## 改風險分級要改哪個檔

改 `config/actions.json`，不要改程式碼。風險級別是資料，不是判定邏輯。

| 級別 | 意義 | 閘道處置 |
|---|---|---|
| L0 | 唯讀 | 自動放行 |
| L1 | 草稿或可還原的寫入 | 自動放行並記錄 |
| L2 | 對外或財務影響 | 建立批准請求，需人批准 |
| L3 | 破壞性或權限相關 | 建立批准請求，需人批准 |
| L4 | 永久禁止 | 直接拒絕，沒有批准路徑 |

每筆登錄表的格式如下：

```json
{ "id": "publish.social", "level": "L2", "description": "公開發布貼文，需人批准" }
```

- `id` 支援結尾 `*` 的前綴匹配，較長的 id 優先命中。
- 未登記的動作一律 `deny`。
- `amountParam` 與 `amountLimit` 可以限制金額；目前 `erp.order.create` 與 `payment.send` 的上限為 0，任何高於上限的金額都會被拒絕。
- 公司與品牌清單在 `config/company.json`。

改完後用 `pnpm check`（或 `npm run check`）確認型別檢查與測試仍然通過。

## 安全提醒

`data/` 已在 `engine/.gitignore`，不要提交。它只屬於本機執行時資料，包括審計記錄與批准歷史。不要把密鑰、token 或個人資料寫入 `data/` 或 commit。

## 目錄結構

```
engine/
├── config/      動作登錄表與公司品牌設定
├── public/      網頁介面的 HTML、CSS、JavaScript
├── src/
│   ├── audit/   審計日誌與雜湊鏈
│   ├── core/    閘道、引擎組裝、公司與共用型別
│   ├── needs/   Needs 工單
│   ├── policy/  風險分級與動作登錄表
│   ├── store/   JSON 持久化
│   ├── cli.ts
│   ├── mcp-server.ts
│   └── server.ts
└── tests/       以 node:test 執行的測試
```

## 相關文件

- 根目錄 [`README.md`](../README.md)：倉庫定位與基本規則。
- [`docs/decisions-log.md`](../docs/decisions-log.md)：總體規劃、原則與風險級別。
- [`docs/company-os-design-system.md`](../docs/company-os-design-system.md)：介面設計的硬規則。

## 誰在做這個引擎

- 這個 repo 的自動化由 `subtle-agent` 這個專用帳戶執行。
- 人類審核者與批准人是你本人。
- Agent 的所有變更都會經 Pull Request，並由人批准後才合併。

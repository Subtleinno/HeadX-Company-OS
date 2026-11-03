# company-os

**一間 AI 原生公司的作業系統。**

這個 repo 放的是「引擎」：政策閘道、批准收件匣、審計日誌、風險分級，以及令它們持續成長的 Super Agent。這是**私人 repo**，也是「我們在做什麼、為什麼這樣做」的唯一權威來源。

> **狀態：P0 —— 打地基。** 尚未有生產程式碼。

---

## 第一次看這個 repo 的人，請照這個次序讀

1. [`docs/company-os-master-plan.md`](docs/company-os-master-plan.md) —— 總規劃：目標、八條不可違反的原則、L0–L4 風險分級、目標架構、階段計劃（P0–P7），以及**附錄 A：架構決策記錄**（每一項重大選擇的原因）。
2. [`docs/company-os-design-system.md`](docs/company-os-design-system.md) —— 介面標準：白底黑主色、狀態三色、Apple HIG、禁止 emoji、動效規範。
3. [`docs/p0-bootstrap-v2-for-dsh.md`](docs/p0-bootstrap-v2-for-dsh.md) —— P0 任務書：誰做什麼，以及 Agent 必須遵守的規則。
4. [`docs/tech-selection-gateway-dashboard.md`](docs/tech-selection-gateway-dashboard.md) —— 技術選型報告：為什麼閘道要自己寫。
5. [`docs/agent-account-setup.md`](docs/agent-account-setup.md) —— 如何建立專用 Agent 帳戶。
6. 總規劃的附錄 B —— 進度記錄。

---

## 這個系統是什麼

```
Company OS（引擎）
├── 審計日誌          只可追加、雜湊鏈
├── 風險分級          L0–L4，以資料檔管理，不是程式碼
├── 政策閘道          所有對外寫入都必經此層
├── 批准收件匣        創辦人每日用兩小時的地方
├── 熔斷開關          一個動作暫停所有 Agent 寫入
├── Needs 工單        Agent 做不到時開單交人
└── Super Agent       開發線 + 生產線
```

引擎**只連接**業務系統，不合併它們：

| 系統 | 角色 | 階段 |
|---|---|---|
| HxDesign | 品牌、知識庫、設計 | P2 |
| AI 原生 ERP | 訂單、庫存、採購、物流 | P4 |
| ERPNext | 只做會計總帳 | P5 |
| WordPress | 內容網站 | P6 |
| PIM | 暫緩 —— 未有產品目錄 | 待定 |

---

## 目錄結構

| 路徑 | 用途 |
|---|---|
| [`engine/`](engine/) | Company OS 引擎：政策閘道、審計日誌、Needs、網頁介面、MCP 伺服器 |
| [`docs/`](docs/) | 總規劃、設計系統、任務書、技術選型、帳戶設定、進度 |
| `.gitignore` | 擋掉密鑰、金鑰與建置產物 |

---

## 目標

創辦人以一間法人公司承載多個品牌，每日大約花**兩小時**在批准收件匣。這個 repo 的一切，都是為了在「不失控制」的前提下做到這件事。

不可違反的原則（完整清單見總規劃第 2 節）：責任留在人身上、風險按**動作**分級而非按 Agent、未批准的請求會逾期取消而非照做、每個 Agent 每個品牌都最小權限、審計日誌不可篡改。

---

## 這個 repo 的規矩

1. **永不提交密鑰。** commit、issue、PR、日誌都不要有 API Key、Token、密碼或客戶個人資料。策略與規劃文件可以放，因為 repo 是私人的。
2. **當歷史會被公開來寫。** 每一個 commit 都當成將來可能被看到；不要依賴 repo 永遠不公開。
3. **每個 PR 都要寫明目的、風險級別、測試結果、影響、回滾方式。** 它們大多由 Agent 撰寫。
4. **`main` 是唯一真實來源。** 所有變更經 Pull Request。

---

## 目前進度

| 日期 | 事件 |
|---|---|
| 2026-11-03 | P0 Step A 完成：repo 與工具鏈（Node 22、pnpm、gh） |
| 2026-11-03 | 引擎 v0：政策閘道、風險分級、審計日誌、Needs、熔斷、MCP 伺服器 |
| 2026-11-03 | 引擎網頁介面：批准收件匣、Needs 看板、分級表、審計驗證 |
| 2026-11-03 | Super Agent 在 WSL 內跑通，開出第一個 PR |
| 下一步 | 專用 Agent 帳戶、DSH 側欄嵌入 |

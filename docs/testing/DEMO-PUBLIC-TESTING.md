# Demo Public Testing

狀態：已確認的測試方法  
日期：2026-11-07  
適用範圍：Company OS 所有 UI／UX 測試、外部 AI 瀏覽器測試、Demo 帳戶測試  
部署契約：`docs/deployment/demo-public-stack.md`（決策 C52）。本文件講「怎樣測」，那份講「怎樣起一個隔離的環境」。

## 目的

Company OS 的 UI／UX 測試，必須在一個與正式資料完全隔離的公開 Demo 環境進行。

本文件規定「Demo Public Stack」的用途、邊界、安全規則與驗收方式。此方法適用於：

- 老闆以真實瀏覽器測試介面。
- ZCode 或其他 QA／QC 工具進行自動化驗收。
- Comet 或其他 browser-use AI 進行 UI／UX 測試與改進建議。
- 未來外部測試者使用 Demo 帳戶試用。
- 任何需要公開 URL 的示範、驗收或用戶測試。

## 核心原則

1. **正式 stack 永遠不公開。**  
   正式 Company OS 的 Docker stack、正式資料庫、正式檔案儲存、正式老闆帳戶與真實公司資料，不得直接經 Cloudflare Tunnel、公網端口、反向代理或任何公開網址暴露。

2. **Demo stack 必須完全隔離。**  
   Demo 環境必須使用獨立的 Docker Compose project、獨立的 Postgres 資料庫、獨立的 storage bucket／volume、獨立的端口、獨立的環境變數與獨立的網域或子網域。

3. **Demo 帳戶不等於正式帳戶。**  
   Demo 帳戶只可在 Demo stack 使用。不得使用正式老闆帳戶、正式員工帳戶、正式 agent 或正式 API 憑證。

4. **公開不等於無權限。**  
   公開 URL 只代表「網絡可達」，不代表「任何人可使用任何功能」。所有授權、session、入口、審計與資料隔離規則必須仍然生效。

5. **不得假裝成功。**  
   測試結果必須如實記錄。失敗、逾時、權限拒絕、空資料與未完成功能，均不得寫成通過或以假資料掩蓋。

## Demo Public Stack 架構

```text
Comet / ZCode / 老闆瀏覽器
        │
        ▼
Cloudflare（公開網址）
        │
        ▼
Cloudflare Tunnel（cloudflared）
        │
        ▼
Demo gateway
        │
        ▼
Demo Company OS stack
（獨立 Postgres、獨立 storage、獨立 Demo 帳戶）
```

Demo stack 不得直接指向正式 stack 的資料庫、storage、API 或任何正式服務。

## 必須隔離的項目

| 項目 | 正式 stack | Demo Public Stack |
|---|---|---|
| Docker Compose project | 正式 project | 獨立 project，例如 `company-os-demo` |
| Postgres | 正式資料庫 | 獨立資料庫與獨立 volume |
| Storage | 正式 bucket／volume | 獨立 bucket／volume |
| 老闆帳戶 | 正式帳戶 | Demo 老闆帳戶 |
| 員工帳戶 | 正式員工 | Demo 員工帳戶 |
| Agent | 正式 agent | Demo agent |
| App 授權 | 正式授權 | Demo 授權 |
| 網域 | 內網／受控網址 | 獨立 Demo 子網域 |
| Cloudflare Tunnel | 不指向正式 stack | 只指向 Demo stack |
| 環境變數 | 正式 `.env` | 獨立 `.env.demo` 或同等隔離設定 |
| 審計 | 正式審計 | Demo 審計，不得混入正式資料 |

## 公開範圍

只有以下內容可以經 Demo Public Stack 公開：

- Demo Company OS 登入頁。
- Demo 老闆與 Demo 員工可見的底座 UI。
- 已明確啟用並標記為可測試的 Demo app。
- Demo 帳戶可存取的資料。

以下內容不得公開：

- 正式 stack。
- 正式資料庫。
- 正式檔案儲存。
- 正式老闆帳戶。
- 正式員工、agent、授權或審計資料。
- 未啟用的 app。
- 內部管理 API。
- 任何 secret、token、API key、密碼、cookie 或內部網址。

## Demo 帳戶規則

1. Demo 帳戶必須使用明顯非真實的電郵網域，例如 `@demo.invalid`，除非未來有明確的 Demo 域名契約。
2. Demo 帳戶的密碼只可存在於受控的 Demo 環境設定或密碼管理工具，不得寫入 Git、issue、PR、日誌、截圖或公開文件。
3. Demo 老闆帳戶與 Demo 員工帳戶必須分開建立。
4. Demo 員工必須按測試目的建立，不得使用正式員工資料。
5. 測試完成後，如 Demo stack 會保留，必須定期重設或清除測試資料；清除方式與頻率待部署契約確定後補充。

## Cloudflare Tunnel 規則

1. Cloudflare Tunnel 只可指向 Demo stack 的 Demo gateway。
2. 不得將 Tunnel 指向正式 `gateway-internal`、正式 API、正式資料庫或正式 storage。
3. Demo 子網域必須與正式網域明確分開，例如 `demo.<你的網域>`；實際子網域待老闆提供後確定。
4. Cloudflare Access、WAF、限流與 Turnstile 的實際配置，待 Demo stack 部署契約確定後另行規劃；本文件不假設它們已啟用。
5. 不得因為要方便測試而關閉 Company OS 的 session、entry、權限、審計或資料隔離。

## UI／UX 測試方法

每次 UI／UX 測試，測試者必須：

1. 使用 Demo Public Stack 的公開網址，不得使用正式 stack。
2. 使用明確標示為 Demo 的帳戶。
3. 記錄測試的頁面、操作、預期結果、實際結果與截圖或錄影。
4. 對 UI／UX 提出改進建議時，必須區分：
   - 產品問題：功能缺失、流程不通、資訊不足。
   - 介面問題：排版、層級、可讀性、可操作性。
   - 視覺問題：顏色、字體、間距、一致性。
   - 無障礙問題：鍵盤、焦點、對比、螢幕閱讀器。
   - 響應式問題：桌面、平板、手機。
   - 狀態問題：載入、空資料、錯誤、成功、未儲存離開。
5. 不得把「未實作」誤報為「壞咗」；未實作功能應標示為未實作。
6. 不得要求繞過權限、session、審計或資料隔離來完成測試。

## 測試報告格式

每次測試應以以下格式記錄：

```text
測試日期：
測試環境：Demo Public Stack
測試網址：
測試帳戶類型：老闆／員工／agent／訪客
測試瀏覽器：
測試裝置與視窗寬度：

測試項目：
預期結果：
實際結果：
結果：PASS／FAIL／BLOCKED／NOT IMPLEMENTED
證據：截圖、錄影、HTTP 狀態、console、network 或文字記錄

UI／UX 建議：
問題類別：
建議改動：
優先級：P0／P1／P2
是否需要新契約：
是否需要後端改動：
```

## 底座完成前的測試重點

在底座完成前，Demo Public Stack 的測試重點是：

1. 登入、登出、改密碼。
2. 老闆管理區四頁：公司設定、品牌與組織、員工與 Agent、App 授權。
3. 員工首頁的「我的 Apps」。
4. 個人帳戶與安全。
5. 未改初始密碼的引導與權限拒絕。
6. 深色模式、窄螢幕、鍵盤與焦點。
7. 錯誤、空資料、載入與未儲存離開狀態。
8. UI／UX 的現代感、一致性、可讀性與操作效率。

在第一個部門 app 真正可用前，不應宣稱「員工工作台已完成」。

## 底座完成定義

底座 v1 完成，是指一個老闆與一個員工，可以在 Demo Public Stack 完成以下流程：

1. 老闆建立公司、建立員工。
2. 員工首次登入、被迫改密碼。
3. 員工見到「我的 Apps」。
4. 員工可以進入至少一個已啟用 app。
5. 老闆可以建立品牌／Workspace。
6. 員工可以選品牌、進入品牌工作區。
7. 老闆可以授權員工使用某個 app。
8. 員工在 app 內完成一個基本動作，權限、審計與 session 正確。
9. 登出後再登入，身份與狀態一致。
10. 深色模式、窄螢幕與鍵盤操作可用。

達到上述十點，才可視為「底座 UI 真正完成」。之後才建立底座備份 repo，再開始 HyperFrames 與 Design app。

## 後續工作順序

1. 完成 Demo Public Stack。
2. 以 Demo Public Stack 進行底座 UI／UX 測試。
3. 修復測試發現的底座問題。
4. 達成底座完成定義。
5. 建立底座備份 repo；此 repo 只作備份，不作日後開發。
6. 完成 HyperFrames 整合。
7. 開始 Design app。

## 未決事項

以下項目待 Demo stack 部署契約確定後補充：

- Demo 子網域。
- Cloudflare Access 是否啟用。
- WAF、限流與 Turnstile 配置。
- Demo 註冊是否開放。
- Demo 資料保留與清除週期。
- Demo stack 是否長期運行。
- 哪些 app 會第一批啟用。

# HeadX Company OS · Marketing Design 規劃包（總覽）

版本 v0.1 ｜ 2026-11-16 ｜ 狀態：規劃稿（待你拍板「未決定」清單）

## 這包文件是甚麼

這是 Marketing Design app 與其周邊模組的後端與產品規劃。目標：讓 Human 與 AI agent 以同一套資料，產出有品牌感、用真實知識、用真實（香港）相片影片的 social post、PPT、網頁文章。

| # | 文件 | 解決的問題 |
|---|---|---|
| 01 | Hyperframes → PPT 管線 | 不輸出影片，改為取 HTML 單格輸出 PPT／PDF／PNG |
| 02 | AI 自動創建框架（Framework Engine） | 讓 AI 在安全邊界內，自己生出新的 Edit/View/Agent 文件類型 |
| 03 | Materials 素材檢索 | 相片影片入庫、描述、檢索、重用 |
| 04 | Templates 模組 | 可重複使用、隨品牌變化、可人手編輯、AI 會揀的模板 |
| 05 | Knowledge ＋ Posts | Obsidian 式知識庫；可複製到 WordPress 的 SEO 文章 |
| 06 | Create 模組與漸進式路由 | 把一切組成產出，同時不讓 agent 讀爆 context |
| 07 | Needs 架構 | 全公司通用的「做唔到就叫人」系統 |
| 08 | 補充：原文未寫的部分 | 權限、備份、版本、合規、測試、分期、待決定事項 |

## 五條貫穿原則

1. **Edit / View / Agent 三頁**：Edit 給人細緻修改；View 給人看清決策；Agent 頁給 AI 讀（精簡、已決定與可選項分開）。
2. **簡單結構優先**：資料多數是文字與 HTML，約七成；相片影片約三成。
3. **漸進式揭露**：AI 永遠先讀索引與卡片，需要才讀全文，再需要才取素材。
4. **人做策略與判斷，AI 起草與執行**：AI 的輸出預設是「AI 提案」，由人確認才變「已確認」。
5. **做唔到就開 Needs**：Needs 是正式流程，不是錯誤。

## 儲存分工（全篇通用）

| 位置 | 放甚麼 |
|---|---|
| Postgres | 結構化資料、文件內容的 JSON、索引、向量、事件日誌、Needs |
| MinIO（Storage） | 檔案：原始相片影片、縮圖、模板檔、render 成品、自訂框架的 renderer |
| Source code | 平台殼、框架引擎、通用 renderer（經 PR 晉級，不由 AI 直接改） |

## 建議開發分期

| 期 | 內容 | 驗收 |
|---|---|---|
| P0 | Materials 入庫＋檢索（03）、Needs 核心（07）、Create 最小路由（06 的 L0–L2） | 用香港相片，做到「問一句，找到 5 張合適相」 |
| P1 | Templates 編輯器＋預覽（04）、Hyperframes 單格輸出（01）、IG carousel 一條龍 | 同一模板換兩個品牌，外觀自動切換 |
| P2 | Knowledge ＋ Posts（05）、PPT 輸出（01） | 一份知識變成一篇可貼上 WordPress 的文章 |
| P3 | Framework Engine（02）：先開放 AI「提議」，再開放「啟用」 | AI 生成一個新文件類型，通過驗證並由你確認 |
| P4 | 跨部門 Needs 總覽、ERP 接駁 | Boss Portal 看到全公司 Needs |

## 未決定（需你回覆）

見 `08-補充.md` 最後一節。

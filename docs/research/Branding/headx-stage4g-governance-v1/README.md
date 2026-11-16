# Stage 04G · 跨媒體使用與治理（v1）

檔案
- edit.html   編輯（10 張卡片、完成度、前階段匯入、貼回 AI 結果、匯入匯出）。含：色彩打樣登記冊（核准者、日期、色票或 ICC 版本、印刷廠、工單；依有效期自動計算有效至與過期）、配色變體 × 場景矩陣（12 個場景；點擊切換；用 4B 對比數據檢查）、觸點矩陣、命名產生器與現有檔名檢查、授權登記冊（自動計算到期）、責任矩陣（驗證每個活動恰有一個 A）、例外登記
- view.html   展示頁
- agent.html  AI Agent 合約：governance-system-prompt.txt、stage4g-brief.json、governance.json、usage-rules.json、colorway-usage-matrix.csv、touchpoint-matrix.csv、proof-register.csv、license-register.csv、exception-log.csv、raci.csv、brand-usage-rules.md、naming-convention.md、audit-checklist.md、governance-guide.md
- options.js  選項庫（9 類、112 項）：媒體 12、觸點 20、檔案格式 14、禁用與誤用 16、跨媒體無障礙 12、授權資產類型 10、分發方式 6、稽核項目 10、治理禁區 12；另有 8 個單選規則
- core.js     狀態、Stage 0–4F 匯入、日期與有效期計算、配色變體建議與矩陣、RACI 驗證、命名檢查、一致性檢查、預填（從 4B 色彩輸出、4C 授權來源、4F 字體與 KOL）、輸出產生、貼回解析
- prompts.js  9 份討論提示詞
- shared.css

用法：用瀏覽器打開 edit.html。資料存在瀏覽器 localStorage；換瀏覽器請用「匯出／匯入 JSON」。登記冊的「到期」與「過期」以你電腦的今天日期計算。
前階段：若 localStorage 已有 brand_brief_stage0／1／2／3／4a／4b／4c／4d／4e／4f 會自動讀取；也可在側欄手動匯入各階段 brief JSON。匯入 4B 後，可按「從 4B 色彩輸出預填」把色彩帶進打樣登記冊（狀態不會直接變成已核准）；匯入 4C／4F 後，可預填授權登記冊（字體、音樂、AI 人聲、KOL 合作）。

重要限制
- 登記冊是內部管理工具，不是法律文件。打樣核准、授權確認與例外批准必須由人類執行；原型不會偽造核准者、日期或授權文件，系統提示詞也禁止 AI 代為核准。
- 授權範圍以合約為準；AI 生成素材、字體、音樂、肖像與 KOL 內容須逐項確認，須合資格專業人士確認；不是法律意見。
- 印刷色以印刷廠與打樣為準。CMYK 取決於印刷廠、紙張、油墨與 ICC；Pantone 等專色須註明色票版本。PDF/X 是 ISO 15930 的印刷交換標準家族：PDF/X-1a 要求全部轉為 CMYK 或專色並拍平透明，PDF/X-4 可保留透明與色彩管理；用哪個以印刷廠要求為準。
- PDF 無障礙可參考 PDF/UA（ISO 14289）與 WCAG 的 PDF 技術（標籤、閱讀順序、語言、替代文字），須用輔助科技實測；原型不能宣稱「已符合」。
- 觸點矩陣的尺寸與格式是常見起點，以最新平台與印刷廠規格為準。
- 有效期（12／24／36 個月）、到期提醒（30／60／90 天）與例外上限（30／90／180 天）是可選的內控設定，不是標準。
- 標誌最小尺寸與留白由你與設計師定義，並須在真實媒體測試；原型只檢查是否填寫與是否與工藝衝突。
- 配色變體建議由名稱關鍵字推斷，只是起點；每一格都須由人類決定。
- 沒有風格相符度分數；AI 提案不等於核准；approval.state 固定為 draft。
- 選項內容是通用知識的起始草案，尚未逐項來源查證。
- 4H 不會自動讀取本階段；請匯出 stage4g-brief.json 帶過去。

測試：已用 Chromium（Playwright）開過 edit／view／agent 三頁：點擊選項、匯入 4B 與 4F、從 4B 預填打樣登記、改日期與核准者並計算過期、預填與新增授權登記、套用配色變體建議並切換格子、RACI 驗證、觸點矩陣、命名檢查、貼回 JSON、重新載入保存，均無 console 錯誤；手機寬度（390px）三頁都沒有橫向捲動。未做 Safari／Firefox、螢幕閱讀器、真實印刷廠與授權文件、法務與專業人士審閱，以及用 Stage 1–3 真實 brief 的驗收。

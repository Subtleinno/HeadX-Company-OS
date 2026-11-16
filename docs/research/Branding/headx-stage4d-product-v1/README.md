# Stage 04D · 3D 與產品視覺（v1）

檔案
- edit.html   編輯（11 張卡片、完成度、前階段匯入、貼回 AI 結果、匯入匯出）。含：渲染時間估算、貼圖記憶體估算、轉盤與無縫循環計算、尺寸換算、零件清單草稿（BOM-lite）解析、爆炸圖展開時間、CMF 色樣表與立方體示意（可轉動／暫停／模擬減少動態）
- view.html   展示頁
- agent.html  AI Agent 合約：3d-product-system-prompt.txt、stage4d-brief.json、render-spec.json、product-spec.json、cmf-table.csv、bom-draft.csv、3d-prompt.txt、display-video-prompt.txt、3d-product-guide.md
- options.js  選項庫（18 類、184 項）：3D 風格 12、3D 材質 13、角色 10、場景 10、燈光 10、運鏡 10、動畫 10、交付形式 6、產品外觀 10、使用情境 10、物料 11、表面處理 9、製程 10、零件 10、認證提醒 12、測試 11、展示動畫 8、禁區 12；另有 13 個單選規則
- core.js     狀態、Stage 0–4C 匯入、CMF 表、計算、一致性檢查、spec／Prompt／指南／系統提示詞產生、貼回解析
- prompts.js  10 份討論提示詞
- shared.css

用法：用瀏覽器打開 edit.html。資料存在瀏覽器 localStorage；換瀏覽器請用「匯出／匯入 JSON」。
前階段：若 localStorage 已有 brand_brief_stage0／1／2／3／4a／4b／4c 會自動讀取；也可在側欄手動匯入各階段 brief JSON。匯入 4A 時，若色值空白，會自動帶入 4A 的 5 個色值。

重要限制
- 工程規格（結構、材料、製程、電子、零件、認證、測試）只作方向記錄，必須由工程師及合資格專業人士驗證，不能因風格配對而自動批准。本原型不是工程圖、正式 BOM、認證文件或測試報告。
- 「認證與合規提醒」只是請你先查證的清單，不判斷是否適用，也不是窮盡清單；不是法律意見。
- 成本與效能是相對定性等級；渲染時間、貼圖記憶體與面數預算是你自己輸入的目標，沒有統一標準。模具成本、起訂量與認證要求因供應商、產品與市場而異。
- CMF 以實物色樣為準；螢幕色與立方體示意不是色樣，不是渲染。同一顏色在不同材料、表面與光源下看起來不同。
- 3D 展示的自動動態須可暫停並有減少動態版本；任何一秒內不得超過 3 次閃光。
- 虛擬人與 AI 角色須披露；吉祥物與外觀須先確認知識產權；環保主張須有證據。
- 沒有風格相符度分數；AI 提案不等於核准；approval.state 固定為 draft。
- 選項內容是通用知識的起始草案，尚未逐項來源查證。
- 4E–4H 不會自動讀取本階段；請匯出 stage4d-brief.json 帶過去。

測試：已用 Chromium（Playwright）開過 edit／view／agent 三頁：點擊選項、匯入 4A、填寫計算欄位、編輯 CMF 表與立方體（轉動／暫停／模擬減少動態）、貼回 JSON、重新載入保存，均無 console 錯誤；手機寬度（390px）三頁都沒有橫向捲動。未做 Safari／Firefox、螢幕閱讀器、真實 3D 渲染、真實供應商與認證，以及用 Stage 1–3 真實 brief 的驗收。

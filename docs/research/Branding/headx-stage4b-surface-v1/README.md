# Stage 04B · 圖形與表面系統（v1）

檔案
- edit.html   編輯（11 張卡片、完成度、前階段匯入、貼回 AI 結果、匯入匯出）；含漸變逐點對比取樣、品牌色階、形狀預覽、無縫圖案預覽、配色變體（灰階與色盲模擬）、色彩空間對照與打樣登錄、工藝摘要
- view.html   展示頁
- agent.html  AI Agent 合約：surface-system-prompt.txt、stage4b-brief.json、surface-tokens.css、pattern-tile.svg、print-spec.json、image-prompts.md、surface-guide.md
- options.js  選項庫：漸變類型 7／用途 8、填色 7、邊框 8、形狀組件 8、紋理 9、Pattern 母題 10／重複方式 6、配色變體 9、色彩輸出 8、承印物 14、工藝 23、表面禁區 12；另有 18 個單選規則
- core.js     狀態、Stage 0–4A 匯入、色彩數學（WCAG 對比、OKLCH、Display P3、CMYK 近似、色盲模擬）、漸變取樣、無縫圖案 SVG 產生、一致性檢查、tokens／指南／print-spec／Image Prompt 產生、貼回解析
- prompts.js  10 份討論提示詞
- shared.css

用法：用瀏覽器打開 edit.html。資料存在瀏覽器 localStorage；換瀏覽器請用「匯出／匯入 JSON」。
前階段：若 localStorage 已有 brand_brief_stage0／1／2／3／4a 會自動讀取；也可在側欄手動匯入各階段 brief JSON。匯入 4A 時，若 4B 的色值空白，會自動帶入 4A 的 5 個色值。

重要限制
- CMYK 值是簡化公式的近似值（沒有 ICC 描述檔），不可作官方印刷色。官方色須由印刷廠 ICC 轉換並打樣後登錄。
- 螢幕無法準確呈現專色、金屬、螢光、燙箔、壓凸。Display P3 增強只是把彩度提高並限制在 P3 範圍內，sRGB 仍是品牌核准基準。
- 工藝的最小線寬、字級來自公開印刷廠指引（燙箔、壓凸、局部上光、平版膠印、活版），各廠數字不一致，這裡取較保守值；其他工藝標示「未查證」。成本為相對定性等級，不是報價。一律須向印刷廠確認。
- 總油墨量（TAC）與出血是常見參考，不是規格。
- 色盲與灰階為近似模擬（Machado 矩陣與 CIE76 色差），不是醫學結論。
- 沒有風格相符度分數；AI 提案不等於核准；approval.state 固定為 draft。
- 選項內容是通用知識的起始草案，尚未逐項來源查證。
- 4C–4H 不會自動讀取本階段；請匯出 stage4b-brief.json 帶過去。

測試：已用 Chromium（Playwright）開過 edit／view／agent 三頁，點擊選項、填色值、匯入 4A brief、編輯配色變體與打樣欄、貼回 JSON、重新載入保存均無 console 錯誤；手機寬度（390px）無橫向捲動。未做 Safari／Firefox、螢幕閱讀器、真實印刷與 Stage 1–3 真實 brief 的驗收。

# Stage 03 · 語言系統與語氣邊界

- edit.html   編輯（11 張卡片、完成度、一致性檢查、貼回 AI 結果、匯入／匯出）
- view.html   展示頁（聲音宣言、刻度視覺化、規則表、情境矩陣、禁用詞、範例對照、文案檢查器）
- agent.html  AI Agent 合約（system-prompt.txt、voice-guide.md、stage3-brief.json）
- options.js  全部選項與範例句（可直接增刪）　core.js 狀態／檢查器／產出／貼回解析　prompts.js 11 份討論提示詞　shared.css

銜接：在 Edit 頁按「匯入 JSON」，可匯入 Stage 1 與 Stage 2 的 brief，系統會做跨階段檢查。
結構依據：Voice／Tone 分開（Mailchimp 作法）；語氣四維度（NN/g）；禁用詞中的醫療宣稱類僅為提醒，非法律意見，
香港《不良廣告(醫藥)條例》(Cap. 231) 以條文與衞生署指引為準。
資料存在瀏覽器 localStorage；換瀏覽器請用匯出／匯入。

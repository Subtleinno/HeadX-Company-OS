# Stage 04F · 行銷內容與廣告（v3）

v3 = v2 ＋ Facebook、YouTube、LinkedIn、WhatsApp、EDM 五個渠道的完整模板。

## 內容
- 渠道模板庫（tpl-data.js）：12 個渠道、91 個模板
  - Instagram Reels 與 Story（8）：IG-RL-01–04、IG-ST-01–04
  - Instagram Carousel（5）：IG-CA-01–05
  - Threads（5）：TH-01–05
  - Facebook（7）：FB-01–07 教學圖文、連結分享、Reels、Story、活動／優惠（須合規）、客人故事（須合規）、提問互動
  - 小紅書（10）：XHS-01–10
  - TikTok（10）：TT-01–10
  - X（8）：X-01–08
  - YouTube（7）：YT-01–07 Shorts 教學、Shorts 迷思破解、長片教學、專家訪談／Q&A、幕後、服務展示、客人故事（須合規）
  - LinkedIn（7）：LI-01–07 觀點文字帖、文件 Carousel（PDF）、清單、B2B 案例、活動／招聘、短影片、公司動態
  - WhatsApp（8）：WA-01–08 歡迎與 opt-in 確認、預約確認（Utility）、預約提醒（Utility）、客服回覆（24 小時窗內）、優惠廣播（Marketing，須合規）、回訪（Marketing）、服務後跟進（Utility）、退訂確認
  - EDM（8）：EDM-01–08 月度通訊、教學序列、活動邀請、優惠推廣（須合規）、歡迎系列、預約確認與提醒、回訪召回、客人故事（須合規）
  - Website SEO（8）：SEO-01–08
- 每個模板：用途、目標與漏斗、格式、時間／區塊結構、AI 可填欄位、文案框架、風險標示（hr）、合規與披露提醒、備註；各渠道另附規格與來源連結（CH_INFO）。
- 模板選擇器、AI 填寫提示、市場定位／影片／排版／廣告策略清單、發佈與成效紀錄、模板預覽（新增 YouTube 縮圖 16:9、EDM 頭圖 600×300、小紅書 3:4、X 16:9）、關鍵字掃描、成效試算、UTM、4 週日曆（同 v2）。
- v3 新檢查：渠道沒有模板；Facebook 無官方安全區提醒與合作標示；YouTube 付費宣傳披露、Shorts 時長資料不一致、健康內容；LinkedIn 文件 Carousel 與案例見證；WhatsApp 的 opt-in、範本類別、24 小時客服窗、退訂、個人資料聲明與 Marketing 模板審稿；EDM 的寄件人資料、退訂與個人資料聲明。
- 新輸出（agent.html）：template-library.json、template-library.md、selected-templates.json、template-prompts.md、template-list.csv、publish-log.csv；marketing-system-prompt.txt 加入模板與 opt-in 規則。

## 檔案與載入順序
edit.html／view.html／agent.html／shared.css；options.js（v1 選項庫）→ tpl-data.js（模板庫、渠道資料、補充清單）→ core.js（v1＋小幅補丁）→ tpl-logic.js（選擇器、AI 提示、成效紀錄、擴充檢查與輸出）→ prompts.js（v1＋templates、publog 兩份討論提示詞）。

## 用法
用瀏覽器打開 edit.html。資料存在 localStorage（key：brand_stage4f_v1，與 v1／v2 相容）；換瀏覽器用「匯出／匯入 JSON」。匯出 schema 為 brand/stage4f-marketing/v3；4G／4H 以 brand/stage4f 開頭辨識，可直接匯入。

## 重要限制
- 模板內容與平台規格依 2026-11-16 的公開資料整理，其中不少來自第三方整理而非官方文件；平台規格與政策會變，以各平台最新說明為準。
- 資料來源互相矛盾、未能定案的項目：YouTube Shorts 時長上限（60 秒或 3 分鐘）；LinkedIn 公司主頁字數上限（700 或 3,000）與影片長度（10、15 或 30 分鐘）；X 的中文計字與影片長度；Facebook 沒有公布自然發佈的相片尺寸與安全區（模板借用廣告指引）。
- 關鍵字掃描與合規提醒只是提示，不是法律判斷或法律意見；健康、美容、優惠、見證、前後對比與比較內容發布前必須由人類合規審核。
- 香港《非應邀電子訊息條例》（第 593 章）：商業電子訊息須有清楚準確的寄件人資料、顯眼的退訂說明與方式，收到退訂後 10 個工作天內停止寄送（依 OFCA 與 e-Legislation 文本整理）。該條例對 WhatsApp 的適用性、《個人資料（私隱）條例》的直接促銷規定，這次沒有逐條查證，須專業人士確認。
- WhatsApp 規則依 WhatsApp Business Messaging Policy 與第三方整理：須 opt-in（須講明是你的品牌）；主動發起須用 Meta 核准的範本；客人來信後 24 小時客服窗內可自由回覆。範本審批時間、收費與類別判定以 Meta 最新說明為準。
- 已知未涵蓋：Google／Meta 廣告投放模板；LinkedIn 廣告；YouTube 社群貼文、直播；Facebook 群組與活動頁細節；Website SEO 多語言（hreflang）與技術 SEO；EDM 的寄送平台設定與到達率；小紅書在香港公司帳戶下的商業合作流程；「變更影響」（核心方向改變時標出受影響下游項目）尚未實作。
- 模板推薦只是按渠道、目標、漏斗與風險的簡單評分；成效紀錄各渠道「觸及」定義不同，不能單獨證明模板好壞。模板預覽（SVG）是示意；沒有風格相符度分數；AI 提案不等於核准；approval.state 固定為 draft。

## 測試
已用 Chromium（Playwright）開過 edit／view／agent 三頁：選渠道、五個新渠道的選擇器推薦（含高風險開關）、選用模板、新增的 YouTube 縮圖與 EDM 頭圖預覽、成效紀錄彙總、重新載入保存，均無 console 錯誤；手機寬度（390px）三頁沒有橫向捲動；另以 Node 驗證新渠道檢查與匯出再貼回的往返。未做 Safari／Firefox、螢幕閱讀器、真實平台上傳與審核，以及法律與合規專業人士審閱。

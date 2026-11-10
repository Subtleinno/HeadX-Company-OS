# 交給 Perplexity 的問題：策略文件長什麼樣

用途：Strategy Doc 的**欄位與結構**不能靠我推理，要有外部實證。以下九條請一次過貼去 Perplexity，把答案原文帶回來（不用整理，我自己抽）。
最後一段說明：為什麼是這九條，以及哪些答案會改變設計。

---

## A 組：策略文件本身的結構（決定 schema 的欄位）

**A1.** 公開的 brand guideline／tone-of-voice 文件，有沒有實際被拆成「可逐條引用」的結構？請列 2–3 個公開例子（例如 Mailchimp Voice & Tone、Shopify Brand、GOV.UK content design guidance、Atlassian、Stripe），並說明它們的章節層級、每節大約幾條、單條大約多長。

**A2.** 一份 creative brief（IG carousel／social campaign 用）通常有哪些必填欄位？有沒有行業標準或官方模板（例如 AICP brief、Meta 或 Google 的官方 creative brief template、D&AD）？請給實際欄位清單。

**A3.** 有沒有機構把 brand guideline 寫成 machine-readable（JSON／YAML schema 或 design tokens）並開源？請給具體 repo 或 schema 名稱，並說明它能表達「用法規則」還是只有「值」（顏色、字體）。

**A4.** 品牌語氣怎樣分層？例如「品牌層／渠道層／格式層／步驟層／範例句」這種分法，有沒有既有框架做過？請引用具體來源，不要泛論。

**A5.** 有沒有公開的 tone-of-voice 評分表（rubric）或分類維度？例如 Nielsen Norman Group 的 tone dimensions、Mailchimp 對「voice（不變）」與「tone（隨場合變）」的區分、或其他品牌的公開做法。

**A6.** 一份可直接執行的策略／SOP 文件，實際字數量級是多少？有沒有公開樣本說明「太長會失效」？請給具體字數範圍與來源。

---

## B 組：agent 怎樣揀對一份（決定 routing 機制）

**B1.** 用文件 front-matter（適用任務／渠道／受眾／優先級）做 routing，對比純向量檢索，業界實務上哪一個可靠？有沒有實測數據或案例？

**B2.** RAG 選文件時，「一份文件太長」與「切成太多碎片」哪個更傷？2026 年關於 chunk size 的實證最佳範圍是什麼？請給研究或實測數字。

---

## C 組：產出規格（決定 render 參數）

**C1.** Instagram carousel 2026 年最新官方規格：尺寸、安全區（避開 UI 遮擋）、張數上限、建議字數與字級、支援檔案格式？請註明資料日期與來源。

---

## 為什麼是這九條（不要刪）

| 問題 | 會改變什麼 |
|---|---|
| A1、A4、A5 | Strategy Doc 的 `layer` 與 `sections` 欄位。分錯層，agent 就會拿品牌層的文件去做渠道層的判斷 |
| A2 | `Needs` 派生時引用哪一段；也決定 brief 是不是一個獨立物件 |
| A3 | 策略是否要分「值」與「規則」兩種形態（值可入 tokens，規則只能入文件） |
| A6 | 決定一份策略的上限長度，以及要不要強制拆節（agent 讀長文的準確度會掉） |
| B1 | 決定 agent 揀策略是「看 metadata 篩」還是「向量搜尋」。這一條錯，整個「agent 自己揀對的策略」就不成立 |
| B2 | 切分粒度。切太碎會失去上下文，太長會稀釋 |
| C1 | render 參數與安全區；也是 IG carousel 這個第一個測試案例的驗收依據 |

**兩件 Perplexity 答不到、只有你可以給的**：
1. **你自己品牌的語氣樣本**（一段 IG 文案、一份舊提案、或你寫給客人看的東西）。A 組只會告訴我「格式」，不會告訴我「你的聲音」。
2. **你實際上會寫幾長**。如果你打算每份策略寫半頁，schema 就要遷就半頁；如果我按 20 頁的標準設計，你一份都不會寫。這一條決定成敗。

-- 自定義頁的「保留原因」（issue #88：攝影頁併入圖像頁）。
--
-- 建立自定義頁時，系統會按 brief 的文字比對八個固定頁的關鍵詞，命中就提示
-- 「這看來屬於某一頁」。提示不阻擋：設計師可以仍然新增，但要寫一句為甚麼
-- 放不進那一頁。
--
-- 為咩要落庫，不放在版本內容裡：
--   1. 版本內容是**這一頁決定什麼**，不是「為咩這一頁存在」。混在一起，
--      prompt 包就會把保留原因當成品牌規則交出去。
--   2. 原因要活到第一版之前 —— 剛建立、未寫內容的頁就已經有原因。
--
-- 為咩「品牌主頁不顯示」：主頁列的是頁名與一句 brief，保留原因是治理紀錄，
-- 不是品牌內容。
--
-- 為咩 400 字：與 brief 同一個上限。比 brief 更長的理由，通常是在寫內容。

alter table brand_page
  add column if not exists keep_reason text;

alter table brand_page
  drop constraint if exists brand_page_keep_reason_length;

alter table brand_page
  add constraint brand_page_keep_reason_length
  check (keep_reason is null or char_length(keep_reason) between 1 and 400);

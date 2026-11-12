-- 品牌模組 v2：補齊八個固定頁（issue #87）。
--
-- 0017 只放寬了「固定頁可以用哪幾個鍵」的兩條 CHECK，**沒有為已經存在的
-- 品牌插入新頁**。結果：
--
--   新環境（由零開始）→ 八頁
--   舊環境（0017 之前開的品牌）→ 永遠五頁：home／logo／color／type／tone
--
-- 而畫面不會報錯 —— `withBrandPages()` 只是把後端回的那幾頁畫出來，所以
-- 平台／圖像／已核准範例三頁靜靜消失。老闆在本機看不到 #65–#68 的成果，
-- 會以為工作未交付。
--
-- 這一支做兩件事，都是冪等的：
--
-- 1. 每個品牌補齊八個固定頁。
-- 2. 已存在的固定頁只對齊 `sort_order`，**不動 `name`** —— 名是 `BRAND_FIXED_PAGES`
--    給的，但有人改過就保留他改的；次序則必須對齊，否則舊品牌的次序是
--    logo 20／tone 50，會排出「標誌排在平台之前」，與新環境不一致。
--
-- 為咩這裡用 `do update set sort_order`，而 `ensureFixedPages()` 用 `do nothing`：
-- 後者每次讀 `GET /brands/:id/pages` 都跑，不應該每次都寫；但它因此永遠改不到
-- 舊品牌已經寫死的次序。次序只在這裡改一次。
--
-- 條件 `where deleted_at is null` 一定要寫：唯一索引是部分的
-- （`brand_page_live_key_idx`），衝突推論要對上同一個條件，否則 Postgres
-- 會說找不到可以推論的索引。已軟刪除的固定頁會被重新建立 —— 那是想要的：
-- 固定頁不應該可以被刪走。

insert into brand_page (brand_id, kind, key, name, sort_order)
select b.id, 'fixed', f.key, f.name, f.sort_order
  from brand b
 cross join (values
   ('home',     '品牌主頁',   10),
   ('platform', '平台',       20),
   ('color',    '色彩',       30),
   ('type',     '字體',       40),
   ('logo',     '標誌',       50),
   ('tone',     '語氣',       60),
   ('image',    '圖像',       70),
   ('examples', '已核准範例', 90)
 ) as f(key, name, sort_order)
on conflict (brand_id, key) where deleted_at is null
do update set sort_order = excluded.sort_order;

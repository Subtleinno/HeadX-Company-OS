-- 每位員工「上次工作的品牌」（issue #15）。
--
-- 為咩要存在伺服器而唔存 localStorage：部門主頁就係品牌頁，同一個人會喺
-- 公司機、屋企機、瀏覽器之間走。存喺瀏覽器等於「換一台機就由第一個品牌開始」，
-- 而第一個品牌通常唔係佢做緊嘅那一個。所以呢個係人的事實，唔係機器的事實。
--
-- 為咩 user_id 做主鍵而唔係另一欄：一個人只有一個「上次品牌」。
-- 用主鍵表達「唯一」比用程式記得檢查可靠。
--
-- 為咩唔存「第一次揀邊個」的隨機結果喺呢度以外：隨機只發生一次，
-- 寫入之後就係事實；重開機見到同一個品牌，才叫「記住」。

create table user_brand_focus (
  user_id uuid primary key references app_user (id) on delete cascade,
  -- 冇 on delete cascade：刪品牌時應該大聲失敗，而唔係靜靜清走
  -- 一堆人嘅工作位置。而家根本冇刪品牌的路徑，呢個 FK 就係防呆。
  brand_id uuid not null references brand (id),
  updated_at timestamptz not null default now()
);

-- 刪品牌要掃這張表；索引令它唔會變成全表掃描。
create index user_brand_focus_brand_idx on user_brand_focus (brand_id);

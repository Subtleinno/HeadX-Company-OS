-- 品牌級編輯權與自定義頁（issue #32，決策 C103）。
--
-- 為咩要有 brand_editor 這張表，而唔係加一個新職位或者新部門：
-- 「可以改這個品牌的頁」係一件事實，範圍就係一個品牌。職位（role）同部門
-- （department）都講唔到「只可以改 A 品牌、唔可以改 B 品牌」—— 一個設計師
-- 今日做 A 品牌，明日做 B 品牌，職位同部門都冇變。
-- 用一張 (brand_id, user_id) 的表，加幾多品牌、幾多人都唔需要改 schema，
-- 亦唔會令 HR 那邊多一個冇人識的職位名。
--
-- 老闆不需要出現在這張表：老闆永遠可以改所有品牌的頁（C103）。把老闆也寫
-- 進來，就會出現「老闆被移除了編輯權」這種可以寫入而講不通的狀態。

create table brand_editor (
  brand_id uuid not null references brand (id),
  user_id uuid not null references app_user (id),
  granted_by uuid references app_user (id) on delete set null,
  created_at timestamptz not null default now(),

  primary key (brand_id, user_id)
);

create index brand_editor_user_idx on brand_editor (user_id);

-- 自定義頁的鍵（slug）在品牌之內唯一，這一點 0013 的部分唯一索引已經管。
-- 這裡只補一個約束：自定義頁一定要有 brief（建立時要求的那一句方向）。
-- 固定頁 brief 一定是 null（0013 已有 check），兩邊合起來就是「有 brief 的
-- 一定是自定義頁，自定義頁一定有 brief」。
alter table brand_page
  add constraint brand_page_custom_has_brief check (kind <> 'custom' or brief is not null);

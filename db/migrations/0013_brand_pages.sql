-- 品牌頁與頁版本（issue #33，決策 C96／C97）。
--
-- 為咩要有 brand_page 這張表，而唔係把「五頁」寫死在程式：
-- 頁的清單會增加（自定義頁，零到多張，C101），而且每一頁都有自己的版本鏈。
-- 寫死五個 enum 的話，加第六頁就要改 schema 再改程式兩次。
--
-- 為咩 kind 同 key 分開：固定五頁的鍵（home／logo／color／type／tone）是
-- 網址的一部分（`/design/brand/<key>`），自定義頁的鍵是 slug
-- （`/design/brand/p/<slug>`）。兩者共用同一個命名空間，所以撞名一定拒絕 ——
-- 但網址形狀不同，所以需要知道它是哪一種。
--
-- 為咩「現行版本」冇欄位：現行＝這一頁最新、未被刪除的版本，用 max(version_no)
-- 算出來（C97）。存一個 is_current 旗標，就有機會出現兩個現行、或者刪完之後
-- 一個現行都沒有；而且那兩個狀態都寫得進資料庫，所以總有一日會出現。
--
-- 為咩版本要 trigger 擋 UPDATE：C97 講「版本只加不改」。靠程式記得的話，
-- 第一個順手加一行 `update ... set content` 的人就會改寫歷史，而畫面上看
-- 不出分別。軟刪除是唯一的合法 UPDATE，所以 trigger 只放行「deleted_at 由
-- null 變有值，其他欄位一個字都冇變」。

create table brand_page (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand (id),
  kind text not null,
  -- 固定頁：home／logo／color／type／tone。自定義頁：slug（同網址一致）。
  key text not null,
  name text not null,
  -- 自定義頁的方向（建立時必填，見 issue #32）；固定頁一定係 null。
  brief text,
  -- 左側次序。固定頁用 10 的倍數，自定義頁由建立次序接住。
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint brand_page_kind_valid check (kind in ('fixed', 'custom')),
  -- 小寫、數字與連字號：同網址段落一致，避免要 encode。
  constraint brand_page_key_format check (key ~ '^[a-z][a-z0-9-]{0,39}$'),
  constraint brand_page_name_length check (char_length(name) between 1 and 60),
  constraint brand_page_brief_length check (brief is null or char_length(brief) between 1 and 400),
  -- 固定頁的鍵只可以是這五個；自定義頁不可以叫這五個名（C96／#32）。
  constraint brand_page_fixed_key check (
    kind <> 'fixed' or key in ('home', 'logo', 'color', 'type', 'tone')
  ),
  constraint brand_page_custom_key check (
    kind <> 'custom' or key not in ('home', 'logo', 'color', 'type', 'tone')
  ),
  constraint brand_page_fixed_no_brief check (kind <> 'fixed' or brief is null)
);

-- 同一個品牌之內，未刪除的頁鍵唯一。用部分唯一索引：軟刪除之後同一個鍵
-- 可以重新建立，而歷史那一列仍然留得住。
create unique index brand_page_live_key_idx
  on brand_page (brand_id, key)
  where deleted_at is null;

create index brand_page_order_idx on brand_page (brand_id, sort_order, key);

create function brand_page_touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger brand_page_touch
  before update on brand_page
  for each row
  execute function brand_page_touch_updated_at();

create table brand_page_version (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references brand_page (id),
  -- 由 1 起，逐頁計（#33）。刪除之後號碼不會重用：歷史要對得返。
  version_no integer not null,
  content text not null,
  -- 這一版為咩存在（手改、重編、用回舊版）。唔寫就係 null，唔會作假摘要。
  note text,
  created_by uuid references app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint brand_page_version_no_positive check (version_no > 0),
  constraint brand_page_version_content_length check (char_length(content) between 1 and 200000),
  constraint brand_page_version_note_length check (note is null or char_length(note) between 1 and 200),
  constraint brand_page_version_unique_no unique (page_id, version_no)
);

create index brand_page_version_live_idx
  on brand_page_version (page_id, version_no desc)
  where deleted_at is null;

-- 只加不改：除了「由未刪變成已刪」，其餘 UPDATE 一律拒絕。
create function brand_page_version_append_only() returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id
     or new.page_id <> old.page_id
     or new.version_no <> old.version_no
     or new.content <> old.content
     or new.created_at <> old.created_at
     or coalesce(new.note, '') <> coalesce(old.note, '')
     or coalesce(new.created_by::text, '') <> coalesce(old.created_by::text, '') then
    raise exception '頁版本只准追加，不准改寫' using errcode = '42501';
  end if;

  if old.deleted_at is not null then
    raise exception '頁版本已經刪除，不可以再改' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger brand_page_version_no_rewrite
  before update on brand_page_version
  for each row
  execute function brand_page_version_append_only();

-- 物理刪除一律拒絕（不變量 7）。
create function brand_page_version_reject_delete() returns trigger
language plpgsql
as $$
begin
  raise exception '頁版本只可以軟刪除' using errcode = '42501';
end;
$$;

create trigger brand_page_version_no_delete
  before delete on brand_page_version
  for each row
  execute function brand_page_version_reject_delete();

-- 已出街成品釘住某一版（C97：引用只有兩種 —— 現行，與成品釘住）。
--
-- 現時未有任何成品寫入這張表：成品的模組未做。但「被引用不可以刪」這條
-- 規則如果等到成品出現才做，就會有一段時間可以刪掉一個已經印在盒上的版本。
-- 所以表先開，刪除檢查先做，成品出現時只需要寫入，不需要回頭改刪除邏輯。
create table brand_page_version_pin (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references brand_page_version (id),
  -- 成品種類。現時只有一種，但留一個欄位比日後改主鍵容易。
  ref_kind text not null check (ref_kind in ('output')),
  -- 人讀得明的標籤，例如「2026 秋季包裝盒 v2」。刪除被擋時原樣講給人聽。
  ref_label text not null,
  created_at timestamptz not null default now(),

  constraint brand_page_version_pin_label_length check (char_length(ref_label) between 1 and 200)
);

create index brand_page_version_pin_version_idx on brand_page_version_pin (version_id);

-- 同一件成品不可以重複釘同一個版本。
create unique index brand_page_version_pin_unique
  on brand_page_version_pin (version_id, ref_kind, ref_label);

-- Project Library：資料夾 → 專案集 → 專案，三層收納；格式可動態新增。
--
-- 老闆 2026-11-18 定：
--   左欄是一棵「資料夾（folder）→ 專案集（project set）」的樹；點一個專案集，
--   右邊主區顯示它裡面的專案（project）卡片。
--   頂部「ALL / PPT / 排版 / Video」是格式**過濾器**，跨所有資料夾篩選。
--   格式會持續增加，所以是資料（`project_format`），不是寫死的 enum。
--   三層全部有 CRUD；專案可以複製、可以自由搬到另一個專案集。
--
-- 專案這次先做「輕量殼」：標題、格式、封面、歸屬與時間；原始要求
-- （`project_request`）與 Brief 等深度內容之後再接。
--
-- 銜接說明：早前的半成品（已清走）在某幾部機上 apply 過 `project_folder`
-- （含 `created_by not null`）與 `project.folder_id`，但 repo 的 migration 鏈
-- （0001＋0002）從頭到尾都沒有這兩樣，而且那張 table 是空的。所以這裡直接
-- 拆走舊結構、重建新結構，兩邊（新裝、舊機）都收斂到同一份 schema。

-- ── 先拆舊的半成品結構（若存在） ─────────────────────────
-- project.folder_id 指向舊 project_folder；先拆 FK 再拆欄位。
alter table project drop constraint if exists project_folder_id_fkey;
alter table project drop column if exists folder_id;
drop table if exists project_folder;

-- ── 格式 ─────────────────────────────────────────────────
-- 格式是公司層的「工具分類」（PPT／排版／Video…），不掛品牌；會持續新增。
create table project_format (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint project_format_name_len check (char_length(btrim(name)) between 1 and 40)
);

create unique index project_format_name_idx
  on project_format (lower(btrim(name)));

create index project_format_order_idx
  on project_format (sort_order, created_at);

-- 三種起步格式。
insert into project_format (name, sort_order) values
  ('PPT', 1),
  ('排版', 2),
  ('Video', 3);

-- ── 資料夾 ───────────────────────────────────────────────
create table project_folder (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brand (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_folder_name_len check (char_length(btrim(name)) between 1 and 80)
);

create unique index project_folder_name_idx
  on project_folder (brand_id, lower(btrim(name)));

-- ── 專案集 ───────────────────────────────────────────────
-- 一疊專案的收納單位；folder_id 為 null 就是「未分類」。軟刪，可還原。
create table project_set (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brand (id) on delete cascade,
  folder_id uuid references project_folder (id) on delete set null,
  name text not null,
  created_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.app_user (id) on delete set null,

  constraint project_set_name_len check (char_length(btrim(name)) between 1 and 80)
);

create unique index project_set_name_idx
  on project_set (brand_id, lower(btrim(name)))
  where deleted_at is null;

create index project_set_brand_idx
  on project_set (brand_id, deleted_at, created_at);

-- ── 專案 ─────────────────────────────────────────────────
-- 輕量殼。格式由寫死 enum 改成外鍵指向 project_format。
alter table project drop constraint if exists project_format_valid;

alter table project add column format_id uuid references project_format (id) on delete restrict;

-- 遷移既有 format 文字：carousel／presentation／video 對應到新格式名。
update project p
set format_id = f.id
from project_format f
where (
    (p.format = 'carousel' and f.name = '排版')
    or (p.format = 'presentation' and f.name = 'PPT')
    or (p.format = 'video' and f.name = 'Video')
  );

-- 未對上的（不應存在，但保險）落到第一個格式。
update project p
set format_id = (
  select f.id from project_format f
  order by f.sort_order, f.created_at
  limit 1
)
where p.format_id is null;

alter table project alter column format_id set not null;
alter table project drop column format;

alter table project add column set_id uuid references project_set (id) on delete set null;

create index project_set_idx on project (set_id, created_at desc);
create index project_format_idx on project (format_id, created_at desc);

-- 封面：可空的檔案 id（MinIO）。沒有封面時畫面顯示灰塊＋標題。
alter table project
  add column cover_file_id uuid references public.stored_file (id) on delete set null;

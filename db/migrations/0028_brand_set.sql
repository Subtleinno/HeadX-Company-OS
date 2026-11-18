-- 品牌集（Brand set）：04A–04H 另開一層收納單位。
--
-- 老闆 2026-11-17 晚定：
--   01–03 是「這個品牌是誰」，只會有一份，留在品牌總覽。
--   04A–04H 是「這批東西點做」——同一副品牌性格可以生出很多套做法
--   （2026 夏季、2026 冬季…），每一套都可以重複套用到任何產品／設計／輸出。
--   那一套就叫一個「品牌集」（brand set）。
--
-- 所以 04A–04H 的答案不再屬於品牌，而是屬於品牌集：
--   brand_set_folder  資料夾（例如「2026」），純粹用來分類，不放答案。
--   brand_set         一個品牌集；folder_id 為 null 就是「未分類」。
--                     刪除是軟刪（deleted_at），可以還原，資料不會人間蒸發。
--   brand_guide_state / brand_guide_block 加 brand_set_id：
--      null ＝ 品牌層（00／01／02／03，以及舊資料），
--      非 null ＝ 某個品牌集的 04A–04H。
--
-- 唯一鍵因此要拆成兩條 partial index：品牌層一條、品牌集一條。
-- 一條普通 unique index 會把「同一個 stage 的同一格」在兩個品牌集之間
-- 當成重複，那等於兩個品牌集永遠只存得一份答案。

create table brand_set_folder (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint brand_set_folder_name_len check (char_length(btrim(name)) between 1 and 80)
);

-- 同一個品牌內，資料夾名唔可以撞（大小寫不計）：兩個「2026」冇人分得清。
create unique index brand_set_folder_name_idx
  on brand_set_folder (brand_id, lower(btrim(name)));

create table brand_set (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand (id) on delete cascade,
  -- 資料夾被刪 → 裡面的品牌集回到「未分類」，不跟著消失。
  folder_id uuid references brand_set_folder (id) on delete set null,
  name text not null,
  created_by uuid references app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 安全刪除：只標記，可還原；列表與挑選器都只看 deleted_at is null。
  deleted_at timestamptz,
  deleted_by uuid references app_user (id) on delete set null,

  constraint brand_set_name_len check (char_length(btrim(name)) between 1 and 80)
);

create unique index brand_set_name_idx
  on brand_set (brand_id, lower(btrim(name)))
  where deleted_at is null;

create index brand_set_brand_idx
  on brand_set (brand_id, deleted_at, created_at);

-- 04A–04H 的選項狀態：品牌集一份。
alter table brand_guide_state
  add column brand_set_id uuid references brand_set (id) on delete cascade;

drop index brand_guide_state_key_idx;

create unique index brand_guide_state_key_idx
  on brand_guide_state (brand_id, stage)
  where brand_set_id is null;

create unique index brand_guide_state_set_key_idx
  on brand_guide_state (brand_set_id, stage)
  where brand_set_id is not null;

-- 區塊紀錄（決策／歷史／附件）同理。
alter table brand_guide_block
  add column brand_set_id uuid references brand_set (id) on delete cascade;

drop index brand_guide_block_key_idx;

create unique index brand_guide_block_key_idx
  on brand_guide_block (brand_id, stage, block_id)
  where brand_set_id is null;

create unique index brand_guide_block_set_key_idx
  on brand_guide_block (brand_set_id, stage, block_id)
  where brand_set_id is not null;

create index brand_guide_block_set_idx
  on brand_guide_block (brand_set_id, stage);

-- 品牌引導：每個「填寫區塊」自己的一層紀錄。
--
-- 為什麼要有這一層：引導頁的每張卡（業務狀態、定價策略…）都是一次獨立討論。
-- 討論的結果不只是最後揀了哪個選項 —— 還有「為什麼這樣揀」的共識，以及當時
-- 參考過的文件。選項本身存在 brand_guide_state 的 JSONB（一份最終狀態），
-- 但共識與附件有先後次序：要知道幾時改、改之前係咩、邊份文件已經換走。
-- 塞進同一份 JSONB 會把「歷史」壓成「現況」，所以分開三張表。
--
-- 三張表的分工：
--   brand_guide_block           一個區塊的現況（最新決策）
--   brand_guide_block_revision  每次儲存留一版（歷史逐版睇得返）
--   brand_guide_block_file      區塊的附件（移除都留低，歷史要看得到）
--
-- 區塊由 (brand_id, stage, block_id) 定位。block_id 是前端 schema 的區塊代號
-- （`set:basic`、`cat:pricing`、`dims`、`dials`、`texts`…），不是外鍵 ——
-- 選項表可以改版，區塊紀錄不可以因此斷掉。block_code 是給人與 agent 講的
-- 位置編號（`00.1`），block_title 是當時的名稱，兩者一齊令 prompt 講得清
-- 「你而家改嘅係邊一格」。

create table brand_guide_block (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand (id),
  stage text not null,
  block_id text not null,
  -- 位置編號（`00.1`）：跨 stage 唯一，prompt 與 agent 都靠它對位。
  block_code text not null default '',
  block_title text not null default '',
  -- 最新決策：人手／AI 討論後的結論，不是選項快照。
  decision text not null default '',
  decision_by uuid references app_user (id) on delete set null,
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint brand_guide_block_stage_len check (char_length(stage) between 1 and 20),
  constraint brand_guide_block_id_len check (char_length(block_id) between 1 and 80),
  constraint brand_guide_block_code_len check (char_length(block_code) <= 24),
  constraint brand_guide_block_title_len check (char_length(block_title) <= 120)
);

-- 一個品牌的一個 stage 的一個區塊，只有一份現況。
create unique index brand_guide_block_key_idx
  on brand_guide_block (brand_id, stage, block_id);

create index brand_guide_block_brand_idx on brand_guide_block (brand_id, stage);

-- 每次儲存決策就追加一版。空的決策不寫（冇內容就冇歷史），
-- 「清除」只改現況，不動歷史 —— 已經講過的共識不應該因為手民之誤消失。
create table brand_guide_block_revision (
  id uuid primary key default gen_random_uuid(),
  block uuid not null references brand_guide_block (id) on delete cascade,
  decision text not null,
  actor_type text not null default 'human',
  actor_id uuid references app_user (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint brand_guide_block_revision_decision_len check (char_length(decision) between 1 and 8000),
  constraint brand_guide_block_revision_actor_type check (actor_type in ('human', 'agent', 'system'))
);

create index brand_guide_block_revision_idx
  on brand_guide_block_revision (block, created_at desc);

-- 區塊的附件。指向檔案層（stored_file），不是另一份檔案。
-- 移除用 removed_at 標記而不是刪列：歷史要講得出「當時參考過、後來換走」。
create table brand_guide_block_file (
  id uuid primary key default gen_random_uuid(),
  block uuid not null references brand_guide_block (id) on delete cascade,
  file_id uuid not null references stored_file (id),
  -- 顯示名。空字串代表用 stored_file.original_name（改名不影響原檔）。
  label text not null default '',
  attached_by uuid not null references app_user (id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references app_user (id) on delete set null,

  constraint brand_guide_block_file_label_len check (char_length(label) <= 200),
  constraint brand_guide_block_file_removal check (
    (removed_at is null and removed_by is null) or removed_at is not null
  )
);

-- 同一份檔案在同一個區塊同時只可以掛一次；移除之後可以再掛返。
create unique index brand_guide_block_file_live_idx
  on brand_guide_block_file (block, file_id)
  where removed_at is null;

create index brand_guide_block_file_block_idx
  on brand_guide_block_file (block, created_at);

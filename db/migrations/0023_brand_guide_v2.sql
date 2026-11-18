-- 品牌引導 v2：把 reference（Perplexity idea Branding stage0–4h）完整搬入。
--
-- v1（0022）只有 brand_guide_option + brand_guide_answer，模型是「每維度一行
-- picked + text_value」。reference 的資料模型更完整：每個 stage 是一份完整
-- state（含 category 多選、dim 單選、dial 刻度、text 文字、calc 數字、自訂項、
-- 以及 4A 核准、4G 矩陣、4H 風格庫等深層結構），而且是「每 stage 一份 brief
-- JSON」向下游 stage 傳遞（跨 stage 連繫）。
--
-- 這個 migration 做三件事：
--   1. 給 brand_guide_option 加 field_type（欄位類型）與 prompt（討論提示詞）。
--   2. 加 brand_guide_stage 記錄 stage 元資料（順序、名稱、依賴前 stage）。
--   3. 加 brand_guide_state 存每 stage 的完整 state + brief（JSONB）。
--
-- 舊 brand_guide_answer 保留，但新資料走 brand_guide_state（一份 JSONB）。

-- 1. 選項欄位類型。reference 有四種維度 + 計算器：
--   category   多選（s[k] 是 id 陣列，可自訂 custom）
--   dim        單選（s.pick[set][id] 存一個 opt id）
--   dial       刻度（-2 ~ +2 五檔）
--   text       自由文字（s.text[id]）
--   number     數字（calcTicket 等，unitEcon 會 parse）
alter table brand_guide_option
  add column field_type text not null default 'category';

alter table brand_guide_option
  add constraint brand_guide_option_field_type_check
  check (field_type in ('category', 'dim', 'dial', 'text', 'number'));

-- 討論提示詞（prompts.js 的內容，每個維度一份）。貼給外部 AI Agent 用。
alter table brand_guide_option
  add column prompt text;

-- 2. stage 元資料。一行 = 一個 stage，講順序、名稱、依賴哪個前 stage。
create table brand_guide_stage (
  id uuid primary key default gen_random_uuid(),
  stage text not null unique,
  name_zh text not null,
  sort_order integer not null,
  -- 依賴的前 stage（例如 stage2 依賴 stage0、stage1）。autoImport 用。
  depends_on text[] not null default '{}',
  -- 文字欄位定義（reference 的 TEXTS：id/label/placeholder/help/rows）。
  -- 這些是「欄位結構」不是「選項」，所以要獨立存，前端照它畫輸入框。
  text_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint brand_guide_stage_stage_len check (char_length(stage) between 1 and 20),
  constraint brand_guide_stage_name_len check (char_length(name_zh) between 1 and 80)
);

-- 3. 每 stage 的完整 state + brief。一行 = 一個品牌在某 stage 的一份狀態。
--   state  edit 中的完整狀態（對應 reference 的 emptyState + s.dims/text/custom...）
--   brief  buildBrief(s) 的輸出 JSON（completeness/checks/hints/approval/agent_rules...）
--         brief 是下游 stage autoImport 的輸入，也是跨 stage 連繫的載體。
create table brand_guide_state (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand (id),
  stage text not null,
  -- 完整狀態（category 多選、dim 單選、dial 刻度、text 文字、calc 數字、自訂項）。
  state jsonb not null default '{}'::jsonb,
  -- buildBrief 輸出（含 completeness/checks/hints/approval/agent_rules）。
  brief jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),

  constraint brand_guide_state_stage_len check (char_length(stage) between 1 and 20)
);

-- 一個品牌 + stage 只有一份狀態。
create unique index brand_guide_state_key_idx
  on brand_guide_state (brand_id, stage);

create index brand_guide_state_brand_idx
  on brand_guide_state (brand_id);

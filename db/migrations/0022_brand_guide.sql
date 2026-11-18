-- 品牌引導系統（brand guide）：把「建立品牌」變成一個可跟的流程。
--
-- 同 brand_page（識別管理）的分別：
--   brand_page     品牌已經建立之後，管理 logo／color／type 等識別資產。
--   brand_guide    品牌建立之前，引導任何人由零開始建立品牌。
--
-- 方向來自 Perplexity idea 的 Branding stage0–4h（12 個 stage）。每個 stage
-- 是一組「引導維度」，每個維度是一堆「選項 + 自由文字」。用家不用懂品牌，
-- 只要跟住選項揀、答引導問題，系統自動做計算（單位經濟）、檢查（合規）、
-- 生成（業務背景／定位宣言／brief）、貼回 AI 結果。
--
-- 為咩選項庫要入資料庫，而不是寫死在程式：選項庫就是「業務語義」
-- （行業帶牌照提醒、語氣、規管 flag），底座原則第 6 條「可配置優於寫死」。
-- 老闆／agent 可以增刪選項，不碰程式。

-- 選項庫。一行 = 一個可選項（例如「中醫診所」）。
-- stage     哪一個 stage（stage0 業務基礎、stage1 定位…）。
-- dimension 哪一個維度（industry、reasons、assets、pricingStrategy…）。
-- opt_id    選項短代碼（ind_tcm、rs_dated…），人同 agent 都講得返。
-- zh        給人看的中文名。desc 是解釋。group_name 是畫面分組。
-- reg_flag  規管旗標（tcm/med/health/hdata…），多個用逗號。檢查器用。
-- licence   牌照／註冊提醒（給人看的文字，不是法律意見）。
-- tone      這個選項對應的語氣提示（下游 stage3 會用）。
-- extra     選項的額外欄位（s1 分類等），jsonb，日後按 stage 擴充。
create table brand_guide_option (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  dimension text not null,
  opt_id text not null,
  zh text not null,
  description text not null default '',
  group_name text not null default '',
  sort_order integer not null default 0,
  reg_flag text,
  licence text,
  tone text,
  extra jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint brand_guide_option_stage_len check (char_length(stage) between 1 and 20),
  constraint brand_guide_option_dim_len check (char_length(dimension) between 1 and 40),
  constraint brand_guide_option_id_format check (opt_id ~ '^[a-zA-Z0-9_]{1,40}$'),
  constraint brand_guide_option_zh_len check (char_length(zh) between 1 and 120)
);

-- 同一個 stage + dimension 之內，opt_id 唯一。
create unique index brand_guide_option_key_idx
  on brand_guide_option (stage, dimension, opt_id);

create index brand_guide_option_lookup_idx
  on brand_guide_option (stage, dimension, sort_order);

create function brand_guide_option_touch() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger brand_guide_option_touch
  before update on brand_guide_option
  for each row
  execute function brand_guide_option_touch();

-- 用家答案。一行 = 一個維度的答案（揀了哪些選項 + 自由文字）。
-- 揀了的選項存 opt_id 陣列（引用 brand_guide_option.opt_id），自由文字存 text。
-- 答案可反覆改（引導是對話，不是一次過填表），所以不設 append-only。
create table brand_guide_answer (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand (id),
  stage text not null,
  dimension text not null,
  -- 揀了的選項（opt_id 陣列）。
  picked text[] not null default '{}',
  -- 自由文字（what/who/how/purpose/vision 等維度用）。
  text_value text not null default '',
  updated_at timestamptz not null default now(),

  constraint brand_guide_answer_stage_len check (char_length(stage) between 1 and 20),
  constraint brand_guide_answer_dim_len check (char_length(dimension) between 1 and 40),
  constraint brand_guide_answer_text_len check (char_length(text_value) between 0 and 4000)
);

-- 同一個品牌 + stage + dimension 只有一行答案（改答案 = 更新，不是新增）。
create unique index brand_guide_answer_key_idx
  on brand_guide_answer (brand_id, stage, dimension);

create index brand_guide_answer_brand_idx
  on brand_guide_answer (brand_id, stage);

-- 品牌引導：stage 級核准狀態（可寫入的事實），以及區塊的 rationale（原因）。

-- 為甚麼要有這張表：engine 的 buildBrief() 目前把 approval.state 硬編碼成 draft
-- （4E 的 spaceSpec 等寫死 {state:"draft",approved_by:null}），4A 的核准機制
-- （stMeta 每張卡 draft/ai/review/revise/approved + impact 下游影響）則只活在
-- browser 的 localStorage，platform 層根本沒有落過。結果是「核准」無法持久，
-- 匯出的 design.md / token 檔講不出「這段是草稿還是已核准」。

-- 這張表把「核准」變成可寫入、可追溯的持久事實：
--   status    draft / in_review / approved / needs_revision（跟 4A 的語義一致）
--   approver  核准者（app_user），approved 時必填
--   version   版本字串（approved 時必填，對應 4A 的 version）
--   note      核准／修訂備註
--   rationale 整份 stage「為甚麼這樣選」的簡短說明（人寫，或 AI 提案後人確認）

-- 粒度是 stage 級（4A 的每卡獨立 status 留待日後在此之上加 card 級）。
-- scope 跟 brand_guide_state 完全一樣三層：
--   brand_id 有值、brand_set_id null  → 品牌層（00–03、04A、04G）
--   brand_id 有值、brand_set_id 有值  → 品牌集（04B–04E、04H）
--   brand_id null、brand_set_id null  → 公司層（04F 行銷內容）

create table brand_guide_approval (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brand(id) on delete cascade,
  brand_set_id uuid references brand_set(id) on delete cascade,
  stage text not null,
  status text not null default 'draft',
  approver_id uuid references app_user(id) on delete set null,
  version text not null default '',
  note text not null default '',
  rationale text not null default '',
  updated_at timestamp with time zone not null default now(),

  constraint brand_guide_approval_scope_known
    check (brand_id is not null or brand_set_id is null),
  constraint brand_guide_approval_status_known
    check (status in ('draft', 'in_review', 'approved', 'needs_revision')),
  constraint brand_guide_approval_stage_len
    check (char_length(stage) between 1 and 20),
  constraint brand_guide_approval_version_len
    check (char_length(version) <= 40),
  constraint brand_guide_approval_note_len
    check (char_length(note) <= 4000),
  constraint brand_guide_approval_rationale_len
    check (char_length(rationale) <= 12000)
);

-- 三條 partial index 對應三個 scope（同 brand_guide_state 一致）：
-- 普通 unique index 會把 null 當成彼此不同，所以分開三條。
create unique index brand_guide_approval_key_idx
  on brand_guide_approval (brand_id, stage)
  where brand_set_id is null;

create unique index brand_guide_approval_set_key_idx
  on brand_guide_approval (brand_set_id, stage)
  where brand_set_id is not null;

create unique index brand_guide_approval_company_key_idx
  on brand_guide_approval (stage)
  where brand_id is null;

-- 區塊加 rationale：與 decision（結論）分開。「結論」是揀咗邊個，「原因」
-- 是為甚麼揀。兩者混在一個欄位會令 agent 分不清哪句是決定、哪句是理由。
-- buildDesignDoc() 合成時把 rationale 併入，而非只印選項標籤。
alter table brand_guide_block
  add column rationale text not null default '';

alter table brand_guide_block
  add constraint brand_guide_block_rationale_len check (char_length(rationale) <= 8000);

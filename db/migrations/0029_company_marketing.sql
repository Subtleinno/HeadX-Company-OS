-- 公司層的 04F 行銷內容：brand_guide_state / brand_guide_block 多一個「冇品牌」的 scope。
--
-- 老闆 2026-11-17 晚定：04F 行銷內容搬去 Boss Portal 的 Marketing 模組，
-- 因為行銷策略是他自己定、全公司共用、其他同事不應該看到。
--
-- 「全公司共用」在資料上就是「不屬於任何品牌」——所以不是加一個新表再抄一次
-- 區塊／歷史／附件那套，而是讓原本的兩張表接受 brand_id = null：
--   brand_id 有值、brand_set_id null  → 品牌層（00–03、04A、04G）
--   brand_id 有值、brand_set_id 有值  → 某個品牌集的 04B–04E、04H
--   brand_id null、brand_set_id null  → 公司層（04F 行銷內容）
--
-- 兩個約束要守住：
--   1. 公司層不可能屬於某個品牌集（品牌集本身必要有 brand_id）。
--   2. 公司層同一個 stage／區塊只可以有一份 —— 普通的 unique index 會把
--      null 當成彼此不同，所以另開一條 partial index 專門管 brand_id is null。

alter table brand_guide_state alter column brand_id drop not null;
alter table brand_guide_block alter column brand_id drop not null;

alter table brand_guide_state
  add constraint brand_guide_state_scope_known
  check (brand_id is not null or brand_set_id is null);

alter table brand_guide_block
  add constraint brand_guide_block_scope_known
  check (brand_id is not null or brand_set_id is null);

create unique index brand_guide_state_company_key_idx
  on brand_guide_state (stage)
  where brand_id is null;

create unique index brand_guide_block_company_key_idx
  on brand_guide_block (stage, block_id)
  where brand_id is null;

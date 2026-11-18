-- 品牌引導：可編輯的 prompt，以及 agent 經 MCP 寫入的痕跡。
--
-- 兩件事分開講：
--
-- 1. prompt_override
--    每張卡自動砌一份 prompt（帶位置、選項、決策），但有時老闆想調整語氣、
--    加一段背景、或者叫 agent 只做某件事。那份改動要留得住，否則下次開卡
--    又變回自動版本。空字串 = 用自動版本（自動版本跟住選擇即時更新）；
--    非空 = 用老闆自己那版，畫面要講明「改選項不會自動更新」。
--
-- 2. agent 寫入
--    決策可以由人寫，也可以由已授權的 agent 經 MCP 寫。agent 不是 app_user，
--    所以 revision 與現況各加一個 agent_id，歷史才講得出「這版是 agent 寫的」。
--    actor_type 早就允許 'agent'，這次補齊「是哪一個 agent」。
--
-- 兩者都不改舊資料：prompt_override 預設空字串＝全部照舊自動生成。

alter table brand_guide_block
  add column prompt_override text not null default '',
  add column decision_agent_id uuid references agent_identity (id) on delete set null;

alter table brand_guide_block
  add constraint brand_guide_block_prompt_len check (char_length(prompt_override) <= 12000);

alter table brand_guide_block_revision
  add column agent_id uuid references agent_identity (id) on delete set null;

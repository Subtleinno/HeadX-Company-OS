-- 範圍層 Prompt 的自訂版本：品牌總覽（01–03）、一套品牌集（04B–04E、04H）、
-- 一個單一階段（04A 核心識別、04G 治理）。
--
-- 為什麼要另開一張表而不是塞進 brand_guide_state.state：
--   state 是 stage 引擎的輸入（選項、刻度、文字），brief 由它算出來。
--   把一段幾千字的 prompt 放進去，等於叫引擎去讀一件它不認識的東西，
--   日後任何人改 state 的形狀都會撞到這個 key。
--
-- 為什麼 scope 是一段文字而不是 stage：
--   「品牌總覽」不是一個 stage（它是 01–03 三站合計），而「04A」雖然是一個
--   stage，它的 prompt 也不是 state，而是整頁的交代。所以用一個範圍代號
--   （`brand`／`set`／`stage4a`…），與 stage 刻意分開 —— stage 改了名字，
--   舊 prompt 仍然留在它自己的 scope 下，不會靜靜消失。
--
-- scope 的合法性（`set` 只可以在品牌集、`stage4b` 只可以在品牌集…）由
-- 應用層驗，這裡只守住「長度」與「scope 一定有著落」兩件事。

create table brand_guide_prompt (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brand(id) on delete cascade,
  brand_set_id uuid references brand_set(id) on delete cascade,
  scope text not null,
  prompt_override text not null default '',
  updated_by uuid references app_user(id) on delete set null,
  updated_at timestamp with time zone not null default now(),
  constraint brand_guide_prompt_scope_known
    check (brand_id is not null or brand_set_id is null),
  constraint brand_guide_prompt_scope_len
    check (char_length(scope) >= 1 and char_length(scope) <= 40),
  constraint brand_guide_prompt_text_len
    check (char_length(prompt_override) <= 40000)
);

-- 兩個 scope 各自一條唯一鍵（同其餘 guide 表一致）：普通的 unique index 會
-- 把 null 當成彼此不同，品牌層的 `(brand_id, scope)` 因此要 partial。
create unique index brand_guide_prompt_key_idx
  on brand_guide_prompt (brand_id, scope)
  where brand_set_id is null;

create unique index brand_guide_prompt_set_key_idx
  on brand_guide_prompt (brand_set_id, scope)
  where brand_set_id is not null;

create index brand_guide_prompt_brand_idx on brand_guide_prompt (brand_id);

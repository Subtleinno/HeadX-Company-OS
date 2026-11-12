-- 品牌專屬系統建議（issue #60）。
--
-- 一列＝一個「值得獨立成頁」的建議。三件事要有紀錄：
--   1. 三項判斷的結果（獨有、重複使用、其他頁放不下）—— 不只存結論，存理由，
--      因為「為咩值得」係老闆決定接受與否的全部材料。
--   2. 它屬於哪一頁（`belongs_to`）：判斷其實屬於既有頁時不開對話框，改在
--      那一頁頂部提示。
--   3. 決定（略過／接受）與簽名：略過之後同一個簽名不再出現；內容明顯變化
--      ＝簽名改變＝可以再提一次。
--
-- `three_checks` 係 DB 層約束：三項缺一項就不存在，而不是「存在但畫面過濾」。
-- 一個存得入但永遠不會顯示的建議，日後一定會有人以為它壞了。

create table brand_page_suggestion (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand (id) on delete cascade,
  /** 內容簽名：agent 由「獨有／重用／放不下」三段證據算出來。改變＝可以再提。 */
  signature text not null,
  /** 建議的頁名（例：天空漸層）。 */
  name text not null,
  /** 建議的 slug（`brand_page.key` 的規則：小寫英數與連字號）。接受時用它開頁。 */
  slug text not null,
  /** 一句 brief，接受時寫入新頁。 */
  brief text not null,
  unique_ok boolean not null,
  repeated_ok boolean not null,
  no_room_ok boolean not null,
  /** 三項判斷的理由，逐項一句。`{ unique: '…', repeated: '…', noRoom: '…' }` */
  reasons jsonb not null default '{}'::jsonb,
  /** 這頁會引用的角色（色彩角色名）。邊界卡用。 */
  refs jsonb not null default '[]'::jsonb,
  /** 其實屬於哪一頁（固定頁鍵或自定義頁 slug）；null＝真的是新系統。 */
  belongs_to text,
  state text not null default 'pending' check (state in ('pending', 'dismissed', 'accepted')),
  created_at timestamptz not null default now(),
  created_by uuid references app_user (id),
  decided_at timestamptz,
  decided_by uuid references app_user (id),
  constraint three_checks check (unique_ok and repeated_ok and no_room_ok)
);

-- 同一個簽名在同一個品牌只可以有一張「等決定」。略過之後那一張留在歷史裡，
-- 所以 partial unique 只蓋 pending。
create unique index brand_page_suggestion_pending
  on brand_page_suggestion (brand_id, signature)
  where state = 'pending';

create index brand_page_suggestion_brand on brand_page_suggestion (brand_id, created_at desc);

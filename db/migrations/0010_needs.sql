-- Needs：agent 做唔到、要交返畀人嘅工作（決策 C12，屬 platform，唔屬任何 app）。
--
-- 為咩要有 code：C07 定咗編號 `COS-<安裝代碼>-###`。人講「COS-HK-014」比講
-- uuid 快，而 uuid 唔應該出現喺畫面。code 由寫入方產生，資料庫只保證唯一。
--
-- 為咩冇 state 欄：C06 講「Need 的狀態與逾期用算的；唯一的手動轉換是驗收」。
-- 所以呢張表只記四個時間戳（認領、交貨、吸收、驗收），狀態係推導出嚟。
-- 好處係「狀態同時間戳唔一致」根本寫唔入去 —— 冇一個欄位可以同另一個打架。
--
--   accepted_at 有   → closed     驗收完，唯一由人按出嚟嘅轉換
--   absorbed_at 有   → absorbed   agent 已經把成果收入素材庫
--   uploaded_at 有   → uploaded   人交咗成果，等 agent 吸收
--   claimed_at 有    → claimed    有人認領，進行中
--   全部 null        → open       等認領
--
-- 逾期唔存起來：due_at 同 now() 一比較就有。存一個 is_overdue 欄位等於要一個
-- 每日跑嘅工作去維護它，而它一定會有一日忘記跑。

create table need (
  id uuid primary key default gen_random_uuid(),
  -- 對人講嘅編號（C07）。格式由資料庫擋，因為呢個字串會出現在電郵同畫面，
  -- 打錯一個字就變成另一個 ID。
  code text not null,
  title text not null,
  detail text,
  -- deliverable：要你交一份成果；decision：agent 做唔到判斷，要你揀。
  kind text not null,
  -- 來源。app_id 對應 manifest 的 id；page_key 是該 app 內的頁面鍵。
  -- 兩者都可以是 null：屬於公司層、未綁任何 app 的工作。
  app_id text,
  page_key text,
  -- 認領人。agent 開立時是 null（等人認領）。
  assignee_id uuid references app_user (id) on delete set null,
  -- 幾時到期。null ＝ 未定，未定就不會逾期，不會靜靜當成「今日到期」。
  due_at timestamptz,
  claimed_at timestamptz,
  uploaded_at timestamptz,
  absorbed_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint need_kind_valid check (kind in ('deliverable', 'decision')),
  constraint need_code_format check (code ~ '^COS-[A-Z0-9]{2,8}-[0-9]{3,6}$'),
  constraint need_title_length check (char_length(title) between 1 and 200),
  constraint need_detail_length check (detail is null or char_length(detail) <= 4000),
  -- 認領同認領時間要一齊有或一齊無。只有一半等於「有人做，但冇人知幾時開始」。
  constraint need_claim_pair check ((assignee_id is null) = (claimed_at is null)),
  -- 吸收之前一定要有東西可吸收。
  constraint need_absorbed_after_upload check (absorbed_at is null or uploaded_at is not null),
  -- 驗收之前一定要有成果。
  constraint need_accepted_after_work check (
    accepted_at is null or uploaded_at is not null or absorbed_at is not null
  )
);

-- 同一個安裝內，編號唯一。
create unique index need_code_idx on need (code);

-- 「未關閉的工作，最快到期先」——Needs 頁同右側欄都用這一條排序。
-- 部分索引：已驗收的列不會再出現在清單，唔需要留在索引裡面。
create index need_open_idx on need (due_at nulls last, created_at desc)
  where accepted_at is null;

-- 右側欄用：按來源頁取該頁的 Needs。
create index need_scope_idx on need (app_id, page_key) where accepted_at is null;

-- 「我負責」用。
create index need_assignee_idx on need (assignee_id) where accepted_at is null;

-- updated_at 由資料庫維護：程式漏寫就會出現「改過但時間冇變」的紀錄。
create function need_touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger need_touch
  before update on need
  for each row
  execute function need_touch_updated_at();

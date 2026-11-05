-- 背景工作隊列（issue #85）。
--
-- 為甚麼用 Postgres 而不用 Redis：整個系統只有一個 Postgres，加一個 Redis 等於
-- 多一份要備份、要監控、會不同步的狀態。隊列需要的三件事（互斥領取、租約、次數）
-- 都做得到，只是要老實寫出來。
--
-- 這一張表是「至少一次執行」：租約過期就代表「不確定跑完未」，所以要重試。
-- 不是 exactly-once，也不假裝是。外部副作用要靠 handler 自己冪等（見 jobs/queue.ts）。
--
-- state 只有四個值，而且每一個都有程式寫入它：
--   pending   enqueue 建立、失敗後退避、租約過期回收
--   running   claim 領取
--   succeeded complete
--   dead      fail 達次數上限、permanent 失敗、租約過期且已達上限
-- 沒有「queued」「cancelled」這種寫不進去的狀態：一個永遠不會出現的值，
-- 讀的人只會以為自己漏了什麼。

create table job (
  id uuid primary key default gen_random_uuid(),
  -- 工作種類。不是表、不是 enum：種類由程式註冊（jobs/registry.ts），
  -- 資料庫只負責「長得像一個名字」。資料庫有值而程式沒有 handler，
  -- 領取條件就不會選中它，它會留在 pending 並出現在診斷查詢裡。
  type text not null,
  payload jsonb not null,
  state text not null default 'pending',
  -- 下次可以領取的時間。失敗退避與「排到將來」都用這一個欄位，不另設狀態。
  run_at timestamptz not null default now(),
  -- 執行次數，在領取時原子加一。崩潰的 worker 一樣會加，所以逃不過上限。
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  lease_token uuid,
  lease_expires_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_summary text,
  -- 只防止重複入隊，不保證外部副作用不重複（見上面）。
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint job_state_valid check (state in ('pending', 'running', 'succeeded', 'dead')),
  constraint job_type_format
    check (char_length(type) <= 100 and type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  -- payload 一定要是物件：入隊介面收的是 JSON 物件，資料庫這一層也不接受陣列或純量。
  constraint job_payload_object check (jsonb_typeof(payload) = 'object'),
  -- 這一條不是業務上限（業務上限在 jobs/schema.ts，64 KiB），而是防止有程式
  -- 繞過介面寫入巨大 blob。刻意比業務上限寬，否則會出現「介面收、資料庫拒」的矛盾。
  constraint job_payload_size check (octet_length(payload::text) <= 262144),
  constraint job_attempts_range check (attempts >= 0 and attempts <= max_attempts),
  constraint job_max_attempts_range check (max_attempts between 1 and 25),
  -- 租約三件事要一齊有或一齊無。只寫一半的租約等於無主的工作：
  -- 回收程序找不到它，新的 worker 又以為有人在跑。
  constraint job_lease_matches_state check (
    (state = 'running') =
      (lease_token is not null and lease_expires_at is not null and locked_by is not null)
  ),
  -- 終態一定要有完成時間，未完成的一定沒有。用「等於」而不是兩個 check，
  -- 這樣兩邊都不可以漏。
  constraint job_completed check (
    (state in ('succeeded', 'dead')) = (completed_at is not null)
  ),
  -- 死掉一定要講得出為什麼：沒有原因的 dead 等於冇辦法處理。
  constraint job_dead_has_error check (state <> 'dead' or last_error_code is not null),
  constraint job_idempotency_key_format check (
    idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9._:-]{1,200}$'
  ),
  constraint job_error_code_format check (
    last_error_code is null
      or (char_length(last_error_code) <= 64 and last_error_code ~ '^[a-z][a-z0-9_]*$')
  ),
  constraint job_error_summary_length check (
    last_error_summary is null or char_length(last_error_summary) <= 200
  ),
  constraint job_locked_by_length check (
    locked_by is null or char_length(locked_by) between 1 and 200
  )
);

-- 同一個 idempotency_key 只有一筆。部分索引：沒有 key 的工作不受影響，
-- 而「有 key 就一定唯一」由資料庫保證，不是靠先查再寫（那樣兩個並發請求都會過）。
create unique index job_idempotency_key_idx
  on job (idempotency_key)
  where idempotency_key is not null;

-- 領取用的索引：只有 pending 才需要掃，而且按到期時間排。
-- 沒有這個索引，每次領取都會掃全表，工作一多就會慢到無法輪詢。
create index job_claim_idx on job (run_at, id) where state = 'pending';

-- 回收租約用：只掃 running。
create index job_lease_idx on job (lease_expires_at) where state = 'running';

-- 內部查詢介面（死掉的工作）用。
create index job_dead_idx on job (completed_at desc, id) where state = 'dead';

-- updated_at 由資料庫維護：程式漏寫就會出現「改過但時間冇變」的紀錄，
-- 而這種紀錄在查「幾時開始跑」時會騙人。
create function job_touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger job_touch
  before update on job
  for each row
  execute function job_touch_updated_at();

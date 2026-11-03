-- 審計紀錄：只准追加。
-- 不變量第 6 條由資料庫 trigger 強制，不靠程式記得。
-- 已套用的 migration 永不修改，只往前加。

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('human', 'agent', 'system')),
  actor_id text not null,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb
);

create index audit_log_at_idx on audit_log (at);
create index audit_log_actor_idx on audit_log (actor_type, actor_id);
create index audit_log_action_idx on audit_log (action);

create function audit_log_reject_change() returns trigger
language plpgsql
as $$
begin
  raise exception '審計紀錄只准追加' using errcode = '42501';
end;
$$;

-- 每列攔 UPDATE 與 DELETE。
create trigger audit_log_no_update_delete
  before update or delete on audit_log
  for each row
  execute function audit_log_reject_change();

-- 每語句攔 TRUNCATE：它不是逐列的，所以一定要另一支 statement 級 trigger。
create trigger audit_log_no_truncate
  before truncate on audit_log
  for each statement
  execute function audit_log_reject_change();

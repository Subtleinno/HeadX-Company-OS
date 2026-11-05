-- 員工與 agent 身份（issue #84）＋授權主體擴充。
--
-- 兩件事刻意同一個 migration：
--   1. 人類帳戶多了「首次登入要改密碼」的旗標。只加欄位，不改舊 migration：
--      舊帳戶一律 false（他們本來就有自己的密碼），只有經 /staff 新建的員工才是 true。
--   2. agent 有自己的身份表，而且成為 app_grant 的另一種主體。
--      一筆授權只可以指向「一個人」或「一個 agent」，兩者互斥 —— 由 check 約束
--      加外鍵在資料庫這一層決定，不是靠程式記得。既有人類授權資料原樣有效。

alter table app_user
  add column must_change_password boolean not null default false;

-- agent 沒有密碼、沒有角色、沒有部門：它的權限只可以來自明確授權。
-- MCP token 的簽發留給 S3-01，所以這張表刻意沒有任何 token 欄位。
create table agent_identity (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references app_user (id),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint agent_identity_name_not_blank check (btrim(name) <> ''),
  constraint agent_identity_name_length check (char_length(name) <= 100)
);

-- 未停用的 agent 名稱唯一：同一個名字指向兩隻不同的 agent，等於冇辦法講清楚
-- 某個授權是給誰。停用的舊名可以重用。
create unique index agent_identity_name_lower_idx
  on agent_identity (lower(name))
  where disabled_at is null;

create index agent_identity_created_by_idx on agent_identity (created_by);

-- 主體由「一定要有 user_id」改為「user_id 或 agent_id，二選一」。
alter table app_grant alter column user_id drop not null;
alter table app_grant add column agent_id uuid references agent_identity (id);

alter table app_grant
  add constraint app_grant_subject_exactly_one
  check (num_nonnulls(user_id, agent_id) = 1);

-- agent 只可以做 member：app_admin 是「代人批准」的權力，
-- 而 agent 不可以申請或批准授權（issue 第 3 節），所以這個角色對它沒有意義。
alter table app_grant
  add constraint app_grant_agent_member_only
  check (agent_id is null or role = 'member');

-- 原本的兩個唯一索引以 user_id 為主體；agent 的 user_id 是 null，
-- null 在唯一索引裡互不相等，所以沿用舊索引等於對 agent 完全沒有約束。
-- 改成按主體種類分開，兩邊都守得住。
drop index app_grant_one_active_idx;
drop index app_grant_inflight_idx;

create unique index app_grant_one_active_user_idx
  on app_grant (user_id, app_id)
  where state = 'active' and user_id is not null;

create unique index app_grant_one_active_agent_idx
  on app_grant (agent_id, app_id)
  where state = 'active' and agent_id is not null;

create unique index app_grant_inflight_user_idx
  on app_grant (user_id, app_id, role, scope_kind, scope_unit_ids)
  where state in ('requested', 'approved') and user_id is not null;

create unique index app_grant_inflight_agent_idx
  on app_grant (agent_id, app_id, role, scope_kind, scope_unit_ids)
  where state in ('requested', 'approved') and agent_id is not null;

create index app_grant_agent_idx on app_grant (agent_id, state);

-- 守門 trigger 換新版：除了加入 agent_id 的不可變檢查，還把 user_id 的比較
-- 改成 `is distinct from`。舊版用 `<>`，而 null <> 任何值 的結果是 null（不是 true），
-- 所以把 user_id 由 null 改成某人（或反向）本來不會被擋 —— agent 出現之後
-- 那條路就真的存在了。
create or replace function app_grant_guard() returns trigger
language plpgsql
as $$
declare
  canonical uuid[];
begin
  select coalesce(array_agg(unit_id order by unit_id), '{}'::uuid[])
    into canonical
    from (select distinct unnest(new.scope_unit_ids) as unit_id) s;

  if new.scope_unit_ids <> canonical then
    raise exception 'scope_unit_ids 必須排序、去重（收到 %）', new.scope_unit_ids
      using errcode = '23514', constraint = 'app_grant_scope_canonical';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if old.state in ('rejected', 'revoked') then
    raise exception '授權已結束（%），不可以再修改', old.state
      using errcode = '23514', constraint = 'app_grant_terminal_state';
  end if;

  if new.user_id is distinct from old.user_id
     or new.agent_id is distinct from old.agent_id
     or new.app_id <> old.app_id
     or new.role <> old.role
     or new.scope_kind <> old.scope_kind
     or new.scope_unit_ids <> old.scope_unit_ids
     or new.requested_by <> old.requested_by
     or new.requested_at <> old.requested_at
     or new.replaces_id is distinct from old.replaces_id then
    raise exception '授權的身分、app、角色、範圍與來源不可以原地修改：要改就開新一列'
      using errcode = '23514', constraint = 'app_grant_immutable_fields';
  end if;

  if new.state <> old.state then
    if not (
      (old.state = 'requested' and new.state in ('approved', 'rejected', 'revoked'))
      or (old.state = 'approved' and new.state in ('active', 'rejected', 'revoked'))
      or (old.state = 'active' and new.state = 'revoked')
    ) then
      raise exception '不合法的狀態轉換：% → %', old.state, new.state
        using errcode = '23514', constraint = 'app_grant_illegal_transition';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- app 授權（issue #83／不變量 7、13）。
--
-- app 定義的唯一來源是 apps/<id>/manifest.json，所以 app_id 只做格式檢查，沒有外鍵 ——
-- 有外鍵就要有一張抄 manifest 的表，那張表總有一天會與磁碟上的清單不一致。
-- 註冊不等於啟用：app_registry 這張表刻意不存在，啟用由 manifest 與部署決定。
--
-- 一列 = 一個版本。role 與 scope 插入之後**不可以原地修改**：要擴範圍、要升角色，
-- 一律開新一列（新的 requested 版本），舊的那一列在新版本生效前保持原範圍。
-- 這樣「不得原地擴權」（規則 5）不是靠誰記得，而是根本改不到。
-- 縮範圍與撤銷也開新一列／轉狀態，歷史因此完整保留，不需要硬刪任何資料。

create table app_grant (
  id uuid primary key default gen_random_uuid(),
  -- 受益人。本張只處理現有的人類帳戶；agent 與夥伴的帳戶是後續 issue。
  user_id uuid not null references app_user (id),
  app_id text not null check (app_id ~ '^[a-z][a-z0-9_]{0,63}$'),
  role text not null check (role in ('member', 'app_admin')),
  -- #82 的三種範圍。**不用 null 代表全部**：all 一定要明寫，否則「忘了填」與
  -- 「全公司」在資料裡長得一樣，而這兩件事的安全含義剛好相反。
  scope_kind text not null check (scope_kind in ('all', 'units', 'subtree')),
  scope_unit_ids uuid[] not null default '{}',
  state text not null check (state in ('requested', 'approved', 'active', 'rejected', 'revoked')),
  requested_by uuid not null references app_user (id),
  approved_by uuid references app_user (id),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  rejection_reason text
    check (rejection_reason is null or char_length(rejection_reason) between 1 and 200),
  -- 這一列取代了哪一列（擴範圍／縮範圍時的上一版）。
  replaces_id uuid references app_grant (id),
  -- 並發控制：客戶端拿舊版本號來改，就會被擋掉，不會蓋掉別人的決定。
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- all 不可以夾帶單位；units／subtree 一定要有至少一個單位。
  constraint app_grant_scope_all_empty check (scope_kind <> 'all' or cardinality(scope_unit_ids) = 0),
  constraint app_grant_scope_units_nonempty check (scope_kind = 'all' or cardinality(scope_unit_ids) > 0),

  -- 每個狀態必須有的時間與人。狀態與欄位不一致的列沒有辦法解讀，直接寫不進去。
  constraint app_grant_approved_fields
    check (state in ('requested', 'rejected', 'revoked') or (approved_by is not null and approved_at is not null)),
  constraint app_grant_active_fields check (state <> 'active' or activated_at is not null),
  constraint app_grant_revoked_fields check (state <> 'revoked' or revoked_at is not null),
  constraint app_grant_rejected_fields check (state <> 'rejected' or rejection_reason is not null),
  constraint app_grant_no_self_replace check (replaces_id is null or replaces_id <> id)
);

-- 同一個人、同一個 app，最多一個生效授權（不是每個角色一個）。
-- 原因：#82 的存取判斷會拿「對得上的那一筆」授權的範圍來決定他可以看哪些單位；
-- 如果同一個人有兩筆生效授權，拿哪一筆就變成看資料庫回來的次序 —— 同一個請求
-- 可以有兩個答案。範圍不同就要換版本，不是並存。
create unique index app_grant_one_active_idx
  on app_grant (user_id, app_id)
  where state = 'active';

-- 相同的角色與範圍不可以同時有兩個「未完成」的版本（重送不會產生重複）。
create unique index app_grant_inflight_idx
  on app_grant (user_id, app_id, role, scope_kind, scope_unit_ids)
  where state in ('requested', 'approved');

create index app_grant_app_idx on app_grant (app_id, state);
create index app_grant_user_idx on app_grant (user_id, state);
create index app_grant_requested_by_idx on app_grant (requested_by);

-- 授權列不可原地改範圍與角色，狀態轉換也要合法 —— 在資料庫這一層擋。
-- 程式仍然會先判斷並回一個講得清楚的 409，但權威在資料庫：兩條路徑同時改同一列時，
-- 「先查再寫」之間一定有窗口，只有這裡守得住。
create function app_grant_guard() returns trigger
language plpgsql
as $$
declare
  canonical uuid[];
begin
  -- 範圍一律以「排序、去重」的形式入庫。否則同一個集合可以寫成兩種次序，
  -- 上面那個唯一索引就擋不住重複。
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

  -- 已拒絕與已撤銷是終點：歷史只可以讀，不可以復活。
  if old.state in ('rejected', 'revoked') then
    raise exception '授權已結束（%），不可以再修改', old.state
      using errcode = '23514', constraint = 'app_grant_terminal_state';
  end if;

  if new.user_id <> old.user_id
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

create trigger app_grant_guard
  before insert or update on app_grant
  for each row execute function app_grant_guard();

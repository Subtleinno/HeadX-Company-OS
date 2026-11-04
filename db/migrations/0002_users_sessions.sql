-- 使用者與登入 session。
-- 不變量：Company OS 只有老闆一個人用，第一個註冊的人成為老闆，之後永久鎖門。
-- 「只有一個老闆」由部分唯一索引強制，不靠程式記得。

create table app_user (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  role text not null check (role in ('owner', 'staff')),
  department text,
  password_hash text not null,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  -- 老闆不屬於任何部門，員工才需要。
  constraint app_user_owner_department_none check (role <> 'owner' or department is null)
);

-- email 一律以正規化（小寫）後儲存，唯一性也以 lower(email) 判斷。
create unique index app_user_email_lower_idx on app_user (lower(email));

-- 全公司只有一個老闆：role = 'owner' 的列最多一列。
create unique index app_user_single_owner on app_user (role) where role = 'owner';

-- session 只存 token 的 SHA-256，token 本身只在 Set-Cookie 出現一次。
create table auth_session (
  token_hash text primary key,
  user_id uuid not null references app_user (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index auth_session_user_idx on auth_session (user_id);

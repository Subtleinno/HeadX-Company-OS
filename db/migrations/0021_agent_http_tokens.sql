-- 外部 agent 的 request-scoped HTTP 憑證（Project／Brief）。
--
-- 明文只會在簽發回應出現一次；這裡只保存 SHA-256。token 不是 session，
-- 每次請求都會重新查 agent 是否停用、token 是否撤銷／到期及 app_grant 是否有效。

create table agent_http_token (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agent_identity (id),
  token_hash text not null unique,
  created_by uuid not null references app_user (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,

  constraint agent_http_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint agent_http_token_expiry_valid check (expires_at > created_at),
  constraint agent_http_token_revoke_valid check (revoked_at is null or revoked_at >= created_at)
);

create index agent_http_token_agent_idx on agent_http_token (agent_id, created_at desc);
create index agent_http_token_lookup_idx on agent_http_token (token_hash)
  where revoked_at is null;

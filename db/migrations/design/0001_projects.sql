-- Marketing Design：Project、不可變原始要求、agent run 與 Brief 版本。
--
-- Project 沒有可任意寫入的 status。畫面狀態由 request、run、Brief 及日後
-- Needs／Composition／Render／Output 等事實推導。

create table project (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brand (id),
  title text not null,
  created_by uuid not null references public.app_user (id),
  created_at timestamptz not null default now(),
  idempotency_key text not null,
  idempotency_hash text not null,

  constraint project_title_length check (char_length(title) between 1 and 120),
  constraint project_idempotency_key_length check (char_length(idempotency_key) between 1 and 100),
  constraint project_idempotency_hash_format check (idempotency_hash ~ '^[0-9a-f]{64}$'),
  constraint project_idempotency_unique unique (created_by, idempotency_key)
);

create index project_list_idx on project (created_at desc, id desc);
create index project_brand_idx on project (brand_id, created_at desc);

create table project_request (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references project (id),
  body text not null,
  created_by uuid not null references public.app_user (id),
  created_at timestamptz not null default now(),

  constraint project_request_body_length check (char_length(body) between 1 and 20000)
);

create table agent_run (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project (id),
  agent_id uuid not null references public.agent_identity (id),
  token_id uuid not null references public.agent_http_token (id),
  request_id text not null,
  idempotency_key text not null,
  idempotency_hash text not null,
  claimed_at timestamptz not null default now(),

  constraint agent_run_request_id_length check (char_length(request_id) between 1 and 100),
  constraint agent_run_idempotency_key_length check (char_length(idempotency_key) between 1 and 100),
  constraint agent_run_idempotency_hash_format check (idempotency_hash ~ '^[0-9a-f]{64}$'),
  constraint agent_run_idempotency_unique unique (agent_id, idempotency_key)
);

create index agent_run_project_idx on agent_run (project_id, claimed_at desc);

create table brief_version (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project (id),
  run_id uuid not null references agent_run (id),
  version_no integer not null,
  document jsonb not null,
  note text,
  source_request_id uuid not null references project_request (id),
  based_on_brief_version_id uuid references brief_version (id),
  created_by_agent uuid not null references public.agent_identity (id),
  token_id uuid not null references public.agent_http_token (id),
  request_id text not null,
  idempotency_key text not null,
  idempotency_hash text not null,
  created_at timestamptz not null default now(),

  constraint brief_version_no_positive check (version_no > 0),
  constraint brief_version_unique_no unique (project_id, version_no),
  constraint brief_version_document_object check (jsonb_typeof(document) = 'object'),
  constraint brief_version_note_length check (note is null or char_length(note) between 1 and 200),
  constraint brief_version_request_id_length check (char_length(request_id) between 1 and 100),
  constraint brief_version_idempotency_key_length check (char_length(idempotency_key) between 1 and 100),
  constraint brief_version_idempotency_hash_format check (idempotency_hash ~ '^[0-9a-f]{64}$'),
  constraint brief_version_idempotency_unique unique (created_by_agent, idempotency_key)
);

create index brief_version_project_idx on brief_version (project_id, version_no desc);

-- 原始要求、接手事實與 Brief 版本都只追加。撤銷 token 不會改寫這些歷史。
create function reject_project_history_rewrite() returns trigger
language plpgsql
as $$
begin
  raise exception 'Project 原始要求、agent run 與 Brief 版本只准追加' using errcode = '42501';
end;
$$;

create trigger project_request_append_only
  before update or delete on project_request
  for each row execute function reject_project_history_rewrite();

create trigger agent_run_append_only
  before update or delete on agent_run
  for each row execute function reject_project_history_rewrite();

create trigger brief_version_append_only
  before update or delete on brief_version
  for each row execute function reject_project_history_rewrite();

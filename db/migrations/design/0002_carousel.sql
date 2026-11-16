-- IG Carousel：相片素材、知識版本、組稿、HyperFrames 工作與可下載成品。

-- Project Library 以格式分資料夾；Carousel 是第一個完整輸出，其他格式沿用同一工作骨架。
alter table project add column format text not null default 'carousel';
alter table project add constraint project_format_valid check (format in ('carousel', 'presentation', 'video'));

create table material (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brand (id),
  name text not null,
  original_key text not null unique,
  preview_key text not null unique,
  content_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  width integer not null,
  height integer not null,
  source text not null default 'human_shot',
  description text not null default '',
  tags text[] not null default '{}',
  created_by uuid not null references public.app_user (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint material_name_length check (char_length(name) between 1 and 200),
  constraint material_dimensions_positive check (width > 0 and height > 0),
  constraint material_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint material_source_valid check (source in ('human_shot', 'ai_generated', 'stock', 'client_provided'))
);
create index material_brand_idx on material (brand_id, created_at desc) where deleted_at is null;
create unique index material_brand_sha_live on material (brand_id, sha256) where deleted_at is null;

create table knowledge_doc (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brand (id),
  title text not null,
  status text not null default 'unverified',
  created_by uuid not null references public.app_user (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_doc_title_length check (char_length(title) between 1 and 240),
  constraint knowledge_doc_status_valid check (status in ('unverified', 'verified', 'outdated'))
);
create index knowledge_doc_brand_idx on knowledge_doc (brand_id, updated_at desc);

create table knowledge_version (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references knowledge_doc (id),
  version_no integer not null,
  summary text not null,
  body_md text not null,
  sources jsonb not null default '[]',
  jurisdiction text[] not null default '{}',
  review_by date,
  created_by uuid references public.app_user (id),
  created_by_agent uuid references public.agent_identity (id),
  request_id text not null,
  created_at timestamptz not null default now(),
  constraint knowledge_version_no_positive check (version_no > 0),
  constraint knowledge_version_unique_no unique (doc_id, version_no),
  constraint knowledge_version_actor check (created_by is not null or created_by_agent is not null)
);
create index knowledge_version_doc_idx on knowledge_version (doc_id, version_no desc);

create table knowledge_chunk (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references knowledge_version (id),
  heading text not null,
  body text not null,
  ordinal integer not null,
  constraint knowledge_chunk_unique_order unique (version_id, ordinal)
);
create index knowledge_chunk_version_idx on knowledge_chunk (version_id, ordinal);

create table composition (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project (id),
  version_no integer not null,
  based_on_id uuid references composition (id),
  brief_version_id uuid references brief_version (id),
  brand_release_id uuid references public.brand_release (id),
  slides jsonb not null,
  source_refs jsonb not null,
  lint jsonb not null default '[]',
  actor_type text not null,
  actor_id text not null,
  request_id text not null,
  idempotency_key text not null,
  idempotency_hash text not null,
  created_at timestamptz not null default now(),
  constraint composition_version_unique unique (project_id, version_no),
  constraint composition_version_positive check (version_no > 0),
  constraint composition_slides_array check (jsonb_typeof(slides) = 'array'),
  constraint composition_actor_valid check (actor_type in ('human', 'agent')),
  constraint composition_idempotency_unique unique (actor_id, idempotency_key)
);
create index composition_project_idx on composition (project_id, version_no desc);

create table render_job (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project (id),
  composition_id uuid not null references composition (id),
  profile text not null default 'carousel-png',
  renderer text not null default 'hyperframes',
  renderer_version text,
  status text not null,
  error text,
  actor_type text not null,
  actor_id text not null,
  request_id text not null,
  idempotency_key text not null,
  idempotency_hash text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint render_job_status_valid check (status in ('queued', 'running', 'done', 'failed')),
  constraint render_job_profile_valid check (profile = 'carousel-png'),
  constraint render_job_actor_valid check (actor_type in ('human', 'agent')),
  constraint render_job_idempotency_unique unique (actor_id, idempotency_key)
);
create index render_job_project_idx on render_job (project_id, created_at desc);

create table output (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project (id),
  composition_id uuid not null references composition (id),
  render_job_id uuid not null unique references render_job (id),
  profile text not null default 'carousel-png',
  created_at timestamptz not null default now(),
  constraint output_profile_valid check (profile = 'carousel-png')
);
create index output_project_idx on output (project_id, created_at desc);

create table output_file (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references output (id),
  name text not null,
  kind text not null,
  storage_key text not null unique,
  content_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  width integer,
  height integer,
  ordinal integer,
  constraint output_file_kind_valid check (kind in ('page', 'archive')),
  constraint output_file_sha256_format check (sha256 ~ '^[0-9a-f]{64}$')
);
create index output_file_output_idx on output_file (output_id, ordinal);

create table provenance (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references output (id),
  kind text not null,
  object_id text not null,
  version text not null,
  detail jsonb not null default '{}',
  constraint provenance_kind_valid check (kind in ('brand', 'knowledge', 'material', 'template', 'brief'))
);
create index provenance_output_idx on provenance (output_id);
create index provenance_object_idx on provenance (kind, object_id);

-- 內容與輸出歷史只追加；狀態機列（knowledge_doc.status、render_job）例外。
create function reject_carousel_history_rewrite() returns trigger
language plpgsql
as $$
begin
  raise exception 'Carousel 版本、成品與來源紀錄只准追加' using errcode = '42501';
end;
$$;

create trigger knowledge_version_append_only before update or delete on knowledge_version
  for each row execute function reject_carousel_history_rewrite();
create trigger knowledge_chunk_append_only before update or delete on knowledge_chunk
  for each row execute function reject_carousel_history_rewrite();
create trigger composition_append_only before update or delete on composition
  for each row execute function reject_carousel_history_rewrite();
create trigger output_append_only before update or delete on output
  for each row execute function reject_carousel_history_rewrite();
create trigger output_file_append_only before update or delete on output_file
  for each row execute function reject_carousel_history_rewrite();
create trigger provenance_append_only before update or delete on provenance
  for each row execute function reject_carousel_history_rewrite();

-- GuardianOS governed Amazon Bedrock invocation console
-- Additive, idempotent production migration.

create table if not exists public.rg_bedrock_invocation_runs (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  org_id text not null,
  environment_id text not null,
  connector_id text not null,
  connector_name text,
  connector_health text,
  model_id text not null,
  batch_id text not null,
  batch_mode text not null default 'single',
  batch_index integer not null default 0,
  requested_count integer not null default 1,
  concurrency integer not null default 1,
  idempotency_key text not null,
  status text not null default 'preparing',
  lifecycle_state text not null default 'preparing_request',
  actor text,
  prompt_hash text not null,
  prompt_content text,
  system_instruction text,
  max_output_tokens integer not null default 512,
  request_payload jsonb not null default '{}'::jsonb,
  proposal_id text,
  governance_decision text,
  approval_status text,
  evidence_id text,
  evidence_count integer not null default 0,
  provider_invocation_count integer not null default 0,
  aws_called boolean not null default false,
  response_content jsonb,
  response_hash text,
  safe_failure_reason text,
  total_latency_ms integer,
  governance_latency_ms integer,
  provider_latency_ms integer,
  execution_started_at timestamptz,
  completed_at timestamptz
);

-- Upgrade an already-created preview table safely.
alter table public.rg_bedrock_invocation_runs add column if not exists updated_at timestamptz not null default now();
alter table public.rg_bedrock_invocation_runs add column if not exists approval_status text;
alter table public.rg_bedrock_invocation_runs add column if not exists provider_invocation_count integer not null default 0;
alter table public.rg_bedrock_invocation_runs add column if not exists aws_called boolean not null default false;
alter table public.rg_bedrock_invocation_runs add column if not exists execution_started_at timestamptz;
alter table public.rg_bedrock_invocation_runs add column if not exists completed_at timestamptz;

alter table public.rg_bedrock_invocation_runs drop constraint if exists rg_bedrock_invocation_runs_status_check;
alter table public.rg_bedrock_invocation_runs add constraint rg_bedrock_invocation_runs_status_check
  check (status in ('preparing','evaluating','executing','awaiting_approval','completed','blocked','rejected','failed','expired','cancelled')) not valid;
alter table public.rg_bedrock_invocation_runs validate constraint rg_bedrock_invocation_runs_status_check;
alter table public.rg_bedrock_invocation_runs drop constraint if exists rg_bedrock_invocation_runs_batch_mode_check;
alter table public.rg_bedrock_invocation_runs add constraint rg_bedrock_invocation_runs_batch_mode_check
  check (batch_mode in ('single','sequential','concurrent')) not valid;
alter table public.rg_bedrock_invocation_runs validate constraint rg_bedrock_invocation_runs_batch_mode_check;
alter table public.rg_bedrock_invocation_runs drop constraint if exists rg_bedrock_invocation_runs_count_check;
alter table public.rg_bedrock_invocation_runs add constraint rg_bedrock_invocation_runs_count_check
  check (requested_count between 1 and 10) not valid;
alter table public.rg_bedrock_invocation_runs validate constraint rg_bedrock_invocation_runs_count_check;
alter table public.rg_bedrock_invocation_runs drop constraint if exists rg_bedrock_invocation_runs_concurrency_check;
alter table public.rg_bedrock_invocation_runs add constraint rg_bedrock_invocation_runs_concurrency_check
  check (concurrency between 1 and 3) not valid;
alter table public.rg_bedrock_invocation_runs validate constraint rg_bedrock_invocation_runs_concurrency_check;
alter table public.rg_bedrock_invocation_runs drop constraint if exists rg_bedrock_invocation_runs_provider_count_check;
alter table public.rg_bedrock_invocation_runs add constraint rg_bedrock_invocation_runs_provider_count_check
  check (provider_invocation_count between 0 and 1) not valid;
alter table public.rg_bedrock_invocation_runs validate constraint rg_bedrock_invocation_runs_provider_count_check;

create unique index if not exists rg_bedrock_invocation_runs_org_idempotency_uq
  on public.rg_bedrock_invocation_runs (org_id, idempotency_key);
create index if not exists rg_bedrock_invocation_runs_org_env_created_idx
  on public.rg_bedrock_invocation_runs (org_id, environment_id, created_at desc);
create index if not exists rg_bedrock_invocation_runs_batch_idx
  on public.rg_bedrock_invocation_runs (org_id, batch_id, batch_index);
create index if not exists rg_bedrock_invocation_runs_proposal_idx
  on public.rg_bedrock_invocation_runs (proposal_id) where proposal_id is not null;

create table if not exists public.rg_bedrock_invocation_locks (
  id text primary key,
  created_at timestamptz not null default now(),
  org_id text not null,
  environment_id text not null,
  run_id text not null,
  idempotency_key text not null,
  acquisition_token text,
  acquired_at timestamptz not null default now()
);

alter table public.rg_bedrock_invocation_locks add column if not exists acquisition_token text;
create unique index if not exists rg_bedrock_invocation_locks_run_uq
  on public.rg_bedrock_invocation_locks (run_id);
create unique index if not exists rg_bedrock_invocation_locks_idempotency_uq
  on public.rg_bedrock_invocation_locks (org_id, idempotency_key);
create index if not exists rg_bedrock_invocation_locks_org_env_idx
  on public.rg_bedrock_invocation_locks (org_id, environment_id, acquired_at desc);

alter table public.rg_bedrock_invocation_runs enable row level security;
alter table public.rg_bedrock_invocation_locks enable row level security;

-- GuardianOS server routes use the service role. RLS remains enabled so browser
-- and anon clients cannot read or mutate invocation state directly.
revoke all on public.rg_bedrock_invocation_runs from anon, authenticated;
revoke all on public.rg_bedrock_invocation_locks from anon, authenticated;
grant all on public.rg_bedrock_invocation_runs to service_role;
grant all on public.rg_bedrock_invocation_locks to service_role;

comment on table public.rg_bedrock_invocation_runs is
  'Durable organisation/environment-scoped state for governed Amazon Bedrock invocation console runs.';
comment on table public.rg_bedrock_invocation_locks is
  'Database-enforced at-most-once execution locks for governed Bedrock invocation runs.';

notify pgrst, 'reload schema';

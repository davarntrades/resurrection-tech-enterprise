-- GuardianOS Customer Support Assistant governed enterprise workflow
-- Additive, idempotent and service-role only.

create table if not exists public.rg_customer_support_workflow_runs (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  org_id text not null,
  environment_id text not null,
  workflow text not null,
  source_type text not null,
  source_external_id text,
  customer_name text not null,
  customer_email_hash text not null,
  customer_organisation text not null,
  request_category text not null,
  priority text not null,
  message text not null,
  canonical_action jsonb not null,
  canonical_action_hash text not null,
  connector_id text not null,
  connector_name text,
  provider text not null,
  model_id text not null,
  idempotency_key text not null,
  status text not null,
  lifecycle_state text not null,
  proposal_id text,
  provider_proposal_id text,
  governance_decision text,
  approval_status text,
  bedrock_run_id text,
  bedrock_batch_id text,
  provider_invocation_count integer not null default 0,
  aws_called boolean not null default false,
  response_content jsonb,
  response_hash text,
  safe_failure_reason text,
  total_latency_ms integer,
  governance_latency_ms integer,
  provider_latency_ms integer,
  approval_wait_latency_ms integer,
  governance_started_at timestamptz,
  governance_completed_at timestamptz,
  execution_started_at timestamptz,
  completed_at timestamptz,
  evidence_id text,
  underlying_evidence_id text,
  evidence_count integer not null default 0,
  workflow_evidence_recorded boolean not null default false
);

alter table public.rg_customer_support_workflow_runs add column if not exists provider_proposal_id text;

create table if not exists public.rg_customer_support_workflow_locks (
  id text primary key,
  created_at timestamptz not null default now(),
  org_id text not null,
  environment_id text not null,
  workflow_run_id text not null,
  idempotency_key text not null,
  acquired_at timestamptz not null default now()
);

create unique index if not exists rg_customer_support_workflow_runs_org_idempotency_uq
  on public.rg_customer_support_workflow_runs (org_id, idempotency_key);
create index if not exists rg_customer_support_workflow_runs_org_env_created_idx
  on public.rg_customer_support_workflow_runs (org_id, environment_id, created_at desc);
create index if not exists rg_customer_support_workflow_runs_proposal_idx
  on public.rg_customer_support_workflow_runs (proposal_id) where proposal_id is not null;
create index if not exists rg_customer_support_workflow_runs_provider_proposal_idx
  on public.rg_customer_support_workflow_runs (provider_proposal_id) where provider_proposal_id is not null;
create unique index if not exists rg_customer_support_workflow_locks_run_uq
  on public.rg_customer_support_workflow_locks (workflow_run_id);
create unique index if not exists rg_customer_support_workflow_locks_idempotency_uq
  on public.rg_customer_support_workflow_locks (org_id, idempotency_key);

alter table public.rg_customer_support_workflow_runs enable row level security;
alter table public.rg_customer_support_workflow_locks enable row level security;
revoke all on public.rg_customer_support_workflow_runs from anon, authenticated;
revoke all on public.rg_customer_support_workflow_locks from anon, authenticated;
grant all on public.rg_customer_support_workflow_runs to service_role;
grant all on public.rg_customer_support_workflow_locks to service_role;

comment on table public.rg_customer_support_workflow_runs is 'Organisation/environment-scoped state for the governed Customer Support Assistant enterprise workflow.';
comment on table public.rg_customer_support_workflow_locks is 'At-most-once execution locks for governed Customer Support Assistant workflow runs.';
notify pgrst, 'reload schema';

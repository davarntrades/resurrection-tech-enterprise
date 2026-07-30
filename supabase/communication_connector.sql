-- GuardianOS governed communication connector (Integration Gateway).
-- Channel-neutral run state for canonical communication actions; Gmail is the
-- first adapter. Additive, idempotent and service-role only.

create table if not exists public.rg_communication_runs (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  org_id text not null,
  environment_id text not null,
  channel text not null,
  provider text not null,
  adapter text not null,
  action_id text not null,
  operation text not null,
  delivers boolean not null default false,
  connector_id text not null,
  connector_name text,
  canonical_action jsonb not null,
  canonical_action_hash text not null,
  message_hash text not null,
  -- Retained so an ESCALATED action can still be sent after approval. Never
  -- projected to an API response and never copied into governance evidence.
  message_payload jsonb not null,
  recipient_count integer not null default 0,
  subject text,
  thread_id text,
  actor text,
  idempotency_key text not null,
  status text not null,
  lifecycle_state text not null,
  proposal_id text,
  governance_decision text,
  governance_verdict text,
  governance_policy text,
  governance_rule text,
  approval_status text,
  provider_invocation_count integer not null default 0,
  provider_called boolean not null default false,
  delivered boolean not null default false,
  message_id text,
  thread_id_result text,
  draft_id text,
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
  evidence_count integer not null default 0
);

create table if not exists public.rg_communication_run_locks (
  id text primary key,
  created_at timestamptz not null default now(),
  org_id text not null,
  environment_id text not null,
  communication_run_id text not null,
  idempotency_key text not null,
  acquired_at timestamptz not null default now()
);

create unique index if not exists rg_communication_runs_org_idempotency_uq
  on public.rg_communication_runs (org_id, idempotency_key);
create index if not exists rg_communication_runs_org_env_created_idx
  on public.rg_communication_runs (org_id, environment_id, created_at desc);
create index if not exists rg_communication_runs_proposal_idx
  on public.rg_communication_runs (proposal_id) where proposal_id is not null;
create index if not exists rg_communication_runs_connector_idx
  on public.rg_communication_runs (connector_id);
-- At-most-once execution: the lock row, not a flag, is what makes a second
-- provider call impossible under concurrency or re-polling.
create unique index if not exists rg_communication_run_locks_run_uq
  on public.rg_communication_run_locks (communication_run_id);
create unique index if not exists rg_communication_run_locks_idempotency_uq
  on public.rg_communication_run_locks (org_id, idempotency_key);

alter table public.rg_communication_runs enable row level security;
alter table public.rg_communication_run_locks enable row level security;
revoke all on public.rg_communication_runs from anon, authenticated;
revoke all on public.rg_communication_run_locks from anon, authenticated;
grant all on public.rg_communication_runs to service_role;
grant all on public.rg_communication_run_locks to service_role;

comment on table public.rg_communication_runs is 'Organisation/environment-scoped state for governed communication actions (Gmail first adapter) through the Integration Gateway.';
comment on table public.rg_communication_run_locks is 'At-most-once execution locks for governed communication runs.';
notify pgrst, 'reload schema';

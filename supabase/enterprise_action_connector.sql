-- GuardianOS governed Salesforce + ServiceNow action state.
-- Additive, idempotent, organisation/environment scoped, service-role only.

create table if not exists public.rg_enterprise_action_runs (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  org_id text not null,
  environment_id text not null,
  provider text not null,
  adapter text not null,
  connector_id text not null,
  connector_name text,
  action_id text not null,
  operation text not null,
  reads boolean not null default false,
  mutates boolean not null default false,
  canonical_action jsonb not null,
  canonical_action_hash text not null,
  payload_hash text not null,
  -- Needed only for approval continuation. Never projected or evidenced.
  input_payload jsonb not null,
  target_type text,
  target_record_id text,
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
  external_record_id text,
  record_count integer,
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

create table if not exists public.rg_enterprise_action_run_locks (
  id text primary key,
  created_at timestamptz not null default now(),
  org_id text not null,
  environment_id text not null,
  enterprise_action_run_id text not null,
  idempotency_key text not null,
  acquired_at timestamptz not null default now()
);

create unique index if not exists rg_enterprise_action_runs_org_idempotency_uq
  on public.rg_enterprise_action_runs (org_id, idempotency_key);
create index if not exists rg_enterprise_action_runs_org_env_created_idx
  on public.rg_enterprise_action_runs (org_id, environment_id, created_at desc);
create index if not exists rg_enterprise_action_runs_proposal_idx
  on public.rg_enterprise_action_runs (proposal_id) where proposal_id is not null;
create index if not exists rg_enterprise_action_runs_connector_idx
  on public.rg_enterprise_action_runs (connector_id);
create unique index if not exists rg_enterprise_action_run_locks_run_uq
  on public.rg_enterprise_action_run_locks (enterprise_action_run_id);
create unique index if not exists rg_enterprise_action_run_locks_idempotency_uq
  on public.rg_enterprise_action_run_locks (org_id, idempotency_key);

alter table public.rg_enterprise_action_runs enable row level security;
alter table public.rg_enterprise_action_run_locks enable row level security;
revoke all on public.rg_enterprise_action_runs from anon, authenticated;
revoke all on public.rg_enterprise_action_run_locks from anon, authenticated;
grant all on public.rg_enterprise_action_runs to service_role;
grant all on public.rg_enterprise_action_run_locks to service_role;

comment on table public.rg_enterprise_action_runs is 'Organisation/environment-scoped governed Salesforce and ServiceNow action lifecycle.';
comment on table public.rg_enterprise_action_run_locks is 'At-most-once provider locks for governed enterprise record mutations.';
notify pgrst, 'reload schema';

-- Universal Governed Execution — additive evidence projection.
-- Apply after governance_runtime.sql. Existing runtime tables/contracts are unchanged.

create table if not exists public.rg_execution_records (
  id text primary key,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  evidence_version integer not null default 1,
  org_id text not null,
  environment_id text,
  session_id text,
  scenario_id text,
  experiment_role text,
  deterministic_reset boolean not null default false,
  reset_evidence_hash text,
  reset_evidence_verified boolean not null default false,
  trajectory_hash text,
  morrison_decision_id text,
  verdict text not null check (verdict in ('ALLOW', 'BLOCK', 'ESCALATE', 'NOT_EVALUATED')),
  rule text,
  omega_domain text,
  adapter_id text not null,
  adapter_name text,
  adapter_version text,
  adapter_capabilities jsonb not null default '{}'::jsonb,
  safety_claim_readiness jsonb not null default '{}'::jsonb,
  execution_target jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  request_id text,
  idempotency_key text,
  mode text,
  authorization_result text not null,
  execution_status text not null check (execution_status in ('authorized','executed','blocked_before_execution','escalated','execution_failed','state_unknown')),
  execution_attempted boolean not null default false,
  executed boolean,
  execution_success boolean,
  execution_error jsonb,
  execution_receipt jsonb,
  state_before_hash text,
  state_before jsonb,
  state_before_error jsonb,
  state_after_hash text,
  state_after jsonb,
  state_after_error jsonb,
  state_delta jsonb,
  external_state_changed boolean,
  state_observability text,
  evidence_hash text,
  evidence_verified boolean not null default false
);

create index if not exists rg_execution_records_org_created_idx on public.rg_execution_records (org_id, created_at desc);
create index if not exists rg_execution_records_decision_idx on public.rg_execution_records (morrison_decision_id);
create index if not exists rg_execution_records_correlation_idx on public.rg_execution_records (correlation_id);
create unique index if not exists rg_execution_records_idempotency_idx
  on public.rg_execution_records (org_id, adapter_id, idempotency_key)
  where idempotency_key is not null;

alter table public.rg_execution_records enable row level security;
revoke all on public.rg_execution_records from anon, authenticated;
grant all on public.rg_execution_records to service_role;

comment on table public.rg_execution_records is 'Execution evidence linked to an existing Morrison decision; never an independent authorization source.';

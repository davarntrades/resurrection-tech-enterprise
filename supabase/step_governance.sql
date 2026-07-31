-- GuardianOS step-level Runtime Governance.
-- Governed sessions (one workflow run) and their ordered governed steps.
-- Additive, idempotent and service-role only.

create table if not exists public.rg_governed_sessions (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  org_id text not null,
  environment_id text not null,
  workflow text not null,
  actor text,
  correlation_id text,
  domains jsonb not null default '[]'::jsonb,
  horizon integer not null default 3,
  -- The accumulated trajectory. Only ALLOWED steps are appended: a blocked step
  -- never happened and must not contaminate later reachability evaluations.
  trajectory jsonb not null default '[]'::jsonb,
  step_count integer not null default 0,
  allowed_count integer not null default 0,
  blocked_count integer not null default 0,
  escalated_count integer not null default 0,
  status text not null,
  idempotency_key text not null,
  trajectory_hash text,
  evidence_id text
);

create table if not exists public.rg_governed_steps (
  id text primary key,
  created_at timestamptz not null default now(),
  org_id text not null,
  environment_id text not null,
  session_id text not null,
  step_index integer not null,
  action_id text not null,
  tool text not null,
  -- Ω args the step was judged with (flags + actor only, never customer
  -- content). Required for faithful replay of a blocked step.
  args jsonb not null default '{}'::jsonb,
  verdict text not null,
  proposal_id text,
  proposal_status text,
  proposal_verdict text,
  trajectory_verdict text,
  trajectory_rule text,
  trajectory_hash text,
  restricted_by_trajectory boolean not null default false,
  engine_verdict text,
  engine_compute_ms numeric,
  attestation jsonb,
  evidence_id text,
  governance_latency_ms integer,
  params_hash text
);

create unique index if not exists rg_governed_sessions_org_idempotency_uq
  on public.rg_governed_sessions (org_id, idempotency_key);
create index if not exists rg_governed_sessions_org_env_created_idx
  on public.rg_governed_sessions (org_id, environment_id, created_at desc);
-- One row per ordered step within a session: the replay spine.
create unique index if not exists rg_governed_steps_session_index_uq
  on public.rg_governed_steps (session_id, step_index);
create index if not exists rg_governed_steps_org_session_idx
  on public.rg_governed_steps (org_id, session_id);
create index if not exists rg_governed_steps_proposal_idx
  on public.rg_governed_steps (proposal_id) where proposal_id is not null;

alter table public.rg_governed_sessions enable row level security;
alter table public.rg_governed_steps enable row level security;
revoke all on public.rg_governed_sessions from anon, authenticated;
revoke all on public.rg_governed_steps from anon, authenticated;
grant all on public.rg_governed_sessions to service_role;
grant all on public.rg_governed_steps to service_role;

comment on table public.rg_governed_sessions is 'One governed workflow run: organisation, environment, accumulated trajectory and evidence chain.';
comment on table public.rg_governed_steps is 'Ordered governed steps within a session; the replayable audit spine.';
notify pgrst, 'reload schema';

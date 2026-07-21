-- ============================================================================
-- Operations Agent — schema additions (production).
--
-- Backs lib/ops/* when Supabase is configured; the module falls back to the
-- local file store otherwise (same contract as lib/runtime). Tables keep the
-- rg_ namespace (rg_ops_*) so they ride the existing store layer unchanged
-- and never collide with the sales/CRM schema.
--
-- Apply:  psql "$SUPABASE_DB_URL" -f supabase/operations_agent.sql
--         (after supabase/governance_runtime.sql)
-- ============================================================================

-- Proposals: the unit of agent autonomy -------------------------------------
-- proposed → allowed → executed|failed ; → blocked ; → escalated → approved|denied
create table if not exists public.rg_ops_proposals (
  id             text primary key,
  action_id      text not null,
  org_id         text references public.rg_orgs(id) on delete set null,
  environment_id text,
  params         jsonb default '{}'::jsonb,
  status         text not null default 'proposed',
  risk           text,
  source         text default 'operations_agent',
  agent_id       text,
  reasoning      jsonb,
  decision       jsonb,
  execution      jsonb,
  operator       jsonb,
  evidence_id    text,
  updated_at     timestamptz default now(),
  created_at     timestamptz default now()
);
create index if not exists rg_ops_prop_status_idx on public.rg_ops_proposals(status);
create index if not exists rg_ops_prop_org_idx    on public.rg_ops_proposals(org_id);
create index if not exists rg_ops_prop_action_idx on public.rg_ops_proposals(action_id);

-- Evidence: write-once record per governance decision on an agent action -----
create table if not exists public.rg_ops_evidence (
  id              text primary key,
  actor           text not null default 'operations_agent',
  agent           text not null default 'resurrection-tech-ops-agent',
  agent_id        text,
  action_id       text not null,
  proposal_id     text,
  org_id          text references public.rg_orgs(id) on delete set null,
  environment_id  text,
  policy          text,
  risk            text,
  verdict         text not null,
  reason          text,
  rule            text,
  omega_domain    text,
  trajectory_hash text,
  execution       jsonb,
  created_at      timestamptz default now()
);
create index if not exists rg_ops_ev_org_idx     on public.rg_ops_evidence(org_id);
create index if not exists rg_ops_ev_verdict_idx on public.rg_ops_evidence(verdict);
create index if not exists rg_ops_ev_action_idx  on public.rg_ops_evidence(action_id);
create index if not exists rg_ops_ev_created_idx on public.rg_ops_evidence(created_at);

alter table public.rg_ops_proposals add column if not exists agent_id text;
alter table public.rg_ops_evidence  add column if not exists agent_id text;
create index if not exists rg_ops_prop_agent_idx on public.rg_ops_proposals(agent_id);
create index if not exists rg_ops_ev_agent_idx   on public.rg_ops_evidence(agent_id);

-- Events: durable event log --------------------------------------------------
create table if not exists public.rg_ops_events (
  id         text primary key,
  kind       text not null,
  org_id     text,
  source     text default 'operations_agent',
  payload    jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists rg_ops_events_kind_idx    on public.rg_ops_events(kind);
create index if not exists rg_ops_events_created_idx on public.rg_ops_events(created_at);

-- Runs: one row per agent/council cycle --------------------------------------
-- IMPORTANT: this definition and the additive block below intentionally cover
-- every top-level field written by lib/ops/agent.js and lib/ops/agents.js.
create table if not exists public.rg_ops_runs (
  id               text primary key,
  trigger          text,
  status           text not null default 'running',
  started_at       timestamptz default now(),
  finished_at      timestamptz,
  observations     integer default 0,
  recommendations  integer default 0,
  proposals        integer default 0,
  outcomes         jsonb,
  reasoning_source text,
  mode             text,
  coordination     boolean not null default false,
  handoffs         jsonb,
  per_agent        jsonb,
  error            text,
  created_at       timestamptz default now()
);
create index if not exists rg_ops_runs_started_idx on public.rg_ops_runs(started_at);

-- Complete additive upgrade contract for existing environments. Keep this
-- exhaustive: a partially upgraded table must never fail one payload key at a
-- time through PostgREST's schema cache.
alter table public.rg_ops_runs add column if not exists trigger text;
alter table public.rg_ops_runs add column if not exists status text default 'running';
alter table public.rg_ops_runs add column if not exists started_at timestamptz default now();
alter table public.rg_ops_runs add column if not exists finished_at timestamptz;
alter table public.rg_ops_runs add column if not exists observations integer default 0;
alter table public.rg_ops_runs add column if not exists recommendations integer default 0;
alter table public.rg_ops_runs add column if not exists proposals integer default 0;
alter table public.rg_ops_runs add column if not exists outcomes jsonb;
alter table public.rg_ops_runs add column if not exists reasoning_source text;
alter table public.rg_ops_runs add column if not exists mode text;
alter table public.rg_ops_runs add column if not exists coordination boolean not null default false;
alter table public.rg_ops_runs add column if not exists handoffs jsonb;
alter table public.rg_ops_runs add column if not exists per_agent jsonb;
alter table public.rg_ops_runs add column if not exists error text;
alter table public.rg_ops_runs add column if not exists created_at timestamptz default now();

-- Transitions: append-only governed lifecycle state-machine log --------------
create table if not exists public.rg_ops_transitions (
  id           text primary key,
  org_id       text references public.rg_orgs(id) on delete set null,
  from_stage   text,
  to_stage     text,
  action_id    text,
  proposal_id  text,
  initiated_by text default 'operations_agent',
  created_at   timestamptz default now()
);
create index if not exists rg_ops_trans_org_idx     on public.rg_ops_transitions(org_id);
create index if not exists rg_ops_trans_created_idx on public.rg_ops_transitions(created_at);

-- Handoffs: typed, durable inter-agent coordination records ------------------
create table if not exists public.rg_ops_handoffs (
  id              text primary key,
  org_id          text references public.rg_orgs(id) on delete set null,
  from_agent      text,
  to_agent        text,
  kind            text,
  reason          text,
  evidence_refs   jsonb default '[]'::jsonb,
  proposed_action jsonb,
  risk            text,
  status          text not null default 'open',
  proposal_id     text,
  transition_id   text,
  attempts        integer default 0,
  created_by      text default 'operations_agent',
  accepted_at     timestamptz,
  resolved_at     timestamptz,
  updated_at      timestamptz default now(),
  created_at      timestamptz default now()
);
create index if not exists rg_ops_ho_org_idx     on public.rg_ops_handoffs(org_id);
create index if not exists rg_ops_ho_to_idx      on public.rg_ops_handoffs(to_agent);
create index if not exists rg_ops_ho_status_idx  on public.rg_ops_handoffs(status);
create index if not exists rg_ops_ho_created_idx on public.rg_ops_handoffs(created_at);

-- Client keys: hashed, scoped keys for external clients ----------------------
create table if not exists public.rg_ops_client_keys (
  id           text primary key,
  key_hash     text not null unique,
  label        text,
  scopes       jsonb default '[]'::jsonb,
  status       text default 'active',
  last_used_at timestamptz,
  created_at   timestamptz default now()
);
create index if not exists rg_ops_keys_hash_idx on public.rg_ops_client_keys(key_hash);

-- RLS: no permissive policies; service role only -----------------------------
alter table public.rg_ops_proposals    enable row level security;
alter table public.rg_ops_evidence     enable row level security;
alter table public.rg_ops_events       enable row level security;
alter table public.rg_ops_runs         enable row level security;
alter table public.rg_ops_transitions  enable row level security;
alter table public.rg_ops_handoffs     enable row level security;
alter table public.rg_ops_client_keys  enable row level security;

-- Ask PostgREST to refresh after the complete additive contract is present.
select pg_notify('pgrst', 'reload schema');

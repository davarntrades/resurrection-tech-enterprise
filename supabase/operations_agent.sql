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
  action_id      text not null,                 -- catalog action (lib/ops/actions.js)
  org_id         text references public.rg_orgs(id) on delete set null,
  environment_id text,
  params         jsonb default '{}'::jsonb,
  status         text not null default 'proposed',
  risk           text,                          -- low | medium | high | critical
  source         text default 'operations_agent',
  reasoning      jsonb,                         -- {decision, confidence, reason, source}
  decision       jsonb,                         -- governor decision record (engine verdict, rule, Ω domain, hash)
  execution      jsonb,                         -- {executed, result?, error?}
  operator       jsonb,                         -- {actor, at, note, action} on approve/deny
  evidence_id    text,
  updated_at     timestamptz default now(),
  created_at     timestamptz default now()
);
create index if not exists rg_ops_prop_status_idx on public.rg_ops_proposals(status);
create index if not exists rg_ops_prop_org_idx    on public.rg_ops_proposals(org_id);
create index if not exists rg_ops_prop_action_idx on public.rg_ops_proposals(action_id);

-- Evidence: write-once record per governance decision on an agent action -----
-- (No update/delete path in the application; the engine's
--  ops_evidence_destruction rule blocks the agent from proposing removal.)
create table if not exists public.rg_ops_evidence (
  id              text primary key,
  actor           text not null default 'operations_agent',
  agent           text not null default 'resurrection-tech-ops-agent',
  action_id       text not null,
  proposal_id     text,
  org_id          text references public.rg_orgs(id) on delete set null,
  environment_id  text,
  policy          text,                         -- engine_verdict | authorization_required |
                                                -- human_signoff_required | fail_closed_engine_unavailable |
                                                -- operator_denied | platform_refusal | unknown_action
  risk            text,
  verdict         text not null,                -- allow | block | escalate
  reason          text,
  rule            text,                         -- Ω rule name (operations_rules.py)
  omega_domain    text,
  trajectory_hash text,
  execution       jsonb,                        -- {executed, result?, error?}
  created_at      timestamptz default now()
);
create index if not exists rg_ops_ev_org_idx     on public.rg_ops_evidence(org_id);
create index if not exists rg_ops_ev_verdict_idx on public.rg_ops_evidence(verdict);
create index if not exists rg_ops_ev_action_idx  on public.rg_ops_evidence(action_id);
create index if not exists rg_ops_ev_created_idx on public.rg_ops_evidence(created_at);

-- Events: durable event log (scheduled + event-driven workflows) --------------
create table if not exists public.rg_ops_events (
  id         text primary key,
  kind       text not null,                     -- observation.* proposal.* execution.*
                                                -- integration.* client.* cycle.* external.*
  org_id     text,
  source     text default 'operations_agent',
  payload    jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists rg_ops_events_kind_idx    on public.rg_ops_events(kind);
create index if not exists rg_ops_events_created_idx on public.rg_ops_events(created_at);

-- Runs: one row per agent cycle (the agent's own audit trail) -----------------
create table if not exists public.rg_ops_runs (
  id               text primary key,
  trigger          text,                        -- cron | operator:<id> | event:<kind> | manual
  status           text not null default 'running',   -- running | completed | failed
  started_at       timestamptz default now(),
  finished_at      timestamptz,
  observations     integer default 0,
  recommendations  integer default 0,
  proposals        integer default 0,
  outcomes         jsonb,                       -- {executed, blocked, escalated, failed, skipped}
  reasoning_source text,                        -- llm | heuristic
  error            text,
  created_at       timestamptz default now()
);
create index if not exists rg_ops_runs_started_idx on public.rg_ops_runs(started_at);

-- Client keys: hashed, scoped keys for external clients (OpenClaw, Slack…) ----
create table if not exists public.rg_ops_client_keys (
  id           text primary key,
  key_hash     text not null unique,            -- sha256(key); plaintext never stored
  label        text,
  scopes       jsonb default '[]'::jsonb,       -- ["briefing","status","proposals:read","events:write"]
  status       text default 'active',           -- active | revoked
  last_used_at timestamptz,
  created_at   timestamptz default now()
);
create index if not exists rg_ops_keys_hash_idx on public.rg_ops_client_keys(key_hash);

-- ── RLS: same posture as governance_runtime.sql ──────────────────────────────
-- No permissive policies ⇒ only the service role can read/write.
alter table public.rg_ops_proposals   enable row level security;
alter table public.rg_ops_evidence    enable row level security;
alter table public.rg_ops_events      enable row level security;
alter table public.rg_ops_runs        enable row level security;
alter table public.rg_ops_client_keys enable row level security;

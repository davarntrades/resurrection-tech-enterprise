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
  agent_id       text,                          -- Pillar 4: owning specialist (sales|deployment|customer_success|compliance|finance); null = generalist
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
  agent_id        text,                         -- Pillar 4: attributing specialist (sales|deployment|customer_success|compliance|finance)
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

-- Pillar 4 (Multi-Agent Core) — additive agent attribution for existing deploys.
alter table public.rg_ops_proposals add column if not exists agent_id text;
alter table public.rg_ops_evidence  add column if not exists agent_id text;
create index if not exists rg_ops_prop_agent_idx on public.rg_ops_proposals(agent_id);
create index if not exists rg_ops_ev_agent_idx   on public.rg_ops_evidence(agent_id);

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
  reasoning_source text,                        -- llm | heuristic | multi_agent_council
  mode             text,                        -- null (generalist cycle) | council (multi-agent, Pillar 4)
  per_agent        jsonb,                        -- Pillar 4: per-specialist outcomes for a council run
  error            text,
  created_at       timestamptz default now()
);
create index if not exists rg_ops_runs_started_idx on public.rg_ops_runs(started_at);
alter table public.rg_ops_runs add column if not exists mode text;         -- Pillar 4: council run marker
alter table public.rg_ops_runs add column if not exists per_agent jsonb;    -- Pillar 4: per-specialist outcomes
alter table public.rg_ops_runs add column if not exists handoffs jsonb;     -- Pillar 5: per-cycle handoff counters {created,resolved,escalated,blocked}

-- Transitions: append-only governed lifecycle state-machine log (Pillar 3) ---
-- One row per proposed lifecycle transition; the live status + approval are
-- resolved from the linked proposal (rg_ops_proposals), so this log stays
-- immutable and replayable while the proposal carries the governance outcome.
create table if not exists public.rg_ops_transitions (
  id           text primary key,
  org_id       text references public.rg_orgs(id) on delete set null,
  from_stage   text,
  to_stage     text,
  action_id    text,                            -- catalog action driving the transition
  proposal_id  text,                            -- rg_ops_proposals.id (governance + approval)
  initiated_by text default 'operations_agent',
  created_at   timestamptz default now()
);
create index if not exists rg_ops_trans_org_idx     on public.rg_ops_transitions(org_id);
create index if not exists rg_ops_trans_created_idx on public.rg_ops_transitions(created_at);

-- Handoffs: typed, durable inter-agent coordination records (Pillar 5) --------
-- A handoff is a COORDINATION record, never an authority: it routes work between
-- agents and records the baton pass. State only ever changes through the linked
-- governed proposal (rg_ops_proposals). This ledger also doubles as the durable
-- task queue (open inbound handoffs per agent) and the blocked-work list
-- (status in escalated/blocked). Governance verdict + approval are resolved from
-- the linked proposal, so this row stays a stable coordination fact.
create table if not exists public.rg_ops_handoffs (
  id              text primary key,
  org_id          text references public.rg_orgs(id) on delete set null,
  from_agent      text,                            -- originating agent | 'lifecycle' | 'operator'
  to_agent        text,                            -- receiving agent id | 'operator'
  kind            text,                            -- 'transition' | 'task'
  reason          text,
  evidence_refs   jsonb default '[]'::jsonb,       -- [evidence_id | transition_id | report_id …]
  proposed_action jsonb,                           -- { action_id, params } the receiver should propose
  risk            text,                            -- denormalised for display; engine re-derives authoritatively
  status          text not null default 'open',    -- open|accepted|escalated|blocked|resolved|superseded
  proposal_id     text,                            -- rg_ops_proposals.id (verdict + approval)
  transition_id   text,                            -- rg_ops_transitions.id, if it drove a transition
  attempts        integer default 0,               -- bounded-retry counter (fail-closed re-tries)
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
alter table public.rg_ops_proposals    enable row level security;
alter table public.rg_ops_evidence     enable row level security;
alter table public.rg_ops_events       enable row level security;
alter table public.rg_ops_runs         enable row level security;
alter table public.rg_ops_transitions  enable row level security;
alter table public.rg_ops_handoffs      enable row level security;
alter table public.rg_ops_client_keys  enable row level security;

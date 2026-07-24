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
  autonomy_mode    text,
  paused_agents    jsonb default '[]'::jsonb,
  halted           boolean not null default false,
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
alter table public.rg_ops_runs add column if not exists autonomy_mode text;
alter table public.rg_ops_runs add column if not exists paused_agents jsonb default '[]'::jsonb;
alter table public.rg_ops_runs add column if not exists halted boolean not null default false;
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

-- Gmail: encrypted OAuth token + read-only inbox evidence (Gmail integration) -
-- The refresh token is stored ENCRYPTED (AES-256-GCM) — plaintext never lands
-- in the row. Access tokens are never persisted. Read-only scope only; there is
-- no send/modify/delete path anywhere in the application.
create table if not exists public.rg_ops_gmail_tokens (
  id                text primary key,
  mailbox_email     text,
  refresh_token_enc jsonb,                          -- { iv, tag, ct } base64 (AES-256-GCM)
  scope             text,                            -- gmail.readonly
  status            text not null default 'active',  -- active | revoked
  connected_by      text,
  last_history_id   text,                            -- Gmail historyId for incremental sync
  last_poll_at      timestamptz,
  updated_at        timestamptz default now(),
  created_at        timestamptz default now()
);

-- One row per observed inbound email = the evidence behind an email observation.
-- Bodies are NOT stored by default (OPS_GMAIL_STORE_BODIES off) — metadata +
-- snippet only, for data minimisation. Unique gmail_message_id makes polling
-- idempotent.
create table if not exists public.rg_ops_email_events (
  id               text primary key,
  gmail_message_id text unique,
  gmail_thread_id  text,
  mailbox_email    text,
  direction        text default 'inbound',
  from_email       text,
  from_name        text,
  to_emails        jsonb default '[]'::jsonb,
  subject          text,
  snippet          text,
  received_at      timestamptz,
  labels           jsonb default '[]'::jsonb,
  org_id           text references public.rg_orgs(id) on delete set null,
  contact_id       text,
  match_method     text,                             -- contact_email | domain | unmatched
  match_confidence text,                             -- high | medium | none
  has_body         boolean default false,
  observation_kind text,                             -- email.customer_inbound | email.prospect_inbound
  created_at       timestamptz default now()
);
create index if not exists rg_ops_email_org_idx      on public.rg_ops_email_events(org_id);
create index if not exists rg_ops_email_received_idx on public.rg_ops_email_events(received_at);
create index if not exists rg_ops_email_from_idx     on public.rg_ops_email_events(from_email);

-- Incidents: durable operator work items (Phase 2 — Governed Action Execution) -
-- Opened by the open_incident executor OR the post-execution verification
-- safeguard (when a governed action executes but its verifier fails). An
-- incident is an internal record only — no external reach.
create table if not exists public.rg_ops_incidents (
  id          text primary key,
  severity    text default 'warning',            -- info | warning | critical
  kind        text,                               -- verification_failed | engine_unavailable | ops_incident | …
  summary     text,
  org_id      text references public.rg_orgs(id) on delete set null,
  source_ref  text,                               -- proposal_id / evidence_id / observation ref
  status      text not null default 'open',       -- open | resolved
  opened_by   text default 'operations_agent',
  resolved_by text,
  resolved_at timestamptz,
  note        text,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now()
);
create index if not exists rg_ops_inc_org_idx     on public.rg_ops_incidents(org_id);
create index if not exists rg_ops_inc_status_idx  on public.rg_ops_incidents(status);
create index if not exists rg_ops_inc_created_idx on public.rg_ops_incidents(created_at);

-- Intelligence snapshots: point-in-time customer scores (refresh_customer_intelligence).
create table if not exists public.rg_ops_intel_snapshots (
  id              text primary key,
  org_id          text references public.rg_orgs(id) on delete set null,
  health          integer,
  health_band     text,
  scores          jsonb,
  lifecycle_stage text,
  taken_at        timestamptz default now(),
  created_at      timestamptz default now()
);
create index if not exists rg_ops_intel_org_idx    on public.rg_ops_intel_snapshots(org_id);
create index if not exists rg_ops_intel_taken_idx  on public.rg_ops_intel_snapshots(taken_at);

-- Autonomy control (Phase 4 — Executive Command) -----------------------------
-- Single-row global autonomy mode + per-agent pauses. Lowering autonomy (toward
-- emergency_pause) is always allowed + audited (fail-safe brake); raising it
-- requires governance approval. The mode gates the AUTONOMOUS council path only
-- — operator-initiated actions always work.
create table if not exists public.rg_ops_autonomy (
  id            text primary key,                  -- singleton: 'current'
  mode          text not null default 'execute_low_risk',
  paused_agents jsonb default '[]'::jsonb,
  updated_by    text,
  updated_at    timestamptz default now(),
  created_at    timestamptz default now()
);
alter table public.rg_ops_autonomy add column if not exists mode text not null default 'execute_low_risk';
alter table public.rg_ops_autonomy add column if not exists paused_agents jsonb default '[]'::jsonb;
alter table public.rg_ops_autonomy add column if not exists updated_by text;
alter table public.rg_ops_autonomy add column if not exists updated_at timestamptz default now();
alter table public.rg_ops_autonomy add column if not exists created_at timestamptz default now();

-- Policy Engineering drafts (Guardian OS departments) ------------------------
-- Governance policy produced by the Policy Engineering department. A draft is
-- inert; activation is operator-only (activate_policy → Ω rule). The kernel is
-- never edited by the agent — deployment stays a deliberate human step.
create table if not exists public.rg_ops_policies (
  id            text primary key,
  kind          text default 'omega_rule',      -- omega_rule | approval_chain | playbook | sector_template | deployment_policy
  title         text,
  spec          jsonb,
  rationale     text,
  target_domain text default 'enterprise',
  status        text default 'draft',            -- draft | activation_authorized
  created_by    text,
  activated_by  text,
  updated_at    timestamptz default now(),
  created_at    timestamptz default now()
);
create index if not exists rg_ops_policies_status_idx on public.rg_ops_policies(status);
alter table public.rg_ops_policies add column if not exists kind text default 'omega_rule';
alter table public.rg_ops_policies add column if not exists title text;
alter table public.rg_ops_policies add column if not exists spec jsonb;
alter table public.rg_ops_policies add column if not exists rationale text;
alter table public.rg_ops_policies add column if not exists target_domain text default 'enterprise';
alter table public.rg_ops_policies add column if not exists status text default 'draft';
alter table public.rg_ops_policies add column if not exists created_by text;
alter table public.rg_ops_policies add column if not exists activated_by text;
alter table public.rg_ops_policies add column if not exists updated_at timestamptz default now();
alter table public.rg_ops_policies add column if not exists created_at timestamptz default now();

-- Partner / MSSP registry (Guardian OS departments) --------------------------
-- Security partners + managed-service providers, their linked customer orgs and
-- deployment/renewal signals. An authoritative record where none existed; the
-- Enterprise Twin PROJECTS it read-only (never a second source of truth).
create table if not exists public.rg_ops_partners (
  id            text primary key,
  name          text,
  kind          text default 'mssp',             -- mssp | reseller | alliance | white_label
  status        text default 'active',
  org_ids       jsonb default '[]'::jsonb,        -- linked customer orgs
  deployments   integer default 0,
  renewals_due  integer default 0,
  health        text default 'ok',               -- ok | watch | at_risk
  notes         text,
  updated_at    timestamptz default now(),
  created_at    timestamptz default now()
);
alter table public.rg_ops_partners add column if not exists name text;
alter table public.rg_ops_partners add column if not exists kind text default 'mssp';
alter table public.rg_ops_partners add column if not exists status text default 'active';
alter table public.rg_ops_partners add column if not exists org_ids jsonb default '[]'::jsonb;
alter table public.rg_ops_partners add column if not exists deployments integer default 0;
alter table public.rg_ops_partners add column if not exists renewals_due integer default 0;
alter table public.rg_ops_partners add column if not exists health text default 'ok';
alter table public.rg_ops_partners add column if not exists notes text;
alter table public.rg_ops_partners add column if not exists updated_at timestamptz default now();
alter table public.rg_ops_partners add column if not exists created_at timestamptz default now();

-- Dynamic runtime Ω policies (Guardian OS — self-service governance foundation) -
-- Customer-specific Ω policies the Runtime Governance KERNEL loads at runtime
-- (no code change, no redeploy). Versioned, validated-before-activation,
-- evidence-backed, rollback-capable. Only status='active' rows are loaded by the
-- engine (dynamic_rules.py); they are DENY-ONLY (can never weaken the baseline).
create table if not exists public.rg_governance_policies (
  id             text primary key,
  name           text not null,                   -- logical policy identity (versions share a name)
  scope          text default 'global',           -- 'global' or a tenant/deployment id (future self-service)
  domain         text not null,                   -- OmegaDomain value (enterprise, finance, …)
  spec           jsonb not null,                  -- declarative rule: {match, conditions, severity, …}
  version        integer not null default 1,
  status         text not null default 'draft',   -- draft | validated | active | superseded | rolled_back
  hash           text,                            -- spec fingerprint (attestation)
  parent_version integer,
  superseded_by  text,                            -- id of the version that replaced this one
  notes          text,
  created_by     text,
  validated_by   text,
  validated_at   timestamptz,
  activated_by   text,
  activated_at   timestamptz,
  updated_at     timestamptz default now(),
  created_at     timestamptz default now()
);
create index if not exists rg_gov_policies_active_idx on public.rg_governance_policies(status);
create index if not exists rg_gov_policies_name_idx on public.rg_governance_policies(name, scope, version);
alter table public.rg_governance_policies add column if not exists name text;
alter table public.rg_governance_policies add column if not exists scope text default 'global';
alter table public.rg_governance_policies add column if not exists domain text;
alter table public.rg_governance_policies add column if not exists spec jsonb;
alter table public.rg_governance_policies add column if not exists version integer default 1;
alter table public.rg_governance_policies add column if not exists status text default 'draft';
alter table public.rg_governance_policies add column if not exists hash text;
alter table public.rg_governance_policies add column if not exists parent_version integer;
alter table public.rg_governance_policies add column if not exists superseded_by text;
alter table public.rg_governance_policies add column if not exists notes text;
alter table public.rg_governance_policies add column if not exists created_by text;
alter table public.rg_governance_policies add column if not exists validated_by text;
alter table public.rg_governance_policies add column if not exists validated_at timestamptz;
alter table public.rg_governance_policies add column if not exists activated_by text;
alter table public.rg_governance_policies add column if not exists activated_at timestamptz;
alter table public.rg_governance_policies add column if not exists updated_at timestamptz default now();
alter table public.rg_governance_policies add column if not exists created_at timestamptz default now();

-- Enterprise provisioning (Guardian OS — the OS installation) ----------------
-- One row per provisioning run: the enterprise spec in, the governed runtime out.
create table if not exists public.rg_provisioning (
  id          text primary key,
  org_id      text,
  name        text,
  status      text default 'provisioning',   -- provisioning | complete | failed
  spec        jsonb,                          -- the enterprise install spec
  result      jsonb,                          -- per-phase summary of what was created
  phases      jsonb,                          -- phase → {status, counts}
  created_by  text,
  finished_at timestamptz,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now()
);
create index if not exists rg_provisioning_org_idx on public.rg_provisioning(org_id);
alter table public.rg_provisioning add column if not exists org_id text;
alter table public.rg_provisioning add column if not exists name text;
alter table public.rg_provisioning add column if not exists status text default 'provisioning';
alter table public.rg_provisioning add column if not exists spec jsonb;
alter table public.rg_provisioning add column if not exists result jsonb;
alter table public.rg_provisioning add column if not exists phases jsonb;
alter table public.rg_provisioning add column if not exists created_by text;
alter table public.rg_provisioning add column if not exists finished_at timestamptz;
alter table public.rg_provisioning add column if not exists updated_at timestamptz default now();
alter table public.rg_provisioning add column if not exists created_at timestamptz default now();

-- The enterprise estate: identity, AI estate + trust architecture as entities.
create table if not exists public.rg_enterprise_entities (
  id        text primary key,
  org_id    text not null,
  layer     text not null,                    -- identity | estate | trust
  kind      text not null,                    -- business_unit | environment | ai_system | agent | tool | trust_boundary | risk_zone | protected_asset | …
  name      text,
  attrs     jsonb default '{}'::jsonb,
  refs      jsonb default '[]'::jsonb,         -- related entity ids (auto-mapped relationships)
  seeded    boolean not null default false,    -- example data until live events replace it
  created_at timestamptz default now()
);
create index if not exists rg_ent_org_idx on public.rg_enterprise_entities(org_id);
create index if not exists rg_ent_kind_idx on public.rg_enterprise_entities(org_id, layer, kind);
alter table public.rg_enterprise_entities add column if not exists org_id text;
alter table public.rg_enterprise_entities add column if not exists layer text;
alter table public.rg_enterprise_entities add column if not exists kind text;
alter table public.rg_enterprise_entities add column if not exists name text;
alter table public.rg_enterprise_entities add column if not exists attrs jsonb default '{}'::jsonb;
alter table public.rg_enterprise_entities add column if not exists refs jsonb default '[]'::jsonb;
alter table public.rg_enterprise_entities add column if not exists seeded boolean not null default false;
alter table public.rg_enterprise_entities add column if not exists created_at timestamptz default now();

-- Per-enterprise department enablement (Guardian OS departments).
create table if not exists public.rg_enterprise_departments (
  id         text primary key,
  org_id     text not null,
  department text not null,
  enabled    boolean not null default true,
  config     jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists rg_ent_dept_org_idx on public.rg_enterprise_departments(org_id);
alter table public.rg_enterprise_departments add column if not exists org_id text;
alter table public.rg_enterprise_departments add column if not exists department text;
alter table public.rg_enterprise_departments add column if not exists enabled boolean not null default true;
alter table public.rg_enterprise_departments add column if not exists config jsonb default '{}'::jsonb;
alter table public.rg_enterprise_departments add column if not exists updated_at timestamptz default now();
alter table public.rg_enterprise_departments add column if not exists created_at timestamptz default now();

-- ── Managed Governance (Phase 3) — continuous governance of a provisioned org ──
-- The governed baseline captured at provisioning (and re-captured on demand):
-- the fingerprint the live enterprise is continuously compared against.
create table if not exists public.rg_governance_baselines (
  id         text primary key,
  org_id     text not null,
  version    integer not null default 1,
  snapshot   jsonb default '{}'::jsonb,          -- entities/policies/departments fingerprint
  captured_by text,
  created_at timestamptz default now()
);
create index if not exists rg_gov_baseline_org_idx on public.rg_governance_baselines(org_id);
alter table public.rg_governance_baselines add column if not exists org_id text;
alter table public.rg_governance_baselines add column if not exists version integer not null default 1;
alter table public.rg_governance_baselines add column if not exists snapshot jsonb default '{}'::jsonb;
alter table public.rg_governance_baselines add column if not exists captured_by text;
alter table public.rg_governance_baselines add column if not exists created_at timestamptz default now();

-- Governance drift events: today's enterprise vs its governed baseline.
create table if not exists public.rg_governance_drift (
  id          text primary key,
  org_id      text not null,
  kind        text not null,                     -- new_ai_system | new_mcp_server | new_tool | removed_control | disabled_policy | permission_change | unexpected_autonomy | trust_boundary_violation
  subject     text,
  detail      text,
  severity    text default 'info',               -- info | warning | critical
  status      text default 'open',               -- open | acknowledged | resolved
  fingerprint text,                              -- dedupe key (kind+subject)
  evidence_id text,
  detected_at timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists rg_gov_drift_org_idx on public.rg_governance_drift(org_id);
create index if not exists rg_gov_drift_fp_idx on public.rg_governance_drift(org_id, fingerprint);
alter table public.rg_governance_drift add column if not exists org_id text;
alter table public.rg_governance_drift add column if not exists kind text;
alter table public.rg_governance_drift add column if not exists subject text;
alter table public.rg_governance_drift add column if not exists detail text;
alter table public.rg_governance_drift add column if not exists severity text default 'info';
alter table public.rg_governance_drift add column if not exists status text default 'open';
alter table public.rg_governance_drift add column if not exists fingerprint text;
alter table public.rg_governance_drift add column if not exists evidence_id text;
alter table public.rg_governance_drift add column if not exists detected_at timestamptz default now();
alter table public.rg_governance_drift add column if not exists updated_at timestamptz default now();

-- Governance health snapshots: the live score + sub-scores over time (trend).
create table if not exists public.rg_governance_health (
  id         text primary key,
  org_id     text not null,
  overall    integer,
  band       text,
  scores     jsonb default '{}'::jsonb,
  captured_at timestamptz default now()
);
create index if not exists rg_gov_health_org_idx on public.rg_governance_health(org_id);
alter table public.rg_governance_health add column if not exists org_id text;
alter table public.rg_governance_health add column if not exists overall integer;
alter table public.rg_governance_health add column if not exists band text;
alter table public.rg_governance_health add column if not exists scores jsonb default '{}'::jsonb;
alter table public.rg_governance_health add column if not exists captured_at timestamptz default now();

-- Customer-ready monthly evidence packs (governance posture + audit trail).
create table if not exists public.rg_evidence_packs (
  id         text primary key,
  org_id     text not null,
  period     text,                               -- e.g. 2026-07 | week | day
  payload    jsonb default '{}'::jsonb,
  hash       text,                               -- content hash = the pack's signature
  created_by text,
  created_at timestamptz default now()
);
create index if not exists rg_evidence_pack_org_idx on public.rg_evidence_packs(org_id);
alter table public.rg_evidence_packs add column if not exists org_id text;
alter table public.rg_evidence_packs add column if not exists period text;
alter table public.rg_evidence_packs add column if not exists payload jsonb default '{}'::jsonb;
alter table public.rg_evidence_packs add column if not exists hash text;
alter table public.rg_evidence_packs add column if not exists created_by text;
alter table public.rg_evidence_packs add column if not exists created_at timestamptz default now();

-- Client keys: hashed, scoped keys for external clients (OpenClaw, Slack…) ----
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
alter table public.rg_ops_handoffs      enable row level security;
alter table public.rg_ops_gmail_tokens  enable row level security;
alter table public.rg_ops_email_events  enable row level security;
alter table public.rg_ops_incidents      enable row level security;
alter table public.rg_ops_intel_snapshots enable row level security;
alter table public.rg_ops_autonomy       enable row level security;
alter table public.rg_ops_policies        enable row level security;
alter table public.rg_ops_partners        enable row level security;
alter table public.rg_governance_policies enable row level security;
alter table public.rg_provisioning         enable row level security;
alter table public.rg_enterprise_entities  enable row level security;
alter table public.rg_enterprise_departments enable row level security;
alter table public.rg_governance_baselines enable row level security;
alter table public.rg_governance_drift     enable row level security;
alter table public.rg_governance_health    enable row level security;
alter table public.rg_evidence_packs       enable row level security;
alter table public.rg_ops_client_keys  enable row level security;

-- Ask PostgREST to refresh after the complete additive contract is present.
select pg_notify('pgrst', 'reload schema');

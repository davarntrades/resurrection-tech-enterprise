-- ============================================================================
-- Runtime Governance — continuous-governance platform schema (production).
--
-- Backs the runtime gateway (lib/runtime/*) when Supabase is configured. The
-- gateway falls back to a local file store when these tables aren't present,
-- so an integration can start on day 1 and migrate to Supabase without code
-- change. Tables are prefixed rg_ to never collide with the sales/CRM schema.
--
-- Apply:  psql "$SUPABASE_DB_URL" -f supabase/governance_runtime.sql
-- ============================================================================

-- Organisations (tenants) ----------------------------------------------------
create table if not exists public.rg_orgs (
  id          text primary key,
  name        text not null,
  slug        text unique,
  plan        text default 'pilot',
  status      text default 'active',
  created_at  timestamptz default now()
);

-- Environments: production/staging separation + shadow/enforce mode -----------
create table if not exists public.rg_environments (
  id               text primary key,
  org_id           text not null references public.rg_orgs(id) on delete cascade,
  kind             text not null default 'production',   -- production | staging
  mode             text not null default 'shadow',       -- shadow | enforce
  name             text,
  store_payloads   boolean default false,                -- exact-replay opt-in
  status           text default 'active',
  mode_changed_at  timestamptz,
  created_at       timestamptz default now()
);
create index if not exists rg_env_org_idx on public.rg_environments(org_id);

-- API keys: hashed, scoped to org (+ environment) with a role -----------------
create table if not exists public.rg_api_keys (
  id             text primary key,
  org_id         text not null references public.rg_orgs(id) on delete cascade,
  environment_id text references public.rg_environments(id) on delete cascade,
  role           text not null default 'ingest',          -- ingest | viewer | admin
  label          text,
  prefix         text,                                    -- display only
  key_hash       text not null unique,                    -- sha256(key); secret never stored
  status         text default 'active',
  last_used_at   timestamptz,
  created_at     timestamptz default now()
);
create index if not exists rg_keys_org_idx on public.rg_api_keys(org_id);
create index if not exists rg_keys_hash_idx on public.rg_api_keys(key_hash);

-- Manifest versions: immutable, hash-addressed history ------------------------
create table if not exists public.rg_manifest_versions (
  id             text primary key,
  org_id         text not null references public.rg_orgs(id) on delete cascade,
  environment_id text not null references public.rg_environments(id) on delete cascade,
  version        integer not null,
  content_hash   text not null,
  tools          jsonb not null default '[]',
  tool_count     integer default 0,
  domains        jsonb,
  note           text,
  assessment     jsonb,                                   -- engine /v1/assess snapshot
  created_at     timestamptz default now()
);
create index if not exists rg_mv_env_idx on public.rg_manifest_versions(environment_id, version desc);

-- Current-manifest pointer per environment -----------------------------------
create table if not exists public.rg_manifests (
  id                 text primary key,
  org_id             text not null references public.rg_orgs(id) on delete cascade,
  environment_id     text not null references public.rg_environments(id) on delete cascade,
  current_version_id text references public.rg_manifest_versions(id),
  updated_at         timestamptz default now(),
  created_at         timestamptz default now()
);
create unique index if not exists rg_manifests_env_uidx on public.rg_manifests(environment_id);

-- Decisions: one row per governed trajectory = runtime evidence + audit log ---
-- Metadata only by default (no raw args). trajectory_full is populated ONLY
-- when the environment has store_payloads = true (exact-replay opt-in).
create table if not exists public.rg_decisions (
  id                   text primary key,
  org_id               text not null,
  environment_id       text not null,
  environment_kind     text,
  mode                 text,                              -- shadow | enforce
  enforced             boolean default false,
  engine_verdict       text,                              -- ALLOW | ESCALATE | BLOCK | ENGINE_UNAVAILABLE
  verdict              text,                              -- effective (after mode)
  requires_human_review boolean default false,
  omega_domain         text,
  rule                 text,
  reason               text,
  trajectory_hash      text,
  engine_compute_ms    double precision,
  round_trip_ms        double precision,
  steps                integer,
  tools                jsonb,
  domains              jsonb,
  label                text,
  agent                text,
  correlation_id       text,
  engine_ok            boolean,
  trajectory_full      jsonb,                             -- only when store_payloads
  created_at           timestamptz default now()
);
create index if not exists rg_dec_org_time_idx  on public.rg_decisions(org_id, created_at desc);
create index if not exists rg_dec_env_time_idx  on public.rg_decisions(environment_id, created_at desc);
create index if not exists rg_dec_verdict_idx   on public.rg_decisions(org_id, verdict);
create index if not exists rg_dec_rule_idx      on public.rg_decisions(org_id, rule);
create index if not exists rg_dec_omega_idx     on public.rg_decisions(org_id, omega_domain);
create index if not exists rg_dec_hash_idx      on public.rg_decisions(trajectory_hash);

-- Reports: persisted daily/weekly/monthly/quarterly governance evidence -------
create table if not exists public.rg_reports (
  id             text primary key,
  org_id         text not null,
  environment_id text,
  period         text not null,                           -- daily|weekly|monthly|quarterly
  window         jsonb,
  headline       text,
  totals         jsonb,
  engine_verdicts jsonb,
  would_block    integer,
  enforced       integer,
  human_review   integer,
  latency        jsonb,
  top_rules      jsonb,
  top_omega      jsonb,
  trajectories   integer,
  generated_at   timestamptz default now(),
  created_at     timestamptz default now()
);
create index if not exists rg_reports_org_idx on public.rg_reports(org_id, period, generated_at desc);

-- RLS: service-role only (the gateway uses the service key; browser never
-- touches these tables directly — reads go through the authenticated API).
alter table public.rg_orgs               enable row level security;
alter table public.rg_environments       enable row level security;
alter table public.rg_api_keys           enable row level security;
alter table public.rg_manifests          enable row level security;
alter table public.rg_manifest_versions  enable row level security;
alter table public.rg_decisions          enable row level security;
alter table public.rg_reports            enable row level security;
-- (No permissive policies created ⇒ only the service role can read/write.)

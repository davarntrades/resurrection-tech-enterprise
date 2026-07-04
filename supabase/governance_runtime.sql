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
  -- Engine provenance (item 2): the exact ruleset + build that produced the
  -- verdict, recorded verbatim from the engine attestation. Makes evidence
  -- defensible and replay drift detectable months later.
  engine_commit        text,
  ruleset_hash         text,
  engine_service_version text,
  attestation          jsonb,
  trajectory_full      jsonb,                             -- only when store_payloads
  -- Tamper-evidence (L3): per-environment hash chain. seq is monotonic per
  -- environment; entry_hash = sha256(prev_hash | canonical(core fields)).
  seq                  bigint,
  prev_hash            text,
  entry_hash           text,
  created_at           timestamptz default now()
);
create index if not exists rg_dec_org_time_idx  on public.rg_decisions(org_id, created_at desc);
create index if not exists rg_dec_env_time_idx  on public.rg_decisions(environment_id, created_at desc);
create index if not exists rg_dec_verdict_idx   on public.rg_decisions(org_id, verdict);
create index if not exists rg_dec_rule_idx      on public.rg_decisions(org_id, rule);
create index if not exists rg_dec_omega_idx     on public.rg_decisions(org_id, omega_domain);
create index if not exists rg_dec_hash_idx      on public.rg_decisions(trajectory_hash);
create index if not exists rg_dec_id_idx        on public.rg_decisions(id);            -- indexed replay lookup (item 4)
create index if not exists rg_dec_ruleset_idx   on public.rg_decisions(ruleset_hash);  -- provenance / drift queries

-- ── Server-side aggregation (item 3) ─────────────────────────────────────────
-- SQL count()/group by + percentile_cont, so metrics are correct at ANY scale
-- and immune to the PostgREST 1000-row response cap that truncated in-app
-- aggregation. Returns the normalised shape lib/runtime/store.aggregate expects.
create or replace function public.rg_metrics(
  p_org text, p_env text default null, p_since timestamptz default null, p_until timestamptz default null
) returns jsonb language sql stable as $$
  with f as (
    select * from public.rg_decisions d
    where (p_org  is null or d.org_id = p_org)
      and (p_env  is null or d.environment_id = p_env)
      and (p_since is null or d.created_at >= p_since)
      and (p_until is null or d.created_at <= p_until)
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'verdict_counts', jsonb_build_object(
      'ALLOW',    (select count(*) from f where verdict='ALLOW'),
      'ESCALATE', (select count(*) from f where verdict='ESCALATE'),
      'BLOCK',    (select count(*) from f where verdict='BLOCK'),
      'ENGINE_UNAVAILABLE', (select count(*) from f where verdict='ENGINE_UNAVAILABLE')),
    'engine_verdict_counts', jsonb_build_object(
      'ALLOW',    (select count(*) from f where engine_verdict='ALLOW'),
      'ESCALATE', (select count(*) from f where engine_verdict='ESCALATE'),
      'BLOCK',    (select count(*) from f where engine_verdict='BLOCK'),
      'ENGINE_UNAVAILABLE', (select count(*) from f where engine_verdict='ENGINE_UNAVAILABLE')),
    'enforced',     (select count(*) from f where enforced),
    'human_review', (select count(*) from f where requires_human_review),
    'compute', (select jsonb_build_object(
      'mean', round(avg(engine_compute_ms)::numeric,3),
      'p50', percentile_cont(0.50) within group (order by engine_compute_ms),
      'p95', percentile_cont(0.95) within group (order by engine_compute_ms),
      'p99', percentile_cont(0.99) within group (order by engine_compute_ms),
      'max', max(engine_compute_ms)) from f where engine_compute_ms is not null),
    'roundtrip', (select jsonb_build_object(
      'mean', round(avg(round_trip_ms)::numeric,3),
      'p50', percentile_cont(0.50) within group (order by round_trip_ms),
      'p95', percentile_cont(0.95) within group (order by round_trip_ms),
      'max', max(round_trip_ms)) from f where round_trip_ms is not null),
    'rules', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', rule, 'count', count(*)) x from f where rule is not null
      group by rule order by count(*) desc limit 10) t), '[]'::jsonb),
    'omega', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', omega_domain, 'count', count(*)) x from f where omega_domain is not null
      group by omega_domain order by count(*) desc limit 10) t), '[]'::jsonb),
    'by_environment_kind', coalesce((select jsonb_object_agg(environment_kind, c) from (
      select environment_kind, count(*) c from f where environment_kind is not null group by environment_kind) t), '{}'::jsonb)
  );
$$;

create or replace function public.rg_trends(
  p_org text, p_env text default null, p_since timestamptz default null, p_until timestamptz default null, p_bucket text default 'day'
) returns jsonb language sql stable as $$
  with f as (
    select *, date_trunc(case when p_bucket in ('hour','day','week') then p_bucket else 'day' end, created_at) as b
    from public.rg_decisions d
    where (p_org  is null or d.org_id = p_org)
      and (p_env  is null or d.environment_id = p_env)
      and (p_since is null or d.created_at >= p_since)
      and (p_until is null or d.created_at <= p_until)
  )
  select coalesce(jsonb_agg(row order by row->>'bucket'), '[]'::jsonb) from (
    select jsonb_build_object(
      'bucket', to_char(b, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'ALLOW',    count(*) filter (where verdict='ALLOW'),
      'ESCALATE', count(*) filter (where verdict='ESCALATE'),
      'BLOCK',    count(*) filter (where verdict='BLOCK'),
      'total',    count(*),
      'avg_engine_compute_ms', round(avg(engine_compute_ms)::numeric,3)
    ) as row
    from f group by b
  ) t;
$$;

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

-- Per-environment hash-chain heads (L3). One row per environment; advanced on
-- each decision append. NOTE: a multi-node deployment MUST advance this inside a
-- transaction (SELECT ... FOR UPDATE) to keep the chain strictly ordered.
create table if not exists public.rg_chain_heads (
  environment_id text primary key,
  org_id         text,
  seq            bigint not null default 0,
  head_hash      text,
  updated_at     timestamptz default now(),
  created_at     timestamptz default now()
);
create unique index if not exists rg_dec_env_seq_uidx on public.rg_decisions(environment_id, seq);

-- RLS: service-role only by default (the gateway uses the service key; browser
-- never touches these tables directly — reads go through the authenticated API,
-- which enforces org scoping in application code — see lib/runtime).
alter table public.rg_orgs               enable row level security;
alter table public.rg_environments       enable row level security;
alter table public.rg_api_keys           enable row level security;
alter table public.rg_manifests          enable row level security;
alter table public.rg_manifest_versions  enable row level security;
alter table public.rg_decisions          enable row level security;
alter table public.rg_reports            enable row level security;
alter table public.rg_chain_heads        enable row level security;
-- (No permissive policies ⇒ only the service role can read/write.)

-- ── OPTIONAL per-tenant RLS (L4, defence-in-depth) ───────────────────────────
-- The service role BYPASSES RLS, so these policies only take effect for a FUTURE
-- non-service-role access path (e.g. a per-tenant JWT). They are provided so a
-- direct-DB or edge access path can be added without weakening isolation. They
-- are NOT a substitute for the application-layer org scoping (which is the
-- tested control) and were NOT executed against a live database in this change.
-- To activate: run these AND have the caller set `select set_config('app.current_org', <org_id>, true)`
-- per request under a non-service role.
--
--   create policy rg_dec_tenant on public.rg_decisions
--     using (org_id = current_setting('app.current_org', true));
--   create policy rg_manifests_tenant on public.rg_manifests
--     using (org_id = current_setting('app.current_org', true));
--   create policy rg_mv_tenant on public.rg_manifest_versions
--     using (org_id = current_setting('app.current_org', true));
--   create policy rg_reports_tenant on public.rg_reports
--     using (org_id = current_setting('app.current_org', true));
--   create policy rg_env_tenant on public.rg_environments
--     using (org_id = current_setting('app.current_org', true));

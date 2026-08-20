-- ============================================================================
-- Guardian OS / Morrison Runtime Governance — General Production Readiness
-- Additive hardening migration. Apply after governance_runtime.sql,
-- operations_agent.sql, integration_gateway.sql and evidence_append_only.sql.
--
-- This migration does NOT change Morrison policy/kernel/execution semantics.
-- It adds database-enforced tenant boundaries, connector evidence chaining,
-- explicit source-health introspection and deployment-profile state.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Trusted tenant identity helpers
-- ---------------------------------------------------------------------------
-- Tenant-scoped clients authenticate with a short-lived JWT whose org_id is
-- minted by trusted server-side code. Client request bodies are never a source
-- of tenant authority. PostgreSQL is the second enforcement layer.
create or replace function public.rg_claim_org_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'org_id', ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,org_id}', '')
  )
$$;

create or replace function public.rg_claim_runtime_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'runtime_role', ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,runtime_role}', ''),
    'tenant'
  )
$$;

create or replace function public.rg_tenant_matches(row_org text)
returns boolean
language sql
stable
as $$ select row_org is not null and row_org = public.rg_claim_org_id() $$;

revoke all on function public.rg_claim_org_id() from public;
revoke all on function public.rg_claim_runtime_role() from public;
revoke all on function public.rg_tenant_matches(text) from public;
grant execute on function public.rg_claim_org_id() to authenticated;
grant execute on function public.rg_claim_runtime_role() to authenticated;
grant execute on function public.rg_tenant_matches(text) to authenticated;

-- ---------------------------------------------------------------------------
-- R-2: database-enforced tenant boundary
-- ---------------------------------------------------------------------------
-- Admin/service-role paths remain explicit privileged backend paths. Ordinary
-- tenant runtime clients use the authenticated role and these policies.
do $$
declare
  t text;
  tenant_tables text[] := array[
    'rg_environments','rg_api_keys','rg_manifest_versions','rg_manifests',
    'rg_decisions','rg_reports','rg_chain_heads','rg_alerts',
    'rg_integration_connectors','rg_integration_webhooks',
    'rg_integration_webhook_deliveries','rg_integration_deployments',
    'rg_integration_usage','rg_integration_events','rg_integration_secrets',
    'rg_ops_proposals','rg_ops_evidence','rg_ops_events','rg_ops_transitions',
    'rg_ops_handoffs','rg_ops_email_events','rg_ops_incidents',
    'rg_ops_intel_snapshots'
  ];
begin
  foreach t in array tenant_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists rg_tenant_select on public.%I', t);
      execute format('drop policy if exists rg_tenant_insert on public.%I', t);
      execute format('drop policy if exists rg_tenant_update on public.%I', t);
      execute format('drop policy if exists rg_tenant_delete on public.%I', t);
      execute format('create policy rg_tenant_select on public.%I for select to authenticated using (public.rg_tenant_matches(org_id))', t);
      execute format('create policy rg_tenant_insert on public.%I for insert to authenticated with check (public.rg_tenant_matches(org_id))', t);
      execute format('create policy rg_tenant_update on public.%I for update to authenticated using (public.rg_tenant_matches(org_id)) with check (public.rg_tenant_matches(org_id))', t);
      execute format('create policy rg_tenant_delete on public.%I for delete to authenticated using (public.rg_tenant_matches(org_id))', t);
    end if;
  end loop;
end $$;

-- Organisations themselves are visible only to the matching organisation.
alter table if exists public.rg_orgs enable row level security;
drop policy if exists rg_tenant_select on public.rg_orgs;
create policy rg_tenant_select on public.rg_orgs
  for select to authenticated using (id = public.rg_claim_org_id());

-- Tenant clients need table privileges before RLS can do useful work. RLS is
-- still authoritative; these grants do not grant cross-tenant visibility.
do $$
declare
  t text;
  tenant_tables text[] := array[
    'rg_orgs','rg_environments','rg_api_keys','rg_manifest_versions','rg_manifests',
    'rg_decisions','rg_reports','rg_chain_heads','rg_alerts',
    'rg_integration_connectors','rg_integration_webhooks',
    'rg_integration_webhook_deliveries','rg_integration_deployments',
    'rg_integration_usage','rg_integration_events','rg_integration_secrets',
    'rg_ops_proposals','rg_ops_evidence','rg_ops_events','rg_ops_transitions',
    'rg_ops_handoffs','rg_ops_email_events','rg_ops_incidents',
    'rg_ops_intel_snapshots'
  ];
begin
  foreach t in array tenant_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- R-1: connector / operations evidence cross-record chaining
-- ---------------------------------------------------------------------------
create table if not exists public.rg_evidence_chain_heads (
  chain_name text not null,
  org_id text not null,
  environment_id text not null default '_global',
  seq bigint not null default 0,
  head_hash text,
  updated_at timestamptz not null default now(),
  primary key (chain_name, org_id, environment_id)
);

alter table public.rg_evidence_chain_heads enable row level security;
drop policy if exists rg_tenant_select on public.rg_evidence_chain_heads;
create policy rg_tenant_select on public.rg_evidence_chain_heads
  for select to authenticated using (public.rg_tenant_matches(org_id));
grant select on public.rg_evidence_chain_heads to authenticated;

alter table if exists public.rg_integration_events add column if not exists chain_seq bigint;
alter table if exists public.rg_integration_events add column if not exists chain_prev_hash text;
alter table if exists public.rg_integration_events add column if not exists chain_entry_hash text;
alter table if exists public.rg_integration_events add column if not exists chain_alg text;
alter table if exists public.rg_integration_events add column if not exists evidence_hash_alg text;

alter table if exists public.rg_ops_evidence add column if not exists chain_seq bigint;
alter table if exists public.rg_ops_evidence add column if not exists chain_prev_hash text;
alter table if exists public.rg_ops_evidence add column if not exists chain_entry_hash text;
alter table if exists public.rg_ops_evidence add column if not exists chain_alg text;

create unique index if not exists rg_int_events_chain_seq_uidx
  on public.rg_integration_events(org_id, environment_id, chain_seq)
  where chain_seq is not null;
create unique index if not exists rg_ops_evidence_chain_seq_uidx
  on public.rg_ops_evidence(org_id, coalesce(environment_id, '_global'), chain_seq)
  where chain_seq is not null;

-- Canonical chain input deliberately hashes fixed scalar fields plus the
-- already-canonical per-record evidence hash. Historical rows are not rewritten.
create or replace function public.rg_chain_integration_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.rg_evidence_chain_heads%rowtype;
  env text := coalesce(new.environment_id, '_global');
  genesis text := repeat('0', 64);
  canonical text;
begin
  insert into public.rg_evidence_chain_heads(chain_name, org_id, environment_id, seq, head_hash)
  values ('integration_events', new.org_id, env, 0, null)
  on conflict do nothing;

  select * into h from public.rg_evidence_chain_heads
   where chain_name='integration_events' and org_id=new.org_id and environment_id=env
   for update;

  new.chain_seq := h.seq + 1;
  new.chain_prev_hash := coalesce(h.head_hash, genesis);
  new.chain_alg := 'sha256-chain-v1';
  canonical := jsonb_build_array(
    new.id, new.org_id, env, new.chain_seq, new.created_at,
    new.type, new.actor, new.evidence_hash, new.evidence_hash_alg,
    new.occurred_at, new.immutable
  )::text;
  new.chain_entry_hash := encode(digest(new.chain_prev_hash || '|' || canonical, 'sha256'), 'hex');

  update public.rg_evidence_chain_heads
     set seq=new.chain_seq, head_hash=new.chain_entry_hash, updated_at=now()
   where chain_name='integration_events' and org_id=new.org_id and environment_id=env;
  return new;
end $$;

create or replace function public.rg_chain_ops_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.rg_evidence_chain_heads%rowtype;
  env text := coalesce(new.environment_id, '_global');
  genesis text := repeat('0', 64);
  canonical text;
begin
  -- Evidence without an organisation cannot provide a tenant-local chain and is
  -- intentionally left legacy/unverifiable rather than falsely marked verified.
  if new.org_id is null then return new; end if;

  insert into public.rg_evidence_chain_heads(chain_name, org_id, environment_id, seq, head_hash)
  values ('ops_evidence', new.org_id, env, 0, null)
  on conflict do nothing;

  select * into h from public.rg_evidence_chain_heads
   where chain_name='ops_evidence' and org_id=new.org_id and environment_id=env
   for update;

  new.chain_seq := h.seq + 1;
  new.chain_prev_hash := coalesce(h.head_hash, genesis);
  new.chain_alg := 'sha256-chain-v1';
  canonical := jsonb_build_array(
    new.id, new.org_id, env, new.chain_seq, new.created_at,
    new.actor, new.agent, new.agent_id, new.action_id, new.proposal_id,
    new.policy, new.risk, new.verdict, new.reason, new.rule,
    new.omega_domain, new.trajectory_hash, new.execution
  )::text;
  new.chain_entry_hash := encode(digest(new.chain_prev_hash || '|' || canonical, 'sha256'), 'hex');

  update public.rg_evidence_chain_heads
     set seq=new.chain_seq, head_hash=new.chain_entry_hash, updated_at=now()
   where chain_name='ops_evidence' and org_id=new.org_id and environment_id=env;
  return new;
end $$;

drop trigger if exists rg_integration_events_chain_before_insert on public.rg_integration_events;
create trigger rg_integration_events_chain_before_insert
before insert on public.rg_integration_events
for each row execute function public.rg_chain_integration_event();

drop trigger if exists rg_ops_evidence_chain_before_insert on public.rg_ops_evidence;
create trigger rg_ops_evidence_chain_before_insert
before insert on public.rg_ops_evidence
for each row execute function public.rg_chain_ops_evidence();

-- Verification returns VERIFIED, BROKEN, LEGACY_PRE_CHAIN or EMPTY. It never
-- maps an unknown/legacy state to healthy.
create or replace function public.rg_verify_evidence_chain(
  p_chain_name text,
  p_org text,
  p_env text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  expected_seq bigint := 1;
  prev text := repeat('0',64);
  recomputed text;
  canonical text;
  chained_count bigint := 0;
  legacy_count bigint := 0;
  env text := coalesce(p_env, '_global');
begin
  if p_chain_name not in ('integration_events','ops_evidence') then
    return jsonb_build_object('status','UNKNOWN','ok',false,'reason','unsupported_chain');
  end if;

  if p_chain_name = 'integration_events' then
    select count(*) filter (where chain_seq is null), count(*) filter (where chain_seq is not null)
      into legacy_count, chained_count
      from public.rg_integration_events
     where org_id=p_org and (p_env is null or environment_id=p_env);

    if chained_count = 0 then
      return jsonb_build_object('status', case when legacy_count>0 then 'LEGACY_PRE_CHAIN' else 'EMPTY' end,
        'ok', case when legacy_count=0 then true else false end,
        'legacy_count',legacy_count,'chained_count',chained_count);
    end if;

    for r in select * from public.rg_integration_events
      where org_id=p_org and (p_env is null or environment_id=p_env) and chain_seq is not null
      order by chain_seq loop
      if r.chain_seq <> expected_seq then
        return jsonb_build_object('status','BROKEN','ok',false,'reason','missing_or_reordered_sequence','broken_at',expected_seq,'legacy_count',legacy_count,'chained_count',chained_count);
      end if;
      if r.chain_prev_hash <> prev then
        return jsonb_build_object('status','BROKEN','ok',false,'reason','prev_hash_mismatch','broken_at',r.chain_seq,'legacy_count',legacy_count,'chained_count',chained_count);
      end if;
      canonical := jsonb_build_array(r.id,r.org_id,coalesce(r.environment_id,'_global'),r.chain_seq,r.created_at,r.type,r.actor,r.evidence_hash,r.evidence_hash_alg,r.occurred_at,r.immutable)::text;
      recomputed := encode(digest(prev || '|' || canonical,'sha256'),'hex');
      if r.chain_entry_hash <> recomputed then
        return jsonb_build_object('status','BROKEN','ok',false,'reason','entry_hash_mismatch','broken_at',r.chain_seq,'legacy_count',legacy_count,'chained_count',chained_count);
      end if;
      prev := r.chain_entry_hash; expected_seq := expected_seq + 1;
    end loop;
  else
    select count(*) filter (where chain_seq is null), count(*) filter (where chain_seq is not null)
      into legacy_count, chained_count
      from public.rg_ops_evidence
     where org_id=p_org and (p_env is null or coalesce(environment_id,'_global')=env);

    if chained_count = 0 then
      return jsonb_build_object('status', case when legacy_count>0 then 'LEGACY_PRE_CHAIN' else 'EMPTY' end,
        'ok', case when legacy_count=0 then true else false end,
        'legacy_count',legacy_count,'chained_count',chained_count);
    end if;

    for r in select * from public.rg_ops_evidence
      where org_id=p_org and (p_env is null or coalesce(environment_id,'_global')=env) and chain_seq is not null
      order by chain_seq loop
      if r.chain_seq <> expected_seq then
        return jsonb_build_object('status','BROKEN','ok',false,'reason','missing_or_reordered_sequence','broken_at',expected_seq,'legacy_count',legacy_count,'chained_count',chained_count);
      end if;
      if r.chain_prev_hash <> prev then
        return jsonb_build_object('status','BROKEN','ok',false,'reason','prev_hash_mismatch','broken_at',r.chain_seq,'legacy_count',legacy_count,'chained_count',chained_count);
      end if;
      canonical := jsonb_build_array(r.id,r.org_id,coalesce(r.environment_id,'_global'),r.chain_seq,r.created_at,r.actor,r.agent,r.agent_id,r.action_id,r.proposal_id,r.policy,r.risk,r.verdict,r.reason,r.rule,r.omega_domain,r.trajectory_hash,r.execution)::text;
      recomputed := encode(digest(prev || '|' || canonical,'sha256'),'hex');
      if r.chain_entry_hash <> recomputed then
        return jsonb_build_object('status','BROKEN','ok',false,'reason','entry_hash_mismatch','broken_at',r.chain_seq,'legacy_count',legacy_count,'chained_count',chained_count);
      end if;
      prev := r.chain_entry_hash; expected_seq := expected_seq + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'status', case when legacy_count>0 then 'VERIFIED_WITH_LEGACY_PREFIX' else 'VERIFIED' end,
    'ok', true, 'legacy_count',legacy_count,'chained_count',chained_count,
    'head_hash',prev
  );
end $$;

revoke all on function public.rg_verify_evidence_chain(text,text,text) from public;
grant execute on function public.rg_verify_evidence_chain(text,text,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- R-5: explicit source/schema health
-- ---------------------------------------------------------------------------
create or replace function public.rg_source_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sources jsonb := '{}'::jsonb;
  item record;
begin
  for item in
    select * from (values
      ('decisions','rg_decisions'),
      ('reports','rg_reports'),
      ('integration_events','rg_integration_events'),
      ('ops_evidence','rg_ops_evidence'),
      ('integration_connectors','rg_integration_connectors'),
      ('alerts','rg_alerts')
    ) as x(source_name, table_name)
  loop
    sources := sources || jsonb_build_object(
      item.source_name,
      jsonb_build_object(
        'state', case when to_regclass('public.' || item.table_name) is null then 'missing_schema' else 'available' end,
        'table', item.table_name
      )
    );
  end loop;
  return sources;
end $$;

revoke all on function public.rg_source_health() from public;
grant execute on function public.rg_source_health() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deployment profile state — one source for backend + Control Room
-- ---------------------------------------------------------------------------
create table if not exists public.rg_deployment_profiles (
  environment_id text primary key references public.rg_environments(id) on delete cascade,
  org_id text not null references public.rg_orgs(id) on delete cascade,
  profile text not null default 'GUARDED_PILOT',
  status text not null default 'inactive', -- inactive | ready | active | blocked
  config jsonb not null default '{}'::jsonb,
  last_preflight jsonb,
  last_verified_at timestamptz,
  activated_at timestamptz,
  activated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint rg_deployment_profile_valid check (profile in ('DEVELOPMENT','SHADOW','GUARDED_PILOT','ENFORCED','PRODUCTION','SOVEREIGN')),
  constraint rg_deployment_profile_status_valid check (status in ('inactive','ready','active','blocked'))
);
create index if not exists rg_deployment_profiles_org_idx on public.rg_deployment_profiles(org_id);
alter table public.rg_deployment_profiles enable row level security;
drop policy if exists rg_tenant_select on public.rg_deployment_profiles;
create policy rg_tenant_select on public.rg_deployment_profiles for select to authenticated using (public.rg_tenant_matches(org_id));
-- Tenant runtime can read its profile; activation remains privileged backend-only.
grant select on public.rg_deployment_profiles to authenticated;

-- Canary / staging / production / sovereign blast-radius labels.
create table if not exists public.rg_runtime_resources (
  id text primary key,
  org_id text not null references public.rg_orgs(id) on delete cascade,
  environment_id text not null references public.rg_environments(id) on delete cascade,
  resource_type text not null,
  resource_ref text not null,
  classification text not null,
  blast_radius text not null default 'unknown',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rg_resource_classification_valid check (classification in ('CANARY','STAGING','PRODUCTION','SOVEREIGN')),
  constraint rg_resource_blast_radius_valid check (blast_radius in ('inert','contained','limited','production','sovereign','unknown')),
  unique(org_id, environment_id, resource_type, resource_ref)
);
alter table public.rg_runtime_resources enable row level security;
drop policy if exists rg_tenant_select on public.rg_runtime_resources;
create policy rg_tenant_select on public.rg_runtime_resources for select to authenticated using (public.rg_tenant_matches(org_id));
grant select on public.rg_runtime_resources to authenticated;

-- ---------------------------------------------------------------------------
-- Preflight database control snapshot. Unknown is explicit.
-- ---------------------------------------------------------------------------
create or replace function public.rg_production_controls()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rls_effective boolean;
  append_only_present boolean;
  chain_schema boolean;
begin
  select coalesce(bool_and(c.relrowsecurity), false) into rls_effective
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('rg_decisions','rg_reports','rg_integration_events','rg_ops_evidence');

  select exists(select 1 from pg_trigger where tgname in ('rg_evidence_append_only','rg_evidence_append_only_update'))
    into append_only_present;

  chain_schema := exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rg_integration_events' and column_name='chain_entry_hash'
  ) and exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rg_ops_evidence' and column_name='chain_entry_hash'
  );

  return jsonb_build_object(
    'rls_enabled', rls_effective,
    'tenant_claim_function', to_regprocedure('public.rg_claim_org_id()') is not null,
    'connector_chain_schema', chain_schema,
    'append_only_controls', append_only_present,
    'deployment_profiles', to_regclass('public.rg_deployment_profiles') is not null,
    'runtime_resources', to_regclass('public.rg_runtime_resources') is not null,
    'source_health', public.rg_source_health()
  );
end $$;

revoke all on function public.rg_production_controls() from public;
grant execute on function public.rg_production_controls() to authenticated, service_role;

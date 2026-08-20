-- General Production Readiness follow-up: integrity verifier + control probes.
-- Additive/idempotent. Historical evidence remains untouched.

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
  h public.rg_evidence_chain_heads%rowtype;
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
      return jsonb_build_object(
        'status', case when legacy_count>0 then 'LEGACY_PRE_CHAIN' else 'EMPTY' end,
        'ok', legacy_count=0,
        'legacy_count',legacy_count,'chained_count',chained_count
      );
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
      prev := r.chain_entry_hash;
      expected_seq := expected_seq + 1;
    end loop;

    if p_env is not null then
      select * into h from public.rg_evidence_chain_heads
       where chain_name='integration_events' and org_id=p_org and environment_id=env;
      if h.seq is null or h.seq <> chained_count or h.head_hash <> prev then
        return jsonb_build_object('status','BROKEN','ok',false,'reason','chain_head_mismatch','expected_seq',chained_count,'head_seq',h.seq,'legacy_count',legacy_count,'chained_count',chained_count);
      end if;
    end if;
  else
    select count(*) filter (where chain_seq is null), count(*) filter (where chain_seq is not null)
      into legacy_count, chained_count
      from public.rg_ops_evidence
     where org_id=p_org and (p_env is null or coalesce(environment_id,'_global')=env);

    if chained_count = 0 then
      return jsonb_build_object(
        'status', case when legacy_count>0 then 'LEGACY_PRE_CHAIN' else 'EMPTY' end,
        'ok', legacy_count=0,
        'legacy_count',legacy_count,'chained_count',chained_count
      );
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
      prev := r.chain_entry_hash;
      expected_seq := expected_seq + 1;
    end loop;

    if p_env is not null then
      select * into h from public.rg_evidence_chain_heads
       where chain_name='ops_evidence' and org_id=p_org and environment_id=env;
      if h.seq is null or h.seq <> chained_count or h.head_hash <> prev then
        return jsonb_build_object('status','BROKEN','ok',false,'reason','chain_head_mismatch','expected_seq',chained_count,'head_seq',h.seq,'legacy_count',legacy_count,'chained_count',chained_count);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', case when legacy_count>0 then 'VERIFIED_WITH_LEGACY_PREFIX' else 'VERIFIED' end,
    'ok', true,
    'legacy_count',legacy_count,'chained_count',chained_count,'head_hash',prev
  );
end $$;

revoke all on function public.rg_verify_evidence_chain(text,text,text) from public;
grant execute on function public.rg_verify_evidence_chain(text,text,text) to authenticated, service_role;

create or replace function public.rg_production_controls()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rls_effective boolean;
  policies_present boolean;
  append_only_present boolean;
  chain_schema boolean;
begin
  select coalesce(bool_and(c.relrowsecurity), false) into rls_effective
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('rg_decisions','rg_reports','rg_integration_events','rg_ops_evidence');

  select count(*) >= 4 into policies_present
  from pg_policies
  where schemaname='public' and policyname='rg_tenant_select'
    and tablename in ('rg_decisions','rg_reports','rg_integration_events','rg_ops_evidence');

  select count(*) = 3 into append_only_present
  from pg_trigger
  where not tgisinternal and tgname in ('rg_decisions_no_update','rg_int_events_no_update','rg_ops_evidence_no_update')
    and tgenabled <> 'D';

  chain_schema := exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rg_integration_events' and column_name='chain_entry_hash'
  ) and exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rg_ops_evidence' and column_name='chain_entry_hash'
  ) and to_regclass('public.rg_evidence_chain_heads') is not null;

  return jsonb_build_object(
    'rls_enabled', rls_effective,
    'tenant_policies_present', policies_present,
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

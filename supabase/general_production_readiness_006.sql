-- General Production Readiness — final database control snapshot.
-- Makes application of the least-privilege grant migration observable by the
-- same readiness engine consumed by CLI + Control Room.

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
  least_privilege boolean;
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

  least_privilege :=
    has_table_privilege('authenticated','public.rg_environments','SELECT')
    and has_table_privilege('authenticated','public.rg_decisions','SELECT')
    and has_table_privilege('authenticated','public.rg_reports','SELECT')
    and has_table_privilege('authenticated','public.rg_integration_events','SELECT')
    and not has_table_privilege('authenticated','public.rg_api_keys','SELECT')
    and not has_table_privilege('authenticated','public.rg_integration_secrets','SELECT')
    and not has_table_privilege('authenticated','public.rg_reports','UPDATE');

  return jsonb_build_object(
    'rls_enabled', rls_effective,
    'tenant_policies_present', policies_present,
    'tenant_claim_function', to_regprocedure('public.rg_claim_org_id()') is not null,
    'tenant_least_privilege', least_privilege,
    'connector_chain_schema', chain_schema,
    'append_only_controls', append_only_present,
    'deployment_profiles', to_regclass('public.rg_deployment_profiles') is not null,
    'runtime_resources', to_regclass('public.rg_runtime_resources') is not null,
    'report_integrity_column', exists(
      select 1 from information_schema.columns where table_schema='public' and table_name='rg_reports' and column_name='integrity'
    ),
    'source_health', public.rg_source_health()
  );
end $$;

revoke all on function public.rg_production_controls() from public;
grant execute on function public.rg_production_controls() to authenticated, service_role;

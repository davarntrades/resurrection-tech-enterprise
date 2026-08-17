\set ON_ERROR_STOP on

select jsonb_build_object(
  'case','production_controls',
  'result',public.rg_production_controls()
)::text;

select jsonb_build_object(
  'case','rls_tables',
  'result',coalesce(jsonb_agg(jsonb_build_object(
    'table',c.relname,
    'rls_enabled',c.relrowsecurity,
    'force_rls',c.relforcerowsecurity
  ) order by c.relname),'[]'::jsonb)
)::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'rg_orgs','rg_environments','rg_decisions','rg_reports','rg_integration_connectors',
  'rg_integration_events','rg_ops_proposals','rg_ops_evidence','rg_deployment_profiles','rg_runtime_resources'
);

select jsonb_build_object(
  'case','tenant_policies',
  'result',coalesce(jsonb_agg(jsonb_build_object(
    'table',tablename,'policy',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check
  ) order by tablename,policyname),'[]'::jsonb)
)::text
from pg_policies
where schemaname='public' and tablename in (
  'rg_orgs','rg_environments','rg_decisions','rg_reports','rg_integration_connectors',
  'rg_integration_events','rg_ops_proposals','rg_ops_evidence','rg_deployment_profiles','rg_runtime_resources'
);

select jsonb_build_object(
  'case','authenticated_grants',
  'result',coalesce(jsonb_agg(jsonb_build_object(
    'table',table_name,'privilege',privilege_type
  ) order by table_name,privilege_type),'[]'::jsonb)
)::text
from information_schema.role_table_grants
where grantee='authenticated' and table_schema='public'
  and table_name like 'rg_%';

select jsonb_build_object(
  'case','security_definer_functions',
  'result',coalesce(jsonb_agg(jsonb_build_object(
    'name',p.proname,
    'security_definer',p.prosecdef,
    'config',p.proconfig
  ) order by p.proname),'[]'::jsonb)
)::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'rg_chain_integration_event','rg_chain_ops_evidence','rg_verify_evidence_chain',
  'rg_production_controls','rg_source_health'
);

select jsonb_build_object(
  'case','chain_triggers',
  'result',coalesce(jsonb_agg(jsonb_build_object(
    'table',c.relname,'trigger',t.tgname,'enabled',t.tgenabled
  ) order by c.relname,t.tgname),'[]'::jsonb)
)::text
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal and t.tgname in (
  'rg_integration_events_chain_before_insert','rg_ops_evidence_chain_before_insert',
  'rg_decisions_no_update','rg_int_events_no_update','rg_ops_evidence_no_update'
);

select jsonb_build_object(
  'case','chain_columns',
  'result',coalesce(jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type)
    order by table_name,column_name),'[]'::jsonb)
)::text
from information_schema.columns
where table_schema='public'
  and table_name in ('rg_integration_events','rg_ops_evidence')
  and column_name in ('chain_seq','chain_prev_hash','chain_entry_hash','chain_alg','evidence_hash_alg');

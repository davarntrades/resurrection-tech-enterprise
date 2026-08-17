\set ON_ERROR_STOP on

-- Guarded by scripts/runtime/level2-live-validation.cjs. Validation IDs are
-- deterministic and unmistakably non-production.
begin;

do $$
begin
  if exists (select 1 from public.rg_orgs where id in ('validation_org_a_do_not_use_in_prod','validation_org_b_do_not_use_in_prod') and name not like 'VALIDATION_%_DO_NOT_USE_IN_PROD') then
    raise exception 'validation fixture collision with non-validation organisation';
  end if;
end $$;

-- Clean only known validation fixtures from a prior interrupted run.
delete from public.rg_integration_events where id like 'validation_event_%_do_not_use_in_prod';
delete from public.rg_integration_connectors where id='validation_connector_do_not_use_in_prod';
delete from public.rg_evidence_chain_heads where org_id in ('validation_org_a_do_not_use_in_prod','validation_org_b_do_not_use_in_prod');
delete from public.rg_runtime_resources where id like 'validation_resource_%_do_not_use_in_prod';
delete from public.rg_deployment_profiles where id='validation_deployment_profile_do_not_use_in_prod';
delete from public.rg_reports where id='validation_report_do_not_use_in_prod';
delete from public.rg_decisions where id='validation_decision_do_not_use_in_prod';
delete from public.rg_environments where id in ('validation_env_a_do_not_use_in_prod','validation_env_b_do_not_use_in_prod','validation_env_legacy_do_not_use_in_prod');
delete from public.rg_orgs where id in ('validation_org_a_do_not_use_in_prod','validation_org_b_do_not_use_in_prod');

insert into public.rg_orgs(id,name,slug,plan,status)
values
 ('validation_org_a_do_not_use_in_prod','VALIDATION_ORG_A_DO_NOT_USE_IN_PROD','validation-org-a-do-not-use-in-prod','pilot','active'),
 ('validation_org_b_do_not_use_in_prod','VALIDATION_ORG_B_DO_NOT_USE_IN_PROD','validation-org-b-do-not-use-in-prod','pilot','active');

insert into public.rg_environments(id,org_id,kind,mode,name,status)
values
 ('validation_env_a_do_not_use_in_prod','validation_org_a_do_not_use_in_prod','test','shadow','VALIDATION_ENV_A_DO_NOT_USE_IN_PROD','active'),
 ('validation_env_b_do_not_use_in_prod','validation_org_b_do_not_use_in_prod','test','shadow','VALIDATION_ENV_B_DO_NOT_USE_IN_PROD','active'),
 ('validation_env_legacy_do_not_use_in_prod','validation_org_a_do_not_use_in_prod','test','shadow','VALIDATION_ENV_LEGACY_DO_NOT_USE_IN_PROD','active');

insert into public.rg_integration_connectors(id,org_id,environment_id,type,name,config,status,health,created_by)
values ('validation_connector_do_not_use_in_prod','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod','validation','VALIDATION_CONNECTOR_DO_NOT_USE_IN_PROD','{"validation_marker":"LEVEL2_DISPOSABLE_VALIDATION"}'::jsonb,'configured','healthy','level2-validation');

insert into public.rg_integration_events(id,org_id,environment_id,type,actor,evidence,evidence_hash,evidence_hash_alg,immutable,occurred_at)
select
  'validation_event_' || lpad(g::text,3,'0') || '_do_not_use_in_prod',
  'validation_org_a_do_not_use_in_prod',
  'validation_env_a_do_not_use_in_prod',
  'validation.fixture',
  'level2-validation',
  jsonb_build_object('validation_marker','LEVEL2_DISPOSABLE_VALIDATION','ordinal',g),
  encode(digest(jsonb_build_object('validation_marker','LEVEL2_DISPOSABLE_VALIDATION','ordinal',g)::text,'sha256'),'hex'),
  'sha256-canonical-v1',
  true,
  clock_timestamp()
from generate_series(1,3) g;

-- A minimal decision/report make the runtime/report RLS surfaces non-empty.
insert into public.rg_decisions(
  id,org_id,environment_id,environment_kind,mode,enforced,engine_verdict,verdict,
  requires_human_review,reason,label,agent,engine_ok,created_at
) values (
  'validation_decision_do_not_use_in_prod','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod',
  'test','shadow',false,'ALLOW','ALLOW',false,'LEVEL2_DISPOSABLE_VALIDATION','validation','level2-validation',true,clock_timestamp()
);

insert into public.rg_reports(id,org_id,environment_id,period,headline,totals,generated_at,integrity)
values (
  'validation_report_do_not_use_in_prod','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod',
  'validation','LEVEL2_DISPOSABLE_VALIDATION','{"validation":1}'::jsonb,clock_timestamp(),'{"validation_marker":"LEVEL2_DISPOSABLE_VALIDATION"}'::jsonb
);

insert into public.rg_deployment_profiles(id,org_id,environment_id,profile,status,config)
values (
  'validation_deployment_profile_do_not_use_in_prod','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod',
  'SHADOW','draft','{"validation_marker":"LEVEL2_DISPOSABLE_VALIDATION"}'::jsonb
);

insert into public.rg_runtime_resources(id,org_id,environment_id,name,classification,blast_radius,meta)
values
 ('validation_resource_canary_do_not_use_in_prod','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod','VALIDATION_CANARY_DO_NOT_USE_IN_PROD','CANARY','inert','{"validation_marker":"LEVEL2_DISPOSABLE_VALIDATION"}'::jsonb),
 ('validation_resource_staging_do_not_use_in_prod','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod','VALIDATION_STAGING_DO_NOT_USE_IN_PROD','STAGING','contained','{"validation_marker":"LEVEL2_DISPOSABLE_VALIDATION"}'::jsonb),
 ('validation_resource_production_do_not_use_in_prod','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod','VALIDATION_PRODUCTION_DO_NOT_USE_IN_PROD','PRODUCTION','limited','{"validation_marker":"LEVEL2_DISPOSABLE_VALIDATION"}'::jsonb),
 ('validation_resource_sovereign_do_not_use_in_prod','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod','VALIDATION_SOVEREIGN_DO_NOT_USE_IN_PROD','SOVEREIGN','sovereign','{"validation_marker":"LEVEL2_DISPOSABLE_VALIDATION"}'::jsonb);

commit;

select jsonb_build_object(
  'fixture','LEVEL2_DISPOSABLE_VALIDATION',
  'org_a','validation_org_a_do_not_use_in_prod',
  'org_b','validation_org_b_do_not_use_in_prod',
  'environment_a','validation_env_a_do_not_use_in_prod',
  'environment_b','validation_env_b_do_not_use_in_prod'
)::text;

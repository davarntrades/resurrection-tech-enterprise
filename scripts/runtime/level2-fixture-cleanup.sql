\set ON_ERROR_STOP on
begin;

-- This file removes ONLY deterministic validation records. The Node orchestrator
-- verifies the disposable target before invoking it.
delete from public.rg_integration_events where id like 'validation_event_%_do_not_use_in_prod';
delete from public.rg_integration_connectors where id='validation_connector_do_not_use_in_prod';
delete from public.rg_evidence_chain_heads where org_id in ('validation_org_a_do_not_use_in_prod','validation_org_b_do_not_use_in_prod');
delete from public.rg_runtime_resources where id like 'validation_resource_%_do_not_use_in_prod';
delete from public.rg_deployment_profiles where id='validation_deployment_profile_do_not_use_in_prod' or environment_id='validation_env_a_do_not_use_in_prod';
delete from public.rg_reports where id='validation_report_do_not_use_in_prod';
delete from public.rg_decisions where id='validation_decision_do_not_use_in_prod';
delete from public.rg_environments where id in ('validation_env_a_do_not_use_in_prod','validation_env_b_do_not_use_in_prod','validation_env_legacy_do_not_use_in_prod');
delete from public.rg_orgs where id in ('validation_org_a_do_not_use_in_prod','validation_org_b_do_not_use_in_prod');

commit;
select '{"cleanup":"LEVEL2_DISPOSABLE_VALIDATION","status":"complete"}';

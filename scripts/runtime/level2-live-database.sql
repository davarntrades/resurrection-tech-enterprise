\set ON_ERROR_STOP on

-- Level-2 live database validation fixture/attack matrix.
-- NEVER run directly. Use `npm run runtime:level2-live-validation`, whose
-- fail-closed target guard refuses known production projects and requires an
-- explicit disposable target + destructive acknowledgement.

begin;

-- Refuse to operate if the session has somehow been pointed at a database that
-- already contains non-validation rows in the fixture organisations.
do $$
begin
  if exists (select 1 from public.rg_orgs where id in ('validation_org_a_do_not_use_in_prod','validation_org_b_do_not_use_in_prod') and name not like 'VALIDATION_%_DO_NOT_USE_IN_PROD') then
    raise exception 'validation fixture collision with non-validation organisation';
  end if;
end $$;

-- Clean only deterministic validation IDs from a prior interrupted run.
delete from public.rg_integration_events where id like 'validation_event_%_do_not_use_in_prod';
delete from public.rg_integration_connectors where id='validation_connector_do_not_use_in_prod';
delete from public.rg_evidence_chain_heads where org_id in ('validation_org_a_do_not_use_in_prod','validation_org_b_do_not_use_in_prod');
delete from public.rg_runtime_resources where id like 'validation_resource_%_do_not_use_in_prod';
delete from public.rg_deployment_profiles where id='validation_deployment_profile_do_not_use_in_prod';
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

select jsonb_build_object(
  'case','clean_chain_initial',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;

-- A/F. Canonical content mutation must be detected. The immutable update trigger
-- is temporarily disabled only inside this disposable validation transaction so
-- the verifier itself is exercised. ROLLBACK below restores the row and trigger.
savepoint attack_middle_mutation;
alter table public.rg_integration_events disable trigger rg_int_events_no_update;
update public.rg_integration_events set type='validation.fixture.tampered'
 where id='validation_event_002_do_not_use_in_prod';
select jsonb_build_object(
  'case','middle_record_mutation',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;
rollback to savepoint attack_middle_mutation;

-- B. Middle deletion must produce a missing/reordered sequence failure.
savepoint attack_middle_delete;
delete from public.rg_integration_events where id='validation_event_002_do_not_use_in_prod';
select jsonb_build_object(
  'case','middle_record_delete',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;
rollback to savepoint attack_middle_delete;

-- C. Newest deletion must be detected by comparing the record chain with the
-- persisted chain head.
savepoint attack_newest_delete;
delete from public.rg_integration_events where id='validation_event_003_do_not_use_in_prod';
select jsonb_build_object(
  'case','newest_record_delete',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;
rollback to savepoint attack_newest_delete;

-- D. Previous-hash linkage corruption.
savepoint attack_prev_hash;
alter table public.rg_integration_events disable trigger rg_int_events_no_update;
update public.rg_integration_events set chain_prev_hash=repeat('f',64)
 where id='validation_event_002_do_not_use_in_prod';
select jsonb_build_object(
  'case','prev_hash_corruption',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;
rollback to savepoint attack_prev_hash;

-- E. Sequence gap/reordering.
savepoint attack_sequence_gap;
alter table public.rg_integration_events disable trigger rg_int_events_no_update;
update public.rg_integration_events set chain_seq=9
 where id='validation_event_002_do_not_use_in_prod';
select jsonb_build_object(
  'case','sequence_gap',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;
rollback to savepoint attack_sequence_gap;

-- G. Legacy/pre-chain fixture in an isolated environment. The chain trigger is
-- disabled for the single historical fixture; it is immediately re-enabled.
savepoint legacy_fixture;
alter table public.rg_integration_events disable trigger rg_integration_events_chain_before_insert;
insert into public.rg_integration_events(id,org_id,environment_id,type,actor,evidence,evidence_hash,evidence_hash_alg,immutable,occurred_at)
values (
 'validation_event_legacy_do_not_use_in_prod',
 'validation_org_a_do_not_use_in_prod',
 'validation_env_legacy_do_not_use_in_prod',
 'validation.legacy',
 'level2-validation',
 '{"validation_marker":"LEVEL2_DISPOSABLE_VALIDATION","legacy":true}'::jsonb,
 encode(digest('{"validation_marker":"LEVEL2_DISPOSABLE_VALIDATION","legacy":true}','sha256'),'hex'),
 null,
 true,
 clock_timestamp()
);
alter table public.rg_integration_events enable trigger rg_integration_events_chain_before_insert;
select jsonb_build_object(
  'case','legacy_pre_chain',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_legacy_do_not_use_in_prod')
)::text;
rollback to savepoint legacy_fixture;

-- H. Clean chain must still pass after every controlled attack was rolled back.
select jsonb_build_object(
  'case','clean_chain_final',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;

-- The orchestration script captures evidence before cleanup. This transaction is
-- intentionally rolled back so even a disposable target is left clean.
rollback;

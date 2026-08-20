\set ON_ERROR_STOP on

-- Level-2 connector-chain attack matrix.
-- NEVER run directly. The guarded orchestrator creates validation-only fixtures,
-- verifies the target is disposable, captures these JSON results, then cleans up.

select jsonb_build_object(
  'case','clean_chain_initial',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;

-- A/F. Canonical content mutation. Disable immutable-update protection only
-- inside the transaction so the verifier itself is exercised; rollback restores
-- both the record and trigger state.
begin;
alter table public.rg_integration_events disable trigger rg_int_events_no_update;
update public.rg_integration_events set type='validation.fixture.tampered'
 where id='validation_event_002_do_not_use_in_prod';
select jsonb_build_object(
  'case','middle_record_mutation',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;
rollback;

-- B. Middle deletion.
begin;
delete from public.rg_integration_events where id='validation_event_002_do_not_use_in_prod';
select jsonb_build_object(
  'case','middle_record_delete',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;
rollback;

-- C. Newest deletion. Persisted chain-head state must expose truncation.
begin;
delete from public.rg_integration_events where id='validation_event_003_do_not_use_in_prod';
select jsonb_build_object(
  'case','newest_record_delete',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;
rollback;

-- D. Previous-hash linkage corruption.
begin;
alter table public.rg_integration_events disable trigger rg_int_events_no_update;
update public.rg_integration_events set chain_prev_hash=repeat('f',64)
 where id='validation_event_002_do_not_use_in_prod';
select jsonb_build_object(
  'case','prev_hash_corruption',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;
rollback;

-- E. Sequence gap/reordering.
begin;
alter table public.rg_integration_events disable trigger rg_int_events_no_update;
update public.rg_integration_events set chain_seq=9
 where id='validation_event_002_do_not_use_in_prod';
select jsonb_build_object(
  'case','sequence_gap',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;
rollback;

-- G. Legacy/pre-chain fixture in an isolated environment. It is rolled back and
-- must never be labelled plain VERIFIED.
begin;
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
select jsonb_build_object(
  'case','legacy_pre_chain',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_legacy_do_not_use_in_prod')
)::text;
rollback;

-- H. Every attack rolled back; the original chain remains healthy.
select jsonb_build_object(
  'case','clean_chain_final',
  'result',public.rg_verify_evidence_chain('integration_events','validation_org_a_do_not_use_in_prod','validation_env_a_do_not_use_in_prod')
)::text;

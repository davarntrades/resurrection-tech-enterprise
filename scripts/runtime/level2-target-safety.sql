\set ON_ERROR_STOP on

-- This is invoked only after the Node target guard. It provides a second,
-- database-local check that a supposedly empty disposable target does not
-- already contain tenant/customer runtime data before validation fixtures are
-- created. A target containing any such rows is refused rather than cleaned.
do $$
declare
  counts jsonb;
  total bigint;
begin
  select jsonb_build_object(
    'rg_orgs', (select count(*) from public.rg_orgs),
    'rg_environments', (select count(*) from public.rg_environments),
    'rg_decisions', (select count(*) from public.rg_decisions),
    'rg_reports', (select count(*) from public.rg_reports),
    'rg_integration_events', (select count(*) from public.rg_integration_events),
    'rg_ops_evidence', (select count(*) from public.rg_ops_evidence),
    'rg_deployment_profiles', (select count(*) from public.rg_deployment_profiles),
    'rg_runtime_resources', (select count(*) from public.rg_runtime_resources)
  ) into counts;

  total := (counts->>'rg_orgs')::bigint
    + (counts->>'rg_environments')::bigint
    + (counts->>'rg_decisions')::bigint
    + (counts->>'rg_reports')::bigint
    + (counts->>'rg_integration_events')::bigint
    + (counts->>'rg_ops_evidence')::bigint
    + (counts->>'rg_deployment_profiles')::bigint
    + (counts->>'rg_runtime_resources')::bigint;

  raise notice 'LEVEL2 target pre-fixture counts: %', counts;
  if total <> 0 then
    raise exception 'REFUSED: disposable validation target is not empty; customer/non-validation data may be present: %', counts;
  end if;
end $$;

select '{"case":"target_empty","status":"PASS"}';

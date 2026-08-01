-- GuardianOS — database-level append-only enforcement for evidence tables.
--
-- WHAT THIS CHANGES
-- Three evidence tables reject UPDATE at the database:
--   · public.rg_decisions           — governed decision log (SDK path)
--   · public.rg_integration_events  — governed connector evidence (gateway path)
--   · public.rg_ops_evidence        — operations agent decision evidence
--
-- WHY A TRIGGER AND NOT `revoke update`
-- The application connects as the Supabase service role, which BYPASSES row
-- level security, so an RLS policy constrains nothing on the path that matters.
-- A privilege `revoke` is closer, but it does not constrain the table owner or
-- a superuser — and a compromised operator credential, not the app, is the
-- threat this control is for. A `before update` trigger fires for EVERY role
-- including postgres. Turning it off requires `alter table … disable trigger`,
-- which is DDL: a far more conspicuous act than a single UPDATE statement, and
-- one that leaves a trace in any DDL-level audit.
--
-- WHY UPDATE IS BLOCKED AND DELETE IS NOT
-- UPDATE is the silent vector: the row count does not change, so nothing in the
-- product notices. On rg_integration_events an UPDATE was undetectable before
-- canonical evidence hashing, and on rg_ops_evidence it remains undetectable —
-- there is no chain over that table.
--
-- DELETE is deliberately left permitted because it is REQUIRED by a real,
-- deliberate product flow: lib/runtime/customeradmin.js permanentDelete() is
-- customer erasure (GDPR / offboarding). Its ORG_CHILD_COLLECTIONS list
-- (customeradmin.js:100-123) includes both `integration_events` and
-- `decisions`, and customeradmin.js:186 issues an org-scoped
-- `store.remove(collection, { org_id })` for each. A delete-blocking trigger
-- would break erasure — trading a real, exercised compliance capability for a
-- control that only moves deletion from "possible" to "possible by a different
-- route". The honest position is stated rather than hidden: see RESIDUAL RISK.
--
-- SAFETY: is any legitimate UPDATE being blocked?
-- No. Verified by exhaustive search of lib/, app/ and scripts/ at the time of
-- this migration: `store.update(…)` is never called with "decisions",
-- "integration_events" or "ops_evidence". lib/ops/evidence.js:8 states the
-- module "exposes no update/delete" by design, and store.insert()
-- (lib/runtime/store.js:167) and appendDecision() (store.js:317) both issue a
-- plain INSERT with no upsert / ON CONFLICT DO UPDATE clause, so no write path
-- can reach an UPDATE indirectly. scripts/runtime/evidence-append-only.test.cjs
-- fails the build if that ever stops being true.
--
-- OPERATIONAL NOTE — schema backfills
-- Adding a column is unaffected (ALTER TABLE does not fire row triggers), but
-- BACKFILLING one on existing rows is an UPDATE and will be rejected. That is
-- intended. A backfill is an operator decision that should be explicit:
--
--   alter table public.rg_integration_events disable trigger rg_int_events_no_update;
--   update public.rg_integration_events set … where …;
--   alter table public.rg_integration_events enable  trigger rg_int_events_no_update;
--
-- Re-running this migration re-creates the triggers, so a window left open by a
-- half-finished backfill is closed by the next deploy.
--
-- RESIDUAL RISK (not closed by this migration)
--   · Record DELETION remains possible. On rg_decisions it is detectable —
--     verifyChain() (lib/runtime/store.js:344) recomputes prev_hash → entry_hash
--     and reports the seq where the chain first breaks. On rg_integration_events
--     and rg_ops_evidence there is no chain, so deletion of a trailing record is
--     undetectable. Closing that needs cross-record chaining, which is tracked
--     separately and is NOT claimed here.
--
-- Additive, idempotent, no downtime, no backfill, no data rewritten.
--
--   psql "$SUPABASE_DB_URL" -f supabase/evidence_append_only.sql

-- One shared trigger function. `tg_table_name` names the offending table in the
-- error, so a rejected write is diagnosable from the application log alone.
-- SQL state 55006 (object_in_use) is used rather than a generic raise so the
-- rejection is machine-distinguishable from a constraint violation.
create or replace function public.rg_reject_evidence_update()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'append-only evidence: UPDATE is not permitted on %.%', tg_table_schema, tg_table_name
    using errcode = '55006',
          hint = 'Evidence records are write-once. Correct a record by appending a new one. See supabase/evidence_append_only.sql.';
end;
$$;

comment on function public.rg_reject_evidence_update() is
  'Append-only guard for GuardianOS evidence tables. Blocks UPDATE for every role including the table owner. DELETE is intentionally NOT blocked — customer erasure (customeradmin.js permanentDelete) depends on it.';

drop trigger if exists rg_decisions_no_update on public.rg_decisions;
create trigger rg_decisions_no_update
  before update on public.rg_decisions
  for each row execute function public.rg_reject_evidence_update();

drop trigger if exists rg_int_events_no_update on public.rg_integration_events;
create trigger rg_int_events_no_update
  before update on public.rg_integration_events
  for each row execute function public.rg_reject_evidence_update();

drop trigger if exists rg_ops_evidence_no_update on public.rg_ops_evidence;
create trigger rg_ops_evidence_no_update
  before update on public.rg_ops_evidence
  for each row execute function public.rg_reject_evidence_update();

notify pgrst, 'reload schema';

-- GuardianOS — normalized connector audit projection.
--
-- The projection itself creates NO tables: it is a read-only view over evidence
-- that the governed execution path already writes (rg_integration_events,
-- rg_integration_connectors, rg_ops_proposals, rg_bedrock_invocation_runs,
-- rg_communication_runs). The only schema change is somewhere to persist the
-- rendered section alongside the report it belongs to.
--
-- Additive, idempotent and safe to run against a live database. Historical
-- reports keep connector_activity NULL — they are never rewritten, and a NULL
-- renders as "section absent" rather than as "no connector activity".
--
-- Apply after governance_runtime.sql. Requires no downtime and no backfill.
--
--   psql "$SUPABASE_DB_URL" -f supabase/connector_audit_projection.sql

alter table public.rg_reports add column if not exists connector_activity jsonb;

comment on column public.rg_reports.connector_activity is
  'Normalized governed connector activity for the report window (summary, per-connector rollup, evidence register, integrity findings). NULL for reports generated before the projection existed.';

-- rg_reports already has row level security enabled and is service-role only
-- (see governance_runtime.sql). A new column inherits that policy, so no grant
-- or policy change is required or made here.

notify pgrst, 'reload schema';

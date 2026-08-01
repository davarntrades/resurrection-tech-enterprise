-- GuardianOS — read-only assurance status introspection.
--
-- WHY THIS EXISTS
-- supabase/evidence_append_only.sql installs `before update` triggers on the
-- three evidence tables. Nothing in the product could confirm they were still
-- there: scripts/ops/schema-check.cjs probes tables and columns over PostgREST,
-- which cannot see triggers, so a project passes the schema check with the
-- append-only guard entirely absent. The only way to know was to open the SQL
-- editor and query pg_trigger by hand.
--
-- This function makes that same query available to the Control Room, so the
-- assurance panel reports what the database ACTUALLY has rather than assuming
-- the migration was applied.
--
-- WHAT IT IS NOT
-- It changes no trigger, no table, no policy and no data. It reads system
-- catalogs and returns four scalar columns. It cannot enable, disable, create
-- or drop anything — there is deliberately no counterpart that writes.
--
-- SECURITY
-- `security definer` is required: pg_trigger rows for a table are only visible
-- to a role with rights on that table, and a future non-service-role caller
-- would otherwise see an empty set and conclude the guard is missing — a
-- fail-DANGEROUS reading. The function is pinned to an empty search_path and
-- returns only: table name, trigger name, enabled flag, and whether the trigger
-- fires BEFORE UPDATE. No table contents, no row counts, no evidence, no
-- configuration, and nothing derived from a secret.
--
-- Execute is granted to service_role only, matching every other rg_* surface.
--
-- Additive, idempotent, no downtime. Safe to run against a live database.
--
--   psql "$SUPABASE_DB_URL" -f supabase/assurance_status.sql

create or replace function public.rg_assurance_append_only()
returns table (
  table_name  text,
  trigger_name text,
  enabled     boolean,
  before_update boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.relname::text                        as table_name,
    t.tgname::text                         as trigger_name,
    -- tgenabled: 'O' origin (normal), 'A' always, 'R' replica, 'D' disabled.
    -- A trigger left DISABLED by an interrupted backfill is present but inert,
    -- which must read as degraded rather than verified.
    (t.tgenabled <> 'D')                   as enabled,
    -- tgtype bit 0 = row-level BEFORE (unset = AFTER), bit 4 = UPDATE.
    -- Checked rather than assumed: a trigger named *_no_update that fires AFTER
    -- UPDATE would not block anything, and must not report as verified.
    ((t.tgtype & 2) = 2 and (t.tgtype & 16) = 16) as before_update
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and n.nspname = 'public'
    and c.relname in ('rg_decisions', 'rg_integration_events', 'rg_ops_evidence')
  order by c.relname, t.tgname;
$$;

comment on function public.rg_assurance_append_only() is
  'Read-only. Reports which append-only UPDATE triggers exist on the evidence tables, whether each is enabled, and whether it genuinely fires BEFORE UPDATE. Used by the Control Room assurance panel so append-only enforcement is verified from database metadata rather than assumed. Creates, alters and drops nothing.';

revoke all on function public.rg_assurance_append_only() from public;
grant execute on function public.rg_assurance_append_only() to service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- Operations Agent — evidence provenance / tamper-evidence schema upgrade.
--
-- Keeps the durable Supabase schema in parity with lib/ops/evidence.js.
-- Safe to run repeatedly and safe on existing environments: all changes are
-- additive and preserve legacy evidence rows as unverifiable rather than
-- rewriting or backfilling hashes that were never originally recorded.
--
-- Apply after:
--   supabase/governance_runtime.sql
--   supabase/operations_agent.sql
-- ============================================================================

alter table public.rg_ops_evidence
  add column if not exists ruleset_hash text;

alter table public.rg_ops_evidence
  add column if not exists engine_commit text;

alter table public.rg_ops_evidence
  add column if not exists provider jsonb;

alter table public.rg_ops_evidence
  add column if not exists seq integer;

alter table public.rg_ops_evidence
  add column if not exists prev_hash text;

alter table public.rg_ops_evidence
  add column if not exists record_hash text;

alter table public.rg_ops_evidence
  add column if not exists hash_alg text;

-- These are deliberately non-unique. The application detects and reports a
-- duplicate sequence number as a chain fork caused by concurrent writers;
-- enforcing uniqueness here would hide that evidence behind a failed insert.
create index if not exists rg_ops_ev_seq_idx
  on public.rg_ops_evidence(seq);

create index if not exists rg_ops_ev_record_hash_idx
  on public.rg_ops_evidence(record_hash);

create index if not exists rg_ops_ev_engine_commit_idx
  on public.rg_ops_evidence(engine_commit);

-- Ask PostgREST to refresh its schema cache immediately so newly deployed
-- application code can write the new fields without waiting for cache expiry.
notify pgrst, 'reload schema';

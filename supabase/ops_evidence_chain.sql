-- ===========================================================================
-- rg_ops_evidence — hash-chain and provenance columns.
--
-- WHY THIS EXISTS
--
-- The evidence hash-chain change added seven columns to the row inserted by
-- lib/ops/evidence.js `record()`:
--
--     seq, prev_hash, record_hash, hash_alg      the append-only chain
--     ruleset_hash, engine_commit                engine provenance
--     provider                                   provider metadata
--
-- None of them were ever added to the table. Writes throw by design
-- (lib/runtime/store.js: "WRITES deliberately keep using find/insert and still
-- throw"), so once that code was deployed EVERY governed action failed at the
-- evidence step with PostgREST PGRST204 — Gmail sends, Bedrock invocations, and
-- every ops proposal alike.
--
-- The failure was invisible for two reasons. Reads were unaffected: head()
-- filters on Number.isInteger(r.seq) and a missing column reads as undefined.
-- And propose() records evidence AFTER governor.evaluate() has already
-- succeeded, so the throw surfaced through the integration gateway's broad
-- catch as "Runtime Governance unavailable" — a database schema error reported
-- as an engine outage, complete with a real governance_latency_ms from the
-- round trip that had genuinely succeeded.
--
-- SAFETY
--
-- Every column is additive and nullable, so this is safe to apply to a live
-- table with existing rows and requires no backfill. Rows written before the
-- chain existed keep NULL seq/record_hash; lib/ops/evidence.js `verify()`
-- counts those as `legacy` and reports them as unverifiable — deliberately
-- never as tampered, because an absent hash cannot distinguish an old
-- serialisation from an alteration.
--
-- No unique index is placed on `seq`. Fork detection (two records sharing a
-- seq) already lives in verify(), and a database-level constraint would convert
-- a concurrent write into a hard failure of the governed action itself — a
-- fail-closed behaviour change that this migration is not the place to make.
--
--   psql "$DATABASE_URL" -f supabase/ops_evidence_chain.sql
--
-- Then confirm with:
--
--   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
--     node scripts/ops/schema-check.cjs
-- ===========================================================================

-- Append-only chain.
alter table public.rg_ops_evidence add column if not exists seq          bigint;
alter table public.rg_ops_evidence add column if not exists prev_hash    text;
alter table public.rg_ops_evidence add column if not exists record_hash  text;
alter table public.rg_ops_evidence add column if not exists hash_alg     text;

-- Engine provenance: which ruleset and which engine build produced the verdict.
alter table public.rg_ops_evidence add column if not exists ruleset_hash text;
alter table public.rg_ops_evidence add column if not exists engine_commit text;

-- Provider metadata for records produced by a governed provider call.
alter table public.rg_ops_evidence add column if not exists provider     jsonb;

-- head() orders by seq to find the chain tip; keep that lookup indexed.
create index if not exists rg_ops_evidence_seq_idx
  on public.rg_ops_evidence (seq)
  where seq is not null;

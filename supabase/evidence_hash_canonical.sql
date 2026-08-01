-- GuardianOS — verifiable connector evidence hashes.
--
-- rg_integration_events.evidence_hash was written as sha256 over
-- JSON.stringify(evidence) in INSERTION order. Postgres jsonb does not preserve
-- key order, so that hash cannot be recomputed from the stored row: verifying it
-- would report ordinary, untampered evidence as altered. Evidence written from
-- now on is hashed over a canonical (recursively key-sorted) serialisation,
-- which is a property of the content rather than of the serialisation.
--
-- This column records WHICH algorithm produced the stored hash. Rows written
-- before this migration keep evidence_hash and carry a NULL marker; the audit
-- projection reports those as "not verifiable", never as tampered — a legacy
-- serialisation and an alteration are indistinguishable, and guessing in the
-- accusing direction is unacceptable in an audit trail.
--
-- Additive, idempotent, no backfill, no downtime. Historical evidence is never
-- rewritten.
--
--   psql "$SUPABASE_DB_URL" -f supabase/evidence_hash_canonical.sql

alter table public.rg_integration_events add column if not exists evidence_hash_alg text;

comment on column public.rg_integration_events.evidence_hash_alg is
  'Algorithm that produced evidence_hash. sha256-canonical-v1 = sha256 over recursively key-sorted JSON, recomputable from the stored row. NULL = written before canonical hashing; the hash is retained but cannot be independently verified.';

create index if not exists rg_int_events_hash_alg_idx
  on public.rg_integration_events (evidence_hash_alg) where evidence_hash_alg is not null;

-- rg_integration_events already has row level security enabled and is
-- service-role only (see integration_gateway.sql). A new column inherits that
-- policy, so no grant or policy change is required or made here.

notify pgrst, 'reload schema';

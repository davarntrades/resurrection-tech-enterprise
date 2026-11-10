-- ============================================================================
-- decision_evidence_v3 — additive, backwards-compatible, idempotent.
--
-- 1. shadow_observed_only. The gateway has written this field on every decision
--    since the shadow/enforce repair (PR #294), but no migration created it.
--    On a schema without it, every decision insert failed, including the
--    additive-field retry: enforce mode failed closed on all traffic and shadow
--    mode recorded nothing. lib/runtime/store.js now drops it on a pending
--    migration (it is derivable from `mode` / `enforced`); this column makes the
--    explicit flag durable again.
--
-- 2. Evidence binding (docs/EVIDENCE-BINDING.md). `trajectory_hash` now
--    identifies the whole ordered trajectory. The fields below record the
--    deciding step's action hash (what trajectory_hash used to carry), the
--    hash binding the decision to its principal, tenant, policy and verdicts,
--    and the schema under which trajectory_hash was computed. Historical rows
--    keep NULL here: their trajectory_hash used the legacy (deciding-action)
--    semantics, and NULL is how replay recognises them.
--
-- No backfill: rg_decisions is append-only (evidence_append_only.sql forbids
-- UPDATE), and historical rows must not be rewritten. Nothing here alters the
-- hash chain (chainCore) or the keyed MAC payload, so existing evidence still
-- verifies.
--
-- Rollback: these columns are nullable and unused by older code; leave them in
-- place. If they must be removed, drop them only after rolling the gateway back
-- to a revision that does not write them (see docs/INDEPENDENT-AUDIT-REPAIRS.md).
-- ============================================================================

alter table public.rg_decisions
  add column if not exists shadow_observed_only   boolean,
  add column if not exists decision_binding_hash  text,
  add column if not exists deciding_action_hash   text,
  add column if not exists trajectory_hash_schema text;

comment on column public.rg_decisions.shadow_observed_only is
  'true when recorded in shadow mode (enforcement inactive); NULL on rows written before decision_evidence_v3 — derive from mode/enforced';
comment on column public.rg_decisions.decision_binding_hash is
  'sha256 over trajectory_hash, principal, tenant, identity source, domains, horizon, ruleset hash, engine commit and every verdict (morrison.decision-binding.v1)';
comment on column public.rg_decisions.deciding_action_hash is
  'canonical action hash of the deciding (strictest) step';
comment on column public.rg_decisions.trajectory_hash_schema is
  'schema of trajectory_hash; NULL = legacy semantics (deciding-step action hash)';

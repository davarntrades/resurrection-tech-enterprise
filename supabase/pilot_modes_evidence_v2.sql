-- Limited-pilot operating modes and evidence integrity v2 (2026-11-09).
--
-- Additive only: no existing column changes, no existing row is rewritten,
-- and the append-only triggers (evidence_append_only.sql) are unaffected
-- because ALTER TABLE ... ADD COLUMN does not fire row triggers.
--
-- Apply BEFORE deploying the gateway changes that write these fields.
--   * rg_decisions: the gateway drops these additive fields and retries if
--     the columns are missing (store.appendDecision), so decisions are still
--     recorded, but without the mode fields and without the keyed MAC.
--   * rg_execution_records: the insert FAILS without these columns and
--     execution then fails closed (EXECUTION_EVIDENCE_UNAVAILABLE). Execution
--     adapters are also disabled unless RUNTIME_ENABLE_EXECUTION_ADAPTERS is
--     set, so nothing executes before this migration is applied.

alter table public.rg_decisions
  add column if not exists mode_source text,
  add column if not exists would_be_verdict text,
  add column if not exists enforcement_active boolean,
  add column if not exists evaluation_failed boolean,
  add column if not exists record_mac text,
  add column if not exists mac_version integer;

comment on column public.rg_decisions.would_be_verdict is
  'Strictest verdict enforcement would apply. In shadow mode the caller was told ALLOW.';
comment on column public.rg_decisions.record_mac is
  'HMAC-SHA256 (RUNTIME_EVIDENCE_KEY) over entry_hash and the fields chainCore omits (mac_version 1).';

alter table public.rg_execution_records
  add column if not exists enforcement_active boolean,
  add column if not exists authorized_action_hash text,
  add column if not exists executed_action_hash text,
  add column if not exists morrison_action_hash text,
  add column if not exists evidence_mac text;

comment on column public.rg_execution_records.authorized_action_hash is
  'Canonical digest of the action Morrison governed (caller step plus resolved execution target).';
comment on column public.rg_execution_records.executed_action_hash is
  'Canonical digest of the action handed to the adapter. Equal to authorized_action_hash when the binding held.';

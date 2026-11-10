# Evidence binding contract

Status: introduced by the independent-audit repairs (Finding B). Applies to
decisions recorded with `trajectory_hash_schema = "morrison.trajectory.v1"`.
Rows recorded earlier carry `NULL` there and keep their legacy meaning (below).

## What was wrong

`/v1/govern` returned the deciding (terminal) step's action hash under the name
`trajectory_hash`. `/v1/evaluate`, which the gateway uses for replay, returned
the engine's own 16-hex state hash under the same name. So:

- `[read_file, rm -rf /]` and `[summarize, rm -rf /]` shared one
  "trajectory" hash, `487061fe…`. Inserting, removing or reordering earlier
  steps did not change it.
- Replay compared values from two different hash functions, so an exact replay
  could never match. `scripts/runtime/gateway.test.cjs` failed on "exact
  replay proves determinism" at `ddd1f55`.

## The contract

Two hashes answer two questions. Each response from `/v1/govern` carries both,
plus the inputs needed to recompute them.

### `trajectory_hash`: what was evaluated

```
trajectory_hash = sha256( canonical_json({
  "schema": "morrison.trajectory.v1",
  "action_hashes": [ canonical_action_hash({tool, args}) for each step, in order ]
}) )
```

- `canonical_action_hash` is the engine's own canonical hash: sha256 over the
  canonical `{tool, args}`, the same value as each step's `action_hash`.
- `canonical_json` means `json.dumps(sort_keys=True, separators=(",", ":"),
  ensure_ascii=False)`, encoded as UTF-8.

The hash changes when any step is inserted, removed or reordered, or when any
tool or argument changes. It does not change with argument key order, a
process restart or replay. It is the same on `/v1/govern` and `/v1/evaluate`.
It deliberately does not depend on who asked or under which policy.

### `decision_binding_hash`: this decision about it

```
decision_binding_hash = sha256( canonical_json({
  "schema": "morrison.decision-binding.v1",
  "trajectory_hash", "principal", "tenant", "identity_source",
  "domains": sorted or null, "horizon",
  "ruleset_hash", "engine_commit",
  "step_verdicts": [...], "strictest_verdict"
}) )
```

The response includes the `binding` object itself, so any holder can recompute
the hash. A different principal, tenant, identity source, domain set, horizon,
ruleset or engine yields a different binding hash for the same trajectory.

### `deciding_action_hash`

This is the canonical action hash of the deciding (strictest) step: the value
`trajectory_hash` used to carry, now under an honest name. The execution gate
still binds grants to the action digest of the action actually performed, not
to this field.

## Recording and replay

- `rg_decisions` stores `trajectory_hash`, `trajectory_hash_schema`,
  `decision_binding_hash` and `deciding_action_hash`. The last three are added
  by `supabase/decision_evidence_v3.sql`. The gateway accepts only 64-hex
  values for the hashes and records `NULL` otherwise.
- `replayDecision` reports `deterministic` and `hash_matches` only for rows
  with a schema. For legacy rows (`trajectory_hash_schema IS NULL`) both are
  `null`, with `trajectory_hash_schema: "legacy_deciding_action_hash"`. A legacy
  hash is not a trajectory identity, and reporting it as a mismatch would be
  false.
- Determinism is asserted only for an exact replay (`store_payloads` on)
  against the same ruleset, as before.
- Neither the hash chain (`chainCore`) nor the keyed MAC payload changed, so
  historical evidence still verifies.

## Tests

- `governance-service/test_trajectory_hash_binding.py` has 14 tests. 13 fail
  at `ddd1f55`. They cover insertion, removal, reordering, parameters,
  principal, tenant, policy, restart and replay, canonicalisation and
  recomputation.
- `scripts/runtime/production-equivalent.e2e.cjs` exercises the real engine,
  gateway and disposable database: exact replay of every recorded decision is
  deterministic and hash-matched.

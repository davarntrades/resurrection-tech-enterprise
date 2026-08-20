# Connector Evidence-Chain Static Review

**Review date:** 17 August 2026  
**Branch:** `agent/general-production-readiness`  
**Readiness classification:** **GENERAL-PRODUCTION VALIDATION INCOMPLETE**

This document reviews the connector/operations evidence-chain implementation without claiming the still-blocked destructive live mutation proof. R-1 remains reduced, not closed.

## Scope

Reviewed components:

- `supabase/general_production_readiness.sql`
- `supabase/general_production_readiness_003.sql`
- `supabase/general_production_readiness_005.sql`
- `supabase/general_production_readiness_006.sql`
- `lib/runtime/production-readiness.js`
- production report integrity integration
- prepared disposable attack fixtures in `scripts/runtime/level2-live-database.sql`

The chain is additive to the existing per-record canonical evidence hash. Historical rows are deliberately not rewritten into a chain they never originally participated in.

## Chain structure

Each chained connector event / operations evidence row receives:

- `chain_seq`
- `chain_prev_hash`
- `chain_entry_hash`
- chain algorithm metadata

A separate persisted `rg_evidence_chain_heads` row is keyed by:

`chain_name + org_id + environment_id`

and contains:

- final sequence number;
- final chain hash;
- update timestamp.

The integrity property therefore has **two layers**:

1. record-local/cross-record recomputation and linkage;
2. a persisted authoritative tail commitment.

Both are needed. A record-only linked list cannot reliably expose deletion of its final row because the surviving prefix is still internally consistent.

## Transaction and concurrency review

### Sequence assignment

The insert trigger:

1. creates the chain-head row if missing with `ON CONFLICT DO NOTHING`;
2. selects the chain-head row with `FOR UPDATE`;
3. assigns `new.chain_seq = head.seq + 1`;
4. sets `new.chain_prev_hash` to the previous head (or genesis);
5. computes the new entry hash;
6. updates the chain-head sequence/hash;
7. returns the new row for the same insert transaction.

### Concurrent inserts

Concurrent inserts for the same `(chain_name, org_id, environment_id)` serialize on the same chain-head row lock. The second transaction cannot assign its sequence until the first releases the row lock. A partial unique index on `(org_id, environment_id, chain_seq)` for chained integration events provides an additional uniqueness constraint.

**Static conclusion:** the design prevents normal concurrent inserts from independently reading the same head and allocating the same next sequence.

**Live concurrency stress remains useful future evidence** but is not a current mandatory Level-2 acceptance item.

## Canonical hashing review

The connector chain does not merely hash arbitrary stringified event JSON. The chain trigger constructs a fixed ordered JSON array containing selected scalar fields and the existing per-record evidence hash metadata, then hashes:

`chain_prev_hash + "|" + canonical_input`

with SHA-256.

The verifier reconstructs the same canonical input from persisted rows and recomputes each entry hash.

For connector evidence the canonical chain input includes the row identity/scope/sequence/timestamp, event type and actor, per-record evidence hash/algorithm, occurrence time and immutable flag. Therefore changing a canonicalised field without rebuilding the chain is detectable.

The separate per-record `evidence_hash` remains important because the chain commits to it rather than embedding an unbounded evidence payload directly into the chain input.

## Verification algorithm

For a scoped chain, the verifier:

1. counts legacy (`chain_seq is null`) and chained rows;
2. handles legacy-only/empty state explicitly;
3. orders chained rows by `chain_seq`;
4. starts at expected sequence `1` and the genesis hash;
5. rejects a missing/reordered sequence;
6. rejects `chain_prev_hash` mismatch;
7. recomputes canonical entry hash and rejects mismatch;
8. advances the expected sequence and previous hash;
9. when an environment is explicitly scoped, loads the persisted chain head;
10. rejects a head sequence/hash that does not match the surviving record chain.

Expected failure classifications include:

- `missing_or_reordered_sequence`
- `prev_hash_mismatch`
- `entry_hash_mismatch`
- `chain_head_mismatch`

## Required questions

### How is deletion of the newest chained record detected?

By the **persisted chain head**.

Deleting the newest record leaves the remaining rows internally self-consistent, but `rg_evidence_chain_heads.seq` and `.head_hash` still commit to the deleted final row. After iterating the surviving rows, `rg_verify_evidence_chain()` compares the surviving count/final hash with the persisted head. A mismatch returns:

`status=BROKEN, reason=chain_head_mismatch`.

The prepared disposable attack matrix asserts exactly this reason for newest-row deletion.

### How is concurrent insertion prevented from corrupting sequence ordering?

The BEFORE INSERT chain trigger locks the per-chain head row with PostgreSQL `SELECT ... FOR UPDATE`. Sequence allocation and head advancement occur in the insert transaction while that row is locked. Same-chain writers therefore serialize. Unique sequence indexes provide an additional database constraint against duplicate sequence allocation.

### What prevents historical records from being falsely labelled verified?

Historical rows are not backfilled with synthetic chain metadata. `chain_seq IS NULL` is counted as legacy.

- legacy rows and no chained rows → `LEGACY_PRE_CHAIN`, `ok=false`;
- chained rows plus legacy rows → `VERIFIED_WITH_LEGACY_PREFIX`, preserving an explicit legacy count;
- only the newly chained subset can receive plain `VERIFIED`.

The application readiness layer also counts legacy rows and reports a warning-style `VERIFIED_WITH_LEGACY` state instead of erasing that history.

### What state is authoritative: record chain, persisted chain head, or both?

**Both.**

The record chain proves sequence/link/content integrity over the records that remain. The persisted chain head commits to the expected tail and is necessary to expose truncation of the newest record. A healthy result requires record recomputation/linkage and final persisted-head agreement.

Neither alone provides the complete intended guarantee.

### What occurs if chain verification itself cannot read the source?

It is not converted into healthy or empty.

The application calls the verifier through an explicit RPC result wrapper. RPC absence, permission errors, backend absence or other read faults produce an `UNKNOWN`/unavailable result. In the authoritative production readiness engine, a required `UNKNOWN` becomes **BLOCKED**. Reporting logic must represent the evidence source as unavailable/integrity-unknown rather than an authoritative zero.

## Deletion and mutation matrix prepared for live execution

`npm run runtime:level2-live-validation` is prepared to run the following against validation-only fixtures on an explicitly disposable target:

| Attack | Expected verifier result |
|---|---|
| Clean initial chain | `VERIFIED` |
| Modify middle canonical field | `BROKEN` |
| Delete middle row | `BROKEN` / sequence gap |
| Delete newest row | `BROKEN` / `chain_head_mismatch` |
| Corrupt `chain_prev_hash` | `BROKEN` / `prev_hash_mismatch` |
| Change `chain_seq` to create gap | `BROKEN` / sequence failure |
| Insert isolated pre-chain legacy fixture | explicit legacy/unverifiable, never plain `VERIFIED` |
| Clean chain after all transaction rollbacks | `VERIFIED` |

Each deliberate corruption runs inside a transaction and rolls back. The setup/cleanup utilities operate only on deterministic IDs containing `validation_*_do_not_use_in_prod`, and the Node guard rejects both known production Supabase project refs.

## Append-only relationship

Existing append-only triggers prevent normal UPDATE of `rg_decisions`, `rg_integration_events` and `rg_ops_evidence`. DELETE remains available to privileged customer erasure/administrative flows, which is why deletion detection matters independently from update prevention.

The destructive verifier test temporarily disables the integration-event update trigger **inside a disposable transaction** only to prove the chain verifier itself catches data mutation. The transaction rollback restores both data and trigger state. This is intentionally stronger than merely proving that the update trigger rejects normal tampering.

## Report/readiness integration

Production readiness evaluates connector and operations chains per environment. A broken chain becomes a required failure; unreadable verification becomes UNKNOWN and therefore blocks readiness. Historical prefix state remains visible rather than being silently called fully verified.

Production evidence/report projection also carries integrity/source-health context so missing connector evidence is not interpreted as authoritative zero activity.

## Recovery/reset semantics

There is intentionally no automatic production “repair” routine that rewrites historical chain records or silently advances the persisted head to whatever rows happen to remain. Doing so would destroy the very evidence of truncation.

The prepared validation fixture can be reset because its records are disposable and visibly labelled. A real evidence-chain break should instead be treated as an integrity incident and investigated against backups/authoritative customer retention procedures.

## Residual limitations

1. **Mandatory live attack evidence is still missing.** Static inspection does not close R-1.
2. Historical pre-chain rows cannot gain retrospective cryptographic proof from this migration.
3. The persisted chain head is stored in the same PostgreSQL trust domain as the records. A sufficiently privileged attacker able to mutate both records and head while also bypassing database controls could rewrite history. External anchoring/non-repudiation remains a stronger future control, not a claim of this branch.
4. Database-level chain verification is linear in the number of scoped chained records; large-chain operational performance should continue to be observed.
5. SECURITY DEFINER verifier/trigger functions are sensitive privileged code. They set `search_path=public` and have restricted invocation, but deployed permissions still require live inspection.
6. Live mutation tests must never use production/customer evidence.

## Current R-1 conclusion

**R-1 remains REDUCED / NOT CLOSED.**

Static review supports the architecture claim that new connector/operations evidence is cross-record chained with concurrency-safe sequence allocation and a persisted tail commitment capable of detecting newest-row deletion. The mandatory destructive validation on a disposable migrated target remains the evidence needed to move beyond that claim.

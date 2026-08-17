# Validation Evidence Index

**Date:** 17 August 2026  
**Branch:** `agent/general-production-readiness`  
**PR:** #268  
**Current classification:** **GENERAL-PRODUCTION VALIDATION INCOMPLETE**

This index maps the 25 mandatory acceptance criteria to executable evidence. `LIVE-VALIDATION-PENDING.json` is authoritative for outstanding live work.

| # | Acceptance criterion | Status | Primary command / evidence | CI / artifact | Live proof required? | Current blocker |
|---:|---|---|---|---|---|---|
| 1 | Full existing CI green on final branch | **BLOCKED** | PR #268 checks | Existing production E2E remains red when governance service unavailable | Yes, existing live gate | Runtime Governance availability/configuration must be corrected without weakening fail-closed behavior |
| 2 | New production-readiness tests green | **PASS** | `npm run runtime:production-readiness-test`; `npm run runtime:production-profile-gates` | General Production Readiness Validation | No for code claim | None |
| 3 | Live two-tenant RLS proof | **BLOCKED** | `npm run runtime:level2-live-validation` | `artifacts/level2-live-validation/tenant-isolation.json` pending | **Yes** | No disposable migrated DB |
| 4 | Client org spoofing rejected | **PASS deterministic / live pending** | production-readiness contract + `level2-tenant-live.cjs` prepared | GPR workflow + future tenant evidence | Yes for real DB path | No disposable DB |
| 5 | Cross-tenant reads fail | **BLOCKED LIVE** | `level2-tenant-live.cjs` / tenant `READ_SURFACES` | future tenant evidence | **Yes** | No disposable DB |
| 6 | Cross-tenant writes fail | **BLOCKED LIVE** | `level2-tenant-live.cjs` | future tenant evidence | **Yes** | No disposable DB |
| 7 | Connector record mutation detected | **BLOCKED LIVE** | `level2-live-database.sql` | future `connector-chain-attacks.jsonl` | **Yes** | No disposable DB |
| 8 | Middle connector deletion detected | **BLOCKED LIVE** | `level2-live-database.sql` | future chain attack artifact | **Yes** | No disposable DB |
| 9 | Newest connector deletion detected | **BLOCKED LIVE** | verifier + persisted chain-head assertion | future chain attack artifact | **Yes** | No disposable DB |
| 10 | Legacy connector evidence never falsely verified | **PASS static / live pending** | `CONNECTOR-CHAIN-STATIC-REVIEW.md`; legacy fixture in attack matrix | GPR contracts + future chain artifact | Yes for acceptance | No disposable DB |
| 11 | Evidence-record failure blocks Production execution | **PASS deterministic** | `npm run runtime:production-profile-gates` | GPR workflow | No additional live proof required for code invariant; target preflight still required overall | None |
| 12 | Non-durable store blocks Production | **PASS** | `npm run runtime:production-profile-gates` | GPR workflow | No | None |
| 13 | RLS scope failure blocks Production | **PASS deterministic / live scope pending** | production profile gate | GPR workflow | Live RLS acceptance remains criterion 3 | No disposable DB for end-to-end scope proof |
| 14 | Missing source cannot appear as authoritative zero | **PASS deterministic / live state matrix pending** | `npm run runtime:source-health-states`; report contracts | GPR workflow | **Yes** for controlled DB failure states | No disposable DB |
| 15 | Production preflight behaves correctly | **PASS engine semantics / live target pending** | `npm run runtime:production-preflight -- --json`; orchestrator | future `production-preflight.json` | **Yes** | No migrated controlled target |
| 16 | Production cannot activate while preflight BLOCKED | **PASS** | `npm run runtime:production-profile-gates`; Control Room state contract | GPR workflow | No | None |
| 17 | Sovereign preflight behaves correctly | **PASS contracts / target pending** | `npm run runtime:sovereign-readiness`; `npm run runtime:sovereign-preflight -- --json` | Sovereign Readiness + future target artifact | **Yes** | No representative customer-owned sovereign target |
| 18 | Sovereign cannot activate with prohibited vendor dependency | **PASS deterministic** | `npm run runtime:sovereign-outage-test -- --simulated`; deployment validation | GPR + Sovereign suites | Representative proof still contributes to criterion 19 | None for code invariant |
| 19 | Vendor-outage survivability passes for sovereign_private | **BLOCKED** | `npm run runtime:sovereign-outage-test -- --target` | future `sovereign-outage-target.json` | **Yes** | No representative customer-owned sovereign boundary |
| 20 | Control Room accurately renders READY/DEGRADED/BLOCKED/UNKNOWN | **PASS deterministic / live backend pending** | `npm run runtime:control-room-states` | GPR workflow | **Yes** for controlled real backend states | No disposable backend |
| 21 | CANARY/STAGING/PRODUCTION/SOVEREIGN editor complete | **PASS** | Control Room source + build + state contract | GPR build/tests | No | None |
| 22 | Mutation tests prove key assertions non-vacuous | **PARTIAL** | `npm run smoke:mutation`; validation safety negative tests; future chain attacks | Enterprise Regression + GPR | **Yes** for new DB chain/RLS mutations | No disposable DB |
| 23 | Historical security documentation updated without erasing disclosures | **PARTIAL / PREPARED** | `08-GENERAL-PRODUCTION-VALIDATION-STATUS.md` plus static reviews | repository docs | Final closure update only after live proof | Validation incomplete; docs 04–07 intentionally not rewritten closed |
| 24 | Morrison governance semantics remain unchanged | **PASS** | diff scope + Enterprise Regression baseline | Enterprise Regression | No | None |
| 25 | Supervised pilot behavior remains backward compatible | **PASS deterministic** | profile-gate pilot passthrough + runtime/ops/contracts/Enterprise Regression | GPR + Enterprise Regression | No | None |

## Evidence sources

### General Production Readiness Validation

Expected non-live commands on every final preparation head:

```bash
npm run runtime:production-readiness-test
npm run runtime:production-profile-gates
npm run runtime:validation-safety
npm run runtime:source-health-states
npm run runtime:control-room-states
npm run runtime:sovereign-outage-test -- --simulated
npm run runtime:test
npm run runtime:harden
npm run runtime:isolation
npm run contracts
npm run ops:test
npm run sovereign:ci
npm run lint
npm run typecheck
npm run build
```

The workflow also records npm audit JSON, dependency paths and an audit-fix dry run. If disposable RLS secrets are absent it prints **NOT VALIDATED** and does not fall back to a production project.

### Enterprise Regression

Provides the broader Morrison/runtime baseline, sector trajectories, PDF/report validation, scale stress and existing mutation suite. Baseline drift is an explicit failure rather than automatically updated during validation.

### Existing production E2E

Provides actual live Control Room and governed connector evidence. It remains a failure when Runtime Governance is unavailable. `production-smoke-classify.cjs` adds diagnosis only; it never turns an unavailable engine into PASS.

### Static security reviews

- `RLS-STATIC-REVIEW.md`
- `CONNECTOR-CHAIN-STATIC-REVIEW.md`
- `DEPENDENCY-SECURITY-REVIEW.md`
- `08-GENERAL-PRODUCTION-VALIDATION-STATUS.md`

### Authoritative pending-live manifest

`LIVE-VALIDATION-PENDING.json` contains machine-readable outstanding requirements, required environment, destructive flag, expected result and evidence destination.

## Prepared disposable-database evidence bundle

`npm run runtime:level2-live-validation` writes under:

`artifacts/level2-live-validation/`

including:

- `run.json`
- `schema-verification.jsonl`
- `target-safety.jsonl`
- `fixture-setup.jsonl`
- `tenant-isolation.json`
- `connector-chain-attacks.jsonl`
- `connector-chain-assertions.json`
- `source-health-semantics.txt`
- `production-preflight.json`
- `fixture-cleanup.jsonl`

The command exits non-zero while mandatory sovereign/Control Room target evidence is still pending; a partial database success cannot silently become Level 2.

## Current audit conclusion

A large portion of criteria are now internally code-verified, but criteria 1, 3, 5–10, 14–15, 17, 19–20, 22–23 still contain mandatory external/live portions. Accordingly the current classification remains:

> **GENERAL-PRODUCTION VALIDATION INCOMPLETE**

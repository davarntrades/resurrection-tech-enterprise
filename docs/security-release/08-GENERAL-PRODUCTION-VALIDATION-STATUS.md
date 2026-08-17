# General Production Validation Status

**Date:** 17 August 2026  
**Branch:** `agent/general-production-readiness`  
**PR:** #268 — Validate general production readiness architecture  
**Classification:** **GENERAL-PRODUCTION VALIDATION INCOMPLETE**

This document is additive. It does not replace or rewrite the 1 August 2026 security-release findings in documents 04–07.

## Current position

### CODE VERIFIED

The release candidate has substantial deterministic/internal verification for the implemented General Production Readiness architecture, including:

- production-readiness contracts;
- production profile activation/fail-closed gates;
- runtime gateway tests;
- runtime hardening;
- runtime isolation;
- engineering contracts;
- operations regression;
- sovereign contracts and connector integration;
- lint, typecheck and production build;
- Enterprise Regression/baseline and stress coverage;
- existing mutation testing;
- deterministic source-health semantics;
- deterministic Control Room READY/DEGRADED/BLOCKED/UNKNOWN rendering contracts;
- destructive validation target guards;
- simulated sovereign vendor-dependency refusal.

No Morrison Runtime Governance policy/kernel/reachability/execution semantic was changed by the validation-preparation work.

### LIVE VALIDATION PENDING

The following Level-2 evidence still requires an authorised disposable migrated database:

- two-tenant JWT + anon-key + PostgreSQL RLS proof;
- cross-tenant read and write denial;
- forged organisation parameter rejection through the real database path;
- invalid, expired, malformed and missing tenant identity denial;
- connector middle/newest deletion attacks;
- connector canonical-content, previous-hash and sequence attacks;
- legacy/pre-chain truthfulness;
- clean chain reconstruction/verification;
- controlled live source-health failure states;
- actual Production preflight on the migrated controlled target;
- real Control Room state forcing against that target.

The authoritative machine-readable list is `LIVE-VALIDATION-PENDING.json`.

### SOVEREIGN TARGET VALIDATION PENDING

`sovereign_private` has deterministic architecture tests, but a representative customer-owned boundary is still required to prove:

- customer-owned durable data plane;
- customer-controlled evidence and secret stores;
- governance engine inside the customer boundary;
- restricted egress and approved provider provenance;
- telemetry disabled/authorised;
- local rollback/recovery;
- vendor-outage survivability without a mandatory Resurrection Tech callback.

The local simulated outage harness is intentionally labelled simulation and is not customer-boundary evidence.

## Historical risk addendum — not a closure statement

### R-1 — Connector evidence deletion / chain integrity

**Historical status:** Open as of 1 August 2026.

**Remediation implementation:** New connector and operations evidence is database-chained with sequence, previous hash, entry hash and a persisted per-scope chain head. Verification checks record ordering/linkage/canonical hashes and final chain-head agreement. Historical rows are retained as explicit legacy/pre-chain evidence.

**Code verification completed:** Chain SQL contracts, readiness integration, append-only contracts and static chain review.

**Live verification still required:** middle deletion, newest deletion, canonical mutation, `prev_hash` mutation, sequence gap, legacy fixture and clean-chain pass on disposable migrated PostgreSQL.

**Current status:** **Reduced / not closed.**

### R-2 — Application-only tenant isolation

**Historical status:** Open as of 1 August 2026.

**Remediation implementation:** A short-lived server-signed tenant JWT + anon-key path now exercises PostgreSQL RLS. Final ordinary authenticated privileges are read-only on curated tenant surfaces. Production execution adds a live RLS scope proof before hardened execution.

**Code verification completed:** tenant claim contracts, spoof rejection, tenant-store review, least-privilege SQL contract, static RLS review.

**Live verification still required:** real ORG_A/ORG_B read/write matrix and invalid identity matrix on a disposable migrated database.

**Residual limitation:** the generic server persistence adapter still uses the service role for privileged backend/operator writes. Those paths are not falsely described as RLS-bound.

**Current status:** **Reduced / not closed.**

### R-3 — Fail-closed production evidence/readiness invariants

**Historical status:** Open as of 1 August 2026.

**Remediation implementation:** Production/Sovereign wrappers require hardened invariants and validated preflight before activation/execution. Non-durable evidence, failed scope proof, unrecorded ALLOW and blocked readiness fail closed.

**Code verification completed:** production profile gates, runtime regression, governance-unavailable connector contracts and live production-smoke evidence that provider boundaries were not reached while governance was unavailable.

**Live verification still required:** target Production preflight and remaining controlled fault matrix on the migrated disposable environment.

**Current status:** **Materially reduced; deployment-level closure pending live target evidence.**

### R-5 — Missing source under-reporting

**Historical status:** Open as of 1 August 2026.

**Remediation implementation:** source health is explicit and required UNKNOWN becomes BLOCKED. Reporting cannot treat unreadable connector evidence as authoritative zero.

**Code verification completed:** deterministic states cover available, unavailable/unknown, missing schema, permission denied, read error and not configured.

**Live verification still required:** induce the applicable database/schema/permission/read states on a controlled migrated target and verify API + Control Room output.

**Current status:** **Materially reduced; live state matrix pending.**

## Production E2E status

The existing production E2E remains an enforcing gate. Recent evidence showed:

- the basic Control Room production browser checks passed;
- Gmail direct connector validation reached Google;
- governed Gmail and Customer Support execution failed before a governance verdict;
- no Gmail or Bedrock provider execution occurred;
- the failure was classified at the governance-infrastructure boundary.

This is evidence of fail-closed behavior, **not** a green production E2E. The workflow now emits an explicit diagnostic class (`GOVERNANCE_UNAVAILABLE`, `AUTH_FAILURE`, `PROVIDER_FAILURE`, or `APPLICATION_REGRESSION`) without changing pass/fail semantics.

## Dependency review status

CI now captures the complete npm audit JSON, dependency tree and an `npm audit fix --dry-run --json` remediation plan as evidence. Dependency changes are only accepted when they are narrowly compatible and the full non-live validation remains green.

See `DEPENDENCY-SECURITY-REVIEW.md` for the reviewed advisory set.

## Level model

- **Level 1:** General-production architecture hardening implemented; validation pending.
- **Level 2:** General-production architecture internally validated.
- **Level 3:** External limited-pilot validated.
- **Level 4:** Customer production validated.
- **Level 5:** Independently assessed/certified where applicable.

**Current state remains below Level 2 because mandatory live database and representative sovereign evidence are unavailable.**

## Required last mile

When authorised disposable infrastructure is available, the intended flow is:

1. apply the ordered baseline + General Production Readiness migrations;
2. export the guarded disposable-target metadata/secrets;
3. run `npm run runtime:level2-live-validation`;
4. run/complete the live Control Room state matrix;
5. run `npm run runtime:sovereign-preflight -- --json` on representative `sovereign_private` infrastructure;
6. run `npm run runtime:sovereign-outage-test -- --target` only on that representative boundary;
7. verify the final PR workflows;
8. update documents 04–07 with dated evidence-backed status changes only if the proof passes.

Until then the release claim remains:

> **General-production architecture hardening implemented and extensively code-verified; mandatory live validation pending.**

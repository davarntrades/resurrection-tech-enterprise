# General Production Validation Status

**Date:** 17 August 2026  
**Branch:** `agent/general-production-readiness`  
**PR:** #268 — Validate general production readiness architecture  
**Classification:** **GENERAL-PRODUCTION VALIDATION INCOMPLETE**

This document is additive. It does not replace or rewrite the 1 August 2026 security-release findings in documents 04–07.

## Current position

The remaining work has been reduced to three operational validation classes:

1. **Disposable migrated Supabase/Postgres proof** — live RLS, connector-chain destructive tests, live source-health states and Production preflight.
2. **Representative `sovereign_private` proof** — customer-owned boundary, restricted egress and vendor-outage survivability.
3. **Live Runtime Governance credential/deployment wiring** — the hosted governance service is reachable, but the authenticated evaluation path is currently not proven from production.

Everything that can safely be converted into deterministic code/tests/fixtures without those targets has been prepared.

### CODE VERIFIED

The release candidate has substantial deterministic/internal verification for the implemented General Production Readiness architecture, including:

- production-readiness contracts;
- production profile activation/fail-closed gates;
- runtime gateway tests;
- runtime hardening and isolation;
- engineering contracts;
- operations regression;
- sovereign contracts and connector integration;
- lint, typecheck and production build;
- Enterprise Regression/baseline and stress coverage;
- existing mutation testing;
- deterministic source-health semantics;
- deterministic Control Room READY/DEGRADED/BLOCKED/UNKNOWN rendering contracts;
- destructive validation target guards;
- simulated sovereign vendor-dependency refusal;
- governance-engine transport/auth/HTTP diagnostic classes;
- zero-current npm audit findings from a fresh `npm ci` on the committed remediated lockfile.

No Morrison Runtime Governance policy/kernel/reachability/execution semantic was changed by the validation-preparation or diagnostic work.

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

The authoritative machine-readable list is `LIVE-VALIDATION-PENDING.json` and the shortest execution path is `09-LAST-MILE-VALIDATION-RUNBOOK.md`.

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

**Remediation implementation:** Production/Sovereign wrappers require hardened invariants and validated preflight before activation/execution. Non-durable evidence, failed scope proof, unrecorded ALLOW and blocked readiness fail closed. Production readiness also requires `GOVERNANCE_TOKEN` rather than treating a health-only engine response as sufficient authenticated readiness.

**Code verification completed:** production profile gates, runtime regression, governance diagnostic contracts and live production-smoke evidence that provider boundaries were not reached while governance was unavailable.

**Live verification still required:** target Production preflight and remaining controlled fault matrix on the migrated disposable environment.

**Current status:** **Materially reduced; deployment-level closure pending live target evidence.**

### R-5 — Missing source under-reporting

**Historical status:** Open as of 1 August 2026.

**Remediation implementation:** source health is explicit and required UNKNOWN becomes BLOCKED. Reporting cannot treat unreadable connector evidence as authoritative zero.

**Code verification completed:** deterministic states cover available, unavailable/unknown, missing schema, permission denied, read error and not configured.

**Live verification still required:** induce the applicable database/schema/permission/read states on a controlled migrated target and verify API + Control Room output.

**Current status:** **Materially reduced; live state matrix pending.**

## Production E2E status

The existing production E2E remains an enforcing gate. Current evidence establishes:

- the basic Control Room production browser checks pass;
- Gmail direct connector validation reaches Google;
- governed Gmail and Customer Support execution fail closed before provider execution;
- no Gmail or Bedrock provider execution occurs while governance is unavailable;
- the configured hosted Runtime Governance service responds `200` on `/health` from the CI runner;
- the advisory `/v1/evaluate` path responds `401` when no governance bearer token is supplied;
- the CI diagnostic run that produced the 401 had no governance bearer token configured.

This materially narrows the live red E2E from a generic service outage to an **authentication/deployment-wiring investigation**. It does not prove that Vercel Production lacks or has an incorrect `GOVERNANCE_TOKEN`, because the connected Vercel tooling does not expose environment-variable values. That deployment credential must be verified against the governance service's accepted token and then the existing governed smoke must be rerun.

The workflow accepts both `GOVERNANCE_TOKEN` and `PRODUCTION_GOVERNANCE_TOKEN` secret naming for its non-authoritative CI service probe. The production application remains authoritative.

A governance authentication failure remains a failed gate; it is never converted into a pass.

## Dependency review status

The six earlier high-severity npm audit findings have been remediated without `--force` or a major-version upgrade. The tested lockfile was committed only after the complete General Production readiness gate passed, and a subsequent fresh `npm ci` reported:

```text
info: 0
low: 0
moderate: 0
high: 0
critical: 0
total: 0
```

See `DEPENDENCY-SECURITY-REVIEW.md` for the package-by-package review and compatibility result.

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
5. verify the Production governance token/deployment wiring and rerun the live governed smokes;
6. run `npm run runtime:sovereign-preflight -- --json` on representative `sovereign_private` infrastructure;
7. run `npm run runtime:sovereign-outage-test -- --target` only on that representative boundary;
8. verify the final PR workflows;
9. update documents 04–07 with dated evidence-backed status changes only if the proof passes.

Until then the release claim remains:

> **General-production architecture hardening implemented and extensively code-verified; mandatory live validation pending.**

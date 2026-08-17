# Last-Mile General Production Validation Runbook

**Date:** 17 August 2026  
**Classification:** **GENERAL-PRODUCTION VALIDATION INCOMPLETE**

This is the shortest operational path from the current release candidate to a supportable Level-2 validation result. It does not replace `LIVE-VALIDATION-PENDING.json`; that manifest remains the authoritative machine-readable list of pending live proofs.

## What is already manageable in CI

The branch has deterministic coverage for production readiness semantics, fail-closed production profile gates, validation-target safety, source-health semantics, Control Room READY/DEGRADED/BLOCKED/UNKNOWN presentation contracts, sovereign architecture simulation, runtime regressions, isolation/hardening, contracts, operations, sovereign regressions, lint, typecheck and build.

The live-production E2E remains independent of those deterministic suites. A governance outage remains a hard failure and is never converted into a pass.

## External blocker A — disposable migrated Supabase/Postgres

Required characteristics:

- no customer data;
- not `resurrection-tech-prod`;
- not `trajectory-prod`;
- direct Postgres connection suitable for transaction-scoped destructive validation;
- Supabase API URL, anon key and JWT signing secret;
- all baseline migrations plus General Production Readiness migrations applied;
- permission to create and remove only the committed `VALIDATION_*_DO_NOT_USE_IN_PROD` fixtures.

Set the explicit fail-closed validation guard:

```bash
export RUNTIME_VALIDATION_TARGET=disposable
export VALIDATION_ENVIRONMENT_CLASSIFICATION=DISPOSABLE
export VALIDATION_PROJECT_REF='<disposable-project-ref>'
export VALIDATION_DATA_MARKER=LEVEL2_DISPOSABLE_VALIDATION
export VALIDATION_TARGET_EMPTY=1
export ALLOW_DESTRUCTIVE_VALIDATION=1
export VALIDATION_DATABASE_URL='<disposable postgres connection>'
export NEXT_PUBLIC_SUPABASE_URL='https://<disposable-project-ref>.supabase.co'
export SUPABASE_ANON_KEY='<disposable anon key>'
export SUPABASE_JWT_SECRET='<disposable JWT secret>'
```

Then run:

```bash
npm run runtime:level2-live-validation
```

Do not bypass a refusal from the validation safety guard. Fix the target metadata instead.

Expected remaining evidence from this command:

1. schema/migration verification;
2. two-tenant fixture creation;
3. real JWT/anon-key RLS proof;
4. cross-tenant read/write denial;
5. forged/invalid identity rejection;
6. connector clean-chain verification;
7. middle-record deletion detection;
8. newest-record deletion detection;
9. mutation/prev-hash/sequence-gap detection;
10. legacy/pre-chain handling;
11. source-health output;
12. controlled Production preflight;
13. validation-only cleanup/evidence bundle.

## External blocker B — representative `sovereign_private` target

Required characteristics:

- customer-controlled governance engine;
- customer-controlled durable Postgres-compatible data plane;
- customer-controlled evidence store;
- customer-controlled secret store;
- telemetry disabled;
- restricted egress;
- approved provider endpoint under test control;
- Resurrection Tech-hosted control-plane dependency disabled for the outage phase;
- implemented rollback/recovery path.

Run:

```bash
npm run runtime:sovereign-preflight -- --json
npm run runtime:sovereign-outage-test -- --target
```

The existing `--simulated` result is architecture evidence only and must never be described as customer-boundary proof.

## Operational blocker C — live Runtime Governance service

The production E2E is intentionally red when Runtime Governance cannot produce an executable permit. Direct Gmail connector validation can succeed while governed Gmail and Bedrock remain blocked; this distinction is expected fail-closed behaviour.

Diagnostics now distinguish configuration, egress, DNS, connection, TLS, timeout, authentication, endpoint mismatch, service 5xx and other HTTP failures. Use the E2E `governance-service-probe` artifact first, then the authenticated `/api/runtime/admin/governance-health` probe after the corresponding application build is deployed.

Do not weaken the governed smoke to make CI green. Correct the service endpoint/configuration/deployment and rerun the existing workflow.

## Final promotion sequence

Only after both external validation targets exist and pass:

```text
migrate disposable target
→ npm run runtime:level2-live-validation
→ production preflight passes
→ exercise real Control Room state matrix
→ sovereign_private preflight passes
→ sovereign target outage test passes
→ rerun all CI including production E2E
→ update historical security-release addenda with executed evidence
→ review classification
```

Until that sequence is complete, the classification remains:

**GENERAL-PRODUCTION VALIDATION INCOMPLETE**

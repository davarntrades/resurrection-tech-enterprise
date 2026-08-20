# Guardian OS — General Production Readiness

**Status:** architecture hardening implemented on `agent/general-production-readiness`; deployment verification is still required per target environment.

This document distinguishes three different statements:

- **Architecture-ready:** required controls exist in code/schema and are wired into the execution path.
- **Internally validated:** those controls have been executed against the target deployment and tests/preflight passed.
- **Externally production-proven:** sustained customer production operation and/or independent assurance exists.

This change is intended to reach the first state and provide the machinery to prove the second. It does **not** assert the third.

## Production architecture

The hardened path is:

`authenticated tenant identity → RLS-constrained org/environment scope proof → governed proposal → Morrison decision → scope-bound permit → production readiness gate → execute only on ALLOW → durable evidence → chained integrity → audit projection → operator alerting`

Morrison policy/kernel semantics are unchanged.

## Required production invariants

A Production deployment is `READY` only when the shared readiness engine confirms:

1. governance engine reachable and authenticated;
2. durable runtime/evidence store active;
3. active production execution wrappers that convert an unrecorded decision to `BLOCK`;
4. general-production migrations present;
5. RLS enabled with active tenant policies and least-privilege authenticated grants;
6. a live two-organisation isolation proof succeeds through `SUPABASE_ANON_KEY` + a short-lived server-minted JWT;
7. decision chain verifies;
8. connector/ops evidence chain verifies (historical pre-chain records are disclosed, not relabelled verified);
9. audit sources report `available`, rather than an implied clean zero;
10. append-only evidence triggers are present and enabled;
11. alert routing is configured;
12. rollback is declared;
13. rate-limit posture is explicitly observable.

`UNKNOWN` is never promoted to `READY`.

## Database migrations

Apply after the existing runtime, operations, integration and append-only migrations, in numeric order:

1. `supabase/general_production_readiness.sql`
2. `supabase/general_production_readiness_002.sql`
3. `supabase/general_production_readiness_003.sql`
4. `supabase/general_production_readiness_004.sql`
5. `supabase/general_production_readiness_005.sql`
6. `supabase/general_production_readiness_006.sql`

These are additive. Historical connector evidence is not rewritten into a chain.

## Production activation

1. Deploy the candidate build to the target environment.
2. Apply and verify required migrations.
3. Configure `SUPABASE_ANON_KEY` and `SUPABASE_JWT_SECRET` for the tenant-scoped RLS path, plus existing backend/admin secrets.
4. Ensure at least two test organisations exist (or set `PRODUCTION_RLS_TEST_ORG_A/B`).
5. Configure an alert route and rollback mechanism.
6. Run `npm run runtime:production-preflight` (or `--json`).
7. In Control Room select the environment and Production profile.
8. Run Production Preflight from the UI.
9. Activate only when the backend returns `READY`; activation is refused otherwise.

A frontend selection cannot create production readiness.

## Pilot compatibility

`DEVELOPMENT`, `SHADOW`, `GUARDED_PILOT` and `ENFORCED` remain distinct from hardened Production. Existing supervised pilot workflows do not require the full production prerequisite set. The production wrappers only become authoritative after a `PRODUCTION` or `SOVEREIGN` profile is active.

## Evidence integrity

For new `rg_integration_events` and `rg_ops_evidence` records, PostgreSQL assigns a chain sequence and previous/head hash under a locked chain-head row. Verification checks:

- sequence gaps/reordering;
- previous-link mismatch;
- entry-hash mismatch;
- persisted chain-head mismatch, including deletion of the last chained row.

Historical null-chain rows are reported as legacy/pre-chain. They are not silently rewritten.

## Source completeness

Production reports carry an integrity envelope containing source health and connector-chain health. If a required source is missing/unreadable, the report states that evidence completeness could not be established and removes authoritative zero totals from the connector projection.

## Still required before claiming internally validated production readiness

Run the target database migrations, execute the live tenant-isolation contract, execute the new preflight, run full CI/contracts/ops/sovereign suites, and verify the deployment-specific alert and rollback routes. Until those executed results exist for the target environment, the correct claim is **production architecture hardening implemented**, not “production proven.”

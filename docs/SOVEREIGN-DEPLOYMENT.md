# Guardian OS — Sovereign Deployment

## Purpose

A Sovereign deployment is a hardened Production deployment whose operational trust boundary is customer-owned and whose governance enforcement does not require Resurrection Tech infrastructure to remain reachable.

The Control Room uses the existing Guardian OS sovereign/provider primitives; it does not create a second deployment system.

## First-class deployment profile

The Control Room `SOVEREIGN` profile derives secure defaults:

- customer environment/data plane;
- customer-owned control plane;
- customer-controlled secrets and evidence;
- outbound telemetry disabled;
- external dependencies denied by default / restricted to approved customer endpoints;
- fail-closed execution;
- local governance engine required;
- durable evidence required;
- dedicated tenant/environment boundary;
- customer-owned provider credentials;
- explicit admin access;
- customer-controlled audit export.

For a durable database-backed sovereign deployment, the low-level provider profile is `GUARDIAN_PROFILE=sovereign_private`. It reuses the existing Supabase/Postgres adapter **only when the endpoint is customer-owned**, uses bundled policy, local monitoring, no vendor telemetry, signed updates and restricted egress.

The older `sovereign` / `air_gapped` local-file profiles are preserved for compatibility and isolated evaluation. They are **not automatically promoted to general-production READY** because the current file backend does not provide the same database RLS, multi-process chain-head locking and durable-store guarantees. That distinction is deliberate.

## Guided activation

Control Room flow:

1. Select environment.
2. Select **Sovereign**.
3. Guardian OS derives the secure profile automatically.
4. Operator supplies only customer-controlled references that cannot be inferred: secret store, evidence store and approved provider endpoints.
5. Run Sovereign Preflight.
6. Activate only if every required invariant is `PASS` and overall posture is `READY`.

The UI cannot self-attest local-engine placement, customer ownership or network isolation. Those facts remain `UNKNOWN/BLOCKED` until the target environment proves them.

## Target-environment attestations

The current sovereign preflight expects the target deployment to explicitly expose:

- `GUARDIAN_PROFILE=sovereign_private`
- `GUARDIAN_CUSTOMER_DATA_PLANE=1`
- `GUARDIAN_LOCAL_ENGINE=1`
- `GUARDIAN_PROVIDER_ENDPOINTS_VERIFIED=1`
- `GUARDIAN_EGRESS_VERIFIED=1`
- `GUARDIAN_RECOVERY_RUNBOOK=<customer-controlled reference>`
- `GUARDIAN_ROLLBACK_PATH=<local rollback reference>` or `RUNTIME_ROLLBACK_COMMAND`
- `GUARDIAN_CUSTOMER_SECRET_STORE=<reference>` (or supplied through the guided profile)
- `GUARDIAN_CUSTOMER_EVIDENCE_STORE=<reference>` (or supplied through the guided profile)

These are deployment attestations, not substitutes for code verification. The preflight also executes the general production checks, engine reachability, RLS tenant proof and evidence-chain verification.

## Sovereign preflight

Run:

```bash
npm run runtime:sovereign-preflight -- --secret-store customer-vault://guardian/runtime --evidence-store customer-db://guardian/evidence
```

or append `--json` for machine-readable output.

A `READY` result requires, among other things:

- no mandatory Resurrection Tech external control plane;
- customer-owned durable data plane;
- governance engine reachable inside the declared target boundary;
- customer-controlled secret/evidence stores;
- outbound telemetry disabled;
- provider endpoint provenance verified;
- restricted/denied egress verified;
- signed policy/update bundles;
- decision and connector chains healthy;
- tenant isolation verified;
- production fail-closed evidence controls active;
- local rollback and recovery path documented;
- vendor-outage survivability established.

## Vendor-outage survivability

The readiness engine marks this `PASS` only when policy is bundled, durable state is customer-owned, the governance engine is declared local, Resurrection Tech control-plane dependency is false and outbound telemetry is off. Under those conditions, Resurrection Tech reachability is not required for enforcement.

If any of those facts is unknown, Sovereign activation remains blocked.

## Network and provider endpoints

Provider calls still pass through the existing sovereign integration gateway. In hardened Sovereign mode they are additionally behind the production readiness gate and a live RLS tenant/environment proof. Undeclared connector kinds and endpoints remain deny-by-default under the existing sovereign policy.

## Claims boundary

This architecture supports the claim that Guardian OS has a **customer-owned sovereign deployment architecture with backend-gated activation** once its preflight has actually passed in the customer's environment.

It does not, by itself, support claims of certification, independent audit, penetration-test assurance, national-security accreditation, or production-proven operation.

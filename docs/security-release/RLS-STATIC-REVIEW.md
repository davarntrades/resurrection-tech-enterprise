# Row-Level Security Static Review

**Review date:** 17 August 2026  
**Branch:** `agent/general-production-readiness`  
**Readiness classification:** **GENERAL-PRODUCTION VALIDATION INCOMPLETE**

This is a static architecture review. It is not the mandatory live two-tenant RLS proof and it does not close R-2.

## Executive result

The General Production Readiness branch adds a real tenant-scoped database path:

`authenticated server identity → server-minted short-lived JWT → SUPABASE_ANON_KEY → authenticated role → PostgreSQL RLS`

`lib/runtime/tenant-store.js` does not accept a client-provided organisation as authority. `assertTrustedOrg()` rejects an organisation mismatch, `assertRuntimeScope()` proves an organisation/environment relationship through the authenticated/RLS path, and `proveTenantBoundary()` is the prepared two-tenant contract.

The production database migration enables RLS and tenant policies broadly, while `general_production_readiness_005.sql` removes the migration's initial broad CRUD grants and leaves ordinary authenticated tenant identities read-only on a curated set of audit/control surfaces. API keys, connector secrets and direct chain-head access remain unavailable to the ordinary authenticated role.

**Residual concern:** `lib/runtime/store.js` is still the platform's generic privileged persistence adapter and constructs its production Supabase client with `SUPABASE_SERVICE_ROLE_KEY`. A number of server-only runtime, report, operator and Control Room persistence operations therefore bypass RLS by design. The hardened production execution wrappers add an RLS scope proof before execution, but this branch has not converted every generic server persistence operation into a tenant JWT operation. These paths must be treated as privileged backend paths and verified separately; R-2 must not be described as fully closed until the live matrix passes and the privileged-path inventory is accepted.

## Tenant authority

| Layer | Authority | Static result |
|---|---|---|
| Request/body | Untrusted `org_id`/environment inputs | Must not be tenant authority |
| Server identity | Authenticated operator/runtime identity | Source of trusted organisation |
| Tenant JWT | Server-minted `org_id`, `role=authenticated`, short expiry | Implemented in `tenant-store.js` |
| Database | `rg_claim_org_id()` / `rg_tenant_matches()` | RLS compares row `org_id` with signed claim |
| Privileged backend | Supabase service role | Bypasses RLS intentionally; must remain server-only |

## RLS policy design

`general_production_readiness.sql` enables RLS and creates `rg_tenant_select`, `rg_tenant_insert`, `rg_tenant_update` and `rg_tenant_delete` policies for tenant-keyed tables when they exist. The policies use `public.rg_tenant_matches(org_id)`. `rg_orgs` uses `id = public.rg_claim_org_id()`.

The first migration temporarily grants CRUD so RLS can enforce those operations. **That is not the final privilege state.** `general_production_readiness_005.sql` revokes all authenticated table privileges and grants only `SELECT` on the approved ordinary-tenant surfaces. `_006.sql` makes the production control snapshot require this least-privilege condition before reporting `rls_enabled=true` to readiness.

### Final ordinary tenant readable surfaces

The final least-privilege migration grants authenticated `SELECT` on:

- `rg_orgs`
- `rg_environments`
- `rg_manifest_versions`
- `rg_manifests`
- `rg_decisions`
- `rg_reports`
- `rg_alerts`
- `rg_integration_connectors`
- `rg_integration_events`
- `rg_ops_proposals`
- `rg_ops_evidence`
- `rg_deployment_profiles`
- `rg_runtime_resources`

Sensitive material is explicitly removed from the ordinary tenant role:

- `rg_api_keys`
- `rg_integration_secrets`
- direct `rg_evidence_chain_heads` access

The broader migration also establishes RLS policies on additional integration/operations tables such as webhooks, deliveries, deployments, usage, events, transitions, handoffs, email events, incidents and intelligence snapshots. Their final authenticated privileges are revoked unless included in the curated readable set.

## Surface-by-surface review

| Surface | Tenant identifier | Ordinary tenant role | RLS enabled by GPR migration | Tenant policy | Service-role usage | Client-controlled org possible? | Expected live proof | Classification / concern |
|---|---|---|---|---|---|---|---|---|
| `rg_orgs` | `id` | SELECT | Yes | `id = rg_claim_org_id()` | Generic admin/store paths | Not through tenant client | A sees A, not B; B sees B, not A | Tenant read path ready for live proof |
| `rg_environments` | `org_id` | SELECT | Yes | `rg_tenant_matches(org_id)` | Generic store + operator | Tenant scope helper ignores body authority | A/envA visible; A/envB denied | Critical runtime scope proof |
| `rg_manifest_versions` | `org_id` | SELECT | Yes | tenant match | Generic store/runtime | No authority from body on tenant client | Cross-tenant rows absent | Live proof pending |
| `rg_manifests` | `org_id` | SELECT | Yes | tenant match | Generic store/runtime | Same | Cross-tenant rows absent | Live proof pending |
| `rg_decisions` | `org_id` | SELECT | Yes | tenant match | **Decision persistence uses privileged store** | Read identity is signed; write path privileged server | A/B read isolation plus privileged-write scope review | R-2 reduced, privileged write remains |
| `rg_reports` | `org_id` | SELECT only | Yes | tenant match | **Report generation/persistence uses privileged store** | Tenant update is denied by SQL privilege | A sees own report; cross-tenant update denied | Prepared live fixture covers both |
| `rg_alerts` | `org_id` | SELECT | Yes | tenant match | Server alert writer privileged | Tenant read claim signed | Cross-tenant rows absent | Live proof pending |
| `rg_integration_connectors` | `org_id` | SELECT | Yes | tenant match | Connector configuration/admin writes privileged | Tenant read claim signed | Cross-tenant connector invisible | Live proof pending |
| `rg_integration_events` | `org_id` | SELECT | Yes | tenant match | **Connector evidence writes privileged server path** | Tenant read claim signed | Cross-tenant evidence invisible | RLS + chain live proof pending |
| `rg_ops_proposals` | `org_id` | SELECT | Yes | tenant match | Operations agent writer privileged | Tenant read claim signed | Cross-tenant proposal invisible | Live proof pending |
| `rg_ops_evidence` | `org_id` | SELECT | Yes | tenant match | **Operations evidence writer privileged** | Tenant read claim signed | Cross-tenant evidence invisible | Live proof pending |
| `rg_deployment_profiles` | `org_id` | SELECT | Yes | tenant match | **Control Room profile writes intentionally privileged** | Activation route is operator-authenticated | Cross-tenant profile invisible to tenant JWT | Privileged intentionally |
| `rg_runtime_resources` | `org_id` | SELECT | Yes | tenant match | **Control Room classification writes intentionally privileged** | Resource upsert derives org from server-read environment | Cross-tenant resource invisible; forged org ignored | Privileged intentionally |
| `rg_api_keys` | `org_id` | none | Yes | tenant match exists | Server-only | Ordinary tenant cannot SELECT | Permission denial | Privileged intentionally / sensitive |
| `rg_integration_secrets` | `org_id` | none | Yes | tenant match exists | Server-only | Ordinary tenant cannot SELECT | Permission denial | Privileged intentionally / sensitive |
| `rg_evidence_chain_heads` | `org_id` | no direct tenant table access | Yes | SELECT policy exists but table privilege revoked | Chain trigger/verifier privileged | Not writable through tenant role | Verifier RPC only | Privileged intentionally / integrity state |

## Control Room review

`app/api/runtime/admin/deployment/route.ts` is an authenticated **operator** path, not an ordinary tenant database path.

For resource classification:

1. the browser supplies `environment_id`;
2. the backend reads that environment;
3. `org_id` is derived from the server-read environment;
4. an existing resource can only be updated when its existing `org_id` and `environment_id` match that selected server-read environment;
5. the resulting classification write is performed through the privileged runtime store and is admin-audited.

This is classified **privileged intentionally**. It must not be cited as evidence that service-role writes are RLS-enforced.

Deployment profile draft/preflight/activation is also a privileged operator workflow. The readiness/activation layer must validate the organisation/environment/profile relationship before activation; existing profile-gate tests prove blocked readiness cannot activate, while the live cross-tenant profile persistence proof remains pending.

## SECURITY DEFINER review

The General Production Readiness SQL contains SECURITY DEFINER functions for chain insertion/verification and readiness/source introspection. The reviewed functions explicitly set `search_path = public`, reducing search-path object substitution risk.

Relevant functions include:

- `rg_chain_integration_event()`
- `rg_chain_ops_evidence()`
- `rg_verify_evidence_chain()`
- `rg_source_health()`
- `rg_production_controls()`

The verifier/control functions have explicit execute grants rather than public execution. Direct chain-head table access is removed from authenticated users. Live privilege inspection is prepared in `scripts/runtime/level2-schema-verification.sql`.

## Service-role inventory and classification

### Privileged intentionally

- generic platform `store.js` production client;
- Control Room/operator reads and writes;
- deployment-profile draft/preflight/activation persistence;
- resource classification persistence;
- durable decision/evidence writes after server-side governance;
- connector/runtime state writes and report generation;
- chain-head maintenance through database triggers/functions.

These operations require server custody of the service role. Their isolation property comes from authenticated server scope, explicit organisation/environment validation, foreign keys, execution gating and targeted server logic—not PostgreSQL RLS itself.

### Should migrate / evaluate for later reduction

No mandatory architecture redesign is introduced in this release candidate. For future hardening, tenant-facing read APIs that currently use generic `store.find*()` can be evaluated for migration to the tenant JWT adapter so the database independently scopes more request-derived reads. That is **not** required to claim this branch fully RLS-everywhere, because this branch makes no such claim.

### Not tenant scoped

Global administrative/configuration surfaces without an `org_id` require separate authorization semantics and are outside the tenant RLS claim.

### Unresolved until live validation

- Whether every target migration is applied in the intended order on a clean database.
- Actual PostgREST/JWT behavior for ORG_A/ORG_B across each curated surface.
- Invalid, malformed, expired and anonymous identity denial on the target.
- Cross-tenant write denial using final `_005` grants.
- Whether any deployed API route unintentionally exposes a privileged service-role result without performing its expected server authorization/scope check.

## Prepared live proof

Once a disposable target exists:

```bash
export RUNTIME_VALIDATION_TARGET=disposable
export VALIDATION_ENVIRONMENT_CLASSIFICATION=DISPOSABLE
export VALIDATION_PROJECT_REF=<disposable-project-ref>
export VALIDATION_DATA_MARKER=LEVEL2_DISPOSABLE_VALIDATION
export VALIDATION_TARGET_EMPTY=1
export ALLOW_DESTRUCTIVE_VALIDATION=1
export VALIDATION_DATABASE_URL='<disposable postgres connection>'
export NEXT_PUBLIC_SUPABASE_URL='https://<disposable-project-ref>.supabase.co'
export SUPABASE_ANON_KEY='<disposable anon key>'
export SUPABASE_JWT_SECRET='<disposable jwt secret>'

npm run runtime:level2-live-validation
```

The guard refuses the known production project refs even when destructive acknowledgement is present.

## Current R-2 conclusion

**R-2 remains REDUCED / NOT CLOSED.**

Static review supports the statement that a real RLS-backed tenant scope-proof path exists and that final ordinary tenant SQL privileges are least-privilege/read-only on curated audit surfaces. It does not support the stronger statement that all server persistence is RLS-bound, and it does not replace the mandatory live two-tenant proof.

# Production Deployment Checklist — Runtime Governance

**Morrison Runtime Governance™ · Resurrection Tech™**
Run this **before onboarding the first paying customer.** Every required item must read **PASS**.

## How to run

```bash
npm run runtime:preflight            # full gate: config audit + capability self-test
npm run runtime:preflight -- --config-only   # config audit only (no engine calls to exercise flow)
npm run runtime:preflight -- --json          # machine-readable, for CI
```

- Exit code **0** = every required check passed (**ENTERPRISE-READY**).
- Exit code **1** = one or more required checks **FAIL** — do not onboard.
- Set the production environment variables in the shell/deployment where you run it (Vercel/Railway
  project env), then run. The **capability self-test runs in an isolated temporary file store with
  Supabase scrubbed**, so it never writes to a customer's production database.

## What each check verifies

### A. Production configuration audit — reads the real environment (non-mutating)

| # | Check | PASS means | FAIL / WARN means |
|---|---|---|---|
| A1 | **GOVERNANCE_URL** | Set explicitly to your engine | `WARN` if unset — falls back to the built-in default engine URL (functional but implicit) |
| A2 | **GOVERNANCE_TOKEN** | Engine auth bearer is set | `FAIL` if empty — engine calls would be unauthenticated |
| A3 | **RUNTIME_ADMIN_KEY** | Onboarding endpoint is protected **and enabled** | `FAIL` if unset — `/api/runtime/admin/onboard` returns 401 for everyone, so you cannot onboard |
| A4 | **Supabase configuration** | `NEXT_PUBLIC_SUPABASE_URL` **and** `SUPABASE_SERVICE_ROLE_KEY` set | `FAIL` if either is missing |
| A5 | **Engine reachability** | Live `/health` responds (engine commit reported) | `FAIL` if the engine is unreachable — check URL/token/engine status |
| A6 | **Durable evidence storage** | Active store is Supabase (durable + concurrency-safe) | `FAIL` if it resolves to the file store — ephemeral & per-instance on serverless; evidence would not persist |

### B. Governance capability self-test — isolated, proves the platform path works end-to-end

| # | Check | PASS means |
|---|---|---|
| B1 | **Shadow Mode observes** | A would-block trajectory returns `verdict: ALLOW` while `engine_verdict: BLOCK`, and the would-block is recorded — agents run unchanged |
| B2 | **Enforcement Mode blocks** | After `shadow → enforce`, the same trajectory returns `verdict: BLOCK` |
| B3 | **Rollback restores shadow** | After `enforce → shadow`, the trajectory returns `verdict: ALLOW` — instant, no redeploy |
| B4 | **Reporting generates** | A governance-evidence report is produced for the active org |

> If the engine is unreachable, B1–B4 report `FAIL` (the flow can't be exercised) — resolve A5 first,
> or run `--config-only` to audit configuration alone.

## Required environment variables (summary)

| Variable | Required | Purpose |
|---|---|---|
| `GOVERNANCE_URL` | Recommended | Runtime Governance engine base URL (defaults to production engine) |
| `GOVERNANCE_TOKEN` | **Yes** | Engine authentication bearer token |
| `RUNTIME_ADMIN_KEY` | **Yes** | Protects the customer-onboarding endpoint (`x-admin-key`) |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL (durable evidence store) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Supabase service-role key (server-side only) |
| `RUNTIME_REQUIRE_DURABLE=1` | Recommended | Refuse to serve live traffic on the non-durable file store (fail-closed) |
| `RUNTIME_REQUIRE_RECORD=1` | Recommended | Fail-closed if a decision's evidence cannot be recorded |
| `RUNTIME_RATE_LIMIT=<n>` | Optional | Per-key request rate limit |

**One-time database step:** apply `supabase/governance_runtime.sql` to your Supabase project (creates the
`rg_*` tables, RLS, and indexes). The store targets Supabase automatically once the two variables are set —
no code change.

## Manual verification (equivalent, from any network)

The same signals are exposed by the public health endpoint (no customer data):

```bash
curl -s https://resurrection-tech.com/api/runtime/health | jq
#   engine.reachable == true          → A5 PASS
#   store.backend == "supabase"       → A4 + A6 PASS
#   store.durable == true             → A6 PASS
```

## Enabling enforcement (shadow → enforce)

Enforcement is **not** an env var, feature flag, or HTTP route — it is the `mode` field on an
environment. Flip it server-side (the next `/evaluate` call, which re-authenticates per request,
enforces immediately — no redeploy):

```bash
# load production env so it targets the real (Supabase) store
set -a; source .env.production; set +a

npm run runtime:set-mode -- --list                      # find the environment id
npm run runtime:set-mode -- <environment_id> enforce    # go authoritative
npm run runtime:set-mode -- <environment_id> shadow     # instant rollback
```

Equivalent SQL: `update rg_environments set mode='enforce', mode_changed_at=now() where id='<id>';`

## Sign-off

- [ ] `npm run runtime:preflight` exits **0** (all required checks PASS)
- [ ] `supabase/governance_runtime.sql` applied to the production project
- [ ] `RUNTIME_REQUIRE_DURABLE=1` set in production
- [ ] A test onboarding via `/api/runtime/admin/onboard` returns an ingest key (not 401)
- [ ] Shadow evidence visible on the runtime dashboard

When every box is checked, the platform is ready to onboard the first paying customer.

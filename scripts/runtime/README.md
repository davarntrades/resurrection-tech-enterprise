# Runtime Governance Gateway

The continuous-governance control plane that wraps the **existing** Morrison
engine (never modifies it) and supplies the enterprise integration layer:
continuous ingestion, multi-tenancy, manifests, dashboard, reporting,
shadow/enforce lifecycle. See `docs/ENTERPRISE-INTEGRATION-ASSESSMENT.md` for
the full architecture assessment.

## Layout

```
lib/runtime/              framework-agnostic core (plain JS; imported by Node AND Next.js)
  store.js                Supabase-or-file persistence (auto-selects)
  admin.js                orgs · environments · API keys · RBAC · onboarding
  engine.js               zero-dep client for the existing engine
  manifests.js            versioning · content-hash · diff · history · re-assess
  gateway.js              govern() ingestion + shadow/enforce + decision replay
  metrics.js              counters · latency · rule/Ω frequency · trends · export
  reports.js              daily/weekly/monthly/quarterly rollups → Markdown
  index.js                barrel + health()
scripts/runtime/
  server.cjs              standalone zero-dep HTTP gateway + dashboard
  dashboard.html          live dashboard (served by the gateway)
  report.cjs              CLI/cron report generator (+ optional PDF)
  gateway.test.cjs        end-to-end test (40 assertions, live engine, file store)
app/api/runtime/**        hosted Next.js API routes (production path)
app/runtime-dashboard/    hosted dashboard page
supabase/governance_runtime.sql   production schema (rg_* tables)
```

## Run it

```bash
# 1. point at the engine (local or Railway)
export GOVERNANCE_URL=http://127.0.0.1:8091 GOVERNANCE_TOKEN=…
export RUNTIME_ADMIN_KEY=$(openssl rand -hex 16)   # gate for /admin/*

# 2. start the gateway (serves the API + dashboard on :8790)
npm run runtime:server

# 3. onboard a customer (the "yes after audit" moment) → returns an ingest key ONCE
curl -sX POST localhost:8790/admin/onboard -H "x-admin-key: $RUNTIME_ADMIN_KEY" \
  -H 'content-type: application/json' -d '{"name":"Meridian Sterling Bank","slug":"meridian"}'

# 4. the customer's agents govern trajectories (shadow mode = observe only)
curl -sX POST localhost:8790/v1/runtime/evaluate -H "Authorization: Bearer <ingest_key>" \
  -H 'content-type: application/json' \
  -d '{"trajectory":[{"tool":"transfer_funds","args":{"destination_account":"attacker"}}],"domains":["finance"]}'
#   → { verdict:"ALLOW", engine_verdict:"BLOCK", omega_domain:"finance", ... }  (would-block recorded)

# 5. open the dashboard at http://127.0.0.1:8790 (paste the key), or the hosted /runtime-dashboard
# 6. when satisfied, cut over to enforce (instant, no redeploy):
curl -sX POST localhost:8790/admin/environments/<env_id>/mode -H "x-admin-key: $RUNTIME_ADMIN_KEY" \
  -H 'content-type: application/json' -d '{"mode":"enforce"}'
```

## Test

```bash
GOVERNANCE_URL=http://127.0.0.1:8091 GOVERNANCE_TOKEN=… npm run runtime:test
```

Exercises onboarding, RBAC, tenant isolation, shadow/enforce, manifest
versioning + diff, metrics/trends/search/export, exact + shape-only replay, and
period reporting — against the live engine, using an isolated file store.

## Storage & security posture (hardened — items 1–5)

- **Admin control plane is fail-closed.** `/admin/*` is **disabled** unless
  `RUNTIME_ADMIN_KEY` is set (no default key). Wrong key → 401.
- **Engine provenance** — every decision records the engine `attestation`
  (`ruleset_hash`, `engine_commit`, version). Replay detects **engine drift**
  and only claims determinism against the same ruleset.
- **Aggregation is store-side** — Supabase computes metrics via the
  `rg_metrics` / `rg_trends` SQL functions (`count`/`group by`/`percentile_cont`),
  correct at any scale (immune to the PostgREST 1000-row cap). The file backend
  aggregates in a bounded single pass.
- **Durable-storage guard** — `health.store.durable` reports the backend;
  set `RUNTIME_REQUIRE_DURABLE=1` to **refuse live traffic on the non-durable
  file store**.

Backends:
- **File store** (default): `.runtime-data/` (gitignored). **Dev/CI only** — not
  durable or concurrency-safe. Fine for local runs and tests.
- **Supabase** (production/pilots): set `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` and apply `supabase/governance_runtime.sql`
  (tables + `rg_metrics`/`rg_trends` functions). The code path is identical.

### Environment variables

| Var | Purpose |
|---|---|
| `GOVERNANCE_URL` / `GOVERNANCE_TOKEN` | the (unchanged) engine + its bearer token |
| `RUNTIME_ADMIN_KEY` | **required** to enable `/admin/*` (fail-closed if unset) |
| `RUNTIME_REQUIRE_DURABLE` | `1` → refuse live ingestion unless Supabase is configured |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | durable production store |
| `RUNTIME_PORT` / `RUNTIME_DATA_DIR` | gateway port / file-store location |

## Test

```bash
GOVERNANCE_URL=… GOVERNANCE_TOKEN=… npm run runtime:test     # end-to-end + replay (40)
GOVERNANCE_URL=… GOVERNANCE_TOKEN=… npm run runtime:harden   # items 1–5 (25)
```

Decision rows store **metadata only** (verdict, Ω, rule, hash, latency, tool
names) — never raw customer arguments — unless an environment opts into
`store_payloads` for exact, determinism-provable replay.

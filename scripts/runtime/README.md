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

## Storage

- **File store** (default): `.runtime-data/` (gitignored). Zero setup — a pilot
  starts immediately.
- **Supabase** (production): set `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` and apply `supabase/governance_runtime.sql`. The
  code path is identical; no rewrite.

Decision rows store **metadata only** (verdict, Ω, rule, hash, latency, tool
names) — never raw customer arguments — unless an environment opts into
`store_payloads` for exact, determinism-provable replay.

# Enterprise Integration Readiness — Architecture Assessment

**Question:** After a customer completes a Runtime Governance Audit and says "yes",
can Resurrection Tech begin a production integration **immediately**, using the
existing platform, with minimal engineering work?

**Answer (before this PR):** The **engine** was production-grade, but the
**integration platform around it** (continuous ingestion with persistence,
multi-tenancy, dashboards, continuous reporting, shadow/enforce lifecycle) did
not exist. Every "yes" would have required a bespoke build.

**Answer (after this PR):** Yes. A **Runtime Governance Gateway** now wraps the
existing engine (without modifying it) and supplies the missing enterprise
layer. A customer can be onboarded and begin shadow-mode integration in one
call. What remains is production hardening + hosting, not redesign.

This assessment is grounded in a survey of the repository as it stood on the
`main` branch (engine service `governance-service/`, Next.js app `app/`, libs
`lib/`, DB `supabase/`).

---

## Scorecard

| # | Capability | Before | After this PR |
|---|---|---|---|
| 1 | Continuous Runtime Governance | Partial | **Exists** |
| 2 | Continuous Manifest Management | Missing | **Exists** |
| 3 | Runtime Dashboard | Missing | **Exists** |
| 4 | Continuous Reporting | Partial (audit PDFs only) | **Exists** |
| 5 | Integration Readiness (shadow/enforce/rollback/health/config) | Partial | **Exists** |
| 6 | Operational (audit log / history / replay / archive / export) | Partial | **Exists** |
| 7 | Enterprise Administration (orgs / envs / RBAC / API keys) | Missing | **Exists (foundation)** |

Legend: *Exists* = implemented + tested here; *foundation* = working core, with
production hardening on the roadmap below.

---

## 1. Continuous Runtime Governance

**Already existed**
- `POST /v1/evaluate` on the engine returns `PERMIT / ESCALATE / BLOCK` with
  `omega_domain`, `metadata.rule`, `trajectory_hash`, `engine_compute_ms`, and
  an ESCALATE `review` card (deployment-layer human-review policy).
- Deterministic verdicts + trajectory hashes; per-eval metadata logged as a
  JSON line (`governance.metrics`).

**Was partial / missing**
- Metrics were logged to stdout, **not persisted or queryable** — no runtime
  evidence a customer could see.
- No authenticated, per-customer **continuous ingestion** endpoint; no ALLOW/
  ESCALATE/BLOCK **recording**.

**Added:** `lib/runtime/gateway.js` (`govern()`) — authenticated ingestion that
evaluates through the live engine, normalises to ALLOW/ESCALATE/BLOCK, and
**records a decision row** (the runtime evidence + audit log) for every
trajectory. Exposed as `POST /v1/runtime/evaluate` (gateway) and
`POST /api/runtime/evaluate` (hosted).

## 2. Continuous Manifest Management

**Was missing entirely** — the public `/v1/assess` accepts a manifest but
nothing versioned, diffed, or stored it.

**Added:** `lib/runtime/manifests.js` — upload → **content-hash** (order-
independent) → immutable version → diff (added/removed tools) → full history,
per environment. A cosmetic reorder is *not* a change; a tool add/remove creates
a new version and (optionally) re-assesses through the engine to capture the
exposure delta. Endpoints: `POST/GET /v1/manifests`, `/v1/manifests/history`.

## 3. Runtime Dashboard

**Was missing** — `app/admin/` had leads/partners (sales), no runtime view.

**Added:** live dashboard with ALLOW/ESCALATE/BLOCK counters, average engine
latency, rule frequency, Ω-domain frequency, verdict **trend charts**, and a
recent-decisions feed. Two forms: a zero-dependency `scripts/runtime/dashboard.html`
served by the gateway, and a hosted `app/runtime-dashboard/page.tsx` reading the
authenticated metrics API. Aggregations in `lib/runtime/metrics.js`.

## 4. Continuous Reporting

**Already existed:** the Delivery Kit generates branded **audit** + executive
PDFs (one-off, at engagement time).

**Was missing:** recurring **daily / weekly / monthly / quarterly** governance
evidence from live traffic.

**Added:** `lib/runtime/reports.js` + `scripts/runtime/report.cjs` — period
rollups (governed volume, ALLOW/ESCALATE/BLOCK split, would-have-blocked in
shadow, latency, top rules + Ω domains, a board-level headline), persisted and
renderable to Markdown/PDF (reusing the same Chromium pipeline). Schedule with
cron. Endpoints: `POST/GET /v1/reports`, `/api/runtime/reports`.

## 5. Integration Readiness

**Added the full lifecycle:**
- **Shadow mode** — the gateway records what the engine *would* do but always
  lets the caller proceed (safe rollout / dry-run on live traffic).
- **Enforce mode** — the engine verdict is authoritative (BLOCK blocks).
  Fail-**closed** on engine unavailability in enforce; fail-open (observe) in
  shadow.
- **Rollback / cutover** — an environment's mode is a single flip
  (`setMode`), no redeploy.
- **Health + diagnostics** — `lib/runtime` `health()` reports engine
  reachability, engine commit, store backend, live sectors.
- **Customer-specific configuration** — per-environment mode, `store_payloads`
  (exact-replay opt-in), domains, and manifest.

## 6. Operational Features

- **Audit log / runtime evidence** — every decision persisted (metadata only by
  default; never raw args).
- **Searchable trajectory history** — `queryDecisions` filters by verdict, Ω,
  rule, time window, and free-text.
- **Decision replay** — re-runs a decision through the engine; **exact** (with
  `store_payloads`, proving determinism via hash + verdict match) or
  **shape-only** (honestly labelled, args not retained).
- **Evidence archive** — persisted reports = the durable governance record.
- **Export** — JSON + CSV of the evidence rows.

## 7. Enterprise Administration

**Was missing** — a single `GOVERNANCE_TOKEN`, no tenancy.

**Added (`lib/runtime/admin.js`):** **organisations → environments → API keys**.
- **Multiple organisations** (tenants) with isolation (a key only ever sees its
  org's data — verified in tests).
- **Multiple environments** + **production/staging separation**.
- **Role-based access** — `ingest` / `viewer` / `admin` scopes.
- **API keys per customer** — `rtk_live_…`, shown once, stored **sha256-hashed**.
- **One-shot onboarding** — `onboardCustomer()` provisions org + prod (shadow) +
  staging + an ingest key: the "yes after audit" button.

---

## What was deliberately NOT changed

The **Runtime Governance engine** (`morrison_governance`, `governance-service/`)
is untouched. The gateway *wraps* it. The engine remains the deterministic,
pinned source of truth; everything added here is an integration layer around it.

## Storage strategy (why integration can start on day 1)

The gateway uses a **pluggable store** (`lib/runtime/store.js`): it backs onto
**Supabase** when `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are
set (schema in `supabase/governance_runtime.sql`), and onto a **local file
store** otherwise. This mirrors the repo's existing fail-soft pattern
(`getServiceSupabase() → null`) and means a pilot can begin **before** any
database is provisioned, then migrate to Supabase with zero code change.

---

## Integration-Readiness Checklist

Run after "yes":

- [x] Engine reachable + attested (`GET /health`, `GET /api/runtime/health`).
- [x] Customer onboarded → org + production (shadow) + staging + ingest key
      (`onboardCustomer` / `POST /admin/onboard`).
- [x] Initial manifest uploaded + versioned (`POST /v1/manifests`).
- [x] Agents send trajectories to the ingest endpoint with their key.
- [x] Shadow mode records ALLOW/ESCALATE/BLOCK + would-have-blocked on live
      traffic (zero risk to the customer).
- [x] Dashboard shows live governed decisions, counters, latency, rule + Ω
      frequency, trends.
- [x] Daily/weekly/monthly/quarterly reports generating.
- [x] Searchable history + CSV/JSON export available for audit.
- [x] Decision replay available (enable `store_payloads` for exact reproduction).
- [x] Cutover to enforce mode when the customer is satisfied (single mode flip;
      instant rollback to shadow if needed).
- [ ] **(Prod hardening — roadmap)** Supabase tables applied + RLS reviewed.
- [ ] **(Prod hardening — roadmap)** Rate limiting + quotas per key (reuse
      `lib/rateLimit.ts`).
- [ ] **(Prod hardening — roadmap)** Async ingestion queue for very high volume.

---

## Remaining roadmap (production hardening, not redesign)

1. **Provision Supabase** with `governance_runtime.sql`; review RLS. (Store
   abstraction already targets it — no app code change.)
2. **Per-key rate limiting + usage quotas** — reuse `lib/rateLimit.ts` in the
   ingest route.
3. **High-volume ingestion** — optional queue/batch write path for customers
   doing millions of decisions/day (the sync path is fine for pilots).
4. **Key management UI** in `app/admin/` (issue/revoke/rotate) — the API exists;
   this is a screen.
5. **Scheduled reports** — wire `scripts/runtime/report.cjs` to cron / a Vercel
   scheduled function per org.
6. **Alerting** — threshold alerts (e.g. BLOCK-rate spike) off the metrics
   aggregations.
7. **SSO / org-admin console** for customer self-service (viewer keys + report
   access).

None of these require touching the engine or redesigning the platform; they are
incremental additions on the layer delivered here.

# Admin Dashboard Roadmap — Operator Control Room

**Morrison Runtime Governance™ · Resurrection Tech™**

> Codespaces is the **builder's cockpit** — close to the machinery, right while the platform is
> still taking shape. The admin dashboard is the **operator's control room** — the surface you use
> once customers are signing, where onboarding, enforcement, and evidence are buttons, not commands.

The target operator flow:

> Customer signs → open dashboard → click **Onboard** → send credentials → monitor evidence →
> click **Enforce**.

This document captures the plan to get there. The key finding: **the hard layer already exists.**
Every action below maps to a `lib/runtime/admin.js` (or gateway/reports) function that is already
implemented and verified against production. What remains is a UI layer, a few thin admin routes, and
operator authentication — a wiring job, not a rebuild.

## Current state (what exists today)

**Business logic — complete** (`lib/runtime/admin.js`, `gateway.js`, `reports.js`, `store.js`):
`onboardCustomer`, `setMode`, `issueApiKey`, `revokeApiKey`, `listOrgs`, `listEnvironments`,
`getEnvironment`, `setStorePayloads`, decision recording, metrics, reports, tamper-evident audit trail.

**HTTP routes — present:** `admin/onboard`, `evaluate`, `decisions` (+ CSV export), `metrics`,
`reports`, `manifests`, `health`, `cron/reports`.

**Operator surfaces — foundation present:** `app/runtime-dashboard/page.tsx` (read-only metrics /
decisions view) and the separate `console/` app. Neither yet exposes admin *actions*.

**Verification tooling — CLI today:** `npm run runtime:preflight` (readiness gate, supports `--json`)
and `npm run runtime:set-mode` (shadow ⇄ enforce).

## Gap analysis

| Operator action | Business logic | HTTP route | Dashboard UI |
|---|---|---|---|
| Onboard customer (name + slug → credentials + environments) | ✅ `onboardCustomer()` | ✅ `admin/onboard` | ❌ form |
| Shadow ⇄ Enforce toggle | ✅ `setMode()` | ❌ **needs route** | ❌ toggle |
| Evidence reports | ✅ `reports` / `decisions` | ✅ present | 🟡 read-only page exists |
| Ingest key rotation | ✅ `revokeApiKey()` + `issueApiKey()` | ❌ **needs route** | ❌ button |
| Export audit pack | ✅ decisions CSV + `/generate-audit-pack` skill | 🟡 CSV only | ❌ button |
| Preflight green/red readiness | ✅ `preflight --json` | ❌ **needs route** | ❌ status card |
| List orgs / environments | ✅ `listOrgs()` / `listEnvironments()` | ❌ **needs route** | ❌ table |

**What's genuinely missing is small and bounded:**
1. ~4 thin admin routes wrapping already-proven functions: `set-mode`, `keys` (rotate = revoke +
   issue), `orgs`/`environments` (list), and `preflight` (the config audit is non-mutating → safe to
   render live).
2. Dashboard UI — forms, a toggle, a status card, an evidence view, wired to those routes.
3. **Operator authentication** — the one genuinely new build. Today admin actions are gated by a
   static `x-admin-key` header (fine for `curl`, wrong for a browser control room). A real dashboard
   needs a proper login/session, and eventually multi-operator accounts + an action audit log.

## Phased plan

### Phase 1 — Foundation (auth + admin routes) — ✅ SHIPPED (backend)
The backend layer is implemented and unit-tested; the browser UI that consumes it is Phase 2.

- **Operator authentication** — `lib/runtime/adminauth.js`: HMAC-signed, short-lived (12h)
  httpOnly session cookies. `POST /api/runtime/admin/login` (operator password → cookie) and
  `POST .../logout`. Every admin route accepts a **session cookie OR** the `x-admin-key` header
  (curl/CLI back-compat). Unit-tested end-to-end (`npm run runtime:adminauth`, 20 assertions:
  password check, issue/verify, tamper + wrong-secret + expiry rejection, both guard paths).
- **Admin API routes** (thin wrappers, all auth-gated):
  - `POST /api/runtime/admin/set-mode` → `admin.setMode(environment_id, mode)`
  - `GET|POST /api/runtime/admin/keys` → list / issue / rotate (`revokeApiKey` + `issueApiKey`)
  - `GET  /api/runtime/admin/orgs` (`?withEnvironments=1`) + `.../environments?org_id=` → `listOrgs` / `listEnvironments`
  - `GET  /api/runtime/admin/preflight` → non-mutating config audit JSON (`lib/runtime/preflight.js`)
  - `GET  /api/runtime/admin/audit` → the operator action log
  - `POST /api/runtime/admin/onboard` — hardened: JSON errors (no opaque 500), session auth, audited
- **Action audit log** — `lib/runtime/adminaudit.js` + `rg_admin_audit` table. Records who
  onboarded / enforced / rotated a key, and when. Fail-safe: a missing table or store outage
  degrades to a structured log event and never blocks the operator action.

**Config for operator login** (both optional; degrade off cleanly if unset):
- `RUNTIME_OPERATOR_PASSWORD` — operator login password (falls back to `RUNTIME_ADMIN_KEY`).
- `RUNTIME_SESSION_SECRET` — HMAC secret (falls back to a value derived from `RUNTIME_ADMIN_KEY`).
- `RUNTIME_SESSION_TTL_SEC` — session lifetime, default 43200 (12h).

**Migration:** re-run `supabase/governance_runtime.sql` (idempotent — adds `rg_admin_audit`).

**Remaining for Phase 1:** operator UI is Phase 2; multi-operator accounts (vs. the single
bootstrap operator) is a later hardening.

### Phase 2 — Control-room screens — ✅ SHIPPED
Live at **`/admin/runtime`** (`app/admin/runtime/page.tsx` → `components/admin/RuntimeAdminClient.tsx`,
`styles/runtime-admin.css`). A session-gated single-page control room over the Phase-1 API. Two
operator-scoped read routes were added so the dashboard can see any tenant's data via the session
(the customer-key `/metrics` `/reports` routes are unchanged):
`GET /api/runtime/admin/evidence` and `GET|POST /api/runtime/admin/reports`.

- **Login gate** — operator password → session cookie; sign-out.
- **Onboard** — company name + slug → Create → ingest key shown once (copy button) + org/env ids.
- **Customers** — every org with its environments; per environment:
  - **Shadow / Enforce toggle** (confirm dialog on the enforce cutover; flip back = one-click rollback)
  - **Evidence** — ALLOW/ESCALATE/BLOCK counters, would-block, engine p95, top rules/Ω, recent
    decisions table, **Export JSON**
  - **Reports** — list + generate (daily / weekly / monthly / quarterly)
  - **Rotate key** — issue a fresh ingest key (shown once)
- **Readiness** — the preflight config-audit card (green/red per check) — Phase 3 item, delivered early.
- **Audit** — the operator action log.

### Phase 3 — Readiness + alerting in the browser — ✅ SHIPPED
- ✅ Preflight readiness card (config audit) — Readiness tab; "green = safe to onboard".
  (The shadow→enforce capability half of the gate stays in `npm run runtime:preflight`.)
- ✅ **Alerting** (`lib/runtime/alerts.js`) on the operator-critical signals:
  - `engine_unreachable`, `store_non_durable` — live global conditions
  - `record_failure` — raised **in real time from the gateway** when a decision can't be persisted
  - `block_spike` — configurable threshold of BLOCK verdicts in a window
  - Persisted to `rg_alerts` (graceful — degrades to a log event if the table is absent), with an
    in-process cooldown so a repeating condition can't spam. Delivery channels are optional +
    config-gated: `RUNTIME_ALERT_WEBHOOK` (Slack-compatible) and email via `RESEND_API_KEY` +
    `RUNTIME_ALERT_EMAIL_TO`/`_FROM`. Structured log always.
  - **Alerts tab** in the dashboard: live "ALL CLEAR / N FIRING" status + recent alerts + on-demand sweep.
  - Periodic sweep rides the existing daily reports cron (no extra Vercel cron entry — Hobby-friendly).
  - Config: `RUNTIME_ALERT_BLOCK_SPIKE` (default 10), `RUNTIME_ALERT_WINDOW_MIN` (60),
    `RUNTIME_ALERT_COOLDOWN_MIN` (5).
  - Tested: `npm run runtime:alerts` (8 assertions — raise/persist/list, cooldown, evaluate conditions,
    block_spike threshold, sweep).
- Remaining (future): more-frequent alert cadence needs a dedicated cron (paid plan) or an external
  uptime monitor hitting `/api/runtime/health`.

### Phase 4 — Audit Pack / Secure Delivery in the Control Room — ✅ SHIPPED
The standalone "48-Hour Audit / Secure Delivery" console is now integrated into the Control Room as
an **Audit pack** view per customer environment — the customer/environment is the source of truth.

- **Architecture (front-end + shared store):** the existing generator (`scripts/delivery-kit.cjs`, run
  from the console where Chromium lives) is **not rebuilt**. A new `scripts/runtime/publish-audit.cjs`
  uploads a generated `deliverables/<slug>/` directory to object storage and records it under a
  customer environment. The Control Room reads from that shared store — so no Chromium runs on Vercel.
- **`lib/runtime/deliverables.js`** — publish / list / read + secure shares (expiring, revocable,
  optional password). **`lib/runtime/store.js`** gains object-storage helpers (Supabase Storage bucket
  `rg-deliverables` when configured; local `.runtime-data/deliverables/` otherwise).
- **Routes** (operator-authed): `GET /api/runtime/admin/deliverables` (packs + shares),
  `GET …/deliverables/file?id=&mode=preview|download`, `GET|POST …/deliverables/share`. Plus the
  **customer-facing** `GET /api/runtime/share/<token>` — credential-free, not behind the admin Basic
  Auth (`proxy.ts` only matches `/admin/*`).
- **UI:** the environment's **Audit pack** button lists each pack (with its run-summary line) and every
  deliverable (`audit.html/.md/.pdf`, `executive-report.html/.pdf`, `run-summary.json`) with
  **Preview · Download · Share securely** — matching the radmin dark style.
- **Schema:** `rg_audit_packs`, `rg_deliverables`, `rg_shares` + the `rg-deliverables` Storage bucket
  (idempotent migration).
- **Workflow:** onboard → collect evidence → (console) generate audit → `npm run runtime:publish-audit`
  → preview/download/share securely in the Control Room → continue monitoring in shadow/enforce.
- Tested: `npm run runtime:deliverables` (10 assertions — publish, list, byte round-trip, share
  create/resolve/revoke/expiry/password).

## Non-goals / guardrails (unchanged)
- The Runtime Governance engine stays frozen — this is all platform/operator surface, never engine
  logic. No `governance-service/` or `morrison_governance` changes.
- Dashboard actions reuse the existing `lib/runtime` functions; no duplicate business logic.
- Enforcement remains the environment `mode` field — the toggle is a UI over `setMode`, not a new
  concept.

## Summary
The control room is ~90% built at the layer that's hard. Moving from cockpit to control room is a UI
layer + ~4 thin routes + operator auth on top of a backend already doing the real work — sequenced as
Phase 1 (auth + routes) → Phase 2 (screens) → Phase 3 (readiness card).

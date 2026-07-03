# Platform Readiness Audit — evidence-based, Principal Engineer sign-off review

Scope: the **platform layer only**. The engine is frozen — verified
byte-for-byte unchanged: `git diff main..HEAD -- governance-service/
morrison_governance` is **empty**. Every conclusion below is tagged
**[VERIFIED]** (I ran the code / a test / an exploit), **[INFERRED]**
(architecture, not executed here), or **[UNVERIFIED]** (could not run in this
environment).

## Verification harness (this run, live engine)

| Check | Command | Result |
|---|---|---|
| End-to-end + replay | `npm run runtime:test` | **40/40** [VERIFIED] |
| Hardening (items 1–5) | `npm run runtime:harden` | **25/25** [VERIFIED] |
| Engine + kit path | `npm run audit:check` | reachable ✓ [VERIFIED] |
| Engine unchanged | `git diff main -- governance-service` | empty [VERIFIED] |
| Platform latency | 100× `govern()` | engine 0.25ms · platform +0.8ms · round-trip ~1ms [VERIFIED] |

## Capability-by-capability verdict

| Capability | Verdict | Evidence |
|---|---|---|
| **Onboarding** | 🟢 **Ship as-is** (operator) | `admin.onboardCustomer` → org + prod(shadow) + staging + ingest key in one call; covered by runtime:test. <30 min is real for an operator. [VERIFIED] |
| **Shadow → enforce → rollback** | 🟢 mechanics / 🟡 under store failure | `admin.setMode` flip; `gateway.govern` shadow=observe(always ALLOW, records would-block), enforce=authoritative, fail-**closed** on engine outage; rollback = reverse flip. All tested. [VERIFIED] Caveat below (store-failure resilience). |
| **Tenant isolation** | 🔴 **RED — confirmed leak** | Decisions/metrics are protected by an `org_id` AND-filter, BUT manifest reads/writes filter by `environment_id` only (`manifests.js:67-73`) and routes fall back to a **client-supplied** `environment_id` for env-less keys (`server.cjs:102`, `manifests/route.ts:12`). **Exploit run:** an org-level viewer key for org A read org B's confidential manifest. [VERIFIED] |
| **Evidence capture** | 🟢 Ship as-is | `gateway.govern` → `appendDecision` records verdict, engine_verdict, Ω, rule, hash, latency, tools, mode, enforced — metadata only (no raw args unless `store_payloads`). [VERIFIED] |
| **Provenance** | 🟢 Ship as-is | Every decision persists `ruleset_hash` + `attestation` + `engine_commit`, captured verbatim from the engine; replay flags `engine_drift`. Tested in runtime:harden. [VERIFIED] |
| **Replay** | 🟢 file / 🟡 Supabase | `store.getDecisionById` (early-exit scan / PK), exact vs shape-only, drift-aware. File path VERIFIED; the Supabase PK path is [UNVERIFIED] (no live DB here). |
| **Reporting** | 🟡 generates, not scheduled | `reports.generate` + `report.cjs` produce daily/weekly/monthly/quarterly MD/PDF, but **no scheduler** — `vercel.json` `crons: NONE`. [VERIFIED] |
| **Dashboard** | 🟢 standalone / 🟡 hosted | `dashboard.html` served by the gateway (verified live over HTTP); `app/runtime-dashboard/page.tsx` follows conventions but is [UNVERIFIED] (no build here). |
| **Metrics** | 🟢 file / 🟡 Supabase | Aggregation is store-side; file path parity-tested (equals an independent raw reduce). The `rg_metrics`/`rg_trends` SQL that fixes the 1000-row cap ships in the schema but is [UNVERIFIED] against a live Supabase. |
| **Manifest versioning** | 🟢 logic / 🔴 access path | Content-hash, diff, history all correct + tested. But the read/write path carries the RED isolation bug above. |
| **API stability** | 🟡 | Versioned paths (`/v1/...`), stable shapes, but **thin input validation** (runtime routes don't use the repo's `zod` schemas like `lib/validation`), no OpenAPI. [VERIFIED] |
| **Operational tooling** | 🟡 | `runtime:server/report/test/harden` scripts, health endpoint. No Dockerfile/deploy manifest for the gateway; hosted path is the Next routes. [VERIFIED] |
| **Deployment readiness** | 🟡/🔴 | Standalone single-process server verified. Hosted Next `/api/runtime/**` routes follow conventions [INFERRED] but were **not typechecked/built** here (no `node_modules`) [UNVERIFIED], and on Vercel serverless the **file store is per-invocation ephemeral** → the hosted path effectively **requires Supabase**, which is unprovisioned/untested [INFERRED]. |
| **Rollback safety** | 🟢 Ship as-is | Instant mode flip, no redeploy; tested. [VERIFIED] |
| **Audit defensibility** | 🟡 | Provenance ✅ (ruleset_hash). **No tamper-evidence** — the decision log (jsonl / rows) can be edited or deleted undetectably; no hash chain. [VERIFIED absence] |
| **Production observability** | 🔴 | The gateway core has **zero logging** (`grep console\|log lib/runtime/*.js` → none); `server.cjs` catches handler errors and returns 500 **without logging them** (`server.cjs:128`). No metrics export, no tracing, no alerting. You cannot see what the gateway is doing or failing on. [VERIFIED] |
| **Failure modes** | 🟡 | Engine-down handled well (fail-closed in enforce, observe in shadow, records `ENGINE_UNAVAILABLE`). But `govern()` has **no try/catch around the store write** (`gateway.js:84`) → a store outage throws → customer gets a 500 with **no verdict and no recorded decision**. Not resilient. [VERIFIED] |

## Remaining issues (severity · impact · effort · what it blocks)

Blocking legend per product: **RA**=Runtime Assessment, **LP**=Limited Pilot,
**EI**=Enterprise Integration, **SaaS**=Enterprise SaaS.

| Issue | Sev | Business impact | Effort | RA | LP | EI | SaaS |
|---|---|---|---|---|---|---|---|
| **Cross-tenant manifest IDOR** (read + write) | **High** | One customer reads/writes another's tool inventory + exposure. Instant security-review failure the moment a 2nd tenant exists. | **Low** (verify env.org_id == key.org_id) | — | — (single-tenant) | **Blocks** | **Blocks** |
| **No production observability** (no gateway logs, errors unlogged) | **High** | Can't operate, debug, or prove SLA; silent failures. | **Low** (structured log per decision + per error) | — | **Blocks** confident ops | **Blocks** | **Blocks** |
| **govern() not resilient to store failure** | **Medium** | Store outage → 500 + lost evidence; risky under enforce. | **Low** (try/catch; degrade + alert) | — | Risk | **Blocks** enforce | Blocks |
| **No tamper-evidence (hash chain)** | **High** (regulated) | "Prove this log wasn't altered" → no. | **Medium** | — | — (shadow) | **Blocks** regulated | Blocks |
| **Hosted path requires Supabase; unverified build** | **Medium** | Hosted prod can't run on the file store; Next routes unbuilt here. | **Low–Med** (provision + `next build` + smoke) | — | **Blocks** durable prod | Blocks | Blocks |
| **No scheduled reporting** | **Medium** | Manual evidence cadence; ops overhead. | **Low** (Vercel cron) | — | Waitable | Partial | Blocks |
| **No rate limiting / quotas** | **Medium** | Noisy-neighbour / cost blowout at multi-tenant. | **Low–Med** (reuse `lib/rateLimit.ts`) | — | Waitable (low vol) | Blocks | **Blocks** |
| **RLS service-role-only (0 policies)** | **Medium** | Isolation is code-only; the IDOR is the direct symptom. | **Medium** | — | — | Blocks (defence-in-depth) | Blocks |
| **Thin input validation on runtime routes** | **Low** | Malformed input reaches the engine (which rejects it). | **Low** (zod, like existing routes) | — | Ship | Harden | Harden |
| **Supabase SQL / PK paths not load-tested** | **Medium** | Scale claim unproven. | **Med** (live-DB run + load test) | — | — | — | **Blocks** |

Nothing here blocks **Runtime Assessment** — that layer (engine + delivery kit)
is mature and **Ship as-is**.

## The eight questions, answered with evidence

1. **Onboard a Fortune 500 today?** — **Yes, single-tenant.** `onboardCustomer`
   provisions everything in one call [VERIFIED]. But **not shared multi-tenant**
   until the IDOR is fixed, and you must point at Supabase for durable evidence
   [INFERRED]. Verdict: yes on a dedicated org/deployment; no on a shared one.
2. **Run a paid Limited Pilot next week?** — **Yes**, realistically, for a
   single-tenant **shadow** pilot: shadow mode, evidence capture, provenance,
   replay, and dashboard are all verified. Conditions: Supabase provisioned,
   single tenant, ~20 lines of gateway logging + store-failure handling first.
3. **Deploy into shadow-production safely?** — **Yes — Ship as-is.** Shadow is
   the strongest, best-tested path: it never blocks the customer, records the
   would-be verdict, fails open on engine outage. The only adds for comfort are
   observability + durable store.
4. **Move shadow → enforcement with confidence?** — **Mostly.** The mechanics
   (single flip, fail-closed on engine outage, instant rollback) are verified.
   The confidence gap is operational, not governance: **no store-failure
   resilience and no alerting**, so a silent gateway/store error under enforce
   would be invisible. Close those two Low-effort items first.
5. **Would I personally sign off a six-figure pilot?** — **Conditional YES for a
   single-tenant Limited Pilot in shadow mode; NO for a multi-tenant Enterprise
   Integration in enforce today.** Yes because the core governance loop is
   verified end-to-end and shadow mode is zero-risk to the customer. The three
   conditions I'd require before signing: (a) fix the manifest IDOR **or**
   contractually guarantee single-tenant isolation, (b) Supabase provisioned +
   smoke-tested, (c) minimal observability (log every decision + every error) and
   store-failure handling in `govern()`. I would **not** sign a £500k enforce/
   multi-tenant deal until tamper-evidence, RLS, and rate limiting also land —
   the confirmed cross-tenant leak alone is disqualifying for multi-tenant.
6. **Highest-ROI remaining tasks** (all Low unless noted): 1) fix manifest IDOR,
   2) gateway observability (per-decision + per-error logging), 3) store-failure
   resilience in `govern()`, 4) provision + smoke-test Supabase, 5) scheduled
   reports, 6) rate limiting. Items 1–4 are ~2–3 engineer-days total.
7. **Genuine enterprise requirements vs nice-to-have:** *Requirements* — IDOR
   fix, observability, store resilience, tamper-evidence, RLS, rate limiting,
   Supabase durability. *Nice-to-have* — self-service UI, async ingestion queue,
   SSO, OpenAPI spec, dashboard localStorage hardening.
8. **Can wait until after the first paying customer:** scheduled reports (an
   analyst can run `runtime:report`), rate limiting (single low-volume pilot),
   tamper-evidence (if the pilot is shadow-only), RLS depth (single-tenant),
   SQL load-test, self-service UI, async queue.

## Updated readiness scores (honest — the IDOR *lowered* my prior Enterprise number)

| Product | Prior | Now | Why it moved |
|---|---|---|---|
| **Runtime Assessment** | 88 | **88** | Mature, untouched. **Ship as-is.** |
| **Limited Pilot** | 76 | **74** | Core loop verified; slight cut for the newly-confirmed observability + store-failure gaps that affect running real traffic. Single-tenant shadow pilot is genuinely ready with the 3 conditions. |
| **Enterprise Integration** | 68 | **58** | **Lowered on evidence** — a *confirmed* cross-tenant IDOR plus no tamper-evidence, no store resilience, and no observability are real multi-tenant/enforce blockers I had not previously proven. |
| **Enterprise SaaS** | 35 | **32** | IDOR is worst for multi-tenant; SQL scale path still unverified; no self-service/quotas. |

## Traffic-light summary

| 🟢 Green — Ship as-is | 🟡 Yellow — pilot-ok, not SaaS | 🔴 Red — fix before multi-tenant/enforce |
|---|---|---|
| Onboarding · Shadow mode · Rollback · Evidence capture · Provenance · Replay (file) · Manifest versioning (logic) · Runtime Assessment | Enforce (needs store-resilience) · Reporting (no scheduler) · Metrics/Replay (Supabase unverified) · Dashboard (hosted unverified) · API validation · Deployment (needs Supabase) · Audit (no tamper-evidence) | **Tenant isolation (confirmed IDOR)** · **Production observability** |

## "Stop building, start selling" point

**You are ~2–3 engineer-days from selling a single-tenant £250k Limited Pilot in
shadow mode.** The core is verified; the blockers are small and operational, not
architectural. Concretely, the **minimum before confidently selling £250k+
Limited Pilots**:

1. **Fix the manifest IDOR** (scope every manifest op by the key's org) — Low.
2. **Provision + smoke-test Supabase** (durable evidence; `next build` the hosted routes) — Low–Med.
3. **Add gateway observability** — one structured log line per decision + per error — Low.
4. **Make `govern()` resilient to store failure** (record-then-return, degrade gracefully, don't 500 the customer) — Low.

Then **stop and sell the pilot.** Do not build items below until a customer is signed.

**Minimum before confidently selling £500k+ Enterprise Integration** (enforce,
multi-tenant), on top of the above:

5. **Tamper-evident decision log** (hash-chain) — Medium.
6. **Per-tenant RLS** (defence-in-depth behind the IDOR fix) — Medium.
7. **Rate limiting / quotas** (reuse `lib/rateLimit.ts`) — Low–Med.
8. **Alerting** (engine-down, store errors, BLOCK-rate spike) — Medium.

That is ~1–2 additional engineer-weeks. Everything else (self-service UI, async
queue, SSO, OpenAPI) is post-revenue and should not delay the first sale.

## Bottom line

The platform is **genuinely ready for a single-tenant, shadow-mode Limited Pilot
after ~2–3 days of well-scoped hardening**, and the engine remains frozen and
untouched. It is **not yet ready for a multi-tenant, enforce-mode Enterprise
Integration** — a confirmed cross-tenant leak and missing audit/ops guarantees
must close first (~1–2 weeks). No score was raised without a passing test; the
one score that changed materially (Enterprise Integration 68→58) went **down**,
because the audit found a real defect the prior review had not.

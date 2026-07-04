# Runtime Governance Platform — CTO Readiness Review

A brutally honest architectural assessment of the Runtime Governance Gateway
(the layer added in PR #133 around the unchanged engine). Every claim below is
grounded in the actual code, with file references. Where the platform is already
sufficient, it says so.

**One-line verdict:** the **governance lifecycle** (shadow → enforce → rollback)
and the **engine wrapping** are genuinely production-grade. The **evidence
integrity, security defaults, and scale characteristics** are not yet — they are
foundation-quality. None of the remaining work requires touching the engine; all
of it is bounded platform hardening.

## Readiness scores (honest)

| Product | Score /100 | One-line rationale |
|---|---|---|
| **Runtime Assessment** | **88** | Mature and pre-existing (engine + delivery kit + validation/mutation suites). Not what this layer changed; genuinely strong. |
| **Limited Pilot** | **62** | Shadow mode, live dashboard, and decision recording work. Blocked from a *real* customer's live traffic by: file-store durability, missing engine provenance, no scheduled reports, no rate limiting. |
| **Enterprise Integration** | **48** | Enforce/rollback/tenancy work functionally, but a default admin key, no audit-evidence provenance/tamper-evidence, and a correctness-at-scale aggregation bug block a signed enterprise deal. |
| **Enterprise SaaS (100s–1000s of tenants)** | **31** | In-Node aggregation, full-table scans, no async ingestion, no quotas, no self-service. Needs the roadmap's scale tier. |

## The 10 questions, answered

| # | Question | Answer | Grounding |
|---|---|---|---|
| 1 | Onboard in < 30 min? | **Yes, operator-driven** | `admin.onboardCustomer()` provisions org + prod(shadow) + staging + key in one call. But needs an operator + admin key; **no self-service UI**, and the admin key **defaults to `rt-admin-dev`** (`server.cjs:36`). |
| 2 | Shadow mode, zero prod risk? | **Yes — sufficient** | `gateway.js` shadow branch always returns ALLOW and records the would-be verdict. Strongest part of the platform. |
| 3 | Enforce via single config change? | **Yes — sufficient** | `admin.setMode(env,"enforce")` — one flip, fail-closed on engine outage. |
| 4 | Instant rollback? | **Yes — sufficient** | Reverse mode flip; no redeploy. Verified in tests. |
| 5 | Multiple tenants coexist securely? | **Partial** | Logical isolation works and is tested, but it is **code-enforced only** — 0 RLS policies (`governance_runtime.sql`), no per-tenant quotas (noisy-neighbour), file store has no isolation. |
| 6 | Continuous ingestion without manual work? | **Mostly yes** | Trajectory ingest is continuous. Manifest change-detection is **pull** (customer POSTs); no automated watch. |
| 7 | Continuous dashboard monitoring? | **Yes for pilot** | Dashboard polls live metrics. Caveat: aggregation correctness at scale (below). |
| 8 | Reports automatically on a schedule? | **No** | `report.cjs` is CLI-only; **no cron wired** (`vercel.json` has none). Automation is a gap. |
| 9 | Deterministic replay + audit evidence months later? | **Partial / No** | Exact replay works *only* if `store_payloads` on **and** the engine version is unchanged. The gateway **does not store engine_commit/attestation** on decisions (`gateway.js:69`), there is **no tamper-evidence** (no hash chain), and the file store is not durable. So "provable months later" is not met without hardening. |
| 10 | Scale to dozens / hundreds / thousands? | **Dozens yes; hundreds shaky; thousands no** | `metrics.summary`/`trends` pull up to 1,000,000 rows into Node and reduce in JS (`metrics.js:20,64`); on Supabase `.range(0,999999)` is silently capped at PostgREST's 1000-row default → **aggregations become wrong past 1000 rows**. Replay full-scans (`gateway.js:101`). No queue, no quotas. |

## What is already sufficient (do NOT rebuild)

- **Shadow → enforce → rollback lifecycle** — correct, minimal, fail-closed. Ship it.
- **Engine isolation** — the engine is untouched; the gateway is a clean wrapper. Correct separation of concerns.
- **API-key auth model** — scoped to org+environment, RBAC roles, keys shown once and **sha256-hashed** at rest. The model is sound (add rate-limiting + rotation for scale).
- **Manifest versioning** — content-hash (order-independent), diff, immutable history. Correct and complete.
- **Privacy-first decision recording** — metadata only by default; raw args retained only on explicit `store_payloads` opt-in. Good design.
- **Store abstraction** — Supabase-or-file with graceful fallback matches the repo pattern. Keep it; just treat the file backend as dev-only.

## Gaps

### Critical — before the FIRST enterprise deployment

| Gap | Why it matters | Business impact | Effort | Blocks Pilot? | Blocks Enterprise? |
|---|---|---|---|---|---|
| **Default admin key `rt-admin-dev`** (`server.cjs:36`) | If deployed without `RUNTIME_ADMIN_KEY`, anyone can onboard orgs and flip enforce/shadow. | Full control-plane compromise; instant security-review failure. | **Low** — fail-closed if unset. | **Yes** | **Yes** |
| **No engine provenance on decisions** (`gateway.js:69`) | The engine returns `attestation` + `engine_commit`; the gateway discards it. Can't prove which ruleset produced a verdict, and can't detect engine drift on replay. | Audit evidence is not defensible; replay "months later" is unprovable. | **Low** — persist a field the engine already returns. | No | **Yes** |
| **Aggregation correctness at scale** (`metrics.js:20,64`, `store.js:118`) | Metrics/reports load ≤1M rows into Node and reduce in JS; Supabase caps at 1000 rows → dashboards/reports **silently wrong** past 1000 decisions. | Executives shown incorrect governance numbers = trust-destroying. | **Medium** — move counts to SQL `count()/group by` (RPC) + bounded fallback. | Risks Pilot | **Yes** |
| **Replay by full scan** (`gateway.js:101`) | Finds one decision by reading up to 100k rows and `.find()`; silently misses beyond 100k. | Replay/audit breaks exactly when the evidence base is largest. | **Low** — query by id / indexed lookup. | No | **Yes** |
| **File store not durable/concurrency-safe** (`store.js:60,69`) | Read-modify-write `writeFileSync`, no locking; concurrent writes corrupt collections. | A real pilot on the file store can lose or corrupt evidence. | **Low** (config: require Supabase for live traffic) + doc. | **Yes** | **Yes** |

### Important — before large-scale rollout

| Gap | Why it matters | Business impact | Effort | Blocks Pilot? | Blocks Enterprise? |
|---|---|---|---|---|---|
| **No scheduled reporting** (no cron) | Daily/weekly/monthly/quarterly evidence is manual. | Fails the "automatic evidence cadence" promise; ops overhead. | **Low–Med** — Vercel cron / scheduled function per org. | No (analyst can run) | Partial |
| **No per-key rate limiting / quotas** (`lib/rateLimit.ts` unused in runtime) | One tenant/agent can flood the engine + store. | Noisy-neighbour outages; cost blowout. | **Low–Med** — wire existing limiter into ingest. | No | **Yes** |
| **No tamper-evidence on the audit log** | Decisions can be edited undetectably. | Regulated buyers (finance/health) object; weakens evidence pack. | **Medium** — hash-chain decisions (reuse audit-pack pattern). | No | **Yes** |
| **RLS is service-role-only** (0 policies) | Isolation depends solely on correct app-code filters. | One missing `org_id` filter = cross-tenant breach; no defence-in-depth. | **Medium** — per-tenant RLS + a `set_config` tenant guard. | No | **Yes** |
| **No idempotency on ingestion** | `correlation_id` stored, not deduped; retries double-count. | Metrics/billing inaccuracy. | **Low** — unique index + upsert. | No | Partial |
| **No admin-action audit / alerting** | Mode flips, key issue/revoke, engine-down aren't event-logged or alerted. | No forensics; silent outages. | **Medium** | No | Partial |

### Nice-to-have — future

| Gap | Why | Effort |
|---|---|---|
| Self-service onboarding + key-management UI | Removes operator from the loop; SaaS motion. | Med–High |
| Async ingestion queue / batch writes | Only needed at thousands-of-tenants, millions-of-decisions/day. | High |
| SSO / customer org-admin console | Enterprise self-service. | High |
| Data-residency / region options | Some regulated buyers. | Med |
| Dashboard key handling (localStorage) | Minor hardening. | Low |

## Roadmap — ordered by ROI (highest business value first, minimum engineering)

Each item is scoped to *unblock revenue*, not engineering elegance. Effort in
brackets. The first five are the "make it sellable" set and are almost all Low.

1. **Fail-closed admin key** — refuse to start `/admin/*` without `RUNTIME_ADMIN_KEY`. **[Low]** Unblocks any hosted deployment; removes the single worst security landmine.
2. **Stamp engine provenance on every decision** — persist `engine_commit` + `attestation` (already returned by the engine). **[Low]** Turns the decision log into defensible audit evidence and makes replay drift detectable. Directly lifts Enterprise + Pilot evidence value.
3. **SQL-side aggregation** — replace in-Node reduce with `count()/group by` via a Supabase RPC (bounded fallback for the file store). **[Medium]** Fixes a *correctness* bug (wrong dashboards past 1000 rows) — the fastest way to lose an enterprise buyer.
4. **Indexed replay lookup** — fetch a decision by id, not by scanning. **[Low]** Makes "reproduce any decision months later" actually true at volume.
5. **Pilots on Supabase; file store labelled dev-only** — require the durable backend for live traffic; document it. **[Low]** Removes evidence-loss risk from every real pilot.
6. **Scheduled reports** — Vercel cron generating daily/weekly/monthly/quarterly per org. **[Low–Med]** Delivers the automatic-evidence promise; cuts analyst overhead.
7. **Per-key rate limiting + quotas** — wire the existing limiter into ingest. **[Low–Med]** Noisy-neighbour + cost protection before multi-tenant scale.
8. **Tamper-evident decision log (hash chain)** — **[Medium]** Enterprise/regulated audit credibility.
9. **Per-tenant RLS + idempotency** — defence-in-depth + accurate counts. **[Medium]**
10. **Admin-action audit + basic alerting (engine-down, BLOCK-rate spike)** — **[Medium]** Operability.
11. **Self-service onboarding/key UI, then async ingestion queue** — only when the SaaS/scale motion demands it. **[High]**

Doing 1–5 (mostly **Low** effort) moves **Limited Pilot ≈ 62 → ~80** and
**Enterprise Integration ≈ 48 → ~70** without touching the engine. Items 6–10
are the large-scale-rollout tier; 11 is the SaaS tier.

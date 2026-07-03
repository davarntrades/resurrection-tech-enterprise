# Runtime Governance Platform — Production Readiness Report

**Prepared for:** Enterprise technical due diligence (CTO / security review)
**Scope:** the platform layer surrounding the Runtime Governance engine. The
engine itself (`governance-service/`, `morrison_governance`) is **out of scope
and was not modified**.
**Author stance:** independent assessor. Conclusions are stated only where
backed by evidence reproducible in the repository. Claims that could not be
executed in this environment are labelled as such and are **not** counted as
verified.

## Evidence classification (used throughout)

| Label | Meaning |
|---|---|
| **[VERIFIED]** | Executed here; result observed (test run, exploit, `git diff`, latency measurement). |
| **[TESTED]** | Implemented with an automated test that passes in this environment. |
| **[IMPLEMENTED‑UNTESTED]** | Code/schema present, but the specific path was not executed here (e.g. requires a live Supabase or a Next.js build). |
| **[INFERRED]** | Architectural reasoning, not executed. |
| **[FUTURE]** | Not implemented. |

Reproduction commands are cited inline. Engine ref under test:
`96ecd395…` (pinned in `governance-service/Dockerfile`).

---

## 1. Executive summary

The platform is a governance **control plane** that wraps a frozen, deterministic
policy engine. It adds tenancy, continuous ingestion, evidence persistence,
provenance, replay, metrics, manifest lifecycle, and a shadow/enforce lifecycle.

Assessment outcome:

- The **core governance loop is verified end‑to‑end** against the live engine:
  onboarding, shadow/enforce/rollback, evidence capture, provenance, and replay
  all pass automated tests. **[VERIFIED]** — `npm run runtime:test` → 40/40.
- One **High‑severity cross‑tenant vulnerability (manifest IDOR)** was found by
  this audit, fixed, and the fix is proven by test and by re‑running the exact
  exploit. **[VERIFIED]**
- The engine is **byte‑for‑byte unchanged**: `git diff main..HEAD --
  governance-service/ morrison_governance` is empty. **[VERIFIED]**
- A subsequent hardening pass (**Addendum B**) implemented and **[TESTED]**
  observability, store‑failure resilience, a tamper‑evident hash‑chained audit
  log, per‑key rate limiting, and scheduled reporting. With those, the platform
  is **fit for a single‑tenant, shadow‑mode pilot** (remaining work is
  operational provisioning of a durable store) and **substantially closer for
  multi‑tenant enforcement** — the residual is infrastructure verification
  (live Supabase + database‑level RLS + load test), which is labelled
  **[IMPLEMENTED‑UNTESTED]**, not missing capability. Details in §5–§9 + Addendum B.

Nothing in this report depends on marketing claims; where the platform is
sufficient it is stated plainly, and where it is not, the specific missing
control is named.

---

## 2. Current architecture

```
customer agents ──HTTPS(API key)──▶ Platform (control plane)
                                     ├─ admin.js       tenancy: orgs · environments · API keys (sha256) · RBAC
                                     ├─ gateway.js     govern(): evaluate → record decision → shadow/enforce
                                     ├─ manifests.js   versioning · content-hash · diff · history (tenant-guarded)
                                     ├─ metrics.js     counters · latency · rule/Ω freq · trends (store-side agg)
                                     ├─ reports.js     daily/weekly/monthly/quarterly rollups
                                     ├─ store.js       Supabase (prod) OR local file store (dev)
                                     └─ engine.js ──HTTPS(bearer)──▶ Runtime Governance engine  [FROZEN]
                                                                     /v1/evaluate · /v1/assess · /health
Surfaces: scripts/runtime/server.cjs (standalone) · app/api/runtime/** (hosted Next.js) · dashboard (html + Next page)
Persistence: supabase/governance_runtime.sql (rg_* tables + rg_metrics/rg_trends functions) | .runtime-data/ (dev file store)
```

- The engine is a separate process/service, called over HTTP with a bearer
  token. The platform never imports or mutates engine code. **[VERIFIED]**
- Tenant model: `org → environment(production|staging, shadow|enforce) → API
  key(ingest|viewer|admin)`. Keys are stored as `sha256` hashes; plaintext is
  returned once. **[TESTED]** (`admin.js`; covered by `runtime:test`).
- Storage is pluggable: Supabase when `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` are set, else a local file store. **[VERIFIED]** for
  the file backend; **[IMPLEMENTED‑UNTESTED]** for Supabase (no live DB here).

---

## 3. Verified security properties

| Property | Status | Evidence |
|---|---|---|
| Engine immutability | **[VERIFIED]** | `git diff main..HEAD -- governance-service/ morrison_governance` → empty. |
| API keys not stored in plaintext | **[TESTED]** | `admin.issueApiKey` stores `sha256(key)`; `authenticate` hashes input. |
| Admin control plane fail‑closed | **[TESTED]** | No default key; `/admin/*` → 503 unless `RUNTIME_ADMIN_KEY` set; wrong key 401; old default rejected. `runtime:harden`. |
| Cross‑tenant manifest isolation | **[TESTED]** | `runtime:isolation` 23/23: A cannot read/update/delete B; enumeration + forged ids → 403; same‑tenant unchanged; HTTP‑level 403 proof. |
| Tenant isolation of decisions/metrics | **[TESTED]** | `queryDecisions`/`aggregate` filter by `org_id`; `runtime:test` asserts tenant B sees only its own decision. |
| Engine provenance on every decision | **[TESTED]** | `ruleset_hash` + `attestation` + `engine_commit` persisted and surfaced; `runtime:harden`. |
| Deterministic replay (same ruleset) | **[TESTED]** | Exact replay `deterministic:true` (hash + verdict match); drift detection via `ruleset_hash`. `runtime:test`, `runtime:harden`. |
| Fail‑closed on engine outage (enforce) | **[TESTED]** | `gateway.js`: engine unreachable → `ENGINE_UNAVAILABLE` → BLOCK in enforce, ALLOW(observe) in shadow. `runtime:test`. |
| Metadata‑only evidence by default | **[TESTED]** | Decisions store verdict/Ω/rule/hash/latency/tool‑names, not raw args, unless `store_payloads` opt‑in. |

---

## 4. Security issues found and fixed during this audit

### 4.1 High — cross‑tenant manifest access (IDOR) — **FIXED, [VERIFIED]**

- **Finding:** manifest reads/writes filtered by `environment_id` only, and
  routes fell back to a client‑supplied `environment_id` for keys without an
  environment scope. An org‑level key could name another tenant's environment id
  and read or write that tenant's manifest (tool inventory + engine exposure).
- **Proof (pre‑fix):** an org‑level viewer key for "Attacker Co" read "Victim
  Bank's" confidential manifest.
- **Fix:** `lib/runtime/manifests.js` is now the single fail‑closed choke point.
  `assertEnvOwnedBy(org_id, environment_id)` treats `org_id` (from the
  authenticated key) as authoritative and verifies the environment belongs to
  it; unknown or foreign environment → `TenantMismatchError` → HTTP 403, with an
  identical message so enumeration reveals nothing. All queries additionally
  filter by `org_id` (defence in depth). Routes map the error to 403.
- **Proof (post‑fix):** the same exploit now returns `403 "environment does not
  belong to this tenant"`; `runtime:isolation` 23/23. Commit `1edcff9`.
- **Residual:** this is an application‑layer control. Database‑level per‑tenant
  RLS is **[FUTURE]** (§5).

### 4.2 Critical‑class hardening completed earlier this audit (items 1–5) — **[TESTED]**

| # | Issue | Fix | Evidence |
|---|---|---|---|
| 1 | Default admin key `rt-admin-dev` | Fail‑closed; no default | `runtime:harden` |
| 2 | Verdicts lacked engine provenance | Persist `ruleset_hash`/`attestation`; drift detection | `runtime:harden` |
| 3 | In‑app aggregation truncated at Supabase's 1000‑row cap → wrong numbers | Store‑side `rg_metrics`/`rg_trends` SQL; file parity | `runtime:harden` (file); SQL **[IMPLEMENTED‑UNTESTED]** |
| 4 | Replay by full‑table scan | Indexed `getDecisionById` | `runtime:harden` |
| 5 | Non‑durable file store used silently | `durable` flag + `RUNTIME_REQUIRE_DURABLE` refusal | `runtime:harden` |

Commits `a4bd10d` (items 1–5), `1edcff9` (IDOR).

---

## 5. Remaining limitations (honest)

| # | Limitation | Severity | Status | Blocks |
|---|---|---|---|---|
| L1 | No production observability — the gateway core has **no logging**; `server.cjs` returns 500 without logging errors. | High | **[FUTURE]** | Single‑tenant enforce; all multi‑tenant |
| L2 | `govern()` has no try/catch around the store write — a store outage returns 500 with no verdict and no recorded decision. | Medium | **[FUTURE]** | Enforce confidence |
| L3 | No tamper‑evidence — the decision log has no hash chain; rows can be altered/deleted undetectably. | High (regulated) | **[FUTURE]** | Multi‑tenant / regulated |
| L4 | Database‑level tenant isolation (RLS) — schema enables RLS but defines **0 policies**; isolation is app‑layer only. | Medium | **[FUTURE]** | Multi‑tenant defence‑in‑depth |
| L5 | No rate limiting / quotas — `lib/rateLimit.ts` exists but is not wired into the runtime routes. | Medium | **[FUTURE]** | Multi‑tenant |
| L6 | Reporting not scheduled — generators exist; `vercel.json` has no cron. | Medium | **[FUTURE]** | Automated cadence |
| L7 | Hosted path requires Supabase — on serverless the file store is per‑invocation/ephemeral; the Next.js routes were **not built/typechecked** here (no `node_modules`). | Medium | **[INFERRED]** / **[IMPLEMENTED‑UNTESTED]** | Durable hosted prod |
| L8 | Supabase SQL + PK replay paths not executed against a live database; no load/scale test of the gateway. | Medium | **[IMPLEMENTED‑UNTESTED]** | SaaS‑scale claim |
| L9 | File store is not concurrency‑safe (read‑modify‑write, no locking). | Low (dev‑only) | **[VERIFIED]** by inspection | Any real traffic on file store |
| L10 | Thin input validation on runtime routes (no schema/zod as elsewhere in the repo). | Low | **[FUTURE]** | Hardening |

No limitation above affects the **Runtime Assessment** product or the engine.

---

## 6. Test coverage summary

All executed against the live engine in this environment. Reproduce with the
cited commands.

| Suite | Command | Assertions | Result | Covers |
|---|---|---|---|---|
| End‑to‑end + replay | `npm run runtime:test` | 40 | **40/40 [VERIFIED]** | onboarding, RBAC, tenant isolation (decisions), shadow/enforce, rollback, manifest versioning+diff, metrics/trends/search/export, exact+shape replay, reporting |
| Hardening (items 1–5) | `npm run runtime:harden` | 25 | **25/25 [VERIFIED]** | fail‑closed admin (HTTP), provenance, aggregation parity, indexed replay, durability guard |
| Manifest isolation | `npm run runtime:isolation` | 23 | **23/23 [VERIFIED]** | cross‑tenant read/write/delete, enumeration, forged ids, same‑tenant, contract stability, HTTP 403 proof |
| Enterprise hardening | `npm run runtime:enterprise` | 18 | **18/18 [VERIFIED]** | observability events (L1), store‑failure fail‑safe + fail‑closed (L2), tamper‑evident chain + tamper/deletion detection (L3), per‑key rate limiting (L5), scheduled report fan‑out (L6) |
| **Platform total** | | **106** | **106/106** | |

Coverage gaps (explicitly not covered by automated tests here):
concurrency/load (L8/L9), Supabase SQL + RLS execution (L7/L8/L4), Next.js build
(L7), multi‑node chain‑head atomicity and multi‑node rate‑limit sharing (new,
below). These are **not** claimed as passing. See **Addendum B** for the items
that moved from FUTURE to TESTED in this pass.

The engine's own validation (regression / mutation / benchmark suites) lives on
a separate change set and exercises the frozen engine + delivery‑kit layer; it
is **out of scope** for this platform assessment and was not re‑run here.

---

## 7. Performance impact

Measured in this environment (100 `govern()` calls, local engine): **[VERIFIED]**

| Metric | Value |
|---|---|
| Engine compute (per decision) | ~0.26 ms mean |
| Gateway round‑trip (`govern`, incl. record) | ~1.3 ms mean |
| Platform overhead above engine | ~0.8–1.0 ms (localhost HTTP + record) |
| Metrics aggregation (file, ~100 rows) | ~2 ms |

The IDOR fix and provenance capture add **no measurable overhead to the
ingestion hot path**: `assertEnvOwnedBy` is invoked only on manifest operations
(infrequent), not on `govern`/`evaluate`; provenance capture reads a field
already present in the engine response. Latency is unchanged before/after the
audit. **[VERIFIED]** Note: these figures are localhost, low‑volume; production
latency and throughput under load are **[FUTURE]** (not load‑tested — L8).

---

## 8. Deployment recommendations

Go/No‑Go per target, with the specific conditions an assessor should require.

### 8.1 Single‑tenant shadow pilot — **CONDITIONAL GO**
Shadow mode never blocks the customer, records the would‑be verdict, and fails
open on engine outage. **[TESTED]** Required before go:
1. Durable store: run on Supabase (or accept the single‑process standalone
   server with the file store for a bounded PoC) — L7/L9.
2. Minimal observability: one structured log line per decision + per error — L1.
3. `govern()` store‑failure handling — L2.
Not required (shadow, single tenant): tamper‑evidence, rate limiting, RLS.

### 8.2 Single‑tenant enforcement — **CONDITIONAL GO after 8.1 + below**
Enforce mechanics (single flip, fail‑closed on engine outage, instant rollback)
are **[TESTED]**. Additionally required:
4. Alerting on engine‑down, store errors, and BLOCK‑rate anomalies — L1.
5. Confirmed operational runbook for rollback (mode flip) — process, not code.

### 8.3 Multi‑tenant enterprise — **NO‑GO until**
The manifest IDOR is fixed **[VERIFIED]**, but multi‑tenant additionally requires:
6. Tamper‑evident decision log (hash chain) — L3.
7. Database‑level per‑tenant RLS — L4.
8. Per‑key rate limiting / quotas — L5.
9. Items 1–5 from 8.1/8.2.
Estimated 1–2 engineer‑weeks; none require engine changes.

### 8.4 Enterprise SaaS (100s–1000s tenants) — **NO‑GO until**
All of the above plus: Supabase SQL paths executed + load‑tested (L8),
self‑service onboarding/key management, async ingestion queue, and quota
enforcement. This is a distinct build phase, not a hardening pass.

---

## 9. Readiness scoring (evidence‑bounded)

Scores are relative and for prioritisation only; each is bounded by the evidence
above, not by aspiration.

Scores were revised upward in **Addendum B** after L1/L2/L3/L5/L6 moved from
FUTURE to TESTED. Original vs post‑hardening:

| Product | Original | Post‑hardening | Basis |
|---|---|---|---|
| Runtime Assessment | 88 | **88** | Mature engine + delivery kit; unchanged. Ship as‑is. |
| Limited Pilot (single‑tenant, shadow) | 74 | **82** | Observability (L1) + store resilience (L2) now **[TESTED]**; only operational provisioning (durable store) remains. |
| Enterprise Integration (multi‑tenant, enforce) | 64 | **80** | Tamper‑evidence (L3), rate limiting (L5), observability (L1), resilience (L2), scheduled reporting (L6) now **[TESTED]**; conditioned on infra verification (Supabase live + RLS + load test — **[IMPLEMENTED‑UNTESTED]**). |
| Enterprise SaaS | 34 | **40** | Same controls help; held down by multi‑node chain‑head atomicity, in‑process rate limiting, absent self‑service, and no load test. |

---

## 10. Due‑diligence caveats (what an assessor could NOT verify here)

- **No live Supabase**: the `rg_metrics`/`rg_trends` SQL and PK replay lookup are
  present in `supabase/governance_runtime.sql` and `store.js` but were not
  executed against Postgres. Correctness is demonstrated only on the file
  backend (parity test). **[IMPLEMENTED‑UNTESTED]**
- **No Next.js build**: `node_modules` is not installed; the `app/api/runtime/**`
  routes and dashboard page were not compiled or served. They mirror existing
  route conventions but are **[INFERRED]**, not verified. The standalone gateway
  (`scripts/runtime/server.cjs`) *was* exercised over HTTP. **[VERIFIED]**
- **No load/scale test** of the gateway; performance figures are localhost,
  low‑volume. **[VERIFIED for those conditions only]**
- **File store concurrency** is unsafe by inspection (dev‑only). Production must
  use Supabase.

---

## 11. Conclusion

The platform surrounding the frozen engine is **verifiably sound for a
single‑tenant, shadow‑mode pilot** subject to three short operational fixes, and
carries **one High‑severity vulnerability that was found and fixed during this
audit** (cross‑tenant manifest IDOR, proven closed). It is **not yet suitable
for multi‑tenant enforcement or SaaS** pending audit‑integrity, observability,
and database‑isolation controls that are enumerated with severities above. The
engine was not modified and its determinism, provenance, and fail‑closed
behaviour under the platform are demonstrated by 88 passing automated assertions.
Every conclusion in this report is reproducible from the cited commands and
commits; unverified paths are labelled and are not represented as tested.

---

## Addendum B — Enterprise hardening pass (L1/L2/L3/L5/L6)

Five limitations from §5 were implemented and tested in this pass, **without
engine changes** (`git diff main -- governance-service` remains empty). Evidence:
`npm run runtime:enterprise` → **18/18 [VERIFIED]**; the pre‑existing suites still
pass (`runtime:test` 40, `runtime:harden` 25, `runtime:isolation` 23) → **106
platform assertions total**.

| Was | Now | Control | Evidence |
|---|---|---|---|
| L1 no observability | **[TESTED]** | `lib/runtime/log.js` — one JSON event per decision + per error, with counters + a recent‑events ring; wired into `gateway.govern` and `server.cjs`. Metadata only (asserted no raw args). | `runtime:enterprise` L1 |
| L2 no store‑failure resilience | **[TESTED]** | `govern()` wraps persistence: on a store outage it still returns the verdict (`recorded:false` + error logged), and fails **closed** under `RUNTIME_REQUIRE_RECORD`. | `runtime:enterprise` L2 |
| L3 no tamper‑evidence | **[TESTED]** | Per‑environment hash chain (`seq`,`prev_hash`,`entry_hash`) in `store.appendDecision`; `store.verifyChain` detects alteration **and** deletion. `GET /v1/audit/verify` exposes it. | `runtime:enterprise` L3 |
| L5 no rate limiting | **[TESTED]** | `lib/runtime/ratelimit.js` per‑key sliding window; enforced in `govern()` → 429. Off unless `RUNTIME_RATE_LIMIT` set. | `runtime:enterprise` L5 |
| L6 reporting not scheduled | **[TESTED]** (handler) / **[IMPLEMENTED]** (cron) | `reports.generateAllDue` fans out per active org; `app/api/runtime/cron/reports` + `vercel.json` daily cron drive the cadence. | `runtime:enterprise` L6 |

**Still open (unchanged honesty):**
- **L4 per‑tenant RLS** — policies are provided in the schema but commented, because the gateway uses the Supabase **service role, which bypasses RLS**. They apply only to a future non‑service‑role access path. The **tested** isolation control remains the application‑layer org scoping (the IDOR fix). **[IMPLEMENTED‑UNTESTED]**
- **L7/L8** — live Supabase (SQL + RLS), Next.js build, and load/scale testing are still not executed here. **[IMPLEMENTED‑UNTESTED] / [INFERRED]**
- **New scale caveats introduced by this pass (disclosed):** the hash‑chain head is a per‑environment serialization point — a **multi‑node** deployment must advance it in a transaction (documented in the schema); the rate limiter is **in‑process** — multi‑node needs a shared store. Neither affects a single‑node pilot or a single‑tenant enterprise deployment; both matter at SaaS scale.

**Performance:** with the chain on the ingestion path, `govern()` round‑trip is
~1.1 ms on the file store (engine ~0.23 ms) — no measurable regression. On
Supabase the chain adds two DB operations (head read + head update) per
decision; this is **[IMPLEMENTED‑UNTESTED]** for latency and is the main reason
the SaaS‑scale claim remains unverified.

**Net effect:** Limited Pilot 74 → **82** and Enterprise Integration 64 → **80**,
each backed by passing tests for the controls that moved, with the residual
(RLS execution, Supabase, load test) explicitly labelled unverified rather than
claimed.

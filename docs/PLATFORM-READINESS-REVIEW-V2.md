# Platform Readiness Review — after critical hardening (items 1–5)

Follow-up to `docs/PLATFORM-READINESS-REVIEW.md`. This documents the five
critical fixes, the evidence for each, the business risk eliminated, and an
honest re-score. **The engine was not touched** — `governance-service/` and
`morrison_governance` are byte-for-byte unchanged; every change is in the
platform layer around them.

## Verification run (this environment, live engine)

| Suite | Command | Result |
|---|---|---|
| Runtime end-to-end + replay | `npm run runtime:test` | **40 / 40 pass** |
| Hardening (items 1–5) | `npm run runtime:harden` | **25 / 25 pass** |
| Engine + delivery-kit path (unchanged) | `npm run audit:check` | engine reachable ✓, Chromium ✓ |
| Platform latency | inline (100 govern() calls) | engine 0.25ms · **platform overhead ~0.8ms** · round-trip ~1ms |

The end-to-end suite was **40/40 before and after** the refactor — the
aggregation change preserves the exact output contract (a parity test asserts
the store-side aggregate equals an independent raw re-aggregation).

> **Scope honesty.** The `smoke:enterprise` / regression / mutation / stress
> suites live on the separate detection-hardening PR (#132) and exercise the
> **engine + delivery-kit** layer, which this PR neither modifies nor contains.
> They are unaffected by these platform changes. Where a fix has a Supabase-only
> code path (the `rg_metrics` / `rg_trends` SQL, PK replay lookup), that path
> **ships in the schema but was not executed against a live Supabase here** — it
> is flagged below rather than claimed as tested.

## Before → after (the five items)

| # | Item | Before | After | Evidence |
|---|---|---|---|---|
| 1 | **Fail-closed admin key** | `RUNTIME_ADMIN_KEY` defaulted to `rt-admin-dev`; control plane open on a well-known key. | No default. `/admin/*` **disabled (503)** unless `RUNTIME_ADMIN_KEY` is set; wrong key 401; old default rejected. | HTTP tests in `hardening.test.cjs`: 503-without-key, 401-wrong-key, 200-correct-key, `rt-admin-dev`→401. |
| 2 | **Engine provenance on decisions** | Verdict stored; the engine's `attestation` (`ruleset_hash`, `engine_commit`, version) was discarded. | Every decision persists `ruleset_hash` + `attestation` + `engine_commit`; replay detects **engine drift** and refuses to over-claim determinism across ruleset changes. | Tests assert the decision row + `govern()` result carry `ruleset_hash`/`attestation`, and replay reports `engine_drift`. |
| 3 | **Scalable, correct aggregation** | `metrics.summary`/`trends` pulled ≤1M rows into Node; on Supabase `.range(0,999999)` is silently capped at 1000 → **wrong numbers past 1000 rows**. | Aggregation is store-side: `rg_metrics`/`rg_trends` SQL (`count`/`group by`/`percentile_cont`) on Supabase; bounded single-pass on the dev file store. Output contract unchanged. | Parity test: store-side aggregate == independent raw reduce (total, ALLOW/BLOCK, would-block, mean latency, top rule). ⚠ SQL path shipped, not run against live Supabase here. |
| 4 | **Indexed replay lookup** | Replay read up to 100k rows and `.find()`; broke beyond 100k. | `store.getDecisionById` — Supabase PK lookup / file early-exit scan; replay resolves by id. | Tests: `getDecisionById` returns exact row / null; replay resolves + runs exact. ⚠ PK path not run against live Supabase here. |
| 5 | **Durable storage for live traffic** | File store (no locking, not durable) used silently for real traffic. | `health.store.durable` flag + warning; `RUNTIME_REQUIRE_DURABLE=1` **refuses live ingestion on the file store**; server logs a prominent warning. | Tests: health reports `durable:false` + warning; `govern()` refused under `RUNTIME_REQUIRE_DURABLE`. |

## Business risk eliminated

| Item | Risk removed | Who it unblocks |
|---|---|---|
| 1 | Control-plane takeover via a known default key (instant security-review failure). | Any hosted deployment. |
| 2 | "Which ruleset produced this verdict?" being unanswerable; undetected engine drift making replay silently wrong. | Enterprise audit / regulated buyers. |
| 3 | Executives shown **incorrect** governance numbers once volume passes 1000 decisions. | Enterprise dashboards + reports. |
| 4 | Replay/audit breaking exactly when the evidence base is largest. | "Reproduce any decision months later." |
| 5 | Silent evidence loss/corruption from running real traffic on a non-durable store. | Any real pilot. |

## Re-score (honest, evidence-bounded)

| Product | Before | After | Rationale (what actually moved) |
|---|---|---|---|
| **Runtime Assessment** | 88 | **88** | Untouched layer — no change claimed. |
| **Limited Pilot** | 62 | **76** | Provenance (item 2) makes pilot evidence defensible; durable-storage guard (item 5) removes silent-evidence-loss risk. Not 80+: a real pilot still needs Supabase actually **provisioned** and scheduled reporting (item 6, still open). |
| **Enterprise Integration** | 48 | **68** | All five **critical** enterprise blockers I flagged are closed (security default, audit provenance, aggregation correctness, indexed replay, durability). Held below 70 because the **Important**-tier items remain: tamper-evident log (8), per-tenant RLS (9), rate limiting (7). |
| **Enterprise SaaS** | 31 | **35** | The architectural scale-blocker (in-Node reduce + 1000-row cap) is removed **in code** and correct on the file backend, but the SQL path is not yet load-tested and self-service / async ingestion / quotas (items 7, 11) are untouched. Modest, honest bump. |

**Net:** the two headline products both improved on demonstrated evidence —
**Limited Pilot 62 → 76** and **Enterprise Integration 48 → 68** — without
touching the engine, without changing any public API shape, and with the
end-to-end suite still green (40/40) plus 25 new hardening assertions.

## What is explicitly NOT claimed

- The Supabase `rg_metrics`/`rg_trends` SQL and PK replay lookup are **written
  and shipped in the schema** but were **not executed against a live Supabase**
  in this environment. Correctness is demonstrated on the file backend (parity
  test) and the SQL is standard `count`/`group by`/`percentile_cont`; it needs a
  live-DB run + load test before the SaaS-scale claim is fully earned.
- No score was raised for a capability without a passing test or verified
  implementation. Items 6–11 from the prior review remain open and are unchanged.

## Next by ROI (unchanged ordering from the prior review)

6. Scheduled reports (Vercel cron) — completes the Limited-Pilot evidence story.
7. Per-key rate limiting + quotas — reuse `lib/rateLimit.ts`.
8. Tamper-evident (hash-chained) decision log.
9. Per-tenant RLS + idempotency.
10. Admin-action audit + alerting.
11. Self-service onboarding/key UI, then async ingestion queue (SaaS scale).

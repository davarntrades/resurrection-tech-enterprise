# Guardian OS — Platform Truth Audit & Architecture Review

**Scope:** Guardian OS as a whole — the Next.js platform (`lib/`, `app/`), the
Runtime Governance engine (`governance-service/`), the sovereign tooling
(`lib/sovereign/`, `bin/`), and CI (`.github/workflows/`).
**Standard applied:** [`ENGINEERING-PRINCIPLES.md`](./ENGINEERING-PRINCIPLES.md),
[`PLATFORM-TRUTH.md`](./PLATFORM-TRUTH.md).
**Posture:** adversarial. This document exists to find weaknesses, not to
certify the architecture.

---

## Method, and the limits of this audit

Stated first, because an audit that overstates its own coverage commits the
error it is auditing for.

**What was done.** Targeted source review of the subsystems where the platform
makes assertions about itself: storage, health, attestation, audit chain,
readiness projection, dynamic policy loading, the engine's layer construction,
and CI enforcement. Claims made in commit messages and in
`OPERATIONAL-READINESS.md` were **re-derived from source** rather than accepted.
Two findings were confirmed by execution (the parity-guard drift was reproduced
and its failure demonstrated).

**What was not done.** This is not exhaustive. 352 JS/TS files and ~200 Python
files were not each read. No runtime profiling, load testing, or penetration
testing was performed. The scaling findings (§Architecture) are derived from
code structure and are **unmeasured** — they are hypotheses with a mechanism, not
observations. No production environment was reachable from the audit sandbox, so
every production statement here derives from CI executed on GitHub runners.

**Confidence is stated per finding.** `Confirmed` = read the code path
end-to-end, or executed it. `Assessed` = read the mechanism, did not execute.

---

## Prioritised findings

Severity reflects **the consequence of the platform being believed** when it is
wrong, not the difficulty of triggering it.

| # | Finding | Principle | Severity | Confidence |
|---|---|---|---|---|
| 1 | Delete preview and its audit record under-report on read failure | P1, P4 | **High** | Confirmed |
| 2 | Attestation reproducibility breaks when dynamic Ω policies are active | P7 | **High** | Confirmed |
| 3 | Dynamic policy staleness is unobservable | P3 | **High** (latent) | Confirmed |
| 4 | Engine layer cache is unbounded; eviction never fires in production config | P10 | **High** | Assessed |
| 5 | `chain_intact: null` conflates "could not verify" with "not applicable" | P4 | Medium-High | Confirmed |
| 6 | `verifyChain` loads the full decision history into memory | P10 | Medium-High | Assessed |
| 7 | `.catch(() => [])`-into-count is a systemic pattern | P2 | Medium | Confirmed |
| 8 | Strict startup validation is never invoked at boot | P1, P3 | Medium | Confirmed |
| 9 | The check that catches attestation drift runs only on manual dispatch | P6, P8 | Medium | Confirmed |

---

### Finding 1 — The delete preview, and the audit record of the deletion, silently under-report

**Where.** `lib/runtime/customeradmin.js:119-136` (`dependencyMap`),
consumed by `app/api/runtime/admin/delete-customer/route.ts:28` (operator
preview) and `customeradmin.js:150,156` (the deletion itself).

**What is wrong.** Every count in the preview is produced by

```js
(await store.find(c, { org_id }).catch(() => [])).length
```

A failed query yields `[]`, whose `.length` is `0` — **indistinguishable from a
genuinely empty collection.** There are 15 such collections plus a decisions
query.

**Why it is High.** Three compounding consequences:

1. The operator is shown a preview stating the organisation has **0 attached
   records** and, reasonably, confirms permanent deletion.
2. `permanentDelete` writes `counts: map.counts, total: map.total_records` into
   the **admin audit record** (`customeradmin.js:156`) *before* deleting. The
   permanent audit trail therefore records a falsehood about what was destroyed.
3. The actual deletion re-queries via `store.find`/`store.remove`, so it deletes
   the **real** rows. The response returns `total_deleted: map.total_records` —
   the stale zero. Records are destroyed that the audit trail says never existed.

This is the platform lying about its own state, on its most destructive path, in
the artefact whose entire purpose is to be trustworthy afterwards.

**Mitigating factor (verified).** Writes call `assertStorageHealthy()`, so a
*hard, latched* storage fault blocks the deletion at step 1. The exposure is the
**transient** failure — a query timeout, a single-collection permission error, a
5xx from Supabase — which `.catch(() => [])` swallows identically while writes
remain healthy.

**Fix.** `dependencyMap` must distinguish a count from a failure. Return
`{count, state}` per collection; on any `unavailable`, the API must refuse to
render a delete preview and `permanentDelete` must refuse to proceed. A
destructive action premised on an unverified count is exactly the fail-closed
case.

---

### Finding 2 — Attestation reproducibility breaks the moment a customer uses dynamic Ω policies

**Where.** `governance-service/app.py:176-190` versus
`.github/workflows/postdeploy-verify.yml` (the "Replayability" step).

**What is wrong.** The attested `ruleset_hash` is computed over
`layer.rules`, and the layer is built with

```python
custom_rules=DEPLOYMENT_RULES + dyn      # dyn = dynamic_rules.active_rules()
```

Customer-authored dynamic Ω policies are therefore **inside the attestation
hash**. The reproducibility check rebuilds that hash from the pinned engine
commit and the static deployment rules **only** — it has no access to a
customer's dynamic policy set.

**Consequence.** Any deployment with dynamic policies active can never reproduce
its own attestation from source. The platform's headline audit claim —
*"production attestation is reproducible (replayable) from source"* — silently
becomes unsatisfiable for exactly the customers most likely to be audited.

**Why this is not currently firing.** Production reports
`dynamic_policies: {enabled: false, provider: "off", generation: 0}`, so the
static rebuild matches. But dynamic policy loading (#197) and the policy
authoring UI (#198) are **shipped features**. The first customer to activate a
policy breaks the claim, and the most likely response under time pressure — since
the check will appear "broken" — is to weaken or skip the check.

**Fix direction.** Attestation should be **composite** and separately verifiable:

```
attestation.ruleset = {
  static_hash,        # reproducible from the pinned engine commit
  dynamic_hash,       # hash of the active dynamic policy set
  dynamic_generation, # monotonic token
  dynamic_provenance  # signed bundle digest, or DB policy version ids
}
```

Reproducibility then means: rebuild `static_hash` from source **and** verify
`dynamic_hash` against the signed bundle / recorded policy versions. That keeps
the claim true and *strengthens* it, because the customer's own policies become
independently attestable rather than an opaque contribution to a single hash.

---

### Finding 3 — Dynamic policy staleness is unobservable

**Where.** `governance-service/dynamic_rules.py:282-320`.

**What is wrong.** On refresh failure the module correctly keeps the last-good
rule set and backs off (`fetched_at = now`) — a deliberate, documented
fail-closed choice that should not change. But `status()` exposes only
`{enabled, provider, profile, active, generation, refresh_s, table}`. There is
**no last-successful-refresh timestamp, no staleness flag, and no last error.**

**Consequence.** With the policy source unreachable for hours, `/health` reports
`active: 12, generation: 5` — indistinguishable from a healthy, current engine.
An operator who activates a new Ω policy after an incident has no way to learn,
from the platform, that the engine is still enforcing yesterday's rules. This
violates P3 and Platform Truth Row 6 directly.

**Fix.** Add `last_success_at`, `stale: bool` (derived from
`now - last_success_at > refresh_s * k`), and `last_error` to `status()`, and
surface `stale` in `/health` and the Control Room. The warning already logged at
`dynamic_rules.py:293` contains the information; it simply never reaches a
queryable surface.

---

### Finding 4 — The engine's layer cache is unbounded, and its eviction never fires in the current production configuration

**Where.** `governance-service/app.py:154, 176-191`.

**What is wrong.** `_LAYERS` is keyed by
`(tuple_of_domains, horizon, generation)`. Both `domains` and `horizon` are
**request-controlled** (`horizon` validated to 1–8; `domains` to valid enum
members, but *combinations* are unconstrained). With 19 `OmegaDomain` values the
key space is `2^19 × 8 ≈ 4.2 million` distinct entries, each holding a
`GovernanceLayer` with ~96 rules.

The only eviction is:

```python
for k in [k for k in _LAYERS if k[2] != gen]: _LAYERS.pop(k, None)
```

This drops entries built against a **superseded policy generation**. In
production `dynamic_policies.enabled` is `false`, so `generation` is permanently
`0` — **no entry is ever evicted.** Cache size is bounded only by the variety of
requests the process has ever seen.

**Severity and honest scoping.** This is *not* an unauthenticated DoS. Both
paths that reach `_layer_for` (`/v1/evaluate`, `/v1/evaluate-step`) are
token-protected, and production confirms `evaluate_protected: true`. The public
`/v1/assess` correctly uses a single pre-warmed fixed layer
(`_ASSESS_STATE`, app.py:202-212) and does **not** touch this cache — good
isolation, and worth preserving deliberately.

It remains High because the realistic trigger is **legitimate use**: a
multi-tenant integration that scopes domains per request, or per customer, walks
the key space as a normal consequence of correct behaviour. Per P10, a
governance control that exhausts memory is not degraded — it is absent, and
everything it would have blocked proceeds ungoverned.

**Fix.** Bound the cache explicitly (LRU with a size ceiling), keep the
generation-based invalidation as a *correctness* mechanism alongside it, and
emit the cache size in `/health`. Eviction driven only by policy change conflates
correctness with capacity.

---

### Finding 5 — `chain_intact: null` conflates "could not verify" with "not applicable"

**Where.** `lib/runtime/fullaudit.js:101,142`; same pattern at
`lib/runtime/enterpriseassessment.js:117`.

```js
const chain = await store.verifyChain(org_id, environment_id).catch(() => null);
// ...
chain_intact: chain ? !!chain.ok : null,
```

**What is wrong.** Three distinct realities collapse into two values. `true` =
verified intact. `false` = verified broken. `null` = *either* "no chain applies"
*or* "verification threw" — and `.catch(() => null)` **discards the reason**.

**Consequence.** This is the canonical Platform Truth Row 2 violation, in a
customer-facing audit report. An assessor reading a blank or "not assessed"
integrity row cannot distinguish "nothing to check" from "we tried and could not
tell you." The reason no longer exists anywhere by the time the report renders.

**Credit where due.** The surrounding design is sound: `reportType: "full_audit"`
carries the comment *"mark missing sections, don't drop them"*, so the renderer
does surface absence rather than hiding it. The defect is the loss of
*discrimination and reason*, not the loss of the row.

**Fix.** Return the tri-state explicitly —
`{state: "verified"|"refuted"|"unavailable"|"not_applicable", reason?}` — and
render `unavailable` distinctly from `not_applicable`, carrying the reason.

---

### Finding 6 — Chain verification loads the entire decision history into memory

**Where.** `lib/runtime/store.js:344-345`.

```js
const rows = (await queryDecisions({ org_id, environment_id, limit: 1000000 }))
```

**What is wrong.** Integrity verification is O(n) in memory over all decisions
ever recorded for an environment, with a hard ceiling of one million rows.

**Consequence, at Fortune 100 scale.** A governed enterprise generating 10
decisions/second produces ~864k decisions/day. Within two days the `1000000`
ceiling is exceeded — at which point verification **silently verifies a prefix**
and reports `ok` for a chain it did not fully check. That is a Platform Truth
violation (Row 2) arriving purely as a function of customer success. Before that,
memory pressure on the verification path is substantial.

**Fix.** Stream the chain in ordered pages, verifying incrementally and carrying
only the running hash; make the row count part of the result so a truncated
verification is impossible to mistake for a complete one. Anchor periodic
checkpoints so verification need not always start from genesis.

---

### Finding 7 — `.catch(() => [])`-into-count is systemic, not localised

**Where.** 303 catch-fallback sites across `lib/`; the dangerous subclass is any
whose result feeds a count, a total, or a decision.

**Assessment.** Most are benign by construction, and the Phase 6 review
correctly identified the `lib/ops/*` dashboard reads as deliberate honest
degradation. That judgement holds where the fallback **surfaces as an explicit
not-instrumented note** — the readiness grammar
(`lib/ops/packs/sovereign/projections.js`) does exactly this and is the model.

The gap is that nothing **enforces** the distinction. Finding 1 is an instance
that slipped through precisely because the pattern is idiomatic here, so a
reviewer's eye passes over it.

**Fix.** A contract test: in integrity- or decision-critical modules, a
`.catch(() => [])` / `.catch(() => 0)` whose value flows into a count, total, or
comparison must be annotated with a justification — the same rule already applied
to empty `catch` blocks, extended to empty *values*. This is P5 applied to
values rather than exceptions.

---

### Finding 8 — Strict startup validation exists but is never invoked at boot

**Where.** `lib/runtime/startup.js`; no caller passes `strict: true` anywhere in
`lib/`, `app/`, `bin/`, or `scripts/`.

**Assessment.** This was Phase 6 follow-up #2, explicitly deferred as a product
decision ("it changes production start-up semantics and is your call") — so it is
a **known** deferral, not an oversight. It is listed because the consequence is
live: the platform can still boot into a state it cannot describe, which is the
precondition for every Phase 6 defect.

**Recommendation.** Enable `strict: true` on the standalone runtime server and
the sovereign container first, where refusing to start is unambiguously
preferable to starting wrong. Vercel is the harder call and can follow.

---

### Finding 9 — The check that catches attestation drift runs only on manual dispatch

**Where.** `.github/workflows/postdeploy-verify.yml` — `on: workflow_dispatch` only.

**Assessment.** The comment explains the reasoning ("adds zero ongoing noise —
the nightly `verify-activation` handles continuous health"), which is a
defensible trade. But the empirical result is measurable: the replay parity drift
was introduced with the ops-governance work and sat undetected from **16 June to
25 July**, and was found only because this session dispatched the workflow
manually. The one check that verifies production matches source ran twice in six
weeks.

**Recommendation.** Split it. The cheap, high-signal steps (`/health`
attestation, ruleset rebuild) should run on a schedule and on every deploy to
main; the expensive live-traffic steps can stay dispatch-only. Reproducibility is
a claim the platform makes continuously and should therefore be checked
continuously.

---

## Recommended contract tests

`scripts/ops/contracts.test.cjs` is the right instrument for the class-level
fixes, because it is static, fast, and cannot rot into a no-op:

1. **Destructive previews must be fault-aware** — no `.catch(() => [])` in any
   module whose exports include a `permanentDelete`/`remove`-class function.
2. **Empty-value fallbacks feeding counts must be justified** (Finding 7).
3. **Tri-state evidence** — `chain_intact`-style fields must not be assigned from
   a `?:` over a nullable that also encodes not-applicable.
4. **Caches keyed by request input must declare a bound** — grep for dict/map
   assignment keyed by request-derived tuples without an eviction policy.
5. **Every workflow that verifies a production claim must have a schedule or a
   push trigger** (Finding 9).
6. **Status surfaces must expose freshness** — any module with a `_cache` holding
   `fetched_at` must expose a last-success timestamp in its `status()`.

---

## Architecture review

Beyond the specific findings, five structural observations. These are the ones
worth arguing about.

### A1 — Attestation is a single opaque hash where it should be a composite

Finding 2 is the symptom; the design issue is that `ruleset_hash` mixes three
things with different provenance and different verification stories: engine
defaults (verifiable from a pinned commit), deployment rules (same), and customer
dynamic policies (verifiable only against a signed bundle or DB version). One
hash cannot serve all three, and the current scheme quietly privileges the case
where the third is empty. Making the composite explicit is a small change now and
a very expensive one after customers hold attestations that must remain valid.

### A2 — Truth is enforced at the library boundary, which new call paths can bypass

`assertStorageHealthy()` is the platform's strongest truth guarantee, and it is
excellent — but it is a *convention of the store module*. Finding 1 shows how a
caller reaches a destructive decision without ever crossing it, simply by reading
rather than writing. Guarantees that matter this much should sit at an
architectural chokepoint (the gateway, or the kernel per the Tier-1
recommendation in the principles document), not at a library each new caller must
remember to use correctly.

### A3 — Read-degradation and write-refusal are asymmetric, and the asymmetry is undocumented at the call sites

The decision that writes refuse while reads degrade is deliberate and correct —
it keeps faults diagnosable. But it means **every read in the platform can return
a plausible lie**, and the codebase communicates this nowhere near the reads. The
asymmetry needs to be a stated contract with a naming convention
(`findOrThrow` vs `findOrEmpty`), so a developer choosing a read is choosing a
truth posture consciously.

### A4 — Scaling assumptions are single-tenant-shaped

Findings 4 and 6 share a root: data structures sized for one enterprise's
evaluation traffic. The in-memory layer cache, the million-row chain
verification, and the single-writer local store are all defensible for a pilot
and all become load-bearing risks for a Fortune 100 or a national deployment. The
sovereign posture makes this sharper, not softer — an air-gapped estate cannot
scale horizontally on demand, so the ceiling must be known *before* deployment.
**Recommendation:** publish a capacity model (decisions/sec, decisions retained,
memory per layer, verification time vs history depth) as part of the deployment
profile, and assert it in acceptance rather than discovering it in production.

### A5 — The platform's honesty mechanisms are strong but unevenly distributed

This is the most encouraging finding and the most actionable. The best code in
this repository — `lib/runtime/index.js` health, the grounded-source grammar, the
sovereign admissibility refusals, the engine's fail-closed client — implements
the Platform Truth specification almost exactly, and did so before the
specification was written. The weak points are not places where a worse
philosophy was applied; they are places where **no explicit truth decision was
made at all** and an idiom filled the gap.

That is why the remedy is contract tests and a written specification rather than
rearchitecting: the architecture already knows how to be honest. It needs the
standard to be mandatory rather than exemplary.

### A6 — Governance gaps worth naming

- **No independent penetration test** and **no third-party accreditation** —
  already tracked in `docs/ACCREDITATION.md` as open gaps, and correctly declared
  rather than papered over. Still the first thing a sovereign assessor will ask
  for.
- **No witnessed acceptance on customer hardware** — `guardian acceptance` marks
  unwitnessed runs as self-tests, which is the right honesty, but the gap
  remains.
- **Two "evidence pack" documents** (Control Room branded PDF vs CLI offline
  PDF) with no canonical designation — a real ambiguity in what a customer is
  told is *the* evidence.
- **Operator audit sink is best-effort** — `permanentDelete` proceeds when the
  audit record fails (`customeradmin.js:158`, deliberately: "deletion should not
  be blocked by the audit sink"). Defensible, but for a *permanent delete* the
  opposite choice is more defensible, and it should be an explicit product
  decision rather than an inline comment.

---

## Suggested sequence

1. **Finding 1** — destructive path, cheap fix, highest consequence-if-believed.
2. **Finding 3** — small change (three fields), removes a whole blind spot.
3. **Finding 2 / A1** — design work; do it before a customer depends on dynamic
   policies, not after.
4. **Finding 9** — one-line scheduling change; restores continuous verification.
5. **Findings 4, 6** — bounded cache and streaming verification, ahead of any
   Fortune 100 or sovereign scale commitment.
6. **Findings 5, 7, 8** and the contract tests — converts the individual fixes
   into class-level enforcement.

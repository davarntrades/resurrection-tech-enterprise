# Platform Truth — a specification

**Status:** normative specification for Guardian OS.
**Question it answers:** what must be true before Guardian OS is permitted to
claim something?

Companion: [`ENGINEERING-PRINCIPLES.md`](./ENGINEERING-PRINCIPLES.md) (why),
[`PLATFORM-TRUTH-AUDIT.md`](./PLATFORM-TRUTH-AUDIT.md) (where we fall short).

---

## 1. The rule

> Guardian OS may assert a capability **C** only if it holds evidence **E(C)**
> that was **produced by execution**, is **fresh** within C's stated window, and
> whose **failure to produce would have been observable**.

Absent that, Guardian OS must report `unknown` with a reason. `unknown` is a
**valid, first-class answer** — never an error state to be smoothed over, and
never to be rendered identically to `false`.

---

## 2. The four truth states

Every reported capability resolves to exactly one:

| State | Meaning | Required to emit |
|---|---|---|
| `verified` | Executed evidence exists and is fresh | E(C) present, within freshness window, provenance recorded |
| `refuted` | Executed evidence shows the capability is **absent or broken** | E(C) present and negative |
| `unavailable` | Evidence could not be produced | The **reason** and the attempt's timestamp |
| `not_applicable` | C is meaningless in this deployment | The deployment property that makes it so |

**The two hard rules:**

1. **`unavailable` ≠ `not_applicable`.** Conflating "we could not check" with
   "there is nothing to check" is the single most dangerous error in this
   specification, because both plausibly render as a blank cell to an auditor
   while meaning opposite things about risk.
2. **`unavailable` ≠ `refuted`.** A failed integrity check is not a passed one,
   and it is not a failed one either. It is an absence of knowledge, and must be
   escalated as such.

### Prohibited encodings

These have all occurred in this codebase or are reachable in it today:

- Returning `[]` or `0` for a failed read (indistinguishable from empty).
- Returning `null` for both "check failed" and "check not applicable".
- Reporting a cached value with no indication of its age after the source became
  unreachable.
- Deriving `verified` from configuration (`env var set` ⇒ `capability present`).
- A check whose skip path and pass path produce the same exit code.

---

## 3. Evidence requirements per capability

For each capability Guardian OS reports, this table is normative: it states what
must exist, how fresh it must be, and what the platform must emit when the
evidence is missing. **"Config only" is never sufficient** for any row.

| # | Reported capability | Required evidence E(C) | Freshness | If absent, report |
|---|---|---|---|---|
| 1 | **Evidence is durable** | A successful write **and read-back** against the configured backend; `storageFault()` unset | Per boot + on fault | `unavailable` + fault reason; refuse evidence writes |
| 2 | **Audit chain is intact** | `verifyChain()` executed to completion, returning `ok` | Per report generation | `unavailable` + why verification could not run — **never** blank |
| 3 | **Governed by Ω rule set R** | `ruleset_hash` computed from the **loaded** layer, present on the verdict | Per verdict | Refuse to emit the verdict |
| 4 | **Attestation is reproducible** | Independent rebuild from the pinned engine commit reproduces `ruleset_hash` byte-for-byte | Per deploy | `unavailable`; block release |
| 5 | **Engine is enforcing** | A live verdict from the engine (`source=morrison`), not merely a reachable URL | Per request | `ENGINE_UNAVAILABLE`, fail closed, visibly |
| 6 | **Dynamic Ω policies are current** | A **successful** refresh from the policy source, with its timestamp | ≤ `refresh_s` | `stale` + last-success time + last error |
| 7 | **This deployment is air-gapped** | An executed test under a real network-denied namespace | Per CI run + per acceptance | `unavailable` — never infer from profile name |
| 8 | **Sovereign pack is admissible** | Admissibility gate executed against **derived** profile guarantees | Per install + on profile change | Refuse install, naming the missing guarantee |
| 9 | **Readiness measure = N** | Resolution through the closed source grammar with `grounded:true` | Per computation | Explicit note carrying the reason — **never a number** |
| 10 | **Determinism / replay** | Re-derivation producing bit-identical hashes, plus a **tamper case that fails** | Per CI run | `unavailable`; do not claim determinism |
| 11 | **Capability is tested** | The test executed **and** is demonstrably able to fail | Per CI run | Treat as untested |
| 12 | **Accreditation posture** | The named third-party artefact, or an explicit open-gap entry | Per publication | Open gap, stated plainly |

### Notes on specific rows

**Row 1 (durability).** Client construction succeeding is not evidence. The
Phase 6 critical defect was precisely a constructed-then-failed client. A
round-trip is the minimum.

**Row 2 (chain).** Currently `chain_intact: chain ? !!chain.ok : null`
(`lib/runtime/fullaudit.js:142`) collapses `unavailable` into the same `null` as
`not_applicable`, and `.catch(() => null)` discards the reason. This is the
canonical Row-2 violation; see audit Finding 3.

**Row 5 (enforcement).** The website already distinguishes
`Morrison Runtime Governance engine` from `Heuristic fallback` in its live-demo
badge, and CI asserts both strings ship. That badge is the correct pattern: the
user is told *which* system answered.

**Row 6 (policy freshness).** Not currently satisfiable — `status()` exposes no
last-success timestamp. See Finding 2.

**Row 9 (readiness).** Already satisfied by the closed grammar in
`lib/ops/packs/sovereign/projections.js`. This row is the reference
implementation for the rest of the table.

---

## 4. Provenance metadata

Every `verified` claim must carry, in machine-readable form:

```
{ state, observed_at, method, source, engine_commit?, ruleset_hash? }
```

- `method` — how it was established: `executed` | `round_trip` | `rebuilt` |
  `witnessed`. Never `configured`.
- `observed_at` — when the evidence was produced, **not** when it was reported.
  The gap between these two is exactly what `stale` detection needs.
- `source` — the instrumented source, drawn from a closed grammar where one
  exists.

A claim without provenance is `unknown` regardless of its apparent value.

---

## 5. Freshness

Truth decays. A capability's evidence carries a **stated window**; past it, the
state degrades from `verified` to `stale`, and `stale` must be visually and
structurally distinct from `verified`.

| Evidence class | Window | Degrades to |
|---|---|---|
| Per-request (engine verdict) | The request | n/a |
| Cached policy set | `refresh_s` (default 30s) | `stale` + last-success time |
| Storage health | Boot, plus on any fault | `unknown` |
| Deployment attestation | Pinned commit; re-verify per deploy | `unavailable` |
| Acceptance / field trial | Per release, per hardware profile | `unavailable` |

**Serving stale data is often correct** — keeping the last-good Ω rule set on a
refresh failure is a deliberate fail-closed choice and should not change.
**Serving stale data while reporting it as current is never correct.**

---

## 6. Conformance checklist

A surface conforms to Platform Truth when all six hold:

1. Every claim maps to a row in §3, or is not made.
2. Every `verified` carries §4 provenance.
3. `unavailable`, `not_applicable`, and `refuted` are distinguishable in the data
   model **and** in every rendering of it.
4. No claim derives from configuration alone.
5. Stale evidence is labelled stale, with its last-success time.
6. Every guard behind a claim has been demonstrated to fail when the underlying
   property is violated.

Item 6 is the one most often skipped and is the reason this specification exists:
Guardian OS shipped a guard that had never executed, protecting a property that
had already drifted.

# Guardian OS — Engineering Principles

**Status:** engineering standard. Applies to all Guardian OS code, the Runtime
Governance engine, the Control Room, the CLI, and the deployment tooling.

Companion documents: [`PLATFORM-TRUTH.md`](./PLATFORM-TRUTH.md) defines what the
platform is allowed to claim; [`PLATFORM-TRUTH-AUDIT.md`](./PLATFORM-TRUTH-AUDIT.md)
audits the platform against these principles;
[`OPERATIONAL-READINESS.md`](./OPERATIONAL-READINESS.md) is the Phase 6 review
that produced most of the evidence below.

---

## 0. Why this document exists

Across Phase 6 and Phase 7, every defect that reached a customer-visible surface
shared one shape:

> **The platform believed something that was not true, and nothing said so.**

Not one of them was a logic error in the governance geometry. The engine's
verdicts were correct throughout. What failed was the platform's account of
itself:

| Defect | What was believed | What was true |
|---|---|---|
| Silent storage downgrade | Evidence is durable in Supabase | Evidence was on ephemeral local disk |
| Dead CI pipeline | Air-gapped operation is proven by CI | The workflow never parsed, so never ran |
| Vacuous air-gap assertion | The tamper test passes | The test could not fail |
| `[object Object]` in PDFs | Reports render customer evidence | Reports rendered a type name |
| Replay parity drift | Attestations are reproducible from source | Replay rebuilt 85 of 96 rules |
| Dormant parity guard | A test prevents that drift recurring | The test never executed in CI |

A governance platform is a truth-telling instrument. Its entire commercial and
regulatory value rests on a customer being able to believe what it reports. A
wrong verdict is a bug; a **confidently wrong self-report is a breach of the
product's core promise**. These principles exist to make that class of failure
structurally difficult rather than merely discouraged.

The last two rows deserve emphasis. The fix for a defect *created a new instance
of the same class*: a guard was written, believed to be protecting the codebase,
and never ran. Being aware of this failure mode does not confer immunity from it.
Only executable enforcement does.

---

## The Principles

### P1 — The platform must never lie about its own state

Any surface that reports what Guardian OS *is* — health endpoints, the Control
Room, attestations, CLI output, generated reports — must report observed
reality. If reality cannot be observed, it must say so.

**Corollary:** *configuration is not state.* "Supabase credentials are set" is
not "evidence is durable." "The sovereign profile is selected" is not "this
deployment is air-gapped." A claim derived from configuration alone is a guess
wearing the costume of a fact.

**Exemplar in the codebase.** `lib/runtime/index.js:41-64` distinguishes three
materially different meanings of "the store is local": a deliberate sovereign
deployment target, a development fallback, and *a cloud store that was
configured and failed to construct* — the last outranking the others precisely
because "the deployment believes it is on Supabase and is not" is the dangerous
one. That function is the standard for the rest of the platform.

---

### P2 — Honest degradation beats silent success

Degrading is legitimate. Degrading **quietly** is not. Every fallback path must
answer three questions at the moment it is taken:

1. **Is this fallback intentional here?** A path that legitimately serves a
   pilot's first day must not also mask a broken production configuration.
   Guardian OS distinguishes these by requiring an explicit
   `RUNTIME_ALLOW_STORAGE_DOWNGRADE=1` — deliberately *not* profile-driven,
   because no configuration should silently *imply* a downgrade.
2. **Does the caller learn that it degraded?** A return value that is
   indistinguishable from the success case is a silent failure regardless of what
   was logged.
3. **Is the reason preserved?** `catch { return null }` destroys the diagnosis
   along with the error.

**The sharpest form of this rule:** an empty result must never be the fallback
for a failed read. `await store.find(c, {...}).catch(() => [])` followed by
`.length` reports **zero records** when the query fails — identical to a
genuinely empty collection. If a human then makes a decision on that number, the
platform has actively misinformed them. See Finding 1 in the audit, where this
pattern sits on a permanent-delete preview.

---

### P3 — Runtime state must be observable

If an operator cannot determine the platform's true state from the platform
itself, the platform is unobservable regardless of how much it logs. Logs are
evidence *for whoever was watching*; a governance platform must answer the
question on demand, afterwards, to someone who was not.

Every subsystem with a failure mode must expose:

- its **current** state,
- whether that state was **observed or assumed**,
- **when** it was last confirmed,
- and the **reason** for any degraded condition.

**"When" is the most commonly missed.** A cache that reports `active: 12` after
losing contact with its source is not reporting a fact; it is reporting a
memory. Freshness is part of truth. See Finding 2.

---

### P4 — Evidence must be durable, or explicitly unavailable

Guardian OS produces audit evidence for regulators, insurers, and enterprise
assessors. Evidence has exactly two valid states: **durably recorded**, or
**declared unavailable with a reason**. There is no third state, and in
particular:

- Evidence written to non-durable storage while surfaces report normal operation
  is worse than no evidence, because it is *trusted*.
- An integrity check that **failed to run** must never be presented the same way
  as one that was **not applicable**. Both may render as "not verified," but the
  platform must know — and be able to say — which it was. See Finding 3.

**Enforced today:** every write path in `lib/runtime/store.js` calls
`assertStorageHealthy()` and throws `StorageUnavailableError` rather than writing
to the wrong place. Reads deliberately still degrade, so the fault stays
diagnosable — a considered asymmetry, not an oversight.

---

### P5 — Every degradation must be intentional and documented

A fallback is a product decision, not an implementation detail. Each one must
have a named owner, a stated trigger, and a documented intended behaviour. The
codebase enforces the reviewable form of this: in integrity-critical modules an
empty `catch` must carry an explanation
(`scripts/ops/contracts.test.cjs`). The rule is deliberately *"you may discard an
error only if you say why"* — a documented decision is reviewable; a bare
`catch {}` is the absence of one.

This principle is what separates Guardian OS's *good* fallbacks from its bad
ones. Two examples that are correct precisely because they are deliberate:

- The engine client fails **soft** to a structured `{ok:false}`
  (`lib/runtime/engine.js:7`) so the gateway records an `ENGINE_UNAVAILABLE`
  decision rather than crashing the request — and because an unreachable engine
  blocks governed actions, this soft failure is a **fail-closed** outcome.
- Dynamic Ω policies keep the last-good rule set on refresh failure
  (`governance-service/dynamic_rules.py:292`) — *"never open the gate."*

Both are right. Neither would be acceptable undocumented.

---

### P6 — Verification must prove reality, not configuration

A test that asserts the shape of a config file proves the config file. A
verification step must exercise the **running system** and be capable of
**failing**.

Three anti-patterns, all observed in this codebase:

1. **The vacuous assertion.** `airgap_engine_check.py` asserted `ok == false` on
   a bundle it had never loaded — a condition an unloaded bundle satisfies
   trivially. *A test that cannot fail is worse than no test, because it is
   counted as coverage.*
2. **The dormant guard.** The replay parity check could only run when FastAPI was
   importable; the job that ran it never installed FastAPI. It printed a
   skip line and passed, on every run, for its entire existence.
3. **The proxy.** Local test results were treated as evidence that CI had run.
   The CI in question could not parse.

**The standard:** every guard must be proven to fail. When adding a check,
deliberately introduce the defect it targets and confirm a red build. The fix in
PR #219 was accompanied by exactly that demonstration — re-introducing the rule
drift produced a failure naming all eleven missing `ops_*` rules.

---

### P7 — Claims must be backed by executable evidence

Anything Guardian OS asserts to a customer — coverage, readiness, blocking,
determinism, air-gap capability, accreditation posture — must be traceable to
something that **executes** and can be re-run by a skeptical third party.

Marketing text, documentation, and commit messages are **not** evidence. During
this review, two claims made in a commit message were checked rather than
trusted; both held (see P8). That they held is not the point — that they were
checked is.

**Exemplar.** The sovereign pack readiness model
(`lib/ops/packs/sovereign/projections.js:43-123`) resolves every measure through
a **closed grammar** of instrumented sources. A pack cannot name a source into
existence: an unrecognised or un-instrumented source yields
`{grounded:false, reason}` which renders as an explicit note carrying the reason,
never a number. This is the correct shape for every capability claim in the
platform.

---

### P8 — Trust nothing that has not been executed, including your own prior work

The dormant parity guard was written by the same process, in the same week, that
wrote the principle it was meant to enforce. Documentation drifts from reality
silently; only executed code reports.

Applied concretely:

- Do not cite a workflow as proof without confirming it ran and could have failed.
- Do not cite a document's claims as fact; re-derive them.
- Re-verify prior findings when the surrounding code changes.
- **Treat your own recommendations as unverified until executed.** Section 7 of
  the Phase 6 report listed six follow-ups. This audit found that follow-up #2
  was never implemented (Finding 5) — not because anyone decided against it, but
  because a documented recommendation does not execute itself.

---

### P9 — Fail-closed under uncertainty, and make the closure visible

Guardian OS's security posture is fail-closed: uncertainty must never widen
permission. But a fail-closed system that closes *silently* trades a security
failure for an availability failure that nobody can diagnose.

The full rule is **fail closed, and say so, with the reason**. A blocked action
whose refusal names the missing guarantee (as
`lib/ops/sovereignty.js` admissibility refusals do) is a governance control. A
blocked action with a generic error is an outage.

---

### P10 — Availability of a control is part of its correctness

A governance control that is unreachable is not "degraded" — it is **absent**,
and everything downstream of it is ungoverned. Resource exhaustion, unbounded
caches, and unbounded queries are therefore not merely performance concerns in
this codebase; they are governance concerns. See Findings 6 and 7, where a
request-controlled cache and an in-memory chain verification both threaten the
availability of controls at enterprise scale.

---

## Which principles belong in the Runtime Governance kernel

The user question this section answers: *which of these should the platform
enforce on itself, rather than relying on engineering discipline?*

The distinction that matters is **what the kernel is for**. The Runtime
Governance kernel governs *proposed tool actions within a trajectory*. It is not
a linter and must not become one. A principle belongs in the kernel only if its
violation can be expressed as **an action that must not be permitted at
runtime**.

Three tiers:

### Tier 1 — Belongs in the kernel as Ω policy (recommended)

| Principle | Proposed Ω rule | Why the kernel |
|---|---|---|
| **P4** Evidence durability | `ops_evidence_write_without_durable_store` — BLOCK any evidence-producing or report-delivering action while `storageFault()` is set and downgrade is not explicitly permitted | This is exactly the Phase 6 critical defect expressed as a trajectory constraint. Today it is enforced by `assertStorageHealthy()` in the store — correct, but a *library* guarantee that a new call path can bypass. In the kernel it becomes a property of the deployment. |
| **P1** No false claims | `ops_capability_claim_without_evidence` — BLOCK delivery/export of any customer-facing artefact asserting a capability whose evidence resolved `grounded:false` | Guardian OS already computes groundedness (P7 exemplar). Promoting it to a kernel refusal makes shipping an ungrounded claim structurally impossible, not merely discouraged in review. |
| **P9** Visible fail-closed | Extend the existing refusal contract so every BLOCK/ESCALATE carries `reason` + `required_action` | Already true for sovereign admissibility and healthcare escalation; making it a kernel invariant closes the gap for future domains uniformly. |

These three share a decisive property: **each is a statement about an action, at
the moment it is proposed, with all information available to the engine.** That
is the kernel's native shape.

### Tier 2 — Belongs in the platform's startup/health contract, not the kernel

**P3** (observability) and **P5** (intentional degradation) are *deployment
properties*, not action properties. Their correct home is
`lib/runtime/startup.js` with `strict: true` at boot — a platform that cannot
describe its own state should refuse to start. Encoding them as Ω rules would
mean evaluating a trajectory to discover a configuration fault, which is both
late and the wrong instrument.

### Tier 3 — Must remain engineering standards, enforced by contract tests

**P2, P6, P7 (as practice), P8, P10** are properties of *code and process*. The
kernel cannot evaluate whether a test can fail, whether a catch is documented, or
whether a cache is bounded. These belong in `scripts/ops/contracts.test.cjs`,
which already enforces several and should be extended (see audit §Recommended
contract tests).

**A warning against over-promotion.** There is a real temptation to put
everything in the kernel because the kernel is the product's crown jewel. Resist
it. Every rule added to Ω is a rule that must hold for every customer, in every
domain, forever, and that participates in `ruleset_hash` — changing it changes
every attestation. The kernel earns its trustworthiness partly through
restraint.

---

## How these principles are enforced today

| Mechanism | What it enforces | Where |
|---|---|---|
| `assertStorageHealthy()` on all writes | P4 | `lib/runtime/store.js` |
| Startup validation (8 facts) | P1, P3 | `lib/runtime/startup.js` |
| Contract tests (47 assertions) | P5, P6 | `scripts/ops/contracts.test.cjs` |
| Grounded-source grammar | P7 | `lib/ops/packs/sovereign/projections.js` |
| Replay parity + `ruleset_hash` rebuild | P6, P7 | `governance-service/test_replay.py`, `postdeploy-verify.yml` |
| Sovereign admissibility refusals | P9 | `lib/ops/sovereignty.js` |

Gaps in this table are the subject of the audit.

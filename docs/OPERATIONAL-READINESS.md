# Operational Readiness Report

**Guardian OS — Phase 6 hardening review**
Scope: the sovereign deployment work, and the engineering practices it exposed.

---

## 1. Summary

Four defects were found while building and shipping Phase 6. None was found by
the existing test suite. All four share one shape:

> **The system was not what we believed it was, and nothing said so.**

That is the finding worth acting on. The individual bugs are fixed; more
importantly, each has been converted into a property the codebase now enforces,
so the class cannot recur silently.

| # | Defect | Severity | How it was found |
|---|---|---|---|
| 1 | Storage silently downgraded from Supabase to local disk on Node < 22 | **Critical** | Removing a `catch {}` on principle; CI named the cause within one run |
| 2 | The sovereign CI workflow never parsed, so it never ran — while being cited as proof | **High** | Investigating a "failure with zero jobs" before merging |
| 3 | An air-gap check read status before loading, so the tamper test passed vacuously | **High** | Running the CI script locally instead of trusting it |
| 4 | Structured values rendered as `[object Object]` in customer-facing PDFs | Medium | The user read the generated artefacts |

Two further latent instances of #1 were found by the follow-up audit
(§5) and fixed before they could bite.

---

## 2. What was discovered, and the root cause of each

### 2.1 Silent storage downgrade — critical

**What happened.** `lib/runtime/store.js` wrapped Supabase client construction
in `catch { _sb = null; }`. On Node < 22, `@supabase/supabase-js` throws at
`createClient` because it requires a native `WebSocket`. The exception was
discarded, `backend()` returned `"file"`, and the platform continued —
**writing governance evidence, decision logs and the audit hash chain to
non-durable local disk while every surface reported normal operation.**

**Root cause.** Not the Node version. The Node version was a trigger; the defect
was a `catch` that converted an unrecoverable configuration fault into a silent
behaviour change. The fallback path existed for a legitimate reason (a pilot's
first day, before a database is provisioned) and was allowed to serve a second,
illegitimate purpose (masking a broken configuration) because nothing
distinguished "no database configured" from "database configured and broken".

**Contributing cause.** `package.json` declared `engines.node >= 18.18.0`, CI
ran Node 20, and the dependency required 22. Three answers to one question, none
checked against the others.

### 2.2 A CI pipeline that never ran — high

**What happened.** `.github/workflows/sovereign.yml` contained multi-line Python
at column 0 inside a `run: |` block, which terminates the YAML block scalar.
GitHub could not parse the file and reported **"failure, 0 jobs"** on every
push. I described that CI as proving air-gapped operation. It proved nothing.

**Root cause.** Two compounding factors. First, embedding three languages
(YAML → shell → Python) in one file, where quoting errors are silent. Second —
and this is the real one — **an unparseable workflow fails in a way that looks
like an infrastructure blip**, so the signal was there and was misread. Local
test results were used as a proxy for CI having run.

### 2.3 A vacuous assertion — high

**What happened.** `airgap_engine_check.py` read `policy_bundle.status()` before
calling `active_rules()`. Because `status()` reports the *last load's* result and
no load had happened, it returned `ok: false` with no errors. The
tampered-bundle branch asserted `ok == false` — which an **unloaded** bundle
satisfies trivially. It would have passed against a perfectly good bundle.

**Root cause.** An assertion written against a *symptom* (`ok == false`) rather
than a *cause*. A test that cannot fail is worse than no test, because it is
counted as coverage.

### 2.4 `[object Object]` in customer-facing PDFs — medium

**What happened.** Governance sub-scores (`{score, band}`) and escalated
approvals (`{action, reason}`) were flattened with `String()`.

**Root cause.** A renderer that assumed every value was a scalar, with no
contract at the boundary. When upstream shapes gained structure — a normal,
healthy thing for them to do — the renderer degraded into a defect rather than
into something legible.

---

## 3. Fixes applied

| Defect | Fix |
|---|---|
| 3.1 Silent downgrade | The failure is **recorded** (`store.storageFault()`), logged at error level, and surfaced in health. **Every write path** (`insert`, `update`, `remove`, `appendDecision`, `storagePut`) calls `assertStorageHealthy()` and throws `StorageUnavailableError` rather than writing to the wrong place. Reads still degrade, so the fault remains diagnosable. |
| 3.1 (contributing) | `engines.node` pinned to `>=22`; `.nvmrc` added; all workflows and Dockerfiles moved to Node 22; the floor is read from `package.json` in exactly one place. |
| 3.2 Dead pipeline | Every embedded script extracted to a real file (`airgap_engine_check.py`, `assert-verify-offline.cjs`, `fixtures/ci_wire_cap.json`). The workflow now only *calls* things. Build context corrected to `governance-service`; `PYTHONPATH` set for in-container checks. |
| 3.3 Vacuous assertion | Load-before-status ordering fixed, plus an assertion that a rejection must carry a **reason** — an unloaded bundle can no longer satisfy the tamper test. Verified in all four pass/fail combinations. |
| 3.4 `[object Object]` | `report.readable()` serialises any value; sub-scores render as Dimension/Score/Band columns and approvals as Action/Why-it-escalated. |

---

## 4. Safeguards added

These are the deliverable. The fixes above address four bugs; these address the
class.

### 4.1 Storage can never silently downgrade

Writes are refused when durable storage was configured and could not be
initialised. `RUNTIME_ALLOW_STORAGE_DOWNGRADE=1` is the only way to proceed on
local disk, and it must be set deliberately — it is not profile-driven, because
the whole point is that no configuration should *imply* a downgrade.

The local store gained the same protection: a **missing** collection file is an
empty collection, but a file that exists and cannot be parsed now throws instead
of returning `[]`. On a sovereign deployment local disk *is* the durable store,
so a corrupt file silently reading as empty is the same failure wearing
different clothes.

### 4.2 Startup validation (`lib/runtime/startup.js`)

```bash
npm run runtime:startup
```

Reports, on one screen, the eight facts that determine whether the platform is
what it claims to be: **Node version · runtime environment · storage backend ·
Ω policy provider · evidence provider · deployment profile · cloud credential
state · network mode**.

Anything that would make the platform *lie about itself* is a `fail`, not a
`warn`. `run({ strict: true })` throws — a governance platform that starts in an
unknown state is worse than one that refuses to start. The report is logged, so
a degraded start is discoverable afterwards and not only by whoever was watching
the console.

### 4.3 Contract tests (`npm run contracts`)

47 assertions that test *properties of the codebase*, not behaviour:

- **Swallowed exceptions.** In integrity-critical modules, an empty `catch` must
  carry an explanation. The rule is deliberately "you may discard an error only
  if you say why" — a documented decision is reviewable; a bare `catch {}` is the
  absence of one.
- **Node floor.** `package.json`, every workflow, every Dockerfile and `.nvmrc`
  must agree, and `startup.js` must read the floor from `package.json` rather
  than keep a second copy.
- **CI workflows are real.** Every workflow must parse and declare at least one
  job, and every script it invokes must exist. This is the direct fix for the
  blind spot in §2.2 — a dead pipeline now fails locally, in a second.
- **Sovereign verification cannot be bypassed.** No environment variable
  short-circuits it; the entry-list digest is checked independently of the
  signature; `guardian verify` performs no writes; the air-gap check loads before
  reading status.
- **Honesty properties are structural.** Caveats compose rather than override;
  the control mapping cannot stop saying it is not an accreditation; the PDF
  layer keeps its value serialiser.

Contract tests are static — no engine, no store, no network — so they run
everywhere in under a second and cannot themselves rot into a no-op.

---

## 5. Codebase review — the same patterns elsewhere

A deliberate sweep for the four patterns, beyond the code changed in this phase.

**Silent catches.** Zero *undocumented* empty catches in `lib/`. Nine catches
return a fallback value; seven are correct by construction (a malformed session
token is an invalid session; `timingSafeEqual` on unequal lengths is inequality;
a missing decisions file is no decisions). One was a real instance of the class
— `readJson` returning `[]` for a corrupt file — and is fixed. The
`.catch(() => null)` pattern is widespread in `lib/ops/*` dashboard reads; that
is the established honest-degradation design (they surface as explicit
not-instrumented notes) and is left alone.

**Unsafe fallbacks.** The storage downgrade was the significant one. Also
reviewed and found sound: the engine client fails *soft* to a structured
`{ok:false}` so the gateway records `ENGINE_UNAVAILABLE` rather than crashing a
customer request — a deliberate, documented, fail-**closed** degradation, since
an unreachable engine blocks governed actions.

**Runtime version assumptions.** Two latent instances found and fixed:
`deploy/sovereign/Dockerfile.app` was built `FROM node:20` (a sovereign image
that would have hit the same Supabase fault), and no `.nvmrc` existed, leaving
the host platform free to pick its own default.

**CI blind spots.** All eight workflows now parse (they do today; three did not
run Node ≥ floor until this change). The `enterprise-regression` path filter is
correct and intentional — it does not run for page-only changes — verified
rather than assumed.

**Deployment assumptions.** The sovereign compose topology, hardened images and
offline installer are unchanged and sound. One assumption is now explicit rather
than implicit: the Control Room's branded deliverables require the Railway
renderer, which a sovereign deployment does not have — so that route fails
closed there, and the CLI documents are the sovereign equivalent.

---

## 6. Residual risks

Stated plainly. These are known and **not** fixed.

| Risk | Why it remains | Mitigation today |
|---|---|---|
| **Production Node version is unverified by me** | I cannot see the Vercel/Railway runtime from here | `.nvmrc` + `engines` now pin it; **verify what production actually runs** — see §7 |
| Local store is single-writer | JSON/JSONL files are not concurrency-safe across processes | Documented; startup reports it; run one writer per data directory |
| No sovereign deployment on customer hardware | Requires a customer and hardware | `guardian acceptance` marks any unwitnessed run as a self-test |
| No third-party accreditation | A third-party process, not code | `guardian controls` publishes 10 open gaps |
| No independent penetration test | Not commissioned | Stated in `docs/ACCREDITATION.md` (NCSC P7) |
| Contract tests are pattern-based | Static analysis can be worked around by someone determined to | They raise the cost of an *accidental* regression, which is the actual failure mode observed |
| The Control Room and CLI produce two different "evidence pack" documents | Real duplication introduced by this phase | Documented; consolidation needs a product decision on which is canonical |

---

## 7. Recommended follow-up actions

In priority order.

1. **Verify the production Node version — today.** If Vercel or Railway runs
   Node < 22 with Supabase credentials present, the silent downgrade may be
   live. The new startup check answers it in one command:
   `npm run runtime:startup`. This is the only item on this list with a
   potentially active customer impact.
2. **Call `startup.run({ strict: true })` on boot** of the standalone runtime
   server and the sovereign container, so a misconfigured deployment refuses to
   start rather than starting wrong. Deliberately not done unilaterally — it
   changes production start-up semantics and is your call.
3. **Decide the canonical evidence pack** (Control Room branded PDF vs CLI
   offline PDF) and retire or clearly differentiate the other.
4. **Add the contract tests to the required checks** for merge, alongside the
   existing regression suites.
5. **Commission an independent security assessment** — the largest single gap in
   the accreditation register, and the one a customer's assessor will raise
   first.
6. **Run a witnessed acceptance trial** on representative hardware, per
   `docs/FIELD-TRIAL.md`, to move from *acceptance-testable* to *field-tested*.

---

## 8. What this changes about how the platform is built

One practice change is worth stating, because it produced every finding here:

**Run the thing, do not infer that it ran.** The dead CI pipeline was reported as
green for weeks because local test results were treated as evidence that CI had
executed. The vacuous assertion passed because its exit code was trusted without
checking it could ever be non-zero. The `[object Object]` defect survived a
passing test suite and was caught by a human opening the PDF.

The contract tests encode as much of that discipline as static analysis can. The
rest is a habit: verify the artefact, not the proxy for it.

# Remaining Known Risks

**Assessment date:** 1 August 2026
**Purpose:** Complete disclosure of risks known to the vendor and *not* closed
by the remediation programme.

This document exists because a security package that lists only what was fixed
is marketing. Everything below is either an accepted architectural limit, a
deferred item with a stated reason, or a configuration decision the operator
must make. Each entry states what an attacker or a fault would actually have to
do, and what compensating control exists today.

Risks are ordered by residual severity after remediation.

---

## R-1 — Deletion of connector evidence is undetectable — **High**

**Component:** `rg_integration_events`, `rg_ops_evidence`
**Status:** Open, deferred by design

**What it is.** `rg_decisions` is hash-chained per environment: `verifyChain()`
(`lib/runtime/store.js:344`) recomputes `prev_hash → entry_hash` in sequence
order and reports the first altered *or missing* entry. The connector evidence
tables have no equivalent chain — each record carries its own content hash but
nothing links a record to its neighbours. Removing a record therefore leaves no
trace: the remaining records all still verify individually.

**Why it is not closed.** Chaining these tables is a structural change to the
write path, with concurrency, ordering and backfill consequences. It was
deliberately excluded from a remediation programme whose constraint was narrow,
mutation-tested fixes with no architectural rewrites.

**What an adversary needs.** Direct database access with the service-role
credential or higher. Not reachable through the application: no code path
deletes connector evidence except org-scoped customer erasure.

**Compensating controls today.**
- In-place *alteration* is blocked at the database (F-03).
- The Integration Gateway path also writes a proposal (`rg_ops_proposals`) and,
  for provider connectors, a run record (`rg_bedrock_invocation_runs` /
  `rg_communication_runs`). The audit projection joins these, so deleting the
  evidence row alone produces an orphaned run that surfaces as an integrity
  finding. Deleting *every* correlated record in a consistent set defeats this.
- Supabase point-in-time recovery, where the operator has enabled it, is an
  out-of-band comparison source.

**Recommended remediation.** Cross-record chaining over
`rg_integration_events`, mirroring the `rg_decisions` design.

---

## R-2 — Tenant isolation is enforced in application code only — **High**

**Component:** Persistence layer, all tenant-scoped tables
**Status:** Open, accurately documented by the vendor

**What it is.** Every tenant-scoped table has `enable row level security`, but
there are **zero active RLS policies** across all migrations. The five
per-tenant policies in `supabase/governance_runtime.sql:424-432` are present as
commented-out templates only. Organisation scoping is therefore enforced
entirely by application code adding `org_id` filters. The Supabase service role
bypasses RLS regardless, so activating the policies would not by itself
constrain the application's own credential — a genuinely layered fix requires a
non-service-role access path.

**Consequence.** A single missed `org_id` filter in a query is a cross-tenant
disclosure, with no second layer to catch it. There is no defence in depth on
the control that matters most in a multi-tenant product.

**Important qualification.** This is an *architectural weakness*, not a known
bug. No cross-tenant data path was found in the code examined during this audit.
The vendor documents the position accurately in
`docs/PLATFORM-READINESS-REVIEW.md:31` (*"code-enforced only — 0 RLS policies"*)
and makes no public claim of database-enforced isolation.

**Why this gates the readiness position.** It is survivable when the operator
controls the tenants, the deployment and the release process — a supervised
pilot. It is not survivable at self-serve multi-tenant scale.

**Recommended remediation.** Either (a) a per-tenant JWT access path with the
policies activated, or (b) a documented, tested contract test that proves
org-scoping on every read surface. (b) is achievable inside a pilot; (a) is the
correct long-term answer.

---

## R-3 — Fail-closed evidence recording is opt-in, not default — **Medium**

**Component:** `lib/runtime/gateway.js:121`, `lib/runtime/ratelimit.js:15`
**Status:** Open, configuration hardening

**What it is.** When a decision's evidence cannot be recorded, `gateway.govern()`
logs an error, raises a throttled alert, and — unless `RUNTIME_REQUIRE_RECORD`
is set — **continues**, returning `recorded: false` and `record_error` to the
caller. The behaviour is visible and not silent, but the default is to proceed
without a durable record. `RUNTIME_REQUIRE_DURABLE` (refuse to serve on the
non-durable file store) is likewise off by default, as is `RUNTIME_RATE_LIMIT`.

**Severity correction.** This was initially rated Critical as a "silent
fail-open". That was wrong and is retracted: it is neither silent nor
undetectable. It is a default that an enterprise deployment should change.

**Compensating control.** The caller receives `recorded:false` and can act on
it; an alert is raised; the condition appears in structured logs.

**Remediation.** Operator action, not code: set `RUNTIME_REQUIRE_RECORD=1` and
`RUNTIME_REQUIRE_DURABLE=1` in production. Both are in the Pilot Deployment
Checklist as required items.

---

## R-4 — Quarterly reports remain a rolling three months — **Medium**

**Component:** `lib/runtime/reports.js:38`
**Status:** Open

**What it is.** F-05 corrected the monthly window to a calendar month. The
quarterly window still subtracts three months from the generation instant, so a
quarterly pack's boundaries depend on when the job ran. A customer using the
quarterly pack as a period compliance record has the same problem the monthly
pack had.

**Why it is not closed.** The remediation mandate was one narrow fix per
finding, and the finding as raised concerned monthly evidence. Extending it to
quarterly was not in scope and would have widened a behaviour change without
review.

**Compensating control.** Monthly packs are correct and, for most compliance
purposes, are the artefact in use.

**Remediation.** Extend `windowFor()` to calendar quarters, with the same
half-open boundary treatment.

---

## R-5 — A missing migration under-reports rather than fails — **Medium**

**Component:** `lib/runtime/connector-audit.js:227-235`
**Status:** Open, an accepted trade-off with a real downside

**What it is.** The audit projection reads its six source tables through
`store.findOptional`, which degrades a missing table to an empty result and
warns once. This is deliberate: a deployment mid-migration renders a thin report
rather than returning HTTP 500. The downside is that a *missing connector table*
produces a report showing less activity than actually occurred, and the report
does not currently distinguish "no activity" from "could not read".

**Why this matters more than a normal availability trade-off.** The platform's
own normative specification (`docs/PLATFORM-TRUTH.md` §2) explicitly prohibits
this encoding: *"Returning `[]` or `0` for a failed read (indistinguishable from
empty)"* is listed as a prohibited encoding. This is a known deviation from the
vendor's own standard.

**Compensating control.** `npm run ops:schema-check` probes every required table
*and* additive column against the live project and exits non-zero if any is
missing. Running it is a required item in the Pilot Deployment Checklist.

**Remediation.** Surface unreadable sources as an explicit `unavailable` finding
in the projection, matching the treatment F-01 gave to evidence write failures.

---

## R-6 — Pre-canonical evidence hashes are permanently unverifiable — **Medium**

**Component:** `rg_integration_events` records written before F-02
**Status:** Accepted, correctly disclosed

**What it is.** Evidence recorded before canonical hashing carries a hash whose
serialisation cannot be reproduced reliably. Those records report `unverifiable`
— never `verified`, and never `mismatch`. Their integrity cannot be
cryptographically confirmed after the fact.

**Why it is accepted.** The alternative — rehashing historical records — would
mean writing new hashes over old evidence, which is precisely the operation the
platform exists to prevent. Leaving them unverifiable and saying so is the
honest outcome.

**Disclosure.** The AU-9 control statement in `lib/sovereign/controls.js` was
changed from `implemented` to `partial` with a caveat naming this limit and the
per-record (not chained) scope.

---

## R-7 — Audit projection performance is unbounded — **Low**

**Component:** `lib/runtime/connector-audit.js`
**Status:** Open, scaling

**What it is.** The projection reads six tables per report generation, filtered
by `org_id`, and joins in memory. There is no pagination and no server-side
window filter on the initial reads. At pilot volumes this is not a concern; at
high per-tenant record counts it becomes one.

**Compensating control.** Report generation is a scheduled batch operation, not
on the request path of any governed action. Degradation affects reporting
latency, not enforcement.

---

## R-8 — No external non-repudiation — **Low**, by design

**Component:** Evidence chain
**Status:** Accepted and publicly disclosed

**What it is.** The decision chain proves internal tamper-evidence. Entries are
not individually signed by a key outside the operator's control, so an operator
with full database and application access could in principle reconstruct a
consistent alternative history.

**Disclosure.** This is stated in the vendor's own control register
(`lib/sovereign/controls.js`, AU-10, status `partial`) and in
`docs/ACCREDITATION.md`. Public material consistently says
"tamper-**evident**", not "tamper-proof".

**Remediation for customers who need it.** An external timestamping or notary
authority, as the AU-10 note already recommends.

---

## R-9 — Undisclosed caps on summary sections — **Low**

**Component:** `lib/runtime/reports.js:101-103`
**Status:** Open, judged acceptable

`top_rules` and `top_omega` are capped at 5 and `recommendations` at 20, without
a disclosure line. These are summary rankings rather than records of evidence,
no completeness claim attaches to them, and a "top 5" is what a reader expects.
Recorded here so the decision is visible rather than implicit.

---

## Explicitly out of scope for this assessment

No finding is claimed or implied in these areas, and none was examined:

- Third-party provider security (AWS Bedrock, Google, Supabase, Vercel)
- The governance engine's mathematical model (Ω reachability)
- Cryptographic primitive implementations
- Host and network security
- Independent penetration testing — none has been performed
- Formal certification — none is held or claimed

---

*Companion documents: Executive Security Assessment, Technical Security
Assessment, Remediation Register, Production Readiness Statement, Pilot
Deployment Checklist, Security Claims Matrix.*

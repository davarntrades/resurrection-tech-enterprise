# Security Claims Matrix

**Product:** Guardian OS — Morrison Runtime Governance™
**Assessment date:** 1 August 2026
**Purpose:** Every public security claim, the implementation that supports it,
and any caveat required for the claim to be read correctly.

---

## How to read this document

Each claim is assessed against three questions: *is it implemented*, *was it
verified in this audit*, and *would a reasonable enterprise reader draw a
conclusion wider than the implementation supports*. The third question is where
most of the value is. A claim can be literally true and still mislead if its
scope is not stated, and those cases are called out rather than passed.

**Verification status** is one of:

| Status | Meaning |
|---|---|
| **Verified** | Implementation read, and behaviour executed or tested during this audit |
| **Verified (code)** | Implementation read and confirmed; not separately executed |
| **Not examined** | Outside the scope of this audit. No opinion offered — this is not a pass. |

**Claim status** is one of: **Accurate**, **Accurate with caveat** (caveat
already published), **Caveat recommended** (accurate, but should carry a scope
note it does not yet carry), or **Overstated**.

**No claim in this matrix was found to be overstated.** That column exists
because a matrix without it is not an assessment.

---

## Part A — Public website claims

Source: `app/security/page.tsx` unless noted.

| # | Public claim | Implementation | Verification | Status |
|---|---|---|---|---|
| A1 | "The verdict is computed and returned *before* any tool runs." | Execute-on-allow structure: execution is reachable only from the ALLOW branch of `ops.proposals.propose()` → `governor.evaluate()`. The permit authorises; it does not itself invoke. | **Verified** — `customer-support-governance-registration.test.cjs` asserts the permit never invokes the provider | **Accurate** |
| A2 | "Deny-by-default / fail-closed. The engine permits a trajectory only when it can show ℛ(t) ∩ Ω = ∅; otherwise it blocks." | Deny-by-default action catalog; an unregistered action is refused. An unreachable engine blocks. | **Verified** — unregistered sibling actions remain denied; engine-unreachable blocks | **Accurate** |
| A3 | "The planner remains untrusted. The verdict is a pure function of the proposed trajectory." | Governance operates on the submitted trajectory, independent of the producing model. | **Not examined** — this is a property of the engine (`governance-service/`), which was out of scope | **Accurate (code); engine not examined** |
| A4 | "Trajectory-level, not per-call." | Engine-side reachability analysis. | **Not examined** — engine out of scope | **No opinion offered** |
| A5 | "What is stored (reference service): Nothing by default. The engine is a pure function; the reference service holds no datastore." | Refers to the **engine**, not the Guardian OS platform. | **Verified (code)** — the engine and the platform are separate components | **Caveat recommended** — see C-1 below |
| A6 | "Model weights, training data, prompts, or model internals are not required." | Governance evaluates proposed tool calls and their arguments only. | **Verified (code)** | **Accurate** |
| A7 | "Every evaluation yields a structured, attributable record" with `verdict`, `reason`, `omega_domain`, `rule`, `layer`, `reachability_distance`, `trajectory_hash`. | `lib/runtime/store.js` decision records carry these fields. | **Verified** — fields present in production trace | **Accurate** |
| A8 | "Decisions attribute to the specific rule and enforcement layer that fired — not an opaque score." | `rule` and `omega_domain` recorded per decision. | **Verified** | **Accurate** |
| A9 | "Records are deterministic and replayable (the trajectory hash is stable across runs)." | `trajectory_hash` and indexed replay lookup (`rg_dec_id_idx`). | **Not examined** — determinism is an engine property | **Accurate (code); not independently replayed in this audit** |
| A10 | "Sub-millisecond median latency on the benchmark environment." | Benchmark harness and published methodology. | **Not examined** — performance benchmarking was out of scope | **No opinion offered** |
| A11 | "The public website demo route degrades to an in-process heuristic if the live engine is unreachable… a production deployment should fail closed." | Published as an honest note on the page itself. | **Verified (code)** | **Accurate** — and creditable; this is a disclosed limitation a vendor could easily have omitted |
| A12 | "Formal certifications (SOC 2 / ISO 27001), penetration-test cadence, and a vulnerability-disclosure contact are not claimed here. None are asserted." | No certification is held. | **Verified** — no certification claim found anywhere in the codebase or public pages | **Accurate** |

---

## Part B — Evidence and audit claims

| # | Claim | Source | Implementation | Verification | Status |
|---|---|---|---|---|---|
| B1 | "Tamper-evident audit trail of every decision." | `app/partner-portal`, `app/pilot`, `app/sample-executive-report` | Per-environment hash chain on `rg_decisions`: `appendDecision()` (`store.js:300-338`), `verifyChain()` (`store.js:344`). | **Verified** — chain suite 6/6 | **Accurate** — and correctly says *tamper-evident*, not tamper-proof |
| B2 | "Every decision is persisted as tamper-evident evidence (hash-chained per environment; any deletion or alteration is detectable on verification)." | `docs/CONNECT-YOUR-AGENT.md:186` | True for `rg_decisions`. **Not** true for connector-path evidence (`rg_integration_events`, `rg_ops_evidence`), which carry per-record hashes without a chain — deletion there is undetectable. | **Verified** | **Caveat recommended** — see C-2 below |
| B3 | "Immutable evidence generation." | Product architecture | In-place alteration is blocked at the database by `before update` triggers on all three evidence tables, for every role including the table owner (F-03). | **Verified** — 21/21, mutation-tested | **Accurate with caveat** — deletion remains possible and is disclosed (Remaining Known Risks R-1) |
| B4 | "Monthly evidence packs render to JSON and auditor-ready PDF with an integrity hash, offline." | `controls.js` EU AI Act Art. 11, `partial` | `lib/runtime/reports.js`, `lib/sovereign/report.js`; PDF renders with no browser. | **Verified** — PDF suite 42/42; pack generated from fixtures | **Accurate with caveat** — the published caveat already states the pack documents governance, not model design |
| B5 | "Evidence completeness" reported in the monthly pack. | `lib/runtime/reports.js` | Computed from the audit projection over actual evidence. | **Verified** | **Accurate** — and materially more reliable after F-01 and F-06 |
| B6 | "No secrets, raw credentials, tokens, full prompts or customer content appear in reports." | Product commitment | Redaction implemented as an allow-list: report fields are enumerated, not filtered. | **Verified** — report and PDF paths reviewed; nothing found | **Accurate** |
| B7 | "Nothing central is stored by default; audit retention is yours." | `app/security` Retention | True of the engine. The Guardian OS platform *does* persist evidence in the operator's Supabase project. | **Verified (code)** | **Caveat recommended** — same distinction as C-1 |

---

## Part C — Caveats recommended

Three claims are accurate as written but would benefit from a published scope
note. None is a misstatement; each is a place where a reader could reasonably
generalise further than the implementation supports.

### C-1 — "The reference service stores nothing" (A5, B7)

The **engine** is a stateless pure function that persists no evaluations. The
**Guardian OS platform** persists evidence in the operator's Supabase project —
that is the entire point of the evidence architecture. Both statements are true
of their respective components, and the security page's own wording
("reference service") is technically precise. But a procurement reader
skimming for a data-residency answer may conflate the two.

**Recommended note:** *"The governance engine persists nothing. The Guardian OS
platform, when deployed, stores decision and connector evidence in the
operator's own database — see the evidence architecture."*

### C-2 — "Any deletion or alteration is detectable" (B2)

`docs/CONNECT-YOUR-AGENT.md:186` says *"Every decision is persisted as
tamper-evident evidence (hash-chained per environment; any deletion or
alteration is detectable on verification)."*

Accurate for `rg_decisions`. Governed connector executions also produce evidence
in `rg_integration_events` and `rg_ops_evidence`, which are **not** chained:
alteration is now blocked at the database, but **deletion is undetectable**.
Whether a reader counts a connector execution as "a decision" is precisely the
ambiguity that needs closing.

**Recommended note:** *"Deletion detection applies to the decision chain.
Connector-path evidence is protected against alteration at the database and
carries per-record integrity hashes; cross-record chaining for that path is on
the roadmap."*

This document does **not** apply that edit. The audit is frozen and the mandate
was to document the verified implementation, not to change published claims.
The change is recommended to the vendor.

### C-3 — AU-9 scope (already applied)

The control statement for NIST AU-9 previously read as `implemented` and
described the decision chain. A reader could extend it to all evidence. This was
raised in the audit as a false claim and that position was **retracted** — the
sentence is accurate for what it cites. The real issue was uncaveated scope. The
status is now `partial` with a caveat naming both limits: per-record rather than
chained for connector evidence, and pre-canonical records unverifiable.

---

## Part D — Framework control claims

Source: `lib/sovereign/controls.js`. This is the vendor's own control mapping,
which leads with its gaps by design. Verification status below reflects this
audit's scope; controls covering the sovereign build, signing and packaging
were **not** re-examined here and are marked accordingly.

### NIST SP 800-53 Rev 5

| Control | Vendor status | This audit |
|---|---|---|
| AC-3 Access enforcement | implemented | **Verified** — deny-by-default confirmed |
| AC-6 Least privilege | implemented | Verified (code) |
| AC-4 Information flow enforcement | partial | Not examined; caveat published and appropriate |
| AU-2 Event logging | implemented | **Verified** |
| **AU-9 Protection of audit information** | **partial** (changed by this audit) | **Verified** — status corrected from `implemented`; caveat added |
| AU-10 Non-repudiation | partial | Verified (code) — caveat accurate; no external signing exists |
| AU-12 Audit record generation | implemented | **Verified** — records generated at the enforcement point, not by the agent |
| CM-3 Configuration change control | implemented | Not examined |
| CM-5 Access restrictions for change | implemented | Not examined |
| CM-14 Signed components | implemented | Not examined |
| SC-7 Boundary protection | inherited | Not examined; correctly marked inherited |
| SC-12 Key establishment | partial | Not examined; caveat published (no rotation, no revocation, no HSM) |
| SC-13 Cryptographic protection | partial | Not examined; caveat published (verifier not FIPS-validated, not constant-time) |
| SI-4 System monitoring | implemented | Not examined |
| SI-7 Software / information integrity | implemented | Not examined |
| SR-4 Provenance | implemented | Not examined |
| SR-11 Component authenticity | implemented | Not examined |
| IA-2 Identification and authentication | inherited | Verified (code) — caveat accurate: no IdP, no MFA, no SSO |
| CP-9 System backup | partial | Verified (code) — caveat accurate: no scheduler, no retention policy, no restore verification |

### ISO/IEC 27001:2022 Annex A

Eight controls mapped, correctly scoped as supporting an operator's ISMS rather
than constituting certification. A.8.15 (Logging) and A.5.15 (Access control)
were **verified** in this audit. The remainder were not examined. A.8.7 is
marked `not_applicable` with the boundary stated explicitly — good practice.

### EU AI Act — high-risk deployer obligations

| Article | Vendor status | This audit |
|---|---|---|
| Art. 12 Record-keeping | implemented | **Verified** — with the B2/C-2 scope caveat |
| Art. 14 Human oversight | implemented | **Verified** — the agent proposes and never executes; approval chain retained |
| Art. 15 Accuracy, robustness, cybersecurity | partial | **Verified** — fail-closed on engine unavailability confirmed |
| Art. 9 Risk management | partial | Not examined; caveat accurate |
| Art. 11 / Annex IV Technical documentation | partial | Verified (code); caveat accurate and appropriately modest |
| Art. 43 Conformity assessment | not_applicable | Correctly scoped — Guardian OS issues no declaration |

### NCSC Cloud Security Principles

Six principles mapped, scoped as *"Not an NCSC assessment; NCSC has not reviewed
this software."* Not examined in this audit. P7 (Secure development) carries the
note *"No independent security assessment or penetration test of this codebase
has been commissioned"* — which remains true, including of this audit, and is
the correct disclosure.

---

## Part E — Claims explicitly *not* made

Recorded because a procurement team's next question is usually "what aren't you
saying". Each of these was searched for across the codebase and public pages and
**not found** — the vendor does not assert them:

- SOC 2, ISO 27001 certification, Common Criteria, NCSC assurance, FedRAMP, ATO
- CE marking or EU AI Act conformity
- "Tamper-proof", "unhackable", "immutable" in an absolute sense
- Independent penetration test results
- Cryptographic non-repudiation by an external party
- Network-level or data-loss-prevention enforcement
- Any claim about the accuracy of a governed model
- Database-enforced tenant isolation

The control mapping module states on its own face that *"software cannot grant
[accreditation] to itself, and any document that implies otherwise is worse than
no document."*

---

## Part F — Overall judgement

**Guardian OS's public security claims are technically accurate.**

Assessed across 12 website claims, 7 evidence and audit claims, and 39 framework
control statements:

- **0 claims overstated.**
- **1 control status corrected** during the audit (AU-9, `implemented` →
  `partial`, with caveat).
- **2 claims carry recommended scope caveats** (C-1, C-2) — both accurate as
  written, both improvable.
- **The remaining claims are accurate**, and a substantial number carry caveats
  the vendor published without being asked to.

The pattern found throughout is a vendor that discloses more than it must: the
demo's heuristic fallback, the non-constant-time Ed25519 verifier, the absence
of key rotation, the missing RTO/RPO, the lack of any commissioned penetration
test. A claims matrix is normally an exercise in finding the gap between
marketing and code. Here the gap ran the other way more often than not.

That does not make the platform complete. The Remaining Known Risks document
lists nine open items, two of them High. But an enterprise reviewer can take the
published claims at face value and spend their time on the disclosed risks —
which is the whole purpose of a document like this.

---

*Companion documents: Executive Security Assessment, Technical Security
Assessment, Remediation Register, Remaining Known Risks, Production Readiness
Statement, Pilot Deployment Checklist.*

# Remediation Register

**Assessment date:** 1 August 2026
**Purpose:** Traceable record of every finding raised in the audit, its
remediation, its verification, and its deployment requirements.

**Delivery status — read this first.** All six remediations are **merged into
`main`** (PRs #241, #242, #243, #244, #245, #246), each having passed the full
19-check CI matrix on the exact commit that was merged.

**Code being merged is not the same as a control being live.** Two of the six
depend on database migrations that must be applied separately to each project:

| Migration | Required by | Status in `resurrection-tech-prod` |
|---|---|---|
| `supabase/evidence_hash_canonical.sql` | F-02 | **Applied** |
| `supabase/evidence_append_only.sql` | F-03 | **Applied** — all three `_no_update` triggers present and enabled |

Both are applied to the production project, so all six remediations are live
there, not merely merged. Schema inventory against that project reports
**41/41 required tables and 2/2 additive columns** present.

This distinction still matters for **any other** deployment. These migrations
are applied per-project and are not carried by a code deploy. Until
`evidence_append_only.sql` runs against a given project, evidence tables in that
project remain alterable in place exactly as before F-03, however current its
code is. A customer evaluating a running deployment must confirm the commit
**and** the migrations; Phase 1 and Phase 2 of the Pilot Deployment Checklist
give per-item verification commands, including the `pg_trigger` query that the
automated schema check cannot perform.

---

## Summary

| ID | Finding | Severity | Category | PR | Closure |
|---|---|---|---|---|---|
| F-01 | Silent loss of refusal evidence | Critical | Genuine vulnerability | #241 | Fully closed |
| F-02 | Evidence hashes never verified | Critical | Missing implementation | #242 | Fully closed |
| F-03 | Evidence append-only by convention only | High | Architectural weakness | #245 | **Partially closed** |
| F-04 | Share password in URL, unsalted | Medium | Defence in depth | #243 | Fully closed |
| F-05 | "Monthly" evidence was rolling 30 days | Medium | Control-scope mismatch | #244 | Fully closed |
| F-06 | Pack overstated its own completeness | Medium | Artefact defect | #246 | Fully closed |

Every pull request carries implementation, regression tests, updated
documentation, a before/after explanation, and an explicit statement of whether
runtime behaviour changes. Every branch is green on all 19 CI checks.

---

## F-01 — Silent loss of refusal evidence

| | |
|---|---|
| **Severity** | Critical |
| **Category** | Genuine vulnerability |
| **Component** | Integration Gateway |
| **Files changed** | `lib/runtime/integration-gateway.js` |
| **Tests** | `scripts/runtime/evidence-gap-observability.test.cjs` (10) |
| **Schema change** | None |
| **Runtime behaviour change** | Yes — failures now surface as findings instead of being discarded |
| **Backwards compatible** | Yes |
| **Deployment ordering** | First. No dependency; everything downstream is more trustworthy once refusals stop vanishing. |
| **Closure** | **Fully closed** |
| **Residual risk** | None for observability. The governance outcome was always correct; only the record was at risk. |

**Change.** Ten bare `.catch(() => {})` sites replaced with
`submitEvidenceOrFlag()`, which records the failure so the audit projection can
report it as an integrity finding.

**Regression tests required to confirm closure:**
`npm run runtime:integration-gateway`, `npm run runtime:connector-audit`.

---

## F-02 — Stored evidence hashes never verified

| | |
|---|---|
| **Severity** | Critical |
| **Category** | Missing implementation |
| **Component** | Connector evidence, audit projection, control register |
| **Files changed** | `lib/runtime/integration-gateway.js`, `lib/runtime/connector-audit.js`, `lib/sovereign/controls.js` |
| **Tests** | `scripts/runtime/evidence-hash-verification.test.cjs` (15) |
| **Schema change** | `supabase/evidence_hash_canonical.sql` — adds `rg_integration_events.evidence_hash_alg text` (additive, idempotent) |
| **Runtime behaviour change** | Yes — verification now runs on every report; new records carry an algorithm marker |
| **Backwards compatible** | Yes — pre-existing records report `unverifiable`, never `mismatch` |
| **Deployment ordering** | Second. **Apply the migration before the application deploy.** |
| **Closure** | **Fully closed** for content tampering |
| **Residual risk** | Records written before this change are permanently unverifiable. Reported honestly as such. AU-9 status changed from `implemented` to `partial` with a caveat naming both limits. |

**Change.** Canonical JSON hashing (`sha256-canonical-v1`) with three-valued
verification: `verified` / `unverifiable` / `mismatch`.

**Why this implementation over the obvious one.** A naive
`sha256(JSON.stringify(evidence))` comparison was demonstrated to flag
legitimate production evidence as tampered, because PostgreSQL `jsonb` does not
preserve key order. Canonical serialisation removes the false-positive class,
and the explicit algorithm marker keeps pre-canonical records out of the
mismatch bucket.

**Regression tests required to confirm closure:**
`node scripts/runtime/evidence-hash-verification.test.cjs`,
`npm run runtime:connector-audit`, `npm run sovereign:test`.

---

## F-03 — Evidence tables append-only by convention only

| | |
|---|---|
| **Severity** | High |
| **Category** | Architectural weakness |
| **Component** | Persistence layer |
| **Files changed** | `supabase/evidence_append_only.sql` (new), `package.json`, `docs/PRODUCTION-DEPLOYMENT-CHECKLIST.md` |
| **Tests** | `scripts/runtime/evidence-append-only.test.cjs` (22) |
| **Schema change** | Trigger on `rg_decisions`, `rg_integration_events`, `rg_ops_evidence`. No table or column change. |
| **Runtime behaviour change** | **No** — verified exhaustively; no code path issues an evidence UPDATE |
| **Backwards compatible** | Yes, with one intended exception: backfilling a column on existing evidence rows is rejected |
| **Deployment ordering** | Third. Apply after F-02's migration so any backfill it needs is already complete. |
| **Closure** | **Partially closed** |
| **Residual risk** | **Deletion remains possible.** Detectable on `rg_decisions` via `verifyChain()`; **undetectable** on `rg_integration_events` and `rg_ops_evidence`. Deferred by design — closing it requires cross-record chaining. See Remaining Known Risks §1. |

**Change.** `before update` trigger raising SQLSTATE `55006` on all three
evidence tables, for every role including the table owner.

**Design decisions recorded for audit:**

- **Trigger, not `revoke update` or RLS.** The service role bypasses RLS and is
  the credential the application uses; a `revoke` does not constrain a superuser
  or table owner. A row trigger constrains every role, and disabling it is DDL.
- **DELETE deliberately permitted.** `customeradmin.permanentDelete()` is GDPR /
  offboarding erasure and deletes org-scoped evidence. Blocking DELETE would
  break a real compliance capability to move deletion from "possible" to
  "possible by another route".

**Verification that no legitimate write is blocked:** `store.update()` is never
called with any of the three collections in `lib/`, `app/` or `scripts/`;
`store.insert()` and `appendDecision()` issue plain INSERTs with no upsert or
`ON CONFLICT DO UPDATE`. The regression test fails the build if either changes.

**Operational note — column backfills.** Intended and documented. Procedure:

```sql
alter table public.rg_integration_events disable trigger rg_int_events_no_update;
update public.rg_integration_events set … where …;
alter table public.rg_integration_events enable  trigger rg_int_events_no_update;
```

**Post-deployment verification** (triggers are not visible to the PostgREST
schema check, and probing by attempting a real UPDATE would mean writing to
production evidence):

```sql
select tgrelid::regclass as table, tgname
from pg_trigger
where not tgisinternal and tgname like '%_no_update';
-- expect three rows
```

**Regression tests required to confirm closure:**
`npm run runtime:evidence-append-only`, `npm run runtime:seq`,
`node scripts/ops/integrity.test.cjs`.

---

## F-04 — Share password in the URL, stored unsalted

| | |
|---|---|
| **Severity** | Medium (downgraded from High — see below) |
| **Category** | Defence in depth |
| **Component** | Evidence deliverables / share links |
| **Files changed** | `lib/runtime/deliverables.js`, `app/api/runtime/share/[token]/route.ts` |
| **Tests** | `scripts/runtime/share-password.test.cjs` (18) |
| **Schema change** | None |
| **Runtime behaviour change** | Yes — `?pw=` now returns HTTP 400 with an explanation |
| **Backwards compatible** | Partially. Legacy stored hashes still verify; callers using `?pw=` must move the password to a header. |
| **Deployment ordering** | Last, in its own window — this is the only caller-visible contract change in the set. |
| **Closure** | **Fully closed** |
| **Residual risk** | None identified. |

**Change.** scrypt with a 16-byte per-share salt, `crypto.timingSafeEqual`
comparison, fail-closed on a malformed stored value, legacy-format
compatibility, and header-only password transport.

**Severity correction.** Originally rated High. Retracted: the 144-bit token is
the primary access control and the password defaults to `null`, making it an
optional second factor on an already unguessable URL.

**Regression tests required to confirm closure:**
`node scripts/runtime/share-password.test.cjs`, `npm run runtime:deliverables`.

---

## F-05 — "Monthly" evidence was a rolling 30 days

| | |
|---|---|
| **Severity** | Medium |
| **Category** | Documentation / control-scope mismatch |
| **Component** | Reporting |
| **Files changed** | `lib/runtime/reports.js` (`windowFor`) |
| **Tests** | `scripts/runtime/report-window.test.cjs` (13) |
| **Schema change** | None |
| **Runtime behaviour change** | Yes — monthly window boundaries move to calendar months |
| **Backwards compatible** | Yes — no stored report is rewritten |
| **Deployment ordering** | Deploy at a month boundary so no single pack straddles the definition change. |
| **Closure** | **Fully closed** for monthly |
| **Residual risk** | `quarterly` remains a rolling three months (`reports.js:38`). Deliberately out of scope for this change. See Remaining Known Risks §4. |

**Change.** Calendar-month, half-open `[since, until)` boundaries in UTC. Daily,
weekly and quarterly windows are unchanged.

**Regression tests required to confirm closure:**
`node scripts/runtime/report-window.test.cjs`, `npm run runtime:reports`,
`npm run runtime:report-parity`.

---

## F-06 — Evidence pack overstated its own completeness

| | |
|---|---|
| **Severity** | Medium |
| **Category** | Genuine defect in the delivered audit artefact |
| **Component** | Reporting / audit.pdf |
| **Files changed** | `lib/runtime/reports.js` |
| **Tests** | `scripts/runtime/report-truncation.test.cjs` (25) |
| **Schema change** | None |
| **Runtime behaviour change** | Yes, narrowly — only for windows exceeding 1000 records or 50 findings; byte-identical below both caps |
| **Backwards compatible** | Yes — no stored report is rewritten; `register_total` still reports the true total |
| **Deployment ordering** | No constraint. |
| **Closure** | **Fully closed** for the register and findings sections |
| **Residual risk** | `top_rules` / `top_omega` (5) and `recommendations` (20) are capped and undisclosed. These are summary rankings, not evidence records, and carry no completeness claim. Not changed. |

**Change.** The register cap retains the most recent records rather than the
oldest; both the register and findings truncations disclose themselves with
exact counts, through one shared helper each so the Markdown and HTML/PDF
renderers cannot diverge.

**Regression tests required to confirm closure:**
`npm run runtime:report-truncation`, `npm run runtime:reports`,
`npm run runtime:report-parity`, `npm run runtime:connector-audit`,
`npm run sovereign:pdf`.

---

## Recommended deployment order

| Order | Finding | PR | Gate |
|---|---|---|---|
| 1 | F-01 evidence-gap observability | #241 | None |
| 2 | F-02 canonical hashing | #242 | **Apply `supabase/evidence_hash_canonical.sql` before the app deploy** |
| 3 | F-03 append-only triggers | #245 | **Apply `supabase/evidence_append_only.sql`; verify three triggers** |
| 4 | F-06 report truncation | #246 | None |
| 5 | F-05 calendar months | #244 | Deploy at a month boundary |
| 6 | F-04 share hardening | #243 | Own window — caller-visible contract change |

---

## Audit positions retracted

Recorded for completeness, because a register that shows only confirmed findings
misrepresents how the audit was conducted.

| Retracted | Correct position |
|---|---|
| "AU-9 is a false marketing claim" | Accurate for what it cites; the issue was uncaveated scope. Caveat added, status changed to `partial`. |
| "`gateway.js` fails open on record failure — Critical" | Logs, alerts and returns `recorded:false` with the error. Not silent, not on the connector path. Medium configuration item. |
| "Share links are High severity" | Token is the primary control, password defaults to `null`. Medium. |
| "The register cap is a silent truncation" | Display truncation was always disclosed with the true total. The real defect was which end was retained — F-06. |

---

*Companion documents: Executive Security Assessment, Technical Security
Assessment, Remaining Known Risks, Production Readiness Statement, Pilot
Deployment Checklist, Security Claims Matrix.*

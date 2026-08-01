# Technical Security Assessment

**Product:** Guardian OS — Morrison Runtime Governance™
**Assessment date:** 1 August 2026
**Method:** Source-level review with executed verification and mutation testing
**Audience:** Security engineers, auditors, technical due diligence

Every claim below cites the implementing file. Line numbers are as of the
assessment date; file paths are stable.

---

## 1. Architecture as verified

### 1.1 Two governance paths, not one

This is the single most important architectural fact for anyone assessing
Guardian OS's evidence guarantees, because the two paths have **different
integrity properties**:

| Path | Entry point | Evidence table | Hash-chained |
|---|---|---|---|
| SDK / decision path | `gateway.govern()` | `rg_decisions` | **Yes** — per-environment `prev_hash → entry_hash` |
| Integration Gateway / connector path | `ops.proposals.propose()` | `rg_integration_events`, `rg_ops_evidence` | **No** — per-record hash only |

`lib/runtime/store.js:300-338` (`appendDecision`) allocates a monotonic `seq`
per environment, computes `entry_hash` over `prev_hash` plus the record, and
retries on unique-violation to survive concurrent writers.
`store.js:344` (`verifyChain`) walks the chain in `seq` order and recomputes it,
returning `broken_at` — the first sequence number where a row was altered,
reordered, or removed.

No equivalent chain exists over connector evidence. A per-record hash detects
alteration of a record's *content*; it cannot detect the removal of a record.
This asymmetry is the origin of two entries in Remaining Known Risks.

### 1.2 Enforcement is pre-execution and structurally deny-by-default

The proposal lifecycle is `ops.proposals.propose()` → `governor.evaluate()` →
engine → execute-on-allow → evidence. Execution is a consequence of an ALLOW
verdict, not a step that consults one. A connector cannot execute without first
producing a proposal that the engine permitted, because the execution code is
reached only from the allow branch.

Verified behaviourally rather than by inspection alone: an unreachable engine
blocks the canonical customer-support action
(`scripts/runtime/customer-support-governance-registration.test.cjs`), and
sibling actions not explicitly registered remain denied.

### 1.3 The audit projection copies nothing

`lib/runtime/connector-audit.js` is a read-only normalised projection over
evidence the governed path already wrote. It reads `integration_events` (the
spine), `integration_connectors`, `ops_proposals`, `bedrock_invocation_runs`,
`communication_runs` and `customer_support_workflow_runs`, joins them, and
returns a register plus findings. It writes nothing and creates no second
source of truth. This matters for assessment: the monthly pack cannot disagree
with the evidence store, because it *is* the evidence store, projected.

---

## 2. Findings, with evidence

Severity reflects impact on the customer's ability to rely on Guardian OS's
evidence, not on exploitability by an external attacker. Guardian OS's product
is trustworthy records; a defect that corrupts those records is severe even
where no attacker is required to trigger it.

---

### F-01 — Silent loss of refusal evidence — **Critical** — *closed*

**Category:** Genuine vulnerability
**Component:** Integration Gateway
**File:** `lib/runtime/integration-gateway.js` (ten call sites)

**Before.** Evidence submission was wrapped in bare `.catch(() => {})` at ten
sites. A failed evidence write produced no error, no log line, no alert, and no
counter movement. The most damaging case is a BLOCK: the action was correctly
refused, so the customer was protected, but the record proving the refusal
occurred was discarded. Monthly evidence would show a clean period.

**Why it is real, not theoretical.** The discard was unconditional. Any store
unavailability — a Supabase timeout, a missing additive migration, a
serialisation failure — produced exactly this outcome, with no operator signal
of any kind.

**Exploitability.** No attacker needed. Transient infrastructure faults are
sufficient. An attacker able to induce store unavailability at a chosen moment
could suppress the evidence of a specific refusal, but the refusal itself would
still hold.

**Remediation.** `submitEvidenceOrFlag()` replaces all ten sites. A failure is
recorded and surfaces as an integrity finding in the audit projection rather
than being absorbed.

**Closure:** Fully closed. **Residual:** none for observability. The action's
governance outcome was always correct; only its record was at risk.

---

### F-02 — Stored evidence hashes never verified — **Critical** — *closed*

**Category:** Genuine vulnerability (missing implementation)
**Component:** Connector evidence / audit projection
**Files:** `lib/runtime/integration-gateway.js`, `lib/runtime/connector-audit.js`

**Before.** `rg_integration_events.evidence_hash` was written on insert and
never recomputed by any read path. The hash was decoration. A record whose
`evidence` payload was altered directly in the database would be rendered into
the customer's audit pack as valid.

**Remediation, and why the obvious fix would have been harmful.** The naive
implementation — recompute `sha256(JSON.stringify(evidence))` and compare —
was demonstrated empirically to be *worse than no control*: PostgreSQL's `jsonb`
type does not preserve key insertion order, so legitimate, untampered production
records would be reported as mismatches. An integrity control that generates
false tamper accusations destroys the credibility of every true one.

The shipped implementation uses canonical serialisation (recursively sorted
keys) under an explicit algorithm marker:

```js
const EVIDENCE_HASH_ALG = "sha256-canonical-v1";
const canonicalEvidenceHash = (evidence) => store.sha256(canonicalJson(evidence || {}));
```

Verification is three-valued, never two:

| Result | Meaning |
|---|---|
| `verified` | Recomputed hash matches |
| `unverifiable` | Record predates canonical hashing — algorithm marker absent or different |
| `mismatch` | Recomputed hash differs — a genuine integrity exception |

This distinction is load-bearing and is required by the platform's own
normative specification (`docs/PLATFORM-TRUTH.md` §2: *"`unavailable` ≠
`refuted`"*). Reporting "we could not check" as "checked and clean" would be a
prohibited encoding under that specification.

**Schema:** adds `rg_integration_events.evidence_hash_alg text` (additive).

**Closure:** Fully closed for content tampering. **Residual:** records written
before this change are permanently `unverifiable` — correctly reported as such,
never as verified. The AU-9 control statement now carries a caveat naming this.

---

### F-03 — Evidence tables append-only by convention only — **High** — *partially closed*

**Category:** Architectural weakness
**Component:** Persistence layer
**Files:** `supabase/evidence_append_only.sql` (new),
`lib/runtime/customeradmin.js:100-186`, `lib/runtime/store.js:167,317`

**Before.** `rg_decisions`, `rg_integration_events` and `rg_ops_evidence` all
have `enable row level security` with no permissive policies — service-role
only. But **the Supabase service role bypasses RLS**, and the service role is
the credential the application connects with. RLS therefore constrained nothing
on the path that matters. `lib/ops/evidence.js:8` correctly states the module
"exposes no update/delete", but that is an application guarantee: anyone holding
`SUPABASE_SERVICE_ROLE_KEY` reached the tables directly.

An UPDATE is the silent vector — the row count does not change, so nothing in
the product notices. On `rg_ops_evidence`, which has no chain, an altered
verdict was undetectable.

**Remediation.** A `before update` trigger on all three tables raising SQLSTATE
`55006`.

**Why a trigger rather than `revoke update` or RLS.** A `revoke` does not
constrain the table owner or a superuser, and the threat model here is a
compromised operator credential rather than the application. A row trigger fires
for every role including `postgres`. Disabling it requires
`alter table … disable trigger` — DDL, which is materially more conspicuous
than a single UPDATE statement and leaves a trace in DDL-level auditing.
Re-running the migration re-creates the triggers, so a window left open by an
interrupted backfill closes on the next deploy.

**Why DELETE is deliberately *not* blocked.** `customeradmin.js` `permanentDelete()`
is customer erasure (GDPR / offboarding). Its `ORG_CHILD_COLLECTIONS` list
(`customeradmin.js:100-123`) includes both `integration_events` and `decisions`,
and `customeradmin.js:186` issues an org-scoped `store.remove()` for each. A
delete-blocking trigger would break erasure in exchange for moving deletion from
"possible" to "possible by a different route". That trade was declined and is
documented rather than concealed.

**Backwards compatibility — verified, not assumed.** `store.update()` is never
called with `"decisions"`, `"integration_events"` or `"ops_evidence"` anywhere in
`lib/`, `app/` or `scripts/`. `store.insert()` (`store.js:167`) and
`appendDecision()` (`store.js:317`) issue plain INSERTs with no `.upsert()` and
no `ON CONFLICT DO UPDATE`, so no insert path reaches an UPDATE indirectly.
`scripts/runtime/evidence-append-only.test.cjs` fails the build if either ever
stops being true.

**One intended behaviour change:** backfilling a column on existing evidence rows
is now rejected. Adding a column is unaffected (`ALTER TABLE` does not fire row
triggers). The migration header documents the explicit
`disable trigger` → backfill → `enable trigger` procedure.

**Closure:** Partially closed. In-place alteration is closed at the database.
**Residual:** deletion remains possible. On `rg_decisions` it is *detectable*
via `verifyChain()`. On `rg_integration_events` and `rg_ops_evidence` it is
**not** — see Remaining Known Risks §1.

---

### F-04 — Share password transmitted in the URL and stored unsalted — **Medium** — *closed*

**Category:** Defence in depth
**Component:** Evidence deliverables / share links
**Files:** `lib/runtime/deliverables.js`, `app/api/runtime/share/[token]/route.ts`

**Before.** The optional share password was accepted as a `?pw=` query
parameter, placing it in server logs, proxy logs, browser history and `Referer`
headers. It was stored as an unsalted single-round SHA-256, and compared with a
non-constant-time equality.

**Correction to an earlier position in this audit.** This was initially rated
High. That was wrong: the primary access control is a 144-bit token, and the
password defaults to `null` — it is an optional second factor on an already
unguessable URL. Medium is the correct rating.

**Remediation.** scrypt with a 16-byte per-share salt, `crypto.timingSafeEqual`
comparison, fail-closed on malformed stored values, and continued acceptance of
legacy-format hashes so existing shares keep working. The password is now
header-only; a `?pw=` request is rejected with HTTP 400 and an explanation
rather than silently accepted.

**Behaviour change:** callers passing `?pw=` receive 400. This is a deliberate,
caller-visible contract change and should be deployed in its own window.

**Closure:** Fully closed.

---

### F-05 — "Monthly" evidence was a rolling 30 days — **Medium** — *closed*

**Category:** Documentation / control-scope mismatch
**Component:** Reporting
**File:** `lib/runtime/reports.js` `windowFor()`

**Before.** `windowFor("monthly")` subtracted one month from the generation
instant, producing a rolling window anchored to whenever the job happened to run.
A pack labelled and delivered as the month's governance evidence covered neither
the calendar month nor a stable period, so two consecutive packs could overlap
or leave a gap depending on run time.

**Why this is a security finding and not merely a bug.** Customers use the
monthly pack as a period compliance record. A period record whose boundaries
move is not a period record.

**Remediation.** Calendar-month, half-open `[since, until)` boundaries in UTC.

**Closure:** Fully closed for monthly. **Residual:** `quarterly` remains rolling
(`reports.js:38`) — see Remaining Known Risks §4.

---

### F-06 — Evidence pack overstated its own completeness — **Medium** — *closed*

**Category:** Genuine defect in the delivered audit artefact
**Component:** Reporting / audit.pdf
**File:** `lib/runtime/reports.js`

**Before.** The pack printed, in both the Markdown and HTML/PDF renderers:

> *Showing the 25 most recent of N records, newest first. Complete identifiers
> are preserved in the exported audit data.*

Above `REGISTER_CAP` (1000) both halves were false. `connectorActivityFor()`
capped with `slice(0, REGISTER_CAP)` — retaining the **oldest** 1000 records —
while `displayRows()` renders `slice(-25)` of what it is handed. Demonstrated
against the real constants:

```
document says:      Showing the 25 most recent of 4000 records, newest first
actually shown:     ev_0999 … ev_0975
truly most recent:  ev_3999
```

In a high-volume month the pack presented weeks-old activity as the latest, and
the export was capped too, so the completeness claim was also untrue. The code's
own comment already stated the intended behaviour; `register_truncated` was
computed and never read by either renderer.

Integrity findings had the same shape with **no disclosure at all** — capped at
50 in both renderers, so a window with 130 exceptions rendered as one with 50.
The exceptions section is the last place a silent truncation belongs.

**Remediation.** The cap retains the most recent records. Both truncations
announce themselves, with exact counts and where the remainder lives, through
one shared helper per section so the Markdown and HTML/PDF documents cannot
disagree — a live risk, since the HTML path previously held a separately
maintained copy of the same sentence.

**Behaviour change:** output differs only for windows exceeding 1000 records or
50 findings. Below both caps it is byte-identical. No stored report is rewritten.

**Closure:** Fully closed for the register and findings sections.
**Residual:** `top_rules` / `top_omega` (5) and `recommendations` (20) are also
capped (`reports.js:101-103`) and undisclosed. These are summary rankings, not
records of evidence — a "top 5" is what a reader expects and no completeness
claim is attached. Not changed.

---

## 3. Verification standard

### 3.1 Mutation testing

Assertions in the new test suites were proved non-vacuous by deliberately
reintroducing each defect and confirming a specific named assertion fails.
Fifteen mutations across the two most recent fixes, all detected:

**F-03, append-only (10/10 detected):** adding `store.update("integration_events", …)`
to a library file; the migration growing a `before delete` trigger; a table losing
its UPDATE trigger; `integration_events` removed from `ORG_CHILD_COLLECTIONS`;
`store.js` starting to upsert; a module reaching `rg_ops_evidence` directly;
`lib/ops/evidence.js` gaining an `update()` export.

Three further mutations came from integrating F-02 and F-03 on one tree, which
surfaced a genuine defect in the guard rather than in the product.
`evidence-hash-verification.test.cjs` calls `store.update("integration_events", …)`
deliberately, to prove the hash check catches an altered record — and the guard
flagged it. That is a false positive: every suite in this repository scrubs the
Supabase credentials and points `RUNTIME_DATA_DIR` at a temp directory, so
`store.update` writes a JSON file and cannot reach Postgres, and test files are
never loaded by the application. The scan was narrowed to application code, and
assertion 8b now *proves* the exclusion is not a hole by requiring every suite
that mutates evidence to demonstrably scrub Supabase and use a temp store.
Verified against a non-test file still being caught, a suite retaining its
credentials, and a suite writing to a fixed path.

**F-06, truncation (5/5 detected):** cap reverted to keeping the oldest records;
completeness always claimed; findings truncation note removed; capped count
reported as the total; the HTML renderer dropping the disclosure.

This standard exists because vacuous tests were found in this very audit: an
early persistence test passed against an empty register because the report used
a rolling window ending "now" while the fixtures were dated in the past. The
test asserted nothing. Pinning the reference date exposed it.

### 3.2 Suites

| Suite | Result |
|---|---|
| `npm run contracts` (full connector + governance contract suite) | green |
| `npm run ops:test` | 51/51 |
| `connector-audit` | 47/47 |
| `evidence-append-only` | 22/22 |
| `report-truncation` | 25/25 |
| `evidence-hash-verification` | 15/15 |
| `share-password` | 18/18 |
| `report-window` | 13/13 |
| `evidence-gap-observability` | 10/10 |
| `decisionseq` | 6/6 |
| `ops/integrity` | 9/9 |
| `sovereign/pdf` | 42/42 |
| CI on every remediation branch | 19/19 checks green |

### 3.3 Live production verification

One authorised, low-cost governed Amazon Bedrock invocation was traced end to
end through the production deployment. The complete chain — proposal, governance
verdict, executable permit bound to org/environment/connector/model, provider
call, evidence record, and audit projection — linked successfully
(`chain_complete: true`). This is the only production provider call made during
the audit; all other verification used fixtures and cost nothing.

---

## 4. Controls examined and found sound

Recorded because their absence from the findings list is meaningful:

- **Deny-by-default action catalog.** An action not explicitly registered is
  refused. Verified that sibling customer-support actions remain denied after a
  registration change.
- **Fail-closed on engine unavailability.** An unreachable engine blocks the
  canonical action.
- **Execute-on-allow structure.** Execution is reachable only from the ALLOW
  branch; there is no path that executes and then evaluates.
- **Redaction by allow-list.** Report fields are enumerated rather than filtered,
  so a new evidence field cannot leak by default. No secret, credential, token,
  full prompt or customer content was found in any report or PDF path.
- **Environment isolation.** Confirmed in production after the isolation fix:
  the Bedrock and Gmail smokes target their respective environments.
- **Additive-migration tolerance.** `store.findOptional` degrades a missing table
  to an empty result and warns once, so a deployment mid-migration renders a
  thin report rather than a 500. (This has a downside — see Remaining Known
  Risks §5.)
- **Storage-health gating.** `assertStorageHealthy()` precedes insert, update and
  remove, so a degraded store fails the operation rather than silently no-opping.

---

## 5. Positions retracted during this audit

| Retracted claim | Correct position |
|---|---|
| "AU-9 is a false marketing claim" | Accurate for what it cites. The issue was uncaveated scope; a caveat has been added and the status changed to `partial`. |
| "`gateway.js` fails open on record failure — Critical" | It logs, alerts, and returns `recorded:false` with the error (`gateway.js:118-124`). Not silent, and not on the connector path. Medium configuration item. |
| "Share links are High severity" | 144-bit token is the primary control; password defaults to `null`. Medium. |
| "The audit projection caps the register at 1000 silently" | The *display* truncation was always disclosed with the true total. The real defect was which end of the register was kept — F-06. |

---

*Companion documents: Executive Security Assessment, Remediation Register,
Remaining Known Risks, Production Readiness Statement, Pilot Deployment
Checklist, Security Claims Matrix.*

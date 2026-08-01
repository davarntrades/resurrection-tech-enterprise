# Executive Security Assessment

**Product:** Guardian OS — Morrison Runtime Governance™
**Vendor:** Resurrection Tech™
**Assessment date:** 1 August 2026
**Assessment type:** Internal engineering security audit, code-verified
**Audience:** Enterprise security architects, auditors, procurement
**Status of this document:** Final. The audit is closed as of the date above.

---

## 1. Scope and method

This assessment covers the Guardian OS platform layer: the Runtime Governance
enforcement path, the proposal and approval lifecycle, evidence generation and
storage, the Integration Gateway and its connectors, the monthly evidence
architecture, and the audit artefacts delivered to customers.

Every finding in this package was verified by reading the implementing code and,
where behaviour was in question, by executing it. No finding rests on inference
from documentation or from the absence of a control. Where an earlier position
in the audit proved wrong, it was retracted explicitly rather than quietly
dropped — those retractions are recorded in §5 and in the Technical Security
Assessment, because an audit that only ever accumulates findings is not being
run honestly.

Out of scope: the governance engine's mathematical model (Ω reachability), the
cryptographic primitives themselves, third-party provider security (AWS Bedrock,
Google, Supabase), and the hosting environment. No third-party penetration test
was performed, and none is claimed.

---

## 2. Summary judgement

**Guardian OS enforces what it claims to enforce.** The governed execution path
is real: a privileged action is evaluated before it runs, a refusal blocks
execution rather than annotating it, and the outcome is written to durable
evidence. This was confirmed not only by tests but by a single authorised live
invocation traced end to end through the production deployment, which completed
with `chain_complete: true` — proposal, governance verdict, permit, provider
call, and evidence record all linked.

**The audit found six defects, all now remediated.** Two were genuine
vulnerabilities in evidence integrity; one was a real weakness in evidence
durability; one was a security hardening gap; one was a compliance-correctness
error in reporting periods; and one was a defect in which the delivered audit
artefact overstated its own completeness. None of the six allowed an ungoverned
action to execute. All six concerned whether the *record* of governance could be
trusted — which, for a product whose value is its evidence, is the right place
to have been looking.

**The platform's public claims are technically accurate.** The audit examined
every public security claim against its implementation. One control statement
needed a scope caveat, which has been added. One customer-facing document
carries a sentence that is accurate but reads more broadly than it should, and a
recommended caveat is provided. Nothing was found that the product asserts and
does not do. Notably, the public material consistently says "tamper-**evident**"
rather than "tamper-proof", which is the correct and defensible term.

**The remaining risk is concentrated in one place: tenant isolation.** Guardian
OS enforces organisation separation in application code and has zero active
row-level security policies at the database. The vendor documents this
accurately and does not overstate it. It is nevertheless the single largest
open architectural risk, and it is why this assessment supports a supervised
pilot rather than open multi-tenant production.

---

## 3. What was found, in business terms

### Two genuine vulnerabilities in evidence integrity

**Refusals could disappear.** The Integration Gateway wrote evidence through ten
call sites that discarded write failures silently. If the evidence store was
briefly unavailable at the moment a connector action was *blocked*, the block
still happened — the customer was protected — but the record of it vanished with
no error, no alert, and no gap in any count. An auditor reading the monthly pack
would see a clean month. This is the more serious of the two: an evidence
platform that can silently lose exactly the records that justify its existence
has an integrity problem, not a reliability problem.

**Stored evidence hashes were never checked.** Every connector evidence record
carried a content hash. Nothing ever recomputed it. A record altered directly in
the database would have been reported to an auditor as valid.

Both are fixed. Evidence write failures are now surfaced as findings in the
audit artefact itself; hashes are verified on every report, with a three-state
result — verified, unverifiable, or mismatch — that never reports "we could not
check" as "checked and fine".

### One real weakness in evidence durability

Evidence tables were append-only by convention. Nothing at the database
prevented a record from being altered in place, and the credential the
application itself uses bypasses the database's row-level security. This is now
enforced by a database trigger that applies to every role, including the
administrator's.

Deletion is deliberately still permitted, because customer erasure (GDPR /
offboarding) depends on it. That decision, and its consequence, are documented
rather than hidden — see Remaining Known Risks §1.

### One hardening gap and two artefact-accuracy defects

Share links passed their password in the URL query string, where it lands in
logs and browser history, and stored it unsalted. Both fixed.

"Monthly" evidence covered a rolling thirty days rather than a calendar month —
a correctness problem for any customer using the pack as a period compliance
record. Fixed.

The evidence pack claimed to show "the 25 most recent records" while, above a
threshold, showing considerably older ones, and truncated its integrity findings
section without saying so. This is the defect a procurement team should care
about most after the two integrity issues, because it is the one where the
delivered document told the reader something untrue about itself. Fixed.

---

## 4. What the audit did *not* find

Stated plainly, because absence of findings in these areas is itself
information:

- **No path was found by which an ungoverned privileged action could execute.**
  The deny-by-default catalog and the execute-on-allow structure held under
  examination.
- **No credential, token, secret, or customer content was found leaking into
  evidence records, reports, or the audit PDF.** Redaction is implemented as an
  allow-list, which is the correct direction.
- **No cross-tenant data path was found in the code examined.** The isolation
  risk in §5 is architectural — the absence of a second layer — not a known bug.
- **No fail-open was found on the connector enforcement path.** An unreachable
  engine blocks.

---

## 5. Corrections to earlier audit positions

Three positions taken earlier in this audit were wrong and are retracted:

1. **"The AU-9 control claim is false."** It is not. The claim describes the
   decision log's hash chain and cites decision-path files, and it is accurate
   for what it cites. The real issue was that its *scope* was not caveated, so
   a reader could reasonably extend it to connector evidence. A caveat has been
   added; the claim itself stands.

2. **"The runtime gateway fails open on evidence-record failure — Critical."**
   It does default to proceeding, but it logs an error, raises an alert, and
   returns `recorded: false` with the error to the caller. It is not silent, and
   it is not on the connector path at all. Downgraded to a Medium configuration
   hardening item.

3. **"Share links are a High-severity exposure."** The 144-bit token is the
   primary access control and the password is an optional second factor that
   defaults to unset. Downgraded to Medium.

A fourth correction is worth recording as a near-miss: the obvious
implementation of hash verification would have compared stored hashes against a
naively serialised recomputation. Because PostgreSQL's `jsonb` type does not
preserve key order, that fix would have reported legitimate production evidence
as tampered — an integrity control that manufactures false accusations is worse
than no control. This was demonstrated empirically before any code was written,
and the shipped implementation uses canonical serialisation with an explicit
algorithm marker so that pre-existing records are reported as `unverifiable`
rather than as `mismatch`.

---

## 6. Readiness position

**Supported: a supervised enterprise pilot** with named tenants, a known
deployment, and vendor involvement in operation.

**Not yet supported: unsupervised multi-tenant production** at scale.

The gap between those two positions is not the six remediated findings. It is
tenant isolation depth, evidence chaining for the connector path, and the fact
that two fail-closed behaviours that an enterprise would expect to be default
are currently opt-in environment variables. All three are specified in the
Pilot Deployment Checklist and the Remaining Known Risks documents.

---

## 7. Statement of limitations

This is a vendor self-assessment performed by an engineering agent with full
source access. It is not an independent audit, not a penetration test, and not a
certification. Guardian OS holds no SOC 2 report, no ISO 27001 certificate, no
Common Criteria evaluation, and no FedRAMP authorisation, and the product's
public material asserts none of these.

An enterprise customer should treat this package as what it is: a detailed,
code-referenced disclosure of what the platform does, what it does not do, and
what the vendor knows to be weak — offered as the starting point for your own
review, not as a substitute for it.

---

*Companion documents: Technical Security Assessment, Remediation Register,
Remaining Known Risks, Production Readiness Statement, Pilot Deployment
Checklist, Security Claims Matrix.*

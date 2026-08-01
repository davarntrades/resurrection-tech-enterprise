# Production Readiness Statement

**Product:** Guardian OS — Morrison Runtime Governance™
**Vendor:** Resurrection Tech™
**Statement date:** 1 August 2026
**Basis:** Internal code-verified security audit, closed as of the date above

---

## 1. Statement

Guardian OS is **ready for a supervised enterprise pilot** under the conditions
set out in §3 and the Pilot Deployment Checklist.

Guardian OS is **not yet ready for unsupervised, self-serve, multi-tenant
production** at scale. The specific gap is stated in §4, and it is not any of
the six findings raised by this audit.

This statement is made by the vendor. It is not an independent assurance
opinion, not a certification, and not an authority to operate.

---

## 2. What is verified

### 2.1 The enforcement path works, in production

A single authorised governed Amazon Bedrock invocation was traced end to end
through the production deployment. Proposal, governance verdict, executable
permit bound to organisation / environment / connector / model, provider call,
evidence record, and audit projection all linked: `chain_complete: true`.

This is the material fact behind this statement. Guardian OS does not merely
pass its own tests — the governed path has been demonstrated against live
infrastructure and a real provider.

### 2.2 Enforcement properties confirmed

| Property | Verified by |
|---|---|
| Deny-by-default: unregistered actions are refused | `customer-support-governance-registration.test.cjs` |
| Fail-closed: an unreachable engine blocks | Same suite |
| Pre-execution: the verdict precedes any tool call | Execute-on-allow code structure; permit authorises only |
| The permit is scope-bound | Bound to org, environment, connector and model |
| Environment isolation | Confirmed in production — Bedrock and Gmail smokes target their respective environments |
| No secret, credential or customer content in reports | Allow-list redaction; report and PDF paths reviewed |

### 2.3 Validation state

Full validation suite green on `main` at the assessment date:
`npm run contracts` green; `npm run ops:test` 51/51; the sovereign suite,
PDF renderer (42/42), integrity (9/9) and decision-chain (6/6) suites all
passing. Every remediation branch is green on all 19 CI checks.

Assertions in the new suites were proved non-vacuous by mutation testing —
twelve deliberate defect reintroductions across the two most recent fixes, all
twelve detected by specific named assertions.

---

## 3. Conditions for a supervised pilot

A pilot deployment is supported when **all** of the following hold. Each is a
gate, not a recommendation.

1. **All six remediations are merged and deployed.** All six are merged into
   `main` (PRs #241–#246), each green on the full 19-check CI matrix. Confirm
   they are present in the *deployed build*, which is a separate question from
   whether they are on `main`. A deployment lacking them does not meet the terms
   of this statement.
2. **Both evidence migrations are applied and verified:**
   `supabase/evidence_hash_canonical.sql` (applied to `resurrection-tech-prod`)
   and `supabase/evidence_append_only.sql` (**not yet applied** as of the
   statement date), with the append-only triggers confirmed by direct
   `pg_trigger` query. Until the second is applied, the append-only control is
   inert in that project regardless of the merged code — this is the one gate on
   this list that is currently open.
3. **`RUNTIME_REQUIRE_RECORD=1` and `RUNTIME_REQUIRE_DURABLE=1` are set.** Both
   default to off. Without them the platform's evidence guarantee is not
   fail-closed, and the Executive and Technical assessments should be read with
   that in mind.
4. **`npm run ops:schema-check` exits 0** against the target project, confirming
   every required table and additive column is present. A missing connector
   table under-reports rather than errors (R-5).
5. **`npm run runtime:preflight` exits 0.**
6. **Tenants are named and known to the operator.** Organisation isolation is
   enforced in application code with no second layer (R-2).

Full procedure: see the Pilot Deployment Checklist.

---

## 4. What separates pilot from general production

Three items, none of which is a finding from this audit:

**Tenant isolation depth (R-2, High).** Zero active row-level security policies;
organisation scoping is enforced entirely in application code. One missed
`org_id` filter is a cross-tenant disclosure with nothing to catch it. No such
bug was found — this is the absence of a second layer, not a known defect. It is
survivable when the operator controls the tenants and the release process; it is
not survivable at self-serve scale.

**Connector evidence chaining (R-1, High).** Deletion of a connector evidence
record is undetectable, because those tables carry per-record hashes without a
chain. In-place alteration is now blocked at the database, and deletion requires
direct database access — but "undetectable" is the wrong property for an
evidence platform to have at scale.

**Fail-closed defaults (R-3, Medium).** Two behaviours an enterprise would
reasonably expect to be default are opt-in environment variables. Resolvable by
configuration today; should become the default before general availability.

---

## 5. Explicit limitations

- **No independent audit.** This is a vendor self-assessment with full source
  access. It is not a third-party review.
- **No penetration test** has been performed, and none is claimed.
- **No certification is held.** Guardian OS has no SOC 2 report, no ISO 27001
  certificate, no Common Criteria evaluation, no NCSC assurance, and no FedRAMP
  authorisation. The product's public material asserts none of these, and its
  control mapping states on its face that software cannot grant itself
  accreditation.
- **The control mapping is not a system security plan** and is not a baseline
  tailoring.
- **Scope excludes** third-party provider security, the governance engine's
  mathematical model, cryptographic primitives, and host or network security.

---

## 6. Recommended review by the customer

An enterprise customer should independently verify, at minimum:

1. That the six remediations are present in the build being assessed —
   `git log` against the pull requests named in the Remediation Register.
2. That the append-only triggers exist in *their* database, by the `pg_trigger`
   query in the checklist. The schema check cannot see triggers, and probing by
   attempting an UPDATE would mean writing to production evidence.
3. That `verifyChain()` returns `ok` for their environments.
4. That a deliberately blocked action appears in their monthly evidence pack —
   the end-to-end test of the property this product exists to provide.

---

## 7. Signature block

| | |
|---|---|
| **Assessment performed by** | Resurrection Tech engineering, internal |
| **Method** | Source-level review, executed verification, mutation testing |
| **Findings raised** | 6 |
| **Fully closed** | 5 |
| **Partially closed** | 1 (F-03 — deletion remains possible; disclosed) |
| **Open known risks** | 9, disclosed in full |
| **Positions retracted during the audit** | 4, recorded |
| **Audit status** | **Closed** as of 1 August 2026 |

---

*Companion documents: Executive Security Assessment, Technical Security
Assessment, Remediation Register, Remaining Known Risks, Pilot Deployment
Checklist, Security Claims Matrix.*

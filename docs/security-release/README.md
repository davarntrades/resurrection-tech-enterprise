# Enterprise Security Release Package

**Product:** Guardian OS — Morrison Runtime Governance™
**Vendor:** Resurrection Tech™
**Package date:** 1 August 2026
**Audit status:** **Closed**

This package is the complete output of an internal, code-verified security audit
of the Guardian OS platform. It is written for three audiences — enterprise
security architects, auditors, and procurement teams — and each document is
readable on its own.

---

## Contents

| # | Document | Read it if you are… | Length |
|---|---|---|---|
| 1 | [Executive Security Assessment](./01-EXECUTIVE-SECURITY-ASSESSMENT.md) | deciding whether to proceed | 2–3 pages |
| 2 | [Technical Security Assessment](./02-TECHNICAL-SECURITY-ASSESSMENT.md) | reviewing the engineering | full detail, file-referenced |
| 3 | [Remediation Register](./03-REMEDIATION-REGISTER.md) | tracking what was fixed and how it deploys | per-finding metadata |
| 4 | [Remaining Known Risks](./04-REMAINING-KNOWN-RISKS.md) | assessing residual exposure | 9 open items |
| 5 | [Production Readiness Statement](./05-PRODUCTION-READINESS-STATEMENT.md) | signing off a deployment | conditions and limits |
| 6 | [Pilot Deployment Checklist](./06-PILOT-DEPLOYMENT-CHECKLIST.md) | actually deploying | 7 phases, sign-off block |
| 7 | [Security Claims Matrix](./07-SECURITY-CLAIMS-MATRIX.md) | verifying marketing against code | every public claim |

---

## The short version

Six findings were raised. Five are fully closed; one is partially closed with
its residual risk disclosed. Nine known risks remain open and are documented in
full, two of them High. Every public security claim was checked against its
implementation; none was found to be overstated, one control status was
corrected during the audit, and two claims carry recommended scope caveats.

The platform's governed execution path was demonstrated end to end against
production infrastructure, not only against tests.

**Position:** ready for a supervised enterprise pilot under stated conditions;
not yet ready for unsupervised multi-tenant production. The gap is tenant
isolation depth, connector evidence chaining, and two fail-closed behaviours
that are currently opt-in.

---

## Three things to check before relying on this package

1. **Merged code is not a live control.** All six remediations are merged into
   `main` (PRs #241–#246), and both required migrations are applied to
   `resurrection-tech-prod` — so all six are live *there*. They are **not** live
   anywhere else until the migrations are run against that project: migrations
   are applied per-project and do not travel with a code deploy. Confirm the
   deployed commit *and* the migrations for whatever deployment you are
   assessing. Phase 1 of the Pilot Deployment Checklist gives a per-finding
   verification command.
2. **Two database migrations are required** and one of them installs triggers
   that the automated schema check cannot see — a project can pass
   `ops:schema-check` with the append-only guard entirely absent. Phase 2 of the
   checklist gives the direct `pg_trigger` query that closes that blind spot.
3. **Two fail-closed environment variables default to off.** Without
   `RUNTIME_REQUIRE_RECORD=1` and `RUNTIME_REQUIRE_DURABLE=1`, the evidence
   guarantee described in these documents is not the behaviour you get.

---

## What this package is not

It is a vendor self-assessment performed with full source access. It is **not**
an independent audit, **not** a penetration test, and **not** a certification.
Guardian OS holds no SOC 2 report, no ISO 27001 certificate, no Common Criteria
evaluation, and no FedRAMP authorisation, and asserts none of these anywhere in
its product or public material.

Treat it as a detailed disclosure of what the platform does, what it does not
do, and what the vendor knows to be weak — a starting point for your own review,
not a substitute for it.

---

## Related existing documentation

| Document | Covers |
|---|---|
| `docs/PRODUCTION-DEPLOYMENT-CHECKLIST.md` | Baseline platform configuration and preflight |
| `docs/PLATFORM-TRUTH.md` | The vendor's normative specification for what may be claimed |
| `docs/ACCREDITATION.md` | Accreditation boundaries and what is not held |
| `lib/sovereign/controls.js` | The live control mapping — run it to regenerate |
| `docs/CONNECT-YOUR-AGENT.md` | Customer-facing integration and evidence description |

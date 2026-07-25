# Guardian OS — accreditation posture

**Guardian OS holds no third-party accreditation.**

No Common Criteria evaluation. No NCSC assurance or CAF assessment. No FedRAMP
authorisation. No ISO 27001 certificate. No authority to operate. No CE marking
under the EU AI Act. Nothing has been submitted to, or reviewed by, any
assessing body.

That statement is first because it is the one a procurement team needs, and
because every other page in this repository would be worth less if this one
hedged.

---

## 1. Why software cannot accredit itself

Accreditation is a judgement made **by a third party**, about **a specific
deployment**, in **a specific environment**, against **a specific control
baseline**, at **a specific point in time**. It is not a property of source
code. A vendor can no more certify their own software than a driver can issue
their own MOT.

What a vendor *can* do — and what this repository does — is make the assessor's
job cheap:

1. **Publish the control mapping**, with evidence pointers into real code and
   real tests, so nothing has to be taken on trust.
2. **Publish the gap register first**, so an assessor is not the one who has to
   find the weaknesses.
3. **Give the assessor a runnable instrument** (`guardian acceptance`) that
   produces a signed, witnessed record on the actual target system.
4. **Refuse to imply more than is true** in every artefact the software emits.

---

## 2. The control mapping

```bash
guardian controls                       # summary, per framework
guardian controls gaps                  # the gap register — read this first
guardian controls --pdf mapping.pdf     # the full package, rendered offline
```

Four frameworks are mapped, covering only the controls Guardian OS **materially
implements or affects**. A mapping that claimed a full baseline would be
padding, and an assessor would spot it immediately.

| Framework | Scope of the mapping |
|---|---|
| NIST SP 800-53 Rev 5 | Selected AC, AU, CM, SC, SI, SR, IA and CP controls. Not a baseline tailoring, not an SSP. |
| ISO/IEC 27001:2022 Annex A | Selected controls supporting an operator's ISMS. Certification is of an organisation, never of a product. |
| EU AI Act | Articles Guardian OS helps a **deployer** satisfy for their own high-risk systems. Guardian OS performs no conformity assessment. |
| NCSC Cloud Security Principles | Principles a sovereign deployment addresses. NCSC has not reviewed this software. |

Each control carries a status — `implemented`, `partial`, `not_implemented`,
`inherited`, `not_applicable` — plus what Guardian OS actually does, the files
that do it, and the tests that prove it. `partial` is used honestly: it means
partial, not "implemented with a caveat".

The generated document leads with the gap register, before any satisfied
control, because that is the order an assessor reads in.

Source: `lib/sovereign/controls.js`. It is dependency-free, so an assessor can
run it on an air-gapped box and read the same output you do.

---

## 3. Known gaps (summary)

The full register is `guardian controls gaps`. The ones most likely to matter in
a formal assessment:

| Control | Status | The actual limitation |
|---|---|---|
| **IA-2** Identification & authentication | inherited | Guardian OS has **no identity provider**: no MFA, no directory integration, no SSO. It must sit behind the estate's existing IdP. |
| **AU-10** Non-repudiation | partial | The decision chain is tamper-**evident**, not cryptographically non-repudiable: entries are not individually signed by a key outside the operator's control. True non-repudiation needs an external timestamp/notary authority. |
| **SC-13** Cryptographic protection | partial | The pure-Python Ed25519 verifier is **not FIPS-validated** and not constant-time. It touches only public values, but a deployment requiring validated cryptography must substitute a validated module. |
| **SC-12** Key management | partial | No key rotation workflow, no revocation list, no HSM integration. Key custody is an operator procedure. |
| **AC-4** Information flow | partial | Enforcement is at the **governed tool-call boundary only**. Guardian OS is not a network control or a DLP product. |
| **CP-9** Backup | partial | Documented backup set and export command, but no scheduler, no retention policy, no automated restore verification. |
| **NCSC P7** Secure development | partial | No independent security assessment or penetration test of this codebase has been commissioned. |

None of these are hidden in a footnote. They are printed on the front of the
generated package.

---

## 4. What an accreditation route would actually require

If a customer intends to take a Guardian OS deployment through a formal
process, this is the honest shape of the work — and most of it is **theirs**,
not the vendor's, because accreditation attaches to their system:

**Vendor-side, not yet done:**
- An independent security assessment / penetration test of the codebase.
- A validated cryptographic module in place of the pure-Python verifier where a
  FIPS or equivalent boundary is required.
- Key rotation and revocation, with a documented ceremony.
- A tested RTO/RPO on representative hardware.
- A Software Bill of Materials for both images.

**Customer-side, and unavoidable:**
- System categorisation and control baseline selection.
- Integration with the estate's identity provider (IA-2 is inherited, not met).
- The environment's own boundary, physical and personnel controls.
- A System Security Plan naming Guardian OS as a component, with this mapping as
  supporting evidence rather than as a substitute for the plan.
- The assessment itself, by their assessor or a notified body.

Guardian OS supplies evidence into that process. It does not shorten it by
claiming to have already passed it.

---

## 5. What the software will and will not say

Every artefact Guardian OS emits is constrained to the truth:

- `guardian controls` prints the "no third-party accreditation" disclaimer on
  every run and on the PDF cover, where the metadata line reads
  **Accreditation held: none**.
- `guardian verify --pdf` produces a *deployment attestation* that states in its
  subtitle that it "is not a certification and asserts no third-party
  accreditation".
- `guardian acceptance --pdf` produces a *site acceptance record* whose sign-off
  block says plainly that "neither signature constitutes an accreditation,
  certification or authority to operate".
- An acceptance run with **no site and no witness recorded** is marked as a
  self-test on its face and is not described as a field trial.

These are asserted by tests (`scripts/sovereign/acceptance.test.cjs`), so the
wording cannot quietly drift toward something stronger.

---

## 6. What *is* independently checkable today

Not accreditation, but not nothing — and all of it verifiable by an assessor on
their own hardware, offline:

- **Enforcement is real and measurable.** `guardian acceptance` sends an
  unauthorised action through the live engine on the target host and records the
  verdict and the decision latency. If the deployment does not block, the run
  fails.
- **Artefact integrity is cryptographic.** Three independent layers on every
  installable artefact, verified by two independent implementations (Node and
  pure-stdlib Python) that CI proves interoperate.
- **The audit chain is tamper-evident.** `store.verifyChain()` recomputes the
  hash chain and reports the first altered or missing entry.
- **The isolation claim is a test result.** CI runs the platform inside a
  network namespace with no interface but loopback, and the engine in a
  container started with `--network none`, with cloud credentials deliberately
  left in the environment so the software must refuse them.
- **The interface makes no external request.** `npm run sovereign:offline-audit`
  scans the emitted HTML, JS and CSS; the cloud build shows 170+ external
  resource loads and the sovereign build shows zero. The audit's baseline mode
  proves the scanner detects, so a pass cannot be vacuous.

---

## 7. Document control

This document and the generated control mapping are versioned with the code. If
a control's implementation changes, the mapping changes in the same commit —
that is the point of generating it from a module rather than maintaining a
spreadsheet.

Related: [`docs/SOVEREIGN.md`](./SOVEREIGN.md) (architecture, deployment,
security assumptions) · [`docs/FIELD-TRIAL.md`](./FIELD-TRIAL.md) (the protocol
that turns "acceptance-testable" into "field-tested").

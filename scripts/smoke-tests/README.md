# Runtime Governance — multi-sector smoke-test + regression pack

Eight realistic enterprise scenarios that exercise the live governance engine
end-to-end: manifest → `/v1/assess` → `/v1/evaluate` (trajectory replay) →
branded **Audit** + **Executive Report** PDFs. Each pack mixes **legitimate**
enterprise workflows with **catastrophic** trajectories and asserts the expected
ALLOW/BLOCK outcome for every one.

## Enterprise regression — `npm run smoke:enterprise`

The single command that guards the whole delivery pipeline:

```bash
npm run smoke:enterprise      # unit layer always; live layer if engine configured
npm run smoke:sectors         # unit sector-detection layer only (no engine)
```

- **Unit layer (always, no engine):** `sector-detection.test.cjs` proves sector
  detection is **deterministic** (weighted confidence scoring, not first-match),
  covers overlapping terminology across every sector, checks structural
  invariants (every detectable sector has a rendered profile), and verifies the
  anti-contamination scoping (a healthcare Ω is dropped from a cyber report; a
  supply-chain engagement keeps its intrinsic finance/manufacturing findings).
- **Live layer (when `GOVERNANCE_URL` + `GOVERNANCE_TOKEN` are set):** drives
  every sector pack through the real delivery kit and asserts, per scenario:
  correct sector selected · correct threat-model headline · correct Ω-domain
  attribution · Executive Report PDF renders · Technical Audit PDF renders ·
  runtime evidence populated from the live engine · ALLOW/BLOCK verdicts match ·
  no cross-sector contamination.

It **fails immediately** if a finance report is generated for a supply-chain
engagement, a foreign sector's Ω (e.g. healthcare) appears in another sector's
report, an Ω domain is mis-attributed, or a report headline doesn't match the
detected sector.

### Why (root cause it protects against)

The old `sectorIdFor` was a first-match regex cascade that tested `finance`
before supply chain / insurance / manufacturing, so any engagement whose text
mentioned "payment" (procurement, claims payout, benefits disbursement) was
mislabelled **Financial Services**, and sectors with no profile silently
rendered the generic **Enterprise** headline. Detection is now a weighted
scorer with explicit precedence and an optional explicit `sector` override, and
every detectable sector has a first-class profile — so the class of bug cannot
recur, and this suite fails the build if it tries to.

## Scenarios

| # | File | Company | Sector | Ω domains |
|---|------|---------|--------|-----------|
| 1 | `01-finance-meridian-sterling.json` | Meridian Sterling Bank plc | Tier-1 banking / payments / treasury / trading | finance, banking, fraud, compliance |
| 2 | `02-healthcare-caldwell-regional.json` | Caldwell Regional Health System | Hospital / clinical ops / PHI / patient safety | healthcare, data_privacy, compliance |
| 3 | `03-cyber-sentinelgate-mssp.json` | SentinelGate Managed Security | Managed SOC / MDR / customer tenants | cybersecurity, compliance, data_privacy |
| 4 | `04-insurance-brightpath-assurance.json` | Brightpath Assurance Group | Claims / underwriting / fraud / actuarial | insurance, fraud, data_privacy, compliance |
| 5 | `05-supplychain-northgate-logistics.json` | Northgate Fulfilment & Logistics | Autonomous fulfilment / vendor payments / robotics | supply_chain, manufacturing, finance, compliance |
| 6 | `06-manufacturing-axfell-precision.json` | Axfell Precision Manufacturing | Plant-floor robotics / scheduling / QC | manufacturing, compliance |
| 7 | `07-government-cascade-benefits.json` | Cascade County Benefits Agency | Benefits casework / entitlement / citizen records | government, data_privacy, compliance |
| 8 | `08-defence-sovereign-shield.json` | Sovereign Shield Defence Systems | Mission systems / classified / command & control | defence, cybersecurity, compliance |

Each pack has a `_smoke` block: `scenario`, `company`, `industry`,
`assessment reference`, `omega_domains`, and an `expected[]` array giving the
target verdict + reasoning for every trajectory index. Packs may set an explicit
top-level `sector` to pin detection deterministically.

## Sector-specific risks exercised

- **Finance** — SWIFT/wire to unverified beneficiary, BEC vendor-bank tamper,
  forged human approval, AML structuring, PCI card-data egress, destination
  change after review. Legit: KYC-verified payroll, four-eyes payment chain,
  AML/KYC reporting.
- **Healthcare** — PHI egress, autonomous opioid Rx, discharge without sign-off,
  EHR/diagnosis tamper, dosage change, cross-border PHI, PHI to external LLM.
  Legit: clinician-approved Rx/EHR, HIPAA-authorised referral, de-identified
  research export, self-hosted LLM.
- **Cyber / MSSP** — EDR disable, log wipe, credential exfil, lateral movement,
  role escalation, download-and-execute, persistence key, DB drop, untrusted
  install, secret-key email. Legit: host isolation, credential rotation,
  ticketing + customer notify, authorised SSH/log-rotation, internal telemetry.
- **Insurance** — payout to unverified payee, policy bind without underwriting,
  actuarial-model tamper, unauthorised fund release, policyholder-PII exfil,
  forged approval. Legit: verified claim payout, underwritten policy, actuary-
  approved model change, SIU fraud report.
- **Supply chain** — PO to unapproved vendor, shipment to unverified
  destination, robot motion out of safety envelope, unapproved inventory
  write-off, vendor-bank tamper, payment to unknown account. Legit: approved PO,
  verified dispatch, in-envelope robotics, approved inventory adjustment,
  verified vendor payment.

## Running

```bash
# Point at the live engine (Railway/Cloud Run) or a local governance-service:
export GOVERNANCE_URL=https://<engine-host>
export GOVERNANCE_TOKEN=<bearer-token>

bash scripts/smoke-tests/run-all.sh
```

Or run pieces directly:

```bash
# Fast verdict pre-flight only (no PDFs) — asserts every trajectory vs expected:
python3 scripts/smoke-tests/_validate.py

# One full audit (both PDFs) for a single scenario:
node scripts/delivery-kit.cjs scripts/smoke-tests/01-finance-meridian-sterling.json
```

### Local engine (no external host)

```bash
pip install fastapi 'uvicorn[standard]' pydantic
git clone --depth 1 https://github.com/davarntrades/Morrison-Runtime-Governance /tmp/engine
cd governance-service
GOVERNANCE_TOKEN=dev-token PYTHONPATH=/tmp/engine \
  python3 -m uvicorn app:app --port 8091 &
cd ..
GOVERNANCE_URL=http://127.0.0.1:8091 GOVERNANCE_TOKEN=dev-token \
  bash scripts/smoke-tests/run-all.sh
```

## What each run proves

- `/v1/assess` + `/v1/evaluate` both return **200** with verdicts (`source: engine`).
- Every **legitimate** trajectory → ALLOW (no over-blocking).
- Every **catastrophic** trajectory → BLOCK (no false negatives).
- `engine_compute_ms` is measured and separated from transport latency.
- Replay determinism is **N/N** (reproducible verdicts).
- Runtime evidence (ALLOW/BLOCK/ESCALATE stats) populates from the live replay.
- Both **Audit** and **Executive Report** PDFs render (valid `%PDF`).
- Each report is scoped to its **own sector threat model** — no cross-sector
  narrative bleed.

Latest recorded run (local engine, 2026-07-02): **84/84 trajectories correct
across 8 sectors, 0 false positives, 0 false negatives, 16/16 PDFs generated,
`smoke:enterprise` PASS (unit + live).**
Outputs are written to `deliverables/` (gitignored — customer artefacts stay local).

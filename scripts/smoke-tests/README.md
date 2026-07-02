# Runtime Governance — multi-sector smoke-test + regression pack

**Eleven** realistic enterprise scenarios that exercise the live governance
engine end-to-end: manifest → `/v1/assess` → `/v1/evaluate` (trajectory replay)
→ branded **Audit** + **Executive Report** PDFs. Each pack mixes **safe**
(ALLOW), **suspicious** (ESCALATE) and **unsafe** (BLOCK) trajectories and
asserts the expected verdict for every one.

## Commands

```bash
npm run smoke:enterprise   # full stack + baseline CI gate + validation report
npm run smoke:sectors      # unit: deterministic sector detection (no engine)
npm run smoke:adversarial  # unit: overlap + adversarial/malformed manifests (no engine)
npm run smoke:stress       # live: 1/10/100/500/1000-tool scale + determinism
npm run smoke:baseline     # regenerate baseline.json (intentional, after a real change)
npm run smoke:ci           # unit + adversarial + full enterprise gate (the CI entry)
```

The **live** layers need `GOVERNANCE_URL` + `GOVERNANCE_TOKEN`; the **unit**
layers run anywhere with no engine.

### What the enterprise regression guards

- **Unit (always, no engine):** `sector-detection.test.cjs` proves detection is
  **deterministic** (weighted confidence scoring, first declared domain
  authoritative — not first-match), with structural invariants (every detectable
  sector has a rendered profile) and anti-contamination scoping.
  `overlap-adversarial.test.cjs` throws confusing cross-sector terminology and
  hostile/malformed/nested/duplicated/reordered/5000-tool manifests at the parser
  and asserts it stays deterministic and never crashes.
- **Live (engine configured):** drives every sector pack through the real
  delivery kit and asserts, per scenario: correct sector · threat-model headline ·
  Ω attribution · **recommendation engine** · Executive Report PDF · Technical
  Audit PDF · runtime evidence (source: engine) · `engine_compute_ms` ·
  **deterministic replay** (verdict + `trajectory_hash` stable) ·
  ALLOW/ESCALATE/BLOCK verdicts · no cross-sector contamination.
- **Baseline CI gate:** the run is diffed against `baseline.json`. The build
  **fails** on any drift in sector detection, Ω attribution, a verdict, a
  `trajectory_hash` (replay), the headline, the recommendation, PDF size
  (±40%), or any **increase** in false positives / false negatives. Regenerate
  the baseline intentionally with `npm run smoke:baseline` after a real,
  reviewed change.

Every run writes a `VALIDATION-REPORT.md` (sectors, trajectories, pass/fail,
latency, coverage, deterministic-replay status, overall readiness).

It **fails immediately** if a finance report is generated for a supply-chain
engagement, a foreign sector's Ω (e.g. healthcare) appears in another sector's
report, an Ω domain is mis-attributed, or a headline doesn't match the sector.

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
| 9 | `09-telecom-orbitalcomm.json` | OrbitalComm Networks | Provisioning / BGP / lawful intercept / billing | telecommunications, data_privacy, compliance |
| 10 | `10-energy-vantagegrid.json` | Vantage Grid Operator | Grid control / SCADA / protection relays | energy, compliance |
| 11 | `11-aerospace-meridianaero.json` | Meridian Aero Dispatch | Flight planning / dispatch / airworthiness | aerospace, compliance |

Each pack has a `_smoke` block: `scenario`, `company`, `industry`,
`assessment reference`, `omega_domains`, and an `expected[]` array giving the
target verdict + reasoning for every trajectory index (including the
**ESCALATE** suspicious tier: a sensitive read → recommendation sink held for
human sign-off). Packs may set an explicit top-level `sector` to pin detection
deterministically.

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

Latest recorded run (local engine, 2026-07-02): **112/112 trajectories correct
across 11 sectors (47 ALLOW · 11 ESCALATE · 54 BLOCK), 0 false positives, 0
false negatives, 0 missed escalations, 22/22 PDFs, determinism STABLE at all
scales, unit 123 + adversarial 58 assertions PASS, baseline gate PASS (no drift).**
The generated audit/report PDFs go to `deliverables/` (gitignored — customer
artefacts stay local); the machine-readable baseline (`baseline.json`) and
`VALIDATION-REPORT.md` are committed alongside the tests.

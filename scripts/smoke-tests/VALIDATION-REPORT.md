# Enterprise Validation Report

_Generated 2026-07-02 22:28:48 · engine `http://127.0.0.1:8091`_

## Overall enterprise readiness: ✅ READY

| Metric | Value |
|---|---|
| Sectors tested | 11 |
| Trajectories tested | 112 |
| Verdicts | ALLOW 47 · ESCALATE 11 · BLOCK 54 |
| False positives | 0 |
| False negatives | 0 |
| Missed escalations | 0 |
| PDFs generated | 22 |
| Unit (detection + adversarial) | PASS |
| Baseline CI gate | PASS (no drift) |
| Deterministic replay | STABLE |

## Per-sector results

| Sector | Status | Headline | Recommendation | ALLOW | ESC | BLOCK | FP | FN | Replay | PDFs |
|---|---|---|---|---|---|---|---|---|---|---|
| finance | PASS | financial services | Discovery Workshop™ → Remediation Assessment | 5 | 1 | 7 | 0 | 0 | 13/13 | 2/2 |
| healthcare | PASS | healthcare | Discovery Workshop™ → Remediation Assessment | 6 | 1 | 8 | 0 | 0 | 15/15 | 2/2 |
| cybersecurity | PASS | cybersecurity | Discovery Workshop™ → Remediation Assessment | 7 | 1 | 10 | 0 | 0 | 18/18 | 2/2 |
| insurance | PASS | insurance | Discovery Workshop™ → Remediation Assessment | 6 | 1 | 6 | 0 | 0 | 13/13 | 2/2 |
| supply_chain | PASS | supply chain & logistics | Discovery Workshop™ → Remediation Assessment | 6 | 1 | 6 | 0 | 0 | 13/13 | 2/2 |
| manufacturing | PASS | manufacturing | Discovery Workshop™ → Remediation Assessment | 3 | 1 | 3 | 0 | 0 | 7/7 | 2/2 |
| government | PASS | government & public sector | Discovery Workshop™ → Remediation Assessment | 3 | 1 | 3 | 0 | 0 | 7/7 | 2/2 |
| defence | PASS | defence | Discovery Workshop™ → Remediation Assessment | 2 | 1 | 3 | 0 | 0 | 6/6 | 2/2 |
| telecommunications | PASS | telecommunications | Discovery Workshop™ → Remediation Assessment | 3 | 1 | 3 | 0 | 0 | 7/7 | 2/2 |
| energy | PASS | energy & utilities | Discovery Workshop™ → Remediation Assessment | 3 | 1 | 3 | 0 | 0 | 7/7 | 2/2 |
| aerospace | PASS | aerospace & aviation | Limited Pilot™ | 3 | 1 | 2 | 0 | 0 | 6/6 | 2/2 |

## Regression coverage

- **Sectors:** finance, healthcare, cybersecurity, insurance, supply_chain, manufacturing, government, defence, telecommunications, energy, aerospace
- **Verdict tiers:** safe (ALLOW), suspicious (ESCALATE), unsafe (BLOCK) per sector
- **Per-sector checks:** sector detection · Ω attribution · threat-model headline · executive report · technical audit · recommendation engine · PDF generation · runtime evidence · deterministic replay · trajectory hashes · no cross-sector contamination
- **Overlap + adversarial:** confusing terminology across sectors; mixed-sector / misleading-keyword / nested / malformed / duplicated / reordered / large (5000-tool) manifests — parser stays deterministic and never throws
- **Stress:** 1 / 10 / 100 / 500 / 1000 tools — engine compute, transport, report generation, memory, deterministic replay (see `npm run smoke:stress`)
- **CI gate:** build fails on drift in sector detection, Ω attribution, verdicts, trajectory hashes, headline, recommendation, PDF size, or any FP/FN increase


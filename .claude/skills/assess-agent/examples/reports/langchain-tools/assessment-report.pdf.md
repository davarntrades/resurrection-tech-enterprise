---
title: "Morrison Runtime Governance — Ω Exposure Assessment"
subtitle: "Healthcare Agent · Confidential"
date: "2026-06-10T01:44:32Z"
geometry: margin=1in
---
# Executive Summary

**Healthcare Agent — agent governance assessment**

- **Tools assessed:** 6 (4 carry governed-risk capabilities).
- **Ω coverage:** ~100% of risky tools (4 covered, 0 partial, 0 uncovered).
- **Highest-risk trajectories (verified BLOCK before execution):** 2 — e.g. export_phi_dataset (external) exercised adversarially → `data_privacy`.
- **Top uncovered areas:** none.
- **Recommended pilot:** govern the healthcare agent with the live Ω registry.
- **Estimated time-to-value:** days — most tools map to live Ω; a pilot can show pre-execution blocks immediately.


> Of your 6 tools, 4 map to governed Ω domains today, 0 require bespoke Ω extensions, and 2 high-risk trajectories would be blocked before execution.

\newpage

# Ω Exposure Report — Healthcare Agent

_2026-06-10T01:44:32Z · manifest format: langchain · 6 tools · 100% of risky tools governed · live catalog: 95 Ω rules_

## Reachable forbidden states (Ω exposure)

| Forbidden state | Status | Tools | Ω rules |
|---|---|---|---|
| Approval / Control Bypass | 🟢 Covered | 2 | `critical_change_after_verification`, `finance_approval_tampering` |
| State-Transition Abuse | 🟢 Covered | 2 | `critical_change_after_verification`, `finance_destination_change_after_verification` |
| External Egress / Data Exfiltration | 🟢 Covered | 2 | `delegated_external_egress`, `indirect_sensitive_egress`, `internal_artifact_leak` |
| PHI Exposure | 🟢 Covered | 2 | `healthcare_phi_egress`, `phi_exposure` |

## Per-tool coverage

| Tool | Capabilities | Status | Ω coverage |
|---|---|---|---|
| `get_patient_record` | data | ⚪ No-risk | — |
| `schedule_appointment` | data, mutation | 🟢 Covered | `critical_change_after_verification`, `finance_approval_tampering`, `finance_destination_change_after_verification` |
| `prescribe_medication` | data, mutation | 🟢 Covered | `critical_change_after_verification`, `finance_approval_tampering`, `finance_destination_change_after_verification` |
| `export_phi_dataset` | data, external | 🟢 Covered | `delegated_external_egress`, `healthcare_phi_egress`, `indirect_sensitive_egress` |
| `send_referral` | data, external | 🟢 Covered | `delegated_external_egress`, `healthcare_phi_egress`, `indirect_sensitive_egress` |
| `lookup_drug_interactions` | data | ⚪ No-risk | — |

\newpage

# Gap Analysis

0 uncovered tool(s), 0 partially covered.

## Uncovered (0)
- none

## Partially covered (0)
- none


\newpage

# Pilot Scope

**Objective:** govern Healthcare Agent's agent — block its reachable forbidden states before execution.

**Success criteria:** 0 FP / 0 FN on the pilot corpus; sub-millisecond evaluation; every verdict attested + replayable.

**Required integrations:** governance middleware in front of `schedule_appointment`, `prescribe_medication`, `export_phi_dataset`, `send_referral`.

**Protected assets / risk reduction:** 4 tools covered today; 0 gap(s) closed by a `healthcare` Ω registry.

**Evaluation plan:** load pilot Ω → run corpus (0 FP/FN) → replay sample verdicts → benchmark latency → `generate-audit-pack`.

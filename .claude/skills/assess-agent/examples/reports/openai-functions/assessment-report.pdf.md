---
title: "Morrison Runtime Governance — Ω Exposure Assessment"
subtitle: "Finance Agent · Confidential"
date: "2026-06-10T01:44:32Z"
geometry: margin=1in
---
# Executive Summary

**Finance Agent — agent governance assessment**

- **Tools assessed:** 6 (4 carry governed-risk capabilities).
- **Ω coverage:** ~100% of risky tools (4 covered, 0 partial, 0 uncovered).
- **Highest-risk trajectories (verified BLOCK before execution):** 4 — e.g. transfer_funds (funds) exercised adversarially → `finance`.
- **Top uncovered areas:** none.
- **Recommended pilot:** govern the finance agent with the live Ω registry.
- **Estimated time-to-value:** days — most tools map to live Ω; a pilot can show pre-execution blocks immediately.


> Of your 6 tools, 4 map to governed Ω domains today, 0 require bespoke Ω extensions, and 4 high-risk trajectories would be blocked before execution.

\newpage

# Ω Exposure Report — Finance Agent

_2026-06-10T01:44:32Z · manifest format: openai-functions · 6 tools · 100% of risky tools governed · live catalog: 95 Ω rules_

## Reachable forbidden states (Ω exposure)

| Forbidden state | Status | Tools | Ω rules |
|---|---|---|---|
| Unauthorized Funds Movement | 🟢 Covered | 2 | `finance_funds_to_unverified_destination`, `finance_high_value_unverified_transfer`, `unauthorized_transfer` |
| External Egress / Data Exfiltration | 🟢 Covered | 2 | `delegated_external_egress`, `indirect_sensitive_egress`, `internal_artifact_leak` |
| Card Data Exposure | 🟢 Covered | 1 | `compliance_regulated_data_export`, `pci_card_exposure` |
| PII / Regulated Data Export | 🟢 Covered | 1 | `customer_pii_external`, `indirect_sensitive_egress`, `pii_exfiltration` |
| State-Transition Abuse | 🟢 Covered | 1 | `critical_change_after_verification`, `finance_destination_change_after_verification` |

## Per-tool coverage

| Tool | Capabilities | Status | Ω coverage |
|---|---|---|---|
| `get_account_balance` | data | ⚪ No-risk | — |
| `transfer_funds` | data, funds | 🟢 Covered | `finance_funds_to_unverified_destination`, `finance_high_value_unverified_transfer`, `unauthorized_transfer` |
| `send_wire_payment` | external, funds | 🟢 Covered | `delegated_external_egress`, `finance_funds_to_unverified_destination`, `finance_high_value_unverified_transfer` |
| `export_customer_records` | data, external | 🟢 Covered | `compliance_regulated_data_export`, `customer_pii_external`, `delegated_external_egress` |
| `approve_transaction` | mutation | 🟢 Covered | `critical_change_after_verification`, `finance_destination_change_after_verification` |
| `lookup_fx_rate` | data | ⚪ No-risk | — |

\newpage

# Gap Analysis

0 uncovered tool(s), 0 partially covered.

## Uncovered (0)
- none

## Partially covered (0)
- none


\newpage

# Pilot Scope

**Objective:** govern Finance Agent's agent — block its reachable forbidden states before execution.

**Success criteria:** 0 FP / 0 FN on the pilot corpus; sub-millisecond evaluation; every verdict attested + replayable.

**Required integrations:** governance middleware in front of `transfer_funds`, `send_wire_payment`, `export_customer_records`, `approve_transaction`.

**Protected assets / risk reduction:** 4 tools covered today; 0 gap(s) closed by a `finance` Ω registry.

**Evaluation plan:** load pilot Ω → run corpus (0 FP/FN) → replay sample verdicts → benchmark latency → `generate-audit-pack`.

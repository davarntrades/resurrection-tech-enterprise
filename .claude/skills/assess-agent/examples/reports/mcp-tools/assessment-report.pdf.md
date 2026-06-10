---
title: "Morrison Runtime Governance — Ω Exposure Assessment"
subtitle: "SOC / Security-Ops Agent · Confidential"
date: "2026-06-10T01:44:32Z"
geometry: margin=1in
---
# Executive Summary

**SOC / Security-Ops Agent — agent governance assessment**

- **Tools assessed:** 8 (5 carry governed-risk capabilities).
- **Ω coverage:** ~100% of risky tools (5 covered, 0 partial, 0 uncovered).
- **Highest-risk trajectories (verified BLOCK before execution):** 5 — e.g. run_shell_command (execution) exercised adversarially → `cybersecurity`.
- **Top uncovered areas:** none.
- **Recommended pilot:** govern the cybersecurity agent with the live Ω registry.
- **Estimated time-to-value:** days — most tools map to live Ω; a pilot can show pre-execution blocks immediately.


> Of your 8 tools, 5 map to governed Ω domains today, 0 require bespoke Ω extensions, and 5 high-risk trajectories would be blocked before execution.

\newpage

# Ω Exposure Report — SOC / Security-Ops Agent

_2026-06-10T01:44:32Z · manifest format: mcp · 8 tools · 100% of risky tools governed · live catalog: 95 Ω rules_

## Reachable forbidden states (Ω exposure)

| Forbidden state | Status | Tools | Ω rules |
|---|---|---|---|
| Privilege Escalation | 🟢 Covered | 3 | `privilege_escalation`, `role_privilege_escalation`, `unauthorized_role_change` |
| Arbitrary Code Execution | 🟢 Covered | 1 | `shell_injection` |
| Approval / Control Bypass | 🟢 Covered | 1 | `critical_change_after_verification`, `finance_approval_tampering` |
| State-Transition Abuse | 🟢 Covered | 1 | `critical_change_after_verification`, `finance_destination_change_after_verification` |
| External Egress / Data Exfiltration | 🟢 Covered | 1 | `delegated_external_egress`, `indirect_sensitive_egress`, `internal_artifact_leak` |

## Per-tool coverage

| Tool | Capabilities | Status | Ω coverage |
|---|---|---|---|
| `query_siem_alerts` | data | ⚪ No-risk | — |
| `run_shell_command` | execution | 🟢 Covered | `shell_injection` |
| `read_secret_vault` | data | ⚪ No-risk | — |
| `isolate_host` | mutation, privilege | 🟢 Covered | `critical_change_after_verification`, `finance_approval_tampering`, `finance_destination_change_after_verification` |
| `grant_iam_role` | privilege | 🟢 Covered | `privilege_escalation`, `role_privilege_escalation`, `unauthorized_role_change` |
| `disable_audit_logging` | privilege | 🟢 Covered | `privilege_escalation`, `role_privilege_escalation`, `unauthorized_role_change` |
| `post_threat_intel` | external | 🟢 Covered | `delegated_external_egress`, `indirect_sensitive_egress`, `internal_artifact_leak` |
| `enrich_indicator` | data | ⚪ No-risk | — |

\newpage

# Gap Analysis

0 uncovered tool(s), 0 partially covered.

## Uncovered (0)
- none

## Partially covered (0)
- none


\newpage

# Pilot Scope

**Objective:** govern SOC / Security-Ops Agent's agent — block its reachable forbidden states before execution.

**Success criteria:** 0 FP / 0 FN on the pilot corpus; sub-millisecond evaluation; every verdict attested + replayable.

**Required integrations:** governance middleware in front of `run_shell_command`, `isolate_host`, `grant_iam_role`, `disable_audit_logging`, `post_threat_intel`.

**Protected assets / risk reduction:** 5 tools covered today; 0 gap(s) closed by a `cybersecurity` Ω registry.

**Evaluation plan:** load pilot Ω → run corpus (0 FP/FN) → replay sample verdicts → benchmark latency → `generate-audit-pack`.

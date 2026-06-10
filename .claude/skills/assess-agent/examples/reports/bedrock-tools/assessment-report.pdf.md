---
title: "Morrison Runtime Governance — Ω Exposure Assessment"
subtitle: "Multi-Agent Coordinator · Confidential"
date: "2026-06-10T01:44:33Z"
geometry: margin=1in
---
# Executive Summary

**Multi-Agent Coordinator — agent governance assessment**

- **Tools assessed:** 6 (4 carry governed-risk capabilities).
- **Ω coverage:** ~100% of risky tools (4 covered, 0 partial, 0 uncovered).
- **Highest-risk trajectories (verified BLOCK before execution):** 7 — e.g. dispatch_subagent (delegation) exercised adversarially → `insurance`.
- **Top uncovered areas:** none.
- **Recommended pilot:** govern the finance agent with the live Ω registry.
- **Estimated time-to-value:** days — most tools map to live Ω; a pilot can show pre-execution blocks immediately.


> Of your 6 tools, 4 map to governed Ω domains today, 0 require bespoke Ω extensions, and 7 high-risk trajectories would be blocked before execution.

\newpage

# Ω Exposure Report — Multi-Agent Coordinator

_2026-06-10T01:44:33Z · manifest format: bedrock · 6 tools · 100% of risky tools governed · live catalog: 95 Ω rules_

## Reachable forbidden states (Ω exposure)

| Forbidden state | Status | Tools | Ω rules |
|---|---|---|---|
| Cross-Agent Collusion | 🟢 Covered | 3 | `delegated_external_egress` |
| External Egress / Data Exfiltration | 🟢 Covered | 2 | `delegated_external_egress`, `indirect_sensitive_egress`, `internal_artifact_leak` |
| Unauthorized Funds Movement | 🟢 Covered | 1 | `finance_funds_to_unverified_destination`, `finance_high_value_unverified_transfer`, `unauthorized_transfer` |
| Privilege Escalation | 🟢 Covered | 1 | `privilege_escalation`, `role_privilege_escalation`, `unauthorized_role_change` |

## Per-tool coverage

| Tool | Capabilities | Status | Ω coverage |
|---|---|---|---|
| `dispatch_subagent` | delegation | 🟢 Covered | `delegated_external_egress` |
| `route_to_finance_agent` | data, delegation, external, funds | 🟢 Covered | `delegated_external_egress`, `finance_funds_to_unverified_destination`, `finance_high_value_unverified_transfer` |
| `aggregate_agent_results` | data | ⚪ No-risk | — |
| `grant_agent_permission` | privilege | 🟢 Covered | `privilege_escalation`, `role_privilege_escalation`, `unauthorized_role_change` |
| `publish_run_summary` | delegation, external | 🟢 Covered | `delegated_external_egress`, `indirect_sensitive_egress`, `internal_artifact_leak` |
| `list_available_agents` | data | ⚪ No-risk | — |

\newpage

# Gap Analysis

0 uncovered tool(s), 0 partially covered.

## Uncovered (0)
- none

## Partially covered (0)
- none


\newpage

# Pilot Scope

**Objective:** govern Multi-Agent Coordinator's agent — block its reachable forbidden states before execution.

**Success criteria:** 0 FP / 0 FN on the pilot corpus; sub-millisecond evaluation; every verdict attested + replayable.

**Required integrations:** governance middleware in front of `dispatch_subagent`, `route_to_finance_agent`, `grant_agent_permission`, `publish_run_summary`.

**Protected assets / risk reduction:** 4 tools covered today; 0 gap(s) closed by a `finance` Ω registry.

**Evaluation plan:** load pilot Ω → run corpus (0 FP/FN) → replay sample verdicts → benchmark latency → `generate-audit-pack`.

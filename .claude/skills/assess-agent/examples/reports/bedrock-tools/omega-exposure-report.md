# Ω Exposure Report — Multi-Agent Coordinator

_2026-06-10T01:28:43Z · manifest format: bedrock · 6 tools · 100% of risky tools governed · live catalog: 95 Ω rules_

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
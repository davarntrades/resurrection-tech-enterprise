# Ω Exposure Report — SOC / Security-Ops Agent

_2026-06-10T01:28:43Z · manifest format: mcp · 8 tools · 100% of risky tools governed · live catalog: 95 Ω rules_

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
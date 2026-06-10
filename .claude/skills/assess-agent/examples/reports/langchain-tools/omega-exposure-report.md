# Ω Exposure Report — Healthcare Agent

_2026-06-10T01:28:43Z · manifest format: langchain · 6 tools · 100% of risky tools governed · live catalog: 95 Ω rules_

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
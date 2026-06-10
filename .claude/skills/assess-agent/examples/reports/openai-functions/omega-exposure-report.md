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
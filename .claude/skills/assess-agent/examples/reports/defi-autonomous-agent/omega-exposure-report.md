# Ω Exposure Report — Autonomous DeFi / Trading Agent

_2026-06-10T01:44:33Z · manifest format: generic-json · 8 tools · 33% of risky tools governed · live catalog: 95 Ω rules_

## Reachable forbidden states (Ω exposure)

| Forbidden state | Status | Tools | Ω rules |
|---|---|---|---|
| Irreversible On-Chain Action | 🔴 Uncovered | 3 | — |
| Unauthorized Funds Movement | 🟢 Covered | 2 | `finance_funds_to_unverified_destination`, `finance_high_value_unverified_transfer`, `unauthorized_transfer` |
| Arbitrary Code Execution | 🟢 Covered | 1 | `shell_injection` |
| Autonomous Market Action | 🔴 Uncovered | 1 | — |
| External Egress / Data Exfiltration | 🟢 Covered | 1 | `delegated_external_egress`, `indirect_sensitive_egress`, `internal_artifact_leak` |
| PII / Regulated Data Export | 🟢 Covered | 1 | `customer_pii_external`, `indirect_sensitive_egress`, `pii_exfiltration` |

## Per-tool coverage

| Tool | Capabilities | Status | Ω coverage |
|---|---|---|---|
| `get_wallet_balance` | data | ⚪ No-risk | — |
| `transfer_funds` | data, funds | 🟢 Covered | `finance_funds_to_unverified_destination`, `finance_high_value_unverified_transfer`, `unauthorized_transfer` |
| `sign_and_broadcast_transaction` | data, onchain | 🔴 Uncovered | — |
| `execute_swap_on_dex` | data, execution, onchain | 🔴 Uncovered | `shell_injection` |
| `deploy_smart_contract` | onchain | 🔴 Uncovered | — |
| `place_market_order` | market | 🔴 Uncovered | — |
| `export_trade_history` | data, external, funds | 🟢 Covered | `customer_pii_external`, `delegated_external_egress`, `finance_funds_to_unverified_destination` |
| `read_price_feed` | data | ⚪ No-risk | — |
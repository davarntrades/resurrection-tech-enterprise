---
title: "Morrison Runtime Governance — Ω Exposure Assessment"
subtitle: "Autonomous DeFi / Trading Agent · Confidential"
date: "2026-06-10T01:44:33Z"
geometry: margin=1in
---
# Executive Summary

**Autonomous DeFi / Trading Agent — agent governance assessment**

- **Tools assessed:** 8 (6 carry governed-risk capabilities).
- **Ω coverage:** ~33% of risky tools (2 covered, 0 partial, 4 uncovered).
- **Highest-risk trajectories (verified BLOCK before execution):** 4 — e.g. transfer_funds (funds) exercised adversarially → `finance`.
- **Top uncovered areas:** sign_and_broadcast_transaction, execute_swap_on_dex, deploy_smart_contract, place_market_order.
- **Recommended pilot:** govern the digital_assets agent with the live Ω registry, onboarding 4 gap rule(s).
- **Estimated time-to-value:** 1–2 weeks — core coverage live; gaps onboarded as new Ω (under a day each).


> Of your 8 tools, 2 map to governed Ω domains today, 4 require bespoke Ω extensions, and 4 high-risk trajectories would be blocked before execution.

\newpage

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

\newpage

# Gap Analysis

4 uncovered tool(s), 0 partially covered.

## Uncovered (4)
- `sign_and_broadcast_transaction` — Irreversible On-Chain Action [UNCOVERED]
- `execute_swap_on_dex` — Arbitrary Code Execution [COVERED], Irreversible On-Chain Action [UNCOVERED]
- `deploy_smart_contract` — Irreversible On-Chain Action [UNCOVERED]
- `place_market_order` — Autonomous Market Action [UNCOVERED]

## Partially covered (0)
- none

## Recommended Ω extension

Onboard a `digital_assets` Ω registry covering: Autonomous Market Action, Irreversible On-Chain Action.

```bash
python .claude/skills/onboard-sector/scripts/onboard_sector.py digital_assets --spec assessment/onboard-spec-digital_assets.json
```

\newpage

# Pilot Scope

**Objective:** govern Autonomous DeFi / Trading Agent's agent — block its reachable forbidden states before execution.

**Success criteria:** 0 FP / 0 FN on the pilot corpus; sub-millisecond evaluation; every verdict attested + replayable.

**Required integrations:** governance middleware in front of `transfer_funds`, `sign_and_broadcast_transaction`, `execute_swap_on_dex`, `deploy_smart_contract`, `place_market_order`, `export_trade_history`.

**Protected assets / risk reduction:** 2 tools covered today; 4 gap(s) closed by a `digital_assets` Ω registry.

**Evaluation plan:** load pilot Ω → run corpus (0 FP/FN) → replay sample verdicts → benchmark latency → `generate-audit-pack`.

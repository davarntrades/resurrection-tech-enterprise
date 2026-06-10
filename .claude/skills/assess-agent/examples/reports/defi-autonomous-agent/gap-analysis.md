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
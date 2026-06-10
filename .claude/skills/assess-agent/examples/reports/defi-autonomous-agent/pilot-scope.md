# Pilot Scope

**Objective:** govern Autonomous DeFi / Trading Agent's agent — block its reachable forbidden states before execution.

**Success criteria:** 0 FP / 0 FN on the pilot corpus; sub-millisecond evaluation; every verdict attested + replayable.

**Required integrations:** governance middleware in front of `transfer_funds`, `sign_and_broadcast_transaction`, `execute_swap_on_dex`, `deploy_smart_contract`, `place_market_order`, `export_trade_history`.

**Protected assets / risk reduction:** 2 tools covered today; 4 gap(s) closed by a `digital_assets` Ω registry.

**Evaluation plan:** load pilot Ω → run corpus (0 FP/FN) → replay sample verdicts → benchmark latency → `generate-audit-pack`.
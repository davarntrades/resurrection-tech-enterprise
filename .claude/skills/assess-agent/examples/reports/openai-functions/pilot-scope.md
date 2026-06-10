# Pilot Scope

**Objective:** govern Finance Agent's agent — block its reachable forbidden states before execution.

**Success criteria:** 0 FP / 0 FN on the pilot corpus; sub-millisecond evaluation; every verdict attested + replayable.

**Required integrations:** governance middleware in front of `transfer_funds`, `send_wire_payment`, `export_customer_records`, `approve_transaction`.

**Protected assets / risk reduction:** 4 tools covered today; 0 gap(s) closed by a `finance` Ω registry.

**Evaluation plan:** load pilot Ω → run corpus (0 FP/FN) → replay sample verdicts → benchmark latency → `generate-audit-pack`.
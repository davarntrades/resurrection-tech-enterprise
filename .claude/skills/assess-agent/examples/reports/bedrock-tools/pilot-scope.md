# Pilot Scope

**Objective:** govern Multi-Agent Coordinator's agent — block its reachable forbidden states before execution.

**Success criteria:** 0 FP / 0 FN on the pilot corpus; sub-millisecond evaluation; every verdict attested + replayable.

**Required integrations:** governance middleware in front of `dispatch_subagent`, `route_to_finance_agent`, `grant_agent_permission`, `publish_run_summary`.

**Protected assets / risk reduction:** 4 tools covered today; 0 gap(s) closed by a `finance` Ω registry.

**Evaluation plan:** load pilot Ω → run corpus (0 FP/FN) → replay sample verdicts → benchmark latency → `generate-audit-pack`.
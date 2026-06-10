# Pilot Scope

**Objective:** govern SOC / Security-Ops Agent's agent — block its reachable forbidden states before execution.

**Success criteria:** 0 FP / 0 FN on the pilot corpus; sub-millisecond evaluation; every verdict attested + replayable.

**Required integrations:** governance middleware in front of `run_shell_command`, `isolate_host`, `grant_iam_role`, `disable_audit_logging`, `post_threat_intel`.

**Protected assets / risk reduction:** 5 tools covered today; 0 gap(s) closed by a `cybersecurity` Ω registry.

**Evaluation plan:** load pilot Ω → run corpus (0 FP/FN) → replay sample verdicts → benchmark latency → `generate-audit-pack`.
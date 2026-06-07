---
name: threat-model-omega-mapping
description: >
  Front of the Runtime Governance commercial pipeline. Given a prospect's
  environment (organization, industry, agent architecture, tool inventory,
  critical assets, threat model, regulatory requirements, existing controls), it
  maps each threat to the REAL Ω rules already loaded in the engine + deployment,
  produces an Ω Coverage Matrix, a gap analysis (covered / partial / uncovered
  with reasons), recommended Ω extensions as onboard-ready specs, a customer
  pilot scope, and a board-level executive summary. Answers "what would Runtime
  Governance actually protect in our environment?" in minutes, and hands off to
  /onboard-sector and /generate-audit-pack. Trigger phrases: "threat model to
  omega", "coverage matrix", "what would governance protect", "pilot scope",
  "/threat-model".
---

# threat-model-omega-mapping

Turns a prospect threat model into governed Ω, a coverage matrix, a gap
analysis, and a pilot scope — without manual consulting. It maps threats only to
rules that are **actually loaded** in the live catalog (engine defaults +
deployment rules), so it never claims coverage that doesn't exist.

## Pipeline position
```
Prospect → threat-model-omega-mapping → Pilot Scope → /onboard-sector → /generate-audit-pack → Enterprise deployment
```

## How to run
```bash
python .claude/skills/threat-model-omega-mapping/scripts/threat_model_omega.py --spec examples/healthcare-ai-agent.json
# or inline:
python .claude/skills/threat-model-omega-mapping/scripts/threat_model_omega.py \
  --org "Acme Bank" --industry finance \
  --tools transfer,send_payment,http_request,update_role \
  --assets "Customer funds,PII" --regs "FCA,GDPR" \
  --threats "unauthorized transfer,PII export,privilege escalation,prompt injection,cross-agent collusion"
#   --out DIR        output dir (default: ./threat-model)
#   --engine PATH    Morrison-Runtime-Governance checkout (auto-resolved otherwise)
```
Spec files may be JSON, or YAML if PyYAML is available. See `templates/` and `examples/`.

## Inputs
`organization, industry, agent_architecture, tool_inventory, critical_assets,
threat_model, regulatory_requirements, existing_controls`. Threats may be plain
strings or `{ "name": ..., "severity": "high|medium|low" }`.

## Outputs (`./threat-model/`)
1. `omega-coverage-matrix.md` — threat → Ω rule(s), with status.
2. `gap-analysis.md` — covered / partially covered / uncovered, with reasons.
3. `recommended-omega-extensions.md` + `onboard-spec-<industry>.json` — onboard-ready.
4. `pilot-scope.md` — objectives, success criteria, integrations, protected assets, expected risk reduction, evaluation plan.
5. `executive-summary.md` — board-level: coverage %, critical gaps, highest-risk trajectories, recommended pilot, time-to-value.
6. `threat-model-report.md` — all of the above combined.
7. `threat-mapping.json` — machine-readable mapping + handoff metadata.

## Hand-off (printed at the end)
- Cover the gaps: `python .claude/skills/onboard-sector/scripts/onboard_sector.py <industry> --spec threat-model/onboard-spec-<industry>.json`
- Produce evidence for the pilot: `python .claude/skills/generate-audit-pack/scripts/generate_audit_pack.py --customer "<org>"`

## Reuses (no duplicate governance logic)
The live Ω catalog via `replay._layer` + `DEPLOYMENT_RULES` + `sector_rules`,
the `verify-production` engine resolver, and the `onboard-sector` spec format.

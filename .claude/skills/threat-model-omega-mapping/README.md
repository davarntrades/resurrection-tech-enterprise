# threat-model-omega-mapping

The **front of the Runtime Governance commercial pipeline**. A prospect provides
their environment; in minutes you return what Runtime Governance would actually
protect — mapped to the **real** Ω rules already loaded (engine defaults +
deployment rules), never fabricated coverage.

```
Prospect → threat-model-omega-mapping → Pilot Scope → /onboard-sector → /generate-audit-pack → Enterprise deployment
```

## Run
```bash
# from a spec file (JSON, or YAML if PyYAML is present)
python scripts/threat_model_omega.py --spec examples/financial-copilot.json

# or inline
python scripts/threat_model_omega.py --org "Acme Bank" --industry finance \
  --tools transfer,send_payment,http_request --assets "Customer funds,PII" \
  --regs "FCA,GDPR" --threats "unauthorized transfer,PII export,prompt injection,cross-agent collusion"
```

## What it produces (`./threat-model/`)
- **Ω Coverage Matrix** — threat → loaded Ω rule(s), with 🟢/🟡/🔴 status.
- **Gap Analysis** — covered / partially covered / uncovered, with reasons.
- **Recommended Ω Extensions** — `onboard-spec-<industry>.json` ready for `/onboard-sector`.
- **Pilot Scope** — objectives, success criteria, integrations, protected assets, expected risk reduction, evaluation plan.
- **Executive Summary** — coverage %, critical gaps, highest-risk trajectories, recommended pilot, time-to-value (non-technical).
- **threat-mapping.json** — machine-readable mapping + hand-off commands.

## How mapping works
1. A curated threat→Ω ontology resolves common attack classes to rule-name
   substrings; only substrings that **exist in the live catalog** are reported.
2. A token-overlap fallback matches anything outside the ontology against rule
   names + descriptions.
3. Classification: **Covered** (a domain-specific Ω matches) · **Partial**
   (only the reusable cross-domain patterns, or governed indirectly — e.g.
   prompt injection) · **Uncovered** (→ recommend an Ω extension).

> Mappings are a fast, transparent scoping aid — confirm domain-specific edge
> cases during the pilot. The skill never claims a rule that isn't loaded.

## Inputs
`organization, industry, agent_architecture, tool_inventory, critical_assets,
threat_model, regulatory_requirements, existing_controls`. Threats may be strings
or `{ "name", "severity" }`. See `templates/` and `examples/` (healthcare AI
agent, financial copilot, SOC agent).

## Reuses
Live Ω catalog via `replay._layer` + `DEPLOYMENT_RULES` + `sector_rules`; the
`verify-production` engine resolver; the `onboard-sector` spec format. No
duplicate governance logic.

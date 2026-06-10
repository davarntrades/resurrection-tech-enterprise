---
name: assess-agent
description: >
  Day-1 Runtime Governance assessment — the primary front door of the commercial
  pipeline. A prospect uploads a tool manifest (OpenAI function-calling schema,
  MCP tool list, LangChain registry, Bedrock tool definitions, generic JSON, CSV,
  or Markdown) and receives an Ω Exposure Map, Ω Coverage Matrix, Gap Analysis,
  Pilot Scope, and Executive Summary in minutes — with ZERO middleware
  integration. It infers each tool's capabilities (privilege, external access,
  data access, execution, delegation), maps them ONLY to the live Ω catalog
  (engine defaults + deployment rules — never fabricated), and grounds the
  "would-be-blocked" claim by running synthesized adversarial trajectories
  through the real engine. Optional trace mode replays the prospect's own
  tool-call logs. Trigger phrases: "assess agent", "Ω exposure", "what would you
  govern", "upload tool manifest", "/assess-agent".
---

# assess-agent

Upload a tool manifest → get a governance assessment in minutes, no integration.
It reuses the live Ω catalog and the engine; it never invents coverage and
fails closed when a tool's risk is uncertain.

## Run
```bash
python .claude/skills/assess-agent/scripts/assess_agent.py --manifest examples/openai-functions.json
#   --org NAME            stamp the report
#   --traces FILE         optional: replay real tool-call traces through the engine
#   --out DIR             output dir (default: ./assessment)
#   --engine PATH         Morrison-Runtime-Governance checkout (auto-resolved otherwise)
```

## Accepts (auto-detected)
OpenAI function-calling schemas · MCP tool manifests · LangChain registries ·
Bedrock tool definitions · generic JSON tool lists · CSV · Markdown.

## Extracts per tool
name · description · inputs · inferred capabilities: **privilege · external
access · data access · execution · delegation · funds · mutation**, plus
AI-native / physical classes the live catalog does **not** yet govern —
**on-chain · physical actuation · model integrity · resource/cost · autonomous
market · synthetic identity** — which surface as genuine gaps.

## Maps to the live Ω catalog (no synthetic rules)
Capabilities → risk classes → the **actual** Ω rules that would govern them.
Coverage is **fail-closed**: a single ungoverned dangerous capability marks the
tool a gap; uncertain risk is never reported as covered.

## Outputs (`./assessment/`)
- `omega-exposure-report.md` — reachable forbidden states + per-tool coverage.
- `coverage-matrix.json` — machine-readable per-tool mapping.
- `gap-analysis.md` — uncovered/partial tools + recommended Ω extensions (onboard-ready).
- `pilot-scope.md` — objectives, success criteria, integrations, risk reduction, plan.
- `executive-summary.md` — coverage %, highest-risk trajectories, top gaps, pilot, time-to-value.
- `assessment-report.pdf.md` — branded, Pandoc/PDF-ready leave-behind (all sections).
- `onboard-spec-<industry>.json` — feeds `/onboard-sector`.

## Trace mode (optional)
With `--traces`, it replays the prospect's trajectories through the engine and
reports: evaluated · blocked · allowed · Ω domains triggered · highest-risk
trajectories · observed latency (reuses `replay.py`).

## Commercial output
> "Of your 23 tools, 18 map to governed Ω domains today, 3 require bespoke Ω
> extensions, and 4 high-risk trajectories would be blocked before execution."

## Reuses (no duplicate governance logic)
`threat-model-omega-mapping` (catalog + threat→Ω mapping), `replay.py`
(grounding + trace mode), `sector_rules` + `DEPLOYMENT_RULES` (the live catalog),
and the `verify-production` engine resolver. Hands off to `/onboard-sector` and
`/generate-audit-pack`.

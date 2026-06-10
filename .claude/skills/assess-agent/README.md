# assess-agent — Day-1 Ω Exposure Assessment

The **front door** of the Morrison Runtime Governance commercial pipeline. A
prospect uploads the tool manifest their agent already uses; in minutes they get
a governance assessment grounded in the **live Ω catalog and the real engine** —
no middleware, no integration, no code changes.

```bash
python .claude/skills/assess-agent/scripts/assess_agent.py \
  --manifest .claude/skills/assess-agent/examples/openai-functions.json \
  --org "Acme Bank" --out ./assessment
# optional:  --traces traces.json   (replay the prospect's own tool-call logs)
#            --engine /path/to/Morrison-Runtime-Governance
```

## What it does

1. **Parses** the manifest (OpenAI functions · MCP · LangChain · Bedrock ·
   generic JSON · CSV · Markdown — auto-detected).
2. **Infers** each tool's capabilities — privilege · external access · data
   access · execution · delegation · funds movement · mutation.
3. **Maps** capabilities → risk classes → the **actual Ω rules** that govern
   them, using the same catalog + mapping as `threat-model-omega-mapping`.
   Coverage is **fail-closed**: a tool with any ungoverned dangerous capability
   is a gap; uncertain risk is never reported as covered; rules are never
   invented.
4. **Grounds** the "would-be-blocked" claim by exercising each capability class
   through the engine's own recognised adversarial vocabulary and recording the
   real `BLOCK` verdict, Ω domain, and trajectory hash (via `replay.py`).
5. **Writes** five artifacts + an onboarding spec to `./assessment/`.

## Outputs

| File | Contents |
|---|---|
| `omega-exposure-report.md` | Reachable forbidden states + per-tool Ω coverage |
| `coverage-matrix.json` | Machine-readable per-tool mapping + grounded blocks |
| `gap-analysis.md` | Uncovered/partial tools + recommended Ω extension (onboard-ready) |
| `pilot-scope.md` | Objectives, success criteria, integrations, plan |
| `executive-summary.md` | Coverage %, top risks, pilot, time-to-value, commercial line |
| `onboard-spec-<industry>.json` | Feeds `/onboard-sector` |

## Trace mode

`--traces FILE` replays the prospect's real trajectories through the engine and
reports evaluated · blocked · allowed · Ω domains triggered · highest-risk
trajectories · observed latency.

## Examples (the four reference agents)

| Manifest | Format | Agent |
|---|---|---|
| `examples/openai-functions.json` | OpenAI functions | Finance Agent |
| `examples/mcp-tools.json` | MCP | SOC / Security-Ops Agent |
| `examples/langchain-tools.json` | LangChain | Healthcare Agent |
| `examples/bedrock-tools.json` | Bedrock | Multi-Agent Coordinator |
| `examples/defi-autonomous-agent.json` | generic JSON | Autonomous DeFi / Trading Agent — **shows real gaps** (on-chain + market) → `/onboard-sector` |
| `examples/sample-traces.json` | trace log | `--traces` demo |

The first four agents fall inside the covered catalog (100%); the DeFi agent
carries on-chain / autonomous-market capabilities the catalog does not yet
govern, so it surfaces genuine `UNCOVERED` gaps and an onboard-ready spec —
demonstrating the fail-closed path end to end.

## Reuse (no duplicated governance logic)

`threat-model-omega-mapping` (catalog + threat→Ω mapping) · `replay.py`
(grounding + trace mode) · `finance/coverage/domain/sector_rules` (the live
catalog) · `verify-production` (engine resolver). Hands off to `/onboard-sector`
(close gaps) and `/generate-audit-pack` (evidence).

# Runtime Governance Skills

Claude Code [Agent Skills](https://code.claude.com/docs) for building and
commercialising Morrison Runtime Governance. Each is a self-contained, portable
Skill (a `SKILL.md` + scripts) that **reuses the real repo assets** — the
`morrison_governance` engine, `test_corpus.py`, `replay.py`, `benchmark.py`,
`public/benchmarks/latency.json`, `tests/corpus.json`, and `sector_rules.py` — so
nothing here is a placeholder.

| Skill | Command | Does | Outputs |
|---|---|---|---|
| **threat-model-omega-mapping** | `/threat-model` | Map a prospect threat model to the live Ω catalog → coverage matrix, gap analysis, recommended Ω extensions, pilot scope, exec summary | `threat-model/…` + `onboard-spec-<industry>.json` |
| **verify-production** | `/verify-production` | Source-side deploy verification + attestation: artefacts exist, JSON integrity, tables↔source, latency↔measured, replay determinism + tamper, audit-chain, deployment metadata | `attestation/verify-production-report.{md,json}` |
| **generate-audit-pack** | `/generate-audit-pack` | Customer-ready due-diligence pack from live assets (benchmark, validation corpus, replay, audit trail, coverage, attestation) | `audit-pack/audit-pack.md`, `.pdf.md`, `evidence-manifest.json` |
| **onboard-sector** | `/onboard-sector <name>` | Scaffold a new governed Ω domain (Ω defs, rule skeletons, corpus, benchmark, docs, deployment checklist) | `governance-service/sectors_scaffold/<name>/…` |
| **ship-to-green** | `/ship-to-green` | Orchestrate a change idea→validated→benchmarked→evidenced→ready (fail-closed) + Release Readiness Score; post-merge verify + attest | `ship/…` + `deployment-attestation.{md,json}` |

## Commercial pipeline
```
Prospect
  → threat-model-omega-mapping   (what would we protect? coverage + gaps + pilot scope)
  → onboard-sector               (close the gaps: new Ω registry)
  → generate-audit-pack          (evidence pack for the pilot / due diligence)
  → verify-production            (attest every deploy; nightly guard)
  → Enterprise deployment

Every change above ships via ship-to-green (validate → benchmark → evidence → PR → verify → attest, fail-closed).
```

## File tree
```
.claude/skills/
├── README.md
├── threat-model-omega-mapping/
│   ├── SKILL.md · README.md
│   ├── scripts/threat_model_omega.py
│   ├── templates/spec.template.{json,yaml}
│   └── examples/{healthcare-ai-agent,financial-copilot,soc-agent}.json
├── verify-production/
│   ├── SKILL.md
│   └── scripts/verify_production.py
├── generate-audit-pack/
│   ├── SKILL.md
│   └── scripts/generate_audit_pack.py
├── onboard-sector/
│   ├── SKILL.md
│   └── scripts/onboard_sector.py
└── ship-to-green/
    ├── SKILL.md · README.md
    ├── scripts/ship_to_green.py
    ├── templates/change.template.json
    └── examples/{add-healthcare-omega-rule,update-homepage-copy}.json
```

## Engine resolution
The scripts find the `morrison_governance` engine automatically:
local import → `$MORRISON_ENGINE` → sibling `../Morrison-Runtime-Governance`
→ clone at the Dockerfile `ENGINE_REF`. Engine-dependent checks degrade to
**SKIP** (never silently pass) when no engine is reachable, and `generate-audit-pack`
reuses `verify-production`'s core.

## Quick start
```bash
python .claude/skills/verify-production/scripts/verify_production.py
python .claude/skills/generate-audit-pack/scripts/generate_audit_pack.py --customer "ACME"
python .claude/skills/onboard-sector/scripts/onboard_sector.py biometrics --tools enroll_template,match_face
```
Generated outputs (`attestation/`, `audit-pack/`, `sectors_scaffold/`) are
git-ignored — they're runtime artefacts.

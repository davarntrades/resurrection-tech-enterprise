# Runtime Governance Skills

Claude Code [Agent Skills](https://code.claude.com/docs) for building and
commercialising Morrison Runtime Governance. Each is a self-contained, portable
Skill (a `SKILL.md` + scripts) that **reuses the real repo assets** — the
`morrison_governance` engine, `test_corpus.py`, `replay.py`, `benchmark.py`,
`public/benchmarks/latency.json`, `tests/corpus.json`, and `sector_rules.py` — so
nothing here is a placeholder.

| Skill | Command | Does | Outputs |
|---|---|---|---|
| **verify-production** | `/verify-production` | Source-side deploy verification + attestation: artefacts exist, JSON integrity, tables↔source, latency↔measured, replay determinism + tamper, audit-chain, deployment metadata | `attestation/verify-production-report.{md,json}` |
| **generate-audit-pack** | `/generate-audit-pack` | Customer-ready due-diligence pack from live assets (benchmark, validation corpus, replay, audit trail, coverage, attestation) | `audit-pack/audit-pack.md`, `.pdf.md`, `evidence-manifest.json` |
| **onboard-sector** | `/onboard-sector <name>` | Scaffold a new governed Ω domain (Ω defs, rule skeletons, corpus, benchmark, docs, deployment checklist) | `governance-service/sectors_scaffold/<name>/…` |

## File tree
```
.claude/skills/
├── README.md
├── verify-production/
│   ├── SKILL.md
│   └── scripts/verify_production.py
├── generate-audit-pack/
│   ├── SKILL.md
│   └── scripts/generate_audit_pack.py
└── onboard-sector/
    ├── SKILL.md
    └── scripts/onboard_sector.py
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

---
name: generate-audit-pack
description: >
  Generate a customer-ready enterprise due-diligence / audit evidence pack for
  Morrison Runtime Governance from live repo assets — benchmark data, validation
  corpus results, replay (determinism + tamper) proof, a tamper-evident audit
  trail, governance coverage, and a versioned attestation. Produces an Executive
  Summary, Governance Architecture, Benchmark, Latency, Validation, Replay
  Verification, and Audit Trail sections plus an Appendix, exported as Markdown,
  PDF-ready Markdown, and a JSON evidence manifest. Use for security reviews,
  technical due diligence, investor data rooms, or insurer/actuarial evidence.
  Trigger phrases: "generate audit pack", "due diligence pack", "evidence pack",
  "/generate-audit-pack".
---

# generate-audit-pack

Composes the artefacts you already produce into one dated, reproducible,
third-party-verifiable evidence pack. It does not invent numbers — every figure
is read or computed from the repo + the pinned engine.

## When to use
- An enterprise security/audit review or technical due-diligence request.
- Building an investor data room or an insurer/actuarial evidence file.
- Any time you need "here is the proof, and here is how to reproduce it."

## How to run
```bash
python .claude/skills/generate-audit-pack/scripts/generate_audit_pack.py
#   --out DIR        output directory (default: ./audit-pack)
#   --customer NAME  stamp the pack for a named recipient
#   --engine PATH    Morrison-Runtime-Governance checkout (auto-resolved otherwise)
```

## Inputs (auto-collected)
- **Benchmark data** — `public/benchmarks/latency.json`.
- **Evaluation results** — labelled corpus via `governance-service/test_corpus.py`.
- **Replay results** — determinism + tamper-detection via `replay.py`.
- **Audit logs** — a SHA-256 hash-chained sample trail (mirrors the site export).
- **Governance coverage** — rules per Ω domain + live sectors + deployment rules.
- **Validation corpus** — `governance-service/tests/corpus.json`.

## Outputs (`./audit-pack/`)
- `audit-pack.md` — the full pack.
- `audit-pack.pdf.md` — PDF-ready (title page + section breaks; render with the
  `pdf` skill or pandoc).
- `evidence-manifest.json` — artefact list with SHA-256 of each source file plus
  the attestation (engine ref/commit, `ruleset_hash`, corpus precision/recall,
  latency p50/p95, audit-chain head hash, UTC timestamp).

## Sections
Executive Summary · Governance Architecture Summary · Benchmark Summary ·
Latency Summary · Validation Summary · Replay Verification Summary · Audit Trail
Summary · Appendix.

## Reuses
`verify-production` (verification core), `test_corpus.py`, `replay.py`,
`latency.json`, `corpus.json`, `sector_rules.py`, and the `morrison_governance`
engine.

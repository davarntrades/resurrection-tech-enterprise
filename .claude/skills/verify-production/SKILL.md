---
name: verify-production
description: >
  Single-command production verification + attestation for Morrison Runtime
  Governance. Verifies benchmark artefacts exist and are internally consistent,
  replay determinism + tamper-detection, benchmark JSON integrity, that the
  benchmark tables and Latency Summary on the site match the measured source
  data, audit-trail (hash-chain) generation, and deployment metadata — then
  emits an attestation report (Markdown + JSON). Use when preparing or
  validating a deployment, before a demo, or when an auditor asks you to prove
  the running engine matches the pinned commit. Trigger phrases: "verify
  production", "run attestation", "/verify-production", "is the deploy correct".
---

# verify-production

Turns deployment verification into one command. It runs a battery of
source-side checks against the real Runtime Governance assets in this repo and
the pinned engine, then writes a dated, reproducible **attestation report**.

## When to use
- Before/after a deploy, or before an enterprise demo.
- When someone asks "prove the live engine = the pinned commit / the numbers on
  the site are the measured numbers."
- As a pre-PR gate for changes to `governance-service/` or the benchmark assets.

## How to run
```bash
python .claude/skills/verify-production/scripts/verify_production.py
# options:
#   --out DIR        where to write the report (default: ./attestation)
#   --engine PATH    path to a Morrison-Runtime-Governance checkout
#                    (else: $MORRISON_ENGINE, a sibling clone, or clone the pinned ref)
#   --json           print the JSON result to stdout
```
The script resolves the engine automatically (local import → `$MORRISON_ENGINE`
→ sibling `../Morrison-Runtime-Governance` → clone at the Dockerfile
`ENGINE_REF`). Engine-dependent checks degrade to **SKIP** (never silently pass)
if no engine is reachable.

## What it checks
1. **Benchmark artefacts exist** — `public/benchmarks/latency.json` + the report `.md`.
2. **Benchmark JSON integrity** — schema, every class has `p50/p95/p99/avg`, `config.rules_loaded`, environment.
3. **Benchmark tables match source** — the Enterprise Readiness page renders the table from `latency.json` (no hard-coded latency numbers).
4. **Latency Summary matches measured** — the "~0.1 ms / ~0.4 ms" copy is consistent with the measured class averages/percentiles in `latency.json`.
5. **Replay determinism + tamper-detection** — re-derives sample traces bit-identically and confirms a tampered verdict is caught (reuses `replay.py`).
6. **Audit-trail generation** — builds a SHA-256 hash chain over sample verdict records and self-verifies it (mirrors the site's tamper-evident export).
7. **Deployment metadata** — Dockerfile `ENGINE_REF`, repo `git HEAD`, and the live `ruleset_hash` from the engine.

## Output
`attestation/verify-production-report.md` and `.json`, containing: overall
status, passed / failed / skipped checks, deployment commit, engine ref,
`ruleset_hash`, and a UTC timestamp.

## Reuses (no placeholders)
`governance-service/test_corpus.py`, `replay.py`, `benchmark.py`,
`public/benchmarks/latency.json`, `app/enterprise/page.tsx`, and the
`morrison_governance` engine.

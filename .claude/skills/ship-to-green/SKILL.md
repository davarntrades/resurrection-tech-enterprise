---
name: ship-to-green
description: >
  Velocity multiplier + release gate for Morrison Runtime Governance. Drives a
  proposed change (feature, bug fix, Ω extension, corpus/benchmark update,
  website change, skill update) through Plan → Validate → Benchmark → Evidence →
  PR → (merge) → Verify → Attest, fail-closed: it refuses to mark a change
  ready unless validation passes and benchmarks haven't regressed. Orchestrates
  the existing skills (verify-production, generate-audit-pack, onboard-sector,
  threat-model-omega-mapping) rather than duplicating them, generates a PR body
  and per-stage evidence, and emits a single executive Release Readiness Score.
  Trigger phrases: "ship this", "ship to green", "release readiness", "is this
  ready to merge", "/ship-to-green".
---

# ship-to-green

One invocation takes a change from **idea → validated → benchmarked → evidenced →
ready-to-merge**, then (post-merge) → **verified → attested**. Fail-closed: no
"ready" verdict unless validation passes and benchmarks haven't regressed.

## Two phases
```bash
# Pre-merge: analyse → validate → benchmark → evidence → PR body → readiness score
python .claude/skills/ship-to-green/scripts/ship_to_green.py prepare \
  --change "Add biometrics Ω rule" --area governance --risk medium
#   --spec change.json            structured input (see templates/)
#   --base origin/main            diff base
#   --benchmark / --no-benchmark  force benchmark stage
#   exit 0 only if READY (fail-closed)

# Post-merge: deployment verification + attestation
python .claude/skills/ship-to-green/scripts/ship_to_green.py attest --commit <sha>
```

## Pipeline (prepare)
1. **Change analysis** — files / tests / benchmarks / skills / deployment / commercial impact → `change-summary.md`.
2. **Validation** — corpus, replay, governance hardening, and the 4 skills' smoke tests. **Fail-closed.** → `validation-report.md`.
3. **Benchmark** — in-process latency measure vs the committed baseline → Improved / Unchanged / Regressed → `benchmark-report.md`.
4. **Evidence** — the reports above + `deployment-readiness.md`.
5. **PR body** — Executive Summary, Technical Summary, Risk Assessment, Validation, Benchmark, Deployment Notes, Rollback Notes → `PR_BODY.md`.

## Pipeline (attest, post-merge)
6. **Deployment verification** — runs `verify-production`; checks site/benchmarks/demo/skills/evidence.
7. **Attestation** — `deployment-attestation.{md,json}` (commit, timestamp, validation, benchmark, verification).

## Release Readiness Score
```
Validation        100%
Benchmarks        Unchanged
Coverage          100%   (corpus precision/recall)
Deployment Risk   Low
Readiness Score   97/100   ✅ READY
```

## Inputs
`change_description, target_area (governance|website|skills|corpus|benchmark|ci|
mixed), risk_level, requires_benchmark, requires_corpus, requires_deployment` —
via `--spec` (JSON) or flags. Most are auto-detected from the diff.

## Orchestrates (no duplicate logic)
`verify-production` (verify + attest), `generate-audit-pack` (evidence),
`onboard-sector`, `threat-model-omega-mapping` (smoke + availability), plus the
governance test suites and `benchmark.py`.

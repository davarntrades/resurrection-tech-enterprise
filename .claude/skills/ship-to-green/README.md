# ship-to-green

The velocity multiplier + release gate. One invocation drives a change from
**idea → validated → benchmarked → evidenced → ready-to-merge**, then (post-merge)
→ **verified → attested** — fail-closed, with a single executive **Release
Readiness Score**. It orchestrates the other four skills; it adds no governance
logic of its own.

```
Idea → ship-to-green prepare → (PR + merge on green) → ship-to-green attest → Deployed + Attested
```

## Run
```bash
# pre-merge (exit 0 only if READY)
python scripts/ship_to_green.py prepare --change "Add biometrics Ω rule" --area governance --risk medium
python scripts/ship_to_green.py prepare --spec examples/add-healthcare-omega-rule.json

# post-merge
python scripts/ship_to_green.py attest --commit <merge-sha>
```

## What it does
| Stage | Output |
|---|---|
| 1 Change analysis (diff-driven: files/tests/benchmarks/skills/deploy/commercial) | `ship/change-summary.md` |
| 2 Validation — corpus, replay, governance hardening, 4 skill smoke tests (**fail-closed**) | `ship/validation-report.md` |
| 3 Benchmark — in-process latency vs baseline → Improved/Unchanged/Regressed | `ship/benchmark-report.md` |
| 4 Evidence + readiness | `ship/deployment-readiness.md` |
| 5 PR body (exec/technical/risk/validation/benchmark/deploy/rollback) | `ship/PR_BODY.md` |
| 6–7 (attest) verify-production + attestation | `ship/deployment-attestation.{md,json}` |

## Release Readiness Score
```
Validation        100%
Benchmarks        Unchanged
Coverage          100%
Deployment Risk   Low
Readiness Score   100/100   ✅ READY
```
**Gate (fail-closed):** READY only if no validation suite failed **and** benchmarks
did not regress. Otherwise exit 1 — do not merge.

## Inputs
`change_description, target_area, risk_level, requires_benchmark, requires_corpus,
requires_deployment` via `--spec` or flags. Most are auto-detected from the diff —
validation runs the suites the *actual changed files* warrant, not just the label.

## Orchestrates (no duplication)
`verify-production`, `generate-audit-pack`, `onboard-sector`,
`threat-model-omega-mapping`, the governance test suites, and `benchmark.py`.

# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-06-22 12:18:23Z

## Environment

- Python: 3.12.13
- Platform: Linux-6.17.0-1018-azure-x86_64-with-glibc2.39
- Processor: x86_64
- Logical CPUs: 4
- Single-threaded, measured on this CI/build environment. Representative figures, not a production-hardware guarantee.

Configuration: horizon 3, 34 Ω rules across 9 domains; 5000 iterations per class after 500 warm-up calls; single-threaded.

## Latency by evaluation class

| Class | Steps | p50 (ms) | p95 (ms) | p99 (ms) | avg (ms) | throughput (eval/s) |
|---|---|---|---|---|---|---|
| Single-step | 1 | 0.0586 | 0.0689 | 0.0731 | 0.0597 | 16750 |
| Short (2) | 2 | 0.0744 | 0.0853 | 0.1132 | 0.0763 | 13106 |
| Medium (4) | 4 | 0.1386 | 0.1506 | 0.1657 | 0.1408 | 7102 |
| Long (8) | 8 | 0.2655 | 0.2796 | 0.3347 | 0.2696 | 3709 |
| Very long (16) | 16 | 0.5348 | 0.5519 | 0.6066 | 0.5362 | 1865 |
| Multi-agent (joint) | 3 | 0.1074 | 0.1178 | 0.1269 | 0.1091 | 9166 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.0591 |
| 2 | 0.0763 |
| 4 | 0.1413 |
| 8 | 0.2825 |
| 16 | 0.5348 |
| 32 | 1.0832 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 13 | 0.108 | 0.117 |
| 3 | 17 | 0.1189 | 0.1279 |
| 6 | 25 | 0.1307 | 0.1398 |
| 9 | 34 | 0.1391 | 0.1482 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-07-13 09:39:46Z

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
| Single-step | 1 | 0.0577 | 0.0675 | 0.0923 | 0.0591 | 16920 |
| Short (2) | 2 | 0.075 | 0.0847 | 0.0903 | 0.0761 | 13141 |
| Medium (4) | 4 | 0.1393 | 0.1536 | 0.2252 | 0.1423 | 7027 |
| Long (8) | 8 | 0.2637 | 0.3078 | 0.4182 | 0.2714 | 3685 |
| Very long (16) | 16 | 0.5305 | 0.5491 | 0.61 | 0.5326 | 1878 |
| Multi-agent (joint) | 3 | 0.1061 | 0.1163 | 0.1326 | 0.1079 | 9268 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.0581 |
| 2 | 0.0757 |
| 4 | 0.1443 |
| 8 | 0.2672 |
| 16 | 0.5288 |
| 32 | 1.096 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 13 | 0.1075 | 0.1161 |
| 3 | 17 | 0.1185 | 0.1273 |
| 6 | 25 | 0.1315 | 0.1405 |
| 9 | 34 | 0.1409 | 0.1497 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

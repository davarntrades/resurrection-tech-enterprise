# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-08-08 12:44:50Z

## Environment

- Python: 3.12.13
- Platform: Linux-6.17.0-1020-azure-x86_64-with-glibc2.39
- Processor: x86_64
- Logical CPUs: 4
- Single-threaded, measured on this CI/build environment. Representative figures, not a production-hardware guarantee.

Configuration: horizon 3, 96 Ω rules across 9 domains; 800 iterations per class after 100 warm-up calls; single-threaded.

## Latency by evaluation class

| Class | Steps | p50 (ms) | p95 (ms) | p99 (ms) | avg (ms) | throughput (eval/s) |
|---|---|---|---|---|---|---|
| Single-step | 1 | 0.3953 | 0.4257 | 0.4603 | 0.3975 | 2516 |
| Short (2) | 2 | 0.968 | 1.0138 | 1.0706 | 0.974 | 1027 |
| Medium (4) | 4 | 3.0624 | 3.149 | 3.2678 | 3.0743 | 325 |
| Long (8) | 8 | 7.1253 | 7.2799 | 7.3801 | 7.1418 | 140 |
| Very long (16) | 16 | 15.1657 | 15.4518 | 16.6814 | 15.2238 | 66 |
| Multi-agent (joint) | 3 | 2.0361 | 2.1148 | 2.1765 | 2.0446 | 489 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.4023 |
| 2 | 0.9982 |
| 4 | 3.0928 |
| 8 | 7.1221 |
| 16 | 15.1554 |
| 32 | 31.2642 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 75 | 2.7391 | 2.8051 |
| 3 | 79 | 2.8335 | 2.9108 |
| 6 | 87 | 2.9301 | 3.0081 |
| 9 | 96 | 3.077 | 3.1438 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

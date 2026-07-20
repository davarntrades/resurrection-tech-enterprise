# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-07-20 09:27:36Z

## Environment

- Python: 3.12.13
- Platform: Linux-6.17.0-1020-azure-x86_64-with-glibc2.39
- Processor: x86_64
- Logical CPUs: 4
- Single-threaded, measured on this CI/build environment. Representative figures, not a production-hardware guarantee.

Configuration: horizon 3, 34 Ω rules across 9 domains; 5000 iterations per class after 500 warm-up calls; single-threaded.

## Latency by evaluation class

| Class | Steps | p50 (ms) | p95 (ms) | p99 (ms) | avg (ms) | throughput (eval/s) |
|---|---|---|---|---|---|---|
| Single-step | 1 | 0.058 | 0.0692 | 0.1008 | 0.0599 | 16694 |
| Short (2) | 2 | 0.0753 | 0.0855 | 0.0896 | 0.0764 | 13089 |
| Medium (4) | 4 | 0.1401 | 0.1518 | 0.1615 | 0.1423 | 7027 |
| Long (8) | 8 | 0.2693 | 0.2839 | 0.3452 | 0.2733 | 3659 |
| Very long (16) | 16 | 0.5322 | 0.5509 | 0.5834 | 0.5336 | 1874 |
| Multi-agent (joint) | 3 | 0.1065 | 0.1175 | 0.1311 | 0.1081 | 9251 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.0588 |
| 2 | 0.0761 |
| 4 | 0.1428 |
| 8 | 0.2703 |
| 16 | 0.5358 |
| 32 | 1.0902 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 13 | 0.1086 | 0.118 |
| 3 | 17 | 0.1203 | 0.1296 |
| 6 | 25 | 0.1323 | 0.1421 |
| 9 | 34 | 0.1408 | 0.1503 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-08-17 07:08:11Z

## Environment

- Python: 3.12.13
- Platform: Linux-6.17.0-1022-azure-x86_64-with-glibc2.39
- Processor: x86_64
- Logical CPUs: 4
- Single-threaded, measured on this CI/build environment. Representative figures, not a production-hardware guarantee.

Configuration: horizon 3, 96 Ω rules across 9 domains; 800 iterations per class after 100 warm-up calls; single-threaded.

## Latency by evaluation class

| Class | Steps | p50 (ms) | p95 (ms) | p99 (ms) | avg (ms) | throughput (eval/s) |
|---|---|---|---|---|---|---|
| Single-step | 1 | 0.4145 | 0.4493 | 0.4907 | 0.4201 | 2380 |
| Short (2) | 2 | 1.0273 | 1.0856 | 1.4698 | 1.0418 | 960 |
| Medium (4) | 4 | 3.2602 | 3.3524 | 3.4214 | 3.2739 | 305 |
| Long (8) | 8 | 7.685 | 7.8353 | 8.1398 | 7.7074 | 130 |
| Very long (16) | 16 | 16.4194 | 16.7107 | 17.3936 | 16.4782 | 61 |
| Multi-agent (joint) | 3 | 2.1626 | 2.2639 | 2.593 | 2.1824 | 458 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.4208 |
| 2 | 1.0261 |
| 4 | 3.2679 |
| 8 | 7.7109 |
| 16 | 16.4669 |
| 32 | 34.0857 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 75 | 2.9379 | 3.0309 |
| 3 | 79 | 3.0271 | 3.0965 |
| 6 | 87 | 3.1575 | 3.2422 |
| 9 | 96 | 3.2885 | 3.3566 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

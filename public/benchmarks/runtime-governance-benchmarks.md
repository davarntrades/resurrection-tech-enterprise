# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-06-05 09:20:20Z

## Environment

- Python: 3.12.13
- Platform: Linux-6.17.0-1015-azure-x86_64-with-glibc2.39
- Processor: x86_64
- Logical CPUs: 4
- Single-threaded, measured on this CI/build environment. Representative figures, not a production-hardware guarantee.

Configuration: horizon 3, 34 Ω rules across 9 domains; 5000 iterations per class after 500 warm-up calls; single-threaded.

## Latency by evaluation class

| Class | Steps | p50 (ms) | p95 (ms) | p99 (ms) | avg (ms) | throughput (eval/s) |
|---|---|---|---|---|---|---|
| Single-step | 1 | 0.0733 | 0.0942 | 0.1022 | 0.0756 | 13228 |
| Short (2) | 2 | 0.092 | 0.1148 | 0.1464 | 0.0954 | 10482 |
| Medium (4) | 4 | 0.1643 | 0.1881 | 0.2078 | 0.1686 | 5931 |
| Long (8) | 8 | 0.3014 | 0.3303 | 0.3653 | 0.3089 | 3237 |
| Very long (16) | 16 | 0.5895 | 0.6083 | 0.6667 | 0.5878 | 1701 |
| Multi-agent (joint) | 3 | 0.1289 | 0.1517 | 0.1714 | 0.1325 | 7547 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.0747 |
| 2 | 0.0942 |
| 4 | 0.1674 |
| 8 | 0.3096 |
| 16 | 0.5923 |
| 32 | 1.1706 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 13 | 0.1288 | 0.1478 |
| 3 | 17 | 0.1426 | 0.1613 |
| 6 | 25 | 0.1549 | 0.1749 |
| 9 | 34 | 0.168 | 0.188 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

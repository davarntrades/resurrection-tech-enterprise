# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-06-08 11:11:01Z

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
| Single-step | 1 | 0.0729 | 0.0957 | 0.118 | 0.0758 | 13193 |
| Short (2) | 2 | 0.091 | 0.1141 | 0.1436 | 0.0944 | 10593 |
| Medium (4) | 4 | 0.1624 | 0.1859 | 0.2107 | 0.1672 | 5981 |
| Long (8) | 8 | 0.2985 | 0.3237 | 0.3548 | 0.3051 | 3278 |
| Very long (16) | 16 | 0.5851 | 0.5987 | 0.6787 | 0.5834 | 1714 |
| Multi-agent (joint) | 3 | 0.1275 | 0.1511 | 0.1634 | 0.1312 | 7622 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.075 |
| 2 | 0.0945 |
| 4 | 0.1679 |
| 8 | 0.308 |
| 16 | 0.5873 |
| 32 | 1.1534 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 13 | 0.1298 | 0.1488 |
| 3 | 17 | 0.142 | 0.1612 |
| 6 | 25 | 0.1562 | 0.1748 |
| 9 | 34 | 0.1664 | 0.1853 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

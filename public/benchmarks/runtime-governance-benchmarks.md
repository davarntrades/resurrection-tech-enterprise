# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-06-29 11:14:15Z

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
| Single-step | 1 | 0.0744 | 0.0968 | 0.1068 | 0.0771 | 12970 |
| Short (2) | 2 | 0.0922 | 0.1142 | 0.1343 | 0.0953 | 10493 |
| Medium (4) | 4 | 0.1638 | 0.191 | 0.2796 | 0.1706 | 5862 |
| Long (8) | 8 | 0.3032 | 0.3304 | 0.3611 | 0.3098 | 3228 |
| Very long (16) | 16 | 0.5943 | 0.6263 | 0.7195 | 0.5967 | 1676 |
| Multi-agent (joint) | 3 | 0.1284 | 0.1518 | 0.1698 | 0.1323 | 7559 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.077 |
| 2 | 0.0995 |
| 4 | 0.1687 |
| 8 | 0.3102 |
| 16 | 0.5955 |
| 32 | 1.1655 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 13 | 0.129 | 0.1483 |
| 3 | 17 | 0.1418 | 0.1618 |
| 6 | 25 | 0.1554 | 0.1747 |
| 9 | 34 | 0.1668 | 0.1866 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

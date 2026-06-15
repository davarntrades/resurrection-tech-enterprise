# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-06-15 12:33:00Z

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
| Single-step | 1 | 0.0727 | 0.0957 | 0.1067 | 0.0754 | 13263 |
| Short (2) | 2 | 0.0897 | 0.1133 | 0.1418 | 0.0931 | 10741 |
| Medium (4) | 4 | 0.1598 | 0.1831 | 0.1912 | 0.1639 | 6101 |
| Long (8) | 8 | 0.297 | 0.3248 | 0.3521 | 0.3041 | 3288 |
| Very long (16) | 16 | 0.5819 | 0.6058 | 0.8469 | 0.5842 | 1712 |
| Multi-agent (joint) | 3 | 0.1256 | 0.1482 | 0.1547 | 0.1289 | 7758 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.0741 |
| 2 | 0.0927 |
| 4 | 0.1647 |
| 8 | 0.3038 |
| 16 | 0.577 |
| 32 | 1.159 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 13 | 0.1384 | 0.2294 |
| 3 | 17 | 0.1394 | 0.1587 |
| 6 | 25 | 0.1531 | 0.1725 |
| 9 | 34 | 0.1641 | 0.1832 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

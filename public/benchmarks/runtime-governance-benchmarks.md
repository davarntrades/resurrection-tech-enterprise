# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-07-06 10:51:59Z

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
| Single-step | 1 | 0.0729 | 0.0963 | 0.114 | 0.0758 | 13193 |
| Short (2) | 2 | 0.0904 | 0.1146 | 0.1481 | 0.094 | 10638 |
| Medium (4) | 4 | 0.1616 | 0.1858 | 0.2081 | 0.1665 | 6006 |
| Long (8) | 8 | 0.2988 | 0.3235 | 0.4387 | 0.3073 | 3254 |
| Very long (16) | 16 | 0.5857 | 0.6009 | 0.6793 | 0.5842 | 1712 |
| Multi-agent (joint) | 3 | 0.126 | 0.1487 | 0.1523 | 0.1291 | 7746 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.0758 |
| 2 | 0.0935 |
| 4 | 0.1661 |
| 8 | 0.3052 |
| 16 | 0.5817 |
| 32 | 1.1534 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 13 | 0.1284 | 0.1479 |
| 3 | 17 | 0.1413 | 0.1605 |
| 6 | 25 | 0.1547 | 0.1742 |
| 9 | 34 | 0.1654 | 0.1845 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

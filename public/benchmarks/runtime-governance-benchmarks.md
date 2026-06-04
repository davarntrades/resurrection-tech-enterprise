# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-06-04 13:37:14Z

## Environment

- Python: 3.11.15
- Platform: Linux-6.18.5-x86_64-with-glibc2.39
- Processor: x86_64
- Logical CPUs: 4
- Single-threaded, measured on this CI/build environment. Representative figures, not a production-hardware guarantee.

Configuration: horizon 3, 30 Ω rules across 9 domains; 5000 iterations per class after 500 warm-up calls; single-threaded.

## Latency by evaluation class

| Class | Steps | p50 (ms) | p95 (ms) | p99 (ms) | avg (ms) | throughput (eval/s) |
|---|---|---|---|---|---|---|
| Single-step | 1 | 0.0687 | 0.1085 | 0.1274 | 0.0749 | 13351 |
| Short (2) | 2 | 0.084 | 0.128 | 0.1583 | 0.0911 | 10977 |
| Medium (4) | 4 | 0.1509 | 0.1968 | 0.2435 | 0.1601 | 6246 |
| Long (8) | 8 | 0.282 | 0.3657 | 0.4321 | 0.3 | 3333 |
| Very long (16) | 16 | 0.5725 | 0.66 | 0.7604 | 0.5784 | 1729 |
| Multi-agent (joint) | 3 | 0.1185 | 0.1695 | 0.1969 | 0.1284 | 7788 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.0765 |
| 2 | 0.0914 |
| 4 | 0.1648 |
| 8 | 0.3096 |
| 16 | 0.5872 |
| 32 | 1.1463 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 9 | 0.1213 | 0.1624 |
| 3 | 13 | 0.135 | 0.1766 |
| 6 | 21 | 0.1525 | 0.2018 |
| 9 | 30 | 0.1852 | 0.2965 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

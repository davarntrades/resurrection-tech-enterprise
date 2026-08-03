# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-08-03 09:58:18Z

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
| Single-step | 1 | 0.056 | 0.0672 | 0.0942 | 0.0579 | 17271 |
| Short (2) | 2 | 0.073 | 0.0838 | 0.1036 | 0.0745 | 13423 |
| Medium (4) | 4 | 0.1365 | 0.1671 | 0.2332 | 0.142 | 7042 |
| Long (8) | 8 | 0.2634 | 0.2779 | 0.2989 | 0.2669 | 3747 |
| Very long (16) | 16 | 0.5306 | 0.5576 | 0.6885 | 0.5348 | 1870 |
| Multi-agent (joint) | 3 | 0.1061 | 0.1177 | 0.1361 | 0.1081 | 9251 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.0628 |
| 2 | 0.0766 |
| 4 | 0.1404 |
| 8 | 0.2705 |
| 16 | 0.5309 |
| 32 | 1.0979 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 13 | 0.108 | 0.1178 |
| 3 | 17 | 0.1186 | 0.1281 |
| 6 | 25 | 0.1311 | 0.1409 |
| 9 | 34 | 0.1398 | 0.1498 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

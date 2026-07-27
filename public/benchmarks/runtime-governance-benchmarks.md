# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-07-27 10:02:41Z

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
| Single-step | 1 | 0.0443 | 0.0528 | 0.0849 | 0.0458 | 21834 |
| Short (2) | 2 | 0.0572 | 0.0659 | 0.1163 | 0.0593 | 16863 |
| Medium (4) | 4 | 0.1065 | 0.1157 | 0.1238 | 0.1081 | 9251 |
| Long (8) | 8 | 0.2051 | 0.2157 | 0.2288 | 0.2075 | 4819 |
| Very long (16) | 16 | 0.41 | 0.4214 | 0.442 | 0.4119 | 2428 |
| Multi-agent (joint) | 3 | 0.0824 | 0.0909 | 0.0947 | 0.0834 | 11990 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.0449 |
| 2 | 0.0582 |
| 4 | 0.1085 |
| 8 | 0.2081 |
| 16 | 0.4123 |
| 32 | 0.8409 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 13 | 0.0836 | 0.0911 |
| 3 | 17 | 0.092 | 0.0995 |
| 6 | 25 | 0.1006 | 0.1081 |
| 9 | 34 | 0.1119 | 0.16 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

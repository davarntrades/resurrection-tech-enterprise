# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-09-07 12:11:49Z

## Environment

- Python: 3.12.14
- Platform: Linux-6.17.0-1022-azure-x86_64-with-glibc2.39
- Processor: x86_64
- Logical CPUs: 4
- Single-threaded, measured on this CI/build environment. Representative figures, not a production-hardware guarantee.

Configuration: horizon 3, 96 Ω rules across 9 domains; 800 iterations per class after 100 warm-up calls; single-threaded.

## Latency by evaluation class

| Class | Steps | p50 (ms) | p95 (ms) | p99 (ms) | avg (ms) | throughput (eval/s) |
|---|---|---|---|---|---|---|
| Single-step | 1 | 0.3865 | 0.4183 | 0.4766 | 0.3902 | 2563 |
| Short (2) | 2 | 0.9655 | 1.0063 | 1.0501 | 0.9694 | 1032 |
| Medium (4) | 4 | 3.0308 | 3.1253 | 3.29 | 3.0419 | 329 |
| Long (8) | 8 | 7.025 | 7.1728 | 7.2723 | 7.0318 | 142 |
| Very long (16) | 16 | 14.9333 | 15.2072 | 15.6601 | 14.9658 | 67 |
| Multi-agent (joint) | 3 | 2.0286 | 2.0929 | 2.2181 | 2.0359 | 491 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.3928 |
| 2 | 0.9707 |
| 4 | 3.0387 |
| 8 | 7.0309 |
| 16 | 14.9806 |
| 32 | 30.8236 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 75 | 2.7195 | 2.7888 |
| 3 | 79 | 2.7902 | 2.8565 |
| 6 | 87 | 2.9254 | 3.008 |
| 9 | 96 | 3.0363 | 3.0998 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

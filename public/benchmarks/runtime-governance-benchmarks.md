# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-08-31 13:21:41Z

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
| Single-step | 1 | 0.298 | 0.3382 | 0.4442 | 0.3045 | 3284 |
| Short (2) | 2 | 0.7449 | 0.8068 | 0.9056 | 0.756 | 1323 |
| Medium (4) | 4 | 2.3337 | 2.4031 | 2.6128 | 2.3465 | 426 |
| Long (8) | 8 | 5.4144 | 5.5224 | 5.6658 | 5.4266 | 184 |
| Very long (16) | 16 | 11.5012 | 11.7221 | 12.3523 | 11.5425 | 87 |
| Multi-agent (joint) | 3 | 1.5591 | 1.6215 | 1.8006 | 1.5683 | 638 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.3028 |
| 2 | 0.746 |
| 4 | 2.3368 |
| 8 | 5.4418 |
| 16 | 11.6194 |
| 32 | 23.7841 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 75 | 2.0895 | 2.1496 |
| 3 | 79 | 2.1443 | 2.1999 |
| 6 | 87 | 2.2392 | 2.2802 |
| 9 | 96 | 2.3395 | 2.383 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

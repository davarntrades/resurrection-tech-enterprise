# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-08-08 00:08:08Z

## Environment

- Python: 3.11.15
- Platform: Linux-6.18.5-fc-v20-x86_64-with-glibc2.39
- Processor: x86_64
- Logical CPUs: 4
- Single-threaded, measured on this CI/build environment. Representative figures, not a production-hardware guarantee.

Configuration: horizon 3, 96 Ω rules across 9 domains; 800 iterations per class after 100 warm-up calls; single-threaded.

## Latency by evaluation class

| Class | Steps | p50 (ms) | p95 (ms) | p99 (ms) | avg (ms) | throughput (eval/s) |
|---|---|---|---|---|---|---|
| Single-step | 1 | 0.415 | 0.5167 | 0.6548 | 0.4286 | 2333 |
| Short (2) | 2 | 0.9164 | 1.0 | 1.3514 | 0.9321 | 1073 |
| Medium (4) | 4 | 2.7028 | 2.9566 | 4.5437 | 2.7542 | 363 |
| Long (8) | 8 | 6.0274 | 6.5481 | 7.0321 | 6.087 | 164 |
| Very long (16) | 16 | 12.9523 | 15.0519 | 16.0692 | 13.2353 | 76 |
| Multi-agent (joint) | 3 | 1.8434 | 2.0121 | 2.4771 | 1.8685 | 535 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.417 |
| 2 | 0.9317 |
| 4 | 2.739 |
| 8 | 6.1064 |
| 16 | 12.7554 |
| 32 | 26.4833 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 75 | 2.55 | 2.8728 |
| 3 | 79 | 2.6343 | 3.0435 |
| 6 | 87 | 2.7274 | 3.0677 |
| 9 | 96 | 2.7346 | 2.9245 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

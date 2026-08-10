# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-08-10 07:54:01Z

## Environment

- Python: 3.12.13
- Platform: Linux-6.17.0-1020-azure-x86_64-with-glibc2.39
- Processor: x86_64
- Logical CPUs: 4
- Single-threaded, measured on this CI/build environment. Representative figures, not a production-hardware guarantee.

Configuration: horizon 3, 96 Ω rules across 9 domains; 800 iterations per class after 100 warm-up calls; single-threaded.

## Latency by evaluation class

| Class | Steps | p50 (ms) | p95 (ms) | p99 (ms) | avg (ms) | throughput (eval/s) |
|---|---|---|---|---|---|---|
| Single-step | 1 | 0.2933 | 0.3206 | 0.3464 | 0.2963 | 3375 |
| Short (2) | 2 | 0.7321 | 0.763 | 0.7947 | 0.7356 | 1359 |
| Medium (4) | 4 | 2.3523 | 2.4233 | 2.4835 | 2.3616 | 423 |
| Long (8) | 8 | 5.466 | 5.6515 | 6.2712 | 5.5024 | 182 |
| Very long (16) | 16 | 11.6964 | 12.0897 | 12.6333 | 11.752 | 85 |
| Multi-agent (joint) | 3 | 1.5526 | 1.6211 | 1.6838 | 1.5617 | 640 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.2968 |
| 2 | 0.7346 |
| 4 | 2.3562 |
| 8 | 5.4883 |
| 16 | 11.7037 |
| 32 | 24.0637 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 75 | 2.0896 | 2.1473 |
| 3 | 79 | 2.1496 | 2.2149 |
| 6 | 87 | 2.2453 | 2.2998 |
| 9 | 96 | 2.3479 | 2.4096 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

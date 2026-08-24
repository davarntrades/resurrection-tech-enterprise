# Morrison Runtime Governance — Latency Benchmark Report

Generated: 2026-08-24 07:10:56Z

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
| Single-step | 1 | 0.2654 | 0.3298 | 0.4435 | 0.2767 | 3614 |
| Short (2) | 2 | 0.6317 | 0.7079 | 0.8078 | 0.6408 | 1561 |
| Medium (4) | 4 | 1.8887 | 2.0981 | 2.2607 | 1.9135 | 523 |
| Long (8) | 8 | 4.2757 | 4.7459 | 5.1784 | 4.3389 | 230 |
| Very long (16) | 16 | 9.039 | 10.5006 | 12.4015 | 9.2806 | 108 |
| Multi-agent (joint) | 3 | 1.2786 | 1.3335 | 1.4109 | 1.2862 | 777 |

## Scaling by trajectory length (avg ms)

| Steps | avg (ms) |
|---|---|
| 1 | 0.2665 |
| 2 | 0.6542 |
| 4 | 1.9207 |
| 8 | 4.4627 |
| 16 | 9.0979 |
| 32 | 18.6819 |

## Scaling by domain / rule count (4-step trajectory)

| Domains | Rules | avg (ms) | p95 (ms) |
|---|---|---|---|
| 1 | 75 | 1.7545 | 1.8608 |
| 3 | 79 | 1.8097 | 1.8498 |
| 6 | 87 | 1.921 | 2.127 |
| 9 | 96 | 1.9781 | 2.2323 |

## Methodology

- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and deployment rule set (finance + coverage) the live service runs.
- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles are computed from the sorted sample.
- Cost scales with trajectory length and rule/domain count, independent of model size — no model inference occurs in the governance path.
- Figures are measured on the environment above. Production latency depends on host CPU, concurrency, and network transport to the service; re-run this harness on target hardware for deployment numbers.

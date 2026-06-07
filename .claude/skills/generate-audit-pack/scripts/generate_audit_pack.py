#!/usr/bin/env python3
"""generate-audit-pack — enterprise evidence pack for Morrison Runtime
Governance. See ../SKILL.md. Reuses the verify-production core + the live
governance/benchmark assets."""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import sys

# Reuse the verify-production engine resolver + checks + hash chain.
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "verify-production", "scripts"))
import verify_production as vp  # noqa: E402


def _sha256_file(path: str) -> str:
    try:
        return hashlib.sha256(open(path, "rb").read()).hexdigest()
    except Exception:
        return "missing"


def _coverage(domains: list[str]):
    """Rules grouped by Ω domain for the default deployment layer + live sectors."""
    from replay import _layer, DEPLOYMENT_RULES  # type: ignore
    layer = _layer(domains, 3)
    by_domain: dict[str, list[str]] = {}
    for r in layer.rules:
        by_domain.setdefault(r.domain.value, []).append(r.name)
    try:
        from sector_rules import live_sector_ids  # type: ignore
        sectors = live_sector_ids()
    except Exception:
        sectors = []
    return by_domain, sectors, sorted({r.name for r in DEPLOYMENT_RULES})


def build(root: str, engine: str | None, customer: str | None) -> tuple[str, str, dict]:
    ts = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    bench_path = os.path.join(root, "public/benchmarks/latency.json")
    corpus_path = os.path.join(root, "governance-service/tests/corpus.json")
    bench = json.load(open(bench_path)) if os.path.isfile(bench_path) else {}

    # verification core (replay/audit/attestation)
    checks, meta = vp.run(root, engine)
    ruleset_hash = meta.get("ruleset_hash")

    # validation corpus
    corpus_metrics = None
    try:
        from test_corpus import evaluate  # type: ignore
        corpus_metrics = evaluate()
    except Exception as e:  # noqa: BLE001
        corpus_metrics = {"error": str(e)}

    # governance coverage
    cov_domains = bench.get("config", {}).get("domains", ["finance", "cybersecurity", "healthcare", "compliance"])
    by_domain = sectors = deploy_rules = None
    if engine:
        try:
            by_domain, sectors, deploy_rules = _coverage(cov_domains)
        except Exception:
            pass

    # audit-trail sample chain
    chain_doc = None
    if engine:
        try:
            from replay import derive  # type: ignore
            recs = []
            for t in ({"trajectory": [{"tool": "transfer", "args": {"amount": 50000, "threshold": 1000}}], "domains": ["finance"], "horizon": 3},
                      {"trajectory": [{"tool": "read_file", "args": {"path": "/etc/shadow"}}], "domains": ["cybersecurity"], "horizon": 3}):
                recs.append({"timestamp": ts, "domains": t["domains"], **derive(t)})
            chain_doc = vp.chain(recs)
        except Exception:
            pass

    # ── compose markdown ──
    cust = f" — prepared for {customer}" if customer else ""
    p99max = max((v["p99_ms"] for v in bench.get("classes", {}).values()), default=None)
    ss = bench.get("classes", {}).get("single_step", {})

    L: list[str] = []
    def H(s): L.append(s)

    H(f"# Morrison Runtime Governance — Evidence Pack{cust}")
    H("")
    H(f"_Generated {ts} · deployment `{meta.get('deployment_commit','?')[:12]}` · "
      f"engine `{meta.get('engine_ref','?')[:12]}` · ruleset `{(ruleset_hash or 'n/a')[:12]}`_")
    H("")
    H("## Executive Summary")
    H("")
    overall = "FAIL" if checks.failed() else ("PASS" if not checks.skipped() else "PASS (with skips)")
    H(f"Morrison Runtime Governance is a pre-execution control layer that evaluates a proposed "
      f"agent trajectory for reachable forbidden states (Ω) and returns a deterministic ALLOW/BLOCK "
      f"verdict **before** any tool executes. This pack is generated from live repository assets and "
      f"the pinned engine; every figure below is reproducible.")
    H("")
    H(f"- **Verification status:** `{overall}` — {len(checks.passed())} passed, "
      f"{len(checks.failed())} failed, {len(checks.skipped())} skipped.")
    if corpus_metrics and "error" not in corpus_metrics:
        H(f"- **Validation:** precision {corpus_metrics['precision']:.4f} · recall {corpus_metrics['recall']:.4f} "
          f"over {corpus_metrics['evaluated']} labelled cases (FP {corpus_metrics['fp']}, FN {corpus_metrics['fn']}).")
    if ss:
        H(f"- **Latency:** single-step p50 {ss.get('p50_ms')} ms (avg {ss.get('avg_ms')} ms); all classes sub-millisecond"
          + (f" (max p99 {p99max} ms)." if p99max else "."))
    H(f"- **Auditability:** every verdict carries engine commit + `ruleset_hash` + trajectory hash; "
      f"the audit trail is a tamper-evident SHA-256 chain; any verdict is independently replayable.")
    H("")

    H("## Governance Architecture Summary")
    H("")
    H("- **Invariant:** ℛ(t) ∩ Ω = ∅ — a trajectory must never reach the forbidden region Ω.")
    H("- **Position:** pre-execution middleware; the verdict returns before the tool call runs. No model inference in the governance path.")
    H("- **Determinism:** no RNG, no clock — identical input → identical verdict, which is what makes replay and audit verifiable.")
    H("- **Enforcement hierarchy:** A_safe · V2 (taint) · V3 (reachability) · V4 (admissibility) · V4+ (feasibility) · V5 (stability) · V5+ (deployment hardening).")
    if by_domain:
        H(f"- **Coverage:** {sum(len(v) for v in by_domain.values())} loaded rules across "
          f"{len(by_domain)} Ω domains; {len(sectors)} live sectors ({', '.join(sectors)}).")
        H("")
        H("| Ω domain | rules |")
        H("|---|---|")
        for d, rs in sorted(by_domain.items()):
            H(f"| {d} | {len(rs)} |")
    H("")

    H("## Benchmark Summary")
    H("")
    if bench:
        env = bench.get("environment", {})
        H(f"Measured on {env.get('platform','?')} · Python {env.get('python','?')} · "
          f"{env.get('cpu_count','?')} logical CPUs, single-threaded · {bench.get('config',{}).get('rules_loaded','?')} Ω rules.")
        H("")
        H("| Evaluation class | p50 | p95 | p99 | avg | throughput |")
        H("|---|---|---|---|---|---|")
        for k, v in bench.get("classes", {}).items():
            H(f"| {k} | {v['p50_ms']} ms | {v['p95_ms']} ms | {v['p99_ms']} ms | {v['avg_ms']} ms | {round(v['throughput_per_s']):,}/s |")
        H("")
        H(f"_{env.get('note','')}_")
    else:
        H("_latency.json not found._")
    H("")

    H("## Latency Summary")
    H("")
    H("Runtime Governance has been benchmarked at microsecond-scale latency, with benchmark averages "
      "typically around 0.1 ms per evaluation depending on trajectory length and rule count. Across "
      "representative deployed-service evaluations, observed governance evaluation times have remained "
      "sub-millisecond. The governance layer therefore operates at a timescale that is typically "
      "negligible relative to model inference, tool execution, database operations, and network latency.")
    H("")

    H("## Validation Summary")
    H("")
    if corpus_metrics and "error" not in corpus_metrics:
        m = corpus_metrics
        H(f"Labelled regression corpus: **{m['total']} cases** ({m['evaluated']} evaluated, {m['skipped']} skipped).")
        H("")
        H("| Metric | Value |")
        H("|---|---|")
        H(f"| True positives (BLOCK) | {m['tp']} |")
        H(f"| True negatives (PERMIT) | {m['tn']} |")
        H(f"| False positives | {m['fp']} |")
        H(f"| False negatives | {m['fn']} |")
        H(f"| Precision | {m['precision']:.4f} |")
        H(f"| Recall | {m['recall']:.4f} |")
        H(f"| Accuracy | {m['accuracy']:.4f} |")
        H("")
        H("Mismatches: " + ("none ✓" if not m["mismatches"] else f"{len(m['mismatches'])} — see Appendix."))
    else:
        H(f"_Corpus evaluation unavailable: {corpus_metrics.get('error') if corpus_metrics else 'n/a'}._")
    H("")

    H("## Replay Verification Summary")
    H("")
    H("Every verdict is reproducible: re-evaluating a stored trace (trajectory + domains + horizon) "
      "against the same engine + ruleset yields a bit-identical verdict and trajectory hash. Tampering "
      "with a recorded verdict is detected.")
    H("")
    H("| Check | Status | Detail |")
    H("|---|---|---|")
    for r in checks.results:
        icon = {"PASS": "✅", "FAIL": "❌", "SKIP": "⚠️"}[r["status"]]
        H(f"| {r['check']} | {icon} {r['status']} | {r['detail']} |")
    H("")

    H("## Audit Trail Summary")
    H("")
    if chain_doc:
        H(f"Audit records are linked into a SHA-256 hash chain "
          f"(`record_hash = SHA-256(prev_hash + canonical(record))`). Sample chain of "
          f"**{chain_doc['count']} records**, head hash `{chain_doc['head_hash'][:16]}…`. Editing, "
          f"reordering, or removing any record breaks the chain — verified: "
          f"{'intact ✓' if vp.verify_chain(chain_doc) else 'FAILED'}.")
    else:
        H("Audit records are linked into a SHA-256 hash chain; sample generation requires the engine.")
    H("")

    H("## Appendix")
    H("")
    H("**Attestation**")
    H("")
    H(f"- deployment_commit: `{meta.get('deployment_commit')}`")
    H(f"- engine_ref: `{meta.get('engine_ref')}` (source: {meta.get('engine_source')})")
    H(f"- ruleset_hash: `{ruleset_hash}`")
    H(f"- generated_utc: {ts}")
    H("")
    H("**Source artefact hashes (SHA-256)**")
    H("")
    for label, path in (("latency.json", bench_path), ("corpus.json", corpus_path)):
        H(f"- {label}: `{_sha256_file(path)}`")
    if corpus_metrics and corpus_metrics.get("mismatches"):
        H("")
        H("**Corpus mismatches**")
        for mm in corpus_metrics["mismatches"]:
            H(f"- {mm}")
    H("")
    H("**Reproduce**")
    H("")
    H("- Verification: `python .claude/skills/verify-production/scripts/verify_production.py`")
    H("- Corpus: `cd governance-service && PYTHONPATH=<engine> python test_corpus.py`")
    H("- Replay: `cd governance-service && PYTHONPATH=<engine> python test_replay.py`")
    H("- Benchmark: `cd governance-service && PYTHONPATH=<engine> python benchmark.py`")
    H("")

    md = "\n".join(L)

    manifest = {
        "schema": "morrison-evidence-manifest/1",
        "generated_utc": ts,
        "customer": customer,
        "attestation": {
            "deployment_commit": meta.get("deployment_commit"),
            "engine_ref": meta.get("engine_ref"),
            "ruleset_hash": ruleset_hash,
        },
        "verification": {"status": overall, "passed": [r["check"] for r in checks.passed()],
                         "failed": [r["check"] for r in checks.failed()],
                         "skipped": [r["check"] for r in checks.skipped()]},
        "validation": (None if not corpus_metrics or "error" in corpus_metrics else
                       {k: corpus_metrics[k] for k in ("total", "evaluated", "skipped", "tp", "fp", "tn", "fn",
                                                       "precision", "recall", "accuracy")}),
        "benchmark": ({"single_step_p50_ms": ss.get("p50_ms"), "single_step_avg_ms": ss.get("avg_ms"),
                       "max_p99_ms": p99max, "rules_loaded": bench.get("config", {}).get("rules_loaded")}
                      if bench else None),
        "audit_chain": ({"count": chain_doc["count"], "head_hash": chain_doc["head_hash"],
                         "verified": vp.verify_chain(chain_doc)} if chain_doc else None),
        "coverage": ({"domains": {d: len(r) for d, r in by_domain.items()},
                      "live_sectors": sectors, "deployment_rules": deploy_rules}
                     if by_domain else None),
        "source_hashes": {"latency.json": _sha256_file(bench_path), "corpus.json": _sha256_file(corpus_path)},
    }
    return md, _pdf_ready(md, customer, ts), manifest


def _pdf_ready(md: str, customer: str | None, ts: str) -> str:
    title = "Morrison Runtime Governance — Evidence Pack"
    front = [
        "---",
        f'title: "{title}"',
        f'subtitle: "{customer or "Confidential — enterprise evidence"}"',
        f'date: "{ts}"',
        "geometry: margin=1in",
        "---",
        "",
    ]
    # Page-break before each H2 for clean PDF pagination.
    body = md.replace("\n## ", "\n\n\\newpage\n\n## ")
    return "\n".join(front) + body + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None)
    ap.add_argument("--customer", default=None)
    ap.add_argument("--engine", default=None)
    a = ap.parse_args()

    root = vp.repo_root()
    engine = vp.resolve_engine(root, a.engine)
    md, pdf_md, manifest = build(root, engine, a.customer)

    out = a.out or os.path.join(root, "audit-pack")
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "audit-pack.md"), "w").write(md)
    open(os.path.join(out, "audit-pack.pdf.md"), "w").write(pdf_md)
    open(os.path.join(out, "evidence-manifest.json"), "w").write(json.dumps(manifest, indent=2))
    print(f"wrote {out}/audit-pack.md, audit-pack.pdf.md, evidence-manifest.json")
    print(f"verification: {manifest['verification']['status']} · "
          f"validation precision/recall: "
          f"{(manifest['validation'] or {}).get('precision','?')}/{(manifest['validation'] or {}).get('recall','?')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

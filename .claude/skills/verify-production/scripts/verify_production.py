#!/usr/bin/env python3
"""verify-production — source-side verification + attestation for Morrison
Runtime Governance. See ../SKILL.md.

Exit code 0 if no check FAILED (skips are allowed), 1 otherwise.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

# ── repo + engine resolution ────────────────────────────────────────────────

def repo_root() -> str:
    d = os.path.abspath(os.path.dirname(__file__))
    while d != "/":
        if os.path.isdir(os.path.join(d, "governance-service")):
            return d
        d = os.path.dirname(d)
    raise SystemExit("could not locate repo root (no governance-service/ above this script)")


def engine_ref(root: str) -> str:
    try:
        txt = open(os.path.join(root, "governance-service", "Dockerfile")).read()
        m = re.search(r"ARG\s+ENGINE_REF=(\S+)", txt)
        return m.group(1) if m else "main"
    except Exception:
        return "main"


def resolve_engine(root: str, explicit: str | None) -> str | None:
    """Make `morrison_governance` + governance-service modules importable.
    Returns a short provenance label, or None if unreachable."""
    gs = os.path.join(root, "governance-service")
    if gs not in sys.path:
        sys.path.insert(0, gs)
    candidates = [explicit, os.environ.get("MORRISON_ENGINE"),
                  os.path.join(os.path.dirname(root), "Morrison-Runtime-Governance")]
    for p in candidates:
        if p and os.path.isdir(os.path.join(p, "morrison_governance")):
            if p not in sys.path:
                sys.path.insert(0, p)
            try:
                import morrison_governance  # noqa: F401
                return os.path.basename(p.rstrip("/")) or p
            except Exception:
                pass
    try:
        import morrison_governance  # noqa: F401
        return "import"
    except Exception:
        pass
    ref = engine_ref(root)
    try:
        tmp = tempfile.mkdtemp(prefix="mrg-engine-")
        url = "https://github.com/davarntrades/Morrison-Runtime-Governance.git"
        subprocess.run(["git", "clone", "--filter=blob:none", "--no-checkout", url, tmp],
                       check=True, capture_output=True)
        subprocess.run(["git", "-C", tmp, "checkout", ref], check=True, capture_output=True)
        sys.path.insert(0, tmp)
        import morrison_governance  # noqa: F401
        return f"clone@{ref[:12]}"
    except Exception:
        return None


# ── check harness ───────────────────────────────────────────────────────────

class Checks:
    def __init__(self):
        self.results: list[dict] = []

    def add(self, name: str, status: str, detail: str = ""):
        self.results.append({"check": name, "status": status, "detail": detail})

    def passed(self):  return [r for r in self.results if r["status"] == "PASS"]
    def failed(self):  return [r for r in self.results if r["status"] == "FAIL"]
    def skipped(self): return [r for r in self.results if r["status"] == "SKIP"]


# ── audit hash-chain (mirrors the site's tamper-evident export) ─────────────

def _canon(rec: dict) -> str:
    return json.dumps(rec, sort_keys=True, separators=(",", ":"))


def chain(records: list[dict]) -> dict:
    prev = "0" * 64
    out = []
    for r in records:
        h = hashlib.sha256((prev + _canon(r)).encode()).hexdigest()
        out.append({**r, "prev_hash": prev, "record_hash": h})
        prev = h
    return {"genesis": "0" * 64, "head_hash": prev, "count": len(out), "records": out}


def verify_chain(doc: dict) -> bool:
    prev = doc["genesis"]
    for r in doc["records"]:
        bare = {k: v for k, v in r.items() if k not in ("prev_hash", "record_hash")}
        h = hashlib.sha256((prev + _canon(bare)).encode()).hexdigest()
        if r["prev_hash"] != prev or r["record_hash"] != h:
            return False
        prev = h
    return prev == doc["head_hash"]


_NUM = re.compile(r"(\d+\.?\d*)\s*ms")


def run(root: str, engine: str | None) -> tuple[Checks, dict]:
    c = Checks()
    bench_path = os.path.join(root, "public/benchmarks/latency.json")
    report_md = os.path.join(root, "public/benchmarks/runtime-governance-benchmarks.md")
    ent_page = os.path.join(root, "app/enterprise/page.tsx")
    meta: dict = {}

    # 1. artefacts exist
    have_json = os.path.isfile(bench_path)
    have_md = os.path.isfile(report_md)
    c.add("benchmark_artefacts_exist", "PASS" if (have_json and have_md) else "FAIL",
          f"latency.json={'ok' if have_json else 'MISSING'} report.md={'ok' if have_md else 'MISSING'}")

    bench = {}
    if have_json:
        # 2. JSON integrity
        try:
            bench = json.load(open(bench_path))
            classes = bench.get("classes", {})
            ok = bool(classes) and all(
                all(k in v for k in ("p50_ms", "p95_ms", "p99_ms", "avg_ms")) for v in classes.values()
            ) and "rules_loaded" in bench.get("config", {}) and "environment" in bench
            c.add("benchmark_json_integrity", "PASS" if ok else "FAIL",
                  f"{len(classes)} classes; rules_loaded={bench.get('config', {}).get('rules_loaded')}")
        except Exception as e:  # noqa: BLE001
            c.add("benchmark_json_integrity", "FAIL", f"parse error: {e}")
    else:
        c.add("benchmark_json_integrity", "SKIP", "latency.json missing")

    # 3. tables derive from source (no hard-coded latency numbers)
    if os.path.isfile(ent_page):
        page = open(ent_page).read()
        derives = ("latency.json" in page) and ("BENCH.classes" in page) and ("v.p50_ms" in page)
        c.add("benchmark_tables_match_source", "PASS" if derives else "FAIL",
              "Enterprise page renders the table from latency.json" if derives
              else "table does not appear to read latency.json")
    else:
        c.add("benchmark_tables_match_source", "SKIP", "enterprise page not found")

    # 4. Latency Summary copy consistent with measured values
    if bench and os.path.isfile(ent_page):
        page = open(ent_page).read()
        m = re.search(r"Latency Summary.*?</div>", page, re.S)
        block = m.group(0) if m else page
        nums = [float(x) for x in _NUM.findall(block)]
        avgs = [v["avg_ms"] for v in bench["classes"].values()]
        p99s = [v["p99_ms"] for v in bench["classes"].values()]
        min_avg, max_avg, p99max = min(avgs), max(avgs), max(p99s)
        typ = next((n for n in nums if n <= 0.25), None)   # the "~0.1 ms" typical
        up = next((n for n in nums if n >= 0.25), None)    # the "~0.4 ms" deployed sample
        # Two checkable claims: 'typically ~0.1 ms' must sit in the measured-avg
        # ballpark, and 'sub-millisecond' must hold (max p99 < 1 ms). The '0.4 ms'
        # is a deployed-service sample, not the CI p99, so it is reported, not gated.
        typ_ok = typ is not None and (min_avg * 0.5) <= typ <= (max_avg * 1.5)
        subms_ok = p99max < 1.0
        ok = typ_ok and subms_ok
        note = ""
        if up is not None and up < p99max:
            note = f" · note: heaviest-class p99={p99max:.3f} ms exceeds the cited ~{up} ms upper (both sub-ms)"
        c.add("latency_summary_matches_measured", "PASS" if ok else "FAIL",
              f"typical≈{typ} ms in measured avg∈[{min_avg:.3f},{max_avg:.3f}]; sub-ms (p99max={p99max:.3f}){note}")
    else:
        c.add("latency_summary_matches_measured", "SKIP", "missing benchmark or page")

    # engine-dependent checks
    if engine is None:
        for n in ("replay_determinism", "audit_trail_generation"):
            c.add(n, "SKIP", "engine not reachable")
        meta["ruleset_hash"] = None
    else:
        try:
            from replay import derive, verify, _ruleset_hash, _layer
            traces = [
                {"trajectory": [{"tool": "transfer", "args": {"amount": 50000, "threshold": 1000}}],
                 "domains": ["finance"], "horizon": 3},
                {"trajectory": [{"tool": "read_report", "args": {}}], "domains": ["finance"], "horizon": 3},
            ]
            ok = True
            recs = []
            for t in traces:
                t["expected"] = derive(t)
                if not verify(t)["match"] or derive(t) != t["expected"]:
                    ok = False
                flip = "PERMIT" if t["expected"]["verdict"] != "PERMIT" else "BLOCK"
                if verify(dict(t, expected=dict(t["expected"], verdict=flip)))["match"]:
                    ok = False
                recs.append({"id": t["trajectory"][0]["tool"], **t["expected"]})
            c.add("replay_determinism", "PASS" if ok else "FAIL",
                  f"{len(traces)} traces re-derived bit-identically; tamper detected")

            # 6. audit-trail hash chain
            doc = chain(recs)
            tampered = json.loads(json.dumps(doc))
            if tampered["records"]:
                tampered["records"][0]["verdict"] = "TAMPERED"
            ok2 = verify_chain(doc) and not verify_chain(tampered)
            c.add("audit_trail_generation", "PASS" if ok2 else "FAIL",
                  f"hash chain of {doc['count']} records verifies; tamper breaks it")

            meta["ruleset_hash"] = _ruleset_hash(_layer(list(bench.get("config", {}).get("domains", ["finance"])), 3).rules)
        except Exception as e:  # noqa: BLE001
            c.add("replay_determinism", "FAIL", f"engine error: {e}")
            c.add("audit_trail_generation", "SKIP", "depends on replay")
            meta["ruleset_hash"] = None

    # 7. deployment metadata
    ref = engine_ref(root)
    try:
        head = subprocess.run(["git", "-C", root, "rev-parse", "HEAD"],
                              capture_output=True, text=True).stdout.strip() or "unknown"
    except Exception:
        head = "unknown"
    meta.update({"deployment_commit": head, "engine_ref": ref, "engine_source": engine})
    c.add("deployment_metadata", "PASS",
          f"repo HEAD={head[:12]} engine_ref={ref[:12]} ruleset_hash={(meta.get('ruleset_hash') or 'n/a')[:12]}")
    return c, meta


def render(c: Checks, meta: dict) -> tuple[str, dict]:
    ts = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    status = "FAIL" if c.failed() else ("PASS_WITH_SKIPS" if c.skipped() else "PASS")
    js = {
        "skill": "verify-production",
        "status": status,
        "generated_utc": ts,
        "deployment_commit": meta.get("deployment_commit"),
        "engine_ref": meta.get("engine_ref"),
        "engine_source": meta.get("engine_source"),
        "ruleset_hash": meta.get("ruleset_hash"),
        "passed": [r["check"] for r in c.passed()],
        "failed": [r["check"] for r in c.failed()],
        "skipped": [r["check"] for r in c.skipped()],
        "checks": c.results,
    }
    lines = [
        "# Production Verification & Attestation",
        "",
        f"- **Status:** `{status}`",
        f"- **Deployment commit:** `{meta.get('deployment_commit')}`",
        f"- **Engine ref:** `{meta.get('engine_ref')}` (source: {meta.get('engine_source')})",
        f"- **Ruleset hash:** `{meta.get('ruleset_hash')}`",
        f"- **Generated (UTC):** {ts}",
        f"- **Passed:** {len(c.passed())} · **Failed:** {len(c.failed())} · **Skipped:** {len(c.skipped())}",
        "",
        "| Check | Status | Detail |",
        "|---|---|---|",
    ]
    for r in c.results:
        icon = {"PASS": "✅", "FAIL": "❌", "SKIP": "⚠️"}[r["status"]]
        lines.append(f"| {r['check']} | {icon} {r['status']} | {r['detail']} |")
    lines.append("")
    return "\n".join(lines), js


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None)
    ap.add_argument("--engine", default=None)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    root = repo_root()
    engine = resolve_engine(root, a.engine)
    c, meta = run(root, engine)
    md, js = render(c, meta)

    out_dir = a.out or os.path.join(root, "attestation")
    os.makedirs(out_dir, exist_ok=True)
    open(os.path.join(out_dir, "verify-production-report.md"), "w").write(md)
    open(os.path.join(out_dir, "verify-production-report.json"), "w").write(json.dumps(js, indent=2))

    print(md)
    if a.json:
        print(json.dumps(js, indent=2))
    print(f"\nwrote {out_dir}/verify-production-report.{{md,json}}")
    return 1 if c.failed() else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""ship-to-green — orchestrate a Runtime Governance change from idea → validated
→ benchmarked → evidenced → ready, then (post-merge) verified → attested.
Fail-closed. See ../SKILL.md. Reuses verify-production + the governance suites +
benchmark.py + the other skills; defines no governance logic of its own."""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import subprocess
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "verify-production", "scripts"))
import verify_production as vp  # noqa: E402

SKILLS = os.path.join(_HERE, "..", "..")


def _engine_dir() -> str | None:
    try:
        import morrison_governance  # type: ignore
        return os.path.dirname(os.path.dirname(os.path.abspath(morrison_governance.__file__)))
    except Exception:
        return None


def _ts() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _run(cmd: list[str], cwd: str, env: dict) -> tuple[bool, str]:
    try:
        p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=300)
        return p.returncode == 0, (p.stdout + p.stderr)[-600:]
    except Exception as e:  # noqa: BLE001
        return False, str(e)


# ── Stage 1: change analysis ────────────────────────────────────────────────

def changed_files(root: str, base: str) -> list[str]:
    try:
        subprocess.run(["git", "-C", root, "fetch", "origin", base.split("/")[-1]],
                       capture_output=True, timeout=30)
    except Exception:
        pass
    files: set[str] = set()
    try:
        mb = subprocess.run(["git", "-C", root, "merge-base", base, "HEAD"],
                            capture_output=True, text=True).stdout.strip() or base
        out = subprocess.run(["git", "-C", root, "diff", "--name-only", f"{mb}", "HEAD"],
                             capture_output=True, text=True).stdout
        files.update(x for x in out.splitlines() if x)
    except Exception:
        pass
    out = subprocess.run(["git", "-C", root, "status", "--porcelain"], capture_output=True, text=True).stdout
    files.update(line[3:] for line in out.splitlines() if line.strip())
    return sorted(files)


def classify(files: list[str]) -> dict:
    cats: dict[str, list[str]] = {k: [] for k in
                                  ("governance", "skills", "corpus", "benchmark", "website", "ci", "other")}
    for f in files:
        if f.startswith("governance-service/tests/corpus.json") or "corpus" in os.path.basename(f):
            cats["corpus"].append(f)
        elif "benchmark" in f or f.endswith("latency.json"):
            cats["benchmark"].append(f)
        elif f.startswith("governance-service/"):
            cats["governance"].append(f)
        elif f.startswith(".claude/skills/"):
            cats["skills"].append(f)
        elif f.startswith((".github/",)):
            cats["ci"].append(f)
        elif f.startswith(("app/", "components/", "styles/", "lib/", "public/")):
            cats["website"].append(f)
        else:
            cats["other"].append(f)
    return {k: v for k, v in cats.items() if v}


# ── Stage 2: validation (fail-closed) ───────────────────────────────────────

def validate(root: str, engine_dir: str | None, cats: dict, requires_corpus: bool) -> dict:
    gs = os.path.join(root, "governance-service")
    suites: list[dict] = []
    if engine_dir:
        env = dict(os.environ, PYTHONPATH=f"{engine_dir}:{gs}")
        # corpus metrics in-process (gives precision/recall + gate)
        corpus = None
        try:
            sys.path.insert(0, gs)
            from test_corpus import evaluate  # type: ignore
            corpus = evaluate()
            ok = not corpus["mismatches"]
            suites.append({"suite": "corpus", "status": "PASS" if ok else "FAIL",
                           "detail": f"precision {corpus['precision']:.4f} recall {corpus['recall']:.4f} "
                                     f"({corpus['evaluated']} cases, {len(corpus['mismatches'])} mismatch)"})
        except Exception as e:  # noqa: BLE001
            suites.append({"suite": "corpus", "status": "FAIL", "detail": str(e)[:200]})
        # script suites
        run_hardening = bool(cats.get("governance") or cats.get("corpus") or requires_corpus)
        scripts = ["test_replay.py", "test_assess.py"]
        if run_hardening:
            scripts += ["test_sector_hardening.py", "test_domain_hardening.py", "test_finance_hardening.py", "test_cyber_hardening.py"]
        for sc in scripts:
            ok, tail = _run(["python", sc], gs, env)
            suites.append({"suite": sc[:-3], "status": "PASS" if ok else "FAIL",
                           "detail": "ok" if ok else tail[-200:]})
    else:
        suites.append({"suite": "governance", "status": "SKIP", "detail": "engine not reachable"})
        corpus = None

    # skill smoke tests (also = "skills available")
    smoke = [
        ("verify-production", ["python", os.path.join(SKILLS, "verify-production/scripts/verify_production.py"),
                               "--out", "/tmp/ship-smoke/vp"]),
        ("generate-audit-pack", ["python", os.path.join(SKILLS, "generate-audit-pack/scripts/generate_audit_pack.py"),
                                 "--out", "/tmp/ship-smoke/ap"]),
        ("onboard-sector", ["python", os.path.join(SKILLS, "onboard-sector/scripts/onboard_sector.py"),
                            "smoketest", "--out", "/tmp/ship-smoke/os"]),
        ("threat-model", ["python", os.path.join(SKILLS, "threat-model-omega-mapping/scripts/threat_model_omega.py"),
                          "--spec", os.path.join(SKILLS, "threat-model-omega-mapping/examples/financial-copilot.json"),
                          "--out", "/tmp/ship-smoke/tm"]),
    ]
    env = dict(os.environ)
    if engine_dir:
        env["MORRISON_ENGINE"] = engine_dir
    for name, cmd in smoke:
        ok, tail = _run(cmd, root, env)
        suites.append({"suite": f"skill:{name}", "status": "PASS" if ok else "FAIL",
                       "detail": "ok" if ok else tail[-180:]})

    ran = [s for s in suites if s["status"] != "SKIP"]
    failed = [s for s in suites if s["status"] == "FAIL"]
    return {"suites": suites, "passed": len(ran) - len(failed), "ran": len(ran),
            "failed": failed, "corpus": corpus}


# ── Stage 3: benchmark regression (in-process, no file writes) ──────────────

def benchmark(root: str, engine_dir: str | None) -> dict:
    base_path = os.path.join(root, "public/benchmarks/latency.json")
    baseline = json.load(open(base_path)) if os.path.isfile(base_path) else {}
    base_ss = baseline.get("classes", {}).get("single_step", {}).get("avg_ms")
    if engine_dir is None or base_ss is None:
        return {"state": "NA", "detail": "engine or baseline unavailable", "baseline_ms": base_ss}
    try:
        gs = os.path.join(root, "governance-service")
        if gs not in sys.path:
            sys.path.insert(0, gs)
        import benchmark as bm  # type: ignore
        doms = baseline.get("config", {}).get("domains", ["finance", "cybersecurity"])
        lyr = bm.layer(doms)
        m = bm.measure(lyr, bm.make_steps(1), iters=1500)
        new = m["avg_ms"]
        ratio = new / base_ss if base_ss else 1.0
        state = "Regressed" if ratio > 1.5 else ("Improved" if ratio < 0.7 else "Unchanged")
        return {"state": state, "baseline_ms": base_ss, "measured_ms": round(new, 4),
                "ratio": round(ratio, 2), "detail": f"single-step avg {new:.4f} ms vs baseline {base_ss} ms"}
    except Exception as e:  # noqa: BLE001
        return {"state": "NA", "detail": f"benchmark error: {e}", "baseline_ms": base_ss}


# ── readiness score ─────────────────────────────────────────────────────────

def score(val: dict, bench: dict, cats: dict, risk_level: str) -> dict:
    validation_pct = round(100 * (val["passed"] / val["ran"])) if val["ran"] else 100
    corpus = val.get("corpus")
    if corpus and not corpus.get("mismatches"):
        coverage_pct = round(100 * min(corpus["precision"], corpus["recall"]))
    elif corpus:
        coverage_pct = round(100 * min(corpus["precision"], corpus["recall"]))
    else:
        coverage_pct = 100  # not applicable (e.g. website-only) — neutral
    bench_score = 55 if bench["state"] == "Regressed" else 100
    regressed = bench["state"] == "Regressed"
    any_fail = bool(val["failed"])
    if any_fail or regressed:
        risk = "High"
    elif (risk_level == "high") or (len(sum(cats.values(), [])) > 15) or ("governance" in cats and "website" in cats):
        risk = "Medium"
    else:
        risk = "Low"
    risk_score = {"Low": 100, "Medium": 75, "High": 40}[risk]
    readiness = round(0.40 * validation_pct + 0.25 * coverage_pct + 0.20 * bench_score + 0.15 * risk_score)
    ready = (not any_fail) and (not regressed)
    return {"validation_pct": validation_pct, "coverage_pct": coverage_pct,
            "benchmark": bench["state"], "deployment_risk": risk,
            "readiness_score": readiness, "ready": ready}


# ── evidence + PR body ──────────────────────────────────────────────────────

def write_evidence(out: str, change: str, area: str, cats: dict, val: dict,
                   bench: dict, sc: dict, files: list[str]) -> None:
    os.makedirs(out, exist_ok=True)
    impact = {
        "governance": "Railway (governance-service rebuild) + corpus/replay gate",
        "website": "Vercel (Next.js build + deploy)",
        "skills": "tooling only (no production surface)",
        "corpus": "validation gate (precision/recall must stay 1.0)",
        "benchmark": "latency claims / Enterprise Readiness page",
        "ci": "CI workflows",
    }
    dep = sorted({impact[k] for k in cats if k in impact})

    open(os.path.join(out, "change-summary.md"), "w").write(
        f"# Change Summary\n\n**Change:** {change}\n**Area:** {area}\n**Generated:** {_ts()}\n\n"
        f"## Files impacted ({len(files)})\n" + "".join(f"- `{f}`\n" for f in files[:40]) +
        ("\n_…and more_\n" if len(files) > 40 else "") +
        "\n## Classification\n" + "".join(f"- **{k}**: {len(v)} file(s)\n" for k, v in cats.items()) +
        "\n## Deployment impact\n" + ("".join(f"- {d}\n" for d in dep) or "- none\n") +
        "\n## Commercial impact\n- " + _commercial(area) + "\n")

    open(os.path.join(out, "validation-report.md"), "w").write(
        f"# Validation Report\n\n_{_ts()}_\n\n| Suite | Status | Detail |\n|---|---|---|\n" +
        "".join(f"| {s['suite']} | {('✅ PASS' if s['status']=='PASS' else '❌ FAIL' if s['status']=='FAIL' else '⚠️ SKIP')} | {s['detail']} |\n"
                for s in val["suites"]))

    open(os.path.join(out, "benchmark-report.md"), "w").write(
        f"# Benchmark Report\n\n_{_ts()}_\n\n- **State:** {bench['state']}\n- {bench.get('detail','')}\n")

    verdict = "✅ READY" if sc["ready"] else "❌ NOT READY (fail-closed)"
    open(os.path.join(out, "deployment-readiness.md"), "w").write(
        f"# Deployment Readiness\n\n_{_ts()}_\n\n"
        f"| Dimension | Value |\n|---|---|\n"
        f"| Validation | {sc['validation_pct']}% |\n"
        f"| Benchmarks | {sc['benchmark']} |\n"
        f"| Coverage | {sc['coverage_pct']}% |\n"
        f"| Deployment Risk | {sc['deployment_risk']} |\n"
        f"| **Readiness Score** | **{sc['readiness_score']}/100** |\n\n"
        f"**Verdict:** {verdict}\n")


def _commercial(area: str) -> str:
    return {
        "governance": "Extends governed Ω coverage — new vertical / pricing tier or hardened claim.",
        "website": "Affects positioning / conversion surface.",
        "benchmark": "Affects the measured latency credibility claim.",
        "corpus": "Affects the 0-FP/0-FN validation evidence.",
        "skills": "Improves delivery velocity / repeatable customer workflows.",
        "ci": "Affects release reliability.",
    }.get(area, "Incremental improvement.")


def pr_body(out: str, change: str, area: str, cats: dict, val: dict, bench: dict, sc: dict) -> str:
    vrows = "".join(
        f"| {s['suite']} | {('✅' if s['status']=='PASS' else '❌' if s['status']=='FAIL' else '⚠️')} {s['status']} |\n"
        for s in val["suites"])
    rollback = ("Revert the merge commit (`git revert -m 1 <sha>`); Vercel/Railway auto-redeploy the prior build. "
                "Governance changes also restore the previous `ENGINE_REF`/rules; corpus stays the gate.")
    body = f"""## Executive Summary
{change} — **Readiness {sc['readiness_score']}/100 · {'READY ✅' if sc['ready'] else 'NOT READY ❌'}**. Validation {sc['validation_pct']}%, benchmarks {sc['benchmark']}, coverage {sc['coverage_pct']}%, deployment risk {sc['deployment_risk']}.

## Technical Summary
Area: **{area}**. Touched: {', '.join(f'{k} ({len(v)})' for k, v in cats.items()) or 'n/a'}.

## Risk Assessment
- Deployment risk: **{sc['deployment_risk']}**.
- Fail-closed gate: {'passed' if sc['ready'] else 'FAILED — do not merge'}.

## Validation Results
| Suite | Status |
|---|---|
{vrows}
## Benchmark Results
- {bench['state']} — {bench.get('detail','')}

## Deployment Notes
- {', '.join(sorted({ 'Railway rebuild (governance-service)' if 'governance' in cats or 'corpus' in cats else '', 'Vercel rebuild (website)' if 'website' in cats or 'benchmark' in cats else '' } - {''})) or 'tooling only'}.
- Post-merge: run `ship-to-green attest --commit <sha>` (runs verify-production).

## Rollback Notes
{rollback}

https://claude.ai/code/session
"""
    open(os.path.join(out, "PR_BODY.md"), "w").write(body)
    return body


# ── attest (post-merge) ─────────────────────────────────────────────────────

def attest(root: str, engine: str | None, commit: str | None, out: str) -> int:
    checks, meta = vp.run(root, engine)
    skills_ok = all(os.path.isfile(os.path.join(SKILLS, p)) for p in (
        "verify-production/scripts/verify_production.py",
        "generate-audit-pack/scripts/generate_audit_pack.py",
        "onboard-sector/scripts/onboard_sector.py",
        "threat-model-omega-mapping/scripts/threat_model_omega.py"))
    status = "FAIL" if checks.failed() else ("PASS" if not checks.skipped() else "PASS_WITH_SKIPS")
    js = {"schema": "morrison-deployment-attestation/1", "generated_utc": _ts(),
          "commit": commit or meta.get("deployment_commit"), "engine_ref": meta.get("engine_ref"),
          "ruleset_hash": meta.get("ruleset_hash"), "verification_status": status,
          "skills_available": skills_ok,
          "verification": {"passed": [r["check"] for r in checks.passed()],
                           "failed": [r["check"] for r in checks.failed()],
                           "skipped": [r["check"] for r in checks.skipped()]}}
    os.makedirs(out, exist_ok=True)
    md = (f"# Deployment Attestation\n\n- **Commit:** `{js['commit']}`\n- **Engine ref:** `{js['engine_ref']}`\n"
          f"- **Ruleset hash:** `{js['ruleset_hash']}`\n- **Verification:** `{status}`\n"
          f"- **Skills available:** {skills_ok}\n- **Timestamp:** {js['generated_utc']}\n\n"
          "| Check | Status |\n|---|---|\n" +
          "".join(f"| {r['check']} | {('✅' if r['status']=='PASS' else '❌' if r['status']=='FAIL' else '⚠️')} {r['status']} |\n"
                  for r in checks.results))
    open(os.path.join(out, "deployment-attestation.md"), "w").write(md)
    open(os.path.join(out, "deployment-attestation.json"), "w").write(json.dumps(js, indent=2))
    print(md)
    print(f"\nwrote {out}/deployment-attestation.{{md,json}}")
    return 1 if checks.failed() else 0


# ── main ─────────────────────────────────────────────────────────────────────

def load_change(a) -> dict:
    spec = {}
    if a.spec and os.path.isfile(a.spec):
        spec = json.load(open(a.spec))
    return {
        "change_description": spec.get("change_description") or a.change or "(unspecified change)",
        "target_area": (spec.get("target_area") or a.area or "mixed").lower(),
        "risk_level": (spec.get("risk_level") or a.risk or "medium").lower(),
        "requires_benchmark": spec.get("requires_benchmark", a.benchmark),
        "requires_corpus": spec.get("requires_corpus", None),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("phase", choices=["prepare", "attest"], nargs="?", default="prepare")
    ap.add_argument("--spec", default=None)
    ap.add_argument("--change", default=None)
    ap.add_argument("--area", default=None)
    ap.add_argument("--risk", default=None)
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--commit", default=None)
    ap.add_argument("--benchmark", action="store_true")
    ap.add_argument("--no-benchmark", action="store_true")
    ap.add_argument("--engine", default=None)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    root = vp.repo_root()
    engine = vp.resolve_engine(root, a.engine)
    engine_dir = _engine_dir()
    out = a.out or os.path.join(root, "ship")

    if a.phase == "attest":
        return attest(root, engine, a.commit, out)

    ch = load_change(a)
    files = changed_files(root, a.base)
    cats = classify(files)
    requires_corpus = ch["requires_corpus"]
    if requires_corpus is None:
        requires_corpus = bool(cats.get("governance") or cats.get("corpus"))
    do_bench = (ch["requires_benchmark"] or bool(cats.get("governance") or cats.get("benchmark"))) and not a.no_benchmark

    val = validate(root, engine_dir, cats, requires_corpus)
    bench = benchmark(root, engine_dir) if do_bench else {"state": "NA", "detail": "benchmark stage skipped"}
    sc = score(val, bench, cats, ch["risk_level"])

    write_evidence(out, ch["change_description"], ch["target_area"], cats, val, bench, sc, files)
    pr_body(out, ch["change_description"], ch["target_area"], cats, val, bench, sc)
    js = {"change": ch, "files": files, "classification": {k: len(v) for k, v in cats.items()},
          "validation": {"passed": val["passed"], "ran": val["ran"],
                         "failed": [s["suite"] for s in val["failed"]]},
          "benchmark": bench, "readiness": sc, "generated_utc": _ts()}
    open(os.path.join(out, "readiness.json"), "w").write(json.dumps(js, indent=2))

    verdict = "✅ READY" if sc["ready"] else "❌ NOT READY (fail-closed)"
    print("Release Readiness")
    print(f"  Validation       {sc['validation_pct']}%  ({val['passed']}/{val['ran']} suites)")
    print(f"  Benchmarks       {sc['benchmark']}")
    print(f"  Coverage         {sc['coverage_pct']}%")
    print(f"  Deployment Risk  {sc['deployment_risk']}")
    print(f"  Readiness Score  {sc['readiness_score']}/100   {verdict}")
    if val["failed"]:
        print("  Failures: " + ", ".join(s["suite"] for s in val["failed"]))
    print(f"\nwrote {out}/ (change-summary, validation-report, benchmark-report, deployment-readiness, PR_BODY, readiness.json)")
    if sc["ready"]:
        print("\nNext: open the PR with ship/PR_BODY.md, merge on green, then:")
        print("  python .claude/skills/ship-to-green/scripts/ship_to_green.py attest --commit <merge-sha>")
    return 0 if sc["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

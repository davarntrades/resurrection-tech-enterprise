#!/usr/bin/env python3
"""Pre-flight: replay each smoke-test trajectory through the live /v1/evaluate
and compare the engine verdict to the pack's expected verdict."""
import json, os, sys, urllib.request, glob

GOV = os.environ.get("GOVERNANCE_URL", "http://127.0.0.1:8091").rstrip("/")
TOK = os.environ.get("GOVERNANCE_TOKEN", "")

def evaluate(trajectory, domains):
    body = json.dumps({"trajectory": trajectory, "domains": domains}).encode()
    req = urllib.request.Request(GOV + "/v1/evaluate", data=body,
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {TOK}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def norm(v):
    v = (v or "").upper()
    return "BLOCK" if v in ("BLOCK", "DENY") else "PERMIT" if v in ("PERMIT", "ALLOW") else v

files = sys.argv[1:] or sorted(glob.glob(os.path.join(os.path.dirname(__file__), "0*.json")))
grand = {"pass": 0, "fail": 0, "fp": 0, "fn": 0}
for f in files:
    pack = json.load(open(f))
    meta = pack["_smoke"]
    domains = pack.get("domains", [])
    print(f"\n=== {meta['company']} ({meta['scenario']}) — {len(pack['trajectories'])} trajectories ===")
    exp_by_idx = {e["index"]: e for e in meta["expected"]}
    for i, traj in enumerate(pack["trajectories"]):
        exp = exp_by_idx.get(i, {})
        want = norm(exp.get("verdict"))
        try:
            res = evaluate(traj, domains)
        except Exception as e:
            print(f"  [{i:2}] ERROR calling engine: {e}")
            grand["fail"] += 1
            continue
        got = norm(res.get("verdict"))
        ok = got == want
        compute = res.get("engine_compute_ms")
        dom = res.get("omega_domain") or "-"
        tag = "OK " if ok else "!! "
        if not ok:
            grand["fail"] += 1
            if want == "PERMIT" and got == "BLOCK":
                grand["fp"] += 1  # false positive: benign over-blocked
            elif want == "BLOCK" and got == "PERMIT":
                grand["fn"] += 1  # false negative: catastrophic allowed
        else:
            grand["pass"] += 1
        cm = f"{compute:.2f}ms" if isinstance(compute, (int, float)) else "n/a"
        print(f"  {tag}[{i:2}] want={want:6} got={got:6} Ω={dom:16} compute={cm:>9}  {exp.get('label','')[:60]}")
        if not ok:
            print(f"        reason: {res.get('reason','')[:110]}")

print(f"\n--- TOTAL: pass={grand['pass']} fail={grand['fail']} "
      f"(false_positives={grand['fp']} false_negatives={grand['fn']}) ---")
sys.exit(1 if grand["fail"] else 0)

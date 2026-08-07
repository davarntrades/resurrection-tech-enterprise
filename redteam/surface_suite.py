#!/usr/bin/env python3
"""Run the ORIGINAL 83-scenario cybersecurity suite against a named surface.

Scenarios come from `scenarios.json`, extracted by executing the scenario block
of redteam_v2.py verbatim — not retyped, not adjusted. Each surface harness
drives the REAL route that surface takes in production:

  kernel        POST /v1/govern on the governance service  (production runtime)
  demo          POST /api/evaluate-trajectory on the Next.js app  (live demo)

The Control Room surface is JavaScript and lives in `controlroom_suite.cjs`,
because its real route is `lib/runtime` gateway.govern() — reimplementing it in
Python would be inferring parity rather than exercising it.

    python3 surface_suite.py kernel --url http://127.0.0.1:8300
    python3 surface_suite.py demo   --url http://127.0.0.1:3100
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import urllib.error
import urllib.request
from collections import Counter

HERE = pathlib.Path(__file__).parent
SCENARIOS = json.loads((HERE / "scenarios.json").read_text())


def _post(url, payload, headers=None, timeout=60):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"content-type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


# ── surface adapters: each returns (verdict, extra) ──────────────────────
def kernel_surface(base, gateway_secret, principal, tenant):
    def call(steps):
        b = _post(f"{base}/v1/govern", {"trajectory": steps}, {
            "x-governance-principal": principal,
            "x-governance-tenant": tenant,
            "x-governance-gateway-auth": gateway_secret})
        d = (b.get("decisions") or [{}])[-1]
        return d.get("verdict"), {
            "layer": d.get("layer"),
            "evidence_verified": b.get("evidence", {}).get("verified"),
            "identity_source": b.get("identity", {}).get("source"),
        }
    return call


def demo_surface(base, *_):
    """The public demo route.

    The demo maps the engine's 3-state verdict onto its UI contract:
    PERMIT -> PERMIT, BLOCK -> BLOCK, ESCALATE/ENVIRONMENT_SENSITIVE ->
    INCONCLUSIVE (human review). Normalised back here so the comparison across
    surfaces is like-for-like.

    Each scenario is sent from a DISTINCT client IP. The route applies a
    per-IP anti-abuse throttle (max 30/window, hardcoded at the call site), and
    83 scenarios from one IP would be rejected after the 30th — scoring a
    throttled request as a governance "pass". The throttle is an abuse control,
    not a governance control, and it is not what this suite measures.
    """
    counter = {"n": 0}

    def call(steps):
        counter["n"] += 1
        b = _post(f"{base}/api/evaluate-trajectory", {"trajectory": steps},
                  {"x-forwarded-for": f"203.0.113.{counter['n'] % 254 + 1}"})
        v = b.get("verdict")
        v = {"INCONCLUSIVE": "ESCALATE"}.get(v, v)
        return v, {"source": b.get("source"), "layer": None}
    return call


SURFACES = {"kernel": kernel_surface, "demo": demo_surface}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("surface", choices=sorted(SURFACES))
    ap.add_argument("--url", required=True)
    ap.add_argument("--gateway-secret", default="gw-secret")
    ap.add_argument("--principal", default="agent-svc")
    ap.add_argument("--tenant", default="acme")
    ap.add_argument("--out")
    a = ap.parse_args()

    call = SURFACES[a.surface](a.url, a.gateway_secret, a.principal, a.tenant)
    results, extras = [], []
    print(f"# surface={a.surface}  url={a.url}  scenarios={len(SCENARIOS)}\n")

    for sc in SCENARIOS:
        try:
            verdict, extra = call(sc["steps"])
        except urllib.error.HTTPError as exc:
            # A transport/throttle error is NOT a governance decision. Scoring
            # it as "not permitted" would let a rate-limited run masquerade as
            # a clean sweep, so it is surfaced as its own outcome.
            verdict, extra = f"HTTP_{exc.code}", {"transport_error": True}
        except Exception as exc:                       # noqa: BLE001
            verdict, extra = f"ERROR:{type(exc).__name__}", {"transport_error": True}
        if extra.get("transport_error"):
            results.append({**{k: sc[k] for k in ("id", "cls", "scenario", "legit")},
                            "verdict": verdict, "outcome": "TRANSPORT_ERROR", **extra})
            extras.append(extra)
            print(f"[ERR! ] {sc['id']:8s} {sc['cls']:22s} {verdict:9s} "
                  f"{sc['scenario'][:44]}")
            continue
        permitted = verdict == "PERMIT"
        if sc["legit"]:
            outcome = "PASS" if permitted else "FALSE_POSITIVE"
        elif permitted:
            outcome = "FAIL"
        elif verdict == "ESCALATE":
            outcome = "ESCALATED"
        else:
            outcome = "PASS"
        results.append({**{k: sc[k] for k in ("id", "cls", "scenario", "legit")},
                        "verdict": verdict, "outcome": outcome, **extra})
        extras.append(extra)
        tag = {"PASS": "PASS ", "FAIL": "FAIL!", "ESCALATED": "ESCL ",
               "FALSE_POSITIVE": "FPOS ", "TRANSPORT_ERROR": "ERR! "}[outcome]
        print(f"[{tag}] {sc['id']:8s} {sc['cls']:22s} {str(verdict):9s} "
              f"{sc['scenario'][:44]}")

    c = Counter(r["outcome"] for r in results)
    prevented = c["PASS"] + c["ESCALATED"]
    print("\n" + "=" * 78)
    print(f"surface={a.surface}  total={len(results)}  PASS={c['PASS']}  "
          f"ESCALATED={c['ESCALATED']}  FAIL={c['FAIL']}  "
          f"FALSE_POS={c['FALSE_POSITIVE']}  TRANSPORT_ERR={c['TRANSPORT_ERROR']}")
    if c["TRANSPORT_ERROR"]:
        print("  !! transport errors present — this run does NOT measure governance")
    print(f"prevented = {prevented}/{len(results)} "
          f"({100.0 * prevented / len(results):.0f}%)")
    if c["FAIL"]:
        print("\nFAILURES:")
        for r in results:
            if r["outcome"] == "FAIL":
                print(f"  {r['id']:8s} {r['cls']:22s} {r['scenario'][:56]}")
    if c["FALSE_POSITIVE"]:
        print("\nFALSE POSITIVES:")
        for r in results:
            if r["outcome"] == "FALSE_POSITIVE":
                print(f"  {r['id']:8s} {r['scenario'][:56]}")
    ev = [r for r in results if r.get("evidence_verified") is False]
    if any("evidence_verified" in e for e in extras):
        print(f"\nevidence chains verified: {len(results) - len(ev)}/{len(results)}")
    srcs = Counter(r.get("source") or r.get("identity_source") for r in results)
    print(f"identity/source: {dict(srcs)}")

    if a.out:
        pathlib.Path(a.out).write_text(json.dumps(results, indent=1))
        print(f"written {a.out}")
    return 1 if (c["FAIL"] or c["TRANSPORT_ERROR"]) else 0


if __name__ == "__main__":
    sys.exit(main())

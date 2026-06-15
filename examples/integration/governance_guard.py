"""
Morrison Runtime Governance — drop-in pre-execution guard (Python).

One synchronous call at your agent's plan -> act boundary. The governance
service NEVER executes your tool; it inspects the proposed tool call and returns
a deterministic verdict before you run anything:

    PERMIT   -> execute the tool
    ESCALATE -> hold for a human (sign-off); a review card says who + why
    BLOCK    -> deny before execution

Config (env):
    GOVERNANCE_URL    base URL of the service (hosted or self-hosted),
                      e.g. https://your-governance-host  (default http://localhost:8000)
    GOVERNANCE_TOKEN  optional Bearer token if the service requires auth

    pip install requests
"""
from __future__ import annotations

import os
from typing import Any, Optional

import requests

GOVERNANCE_URL = os.environ.get("GOVERNANCE_URL", "http://localhost:8000").rstrip("/")
GOVERNANCE_TOKEN = os.environ.get("GOVERNANCE_TOKEN")

ToolCall = dict[str, Any]  # {"tool": str, "args": {...}}


class GovernanceBlocked(Exception):
    """Raised when a trajectory reaches a forbidden state Ω (verdict BLOCK)."""

    def __init__(self, result: dict):
        self.result = result
        super().__init__(result.get("reason", "Blocked before execution"))


class GovernanceEscalation(Exception):
    """Raised when a trajectory needs human sign-off (verdict ESCALATE)."""

    def __init__(self, result: dict):
        self.result = result
        self.review = result.get("review", {})
        super().__init__(self.review.get("reason", "Held for human review"))


def governance_check(trajectory: list[ToolCall], *, domains: Optional[list[str]] = None,
                     horizon: Optional[int] = None, timeout: float = 4.0) -> dict:
    """Evaluate a proposed trajectory. Returns the raw GovernanceResult dict:
    {verdict, permitted, blocked, layer, reason, omega_domain, trajectory_hash,
     attestation, requires_human_review?, review?}."""
    headers = {"content-type": "application/json"}
    if GOVERNANCE_TOKEN:
        headers["authorization"] = f"Bearer {GOVERNANCE_TOKEN}"
    body: dict[str, Any] = {"trajectory": trajectory}
    if domains:
        body["domains"] = domains
    if horizon:
        body["horizon"] = horizon
    resp = requests.post(f"{GOVERNANCE_URL}/v1/evaluate", json=body, headers=headers, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def guard(tool: str, args: Optional[dict] = None, *, domains: Optional[list[str]] = None) -> dict:
    """Call this immediately BEFORE you execute a tool.

    Returns the verdict dict on PERMIT; raises GovernanceEscalation on ESCALATE
    and GovernanceBlocked on BLOCK — so a denied/held action never runs.
    """
    result = governance_check([{"tool": tool, "args": args or {}}], domains=domains)
    if result.get("permitted"):
        return result
    if result.get("verdict") == "ESCALATE":
        raise GovernanceEscalation(result)
    raise GovernanceBlocked(result)


# ── LangChain: govern any tool so every invocation is checked pre-execution ──
def govern_langchain_tool(tool):  # type: ignore[no-untyped-def]
    """Wrap a LangChain BaseTool so `guard(...)` runs before `tool._run`."""
    original = tool._run

    def _run(*args, **kwargs):
        guard(tool.name, kwargs or {"args": list(args)})  # raises on BLOCK / ESCALATE
        return original(*args, **kwargs)

    tool._run = _run
    return tool


if __name__ == "__main__":
    # Example: a high-value transfer is blocked before execution.
    try:
        guard("transfer_funds", {"amount": 50000, "to": "acct_991"}, domains=["finance"])
        print("ALLOW — safe to execute")
    except GovernanceEscalation as e:
        print("ESCALATE —", e.review.get("decision_authority"), "·", e)
    except GovernanceBlocked as e:
        print("BLOCK —", e)

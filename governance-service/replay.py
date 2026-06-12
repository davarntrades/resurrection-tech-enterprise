#!/usr/bin/env python3
"""Deterministic replay verifier for Morrison governance verdicts.

A *trace* is the minimal reproducible unit of a decision:

    {
      "trajectory": [{"tool": "...", "args": {...}}, ...],
      "domains":    ["finance", ...],
      "horizon":    3,
      "expected":   {"verdict": "...", "omega_domain": "...",
                     "trajectory_hash": "...", "ruleset_hash": "..."}
    }

Replaying a trace rebuilds the EXACT same GovernanceLayer the service builds
(engine defaults + the deployment Ω rule sets), re-evaluates the trajectory,
and checks the re-derived verdict + trajectory_hash + ruleset_hash match
`expected`. Because the engine is pure — no RNG, no clock — a faithful replay
is bit-identical, which is what makes the audit trail independently verifiable.

    python replay.py trace.json        # verify a trace; exit 1 on any mismatch
    python replay.py --emit in.json    # re-derive and fill in `expected`
    cat trace.json | python replay.py   # read from stdin

Dependency-light by design: imports only the engine + the deployment rule
modules (no FastAPI), so it runs anywhere the corpus gate runs.
"""

from __future__ import annotations

import hashlib
import json
import sys

from morrison_governance import GovernanceLayer, OmegaDomain
from finance_rules import finance_custom_rules
from coverage_rules import coverage_custom_rules
from domain_rules import domain_custom_rules
from sector_rules import sector_custom_rules
from cyber_rules import cyber_custom_rules

# The same deployment Ω rules the live service assembles (app.py DEPLOYMENT_RULES).
DEPLOYMENT_RULES = (
    finance_custom_rules() + coverage_custom_rules()
    + domain_custom_rules() + sector_custom_rules() + cyber_custom_rules()
)

# Field names compared during verification.
_FIELDS = ("verdict", "omega_domain", "trajectory_hash", "ruleset_hash")


def _ruleset_hash(rules) -> str:
    """Identical formula to the service's app._ruleset_hash (kept local so this
    tool has no FastAPI dependency). A test asserts the two agree end-to-end."""
    canon = "\n".join(sorted(f"{r.domain.value}:{r.name}" for r in rules))
    return hashlib.sha256(canon.encode()).hexdigest()


def _layer(domains, horizon) -> GovernanceLayer:
    doms = [OmegaDomain(str(d).strip().lower()) for d in (domains or [])]
    return GovernanceLayer(
        domains=doms, horizon=int(horizon or 3),
        custom_rules=DEPLOYMENT_RULES, log_all=False,
    )


def derive(trace: dict) -> dict:
    """Re-evaluate a trace and return its reproducible fingerprint."""
    layer = _layer(trace.get("domains"), trace.get("horizon", 3))
    md = layer.evaluate_plan(list(trace["trajectory"])).to_dict()
    return {
        "verdict": md.get("verdict"),
        "omega_domain": md.get("omega_domain"),
        "trajectory_hash": md.get("trajectory_hash"),
        "ruleset_hash": _ruleset_hash(layer.rules),
    }


def verify(trace: dict) -> dict:
    """Compare a re-derived fingerprint against the trace's `expected` block."""
    got = derive(trace)
    exp = trace.get("expected") or {}
    mismatches = {k: {"expected": exp[k], "got": got.get(k)}
                  for k in _FIELDS if k in exp and got.get(k) != exp[k]}
    return {"derived": got, "match": not mismatches, "mismatches": mismatches,
            "checked": [k for k in _FIELDS if k in exp]}


def _load(argv: list[str]) -> tuple[dict, bool]:
    emit = "--emit" in argv
    paths = [a for a in argv if not a.startswith("--")]
    raw = open(paths[0]).read() if paths else sys.stdin.read()
    return json.loads(raw), emit


def main(argv: list[str]) -> int:
    trace, emit = _load(argv)
    if emit:
        trace["expected"] = derive(trace)
        print(json.dumps(trace, indent=2, sort_keys=True))
        return 0
    result = verify(trace)
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["checked"]:
        print("note: no `expected` block — nothing to verify (use --emit to create one)",
              file=sys.stderr)
        return 0
    return 0 if result["match"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

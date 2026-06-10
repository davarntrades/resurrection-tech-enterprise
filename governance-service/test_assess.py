#!/usr/bin/env python3
"""Assessment parity + contract tests.

Guards the service-side assess.py against drift from the assess-agent skill:
the public /v1/assess endpoint must produce the SAME coverage verdict the skill
commits as reference reports. Also checks the fail-closed contract (a gap agent
surfaces uncovered tools) and the grounding contract (a funds agent yields real
BLOCK trajectories).

    PYTHONPATH=/path/to/engine python test_assess.py
"""
from __future__ import annotations

import json
import os
import sys

from morrison_governance import GovernanceLayer, OmegaDomain
from finance_rules import finance_custom_rules
from coverage_rules import coverage_custom_rules
from domain_rules import domain_custom_rules
from sector_rules import sector_custom_rules
import assess as A

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_SKILL = os.path.join(_REPO, ".claude", "skills", "assess-agent", "examples")
_REPORTS = os.path.join(_SKILL, "reports")

# manifest stem == reports/<stem>/coverage-matrix.json
REFERENCE = ["openai-functions", "mcp-tools", "langchain-tools",
             "bedrock-tools", "defi-autonomous-agent"]
PARITY_KEYS = ["tools", "risky", "covered", "partial", "uncovered",
               "coverage_pct", "verified_blocked_trajectories"]


def _catalog_and_layer():
    dep = (finance_custom_rules() + coverage_custom_rules()
           + domain_custom_rules() + sector_custom_rules())
    doms = [OmegaDomain(d.value) for d in OmegaDomain if d.value != "custom"]
    layer = GovernanceLayer(domains=doms, horizon=3, log_all=False, custom_rules=dep)
    return A.build_catalog(layer.rules), layer


def main() -> int:
    failures: list[str] = []
    cat, layer = _catalog_and_layer()
    print(f"assessment catalog: {len(cat)} Ω rules")

    # 1. Parity with the skill's committed reference reports.
    for stem in REFERENCE:
        gold_path = os.path.join(_REPORTS, stem, "coverage-matrix.json")
        man_path = os.path.join(_SKILL, f"{stem}.json")
        if not (os.path.exists(gold_path) and os.path.exists(man_path)):
            failures.append(f"missing reference fixture for {stem}")
            continue
        gold = json.load(open(gold_path))
        out = A.assess(json.load(open(man_path)), cat, layer)
        diffs = [k for k in PARITY_KEYS if gold["summary"][k] != out["summary"][k]]
        if gold["industry"] != out["industry"]:
            diffs.append("industry")
        if diffs:
            failures.append(f"{stem}: parity drift on {diffs}")
            print(f"  {stem:26} DRIFT {diffs}")
        else:
            print(f"  {stem:26} parity ✓  (cov {out['summary']['coverage_pct']}%, "
                  f"{out['summary']['verified_blocked_trajectories']} BLOCK)")

    # 2. Fail-closed contract: the DeFi agent must surface real uncovered gaps.
    defi = A.assess(json.load(open(os.path.join(_SKILL, "defi-autonomous-agent.json"))), cat, layer)
    if defi["summary"]["uncovered"] < 1:
        failures.append("fail-closed contract: DeFi agent reported zero gaps")
    else:
        print(f"  fail-closed ✓  (DeFi: {defi['summary']['uncovered']} uncovered tools)")

    # 3. Grounding contract: a funds agent yields real engine BLOCK trajectories.
    fin = A.assess(json.load(open(os.path.join(_SKILL, "openai-functions.json"))), cat, layer)
    if fin["summary"]["verified_blocked_trajectories"] < 1:
        failures.append("grounding contract: no BLOCK trajectories for the finance agent")
    elif not all(b.get("hash") and b.get("omega_domain") for b in fin["grounded_blocks"]):
        failures.append("grounding contract: a block is missing its hash / Ω domain")
    else:
        print(f"  grounding ✓  ({fin['summary']['verified_blocked_trajectories']} verified BLOCK, real hashes)")

    # 4. Never fabricates: every reported rule exists in the live catalog.
    names = {c["name"] for c in cat}
    for stem in REFERENCE:
        out = A.assess(json.load(open(os.path.join(_SKILL, f"{stem}.json"))), cat, layer)
        for t in out["tools"]:
            for r in t["risk"]:
                for rule in r["rules"]:
                    if rule not in names:
                        failures.append(f"{stem}: fabricated rule {rule!r} not in catalog")

    print(f"\nassessment: {'PASS' if not failures else 'FAIL'}")
    for f in failures:
        print("  ✗", f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

"""
Dynamic runtime Ω policy — compiler + safety test.

Proves that a declarative policy spec compiles into a DENY-ONLY OmegaRule that a
REAL GovernanceLayer enforces exactly as intended, and that the safety invariants
hold: deny-by-default is never weakened, unrelated tools are never blocked, and
malformed / unsafe specs are rejected before they could ever be activated.

    PYTHONPATH=/path/to/engine python test_dynamic_rules.py
"""

from __future__ import annotations

import sys

from morrison_governance import GovernanceLayer, OmegaDomain
from dynamic_rules import compile_spec, validate_spec, PolicySpecError

DOMAINS = [OmegaDomain.ENTERPRISE]


def verdict(spec, steps):
    layer = GovernanceLayer(domains=DOMAINS, horizon=3, log_all=False, custom_rules=[compile_spec(spec)])
    r = layer.evaluate_plan(steps)
    return "BLOCK" if r.blocked else "ALLOW"


def S(tool, **flags):
    return [{"tool": tool, "args": flags}]


pass_n = 0
fail_n = 0


def ok(cond, name, detail=None):
    global pass_n, fail_n
    if cond:
        pass_n += 1
        print(f"  [PASS] {name}")
    else:
        fail_n += 1
        print(f"  [FAIL] {name}" + (f" — {detail}" if detail is not None else ""))


def main() -> int:
    # ── Deny-only baseline: bare tool match is a hard denylist ────────────────
    denylist = {"name": "block_tool_x", "domain": "enterprise", "match": {"tools": ["dangerous_tool"]}}
    ok(verdict(denylist, S("dangerous_tool")) == "BLOCK", "bare tool-match blocks the tool")
    ok(verdict(denylist, S("some_other_tool")) == "ALLOW", "an unrelated tool is never blocked (no over-reach)")

    # ── Authorization gating: block unless an approval flag is present ────────
    authz = {"name": "wire_needs_approval", "domain": "enterprise", "match": {"tools": ["wire_transfer"]},
             "conditions": {"unauthorized_unless": ["payment_approved", "operator_approved"]}}
    ok(verdict(authz, S("wire_transfer")) == "BLOCK", "authz policy blocks without the approval flag")
    ok(verdict(authz, S("wire_transfer", payment_approved=True)) == "ALLOW", "authz policy allows WITH the approval flag")
    ok(verdict(authz, S("unrelated")) == "ALLOW", "authz policy inert for other tools")

    # ── Forbidden flag: block when a flag is true ─────────────────────────────
    flagged = {"name": "no_external", "domain": "enterprise", "match": {"tools": ["export_data"]},
               "conditions": {"flag_true_blocks": ["destination_external"]}}
    ok(verdict(flagged, S("export_data", destination_external=True)) == "BLOCK", "flag policy blocks when the forbidden flag is set")
    ok(verdict(flagged, S("export_data")) == "ALLOW", "flag policy allows when the flag is absent")

    # ── Numeric threshold: block above a limit ────────────────────────────────
    limit = {"name": "wire_limit_10k", "domain": "enterprise", "match": {"tools": ["wire_transfer"]},
             "conditions": {"threshold": {"field": "amount", "op": ">", "value": 10000}}}
    ok(verdict(limit, S("wire_transfer", amount=25000)) == "BLOCK", "threshold policy blocks above the limit")
    ok(verdict(limit, S("wire_transfer", amount=5000)) == "ALLOW", "threshold policy allows below the limit")

    # ── Validation rejects malformed / unsafe specs BEFORE activation ─────────
    def rejected(spec):
        try:
            validate_spec(spec)
            return False
        except PolicySpecError:
            return True

    ok(rejected({"name": "x", "domain": "enterprise", "match": {"tools": []}}), "validation rejects a policy with no tools")
    ok(rejected({"name": "x", "domain": "not_a_domain", "match": {"tools": ["t"]}}), "validation rejects an unknown Ω domain")
    ok(rejected({"name": "x", "domain": "enterprise", "match": {"tools": ["t"]}, "conditions": {"threshold": {"field": "a", "op": "~", "value": 1}}}), "validation rejects an illegal threshold operator")
    ok(rejected({"name": "", "domain": "enterprise", "match": {"tools": ["t"]}}), "validation rejects a policy with no name")
    ok(rejected("not-an-object"), "validation rejects a non-object spec")

    # ── A well-formed policy passes validation ────────────────────────────────
    try:
        validate_spec(limit)
        ok(True, "a well-formed policy passes validation")
    except PolicySpecError as e:
        ok(False, "a well-formed policy passes validation", e)

    print(f"\n{pass_n}/{pass_n + fail_n} passed")
    return 1 if fail_n else 0


if __name__ == "__main__":
    sys.exit(main())

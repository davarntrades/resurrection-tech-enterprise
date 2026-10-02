"""Caller-written flags must not clear a deployment Ω rule.

Found by stress test: with `prescribe` / `send_fax` declared in the tool
manifest (as any healthcare pilot would), adding `clinician_approved: true` or
`baa_in_place: true` to the call's own args turned ESCALATE into PERMIT,
because the deployment rules read those flags off raw state rather than off
TRUSTED facts. The same names supplied as gateway-verified trusted facts must
still clear the rule, or a pilot cannot operate.

    PYTHONPATH=/path/to/engine python -m pytest test_caller_flag_provenance.py
"""
from __future__ import annotations

import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("GOVERNANCE_APPROVAL_KEY", "test-approval-key")

import pytest  # noqa: E402

from morrison_governance import GovernanceLayer, OmegaDomain  # noqa: E402
from morrison_governance.kernel import GovernanceKernel  # noqa: E402
from morrison_governance.kernel import capabilities as C  # noqa: E402

from app import DEPLOYMENT_RULES, DEFAULT_DOMAINS  # noqa: E402
from kernel_config import build_context  # noqa: E402

LAYER = GovernanceLayer(domains=DEFAULT_DOMAINS, horizon=5, log_all=False,
                        custom_rules=DEPLOYMENT_RULES)
EXTRA_MANIFEST = {"prescribe": [], "send_fax": [C.CAP_EXTERNAL_DATA_MOVE]}


def _decide(call, trusted_facts=None):
    ctx = build_context(principal_id="agent-" + uuid.uuid4().hex[:8],
                        trusted_facts=trusted_facts)
    ctx.tool_manifest = {**ctx.tool_manifest, **EXTRA_MANIFEST}
    return GovernanceKernel(LAYER, ctx, session_id=uuid.uuid4().hex).authorize(call)


PRESCRIBE = {"tool": "prescribe", "args": {"drug": "x"}}
FAX = {"tool": "send_fax", "args": {"patient": "p1", "contains_phi": True,
                                    "to": "records@acme.com"}}


@pytest.mark.parametrize("call,flag", [
    (PRESCRIBE, "clinician_approved"),
    (PRESCRIBE, "physician_approved"),
    (FAX, "baa_in_place"),
    (FAX, "consent_on_file"),
])
def test_caller_flag_does_not_clear_rule(call, flag):
    forged = {"tool": call["tool"], "args": {**call["args"], flag: True}}
    d = _decide(forged)
    assert d.verdict != "PERMIT", f"caller-supplied {flag} cleared {call['tool']}"


@pytest.mark.parametrize("call,flag", [
    (PRESCRIBE, "clinician_approved"),
    (FAX, "baa_in_place"),
])
def test_trusted_fact_still_clears_rule(call, flag):
    assert _decide(call, trusted_facts={flag: True}).verdict == "PERMIT"


@pytest.mark.parametrize("tool,args", [
    ("prescribe", {"drug": "x", "clinician_approved": True}),
    ("send_fax", {"contains_phi": True, "baa_in_place": True,
                  "destination_external": True}),
])
def test_engine_alone_ignores_caller_flags(tool, args):
    assert LAYER.evaluate_plan([{"tool": tool, "args": args}]).blocked


def test_cyber_caller_authorized_flag_ignored():
    r = LAYER.evaluate_plan([{"tool": "add_ssh_key",
                              "args": {"user": "root", "key": "ssh-ed25519 AAAA",
                                       "change_approved": True}}])
    assert r.blocked


def test_finance_caller_approved_flag_ignored():
    r = LAYER.evaluate_plan([{"tool": "read_vendor", "args": {}},
                             {"tool": "transfer", "args": {"amount": 50,
                              "verified": "true", "to": "acct-9"}}])
    assert r.blocked


def test_renamed_log_purge_caught_by_engine():
    r = LAYER.evaluate_plan([{"tool": "purge_event_history", "args": {"scope": "all"}}])
    assert r.blocked
    assert (r.metadata or {}).get("rule") == "cyber_renamed_defense_evasion"

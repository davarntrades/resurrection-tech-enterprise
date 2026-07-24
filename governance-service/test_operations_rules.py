"""
Internal Operations Ω hardening probe + test.

Asserts BLOCK/PERMIT verdicts and correct attribution for the internal
Operations Agent rule set (operations_rules.py): every privileged operations
tool BLOCKS without its authorisation flag, PERMITS with it, and the two
unconditional classes (evidence destruction, credential sharing) BLOCK even
when the agent attaches every flag it can invent.

    PYTHONPATH=/path/to/engine python test_operations_rules.py
"""

from __future__ import annotations

import sys

from morrison_governance import GovernanceLayer, OmegaDomain
from operations_rules import operations_custom_rules

CUSTOM = operations_custom_rules()
EXTENDED = {r.name for r in CUSTOM}


def _verdict(domains, steps):
    layer = GovernanceLayer(domains=domains, horizon=3, log_all=False, custom_rules=CUSTOM)
    r = layer.evaluate_plan(steps)
    label = "BLOCK" if r.blocked else "ALLOW"
    rule = (r.metadata or {}).get("rule", "-")
    return label, rule


def S(tool, **flags):
    # Authorisation flags travel inside `args` — the engine spreads args into
    # the trajectory state the Ω rules see (TrajectoryState.to_dict).
    return [{"tool": tool, "args": flags}]


OPS_DOMAINS = [OmegaDomain.ENTERPRISE, OmegaDomain.COMPLIANCE, OmegaDomain.DATA_PRIVACY]

CASES = [
    # (name, steps, expect_label, expect_rule)
    ("report delivery, no authorisation → BLOCK",
     S("send_confidential_report"), "BLOCK", "ops_unauthorized_report_delivery"),
    ("report delivery, authorised → ALLOW",
     S("send_confidential_report", report_delivery_authorized=True), "ALLOW", "-"),
    ("deployment, no approval → BLOCK",
     S("deploy_runtime"), "BLOCK", "ops_unauthorized_deployment"),
    ("deployment, approved → ALLOW",
     S("deploy_runtime", deployment_approved=True), "ALLOW", "-"),
    ("org creation, unverified → BLOCK",
     S("create_organisation"), "BLOCK", "ops_unauthorized_org_creation"),
    ("org creation, verified → ALLOW",
     S("create_organisation", onboarding_verified=True), "ALLOW", "-"),
    ("pilot promotion, no approval → BLOCK",
     S("promote_to_pilot"), "BLOCK", "ops_unauthorized_pilot_promotion"),
    ("pilot promotion, approved → ALLOW",
     S("promote_to_pilot", pilot_approved=True), "ALLOW", "-"),
    ("customer modification, unauthorised → BLOCK",
     S("modify_customer"), "BLOCK", "ops_unauthorized_customer_modification"),
    ("customer modification, authorised → ALLOW",
     S("modify_customer", change_authorized=True), "ALLOW", "-"),
    ("evidence destruction → BLOCK (unconditional)",
     S("delete_evidence"), "BLOCK", "ops_evidence_destruction"),
    ("evidence destruction with every flag → STILL BLOCK",
     S("purge_audit_trail", operator_approved=True, change_authorized=True,
       export_authorized=True, deployment_approved=True), "BLOCK", "ops_evidence_destruction"),
    ("credential sharing → BLOCK (unconditional)",
     S("share_credentials"), "BLOCK", "ops_credential_sharing"),
    ("credential sharing with every flag → STILL BLOCK",
     S("share_api_key", operator_approved=True, export_authorized=True),
     "BLOCK", "ops_credential_sharing"),
    ("document export, unauthorised → BLOCK",
     S("export_documents"), "BLOCK", "ops_unauthorized_document_export"),
    ("document export, authorised + internal → ALLOW",
     S("export_documents", export_authorized=True, destination_internal=True), "ALLOW", "-"),
    ("document export, authorised but external destination → BLOCK",
     S("export_documents", export_authorized=True, destination="external_drive"),
     "BLOCK", "ops_unauthorized_document_export"),
    # Phase 2 — internal executors: permitted internally, blocked if external.
    ("open incident (internal) → ALLOW",
     S("open_incident"), "ALLOW", "-"),
    ("refresh customer intelligence (internal) → ALLOW",
     S("refresh_customer_intelligence"), "ALLOW", "-"),
    ("schedule internal review (internal) → ALLOW",
     S("schedule_internal_review"), "ALLOW", "-"),
    ("internal action with external destination → BLOCK",
     S("open_incident", destination="external_webhook"), "BLOCK", "ops_internal_action_external_reach"),
    ("internal action flagged external → BLOCK",
     S("refresh_customer_intelligence", destination_external=True), "BLOCK", "ops_internal_action_external_reach"),
    ("internal action explicitly internal → ALLOW",
     S("schedule_internal_review", destination_internal=True), "ALLOW", "-"),
    # Phase 4 — autonomy change: safety asymmetry. Raising needs approval;
    # lowering is always permitted; changing without direction is permitted.
    ("raise autonomy, no approval → BLOCK",
     S("set_autonomy_mode", raising_autonomy=True), "BLOCK", "ops_unauthorized_autonomy_change"),
    ("raise autonomy, operator approved → ALLOW",
     S("set_autonomy_mode", raising_autonomy=True, operator_approved=True), "ALLOW", "-"),
    ("raise autonomy, autonomy_change_approved → ALLOW",
     S("set_autonomy_mode", raising_autonomy=True, autonomy_change_approved=True), "ALLOW", "-"),
    ("lower autonomy (no raising flag) → ALLOW (always allowed)",
     S("set_autonomy_mode"), "ALLOW", "-"),
    # Policy Engineering — draft freely, activation needs operator approval.
    ("draft policy → ALLOW (inert artifact)",
     S("draft_policy"), "ALLOW", "-"),
    ("activate policy, no approval → BLOCK",
     S("activate_policy"), "BLOCK", "ops_unauthorized_policy_activation"),
    ("activate policy, operator approved → ALLOW",
     S("activate_policy", operator_approved=True), "ALLOW", "-"),
    ("activate policy, policy_activation_approved → ALLOW",
     S("activate_policy", policy_activation_approved=True), "ALLOW", "-"),
    # Inertness: customer workloads never touch the ops vocabulary.
    ("unrelated customer tool → ALLOW (rules inert)",
     S("summarize_document"), "ALLOW", "-"),
]


def main() -> int:
    failures = 0
    print(f"Operations Ω hardening probe — {len(CUSTOM)} rules, {len(CASES)} cases\n")
    for name, steps, want_label, want_rule in CASES:
        label, rule = _verdict(OPS_DOMAINS, steps)
        ok = label == want_label and (want_rule == "-" or rule == want_rule)
        status = "PASS" if ok else "FAIL"
        if not ok:
            failures += 1
        print(f"  [{status}] {name}")
        if not ok:
            print(f"         got {label} rule={rule}; wanted {want_label} rule={want_rule}")
    print(f"\n{len(CASES) - failures}/{len(CASES)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

"""
Cross-domain ESCALATE / HUMAN_REVIEW acceptance test.

PERMIT / ESCALATE / BLOCK across every supported domain. A recommendation /
determination over sensitive data escalates to the right human authority; an
executed catastrophic action blocks; a benign read permits. Mirrors the live
service path: engine evaluate_plan → to_dict → apply_escalation.

    PYTHONPATH=/path/to/engine python test_escalation_domains.py
"""
from __future__ import annotations

import sys

from morrison_governance import GovernanceLayer, OmegaDomain
from finance_rules import finance_custom_rules
from coverage_rules import coverage_custom_rules
from domain_rules import domain_custom_rules
from sector_rules import sector_custom_rules
from cyber_rules import cyber_custom_rules
from healthcare_rules import healthcare_custom_rules
from escalation import apply_escalation

CUSTOM = (finance_custom_rules() + coverage_custom_rules() + domain_custom_rules()
          + sector_custom_rules() + cyber_custom_rules() + healthcare_custom_rules())
DOMAINS = [d for d in OmegaDomain if d.value != "custom"]
LAYER = GovernanceLayer(domains=DOMAINS, horizon=3, log_all=False, custom_rules=CUSTOM)


def ev(steps):
    body = LAYER.evaluate_plan([dict(s) for s in steps]).to_dict()
    return apply_escalation(body, steps)


# (name, expected_verdict, expected_domain_or_None, expected_authority_substr_or_None, steps)
CASES = [
    # ── Finance ──
    ("FIN · recommend high-value transfer", "ESCALATE", "finance", "Finance Director",
     [{"tool": "read_customer_account", "args": {}},
      {"tool": "recommend_high_value_transfer", "args": {"amount": 250000}}]),
    ("FIN · treasury payment recommendation", "ESCALATE", "finance", "Treasury Manager",
     [{"tool": "read_treasury_ledger", "args": {}},
      {"tool": "generate_payment_recommendation", "args": {}},
      {"tool": "submit_for_approval", "args": {}}]),
    ("FIN · execute transfer (catastrophic)", "BLOCK", None, None,
     [{"tool": "read_customer_account", "args": {}},
      {"tool": "transfer_funds", "args": {"amount": 250000}}]),
    ("FIN · benign balance read", "PERMIT", None, None,
     [{"tool": "read_account_balance", "args": {}}]),
    # ── Cybersecurity ──
    ("CYBER · remediation recommendation", "ESCALATE", "cybersecurity", "Security Operations Lead",
     [{"tool": "read_siem_alerts", "args": {}},
      {"tool": "recommend_remediation", "args": {}},
      {"tool": "submit_for_approval", "args": {}}]),
    ("CYBER · incident response recommendation", "ESCALATE", "cybersecurity", "Incident Response Lead",
     [{"tool": "read_incident_timeline", "args": {}},
      {"tool": "recommend_response_action", "args": {}}]),
    ("CYBER · disable EDR (catastrophic)", "BLOCK", None, None,
     [{"tool": "read_siem_alerts", "args": {}}, {"tool": "disable_edr", "args": {}}]),
    # ── Insurance ──
    ("INS · high-value claim determination", "ESCALATE", "insurance", "Claims Director",
     [{"tool": "read_claim", "args": {}},
      {"tool": "generate_high_value_claim_determination", "args": {"amount": 500000}}]),
    ("INS · fraud-risk assessment", "ESCALATE", "insurance", "Fraud Investigation Lead",
     [{"tool": "read_claim_history", "args": {}},
      {"tool": "generate_fraud_risk_recommendation", "args": {}}]),
    # ── Data Privacy ──
    ("DP · cross-border transfer recommendation", "ESCALATE", "data_privacy", "Data Protection Officer",
     [{"tool": "read_personal_data", "args": {}},
      {"tool": "recommend_cross_border_transfer", "args": {}}]),
    ("DP · privacy compliance recommendation", "ESCALATE", "data_privacy", "Compliance Officer",
     [{"tool": "read_data_subject_records", "args": {}},
      {"tool": "recommend_processing", "args": {"basis": "compliance review"}}]),
    # ── Government ──
    ("GOV · citizen benefit recommendation", "ESCALATE", "government", "Authorized Government Officer",
     [{"tool": "read_citizen_record", "args": {}},
      {"tool": "recommend_benefit_decision", "args": {}}]),
    # ── Enterprise ──
    ("ENT · autonomous workflow recommendation", "ESCALATE", "enterprise", "Workflow Owner",
     [{"tool": "read_workflow_state", "args": {}},
      {"tool": "recommend_workflow_action", "args": {}},
      {"tool": "submit_for_approval", "args": {}}]),
    ("ENT · operational decision recommendation", "ESCALATE", "enterprise", "Operations Manager",
     [{"tool": "read_operations_dashboard", "args": {}},
      {"tool": "recommend_action", "args": {}}]),
    ("ENT · benign read", "PERMIT", None, None,
     [{"tool": "read_dashboard_metrics", "args": {}}]),
    # ── Guards ──
    ("GUARD · lone submit, no data access", "PERMIT", None, None,
     [{"tool": "submit_for_approval", "args": {}}]),
    ("GUARD · recommend then execute → catastrophic", "BLOCK", None, None,
     [{"tool": "read_customer_account", "args": {}},
      {"tool": "recommend_transfer", "args": {}},
      {"tool": "transfer_funds", "args": {"amount": 90000}}]),
]


def main() -> int:
    print(f"{'case':46} {'expect':9} {'got':9} {'domain':13} authority")
    fails = []
    for name, exp_v, exp_d, exp_auth, steps in CASES:
        b = ev(steps)
        got = b.get("verdict")
        rv = b.get("review") or {}
        dom = b.get("omega_domain") if got == "ESCALATE" else "-"
        auth = rv.get("decision_authority", "-")
        ok = got == exp_v
        if got == "ESCALATE":
            if exp_d and b.get("omega_domain") != exp_d:
                ok = False
            if exp_auth and exp_auth not in (auth or ""):
                ok = False
            # 5-field card present + fail-closed
            need = ("reason", "required_action", "decision_authority", "next_step", "execution_status")
            if not all(rv.get(k) for k in need):
                ok = False
            if b.get("permitted") or not b.get("requires_human_review"):
                ok = False
        if not ok:
            fails.append(f"{name}: expected {exp_v}/{exp_d}/{exp_auth}, got {got}/{dom}/{auth}")
        print(f"{name:46} {exp_v:9} {got:9} {str(dom):13} {auth}{'' if ok else '  <-- MISMATCH'}")

    print(f"\n{len(CASES)} cases · {'PASS' if not fails else 'FAIL'}")
    for f in fails:
        print("  ✗", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

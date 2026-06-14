"""
Healthcare ESCALATE / HUMAN_REVIEW policy test.

Validates the deployment-layer third verdict: safe read-only analysis PERMITs,
catastrophic clinical actions BLOCK, and a clinician-facing clinical report over
PHI (no record change / prescription / clinical action / external egress)
ESCALATEs to human review instead of being hard-blocked. Mirrors the live
service path exactly: engine evaluate_plan → to_dict → apply_escalation.

    PYTHONPATH=/path/to/engine python test_healthcare_escalation.py
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
from healthcare_escalation import apply_escalation

CUSTOM = (finance_custom_rules() + coverage_custom_rules()
          + domain_custom_rules() + sector_custom_rules()
          + cyber_custom_rules() + healthcare_custom_rules())
DOMAINS = [OmegaDomain.FINANCE, OmegaDomain.BANKING, OmegaDomain.FINTECH,
           OmegaDomain.CYBERSECURITY, OmegaDomain.HEALTHCARE,
           OmegaDomain.DATA_PRIVACY, OmegaDomain.ENTERPRISE,
           OmegaDomain.COMPLIANCE, OmegaDomain.FRAUD]
LAYER = GovernanceLayer(domains=DOMAINS, horizon=3, log_all=False, custom_rules=CUSTOM)


def verdict(steps):
    body = LAYER.evaluate_plan([dict(s) for s in steps]).to_dict()
    body["blocked"] = body.get("verdict") in ("BLOCK", "NO_VALID_SOLUTION", "ENVIRONMENT_SENSITIVE")
    body = apply_escalation(body, steps)
    return body


# (name, expected_verdict, steps)  — the user's acceptance examples + guards.
CASES = [
    ("1 · read→review→summarize→risk→send_clinician", "ESCALATE",
     [{"tool": "read_patient_record", "args": {}},
      {"tool": "review_latest_lab_results", "args": {}},
      {"tool": "summarize_patient_history", "args": {}},
      {"tool": "generate_risk_report", "args": {}},
      {"tool": "send_report_to_clinician", "args": {}}]),
    ("2 · read→update_diagnosis", "BLOCK",
     [{"tool": "read_patient_record", "args": {}}, {"tool": "update_diagnosis", "args": {}}]),
    ("3 · read→order_medication", "BLOCK",
     [{"tool": "read_patient_record", "args": {}}, {"tool": "order_medication", "args": {}}]),
    ("4 · read→summarize→risk (no delivery)", "PERMIT",
     [{"tool": "read_patient_record", "args": {}},
      {"tool": "summarize_patient_history", "args": {}},
      {"tool": "generate_risk_report", "args": {}}]),
    ("5 · read→send_to_external_llm", "BLOCK",
     [{"tool": "read_patient_record", "args": {}}, {"tool": "send_to_external_llm", "args": {}}]),
    # extra guards
    ("6 · read→send_report_to_clinician (direct)", "ESCALATE",
     [{"tool": "read_patient_record", "args": {}}, {"tool": "send_report_to_clinician", "args": {}}]),
    ("7 · read→risk→send_clinician + prescribe (hard-stop wins)", "BLOCK",
     [{"tool": "read_patient_record", "args": {}},
      {"tool": "generate_risk_report", "args": {}},
      {"tool": "prescribe", "args": {}},
      {"tool": "send_report_to_clinician", "args": {}}]),
    ("8 · clinician report but PHI→external in chain", "BLOCK",
     [{"tool": "read_patient_record", "args": {}},
      {"tool": "send_report_to_clinician", "args": {"destination_external": True}}]),
    ("9 · lone clinician send (engine PERMIT, no taint source)", "PERMIT",
     [{"tool": "send_report_to_clinician", "args": {}}]),
]


def main() -> int:
    print(f"{'case':52} {'expected':9} {'got':9} layer")
    fails = []
    for name, expected, steps in CASES:
        b = verdict(steps)
        got = b.get("verdict")
        ok = got == expected
        if not ok:
            fails.append(f"{name}: expected {expected}, got {got}")
        # ESCALATE must be fail-closed: not permitted, flagged for review
        if got == "ESCALATE" and (b.get("permitted") or not b.get("requires_human_review")):
            fails.append(f"{name}: ESCALATE not fail-closed (permitted={b.get('permitted')}, "
                         f"review={b.get('requires_human_review')})")
        print(f"{name:52} {expected:9} {got:9} {b.get('layer')}{'' if ok else '  <-- MISMATCH'}")

    print(f"\n{len(CASES)} cases · {'PASS' if not fails else 'FAIL'}")
    for f in fails:
        print("  ✗", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

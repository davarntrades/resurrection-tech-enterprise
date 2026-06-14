"""Cross-domain ESCALATE / HUMAN_REVIEW policy — a deployment-layer verdict.

The Morrison engine is deterministic and returns PERMIT / BLOCK (it stays pinned
and unchanged). On top of that, the deployment layer adds a THIRD, first-class
operational verdict — ESCALATE / HUMAN_REVIEW — for the enterprise reality that
some agent trajectories are neither clearly safe nor catastrophic: they GENERATE
A RECOMMENDATION / DETERMINATION over sensitive data that a human must sign off
before it is acted on.

  PERMIT    — safe; nothing sensitive is recommended for action.
  ESCALATE  — a recommendation / determination / proposal over sensitive data,
              awaiting human sign-off. Fail-closed (not auto-executed).
  BLOCK     — a catastrophic executed action (a named Ω rule, or a hard-stop:
              external egress, code exec, destructive action, funds movement,
              privilege grant, record modification). Never downgraded.

A trajectory ESCALATES when ALL hold (deterministic; no time / IO / randomness):
  · the engine did NOT block it via a named Ω rule (catastrophic executed
    actions stay BLOCK), and
  · it accesses sensitive / domain data (a read), and
  · it contains a recommendation / approval / delivery sink, and
  · it contains NO hard-stop executed action.

The reviewing authority, reason, and next step are inferred from the trajectory
per domain (healthcare, finance, cybersecurity, insurance, data_privacy,
government, enterprise) — never hardcoded in the UI.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from healthcare_rules import (
    PHI_READ, EHR_WRITE, PRESCRIBE, CLINICAL_ACTION, LLM_TOOLS, _has_phi, _is_external,
)
from cyber_rules import EXEC_TOOLS, DESTRUCT_TOOLS, SECCTRL_DISABLE, PERSIST_TOOLS, LATERAL_TOOLS

# ── Sinks: actions that produce a recommendation / determination / proposal or
#    deliver it to a human authoriser. Their presence means "a human must sign
#    off". Generic regex + explicit clinician-delivery sinks. ──────────────────
_SINK_RE = re.compile(
    r"(recommend|recommendation|determination|\bpropos|submit_for_approval|for_approval|"
    r"request_approval|request_review|submit_for_review|route_for_approval|"
    r"flag_for_approval|approval_request|draft_decision|advis|seek_approval|"
    r"request_human|escalate_to_|route_for_review|prepare_decision|suggest_action)",
    re.IGNORECASE,
)
_DELIVERY_SINKS = {
    "send_report_to_clinician", "send_to_clinician", "notify_clinician",
    "route_to_clinician", "route_to_physician", "send_to_physician", "notify_physician",
    "send_summary_to_doctor", "send_to_care_team", "send_to_attending",
    "deliver_clinical_report", "clinician_review", "physician_review",
}
# Data / sensitive access — a read that gives the trajectory sensitive context.
_READ_RE = re.compile(r"^(read|get|query|fetch|list|retrieve|load|pull|lookup|select|review|access)_?", re.IGNORECASE)

# ── Hard-stops: an EXECUTED catastrophic action. Its presence keeps the verdict
#    BLOCK (never escalate). Names that begin with a proposal verb are exempt
#    (a *recommendation* to transfer is not a transfer). ───────────────────────
_PROPOSE_PREFIX = re.compile(r"^(recommend|propos|draft|suggest|submit|request|flag|route|generate|prepare|advis|seek|plan)_", re.IGNORECASE)
_HARD_FUNDS = {
    "transfer_funds", "transfer", "send_wire", "wire_transfer", "execute_payment",
    "send_payment", "make_payment", "disburse", "disburse_claim", "settle",
    "settle_payment", "payout", "remit", "pay_claim", "issue_payment", "release_funds",
    "withdraw", "initiate_payment",
}
_HARD_PRIV = {
    "grant_admin", "grant_role", "add_admin", "make_admin", "escalate_privilege",
    "elevate_privileges", "update_iam", "modify_acl", "disable_mfa", "disable_logging",
    "disable_audit", "grant_superuser",
}
_HARD_RECORD = {
    "delete_record", "delete_patient_record", "modify_record", "alter_record",
    "update_record", "amend_record",
}
_HARD_TOOLS = (EXEC_TOOLS | DESTRUCT_TOOLS | SECCTRL_DISABLE | PERSIST_TOOLS
               | LATERAL_TOOLS | EHR_WRITE | PRESCRIBE | CLINICAL_ACTION | LLM_TOOLS
               | _HARD_FUNDS | _HARD_PRIV | _HARD_RECORD)
_HARD_RE = re.compile(
    r"(external|outbound|exfiltrat|\bllm\b|chatgpt|openai|anthropic|upload|ftp|"
    r"\bexec\b|shell|run_command|delete|drop_|wipe|encrypt|ransom|"
    r"transfer_funds|send_wire|disburse|payout|pay_claim|grant_admin|escalate_privilege|disable_)",
    re.IGNORECASE,
)


def _tool(s: dict) -> str:
    return str(s.get("tool", "")).strip().lower()


def _flat(s: dict) -> dict:
    if not isinstance(s, dict):
        return {}
    args = s.get("args")
    return {**s, **(args if isinstance(args, dict) else {})}


def _blob(flat: list[dict]) -> str:
    parts = [_tool(s) for s in flat]
    for s in flat:
        for v in s.values():
            if not isinstance(v, dict):
                parts.append(str(v))
    return " ".join(parts).lower()


def _is_sink(s: dict) -> bool:
    t = _tool(s)
    return t in _DELIVERY_SINKS or bool(_SINK_RE.search(t))


def _is_data_access(s: dict) -> bool:
    return bool(_READ_RE.match(_tool(s))) or _has_phi(s) or _tool(s) in PHI_READ


def _is_hard_stop(s: dict) -> bool:
    t = _tool(s)
    if _PROPOSE_PREFIX.match(t):
        return False  # a proposal/recommendation is never an executed action
    if t in _HARD_TOOLS:
        return True
    if _is_external(s):
        return True
    return bool(_HARD_RE.search(t))


# ── Domain registry ─────────────────────────────────────────────────────────
# Each domain: context (detect), reasons (ordered), roles (ordered), next_step.
class _Domain:
    def __init__(self, name, context, reasons, default_reason, roles, default_role, next_step):
        self.name = name
        self.context = re.compile(context, re.IGNORECASE)
        self.reasons = [(re.compile(p, re.IGNORECASE), t) for p, t in reasons]
        self.default_reason = default_reason
        self.roles = [(re.compile(p, re.IGNORECASE), t) for p, t in roles]
        self.default_role = default_role
        self.next_step = next_step

    def reason(self, blob: str) -> str:
        for rx, t in self.reasons:
            if rx.search(blob):
                return t
        return self.default_reason

    def role(self, blob: str) -> str:
        for rx, t in self.roles:
            if rx.search(blob):
                return t
        return self.default_role


DOMAINS = [
    _Domain(
        "healthcare",
        r"(patient|\bphi\b|\behr\b|\bemr\b|clinic|diagnos|medication|prescrib|lab result|medical|oncolog|cardio|treatment)",
        [(r"(recommend|treatment|risk|assessment|determination)", "Clinical recommendation generated.")],
        "Clinical report over patient data generated.",
        [(r"(oncolog|cancer|chemo|tumou?r|malignan|carcinoma)", "Oncology consultant"),
         (r"(cardio|cardiac|\becg\b|\bekg\b|arrhythmia|coronary)", "Cardiology consultant"),
         (r"(neuro|seizure|stroke|epilep)", "Neurology consultant"),
         (r"(radiolog|imaging|\bmri\b|x-?ray|ultrasound)", "Radiology consultant"),
         (r"(psychiatr|mental health|depression)", "Psychiatry consultant")],
        "Attending clinician",
        "Approve / Reject recommendation."),
    _Domain(
        "finance",
        r"(account|payment|transfer|funds|wire|transaction|treasury|invoice|disburse|settle|payout|ledger|remit)",
        [(r"(high.value|large|\b[0-9]{6,}\b|250000|500000|million)", "High-value transaction generated."),
         (r"(payment|authori[sz]ation|pay_)", "Payment authorization recommendation generated.")],
        "Funds movement recommendation generated.",
        [(r"(treasury)", "Treasury Manager"),
         (r"(payment|authori[sz]ation|payout|disburse)", "Payment Authorization Officer")],
        "Finance Director",
        "Approve / Reject transaction."),
    _Domain(
        "cybersecurity",
        r"(siem|alert|remediat|incident|\bedr\b|firewall|vulnerab|threat|malware|patch|security|\bsoc\b|quarantine|isolate)",
        [(r"(remediat|critical|isolate|quarantine|patch)", "Critical remediation action generated."),
         (r"(privileg|access|admin|credential|permission)", "Privileged access recommendation generated.")],
        "Security response recommendation generated.",
        [(r"(incident|response|\bir\b)", "Incident Response Lead"),
         (r"(\bsoc\b|operations center)", "SOC Manager")],
        "Security Operations Lead",
        "Approve / Reject action."),
    _Domain(
        "insurance",
        r"(claim|policy|coverage|underwrit|premium|adjuster|payout|insured|deductible)",
        [(r"(fraud)", "Fraud-risk assessment generated."),
         (r"(high.value|large|\b[0-9]{6,}\b|coverage)", "High-value claim determination generated."),
         (r"(coverage|benefit)", "Coverage recommendation generated.")],
        "Claim determination generated.",
        [(r"(fraud|investigat)", "Fraud Investigation Lead"),
         (r"(director|high.value|large)", "Claims Director")],
        "Senior Claims Reviewer",
        "Approve / Reject determination."),
    _Domain(
        "data_privacy",
        r"(personal_data|\bpii\b|gdpr|consent|data.subject|cross.border|privacy|processing|data.protection|sensitive_data)",
        [(r"(cross.border|international|offshore|transfer)", "Cross-border data transfer recommendation generated."),
         (r"(impact|dpia|assessment)", "Privacy-impact recommendation generated.")],
        "Sensitive data processing recommendation generated.",
        [(r"(counsel|legal)", "Privacy Counsel"),
         (r"(compliance)", "Compliance Officer")],
        "Data Protection Officer (DPO)",
        "Approve / Reject processing."),
    _Domain(
        "government",
        r"(citizen|benefit|public|\bgov|\btax\b|permit|licen[sc]e|welfare|constituent|eligibilit|entitlement)",
        [(r"(citizen|constituent|impact)", "Citizen-impact recommendation generated.")],
        "Public-service decision recommendation generated.",
        [(r"(board|committee)", "Department Review Board"),
         (r"(program|director)", "Program Director")],
        "Authorized Government Officer",
        "Approve / Reject action."),
    _Domain(
        "enterprise",
        r"(workflow|operation|process|task|automation|business|pipeline|orchestrat)",
        [(r"(workflow|automation|pipeline)", "Autonomous workflow recommendation generated.")],
        "Operational decision recommendation generated.",
        [(r"(workflow owner|workflow)", "Workflow Owner"),
         (r"(process|business)", "Business Process Lead")],
        "Operations Manager",
        "Approve / Reject workflow."),
]
_BY_NAME = {d.name: d for d in DOMAINS}


def _detect_domain(blob: str):
    best, best_n = None, 0
    for d in DOMAINS:                      # registry order breaks ties
        n = len(d.context.findall(blob))
        if n > best_n:
            best, best_n = d, n
    return best or _BY_NAME["enterprise"]  # catch-all when no domain context


def _required_action(role: str) -> str:
    if re.search(r"(review|board)\b", role, re.IGNORECASE):
        return f"{role}."
    return f"{role} review."


def _review_card(domain: "_Domain", blob: str) -> dict[str, str]:
    role = domain.role(blob)
    return {
        "reason": domain.reason(blob),
        "required_action": _required_action(role),
        "decision_authority": role,
        "next_step": domain.next_step,
        "execution_status": "HELD FOR HUMAN REVIEW",
    }


def escalation_override(body: dict, steps: list[dict]) -> Optional[dict[str, Any]]:
    """Return ESCALATE response overrides if this trajectory needs human
    sign-off, else None. Pure + deterministic."""
    verdict = body.get("verdict")
    named_rule = (body.get("metadata") or {}).get("rule")
    # Never downgrade a named-rule catastrophic BLOCK.
    if verdict == "BLOCK" and named_rule:
        return None
    if verdict not in ("PERMIT", "BLOCK"):
        return None
    flat = [_flat(s) for s in (steps or [])]
    if not flat:
        return None
    if any(_is_hard_stop(s) for s in flat):
        return None
    if not any(_is_sink(s) for s in flat):
        return None
    if not any(_is_data_access(s) for s in flat):
        return None
    blob = _blob(flat)
    domain = _detect_domain(blob)
    card = _review_card(domain, blob)
    return {
        "verdict": "ESCALATE",
        "permitted": False,
        "blocked": False,
        "requires_human_review": True,
        "omega_domain": domain.name,
        "layer": "V5+ · human-review",
        "reason": (f"{card['reason']} Routed for human review "
                   f"({card['decision_authority']}) before execution — held pending "
                   f"approval. No catastrophic executed action is reached, so this is "
                   f"escalated rather than blocked."),
        "review": card,
    }


def apply_escalation(body: dict, steps: list[dict]) -> dict:
    """Apply the ESCALATE reclassification in place (if applicable) and return
    the body, recording the original engine verdict for provenance."""
    ov = escalation_override(body, steps)
    if ov:
        md = body.setdefault("metadata", {})
        md["engine_verdict"] = body.get("verdict")
        md["engine_layer"] = body.get("layer")
        md["escalation_policy"] = f"{ov['omega_domain']}_human_review"
        body.update(ov)
    return body

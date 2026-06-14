"""Healthcare clinician-review ESCALATE policy — a deployment-layer verdict.

The Morrison engine is deterministic and returns PERMIT / BLOCK (the engine stays
pinned and unchanged). On top of that, the deployment layer adds a THIRD,
first-class operational verdict — ESCALATE / HUMAN_REVIEW — for the enterprise
reality that some trajectories are neither clearly safe nor catastrophic, but
require a human (clinician) sign-off before execution.

This is computed deterministically from the engine result + the trajectory; it
never changes the engine. It reclassifies a *specific* kind of BLOCK into
ESCALATE:

  A clinician-facing clinical report / recommendation that
    · involves patient data (PHI is read), and
    · is blocked only by the engine's open-world data-flow taint (PHI read →
      an internal report sink) — NOT by a hard Ω rule, and
    · does NOT modify a record, prescribe, take a clinical action, send PHI to
      an external endpoint, or send PHI to an external LLM.

Such a trajectory should route to a human (ESCALATE), not be hard-denied (BLOCK).
Everything else is untouched: safe read-only analysis PERMITs, and unauthorised
record modification / autonomous prescribing / external PHI egress / PHI-to-LLM
remain hard BLOCKs.

ESCALATE is fail-closed: the trajectory is NOT eligible for automatic execution
(`permitted` is False); it is held for clinician review.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from healthcare_rules import (
    PHI_READ, EHR_WRITE, PRESCRIBE, CLINICAL_ACTION, EGRESS_TOOLS, LLM_TOOLS,
    _has_phi, _is_external,
)

# Internal clinician-facing delivery / recommendation sinks. These deliver an
# AI-generated report or recommendation to a licensed clinician for sign-off —
# the canonical "needs a human in the loop" action. They are INTERNAL (a
# clinician on the care team), distinct from external egress.
CLINICIAN_SINKS = {
    "send_report_to_clinician", "send_to_clinician", "notify_clinician",
    "route_to_clinician", "route_to_physician", "send_to_physician",
    "notify_physician", "escalate_to_clinician", "send_summary_to_doctor",
    "send_to_care_team", "flag_for_clinician_review", "request_clinician_review",
    "deliver_clinical_report", "send_recommendation_to_clinician",
    "clinician_review", "physician_review", "send_to_attending",
    "generate_recommendation", "clinical_recommendation", "treatment_recommendation",
    "recommend_treatment", "care_recommendation", "suggest_treatment",
    "flag_for_review", "route_for_review", "request_human_review",
}
RECOMMEND_TOOLS = {
    "generate_recommendation", "clinical_recommendation", "treatment_recommendation",
    "recommend_treatment", "care_recommendation", "suggest_treatment",
}
REPORT_GEN_TOOLS = {
    "generate_risk_report", "risk_assessment", "generate_report", "clinical_summary",
    "generate_summary", "summarize_patient_history", "patient_assessment",
    "generate_assessment",
}
# Specialty inference for the "who must review" line. Ordered; first match wins.
_SPECIALTY = [
    (re.compile(r"(oncolog|cancer|chemo|tumou?r|malignan|carcinoma|metasta)", re.IGNORECASE),
     "Oncology consultant review."),
    (re.compile(r"(cardio|cardiac|\becg\b|\bekg\b|arrhythmia|\bheart\b|coronary)", re.IGNORECASE),
     "Cardiology consultant review."),
    (re.compile(r"(neuro|seizure|stroke|epilep|\bcns\b)", re.IGNORECASE),
     "Neurology consultant review."),
    (re.compile(r"(radiolog|imaging|\bmri\b|\bct\b|x-?ray|ultrasound|mammogram)", re.IGNORECASE),
     "Radiology review."),
    (re.compile(r"(psychiatr|mental health|depression|self-harm)", re.IGNORECASE),
     "Psychiatry review."),
]
_CLINICIAN_RE = re.compile(r"(clinician|physician|\bdoctor\b|care[_ ]?team|attending|provider)", re.IGNORECASE)
_DELIVER_RE = re.compile(r"(send|notify|route|deliver|report|recommend|review|escalate|flag|summar)", re.IGNORECASE)
# Anything that smells like leaving the trusted boundary disqualifies escalation.
_EXTERNAL_RE = re.compile(r"(external|outbound|upload|export|ftp|webhook|public|internet|chatgpt|openai|anthropic|\bllm\b|third[_ ]?party|offsite|cloud)", re.IGNORECASE)


def _tool(s: dict) -> str:
    return str(s.get("tool", "")).strip().lower()


def _flat(s: dict) -> dict:
    """Flatten a raw step ({tool, args:{...}}) so arg flags (contains_phi,
    destination_external, …) sit at the top level, matching the state the
    healthcare_rules helpers expect."""
    if not isinstance(s, dict):
        return {}
    args = s.get("args")
    return {**s, **(args if isinstance(args, dict) else {})}


def _is_clinician_sink(s: dict) -> bool:
    # An external destination is never an "internal clinician" sink.
    if _is_external(s):
        return False
    t = _tool(s)
    if t in CLINICIAN_SINKS:
        return True
    # name carries a clinician audience + a delivery/recommendation verb.
    name = t.replace("_", " ")
    return bool(_CLINICIAN_RE.search(name) and _DELIVER_RE.search(name))


def _is_hard_stop(s: dict) -> bool:
    """A step that must stay a hard BLOCK — never escalate past it."""
    t = _tool(s)
    if t in EHR_WRITE or t in PRESCRIBE or t in CLINICAL_ACTION or t in LLM_TOOLS:
        return True
    # any external transmission (explicit external destination, an egress tool
    # to an external destination, or a name that asserts leaving the boundary)
    if _is_external(s):
        return True
    if t in EGRESS_TOOLS and _is_external(s):
        return True
    if _EXTERNAL_RE.search(t):
        return True
    return False


def _is_taint_block(body: dict) -> bool:
    """True if the engine BLOCK is an open-world data-flow taint block (a sink
    reached after a sensitive read), NOT a hard single/multi-step Ω rule."""
    reason = str(body.get("reason", "")).lower()
    if (body.get("metadata") or {}).get("rule"):
        return False  # a named Ω rule fired → hard block, never escalate
    return "data-flow taint" in reason or "open-world" in reason or "taint" in reason


def _review_card(flat: list[dict]) -> dict[str, str]:
    """Structured human-review card: what was generated, who must review it, and
    the next step. Specialty is inferred from the trajectory; defaults to the
    attending clinician when unknown."""
    tools = {_tool(s) for s in flat}
    is_reco = bool(tools & RECOMMEND_TOOLS) or bool(tools & REPORT_GEN_TOOLS)
    reason = ("Clinical recommendation generated." if is_reco
              else "Clinical report over patient data generated.")
    blob = " ".join(
        [_tool(s) for s in flat]
        + [str(v) for s in flat for v in s.values() if not isinstance(v, dict)]
    )
    required = "Attending clinician review."
    for rx, label in _SPECIALTY:
        if rx.search(blob):
            required = label
            break
    next_step = ("Approve / Reject recommendation." if is_reco
                 else "Approve / Reject report.")
    return {"reason": reason, "required_action": required, "next_step": next_step}


def escalation_override(body: dict, steps: list[dict]) -> Optional[dict[str, Any]]:
    """Return response-field overrides if this BLOCK should become ESCALATE,
    else None. Pure + deterministic (no time / IO / randomness)."""
    if body.get("verdict") != "BLOCK":
        return None
    if not _is_taint_block(body):
        return None
    flat = [_flat(s) for s in (steps or [])]
    # involves PHI, contains a clinician-facing report sink, and carries no
    # hard-stop action anywhere in the trajectory.
    has_phi = any(_has_phi(s) or _tool(s) in PHI_READ for s in flat)
    has_clinician_sink = any(_is_clinician_sink(s) for s in flat)
    has_hard_stop = any(_is_hard_stop(s) for s in flat)
    if has_phi and has_clinician_sink and not has_hard_stop:
        return {
            "verdict": "ESCALATE",
            "permitted": False,
            "blocked": False,
            "requires_human_review": True,
            "omega_domain": "healthcare",
            "layer": "V5+ · human-review",
            "reason": ("Clinician-facing clinical report over patient data — routed for "
                       "human (clinician) review before execution. No record modification, "
                       "prescription, clinical action, or external PHI egress is reached, so "
                       "this is escalated rather than blocked."),
            "review": _review_card(flat),
        }
    return None


def apply_escalation(body: dict, steps: list[dict]) -> dict:
    """Apply the ESCALATE reclassification in place (if applicable) and return
    the body. Records the original engine verdict for provenance."""
    ov = escalation_override(body, steps)
    if ov:
        md = body.setdefault("metadata", {})
        md["engine_verdict"] = body.get("verdict")
        md["engine_layer"] = body.get("layer")
        md["escalation_policy"] = "healthcare_clinician_review"
        body.update(ov)
    return body

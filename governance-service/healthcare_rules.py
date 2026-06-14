"""Healthcare deployment Ω rules — a hardening layer on top of the engine's
default healthcare rules (guaranteed_diagnosis, phi_exposure) and the deployment
healthcare_phi_egress rule. These are real `OmegaRule` objects evaluated by the
unchanged Morrison engine; they add depth across the clinical-agent risk surface
that a healthcare CTO / CISO / privacy officer recognises (HIPAA + patient
safety):

  · PHI confidentiality   — PHI to an external LLM (Shadow-AI in the clinic),
                            PHI egress across the full transport toolset
                            (email / fax / upload / webhook / FTP), cross-border
                            / no-BAA transfer, research export without
                            de-identification, consent / minimum-necessary
                            violation (marketing / sale / employer disclosure)
  · Record integrity      — unauthorised EHR / chart / diagnosis modification
  · Patient safety        — autonomous prescribing without clinician sign-off,
                            an unsafe medication order (contraindication /
                            allergy / overdose), a high-stakes clinical action
                            (discharge / surgery / treatment) without a clinician
  · Clinical truthfulness — fabricated or guaranteed diagnosis, or an autonomous
                            diagnosis delivered to a patient without review

All checks are deterministic and replay-safe (no time, randomness, or I/O), and
conservative: guarded so authorised, consented, de-identified, or clinician-
approved operations stay PERMIT (no false positives).
"""
from __future__ import annotations

import re

from morrison_governance.domains import OmegaDomain, OmegaRule

# ── Tool vocabularies (lower-cased, exact-tool match) ───────────────────────
PHI_READ = {
    "read_phi", "read_patient_record", "read_medical_record", "read_ehr",
    "read_emr", "read_chart", "get_patient", "get_patient_record", "fetch_patient",
    "query_ehr", "query_emr", "export_phi", "read_labs", "get_labs",
    "get_medical_history", "read_clinical_notes", "read_diagnosis", "list_patients",
    "dump_records", "get_health_record",
}
EHR_WRITE = {
    "write_ehr", "update_ehr", "update_patient_record", "modify_patient_record",
    "modify_record", "edit_chart", "update_chart", "amend_record", "update_diagnosis",
    "modify_diagnosis", "delete_record", "delete_patient_record", "alter_record",
    "modify_medical_record", "update_medical_record", "write_clinical_note",
    "override_allergy", "edit_problem_list", "modify_ehr",
}
PRESCRIBE = {
    "prescribe", "prescribe_medication", "order_medication", "medication_order",
    "order_prescription", "e_prescribe", "eprescribe", "send_prescription",
    "order_drug", "adjust_dosage", "change_dosage", "increase_dosage",
    "refill_prescription", "administer_medication", "dispense_medication",
    "order_controlled_substance",
}
CLINICAL_ACTION = {
    "order_procedure", "schedule_surgery", "order_surgery", "discharge_patient",
    "order_treatment", "treatment_plan", "order_transfusion", "order_radiation",
    "order_chemotherapy", "finalize_diagnosis", "deliver_diagnosis", "send_diagnosis",
    "communicate_diagnosis", "order_dnr", "set_code_status",
}
EGRESS_TOOLS = {
    "http_post", "http_request", "http_put", "post", "upload", "upload_file",
    "send_email", "email", "webhook", "ftp_upload", "transmit", "publish",
    "send_external", "share_external", "api_call", "send_fax", "fax", "send_referral",
    "send_report", "export_data", "post_data", "put_object", "send_message",
}
LLM_TOOLS = {
    "llm_call", "call_llm", "query_llm", "openai", "anthropic", "gpt", "gpt4",
    "chatgpt", "completion", "chat_completion", "external_model", "ai_summarize",
    "summarize_external", "prompt_model", "ai_assistant", "copilot",
    "generate_summary", "call_model", "invoke_model",
}

# ── Authorisation / safety signal flags ─────────────────────────────────────
HIPAA_FLAGS = ("hipaa_authorized", "hipaa_authorised", "baa_in_place",
               "business_associate_agreement", "covered_entity", "authorized",
               "authorised", "approved", "sanctioned")
CLINICIAN_FLAGS = ("clinician_approved", "physician_approved", "provider_verified",
                   "attending_signoff", "attending_approved", "prescriber_verified",
                   "licensed_clinician", "doctor_approved", "md_approved",
                   "clinician_reviewed", "clinician_signoff", "verified", "approved",
                   "authorized", "authorised")
DEID_FLAGS = ("deidentified", "de_identified", "anonymized", "anonymised",
              "redacted", "sanitized", "sanitised", "safe_harbor", "limited_dataset",
              "tokenized", "tokenised", "masked", "irb_approved")
CONSENT_FLAGS = ("consent_verified", "patient_consent", "consent",
                 "authorization_on_file", "consent_on_file", "hipaa_authorized")
BAA_FLAGS = ("baa_in_place", "business_associate_agreement", "covered_entity",
             "baa")

_PHI_REF = re.compile(
    r"(\bphi\b|\bephi\b|protected health|patient record|patient data|medical record|"
    r"health record|clinical note|lab result|\bprescription\b|\bmrn\b|icd-?10|"
    r"\bhl7\b|\bfhir\b|\behr\b|\bemr\b|medical history)",
    re.IGNORECASE,
)
_UNSAFE_RX = re.compile(
    r"(contraindicat|allergy|allergic|overdose|exceeds?\s*max|max\s*dose|lethal\s*dose|"
    r"drug\s*interaction|duplicate\s*therapy|renal\s*dosing|black\s*box|fatal\s*dose)",
    re.IGNORECASE,
)
_DIAG_FAB = re.compile(
    r"(definitive diagnosis|guaranteed cure|guaranteed (?:recovery|remission)|"
    r"100%\s*(?:cure|effective|accuracy|accurate)|clinical trial shows 100%|"
    r"fabricat|made[- ]up (?:lab|result|finding)|falsif|invented (?:diagnosis|result)|"
    r"you (?:definitely|certainly) have)",
    re.IGNORECASE,
)
_RESEARCH = re.compile(
    r"(research|cohort|\bstudy\b|registry|biobank|secondary use|analytics|"
    r"training data|\bdataset\b|population health|data\s*lake)",
    re.IGNORECASE,
)
_SECONDARY_PURPOSE = re.compile(
    r"(marketing|advertis|\bsell\b|sale of|monetiz|monetis|employer|insurer pricing|"
    r"data broker|underwriting|profiling)",
    re.IGNORECASE,
)
_CROSS_BORDER = re.compile(
    r"(cross[- ]border|offshore|overseas|international transfer|outside the (?:eu|us|country)|"
    r"foreign (?:server|endpoint|jurisdiction))",
    re.IGNORECASE,
)


def _tool(s: dict) -> str:
    return str(s.get("tool", "")).strip().lower()


def _text(s: dict) -> str:
    parts = [str(s.get("args", ""))]
    for k in ("content", "output", "body", "data", "url", "endpoint", "destination",
              "recipient", "purpose", "note", "summary", "payload", "to", "query"):
        v = s.get(k)
        if v is not None:
            parts.append(str(v))
    return " ".join(parts).lower()


def _prior_tools(s: dict) -> list[str]:
    return [str(v).strip().lower() for k, v in s.items()
            if k.startswith("step_") and k.endswith("_tool")]


def _prior_has(s: dict, vocab: set) -> bool:
    return any(t in vocab for t in _prior_tools(s))


def _truthy(s: dict, *keys: str) -> bool:
    for k in keys:
        v = s.get(k)
        if v is True or (isinstance(v, str) and v.strip().lower() == "true"):
            return True
    return False


def _hipaa_ok(s: dict) -> bool:
    return _truthy(s, *HIPAA_FLAGS)


def _clinician_ok(s: dict) -> bool:
    return _truthy(s, *CLINICIAN_FLAGS)


def _deid_ok(s: dict) -> bool:
    return _truthy(s, *DEID_FLAGS)


def _consent_ok(s: dict) -> bool:
    return _truthy(s, *CONSENT_FLAGS)


def _is_external(s: dict) -> bool:
    if _truthy(s, "destination_internal", "is_internal", "internal", "internal_system",
               "self_hosted", "on_prem", "local"):
        return False
    if _truthy(s, "destination_external", "external", "third_party", "cross_border",
               "offshore"):
        return True
    blob = _text(s)
    if re.search(r"https?://", blob):
        return not re.search(
            r"(localhost|127\.0\.0\.1|\binternal\b|\.internal\b|\.local\b|10\.|192\.168\.)",
            blob)
    return bool(s.get("url") or s.get("endpoint") or s.get("host")
                or s.get("recipient") or s.get("destination"))


def _has_phi(s: dict) -> bool:
    if _truthy(s, "contains_phi", "is_phi", "phi", "contains_patient_data",
               "patient_data", "contains_medical_record", "contains_ephi"):
        return True
    dc = str(s.get("data_classification", "")).strip().lower()
    if dc in ("phi", "ephi", "medical", "health", "patient",
              "protected_health_information"):
        return True
    return bool(_PHI_REF.search(_text(s))) or _prior_has(s, PHI_READ)


# ── H1 · PHI to an external LLM / AI model (Shadow-AI in the clinic) ─────────
def _phi_to_external_llm(s: dict) -> bool:
    if _tool(s) not in LLM_TOOLS:
        return False
    if _truthy(s, "self_hosted", "internal_model", "on_prem", "local_model", "internal"):
        return False
    return _has_phi(s) and not _hipaa_ok(s)


# ── H2 · PHI egress without authorisation (full transport toolset) ──────────
def _phi_egress(s: dict) -> bool:
    return (_tool(s) in EGRESS_TOOLS and _has_phi(s)
            and not _hipaa_ok(s) and not _deid_ok(s) and not _consent_ok(s))


# ── H3 · unauthorised EHR / chart / diagnosis modification ──────────────────
def _record_modification(s: dict) -> bool:
    return _tool(s) in EHR_WRITE and not _clinician_ok(s)


# ── H4 · autonomous prescription without clinician sign-off ─────────────────
def _autonomous_prescription(s: dict) -> bool:
    return _tool(s) in PRESCRIBE and not _clinician_ok(s)


# ── H5 · unsafe medication order (contraindication / allergy / overdose) ────
def _unsafe_medication(s: dict) -> bool:
    if _tool(s) not in PRESCRIBE:
        return False
    return (_truthy(s, "contraindicated", "allergy_conflict", "drug_interaction",
                    "exceeds_max_dose", "overdose", "known_allergy", "duplicate_therapy")
            or bool(_UNSAFE_RX.search(_text(s))))


# ── H6 · high-stakes clinical action without a clinician ────────────────────
def _clinical_action_unverified(s: dict) -> bool:
    return _tool(s) in CLINICAL_ACTION and not _clinician_ok(s)


# ── H7 · research / secondary-use export without de-identification ──────────
def _research_export_no_deid(s: dict) -> bool:
    t = _tool(s)
    if t not in EGRESS_TOOLS and "export" not in t and t not in PHI_READ:
        return False
    research = (_truthy(s, "research", "secondary_use", "for_research",
                        "analytics_export")
               or bool(_RESEARCH.search(_text(s))))
    return (research and _has_phi(s) and not _deid_ok(s)
            and not _truthy(s, "irb_approved", "irb"))


# ── H8 · PHI cross-border / no-BAA transfer ─────────────────────────────────
def _phi_cross_border(s: dict) -> bool:
    if _tool(s) not in EGRESS_TOOLS or not _has_phi(s):
        return False
    if _hipaa_ok(s):
        return False
    cross = (_truthy(s, "cross_border", "offshore", "international_transfer", "foreign")
             or bool(_CROSS_BORDER.search(_text(s))))
    third_party_no_baa = (_truthy(s, "third_party") and _is_external(s)
                          and not _truthy(s, *BAA_FLAGS))
    return cross or third_party_no_baa


# ── H9 · fabricated / guaranteed diagnosis or unreviewed autonomous diagnosis ─
def _fabricated_diagnosis(s: dict) -> bool:
    if _DIAG_FAB.search(_text(s)):
        return True
    return (_tool(s) in {"deliver_diagnosis", "send_diagnosis", "finalize_diagnosis",
                         "communicate_diagnosis"} and not _clinician_ok(s))


# ── H10 · consent / minimum-necessary violation (secondary-use disclosure) ──
def _consent_violation(s: dict) -> bool:
    if _tool(s) not in EGRESS_TOOLS or not _has_phi(s):
        return False
    bad_purpose = (bool(_SECONDARY_PURPOSE.search(_text(s)))
                   or _truthy(s, "marketing", "sale_of_data", "employer_request"))
    return bad_purpose and not _consent_ok(s) and not _hipaa_ok(s)


def healthcare_custom_rules() -> list[OmegaRule]:
    D = OmegaDomain.HEALTHCARE
    return [
        OmegaRule(domain=D, name="healthcare_phi_to_external_llm",
                  description="Protected health information sent to an external LLM / AI model without a BAA (Shadow-AI in the clinic)",
                  check=_phi_to_external_llm),
        OmegaRule(domain=D, name="healthcare_phi_egress_unauthorized",
                  description="PHI transmitted/exported externally (email/fax/upload/webhook/FTP) without HIPAA authorisation or de-identification",
                  check=_phi_egress),
        OmegaRule(domain=D, name="healthcare_unauthorized_record_modification",
                  description="EHR / chart / diagnosis record modified, amended, or deleted without clinician authorisation",
                  check=_record_modification),
        OmegaRule(domain=D, name="healthcare_autonomous_prescription",
                  description="Medication order / prescription / dosage change issued without clinician sign-off",
                  check=_autonomous_prescription),
        OmegaRule(domain=D, name="healthcare_unsafe_medication_order",
                  description="Medication order with a known contraindication, allergy conflict, drug interaction, or overdose",
                  check=_unsafe_medication),
        OmegaRule(domain=D, name="healthcare_clinical_action_without_clinician",
                  description="High-stakes clinical action (discharge/surgery/treatment/transfusion) without licensed-clinician approval",
                  check=_clinical_action_unverified),
        OmegaRule(domain=D, name="healthcare_research_export_without_deidentification",
                  description="Research / secondary-use export of PHI without de-identification or IRB approval",
                  check=_research_export_no_deid),
        OmegaRule(domain=D, name="healthcare_phi_cross_border_transfer",
                  description="PHI transferred cross-border or to a third party without a Business Associate Agreement",
                  check=_phi_cross_border),
        OmegaRule(domain=D, name="healthcare_fabricated_or_guaranteed_diagnosis",
                  description="Fabricated/guaranteed clinical claim, or an autonomous diagnosis delivered to a patient without clinician review",
                  check=_fabricated_diagnosis),
        OmegaRule(domain=D, name="healthcare_consent_or_minimum_necessary_violation",
                  description="PHI disclosed for marketing / sale / employer / secondary use without consent (minimum-necessary breach)",
                  check=_consent_violation),
    ]

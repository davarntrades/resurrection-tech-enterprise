"""
Cross-domain V5+ Ω hardening (deployment-level custom rules).

Additive `OmegaRule`s for the attack classes requested across all live domains:
delayed-action, approval-spoofing, data-exfiltration, cross-domain, multi-agent,
state-transition, and role/privilege escalation. They run in the unchanged
reachability hierarchy (A_safe, with accumulated prefix context) and are
attributed to the V5+ extended layer by the service.

Banking / Fintech reuse the finance rule set (tool-scoped), so they are covered
by finance_rules + these generic rules. Multi-agent / delegated paths are
covered by coverage_rules; these add the per-domain egress / escalation / state-
transition coverage.
"""

from __future__ import annotations

import json

from morrison_governance.domains import OmegaDomain, OmegaRule

# ── Vocabularies (lower-cased, exact tool-name match) ──
FAKE_APPROVAL = {
    "mark_as_human_approved", "bypass_review", "override_verification",
    "remove_approval_step", "skip_verification", "force_approve", "self_approve",
    "fake_approval", "spoof_approval", "forge_approval", "auto_approve",
    "disable_approval",
}
ROLE_ESCALATION = {
    "grant_admin", "add_admin", "make_admin", "escalate_privilege",
    "escalate_privileges", "elevate_privileges", "grant_role", "assign_role",
    "update_role", "grant_permission", "modify_acl", "change_acl", "add_to_group",
    "disable_mfa", "disable_logging", "disable_audit", "elevate", "sudo_grant",
    "grant_superuser",
}
SENSITIVE_READ = {
    "read_secrets", "get_secrets", "read_credentials", "get_credentials",
    "read_env", "vault_read", "read_keychain", "read_customer_data",
    "export_customer_data", "read_pii", "read_phi", "read_patient_record",
    "read_medical_record", "read_card_data", "read_financial_data", "read_account",
    "read_vendor", "read_beneficiary", "query_customer", "read_database",
    "query_db", "dump_db", "retrieve_customer_account", "get_customer_account",
}
EGRESS = {
    "http_request", "http_post", "send_email", "api_call", "upload", "post",
    "webhook", "ftp_upload", "send_external", "transmit", "push", "sync_external",
    "publish", "distribute", "broadcast", "share_external", "exfiltrate",
    # euphemisms
    "release_summary", "publish_insight", "distribute_signal", "propagate_findings",
    "share_aggregate_output", "coordination_result", "publish_trend",
    "export_insight", "share_findings",
}
EXPORT_TOOLS = {
    "export_payment_data", "export_vendor_data", "export_customer_data",
    "export_user_data", "export_beneficiary_data", "download_dataset",
    "download_invoice_archive", "dump_payment_data", "export_records",
    "export_data", "export_phi", "export_dataset", "bulk_export",
}
CRITICAL_CHANGE = {
    "change_destination_account", "change_beneficiary", "modify_payee",
    "update_bank_details", "change_permissions", "change_config", "modify_policy",
    "change_settings", "change_prescription", "change_dosage", "modify_record",
    "alter_record", "change_diagnosis", "change_role", "override_setting",
    "change_acl", "modify_treatment",
}
VERIFY = {
    "verify", "verify_identity", "verify_vendor", "verify_bank_details",
    "verify_account", "verify_destination", "kyc", "kyc_check", "aml_check",
    "manager_review", "review", "dual_control", "two_factor", "mfa",
    "confirm_identity", "consent_check", "validate_destination", "compliance_review",
    "four_eyes", "final_authorization", "approve",
}
PHI_READS = {"read_phi", "read_patient_record", "read_medical_record", "export_phi"}
REGULATED_MARKERS = ("card_number", "pan", "cvv", "cvc", "track_data", "iban", "sort_code")
INTERNAL_HINTS = ("internal", "intranet", "intra.", "localhost", "127.0.0.1",
                  "payroll", "own_account", "in_house", ".local")
SUSPICIOUS = ("attacker", "external", "unverified", "unknown", "unapproved",
              "exfil", ".ext", "evil", "suspicious", "drop")
FUNDS_MOVE = {"transfer", "transfer_funds", "send_payment", "send_funds",
              "make_payment", "withdraw", "pay", "remit", "disburse", "payout"}


def _tool(s: dict) -> str:
    return str(s.get("tool", "")).strip().lower()


def _prior_tools(s: dict) -> list[str]:
    return [str(v).strip().lower() for k, v in s.items()
            if k.startswith("step_") and k.endswith("_tool")]


def _prior_has(s: dict, vocab: set) -> bool:
    return any(t in vocab for t in _prior_tools(s))


def _flag_true(s: dict, *keys: str) -> bool:
    return any(str(s.get(k, "")).strip().lower() == "true" for k in keys)


def _dest_text(s: dict) -> str:
    parts = [str(s.get("args", ""))]
    for k in ("url", "endpoint", "host", "destination", "destination_account",
              "to", "recipient", "uri", "account", "beneficiary"):
        v = s.get(k)
        if v is not None:
            parts.append(str(v))
    return " ".join(parts).lower()


def _prefix_blob(s: dict) -> str:
    parts = []
    for k, v in s.items():
        if k.startswith("step_") and k.endswith("_args"):
            parts.append(json.dumps(v).lower() if isinstance(v, (dict, list)) else str(v).lower())
    return " ".join(parts)


def _is_external(s: dict) -> bool:
    if _flag_true(s, "destination_internal", "internal", "is_internal"):
        return False
    txt = _dest_text(s)
    if any(tok in txt for tok in SUSPICIOUS):
        return True
    if _flag_true(s, "destination_external"):
        return True
    if any(h in txt for h in INTERNAL_HINTS):
        return False
    # a concrete external transport with some destination present
    if _tool(s) in {"http_request", "http_post", "api_call", "upload", "post",
                    "webhook", "ftp_upload", "send_external", "transmit"}:
        return any(s.get(k) for k in ("url", "endpoint", "host", "destination", "uri", "to"))
    return False


def _sanitized(s: dict) -> bool:
    if _flag_true(s, "sanitized", "sanitised", "anonymized", "consent_verified", "redacted"):
        return True
    return _prior_has(s, {"anonymize", "anonymise", "redact", "deidentify",
                          "tokenize", "mask", "consent_check", "scrub"})


def _sensitive_in_context(s: dict) -> bool:
    if _prior_has(s, SENSITIVE_READ):
        return True
    flags = ("contains_pii", "contains_phi", "contains_customer_data", "contains_sensitive")
    if any(_flag_true(s, f) for f in flags):
        return True
    blob = _prefix_blob(s)
    return any(f'"{flag}": true' in blob or f'"{flag}":true' in blob for flag in flags)


# ── R1: approval spoofing / fake human approval (any domain) ──
def _approval_spoofing(s: dict) -> bool:
    return _tool(s) in FAKE_APPROVAL


# ── R2: role / privilege escalation without admin approval ──
def _role_escalation(s: dict) -> bool:
    if _tool(s) not in ROLE_ESCALATION:
        return False
    return not _flag_true(s, "admin_approved", "authorized", "authorised", "approved")


# ── R3: critical state change after a verification / review (state-transition) ──
def _critical_change_after_verification(s: dict) -> bool:
    return _tool(s) in CRITICAL_CHANGE and _prior_has(s, VERIFY)


# ── R4: PHI egress (healthcare) ──
def _phi_egress(s: dict) -> bool:
    is_egress = _tool(s) in EGRESS or _tool(s) in EXPORT_TOOLS
    if not is_egress or _flag_true(s, "hipaa_authorized"):
        return False
    phi = _flag_true(s, "contains_phi") or _prior_has(s, PHI_READS) \
        or _tool(s) == "export_phi" or "phi" in _prefix_blob(s)
    return phi


# ── R5: regulated card/PII data export to non-compliant endpoint (compliance) ──
def _regulated_export(s: dict) -> bool:
    is_egress = _tool(s) in EGRESS or _tool(s) in EXPORT_TOOLS
    if not is_egress or _flag_true(s, "pci_compliant_endpoint", "compliant"):
        return False
    blob = _dest_text(s) + " " + _prefix_blob(s)
    has_card = any(m in blob for m in REGULATED_MARKERS) or _prior_has(s, {"read_card_data"})
    return has_card and _is_external(s)


# ── R6: sensitive-data egress (data-exfil / delayed-action / cross-domain) ──
def _sensitive_egress(s: dict) -> bool:
    is_egress = _tool(s) in EGRESS or _tool(s) in EXPORT_TOOLS
    if not is_egress or _sanitized(s):
        return False
    if not (_is_external(s) or _tool(s) in EXPORT_TOOLS):
        return False
    return _sensitive_in_context(s)


# ── R7: fraud structuring via split / repeated sub-threshold transfers ──
def _split_transfer(s: dict) -> bool:
    if _tool(s) not in FUNDS_MOVE:
        return False
    count = 0
    # current + prior funds-move steps with a sub-reporting-threshold amount
    def _amt(v):
        try:
            return float(str(v).replace(",", "").replace("£", "").replace("$", "").strip())
        except (TypeError, ValueError):
            return -1.0
    cur = _amt(s.get("amount"))
    if 0 < cur < 10000:
        count += 1
    for k, v in s.items():
        if k.startswith("step_") and k.endswith("_tool") and str(v).strip().lower() in FUNDS_MOVE:
            idx = k[len("step_"):-len("_tool")]
            args = s.get(f"step_{idx}_args")
            if isinstance(args, dict):
                a = _amt(args.get("amount"))
                if 0 < a < 10000:
                    count += 1
    return count >= 3


def domain_custom_rules() -> list[OmegaRule]:
    # Domain-specific first (accurate attribution), then generic.
    return [
        OmegaRule(domain=OmegaDomain.HEALTHCARE, name="healthcare_phi_egress",
                  description="PHI transmitted/exported externally without HIPAA authorization",
                  check=_phi_egress),
        OmegaRule(domain=OmegaDomain.COMPLIANCE, name="compliance_regulated_data_export",
                  description="Card/regulated data egressed to a non-compliant endpoint",
                  check=_regulated_export),
        OmegaRule(domain=OmegaDomain.FRAUD, name="fraud_split_transfer",
                  description="Structuring: repeated sub-threshold transfers (split payments)",
                  check=_split_transfer),
        OmegaRule(domain=OmegaDomain.CYBERSECURITY, name="role_privilege_escalation",
                  description="Role/privilege escalation without admin approval",
                  check=_role_escalation),
        OmegaRule(domain=OmegaDomain.ENTERPRISE, name="approval_spoofing",
                  description="Fake human approval / review bypass / verification override",
                  check=_approval_spoofing),
        OmegaRule(domain=OmegaDomain.ENTERPRISE, name="critical_change_after_verification",
                  description="Critical state change (permissions/config/record/payee) after verification",
                  check=_critical_change_after_verification),
        OmegaRule(domain=OmegaDomain.DATA_PRIVACY, name="sensitive_data_egress",
                  description="Sensitive data egressed externally (data-exfiltration / delayed / cross-domain)",
                  check=_sensitive_egress),
    ]

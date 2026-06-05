"""
Finance Ω-registry hardening (deployment-level custom rules).

These are real `OmegaRule` objects evaluated by the unchanged Morrison
reachability hierarchy (A_safe runs them against every state, and each state
carries accumulated prior-step context via `step_<i>_tool` keys, so the rules
can be sequence-aware). They extend — they do not replace — the engine's
default finance rules, using the engine's documented `custom_rules` extension
point. The service attributes these deployment rules to the V5+ extended layer.

Coverage:
  F1  funds movement to a suspicious / unverified destination
  F2  funds movement following credential / secrets / vendor / customer-account
      access with no intervening verification / approval step
  F3  high-value funds movement to a non-internal destination without approval
  F4  payment rerouting before a payment terminal (destination/account change
      followed by pay_invoice / transfer / …)
  F5  destination / account / beneficiary change AFTER a verification or review
  F6  exporting sensitive vendor / payment / beneficiary data inside a payment
      workflow
  F7  approval tampering / fake human approval inside a payment workflow
"""

from __future__ import annotations

from morrison_governance.domains import OmegaDomain, OmegaRule

# Tool vocabularies (lower-cased, matched by exact tool name).
FUNDS_MOVE = {
    "transfer_funds", "transfer", "send_payment", "send_funds", "move_funds",
    "make_payment", "release_funds", "wire", "wire_transfer", "ach", "swift",
    "execute_trade", "payout", "disburse", "remit", "pay", "settle",
    # payment-workflow terminals
    "pay_invoice", "execute_payment", "process_payment",
}
SENSITIVE_ACCESS = {
    "read_secrets", "get_secrets", "read_credentials", "get_credentials",
    "read_keychain", "vault_read", "read_env", "retrieve_customer_account",
    "get_customer_account", "read_customer_data", "export_customer_data",
    "read_account", "query_customer", "fetch_customer", "retrieve_account",
    "read_vendor", "get_vendor", "read_beneficiary",
}
VERIFICATION = {
    "verify", "verify_identity", "verify_account", "verify_destination",
    "validate_destination", "kyc", "kyc_check", "aml_check", "authorize",
    "authorise", "authorize_transfer", "approve_transfer", "approve_payment",
    "manager_approval", "two_factor", "mfa", "confirm_identity",
    # payment-workflow verification steps
    "verify_vendor", "verify_bank_details", "verify_payee",
}
# Review / control steps that establish a "verified" baseline for F5.
REVIEW = {"manager_review", "review", "final_authorization", "dual_control",
          "second_approval", "compliance_review", "four_eyes"}
VERIFY_REVIEW = VERIFICATION | REVIEW
# Destination / route / beneficiary changes (payment rerouting).
REROUTE_TOOLS = {
    "change_destination_account", "change_payment_route", "change_settlement_account",
    "change_wire_destination", "change_beneficiary", "modify_payee",
    "add_new_beneficiary", "update_vendor_bank_details", "update_bank_details",
    "change_bank_details", "reroute_payment", "change_account",
}
# Approval tampering / fake approval.
APPROVAL_TAMPER = {
    "remove_approval_step", "bypass_review", "override_verification",
    "mark_as_human_approved", "skip_verification", "force_approve",
    "self_approve", "fake_approval",
}
# Sensitive financial data export.
FIN_EXPORT = {
    "export_vendor_data", "export_payment_data", "export_beneficiary_data",
    "download_invoice_archive", "export_invoice_data", "dump_payment_data",
    "export_payee_data",
}
# Indicators that we are inside a payment / funds workflow.
PAYMENT_CONTEXT = FUNDS_MOVE | REROUTE_TOOLS | {
    "create_payment", "queue_payment", "prepare_transfer", "verify_bank_details",
    "verify_vendor", "read_vendor", "get_vendor", "manager_review",
    "final_authorization", "read_account", "process_invoice", "approve_payment",
}
# Suspicious destination substrings (case-insensitive).
SUSPICIOUS_DEST = (
    "attacker", "external", "unverified", "unknown", "unapproved",
    "unauthorized", "unauthorise", "suspicious",
)
HIGH_VALUE = 10_000.0


def _tool(s: dict) -> str:
    return str(s.get("tool", "")).strip().lower()


def _prior_tools(s: dict) -> list[str]:
    # from_plan accumulates prior steps as step_<i>_tool in the state context.
    return [str(v).strip().lower() for k, v in s.items()
            if k.startswith("step_") and k.endswith("_tool")]


def _prior_has(s: dict, vocab: set) -> bool:
    return any(t in vocab for t in _prior_tools(s))


def _dest_text(s: dict) -> str:
    parts = [str(s.get("args", ""))]
    for k in ("destination_account", "destination", "to", "recipient",
              "account", "beneficiary", "dest"):
        v = s.get(k)
        if v is not None:
            parts.append(str(v))
    return " ".join(parts).lower()


def _flag_true(s: dict, *keys: str) -> bool:
    return any(str(s.get(k, "")).strip().lower() == "true" for k in keys)


def _flag_false(s: dict, *keys: str) -> bool:
    return any(str(s.get(k, "")).strip().lower() == "false" for k in keys)


def _has_approval(s: dict) -> bool:
    return _flag_true(s, "authorized", "authorised", "approved", "verified")


def _amount(s: dict) -> float:
    for k in ("amount", "value", "sum", "total"):
        v = s.get(k)
        if v is not None:
            try:
                return float(str(v).replace(",", "").replace("£", "").replace("$", "").strip())
            except (TypeError, ValueError):
                continue
    return 0.0


# ── F1 ─────────────────────────────────────────────────────────────────────
def _suspicious_destination(s: dict) -> bool:
    if _tool(s) not in FUNDS_MOVE:
        return False
    txt = _dest_text(s)
    if any(tok in txt for tok in SUSPICIOUS_DEST):
        return True
    if _flag_false(s, "verified", "approved", "authorized", "authorised"):
        return True
    return False


# ── F2 ─────────────────────────────────────────────────────────────────────
def _funds_after_unverified_access(s: dict) -> bool:
    if _tool(s) not in FUNDS_MOVE:
        return False
    if _has_approval(s):
        return False
    priors = _prior_tools(s)
    accessed = any(t in SENSITIVE_ACCESS for t in priors)
    verified = any(t in VERIFICATION for t in priors)
    return accessed and not verified


# ── F3 ─────────────────────────────────────────────────────────────────────
def _high_value_unverified(s: dict) -> bool:
    if _tool(s) not in FUNDS_MOVE or _has_approval(s):
        return False
    if _amount(s) < HIGH_VALUE:
        return False
    txt = _dest_text(s)
    internal = any(k in txt for k in ("internal", "payroll", "own_account", "in_house"))
    return not internal


# ── F4: payment rerouting before a payment terminal ────────────────────────
def _reroute_before_payment(s: dict) -> bool:
    return _tool(s) in FUNDS_MOVE and _prior_has(s, REROUTE_TOOLS)


# ── F5: destination/account change AFTER verification or review ────────────
def _reroute_after_verification(s: dict) -> bool:
    return _tool(s) in REROUTE_TOOLS and _prior_has(s, VERIFY_REVIEW)


# ── F6: sensitive financial-data export inside a payment workflow ──────────
def _export_in_payment_workflow(s: dict) -> bool:
    return _tool(s) in FIN_EXPORT and _prior_has(s, PAYMENT_CONTEXT)


# ── F7: approval tampering / fake approval inside a payment workflow ───────
def _approval_tampering_in_payment(s: dict) -> bool:
    if _tool(s) not in APPROVAL_TAMPER:
        return False
    return _prior_has(s, PAYMENT_CONTEXT) or _tool(s) in PAYMENT_CONTEXT


def finance_custom_rules() -> list[OmegaRule]:
    return [
        OmegaRule(domain=OmegaDomain.FINANCE, name="finance_funds_to_unverified_destination",
                  description="Funds movement to a suspicious/external/unverified destination",
                  check=_suspicious_destination),
        OmegaRule(domain=OmegaDomain.FINANCE, name="finance_funds_after_unverified_access",
                  description="Funds movement following sensitive vendor/customer/credential access without verification or approval",
                  check=_funds_after_unverified_access),
        OmegaRule(domain=OmegaDomain.FINANCE, name="finance_high_value_unverified_transfer",
                  description="High-value funds movement to a non-internal destination without approval",
                  check=_high_value_unverified),
        OmegaRule(domain=OmegaDomain.FINANCE, name="finance_payment_rerouting",
                  description="Payment rerouting: destination/account/beneficiary change before a payment terminal",
                  check=_reroute_before_payment),
        OmegaRule(domain=OmegaDomain.FINANCE, name="finance_destination_change_after_verification",
                  description="Destination/account/beneficiary change after a verification or review step",
                  check=_reroute_after_verification),
        OmegaRule(domain=OmegaDomain.FINANCE, name="finance_data_export_in_payment_workflow",
                  description="Export of sensitive vendor/payment/beneficiary data inside a payment workflow",
                  check=_export_in_payment_workflow),
        OmegaRule(domain=OmegaDomain.FINANCE, name="finance_approval_tampering",
                  description="Approval tampering / fake human approval inside a payment workflow",
                  check=_approval_tampering_in_payment),
    ]

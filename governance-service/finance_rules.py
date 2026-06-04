"""
Finance Ω-registry hardening (deployment-level custom rules).

These are real `OmegaRule` objects evaluated by the unchanged Morrison
reachability hierarchy (A_safe runs them against every state, and each state
carries accumulated prior-step context via `step_<i>_tool` keys, so the rules
can be sequence-aware). They extend — they do not replace — the engine's
default finance rules, using the engine's documented `custom_rules` extension
point.

Coverage (maps to the reported finance gaps):
  F1  funds movement to a suspicious / unverified destination
  F2  funds movement following credential / secrets / customer-account access
      with no intervening verification / approval step
  F3  high-value funds movement to a non-internal destination without approval
"""

from __future__ import annotations

from morrison_governance.domains import OmegaDomain, OmegaRule

# Tool vocabularies (lower-cased, matched by exact tool name).
FUNDS_MOVE = {
    "transfer_funds", "transfer", "send_payment", "send_funds", "move_funds",
    "make_payment", "release_funds", "wire", "wire_transfer", "ach", "swift",
    "execute_trade", "payout", "disburse", "remit", "pay", "settle",
}
SENSITIVE_ACCESS = {
    "read_secrets", "get_secrets", "read_credentials", "get_credentials",
    "read_keychain", "vault_read", "read_env", "retrieve_customer_account",
    "get_customer_account", "read_customer_data", "export_customer_data",
    "read_account", "query_customer", "fetch_customer", "retrieve_account",
}
VERIFICATION = {
    "verify", "verify_identity", "verify_account", "verify_destination",
    "validate_destination", "kyc", "kyc_check", "aml_check", "authorize",
    "authorise", "authorize_transfer", "approve_transfer", "approve_payment",
    "manager_approval", "two_factor", "mfa", "confirm_identity",
}
# Suspicious destination substrings (case-insensitive).
SUSPICIOUS_DEST = (
    "attacker", "external", "unverified", "unknown", "unapproved",
    "unauthorized", "unauthorised", "suspicious",
)
HIGH_VALUE = 10_000.0


def _tool(s: dict) -> str:
    return str(s.get("tool", "")).strip().lower()


def _prior_tools(s: dict) -> list[str]:
    # from_plan accumulates prior steps as step_<i>_tool in the state context.
    return [str(v).strip().lower() for k, v in s.items()
            if k.startswith("step_") and k.endswith("_tool")]


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


def _suspicious_destination(s: dict) -> bool:
    if _tool(s) not in FUNDS_MOVE:
        return False
    txt = _dest_text(s)
    if any(tok in txt for tok in SUSPICIOUS_DEST):
        return True
    if _flag_false(s, "verified", "approved", "authorized", "authorised"):
        return True
    return False


def _funds_after_unverified_access(s: dict) -> bool:
    if _tool(s) not in FUNDS_MOVE:
        return False
    if _has_approval(s):
        return False
    priors = _prior_tools(s)
    accessed = any(t in SENSITIVE_ACCESS for t in priors)
    verified = any(t in VERIFICATION for t in priors)
    return accessed and not verified


def _high_value_unverified(s: dict) -> bool:
    if _tool(s) not in FUNDS_MOVE or _has_approval(s):
        return False
    if _amount(s) < HIGH_VALUE:
        return False
    txt = _dest_text(s)
    internal = any(k in txt for k in ("internal", "payroll", "own_account", "in_house"))
    return not internal


def finance_custom_rules() -> list[OmegaRule]:
    return [
        OmegaRule(
            domain=OmegaDomain.FINANCE,
            name="finance_funds_to_unverified_destination",
            description="Funds movement to a suspicious/external/unverified destination",
            check=_suspicious_destination,
        ),
        OmegaRule(
            domain=OmegaDomain.FINANCE,
            name="finance_funds_after_unverified_access",
            description="Funds movement following credential/secrets/customer-account access without verification or approval",
            check=_funds_after_unverified_access,
        ),
        OmegaRule(
            domain=OmegaDomain.FINANCE,
            name="finance_high_value_unverified_transfer",
            description="High-value funds movement to a non-internal destination without approval",
            check=_high_value_unverified,
        ),
    ]

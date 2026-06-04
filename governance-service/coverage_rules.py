"""
Adversarial coverage hardening (deployment-level custom Ω rules).

ADDITIVE ONLY. These are real `OmegaRule`s evaluated by the unchanged Morrison
reachability hierarchy (A_safe runs them against every state; each state carries
accumulated prior-step context — `step_<i>_tool`, `step_<i>_args` — so the rules
are sequence-aware). They extend coverage; they do not modify or weaken any
existing rule, and they only fire on tool vocabularies the default rules do not
already govern, so existing passing evaluations are preserved.

Coverage added:
  C1 indirect_sensitive_egress      — sensitive source → euphemistic egress
                                       (semantic indirection + indirect leakage
                                       through derived artifacts; derive/transform
                                       steps do not clear taint)
  C2 delegated_external_egress      — external action reached via a delegation/
                                       orchestration chain (hidden multi-agent /
                                       delegated execution), with sensitive data
                                       or an external/suspicious destination
  C3 abstraction_conceals_funds     — planner-abstraction tool concealing a
                                       funds movement to a suspicious destination

Bounded recursive expansion: prior- and current-step args are scanned (depth ≤ 3)
for inlined sub-calls so a delegate/orchestrate step that *embeds* an egress is
treated as expandable rather than atomic. Cross-call expansion of a sub-plan that
is NOT inlined in the trajectory cannot be performed here (the flattened
evaluate_plan input does not contain it); such cases require the multi_agent_eval
joint-trajectory path upstream.
"""

from __future__ import annotations

import json

from morrison_governance.domains import OmegaDomain, OmegaRule

# ── Vocabularies (lower-cased, exact tool-name match) ──
SENSITIVE_SOURCES = {
    "read_secrets", "get_secrets", "read_credentials", "get_credentials",
    "read_keychain", "vault_read", "read_env", "read_sensitive_data",
    "retrieve_customer_account", "get_customer_account", "read_customer_data",
    "export_customer_data", "read_account", "query_customer", "read_pii",
    "read_phi", "read_patient_record", "fetch_customer", "retrieve_account",
}
# Euphemistic egress / "share" verbs (semantic indirection).
EGRESS_EUPHEMISMS = {
    "release_summary", "publish_insight", "distribute_signal", "propagate_findings",
    "share_aggregate_output", "coordination_result", "publish_trend", "publish",
    "release", "distribute", "broadcast", "share_external", "post_results",
    "emit", "syndicate", "export_insight", "share_findings", "publish_report",
    "release_findings", "share_signal", "propagate_result", "disseminate",
}
# Concrete external egress tools (in addition to euphemisms).
EXTERNAL_TOOLS = {
    "http_request", "api_call", "upload", "post", "send_external", "webhook",
    "http_post", "fetch_external", "push",
}
# Delegation / orchestration / abstraction (expandable, non-atomic).
DELEGATION = {
    "delegate_to_agent", "delegate", "execute_workflow", "run_pipeline",
    "orchestrate_process", "launch_subsystem", "dispatch", "invoke_agent",
    "spawn_agent", "run_workflow", "execute_plan", "handoff", "route_to_agent",
}
PLANNER_ABSTRACTION = {
    "treasury_optimization", "funding_plan", "execution_instructions",
    "liquidity_balancing", "settlement_orchestration", "workflow_coordination",
    "optimize_treasury", "rebalance_liquidity", "orchestrate_settlement",
    "funding_instructions", "capital_allocation",
}
# Taint-clearing steps (these DO neutralise a sensitive source).
SANITIZE = {
    "sanitize", "sanitise", "anonymize", "anonymise", "redact", "deidentify",
    "de_identify", "tokenize", "tokenise", "mask", "scrub", "differential_privacy",
    "dp_noise", "aggregate_with_consent", "pseudonymize",
}
EXPANSION_KEYS = (
    "sub_action", "subaction", "then", "next", "callback", "inner", "inner_tool",
    "inner_call", "action", "actions", "steps", "plan", "sub_plan", "delegate",
    "target_tool", "task", "tool_call", "tool_calls",
)
SUSPICIOUS_DEST = (
    "attacker", "external", "unverified", "unknown", "unapproved",
    "unauthorized", "unauthorise", "suspicious", ".ext", "exfil",
)
CRED_PII_MARKERS = (
    ".env", "secret", "password", "credential", "api_key", "apikey", "token",
    "private_key", "/etc/shadow", "/etc/passwd", "customer", "pii", "phi",
    "ssn", "card_number", "patient",
)


def _tool(s: dict) -> str:
    return str(s.get("tool", "")).strip().lower()


def _current_args(s: dict) -> dict:
    raw = s.get("args")
    if isinstance(raw, str) and raw:
        try:
            v = json.loads(raw)
            return v if isinstance(v, dict) else {}
        except (ValueError, TypeError):
            return {}
    return {}


def _collect_tools(obj, depth: int = 0) -> list[str]:
    """Recursively collect tool-ish names from nested structures (bounded)."""
    if depth > 3 or obj is None:
        return []
    if isinstance(obj, str):
        return [obj.strip().lower()]
    out: list[str] = []
    if isinstance(obj, dict):
        for key in ("tool", "name", "action"):
            v = obj.get(key)
            if isinstance(v, str):
                out.append(v.strip().lower())
        for k, v in obj.items():
            if k in EXPANSION_KEYS or isinstance(v, (dict, list)):
                out += _collect_tools(v, depth + 1)
    elif isinstance(obj, list):
        for it in obj:
            out += _collect_tools(it, depth + 1)
    return out


def _prior_tools(s: dict) -> list[str]:
    tools = [str(v).strip().lower() for k, v in s.items()
             if k.startswith("step_") and k.endswith("_tool")]
    for k, v in s.items():
        if k.startswith("step_") and k.endswith("_args") and isinstance(v, dict):
            tools += _collect_tools(v, 1)
    return tools


def _current_tools(s: dict) -> list[str]:
    """Current tool + any inlined sub-call tools (bounded expansion)."""
    return [_tool(s)] + _collect_tools(_current_args(s), 0)


def _text(s: dict) -> str:
    parts = [str(s.get("args", ""))]
    for k in ("destination_account", "destination", "to", "recipient", "url",
              "endpoint", "host", "account", "beneficiary", "dest", "uri"):
        v = s.get(k)
        if v is not None:
            parts.append(str(v))
    return " ".join(parts).lower()


def _flag_true(s: dict, *keys: str) -> bool:
    return any(str(s.get(k, "")).strip().lower() == "true" for k in keys)


def _internal(s: dict) -> bool:
    return _flag_true(s, "internal", "destination_internal", "is_internal")


def _sanitized(s: dict) -> bool:
    priors = _prior_tools(s)
    if any(t in SANITIZE for t in priors):
        return True
    return _flag_true(s, "sanitized", "sanitised", "anonymized", "consent_verified", "redacted")


def _sensitive_in_prefix(s: dict) -> bool:
    # explicit sensitive tools in the prefix
    if any(t in SENSITIVE_SOURCES for t in _prior_tools(s)):
        return True
    # read/get/load steps whose args reference credentials/PII/PHI
    for k, v in s.items():
        if k.startswith("step_") and k.endswith("_args") and isinstance(v, dict):
            blob = json.dumps(v).lower()
            if any(m in blob for m in CRED_PII_MARKERS):
                return True
    return False


def _suspicious_or_external_dest(s: dict) -> bool:
    if _internal(s):
        return False
    txt = _text(s)
    if any(tok in txt for tok in SUSPICIOUS_DEST):
        return True
    # a concrete external tool with a destination present (and not internal)
    if any(t in EXTERNAL_TOOLS for t in _current_tools(s)):
        if any(s.get(k) for k in ("url", "endpoint", "destination", "host", "uri", "to")):
            return True
    return False


# ── C1: sensitive source → euphemistic egress (taint survives derivation) ──
def _indirect_sensitive_egress(s: dict) -> bool:
    if not any(t in EGRESS_EUPHEMISMS for t in _current_tools(s)):
        return False
    if _internal(s) or _sanitized(s):
        return False
    return _sensitive_in_prefix(s)


# ── C2: external action reached via a delegation/orchestration chain ──
def _delegated_external_egress(s: dict) -> bool:
    cur = _current_tools(s)
    is_egress = (any(t in EGRESS_EUPHEMISMS for t in cur)
                 or any(t in EXTERNAL_TOOLS for t in cur))
    if not is_egress or _internal(s):
        return False
    # Delegation may be a prior step OR the current (expandable) step that
    # inlines the egress as a sub-call.
    reach = _prior_tools(s) + cur
    via_delegation = any(t in DELEGATION or t in PLANNER_ABSTRACTION for t in reach)
    if not via_delegation:
        return False
    # require a real risk signal: sensitive data in the chain OR external/suspicious sink
    return _sensitive_in_prefix(s) or _suspicious_or_external_dest(s)


# ── C3: planner-abstraction concealing a funds movement to a bad destination ──
def _abstraction_conceals_funds(s: dict) -> bool:
    cur = _current_tools(s)
    if not any(t in PLANNER_ABSTRACTION or t in DELEGATION for t in cur):
        return False
    if _flag_true(s, "authorized", "authorised", "approved", "verified"):
        return False
    txt = _text(s)
    looks_financial = any(k in s for k in ("amount", "destination_account", "value")) or "transfer" in txt or "settle" in txt or "fund" in txt
    return looks_financial and any(tok in txt for tok in SUSPICIOUS_DEST)


def coverage_custom_rules() -> list[OmegaRule]:
    return [
        OmegaRule(
            domain=OmegaDomain.DATA_PRIVACY,
            name="indirect_sensitive_egress",
            description="Sensitive data egressed via a euphemistic/derived publish step without sanitisation",
            check=_indirect_sensitive_egress,
        ),
        OmegaRule(
            domain=OmegaDomain.ENTERPRISE,
            name="delegated_external_egress",
            description="External action reached through a delegation/orchestration chain carrying sensitive data or an external destination",
            check=_delegated_external_egress,
        ),
        OmegaRule(
            domain=OmegaDomain.FINANCE,
            name="abstraction_conceals_funds",
            description="Planner-abstraction/orchestration tool concealing a funds movement to a suspicious destination",
            check=_abstraction_conceals_funds,
        ),
    ]

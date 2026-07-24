"""
Internal Operations Ω rule set (deployment-level custom rules).

Governs the platform's OWN autonomous Operations Agent — the internal service
that coordinates onboarding, audits, deployments, reporting and evidence
generation for the managed Runtime Governance business. The agent is NOT
trusted: every privileged operations action it proposes is submitted to this
engine as a synthetic one-step trajectory BEFORE execution, and these rules
decide it exactly like any customer workload.

Deny-by-default, mirroring the flag-driven style of sector_rules.py: a
privileged operations tool violates Ω unless the calling runtime attaches the
relevant explicit authorisation flag (which the Control Room attaches only
after an operator sign-off). Two classes are unconditional — evidence
destruction and credential sharing are never permitted for the agent,
regardless of flags.

Like finance_rules / sector_rules, these run as `custom_rules` in the unchanged
reachability hierarchy (engine untouched) and are attributed to the V5+
extended layer by the service. They are tool-scoped, so they are inert for
customer workloads that never use the internal ops tool vocabulary.

Domain mapping uses existing OmegaDomain enum values only (no engine change):
  ENTERPRISE     unauthorised operations execution (deploy, onboard, promote…)
  COMPLIANCE     evidence / audit-trail destruction
  DATA_PRIVACY   confidential export + credential exposure
"""

from __future__ import annotations

from morrison_governance.domains import OmegaDomain, OmegaRule


# ── Shared state helpers (mirror sector_rules.py conventions) ──
def _tool(s: dict) -> str:
    return str(s.get("tool", "")).strip().lower()


def _flag_true(s: dict, *keys: str) -> bool:
    """True if any of the named flags is explicitly truthy (True / "true")."""
    for k in keys:
        v = s.get(k)
        if v is True:
            return True
        if isinstance(v, str) and v.strip().lower() == "true":
            return True
    return False


def _unauthorized(s: dict, *keys: str) -> bool:
    """Deny-by-default: unauthorised unless an explicit flag is present+true."""
    return not _flag_true(s, *keys)


def _external_destination(s: dict) -> bool:
    if _flag_true(s, "destination_internal", "internal", "is_internal"):
        return False
    if _flag_true(s, "destination_external", "external"):
        return True
    txt = " ".join(str(s.get(k, "")) for k in ("args", "destination", "url", "to", "recipient")).lower()
    return any(tok in txt for tok in ("external", "attacker", "unverified", "unknown", "public_internet"))


# ─────────────────────────────────────────────────────────────────────────
# Internal operations tool vocabulary (lower-cased, exact tool-name match)
# ─────────────────────────────────────────────────────────────────────────

OPS_REPORT_DELIVERY = {"send_confidential_report", "deliver_report", "email_report",
                       "send_enterprise_report", "publish_report", "send_report"}
OPS_DEPLOY = {"deploy_runtime", "promote_deployment", "rollout_runtime",
              "deploy_service", "trigger_deployment", "redeploy"}
OPS_ORG_CREATE = {"create_organisation", "create_organization", "create_org",
                  "onboard_customer", "provision_tenant"}
OPS_PILOT_PROMOTE = {"promote_to_pilot", "activate_pilot", "advance_engagement_stage",
                     "promote_engagement"}
OPS_CUSTOMER_MODIFY = {"modify_customer", "update_customer_record", "change_customer_plan",
                       "merge_customer", "archive_customer", "delete_customer"}
OPS_EVIDENCE_DESTROY = {"delete_evidence", "purge_evidence", "delete_audit_log",
                        "purge_audit_trail", "tamper_evidence", "redact_evidence",
                        "rewrite_evidence"}
OPS_CREDENTIAL_SHARE = {"share_credentials", "send_credentials", "expose_secret",
                        "share_api_key", "export_secrets", "email_credentials",
                        "reveal_service_key"}
OPS_DOCUMENT_EXPORT = {"export_documents", "export_evidence", "bulk_export",
                       "download_all_documents", "export_customer_data"}

# Governed internal executors (Phase 2). Low-risk, INTERNAL-ONLY by contract:
# they open incidents, snapshot intelligence, or set an internal review date.
# They are permitted under normal (internal) use, but must never reach out — the
# rule below blocks them if they carry an external destination, so the "internal"
# classification is engine-enforced, not merely asserted.
OPS_INTERNAL_ACTIONS = {"open_incident", "refresh_customer_intelligence",
                        "schedule_internal_review", "create_work_item",
                        "generate_deployment_checklist", "prepare_draft_reply",
                        "draft_policy"}

# Executive Command (Phase 4). Changing the enterprise autonomy mode. The safety
# asymmetry is engine-enforced: LOWERING autonomy (toward pause) is always
# permitted — a fail-safe brake — while RAISING autonomy (the trajectory carries
# `raising_autonomy`) is denied-by-default and requires explicit operator
# approval. A raise without the flag can never be auto-executed.
OPS_AUTONOMY_CHANGE = {"set_autonomy_mode", "raise_autonomy", "change_autonomy_mode",
                       "set_autonomy", "escalate_autonomy"}

# Policy Engineering (Guardian OS departments). GuardianOS may DRAFT governance
# policy autonomously (an inert artifact), but ACTIVATING a policy — making an Ω
# rule / approval chain / deployment constraint live — is a privileged action
# that reshapes the kernel's own behaviour. It is denied-by-default and requires
# explicit operator approval. draft_policy is intentionally NOT here: a draft
# changes nothing and is permitted (internal-only, covered by the internal-reach
# rule). "No policy becomes active without approval."
OPS_POLICY_ACTIVATION = {"activate_policy", "deploy_policy", "publish_policy",
                         "enact_policy", "apply_policy", "promote_policy",
                         "activate_governance_policy"}


def operations_custom_rules() -> list[OmegaRule]:
    """Deny-by-default Ω rules for the internal Operations Agent."""
    rules: list[OmegaRule] = []

    # ── ENTERPRISE: privileged operations require explicit operator sign-off ──
    rules.append(OmegaRule(
        domain=OmegaDomain.ENTERPRISE,
        name="ops_unauthorized_report_delivery",
        description="Operations agent delivering a confidential enterprise report "
                    "without explicit delivery authorisation",
        check=lambda s: _tool(s) in OPS_REPORT_DELIVERY
        and _unauthorized(s, "report_delivery_authorized", "delivery_authorized"),
        severity="critical",
    ))
    rules.append(OmegaRule(
        domain=OmegaDomain.ENTERPRISE,
        name="ops_unauthorized_deployment",
        description="Operations agent triggering a runtime deployment without an "
                    "approved change (deployment_approved)",
        check=lambda s: _tool(s) in OPS_DEPLOY
        and _unauthorized(s, "deployment_approved", "change_approved"),
        severity="critical",
    ))
    rules.append(OmegaRule(
        domain=OmegaDomain.ENTERPRISE,
        name="ops_unauthorized_org_creation",
        description="Operations agent creating an organisation / tenant without "
                    "verified onboarding (onboarding_verified)",
        check=lambda s: _tool(s) in OPS_ORG_CREATE
        and _unauthorized(s, "onboarding_verified", "operator_approved"),
        severity="critical",
    ))
    rules.append(OmegaRule(
        domain=OmegaDomain.ENTERPRISE,
        name="ops_unauthorized_pilot_promotion",
        description="Operations agent promoting a customer to pilot / advancing an "
                    "engagement stage without operator approval (pilot_approved)",
        check=lambda s: _tool(s) in OPS_PILOT_PROMOTE
        and _unauthorized(s, "pilot_approved", "operator_approved"),
        severity="critical",
    ))
    rules.append(OmegaRule(
        domain=OmegaDomain.ENTERPRISE,
        name="ops_unauthorized_customer_modification",
        description="Operations agent modifying / archiving a customer record "
                    "without change authorisation (change_authorized)",
        check=lambda s: _tool(s) in OPS_CUSTOMER_MODIFY
        and _unauthorized(s, "change_authorized", "operator_approved"),
        severity="critical",
    ))

    # ── COMPLIANCE: evidence is immutable — destruction is never authorised ──
    rules.append(OmegaRule(
        domain=OmegaDomain.COMPLIANCE,
        name="ops_evidence_destruction",
        description="Operations agent destroying or tampering with governance "
                    "evidence / audit trail — never permitted, no flag overrides",
        check=lambda s: _tool(s) in OPS_EVIDENCE_DESTROY,
        severity="critical",
    ))

    # ── DATA_PRIVACY: credentials never leave; exports need authorisation ──
    rules.append(OmegaRule(
        domain=OmegaDomain.DATA_PRIVACY,
        name="ops_credential_sharing",
        description="Operations agent sharing / exposing credentials or service "
                    "keys — never permitted, no flag overrides",
        check=lambda s: _tool(s) in OPS_CREDENTIAL_SHARE,
        severity="critical",
    ))
    rules.append(OmegaRule(
        domain=OmegaDomain.DATA_PRIVACY,
        name="ops_unauthorized_document_export",
        description="Operations agent exporting documents / customer data without "
                    "export authorisation, or to an external destination",
        check=lambda s: _tool(s) in OPS_DOCUMENT_EXPORT
        and (_unauthorized(s, "export_authorized") or _external_destination(s)),
        severity="critical",
    ))

    # ── DATA_PRIVACY: internal executors must stay internal (Phase 2) ──
    # A low-risk internal action (open incident, snapshot intelligence, schedule
    # a review…) is permitted for its internal effect, but is BLOCKED if it ever
    # carries an external destination — the engine enforces the internal-only
    # contract so a bug or hostile recommendation cannot weaponise it to reach
    # outside the platform.
    rules.append(OmegaRule(
        domain=OmegaDomain.DATA_PRIVACY,
        name="ops_internal_action_external_reach",
        description="Operations agent invoking an internal-only action with an "
                    "external destination — internal executors must never reach out",
        check=lambda s: _tool(s) in OPS_INTERNAL_ACTIONS and _external_destination(s),
        severity="critical",
    ))

    # ── ENTERPRISE: raising autonomy needs operator approval (safety asymmetry) ──
    # The engine encodes the asymmetry: LOWERING autonomy (no `raising_autonomy`
    # flag) is always permitted — an operator or the agent can always pull the
    # brake — while RAISING autonomy is denied-by-default and requires an explicit
    # operator approval flag. The agent can therefore never grant itself more
    # authority without a human on the record.
    rules.append(OmegaRule(
        domain=OmegaDomain.ENTERPRISE,
        name="ops_unauthorized_autonomy_change",
        description="Operations agent raising the enterprise autonomy level without "
                    "explicit operator approval (lowering autonomy is always allowed)",
        check=lambda s: _tool(s) in OPS_AUTONOMY_CHANGE
        and _flag_true(s, "raising_autonomy", "raising")
        and _unauthorized(s, "autonomy_change_approved", "operator_approved"),
        severity="critical",
    ))

    # ── ENTERPRISE: activating governance policy needs operator approval ──────
    # GuardianOS's Policy Engineering department may draft policy freely, but a
    # policy going LIVE reshapes the kernel — deny-by-default, operator sign-off
    # required. The agent never activates policy; this makes the boundary
    # engine-enforced even for an operator-initiated request.
    rules.append(OmegaRule(
        domain=OmegaDomain.ENTERPRISE,
        name="ops_unauthorized_policy_activation",
        description="Activating / deploying a governance policy without explicit "
                    "operator approval (drafting a policy is always allowed)",
        check=lambda s: _tool(s) in OPS_POLICY_ACTIVATION
        and _unauthorized(s, "policy_activation_approved", "operator_approved"),
        severity="critical",
    ))

    return rules

"""
Target-sector Ω rule sets (deployment-level custom rules).

Promotes the eight "target deployment" sectors from positioning-only to live Ω
coverage: insurance, government, supply chain, energy, telecommunications,
manufacturing, aerospace, defence. Each sector gets a small, auditable set of
deny-by-default `OmegaRule`s that mirror the flag-driven style of the existing
domain rules (block unless the calling runtime attaches the relevant
authorisation / verification flag).

Like finance_rules / coverage_rules / domain_rules, these run as `custom_rules`
in the unchanged reachability hierarchy and are attributed to the V5+ extended
layer by the service. They are tool-scoped, so they are harmless when their
sector is not in scope and provide coverage when it is.

Forward-compatible: a sector's rules are only emitted if the running engine's
`OmegaDomain` enum actually defines that sector. On an engine that predates the
sector enum values, this module contributes nothing (no import-time error), so
it is safe to deploy before the engine ships the enum. Once the enum is present,
the rules activate automatically with correct per-sector attribution.
"""

from __future__ import annotations

from morrison_governance.domains import OmegaDomain, OmegaRule


# ── Shared state helpers (mirror domain_rules.py conventions) ──
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


def _flag_is_false(s: dict, *keys: str) -> bool:
    """True if any of the named flags is explicitly falsey (False / "false")."""
    for k in keys:
        v = s.get(k)
        if v is False:
            return True
        if isinstance(v, str) and v.strip().lower() == "false":
            return True
    return False


def _str_field(s: dict, *keys: str) -> str:
    return " ".join(str(s.get(k, "")) for k in keys).strip().lower()


def _is_external(s: dict) -> bool:
    if _flag_true(s, "destination_internal", "internal", "is_internal"):
        return False
    if _flag_true(s, "destination_external", "external"):
        return True
    txt = _str_field(s, "args", "destination", "url", "endpoint", "to", "recipient")
    return any(tok in txt for tok in ("external", "attacker", "unverified", "unknown", "public_internet"))


def _unauthorized(s: dict, *keys: str) -> bool:
    """Deny-by-default: the action is unauthorised unless an explicit
    authorisation/verification flag is present and true."""
    return not _flag_true(s, *keys)


def _out_of_envelope(s: dict, within_key: str, out_key: str) -> bool:
    """Safety-envelope breach: explicitly out-of-envelope, or not explicitly
    confirmed within the safe envelope."""
    return _flag_true(s, out_key) or _flag_is_false(s, within_key) or not _flag_true(s, within_key)


# ─────────────────────────────────────────────────────────────────────────
# Per-sector tool vocabularies (lower-cased, exact tool-name match)
# ─────────────────────────────────────────────────────────────────────────

# Insurance
INS_CLAIM_PAYOUT = {"process_claim_payout", "pay_claim", "disburse_claim",
                    "claim_payout", "settle_claim", "release_claim_funds"}
INS_POLICY_ISSUE = {"issue_policy", "bind_policy", "activate_policy",
                    "underwrite_policy", "approve_policy"}
INS_MODEL_CHANGE = {"update_actuarial_model", "modify_rating_model",
                    "override_pricing_model", "adjust_reserve_model",
                    "tamper_actuarial_model"}

# Government / public sector
GOV_DISBURSE = {"disburse_benefit", "approve_benefit", "issue_payment",
                "release_grant", "pay_benefit", "authorize_disbursement"}
GOV_RECORD_EGRESS = {"http_request", "send_email", "api_call", "export_records",
                     "publish", "upload", "transmit", "disclose_record"}
GOV_DECISION = {"finalize_decision", "issue_ruling", "approve_application",
                "deny_application", "issue_determination"}

# Supply chain / logistics
SC_PURCHASE = {"issue_po", "create_purchase_order", "place_order",
               "award_contract", "approve_purchase", "raise_po"}
SC_SHIP = {"authorize_shipment", "dispatch_shipment", "release_shipment",
           "ship", "release_freight"}
SC_INVENTORY = {"write_off_inventory", "adjust_inventory", "scrap_inventory",
                "inventory_writeoff"}

# Energy / critical infrastructure
EN_SETPOINT = {"set_grid_setpoint", "set_load", "dispatch_generation",
               "adjust_setpoint", "set_breaker", "adjust_load"}
EN_CONTROL = {"write_control", "scada_write", "send_control_command",
              "actuate", "issue_control_command"}
EN_PROTECTION = {"disable_protection_relay", "bypass_protection",
                 "disable_safety_interlock", "disable_relay", "trip_relay"}

# Telecommunications
TC_BULK = {"bulk_provision", "bulk_deprovision", "mass_provision",
           "bulk_disconnect", "mass_deprovision"}
TC_ROUTING = {"update_bgp", "change_route", "modify_routing", "announce_route",
              "update_routing_policy"}
TC_INTERCEPT = {"enable_lawful_intercept", "start_intercept", "wiretap",
                "lawful_intercept", "provision_intercept"}

# Manufacturing
MF_MOTION = {"robot_move", "set_motion", "actuate_robot", "cnc_command",
             "move_actuator", "set_robot_trajectory"}
MF_SCHEDULE = {"change_production_schedule", "modify_schedule",
               "reschedule_production", "alter_production_plan"}
MF_QC = {"override_qc", "bypass_qc", "skip_inspection", "override_quality_gate",
         "waive_inspection"}

# Aerospace / aviation
AE_FLIGHTPLAN = {"change_flight_plan", "modify_dispatch", "update_flightplan",
                 "redispatch", "amend_flight_plan"}
AE_SIGNOFF = {"sign_off_maintenance", "release_to_service", "certify_airworthy",
              "maintenance_signoff", "return_to_service"}
AE_SAFETY_CMD = {"issue_safety_critical_command", "override_safety_system",
                 "disable_safety_system", "bypass_safety_check"}

# Defence / sovereign
DEF_CLASSIFICATIONS = ("classified", "secret", "top_secret", "restricted", "ts")
DEF_EGRESS = {"http_request", "send_email", "api_call", "export_records",
              "transmit", "upload", "publish", "share_external"}
DEF_ENGAGE = {"engage_target", "authorize_strike", "autonomous_engage",
              "weapons_release", "launch", "fire"}
DEF_CROSS_DOMAIN = {"cross_domain_transfer", "transfer_classified",
                    "move_across_domains", "spillover_transfer"}


# ─────────────────────────────────────────────────────────────────────────
# Rule check functions
# ─────────────────────────────────────────────────────────────────────────

# Insurance
def _ins_claim_unverified_payee(s: dict) -> bool:
    return _tool(s) in INS_CLAIM_PAYOUT and _unauthorized(s, "payee_verified", "authorized", "approved")


def _ins_policy_without_underwriting(s: dict) -> bool:
    return _tool(s) in INS_POLICY_ISSUE and _unauthorized(s, "underwriting_approved", "approved", "authorized")


def _ins_model_tampering(s: dict) -> bool:
    return _tool(s) in INS_MODEL_CHANGE and _unauthorized(s, "actuary_approved", "authorized", "approved")


# Government
def _gov_benefits_without_eligibility(s: dict) -> bool:
    return _tool(s) in GOV_DISBURSE and _unauthorized(s, "eligibility_verified", "authorized", "approved")


def _gov_citizen_record_external(s: dict) -> bool:
    if _tool(s) not in GOV_RECORD_EGRESS:
        return False
    has_citizen = _flag_true(s, "contains_citizen_data", "contains_pii", "contains_record")
    if not has_citizen or not _is_external(s):
        return False
    return _unauthorized(s, "authorized_disclosure", "consent_verified", "authorized")


def _gov_decision_without_authoriser(s: dict) -> bool:
    if _tool(s) not in GOV_DECISION:
        return False
    if not _flag_true(s, "regulated"):
        return False
    return _unauthorized(s, "human_authoriser", "human_authorizer", "authorized")


# Supply chain
def _sc_po_unapproved_vendor(s: dict) -> bool:
    return _tool(s) in SC_PURCHASE and _unauthorized(s, "vendor_approved", "approved", "authorized")


def _sc_ship_unverified_destination(s: dict) -> bool:
    return _tool(s) in SC_SHIP and _unauthorized(s, "destination_verified", "verified", "authorized")


def _sc_inventory_writeoff_unapproved(s: dict) -> bool:
    return _tool(s) in SC_INVENTORY and _unauthorized(s, "approved", "authorized")


# Energy
def _en_setpoint_out_of_envelope(s: dict) -> bool:
    return _tool(s) in EN_SETPOINT and _out_of_envelope(s, "within_safe_envelope", "out_of_envelope")


def _en_control_without_operator(s: dict) -> bool:
    return _tool(s) in EN_CONTROL and _unauthorized(s, "operator_confirmed", "authorized", "approved")


def _en_protection_disable(s: dict) -> bool:
    return _tool(s) in EN_PROTECTION and _unauthorized(s, "maintenance_authorized", "authorized", "approved")


# Telecommunications
def _tc_bulk_without_approval(s: dict) -> bool:
    return _tool(s) in TC_BULK and _unauthorized(s, "change_approved", "approved", "authorized")


def _tc_routing_untrusted_peer(s: dict) -> bool:
    if _tool(s) not in TC_ROUTING:
        return False
    return _flag_true(s, "untrusted_peer") or _flag_is_false(s, "peer_trusted") or not _flag_true(s, "peer_trusted")


def _tc_lawful_intercept_misuse(s: dict) -> bool:
    return _tool(s) in TC_INTERCEPT and _unauthorized(s, "warrant_verified", "authorized", "approved")


# Manufacturing
def _mf_motion_out_of_envelope(s: dict) -> bool:
    return _tool(s) in MF_MOTION and _out_of_envelope(s, "within_safety_envelope", "out_of_envelope")


def _mf_schedule_without_approval(s: dict) -> bool:
    return _tool(s) in MF_SCHEDULE and _unauthorized(s, "approved", "authorized")


def _mf_qc_override(s: dict) -> bool:
    return _tool(s) in MF_QC and _unauthorized(s, "authorized", "approved")


# Aerospace
def _ae_flightplan_without_authorization(s: dict) -> bool:
    return _tool(s) in AE_FLIGHTPLAN and _unauthorized(s, "authorized", "approved", "dispatcher_approved")


def _ae_signoff_without_inspection(s: dict) -> bool:
    return _tool(s) in AE_SIGNOFF and _unauthorized(s, "inspection_completed", "inspected", "authorized")


def _ae_safety_command_unverified(s: dict) -> bool:
    return _tool(s) in AE_SAFETY_CMD and _unauthorized(s, "verified", "authorized", "approved")


# Defence
def _def_classified_egress(s: dict) -> bool:
    if _tool(s) not in DEF_EGRESS:
        return False
    classification = _str_field(s, "classification", "data_classification", "args")
    is_classified = any(c in classification for c in DEF_CLASSIFICATIONS) \
        or _flag_true(s, "classified", "contains_classified")
    if not is_classified or not _is_external(s):
        return False
    return _unauthorized(s, "authorized_transfer", "authorized", "cleared")


def _def_engagement_without_authority(s: dict) -> bool:
    return _tool(s) in DEF_ENGAGE and _unauthorized(s, "human_authority", "human_authorized", "authorized")


def _def_cross_domain_unauthorized(s: dict) -> bool:
    return _tool(s) in DEF_CROSS_DOMAIN and _unauthorized(s, "authorized_transfer", "authorized", "cleared")


# ─────────────────────────────────────────────────────────────────────────
# Rule specs grouped by sector. (sector_enum_name, [(rule_name, desc, check)])
# ─────────────────────────────────────────────────────────────────────────
_SECTOR_RULES: list[tuple[str, list[tuple[str, str, object]]]] = [
    ("INSURANCE", [
        ("insurance_claim_payout_to_unverified_payee",
         "Insurance claim payout/disbursement to an unverified payee",
         _ins_claim_unverified_payee),
        ("insurance_policy_issued_without_underwriting",
         "Policy issued/bound/activated without underwriting approval",
         _ins_policy_without_underwriting),
        ("insurance_actuarial_model_tampering",
         "Actuarial/rating/reserve model changed without actuary authorisation",
         _ins_model_tampering),
    ]),
    ("GOVERNMENT", [
        ("government_benefits_without_eligibility",
         "Benefit/grant disbursed without eligibility verification",
         _gov_benefits_without_eligibility),
        ("government_citizen_record_external_disclosure",
         "Citizen record disclosed to an external destination without authorisation",
         _gov_citizen_record_external),
        ("government_regulated_decision_without_authoriser",
         "Regulated decision finalised without a human authoriser",
         _gov_decision_without_authoriser),
    ]),
    ("SUPPLY_CHAIN", [
        ("supply_chain_po_to_unapproved_vendor",
         "Procurement / purchase order issued to an unapproved vendor",
         _sc_po_unapproved_vendor),
        ("supply_chain_shipment_to_unverified_destination",
         "Shipment authorised/dispatched to an unverified destination",
         _sc_ship_unverified_destination),
        ("supply_chain_inventory_writeoff_without_approval",
         "Inventory write-off / adjustment without approval",
         _sc_inventory_writeoff_unapproved),
    ]),
    ("ENERGY", [
        ("energy_grid_setpoint_out_of_envelope",
         "Grid setpoint / load / dispatch command outside the safe operating envelope",
         _en_setpoint_out_of_envelope),
        ("energy_control_write_without_operator",
         "Control-system / SCADA write without operator confirmation",
         _en_control_without_operator),
        ("energy_protection_relay_disable",
         "Protection relay / safety interlock disabled without maintenance authorisation",
         _en_protection_disable),
    ]),
    ("TELECOMMUNICATIONS", [
        ("telecom_bulk_provisioning_without_approval",
         "Bulk provisioning / de-provisioning without change approval",
         _tc_bulk_without_approval),
        ("telecom_routing_change_to_untrusted_peer",
         "Routing / BGP change announced to an untrusted peer",
         _tc_routing_untrusted_peer),
        ("telecom_lawful_intercept_misuse",
         "Lawful-intercept enabled without a verified warrant",
         _tc_lawful_intercept_misuse),
    ]),
    ("MANUFACTURING", [
        ("manufacturing_robotics_motion_out_of_envelope",
         "Robotics / CNC motion command outside the safety envelope",
         _mf_motion_out_of_envelope),
        ("manufacturing_schedule_change_without_approval",
         "Production-schedule change without approval",
         _mf_schedule_without_approval),
        ("manufacturing_qc_override",
         "Quality-control gate / inspection overridden without authorisation",
         _mf_qc_override),
    ]),
    ("AEROSPACE", [
        ("aerospace_flightplan_change_without_authorization",
         "Flight-plan / dispatch change without authorisation",
         _ae_flightplan_without_authorization),
        ("aerospace_maintenance_signoff_without_inspection",
         "Maintenance sign-off / return-to-service without a completed inspection",
         _ae_signoff_without_inspection),
        ("aerospace_safety_critical_command_unverified",
         "Safety-critical command issued / safety system disabled without verification",
         _ae_safety_command_unverified),
    ]),
    ("DEFENCE", [
        ("defence_classified_artifact_egress",
         "Classified artifact egressed externally without authorised transfer",
         _def_classified_egress),
        ("defence_autonomous_engagement_without_authority",
         "Autonomous engagement / weapons release without human authority",
         _def_engagement_without_authority),
        ("defence_cross_domain_transfer_unauthorized",
         "Cross-domain (classification boundary) transfer without authorisation",
         _def_cross_domain_unauthorized),
    ]),
]


def _resolve(enum_name: str):
    """Return the OmegaDomain member for a sector if the running engine defines
    it, else None (so older engines simply skip the sector)."""
    return getattr(OmegaDomain, enum_name, None)


def sector_custom_rules() -> list[OmegaRule]:
    """Deployment Ω rules for the target sectors present in the running engine."""
    rules: list[OmegaRule] = []
    for enum_name, specs in _SECTOR_RULES:
        domain = _resolve(enum_name)
        if domain is None:
            continue  # engine predates this sector enum value — skip safely
        for name, description, check in specs:
            rules.append(OmegaRule(domain=domain, name=name,
                                   description=description, check=check))
    return rules


# Sector ids (enum .value) that the running engine can evaluate live. The
# website can read this to decide which sectors to present as live vs pending.
def live_sector_ids() -> list[str]:
    out = []
    for enum_name, _ in _SECTOR_RULES:
        domain = _resolve(enum_name)
        if domain is not None:
            out.append(domain.value)
    return out

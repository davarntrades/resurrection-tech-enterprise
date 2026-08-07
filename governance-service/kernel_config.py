"""Production trust configuration for the governance kernel.

This is the deployment-side half of the trust boundary: the tool manifest,
the internal-destination allowlists, the server-owned policy values, and the
approval signing key. None of it is reachable from a tool call.

Everything here is configuration, not logic — the enforcing logic lives in
`morrison_governance.kernel` and is covered by the logic-binding ruleset hash.
"""

from __future__ import annotations

import os

from morrison_governance.kernel import capabilities as C
from morrison_governance.kernel import Principal, SecurityContext

# ── Approval signing ────────────────────────────────────────────────────
# The key that verifies approval artifacts. Server-side only; an agent that
# could read this could mint its own approvals, so it is never echoed by any
# endpoint (/health reports only whether it is configured).
APPROVAL_SIGNING_KEY = os.getenv("GOVERNANCE_APPROVAL_KEY", "").encode()

# Evidence sealing uses a DISTINCT key from approval verification. Reusing one
# key for both would mean the key that seals the audit trail is the same key
# that mints approvals — compromise of either becomes compromise of both, and
# the evidence would be sealed by exactly the component it is meant to hold to
# account. Independent attestation (Ed25519 over the chain head, public-key
# verified) is configured separately again; see ATTESTATION_PUBLIC_KEY.
EVIDENCE_SEALING_KEY = os.getenv(
    "GOVERNANCE_EVIDENCE_KEY", os.getenv("GOVERNANCE_APPROVAL_KEY", "")).encode()

# True when GOVERNANCE_EVIDENCE_KEY was not set and the approval key was reused.
EVIDENCE_KEY_IS_FALLBACK = (
    not os.getenv("GOVERNANCE_EVIDENCE_KEY", "")
    and bool(os.getenv("GOVERNANCE_APPROVAL_KEY", "")))

# Public key of the EXTERNAL attestation signer. The service never holds the
# corresponding private key — it cannot mint its own attestations, which is the
# property that makes them independent. Hex-encoded raw 32-byte Ed25519 key.
ATTESTATION_PUBLIC_KEY = os.getenv("GOVERNANCE_ATTESTATION_PUBKEY", "")
TRUSTED_ISSUERS = frozenset(
    i.strip() for i in os.getenv(
        "GOVERNANCE_TRUSTED_ISSUERS", "security-review,change-board,human-approver"
    ).split(",") if i.strip())

# ── Trusted destination configuration ───────────────────────────────────
INTERNAL_URL_HOSTS = tuple(
    h.strip() for h in os.getenv(
        "GOVERNANCE_INTERNAL_HOSTS",
        "internal,localhost,acme.internal,corp.acme.com").split(",") if h.strip())
INTERNAL_EMAIL_DOMAINS = tuple(
    d.strip() for d in os.getenv(
        "GOVERNANCE_INTERNAL_EMAIL_DOMAINS", "acme.com").split(",") if d.strip())
INTERNAL_CIDRS = tuple(
    c.strip() for c in os.getenv(
        "GOVERNANCE_INTERNAL_CIDRS", "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    ).split(",") if c.strip())

# ── Server-owned policy values ──────────────────────────────────────────
# `payment_auto_approve_max` is the value the red team supplied itself as
# `threshold` to defeat `excessive_amount`. It now lives here.
POLICY_VALUES = {
    "payment_auto_approve_max": float(os.getenv("GOVERNANCE_PAYMENT_AUTO_MAX", "1000")),
    "egress_requires_approval_after_read": True,
    "amount_threshold": float(os.getenv("GOVERNANCE_AMOUNT_THRESHOLD", "10000")),
}

# ── Declared tool manifest ──────────────────────────────────────────────
# Declared capabilities are a FLOOR: the classifier's inferred capabilities are
# unioned in, so a wrong or malicious manifest entry can add governance but can
# never remove it. Tools absent from this manifest fail closed (ESCALATE).
TOOL_MANIFEST: dict[str, list[str]] = {
    # ── ordinary read/work tools ────────────────────────────────────────
    "read_file": [C.CAP_DATA_READ],
    "list_files": [C.CAP_DATA_READ],
    "read_config": [C.CAP_DATA_READ],
    "get_metadata": [C.CAP_DATA_READ],
    "describe_service": [C.CAP_DATA_READ],
    "describe_cluster": [C.CAP_DATA_READ],
    "snapshot_list": [C.CAP_DATA_READ],
    "query_db": [C.CAP_DATA_READ],
    "search_index": [C.CAP_DATA_READ],
    "summarize": [],
    "read_email": [C.CAP_DATA_READ],
    "read_ticket": [C.CAP_DATA_READ],
    "read_pdf": [C.CAP_DATA_READ],
    "get_crm_record": [C.CAP_DATA_READ],
    "list_accounts": [C.CAP_DATA_READ],
    "agent_result": [],
    "browser_navigate": [C.CAP_DATA_READ, C.CAP_EXTERNAL_DATA_MOVE],

    # ── egress ──────────────────────────────────────────────────────────
    "send_email": [C.CAP_EXTERNAL_DATA_MOVE],
    "http_request": [C.CAP_EXTERNAL_DATA_MOVE],
    "http_post": [C.CAP_EXTERNAL_DATA_MOVE],
    "api_call": [C.CAP_EXTERNAL_DATA_MOVE],
    "post": [C.CAP_EXTERNAL_DATA_MOVE],
    "webhook": [C.CAP_EXTERNAL_DATA_MOVE],
    "upload": [C.CAP_EXTERNAL_DATA_MOVE],
    "gdrive_upload": [C.CAP_EXTERNAL_DATA_MOVE],
    "copy_object": [C.CAP_EXTERNAL_DATA_MOVE],
    "export_report": [C.CAP_EXTERNAL_DATA_MOVE, C.CAP_DATA_READ],
    "resolve_dns": [C.CAP_EXTERNAL_DATA_MOVE],
    "telemetry_ship": [C.CAP_EXTERNAL_DATA_MOVE],

    # ── credentials ─────────────────────────────────────────────────────
    "vault_lookup": [C.CAP_CREDENTIAL_READ],
    "read_secrets": [C.CAP_CREDENTIAL_READ],
    "get_credentials": [C.CAP_CREDENTIAL_READ],
    "reset_password": [C.CAP_CREDENTIAL_CHANGE],
    "generate_reset_token": [C.CAP_CREDENTIAL_CHANGE],
    "send_reset": [C.CAP_CREDENTIAL_CHANGE],
    "create_access_key": [C.CAP_CREDENTIAL_CHANGE, C.CAP_PERSISTENCE],
    "add_ssh_key": [C.CAP_CREDENTIAL_CHANGE, C.CAP_PERSISTENCE],
    "update_contact": [C.CAP_CREDENTIAL_CHANGE],

    # ── IAM / privilege ─────────────────────────────────────────────────
    "update_role": [C.CAP_IAM_PRIVILEGED],
    "grant_permission": [C.CAP_IAM_PRIVILEGED],
    "attach_policy": [C.CAP_IAM_PRIVILEGED],
    "update_iam_binding": [C.CAP_IAM_PRIVILEGED],
    "create_service_account": [C.CAP_IAM_PRIVILEGED],
    "create_user": [C.CAP_IAM_PRIVILEGED],
    "update_account": [C.CAP_IAM_PRIVILEGED],
    "approve_request": [C.CAP_IAM_PRIVILEGED],

    # ── destructive ─────────────────────────────────────────────────────
    "execute_sql": [C.CAP_DATA_READ],
    "run_migration": [],
    "delete_bucket": [C.CAP_INFRA_DESTRUCTIVE],
    "delete_cluster": [C.CAP_INFRA_DESTRUCTIVE],
    "terminate_instances": [C.CAP_INFRA_DESTRUCTIVE],
    "reclaim_capacity": [C.CAP_INFRA_DESTRUCTIVE],
    "drop_database": [C.CAP_DATA_DESTRUCTIVE],
    "delete_backups": [C.CAP_BACKUP_DESTRUCTIVE],
    "update_backup_config": [],
    "set_lifecycle_policy": [],
    "delete_logs": [C.CAP_LOG_TAMPER],
    "clear_logs": [C.CAP_LOG_TAMPER],

    # ── security controls ───────────────────────────────────────────────
    "update_security_policy": [C.CAP_SECURITY_CONTROL],
    "update_audit_config": [C.CAP_SECURITY_CONTROL],
    "update_auth_settings": [C.CAP_SECURITY_CONTROL],
    "update_firewall": [C.CAP_SECURITY_CONTROL],
    "update_monitor": [C.CAP_SECURITY_CONTROL],
    "edr_control": [C.CAP_SECURITY_CONTROL],
    "set_deletion_protection": [C.CAP_SECURITY_CONTROL],
    "create_exception": [C.CAP_SECURITY_CONTROL],
    "update_config": [],
    "disable_mfa": [C.CAP_SECURITY_CONTROL],
    "disable_audit_logging": [C.CAP_SECURITY_CONTROL],
    "disable_edr": [C.CAP_SECURITY_CONTROL],
    "disable_firewall": [C.CAP_SECURITY_CONTROL],

    # ── payments ────────────────────────────────────────────────────────
    "transfer": [C.CAP_PAYMENT],
    "send_payment": [C.CAP_PAYMENT],
    "issue_refund": [C.CAP_PAYMENT],
    "treasury_settle": [C.CAP_PAYMENT],
    "update_payee": [C.CAP_PAYMENT],
    "execute_trade": [C.CAP_PAYMENT],

    # ── persistence / scheduling ────────────────────────────────────────
    "create_cron": [C.CAP_PERSISTENCE],
    "create_webhook": [C.CAP_PERSISTENCE],
    "create_scheduled_task": [C.CAP_PERSISTENCE],
    "apply_later": [C.CAP_PERSISTENCE],

    # ── code execution / delegation ─────────────────────────────────────
    "shell": [C.CAP_CODE_EXEC],
    "exec": [C.CAP_CODE_EXEC],
    "subprocess": [C.CAP_CODE_EXEC],
    "delegate": [C.CAP_DELEGATION],
    "spawn_agent": [C.CAP_DELEGATION],
}


def build_context(principal_id: str = "agent-svc", tenant: str = "acme",
                  roles=(), granted_capabilities=(), approvals=(),
                  unknown_tool_policy: str = "escalate") -> SecurityContext:
    """Construct the trusted SecurityContext for a request.

    In a real deployment `principal_id`, `tenant` and `roles` come from the
    authenticated session (JWT / mTLS / SSO), and `approvals` from the approval
    service — never from the request body.
    """
    return SecurityContext(
        principal=Principal(id=principal_id, tenant=tenant,
                            roles=frozenset(roles),
                            granted_capabilities=frozenset(granted_capabilities)),
        approvals=tuple(approvals),
        signing_key=APPROVAL_SIGNING_KEY,
        trusted_issuers=TRUSTED_ISSUERS,
        internal_url_hosts=INTERNAL_URL_HOSTS,
        internal_email_domains=INTERNAL_EMAIL_DOMAINS,
        internal_cidrs=INTERNAL_CIDRS,
        unknown_tool_policy=unknown_tool_policy,
        tool_manifest=TOOL_MANIFEST,
        policy_values=POLICY_VALUES,
    )


# ── Startup secret validation ───────────────────────────────────────────
# Which secrets are load-bearing, what breaks without each, and whether the
# service may boot. The red team proved that an unset GOVERNANCE_APPROVAL_KEY
# let an attacker mint approvals that verified (HMAC over an empty key is still
# a valid HMAC), so "missing secret" is a security state, not a config nit.

REQUIRED_SECRETS = {
    "GOVERNANCE_APPROVAL_KEY": (
        "verifies approval artifacts. Absent → approval verification is "
        "DISABLED and no approval-based PERMIT can be produced (fail-closed): "
        "every approvable capability escalates and legitimate work stalls."),
    "GOVERNANCE_EVIDENCE_KEY": (
        "seals the evidence chain. Absent → falls back to the approval key, so "
        "the key sealing the audit trail is the key minting approvals; if it is "
        "also absent, records are hash-chained but unsigned."),
    "GOVERNANCE_GATEWAY_SECRET": (
        "authenticates the identity headers. Absent → x-governance-principal "
        "and x-governance-tenant are believed unverified, so any caller "
        "holding GOVERNANCE_TOKEN can impersonate any principal or tenant."),
}

RECOMMENDED_SECRETS = {
    "GOVERNANCE_ATTESTATION_PUBKEY": (
        "public key of the external attestation notary. Absent → evidence can "
        "be verified for content integrity but not independently attested."),
}


def _is_production() -> bool:
    """Deployed-environment detection.

    Railway sets RAILWAY_ENVIRONMENT_NAME on every deploy. GOVERNANCE_ENV is an
    explicit override for other platforms. Local runs and CI match neither, so
    they are not forced to hold production secrets.
    """
    explicit = (os.getenv("GOVERNANCE_ENV") or "").strip().lower()
    if explicit:
        return explicit in ("production", "prod", "live")
    railway = (os.getenv("RAILWAY_ENVIRONMENT_NAME") or "").strip().lower()
    return railway in ("production", "prod", "live")


def secrets_status() -> dict:
    """Report which load-bearing secrets are configured, and the consequences.

    Reported on /health so an operator can read enforcement state off the
    running process instead of trusting the deployment's word for it.
    """
    missing_required = [k for k in REQUIRED_SECRETS if not os.getenv(k, "").strip()]
    missing_recommended = [k for k in RECOMMENDED_SECRETS
                           if not os.getenv(k, "").strip()]
    return {
        "production": _is_production(),
        "approval_verification_enabled": bool(APPROVAL_SIGNING_KEY),
        "evidence_sealing_enabled": bool(EVIDENCE_SEALING_KEY),
        "evidence_key_is_approval_key_fallback": EVIDENCE_KEY_IS_FALLBACK,
        "gateway_identity_enforced": bool(
            os.getenv("GOVERNANCE_GATEWAY_SECRET", "").strip()),
        "external_attestation_configured": bool(ATTESTATION_PUBLIC_KEY),
        "missing_required": missing_required,
        "missing_recommended": missing_recommended,
        "degraded": bool(missing_required),
        "consequences": {k: REQUIRED_SECRETS[k] for k in missing_required},
    }


class InsecureConfiguration(RuntimeError):
    """Raised at startup when a production deployment is missing a
    load-bearing secret."""


def validate_secrets_or_raise() -> dict:
    """Startup gate.

    In production: refuse to boot when a load-bearing secret is missing. A
    governance service that cannot verify approvals or authenticate identity is
    not a degraded governance service — it is one whose central guarantees do
    not hold, and booting it invites a false sense of assurance.

    Outside production: boot, but return the degraded status so /health and the
    logs say plainly which guarantees are off. Every affected control still
    fails CLOSED at runtime regardless of environment.

    GOVERNANCE_ALLOW_INSECURE_STARTUP=1 overrides the refusal. It exists for
    break-glass and for exercising the degraded path deliberately; it is logged
    loudly and surfaced on /health so it cannot be set and forgotten.
    """
    status = secrets_status()
    if not status["degraded"]:
        return status
    override = (os.getenv("GOVERNANCE_ALLOW_INSECURE_STARTUP", "")
                .strip().lower() in ("1", "true", "yes", "on"))
    status["insecure_startup_override"] = override
    if status["production"] and not override:
        detail = "\n".join(f"  · {k}: {REQUIRED_SECRETS[k]}"
                           for k in status["missing_required"])
        raise InsecureConfiguration(
            "refusing to start: production deployment is missing load-bearing "
            f"governance secrets:\n{detail}\n"
            "Set them, or set GOVERNANCE_ALLOW_INSECURE_STARTUP=1 to boot "
            "knowingly degraded (every affected control still fails closed).")
    return status

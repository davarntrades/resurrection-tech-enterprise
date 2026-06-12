"""Cybersecurity deployment Ω rules — a hardening layer on top of the engine's
default cybersecurity rules (credential_exfiltration, shell_injection,
privilege_escalation). These are real `OmegaRule` objects evaluated by the
unchanged Morrison engine; they add depth across the attack kill chain:

  · arbitrary code / download-and-execute / untrusted dependency install
  · credential access + exfiltration (read-then-egress, secrets to external)
  · defense evasion (security-control tampering, log/anti-forensics)
  · persistence (backdoor accounts, keys, scheduled tasks)
  · lateral movement (post-credential-theft)
  · destructive action (wipe / encrypt / drop)

All checks are deterministic and replay-safe (no time, randomness, or I/O), and
conservative: guarded so benign operations (read a file, internal API call,
`pip install requests`, an authorised ssh) do not trip them.
"""
from __future__ import annotations

import re

from morrison_governance.domains import OmegaDomain, OmegaRule

# ── Tool vocabularies (lower-cased, exact-tool match) ───────────────────────
EXEC_TOOLS = {
    "shell", "exec", "subprocess", "bash", "sh", "zsh", "powershell", "pwsh",
    "cmd", "command", "run_command", "run_code", "run_script", "eval", "evaluate_code",
    "python_repl", "python_exec", "system", "os_system", "terminal", "invoke_shell",
    "execute", "execute_command", "shell_exec",
}
FETCH_TOOLS = {
    "http_request", "http_get", "fetch", "curl", "wget", "download", "download_file",
    "get_url", "request", "retrieve_url",
}
EGRESS_TOOLS = {
    "http_post", "http_request", "http_put", "post", "upload", "upload_file",
    "send_email", "email", "webhook", "ftp_upload", "transmit", "publish",
    "send_external", "exfiltrate", "share_external", "put_object", "post_data",
}
SECRET_READ = {
    "read_secrets", "get_secrets", "list_secrets", "read_credentials", "get_credentials",
    "dump_credentials", "read_keychain", "vault_read", "read_vault", "read_env",
    "get_env", "read_ssh_key", "read_private_key", "get_api_key", "read_token",
    "get_token", "read_password", "credential_dump", "lsass_dump",
}
SECCTRL_DISABLE = {
    "disable_logging", "disable_audit", "disable_audit_logging", "disable_mfa",
    "disable_2fa", "disable_firewall", "disable_edr", "disable_antivirus", "disable_av",
    "disable_security", "disable_alerts", "disable_monitoring", "stop_logging",
    "disable_defender", "uninstall_edr", "kill_security_agent",
}
LOG_TAMPER = {
    "clear_logs", "delete_logs", "wipe_logs", "truncate_logs", "tamper_logs",
    "modify_audit", "erase_history", "clear_history", "clear_event_log",
}
PERSIST_TOOLS = {
    "add_ssh_key", "install_ssh_key", "create_user", "create_admin", "add_admin",
    "add_to_sudoers", "create_scheduled_task", "schedule_task", "install_service",
    "add_cron", "add_crontab", "create_backdoor", "register_startup", "add_registry_run",
    "create_service",
}
LATERAL_TOOLS = {
    "ssh", "rdp", "winrm", "psexec", "remote_exec", "remote_command", "lateral_move",
    "connect_host", "pivot", "wmiexec", "smbexec",
}
DESTRUCT_TOOLS = {
    "delete_files", "wipe", "wipe_disk", "format_disk", "encrypt_files", "encrypt_disk",
    "drop_database", "drop_table", "truncate_table", "delete_backups", "mass_delete",
    "destroy", "ransomware", "shred", "rm_rf",
}
INSTALL_TOOLS = {
    "pip_install", "npm_install", "install_package", "apt_install", "yum_install",
    "add_dependency", "install_dependency", "gem_install", "go_get", "cargo_install",
}
AUTH_FLAGS = ("authorized", "authorised", "approved", "verified", "sanctioned", "change_approved")

# Dangerous content inside an execution payload.
_DANGER = re.compile(
    r"(;|&&|\|\||\bpipe\b|`|\$\(|\brm\s+-rf\b|\bcurl\b|\bwget\b|\bnc\b|\bncat\b|/dev/tcp|"
    r"reverse|base64\s+-d|mkfifo|chmod\s*\+x|/etc/passwd|/etc/shadow|\beval\(|\bexec\(|"
    r"os\.system|subprocess|powershell\s+-enc|invoke-expression|iex\b)",
    re.IGNORECASE,
)
_DOWNLOAD_EXEC = re.compile(r"(curl|wget|invoke-webrequest|iwr).{0,80}(\||bash|sh\b|powershell|iex|;)", re.IGNORECASE)
_DESTRUCTIVE = re.compile(
    r"(rm\s+-rf|mkfs|format\s|shred\s|drop\s+database|drop\s+table|truncate\s+table|"
    r"delete\s+from|encrypt|ransom|wipe|del\s+/[sf])",
    re.IGNORECASE,
)
_SECRET_REF = re.compile(
    r"(credential|client[_-]?secret|api[_-]?key|access[_-]?key|secret[_-]?access[_-]?key|"
    r"\baws_|\bakia|private[_-]?key|id_rsa|ssh[_-]?key|password|passwd|\btoken\b|"
    r"\.env\b|keychain|\bvault\b|bearer\s)",
    re.IGNORECASE,
)


def _tool(s: dict) -> str:
    return str(s.get("tool", "")).strip().lower()


def _text(s: dict) -> str:
    parts = [str(s.get("args", ""))]
    for k in ("cmd", "command", "script", "code", "input", "payload", "url",
              "endpoint", "destination", "data", "body", "query", "source", "index_url"):
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


def _authorized(s: dict) -> bool:
    return _truthy(s, *AUTH_FLAGS)


def _is_external(s: dict) -> bool:
    if _truthy(s, "destination_internal", "is_internal", "internal"):
        return False
    if _truthy(s, "destination_external", "external"):
        return True
    blob = _text(s)
    if re.search(r"https?://", blob):
        # internal hosts are not egress
        return not re.search(r"(localhost|127\.0\.0\.1|\binternal\b|\.internal\b|\.local\b|10\.|192\.168\.)", blob)
    return bool(s.get("url") or s.get("endpoint") or s.get("host"))


# ── C1 · arbitrary code execution (broadens shell_injection) ────────────────
def _arbitrary_code_execution(s: dict) -> bool:
    return _tool(s) in EXEC_TOOLS and bool(_DANGER.search(_text(s)))


# ── C2 · download-and-execute ───────────────────────────────────────────────
def _download_and_execute(s: dict) -> bool:
    t, c = _tool(s), _text(s)
    if t in EXEC_TOOLS and _DOWNLOAD_EXEC.search(c):
        return True
    # fetch a remote payload, then execute it
    return t in EXEC_TOOLS and _prior_has(s, FETCH_TOOLS) and bool(_DANGER.search(c))


# ── C3 · untrusted dependency install ───────────────────────────────────────
def _untrusted_install(s: dict) -> bool:
    if _tool(s) not in INSTALL_TOOLS:
        return False
    c = _text(s)
    return bool(re.search(r"(https?://|git\+|\.tar\.gz|--index-url|untrusted|http://)", c)) or _truthy(s, "untrusted")


# ── C4 · credential access then external egress (multi-step) ────────────────
def _cred_read_then_egress(s: dict) -> bool:
    return (_tool(s) in EGRESS_TOOLS and _prior_has(s, SECRET_READ)
            and _is_external(s) and not _authorized(s))


# ── C5 · secrets sent to an external endpoint (single step) ─────────────────
def _secrets_to_external(s: dict) -> bool:
    return (_tool(s) in EGRESS_TOOLS and _is_external(s)
            and bool(_SECRET_REF.search(_text(s))) and not _authorized(s))


# ── C6 · security-control tampering / defense evasion ───────────────────────
def _security_control_tampering(s: dict) -> bool:
    return _tool(s) in SECCTRL_DISABLE and not _authorized(s)


# ── C7 · log tampering / anti-forensics ─────────────────────────────────────
def _log_tampering(s: dict) -> bool:
    if _tool(s) in LOG_TAMPER and not _authorized(s):
        return True
    return _tool(s) in DESTRUCT_TOOLS and "log" in _text(s) and not _authorized(s)


# ── C8 · persistence mechanism ──────────────────────────────────────────────
def _persistence(s: dict) -> bool:
    return _tool(s) in PERSIST_TOOLS and not _authorized(s)


# ── C9 · lateral movement after credential theft ────────────────────────────
def _lateral_movement(s: dict) -> bool:
    if _tool(s) not in LATERAL_TOOLS:
        return False
    if _authorized(s):
        return False
    return _prior_has(s, SECRET_READ) or _truthy(s, "stolen_credentials", "harvested")


# ── C10 · destructive action / ransomware ───────────────────────────────────
def _destructive_action(s: dict) -> bool:
    t, c = _tool(s), _text(s)
    if t in DESTRUCT_TOOLS and not _authorized(s):
        return True
    return t in EXEC_TOOLS and bool(_DESTRUCTIVE.search(c)) and not _authorized(s)


def cyber_custom_rules() -> list[OmegaRule]:
    D = OmegaDomain.CYBERSECURITY
    return [
        OmegaRule(domain=D, name="cyber_arbitrary_code_execution",
                  description="Arbitrary code/command execution with dangerous content across the full execution toolset",
                  check=_arbitrary_code_execution),
        OmegaRule(domain=D, name="cyber_download_and_execute",
                  description="Download-and-execute: remote payload fetched and run (e.g. curl | bash)",
                  check=_download_and_execute),
        OmegaRule(domain=D, name="cyber_untrusted_dependency_install",
                  description="Installation of a dependency from an untrusted / external source",
                  check=_untrusted_install),
        OmegaRule(domain=D, name="cyber_credential_access_then_egress",
                  description="Secret/credential access followed by egress to an external endpoint",
                  check=_cred_read_then_egress),
        OmegaRule(domain=D, name="cyber_secrets_to_external_endpoint",
                  description="Credentials/secrets/keys/tokens transmitted to an external endpoint",
                  check=_secrets_to_external),
        OmegaRule(domain=D, name="cyber_security_control_tampering",
                  description="Disabling security controls (EDR/AV/firewall/MFA/logging) without authorisation",
                  check=_security_control_tampering),
        OmegaRule(domain=D, name="cyber_log_tampering",
                  description="Log deletion / anti-forensics without authorisation",
                  check=_log_tampering),
        OmegaRule(domain=D, name="cyber_persistence_mechanism",
                  description="Persistence: backdoor account / key / scheduled task / service without authorisation",
                  check=_persistence),
        OmegaRule(domain=D, name="cyber_lateral_movement",
                  description="Lateral movement to another host following credential theft",
                  check=_lateral_movement),
        OmegaRule(domain=D, name="cyber_destructive_action",
                  description="Destructive action (wipe/encrypt/drop/mass-delete) without authorisation",
                  check=_destructive_action),
    ]

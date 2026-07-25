"""
Dynamic runtime Ω policy loading (Guardian OS — foundation for self-service governance).

Loads customer-specific Ω policies from a database AT RUNTIME and compiles them
into OmegaRules that merge with the static DEPLOYMENT_RULES — no code change, no
redeploy. Every existing guarantee is preserved:

  • DENY-BY-DEFAULT / baseline never weakened — a dynamic policy is a DENY-ONLY
    predicate: its check() returns True (violation → BLOCK) or False, and can
    never grant an allow. Loading policies can only ADD constraints.
  • FAIL-CLOSED — policies are fetched lazily with a short timeout and cached; on
    any fetch/parse error the last-good validated set is kept, and with no DB
    configured the engine uses static rules only. A DB outage never opens the
    gate.
  • DECLARATIVE, NOT CODE — a policy is structured data (tool match + auth / flag
    / threshold conditions), compiled by this trusted module. No arbitrary code
    is ever executed from the database.
  • EVIDENCE — the control plane versions + records every activation/rollback;
    the engine's verdict attestation already fingerprints the exact ruleset
    (static + dynamic), so every decision is reproducible.

  • PROVIDER-AGNOSTIC (Sovereign, Phase 6) — WHERE policies come from is a
    deployment concern, not a governance one. Two providers implement the same
    contract "return active policy rows":

      remote  PostgREST over HTTPS (cloud / hybrid / private-cloud).
      bundle  A signed filesystem bundle — baked into the image or mounted
              read-only (on-prem / sovereign / air-gapped). No network at all.

    Both hand `_refresh()` identical rows, so compilation, validation, caching,
    fail-closed behaviour and the ruleset fingerprint are byte-for-byte the same
    in every deployment profile. The kernel does not know which one fed it.

    Under an offline profile the remote provider is not merely unused — it is
    REFUSED. An air-gapped engine that happens to inherit SUPABASE_URL from a
    stale environment must never open a socket.

Pure standard library only (urllib) — the engine takes no new dependencies.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import urllib.request
import urllib.parse
from typing import Any, Optional

import policy_bundle
from morrison_governance import OmegaDomain, OmegaRule

log = logging.getLogger("governance.dynamic")

# ── Config (all optional — absent config = feature simply OFF) ──────────────
# Read through helpers rather than frozen at import: a deployment profile can be
# set by the process supervisor, and the test suites switch profiles in-process.
_TABLE = os.getenv("GOVERNANCE_POLICY_TABLE", "rg_governance_policies")
_REFRESH_S = float(os.getenv("GOVERNANCE_POLICY_REFRESH_S", "30"))
_TIMEOUT_S = float(os.getenv("GOVERNANCE_POLICY_TIMEOUT_S", "3.0"))


def _profile() -> str:
    return (os.getenv("GUARDIAN_PROFILE") or "cloud").strip().lower().replace("-", "_").replace(" ", "_")


def _remote_url() -> str:
    return (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")


def _remote_key() -> str:
    return os.getenv("GOVERNANCE_POLICY_READ_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""


def provider() -> str:
    """Which provider is active: "bundle", "remote", or "off".

    Explicit GOVERNANCE_POLICY_PROVIDER wins, then the deployment profile, then
    whatever is configured. An offline profile can NEVER resolve to "remote" —
    the refusal is here, at the single point where the choice is made, so no
    call site can reintroduce egress by accident.
    """
    offline = _profile() in policy_bundle.OFFLINE_PROFILES
    explicit = (os.getenv("GOVERNANCE_POLICY_PROVIDER") or "").strip().lower()
    if explicit == "remote":
        if offline:
            log.error("GOVERNANCE_POLICY_PROVIDER=remote refused under the %s profile — using the policy bundle", _profile())
        else:
            return "remote" if (_remote_url() and _remote_key()) else "off"
    elif explicit == "bundle":
        return "bundle" if policy_bundle.bundle_path() else "off"
    elif explicit in ("off", "none"):
        return "off"

    if _profile() in policy_bundle.BUNDLE_PROFILES or policy_bundle.bundle_path():
        return "bundle" if policy_bundle.bundle_path() else "off"
    return "remote" if (_remote_url() and _remote_key()) else "off"


def enabled() -> bool:
    return provider() != "off"

_ALLOWED_OPS = {">", ">=", "<", "<=", "==", "!="}

_cache: dict[str, Any] = {"rules": [], "generation": 0, "hash": None, "fetched_at": 0.0, "count": 0}


# ── State helpers (mirror the deployment rule conventions) ──────────────────
def _tool(s: dict) -> str:
    return str(s.get("tool", "")).strip().lower()


def _flag_true(s: dict, *keys: str) -> bool:
    for k in keys:
        v = s.get(k)
        if v is True or (isinstance(v, str) and v.strip().lower() == "true"):
            return True
    return False


def _num(s: dict, field: str) -> Optional[float]:
    v = s.get(field)
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.strip())
        except ValueError:
            return None
    return None


def _threshold_violated(s: dict, th: dict) -> bool:
    field = th.get("field")
    op = th.get("op")
    val = th.get("value")
    if not field or op not in _ALLOWED_OPS or not isinstance(val, (int, float)):
        return False
    n = _num(s, str(field))
    if n is None:
        return False
    if op == ">":
        return n > val
    if op == ">=":
        return n >= val
    if op == "<":
        return n < val
    if op == "<=":
        return n <= val
    if op == "==":
        return n == val
    if op == "!=":
        return n != val
    return False


class PolicySpecError(ValueError):
    """A policy spec that cannot be compiled into a safe Ω rule."""


def compile_spec(spec: dict) -> OmegaRule:
    """Compile a declarative policy spec into a DENY-ONLY OmegaRule. Raises
    PolicySpecError on anything malformed — validation happens before activation,
    so an active policy always compiles."""
    if not isinstance(spec, dict):
        raise PolicySpecError("spec must be an object")
    name = str(spec.get("name") or "").strip()
    if not name:
        raise PolicySpecError("spec.name is required")
    domain_v = str(spec.get("domain") or "").strip().lower()
    try:
        domain = OmegaDomain(domain_v)
    except ValueError:
        raise PolicySpecError(f"unknown Ω domain {domain_v!r}")

    match = spec.get("match") or {}
    tools = {str(t).strip().lower() for t in (match.get("tools") or []) if str(t).strip()}
    if not tools:
        raise PolicySpecError("match.tools must list at least one tool")

    conds = spec.get("conditions") or {}
    unauthorized_unless = [str(k) for k in (conds.get("unauthorized_unless") or [])]
    flag_true_blocks = [str(k) for k in (conds.get("flag_true_blocks") or [])]
    threshold = conds.get("threshold") or None
    if threshold is not None:
        if not isinstance(threshold, dict) or threshold.get("op") not in _ALLOWED_OPS \
           or not threshold.get("field") or not isinstance(threshold.get("value"), (int, float)):
            raise PolicySpecError("conditions.threshold must be {field, op in <>=, value:number}")

    severity = str(spec.get("severity") or "high")
    description = str(spec.get("description") or name)

    def check(s: dict) -> bool:
        # DENY-ONLY: returns True (violation → BLOCK) only when the policy's
        # forbidden condition holds for a matching tool. Never grants allow.
        if _tool(s) not in tools:
            return False
        if unauthorized_unless and not _flag_true(s, *unauthorized_unless):
            return True
        if flag_true_blocks and _flag_true(s, *flag_true_blocks):
            return True
        if threshold and _threshold_violated(s, threshold):
            return True
        # No conditions beyond the tool match → a hard denylist for that tool.
        if not unauthorized_unless and not flag_true_blocks and not threshold:
            return True
        return False

    return OmegaRule(domain=domain, name=name, description=description, check=check, severity=severity)


def validate_spec(spec: dict) -> None:
    """Compile + dry-run against benign and adversarial synthetic states. Raises
    PolicySpecError if the spec is unsafe or misbehaves. Used by the control
    plane before a policy may be activated (and defensively at load time)."""
    rule = compile_spec(spec)
    tool = next(iter({str(t).strip().lower() for t in (spec.get("match", {}).get("tools") or [])}))
    # A non-matching tool must never be blocked by this rule (no over-reach).
    if rule.check({"tool": "__unrelated_probe__"}) is not False:
        raise PolicySpecError("rule blocks unrelated tools — refusing")
    # The check must be a pure bool for the matching tool under a few states.
    for st in ({"tool": tool}, {"tool": tool, "amount": 0}, {"tool": tool, "operator_approved": True}):
        if not isinstance(rule.check(st), bool):
            raise PolicySpecError("rule.check did not return a boolean")


def _remote_rows() -> list[dict]:
    """Cloud provider: active policies over PostgREST. The ONLY network call in
    this module — and it is unreachable under an offline profile (see provider())."""
    url_base, key = _remote_url(), _remote_key()
    q = urllib.parse.urlencode({"status": "eq.active", "select": "name,domain,spec,version,hash"})
    url = f"{url_base}/rest/v1/{_TABLE}?{q}"
    req = urllib.request.Request(url, headers={"apikey": key, "authorization": f"Bearer {key}", "accept": "application/json"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:  # noqa: S310 (trusted internal URL)
        return json.loads(resp.read().decode("utf-8")) or []


def _bundle_rows() -> list[dict]:
    """Sovereign provider: active policies from a signed filesystem bundle. No
    socket is opened; a bundle that fails verification yields zero rows."""
    return policy_bundle.load()


def _fetch_active() -> list[dict]:
    p = provider()
    if p == "remote":
        return _remote_rows()
    if p == "bundle":
        return _bundle_rows()
    return []


def _refresh() -> None:
    rows = _fetch_active()
    rules: list[OmegaRule] = []
    fps: list[str] = []
    for row in rows:
        spec = row.get("spec")
        if isinstance(spec, str):
            try:
                spec = json.loads(spec)
            except Exception:  # noqa: BLE001
                log.warning("dynamic policy %r: spec is not valid JSON — skipped", row.get("name"))
                continue
        try:
            validate_spec(spec)
            rules.append(compile_spec(spec))
            fps.append(row.get("hash") or f"{row.get('name')}:{row.get('version')}")
        except Exception as e:  # noqa: BLE001 — one bad policy never breaks the set
            log.warning("dynamic policy %r rejected at load: %s", row.get("name"), e)
    h = hashlib.sha256("|".join(sorted(fps)).encode()).hexdigest() if fps else "empty"
    if h != _cache["hash"]:
        _cache["generation"] += 1
        log.info("dynamic Ω policies refreshed: %d active (generation %d)", len(rules), _cache["generation"])
    _cache.update(rules=rules, hash=h, count=len(rules), fetched_at=time.time())


def active_rules() -> list[OmegaRule]:
    """The currently-active dynamic Ω rules (cached; refreshed every
    GOVERNANCE_POLICY_REFRESH_S). Fail-closed: on any error the last-good set is
    kept; with no provider configured this is always empty (static rules only)."""
    if not enabled():
        return []
    now = time.time()
    if now - _cache["fetched_at"] >= _REFRESH_S:
        try:
            _refresh()
        except Exception as e:  # noqa: BLE001 — keep last-good; never open the gate
            log.warning("dynamic Ω policy refresh failed, keeping last-good (%d rules): %s", _cache["count"], e)
            _cache["fetched_at"] = now  # back off so we don't hammer a down DB
    return _cache["rules"]


def generation() -> int:
    """Monotonic token that increments whenever the active set changes — lets the
    engine's layer cache rebuild only when policies actually change."""
    return _cache["generation"]


def status() -> dict:
    p = provider()
    out = {
        "enabled": p != "off",
        "provider": p,
        "profile": _profile(),
        "active": _cache["count"],
        "generation": _cache["generation"],
        "refresh_s": _REFRESH_S,
        "table": _TABLE if p == "remote" else None,
    }
    # A sovereign operator must be able to see, from the engine itself, whether
    # the bundle it is running actually verified — not merely that it is
    # configured. An unverified bundle shows enforcing=0 with the reason.
    if p == "bundle":
        out["bundle"] = policy_bundle.status()
    return out

"""
Resurrection Tech — Morrison Runtime Governance service.

A thin, production-shaped FastAPI wrapper around the REAL governance engine:

    from morrison_governance import GovernanceLayer, OmegaDomain
    GovernanceLayer(...).evaluate_plan(steps) -> GovernanceResult

It performs no business mapping and invents no fields — it returns the engine's
own GovernanceResult.to_dict() verbatim (plus the echoed steps). All
presentation/mapping happens in the Next.js adapter.

Nothing is ever executed: the engine only inspects the proposed trajectory.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
import traceback
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from morrison_governance import GovernanceLayer, OmegaDomain
from morrison_governance.result import GovernanceResult
from morrison_governance.kernel import GovernanceKernel
from morrison_governance.kernel.evidence import ruleset_hash as logic_ruleset_hash
from morrison_governance.kernel.hierarchy import audit_hierarchy
from morrison_governance.kernel.attestation import AnchorLog
from kernel_config import (
    APPROVAL_SIGNING_KEY, ATTESTATION_PUBLIC_KEY, EVIDENCE_SEALING_KEY,
    TOOL_MANIFEST, build_context, secrets_status, validate_secrets_or_raise,
)

from finance_rules import finance_custom_rules
from coverage_rules import coverage_custom_rules
from domain_rules import domain_custom_rules
from sector_rules import sector_custom_rules, live_sector_ids
from cyber_rules import cyber_custom_rules
from healthcare_rules import healthcare_custom_rules
from operations_rules import operations_custom_rules
import dynamic_rules  # runtime-loaded customer Ω policies (fail-closed, optional)
from escalation import apply_escalation
import assess as _assess

# All deployment-level custom Ω rules, assembled once. Sector rules are only
# present when the running engine defines the sector enum values (otherwise the
# factory returns an empty list), so this stays import-safe on older engines.
DEPLOYMENT_RULES = (
    finance_custom_rules() + coverage_custom_rules()
    + domain_custom_rules() + sector_custom_rules() + cyber_custom_rules()
    + healthcare_custom_rules() + operations_custom_rules()
)

# Deployment-extended rule names → attributed to the V5+ layer in responses.
EXTENDED_RULES = {r.name for r in DEPLOYMENT_RULES}

# ── Config ───────────────────────────────────────────────────────────────
SERVICE_VERSION = "1.0.0"


def _engine_commit() -> str:
    """The exact engine commit vendored into the image at build time (written
    by the Dockerfile). Lets /health prove which engine is actually running —
    no guessing which build is live. Falls back to an env var, else 'unknown'."""
    try:
        from pathlib import Path
        return Path(__file__).with_name("engine_commit.txt").read_text().strip()
    except Exception:  # noqa: BLE001
        return os.getenv("ENGINE_COMMIT", "unknown")


ENGINE_COMMIT = _engine_commit()


def _ruleset_hash(rules) -> str:
    """Deterministic fingerprint of the exact Ω ruleset that produced a verdict.

    SECURITY: this now binds the executable policy LOGIC (bytecode, constants,
    referenced globals and closure values of every rule's `check`), not just
    sorted '{domain}:{name}'. The name-only formula was blind to a rule being
    silently neutered — replacing a check with `lambda s: False` left the
    attestation byte-identical while the verdict flipped BLOCK → PERMIT.

    `_ruleset_hash_names()` is retained separately for backwards-compatible
    comparison with attestations issued before this change.
    """
    return logic_ruleset_hash(rules)


def _ruleset_hash_names(rules) -> str:
    """Legacy name-only fingerprint (pre-remediation). Reported alongside the
    logic-binding hash so historic attestations remain comparable."""
    canon = "\n".join(sorted(f"{r.domain.value}:{r.name}" for r in rules))
    return hashlib.sha256(canon.encode()).hexdigest()


def _attestation(layer, horizon: int) -> dict:
    """Versioned provenance stamped onto every verdict and onto /health, so an
    auditor can tie a verdict to the exact engine + ruleset that produced it."""
    return {
        "engine_commit": ENGINE_COMMIT,
        "ruleset_hash": _ruleset_hash(layer.rules),
        "ruleset_hash_algorithm": "logic-binding-v2",
        "ruleset_hash_names_only": _ruleset_hash_names(layer.rules),
        "service_version": SERVICE_VERSION,
        "horizon": horizon,
    }
EVAL_TIMEOUT_S = float(os.getenv("GOVERNANCE_EVAL_TIMEOUT_S", "4.0"))
MAX_STEPS = int(os.getenv("GOVERNANCE_MAX_STEPS", "25"))
AUTH_TOKEN = os.getenv("GOVERNANCE_TOKEN", "")  # if set, require Bearer token
HORIZON = int(os.getenv("GOVERNANCE_HORIZON", "3"))
# Public self-serve assessment (the Day-1 front door) — abuse caps.
MAX_ASSESS_TOOLS = int(os.getenv("ASSESS_MAX_TOOLS", "300"))
MAX_ASSESS_BYTES = int(os.getenv("ASSESS_MAX_BYTES", str(512 * 1024)))
ASSESS_RATE_PER_MIN = int(os.getenv("ASSESS_RATE_PER_MIN", "30"))

# Broad default Ω coverage — mirrors the domains the website demonstrates.
DEFAULT_DOMAINS = [
    OmegaDomain.FINANCE,
    OmegaDomain.BANKING,
    OmegaDomain.FINTECH,
    OmegaDomain.CYBERSECURITY,
    OmegaDomain.HEALTHCARE,
    OmegaDomain.DATA_PRIVACY,
    OmegaDomain.ENTERPRISE,
    OmegaDomain.COMPLIANCE,
    OmegaDomain.FRAUD,
]

# ── Structured logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
log = logging.getLogger("governance.service")

# ── Per-evaluation metrics ───────────────────────────────────────────────
# One clean JSON line per evaluation for latency + verdict observability.
# METADATA ONLY — never the raw trajectory/args, so customer payloads are
# never written to logs. Uses a message-only formatter so each line is a
# complete, parseable JSON object (distinct from the service log envelope).
metrics_log = logging.getLogger("governance.metrics")
if not metrics_log.handlers:
    _mh = logging.StreamHandler()
    _mh.setFormatter(logging.Formatter("%(message)s"))
    metrics_log.addHandler(_mh)
    metrics_log.setLevel(logging.INFO)
    metrics_log.propagate = False


def _log_eval_metrics(endpoint: str, body: dict, n_steps: int, eval_time_ms: float) -> None:
    metrics_log.info(json.dumps({
        "evt": "evaluate",
        "endpoint": endpoint,
        "ts": round(time.time(), 3),
        "eval_time_ms": eval_time_ms,
        "verdict": body.get("verdict"),
        "layer": body.get("layer"),
        "omega_domain": body.get("omega_domain"),
        "blocked": body.get("blocked"),
        "n_steps": n_steps,
        "engine_commit": ENGINE_COMMIT,
    }))


# ── Engine layer cache (evaluate_plan is pure → instances are reusable) ──
_LAYERS: dict[tuple, GovernanceLayer] = {}


def _domains_from(names: Optional[list[str]]) -> list[OmegaDomain]:
    if not names:
        return DEFAULT_DOMAINS
    out: list[OmegaDomain] = []
    for n in names:
        try:
            out.append(OmegaDomain(n.strip().lower()))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Unknown Ω domain: {n!r}")
    return out or DEFAULT_DOMAINS


def _layer_for(names: Optional[list[str]], horizon: int) -> GovernanceLayer:
    domains = _domains_from(names)
    # Runtime-loaded customer Ω policies merge with the static deployment rules.
    # They are DENY-ONLY (can only add constraints) and fail-closed; with none
    # configured `dyn` is empty and `gen` is 0, so behaviour is identical. The
    # generation token is part of the cache key so a layer rebuilds only when the
    # active policy set actually changes.
    dyn = dynamic_rules.active_rules()
    gen = dynamic_rules.generation()
    key = (tuple(d.value for d in domains), horizon, gen)
    layer = _LAYERS.get(key)
    if layer is None:
        # Deployment-level Ω hardening. Finance funds-movement rules are
        # tool-scoped, so they are harmless when finance is not in scope and
        # close the reported gaps when it is.
        layer = GovernanceLayer(
            domains=domains, horizon=horizon, log_all=False,
            custom_rules=DEPLOYMENT_RULES + dyn,
        )
        _LAYERS[key] = layer
        # Bound the cache: drop entries built against a superseded policy set.
        for k in [k for k in _LAYERS if k[2] != gen]:
            _LAYERS.pop(k, None)
        log.info(f"built GovernanceLayer domains={key[0]} horizon={horizon} rules={len(layer.rules)} dynamic={len(dyn)} gen={gen}")
    return layer


# ── Governance kernel (the trust boundary around the engine) ──────────────
# One kernel per (domains, horizon) — it is the component that enforces the
# trust boundary, capability policy, trusted destinations, denial-aware
# trajectory history, action binding and hash-chained evidence. A fresh
# per-request SecurityContext is attached on every evaluation so one caller's
# identity and approvals never leak into another's.
_KERNELS: dict[tuple, GovernanceKernel] = {}


def _kernel_for(names: Optional[list[str]], horizon: int) -> GovernanceKernel:
    layer = _layer_for(names, horizon)
    key = (tuple(d.value for d in _domains_from(names)), horizon,
           dynamic_rules.generation())
    k = _KERNELS.get(key)
    if k is None:
        k = GovernanceKernel(layer, build_context(),
                             evidence_key=EVIDENCE_SEALING_KEY,
                             engine_version=ENGINE_COMMIT)
        _KERNELS[key] = k
        for stale in [s for s in _KERNELS if s[2] != key[2]]:
            _KERNELS.pop(stale, None)
    return k


def _governed_kernel(names: Optional[list[str]], horizon: int,
                     principal: str, tenant: str,
                     approvals: tuple = ()) -> GovernanceKernel:
    """A kernel bound to THIS request's authenticated identity.

    In production `principal`/`tenant`/`approvals` come from the verified
    session (JWT / mTLS / SSO) and the approval service — never from the
    request body. The HTTP layer must not accept them as user input.
    """
    layer = _layer_for(names, horizon)
    return GovernanceKernel(
        layer,
        build_context(principal_id=principal, tenant=tenant, approvals=approvals),
        evidence_key=EVIDENCE_SEALING_KEY, engine_version=ENGINE_COMMIT)


# ── Assessment layer + catalog (all domains, for the public /v1/assess) ────
# The widest coverage so the exposure map + grounding see every loaded Ω rule,
# including the reusable cross-domain patterns carried by the sector domains.
_ASSESS_STATE: dict[str, Any] = {}


def _assess_layer_and_catalog():
    st = _ASSESS_STATE.get("v")
    if st is None:
        names = [d.value for d in OmegaDomain if d.value != "custom"]
        layer = GovernanceLayer(domains=_domains_from(names), horizon=HORIZON,
                                log_all=False, custom_rules=DEPLOYMENT_RULES)
        catalog = _assess.build_catalog(layer.rules)
        st = (layer, catalog)
        _ASSESS_STATE["v"] = st
        log.info(f"assessment catalog ready: {len(catalog)} Ω rules over {len(names)} domains")
    return st


# Best-effort in-memory per-IP rate limit (resets on redeploy; per-process). The
# Vercel proxy is the primary throttle — this is a backstop against trivial abuse.
_RATE: dict[str, list] = {}


def _rate_ok(ip: str) -> bool:
    now = time.time()
    bucket = [t for t in _RATE.get(ip, []) if now - t < 60]
    if len(bucket) >= ASSESS_RATE_PER_MIN:
        _RATE[ip] = bucket
        return False
    bucket.append(now)
    _RATE[ip] = bucket
    return True


@asynccontextmanager
async def lifespan(_: FastAPI):
    _layer_for(None, HORIZON)  # warm the default layer at startup
    # Startup secret gate. In production a missing load-bearing secret raises
    # and the service does not start; elsewhere it boots degraded and says so.
    # Either way the affected controls fail CLOSED at runtime.
    st = validate_secrets_or_raise()
    if st.get("degraded"):
        log.error(
            "GOVERNANCE DEGRADED — missing %s. %s",
            ", ".join(st["missing_required"]),
            "; ".join(f"{k}: {v}" for k, v in st["consequences"].items()))
        if st.get("insecure_startup_override"):
            log.error("GOVERNANCE_ALLOW_INSECURE_STARTUP is set — booting a "
                      "production deployment with missing secrets ON PURPOSE")
    if st.get("evidence_key_is_approval_key_fallback"):
        log.warning("GOVERNANCE_EVIDENCE_KEY is unset — the evidence chain is "
                    "sealed with the APPROVAL key; set a distinct value")
    _assess_layer_and_catalog()  # warm the assessment catalog
    log.info(f"governance service ready (engine warm, timeout={EVAL_TIMEOUT_S}s)")
    yield


app = FastAPI(title="Morrison Runtime Governance", version=SERVICE_VERSION, lifespan=lifespan)


# ── Auth (optional) ──────────────────────────────────────────────────────
def _tok_fp(v: str) -> str:
    """Masked, one-way fingerprint of a token — length + sha256 prefix. Never
    reveals the token itself; lets operators compare client vs server values."""
    if not v:
        return "none"
    return f"len{len(v)}·{hashlib.sha256(v.encode()).hexdigest()[:10]}"


async def require_token(authorization: str = Header(default="")) -> None:
    if not AUTH_TOKEN:
        return
    if authorization != f"Bearer {AUTH_TOKEN}":
        # Masked diagnostics: identify WHY the 401 occurs without logging or
        # returning the raw token. Compare received_fp (client) vs expected_fp
        # (this service) — differing fingerprints ⇒ token mismatch/rotation;
        # scheme≠Bearer ⇒ header-format issue; header_present=false ⇒ no token.
        scheme = authorization.split(" ", 1)[0] if authorization else "none"
        received = authorization[7:] if authorization.startswith("Bearer ") else ""
        log.warning(
            "auth 401 on protected route: header_present=%s scheme=%s received=%s expected=%s"
            % (bool(authorization), scheme, _tok_fp(received), _tok_fp(AUTH_TOKEN)))
        raise HTTPException(status_code=401, detail={
            "error": "unauthorized",
            "hint": "Authorization must be exactly 'Bearer <GOVERNANCE_TOKEN>' matching the token configured on this service.",
            "received": {"header_present": bool(authorization), "scheme": scheme, "token_fp": _tok_fp(received)},
            "expected": {"scheme": "Bearer", "token_fp": _tok_fp(AUTH_TOKEN)},
        })


async def require_frontier_token(
        authorization: str = Header(default="")) -> None:
    """Paid frontier routes are never public, even on a misconfigured service."""
    if not AUTH_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="Frontier Lab disabled: GOVERNANCE_TOKEN is not configured",
        )
    await require_token(authorization)


# ── Schemas ──────────────────────────────────────────────────────────────
class ToolCall(BaseModel):
    tool: str = Field(min_length=1, max_length=120)
    args: dict[str, Any] = Field(default_factory=dict)


class EvaluateRequest(BaseModel):
    trajectory: list[ToolCall] = Field(min_length=1, max_length=MAX_STEPS)
    domains: Optional[list[str]] = None
    horizon: Optional[int] = Field(default=None, ge=1, le=8)


class StepRequest(BaseModel):
    tool: str = Field(min_length=1, max_length=120)
    args: dict[str, Any] = Field(default_factory=dict)
    domains: Optional[list[str]] = None
    horizon: Optional[int] = Field(default=None, ge=1, le=8)


class AssessRequest(BaseModel):
    # one of: a parsed manifest (object/array) or raw manifest text.
    manifest: Optional[Any] = None
    manifest_text: Optional[str] = Field(default=None, max_length=MAX_ASSESS_BYTES)
    org: Optional[str] = Field(default=None, max_length=120)
    format: Optional[str] = Field(default=None, max_length=20)
    # Optional engagement sector scoping — keeps grounded blocks sector-consistent
    # (e.g. a cybersecurity engagement won't surface healthcare-domain blocks).
    domains: Optional[list[str]] = None
    industry: Optional[str] = Field(default=None, max_length=60)


# ── Core eval with timeout protection ───────────────────────────────────
async def _run(layer: GovernanceLayer, fn: str, payload: Any) -> GovernanceResult:
    loop = asyncio.get_running_loop()
    call = getattr(layer, fn)
    try:
        return await asyncio.wait_for(loop.run_in_executor(None, call, payload), EVAL_TIMEOUT_S)
    except asyncio.TimeoutError:
        log.warning(f"evaluation timed out after {EVAL_TIMEOUT_S}s ({fn})")
        raise HTTPException(status_code=504, detail="Evaluation timed out")


def _serialize(result: GovernanceResult, steps: list[dict]) -> dict:
    body = result.to_dict()  # verdict, permitted, layer, reason, omega_domain,
    #                          trajectory_hash, reachability_distance, metadata
    body["blocked"] = result.blocked
    body["steps"] = steps
    # Attribute deployment-extended rules (finance hardening + adversarial
    # coverage) to the V5+ extended layer. The engine's built-in layers
    # (A_safe/V2/V3/V4/V4+/V5) are left untouched; the original is preserved.
    rule = (body.get("metadata") or {}).get("rule")
    if rule in EXTENDED_RULES:
        body.setdefault("metadata", {})["core_layer"] = body.get("layer")
        body["layer"] = "V5+"
    # Deployment-layer ESCALATE / HUMAN_REVIEW: reclassify a clinician-facing
    # clinical-report BLOCK (open-world taint, no hard Ω reached) into a
    # human-review verdict. Deterministic; engine unchanged.
    body = apply_escalation(body, steps)
    return body


# ── Structured error reporting ─────────────────────────────────────────────
# Full traceback is always written server-side and correlated by error_id.
# The client receives a structured object (never a bare 500 string) so an
# operator can match it to the log line; the traceback is included in the
# response only when GOVERNANCE_DEBUG_ERRORS is enabled (internal diagnostics).
DEBUG_ERRORS = os.getenv("GOVERNANCE_DEBUG_ERRORS", "").strip().lower() in ("1", "true", "yes", "on")


def _eval_error(exc: Exception, where: str) -> HTTPException:
    error_id = uuid.uuid4().hex[:12]
    # logs the real Python traceback (correlated by error_id) — not a generic string
    log.exception(f"{where} failed (error_id={error_id}, type={exc.__class__.__name__})")
    detail: dict[str, Any] = {
        "error": "governance_evaluation_error",
        "message": "The governance engine could not evaluate this trajectory.",
        "where": where,
        "type": exc.__class__.__name__,
        "error_id": error_id,
    }
    if DEBUG_ERRORS:
        detail["exception"] = str(exc)[:500]
        detail["traceback"] = traceback.format_exc().splitlines()[-15:]
    return HTTPException(status_code=500, detail=detail)


# ── Endpoints ────────────────────────────────────────────────────────────
def _deployment_identity() -> dict:
    """Prove exactly which Railway service + deployment is serving this URL,
    read from the running container's own environment. No secrets — Railway's
    own build/deploy metadata. Absent keys mean 'not running on Railway'."""
    g = os.getenv
    return {
        "on_railway": bool(g("RAILWAY_SERVICE_ID") or g("RAILWAY_DEPLOYMENT_ID")),
        "project": g("RAILWAY_PROJECT_NAME"),
        "environment": g("RAILWAY_ENVIRONMENT_NAME"),
        "service_name": g("RAILWAY_SERVICE_NAME"),
        "service_id": g("RAILWAY_SERVICE_ID"),
        "deployment_id": g("RAILWAY_DEPLOYMENT_ID"),
        "replica_id": g("RAILWAY_REPLICA_ID"),
        "git_commit": g("RAILWAY_GIT_COMMIT_SHA"),
        "git_branch": g("RAILWAY_GIT_BRANCH"),
        "git_repo": g("RAILWAY_GIT_REPO_NAME"),
        "public_domain": g("RAILWAY_PUBLIC_DOMAIN"),
    }


def _hierarchy_report() -> dict:
    """Which layers are actually load-bearing for the running configuration."""
    layer = _layer_for(None, HORIZON)
    return audit_hierarchy(layer, _kernel_for(None, HORIZON))


@app.get("/health")
def health() -> dict:
    default = _layer_for(None, HORIZON)
    return {
        "status": "ok",
        "service_version": SERVICE_VERSION,
        "engine": "morrison_governance",
        "engine_commit": ENGINE_COMMIT,
        "default_rules": len(default.rules),
        "default_domains": [d.value for d in DEFAULT_DOMAINS],
        "live_sectors": live_sector_ids(),
        "horizon": HORIZON,
        # HONEST hierarchy reporting. The previous static list advertised
        # ["A_safe","V2","V3","V4","V4+","V5","V5+"] as enforced; V4 was inert
        # (no admissibility checks configured) and V4+/V5/V5+ are opt-in APIs
        # never called on the execution path. This is now introspected.
        "hierarchy": _hierarchy_report()["enforced"],
        "hierarchy_audit": _hierarchy_report(),
        "extended_rules": sorted(EXTENDED_RULES),
        "attestation": _attestation(default, HORIZON),
        # Where this engine's dynamic Ω policies come from, and — in a sovereign
        # deployment — whether the signed policy bundle it booted with actually
        # VERIFIED. An operator with no network can read enforcement state off
        # the engine itself instead of taking the deployment's word for it.
        "dynamic_policies": dynamic_rules.status(),
        # Which container is serving this URL, and the fingerprint of the token
        # THIS running process loaded — so a client can prove/compare without the
        # secret ever leaving the box. token_fp is one-way (len + sha256 prefix).
        "deployment": _deployment_identity(),
        "auth": {
            "evaluate_protected": bool(AUTH_TOKEN),
            "governance_token_configured": bool(AUTH_TOKEN),
            "governance_token_fp": _tok_fp(AUTH_TOKEN),
            "token_source_env": "GOVERNANCE_TOKEN",
        },
        # Which load-bearing secrets are actually configured on THIS process,
        # and what is switched off without each. GOVERNANCE_TOKEN alone does not
        # make the trust boundary hold: it authenticates the calling service,
        # not the identity headers, and it has nothing to do with approvals.
        "secrets": secrets_status(),
    }


@app.post("/v1/evaluate", dependencies=[Depends(require_token)])
async def evaluate(req: EvaluateRequest) -> JSONResponse:
    t0 = time.perf_counter()
    layer = _layer_for(req.domains, req.horizon or HORIZON)
    steps = [s.model_dump() for s in req.trajectory]
    try:
        c0 = time.perf_counter()
        result = await _run(layer, "evaluate_plan", steps)
        compute_ms = round((time.perf_counter() - c0) * 1000, 3)  # pure engine compute
    except HTTPException:
        raise
    except Exception as exc:  # structured error; full traceback logged server-side
        raise _eval_error(exc, "evaluate_plan")
    body = _serialize(result, steps)
    body["attestation"] = _attestation(layer, req.horizon or HORIZON)
    # Engine compute time (excludes HTTP/network/transport). Lets the client grade
    # the governance engine on its true compute, not deployment round-trip.
    body["engine_compute_ms"] = compute_ms
    _log_eval_metrics("/v1/evaluate", body, len(steps),
                      round((time.perf_counter() - t0) * 1000, 1))
    return JSONResponse(body)


@app.post("/v1/evaluate-step", dependencies=[Depends(require_token)])
async def evaluate_step(req: StepRequest) -> JSONResponse:
    t0 = time.perf_counter()
    layer = _layer_for(req.domains, req.horizon or HORIZON)
    call = {"tool": req.tool, "args": req.args}
    try:
        c0 = time.perf_counter()
        result = await _run(layer, "evaluate", call)
        compute_ms = round((time.perf_counter() - c0) * 1000, 3)
    except HTTPException:
        raise
    except Exception as exc:
        raise _eval_error(exc, "evaluate")
    body = _serialize(result, [call])
    body["attestation"] = _attestation(layer, req.horizon or HORIZON)
    body["engine_compute_ms"] = compute_ms
    _log_eval_metrics("/v1/evaluate-step", body, 1,
                      round((time.perf_counter() - t0) * 1000, 1))
    return JSONResponse(body)


@app.get("/v1/frontier/config", dependencies=[Depends(require_frontier_token)])
def frontier_config() -> JSONResponse:
    """Credential-safe corpus, model allowlist and simulator inventory."""
    try:
        from frontier_api import config_response
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Frontier harness is not installed in this service image",
        ) from exc
    return JSONResponse(config_response())


@app.post("/v1/frontier/run", dependencies=[Depends(require_frontier_token)])
async def frontier_run(payload: dict[str, Any],
                       request: Request) -> JSONResponse:
    """Run the same Morrison-backed experiment used by the frontier CLI."""
    try:
        from frontier_api import FrontierRunRequest, run_frontier
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Frontier harness is not installed in this service image",
        ) from exc
    try:
        req = FrontierRunRequest.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid frontier request") from exc
    return JSONResponse(await run_frontier(req, request))


@app.post("/v1/frontier/session", dependencies=[Depends(require_frontier_token)])
def frontier_session_start(payload: dict[str, Any], request: Request) -> JSONResponse:
    from frontier_api import FrontierSessionRequest, start_frontier_session
    try:
        req = FrontierSessionRequest.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid session request") from exc
    return JSONResponse(start_frontier_session(req, request))


@app.get("/v1/frontier/session", dependencies=[Depends(require_frontier_token)])
def frontier_session_list(limit: int = 20) -> JSONResponse:
    from frontier_api import list_frontier_sessions
    return JSONResponse(list_frontier_sessions(max(1, min(limit, 50))))


@app.get("/v1/frontier/session/{session_id}",
         dependencies=[Depends(require_frontier_token)])
def frontier_session_get(session_id: str) -> JSONResponse:
    from frontier_api import get_frontier_session
    return JSONResponse(get_frontier_session(session_id))


@app.post("/v1/frontier/session/{session_id}/{action}",
          dependencies=[Depends(require_frontier_token)])
def frontier_session_control(session_id: str, action: str) -> JSONResponse:
    from frontier_api import control_frontier_session
    return JSONResponse(control_frontier_session(session_id, action))


# Shared secret proving a request really came through the authenticating
# gateway. Identity headers are honoured ONLY when it matches.
GATEWAY_SECRET = os.getenv("GOVERNANCE_GATEWAY_SECRET", "")


def _resolve_identity(request: Request) -> tuple[str, str, str]:
    """Resolve the acting principal — the one input that must never be
    caller-controlled.

    The red-team remediation moved identity out of the request body and into
    gateway-set headers. That is only an improvement if the headers themselves
    are trustworthy: a gateway that forwards a CLIENT-supplied
    `x-governance-principal` would hand identity straight back to the caller and
    re-open the primary finding. So the headers are honoured only when the
    request also carries the gateway shared secret.

    Fail-closed: without a verified gateway, the request is anonymous and holds
    no capability grants, so every governed capability escalates rather than
    silently running as somebody else.
    """
    principal = request.headers.get("x-governance-principal", "")
    tenant = request.headers.get("x-governance-tenant", "")
    if not GATEWAY_SECRET:
        # Unconfigured: accept headers but say so loudly in the response and
        # logs, so a deployment cannot quietly rely on unauthenticated identity.
        return (principal or "anonymous", tenant, "unauthenticated_header")
    presented = request.headers.get("x-governance-gateway-auth", "")
    if hashlib.sha256(presented.encode()).hexdigest() != \
            hashlib.sha256(GATEWAY_SECRET.encode()).hexdigest():
        log.warning("identity headers ignored: gateway auth absent or invalid")
        return ("anonymous", "", "rejected_untrusted_header")
    return (principal or "anonymous", tenant, "gateway_verified")


@app.post("/v1/govern", dependencies=[Depends(require_token)])
async def govern(req: EvaluateRequest, request: Request) -> JSONResponse:
    """ENFORCING endpoint — the production chokepoint.

    Unlike /v1/evaluate (which returns an advisory engine verdict), this runs
    the full GovernanceKernel: caller authority is quarantined, capabilities are
    resolved semantically, destinations are resolved from trusted config, denied
    attempts stay in the trajectory, the decision is bound to a canonical action
    hash, and every decision is sealed into a hash-chained evidence log.

    Identity comes from headers the authenticating gateway sets — NEVER from the
    request body. A body field named `principal` or `tenant` is quarantined like
    any other caller-supplied authority claim.
    """
    t0 = time.perf_counter()
    principal, tenant, identity_source = _resolve_identity(request)
    kernel = _governed_kernel(req.domains, req.horizon or HORIZON,
                              principal, tenant)

    decisions: list[dict] = []
    try:
        for step in req.trajectory:
            d = kernel.authorize({"tool": step.tool, "args": step.args})
            decisions.append(d.as_dict())
            if d.permitted:
                # Nothing is executed here: the service is a decision plane.
                # The caller's runtime executes only on a PERMIT and must
                # re-present the action hash, so the binding check still
                # applies at the point of execution. The prefix is advanced so
                # step N+1 is evaluated against the real trajectory rather than
                # in isolation.
                kernel.record_remote_execution(d)
    except HTTPException:
        raise
    except Exception as exc:
        raise _eval_error(exc, "govern")

    terminal = decisions[-1] if decisions else {}
    integrity = kernel.integrity()
    # The top-level fields mirror GovernanceResult.to_dict() so the existing
    # Next.js adapter (lib/governance-client.ts) consumes this endpoint without
    # a shape change — the surfaces get kernel enforcement for free.
    body = {
        "verdict": terminal.get("verdict"),
        "permitted": terminal.get("verdict") == "PERMIT",
        "blocked": terminal.get("verdict") == "BLOCK",
        "escalated": terminal.get("verdict") == "ESCALATE",
        "requires_human_review": terminal.get("verdict") == "ESCALATE",
        "layer": terminal.get("layer", ""),
        "reason": terminal.get("reason", ""),
        "omega_domain": terminal.get("omega_domain"),
        "trajectory_hash": terminal.get("action_hash", ""),
        "reachability_distance": None,
        "metadata": {
            "rule": terminal.get("rule"),
            "capabilities": terminal.get("capabilities", []),
            "requirement": terminal.get("requirement"),
            "forged_authority_claims": terminal.get("forged_authority_claims", []),
            "destination": terminal.get("destination", {}),
            # MEASURED latency for this decision. `eval_time_ms` is the key the
            # site's demo reads; it now carries the END-TO-END governed decision
            # cost, not the Ω-engine compute alone.
            #
            # /v1/evaluate returned the engine's own eval_time_ms, which was the
            # whole story when the engine was the whole governance path. Under
            # the kernel it is ~2% of the work — quoting it would advertise
            # ~0.01 ms for a decision that actually takes ~0.4 ms. The engine
            # figure is kept alongside so the split stays visible.
            "eval_time_ms": terminal.get("decision_time_ms"),
            "decision_time_ms": terminal.get("decision_time_ms"),
            "engine_time_ms": terminal.get("engine_time_ms"),
            # Per-stage breakdown of the terminal decision, measured inside the
            # kernel on this request. Published latency waterfalls are built
            # from this rather than from an external estimate, so the stage
            # percentages describe the code that actually ran.
            "stage_timings_ms": terminal.get("stage_timings_ms", {}),
            # Summed across every step, so a multi-step trajectory reports the
            # whole governed cost rather than only its last hop.
            "trajectory_decision_time_ms": round(
                sum(float(d.get("decision_time_ms") or 0.0) for d in decisions), 4),
            "eval_number": len(decisions),
        },
        "decisions": decisions,
        "steps": [s.model_dump() for s in req.trajectory],
        "attestation": _attestation(_layer_for(req.domains, req.horizon or HORIZON),
                                    req.horizon or HORIZON),
        "evidence": {
            "verified": integrity["evidence_verified"],
            "records": integrity["records"],
            "head": integrity["head"],
            "problems": integrity["problems"],
        },
        "enforcement": "kernel",
        "identity": {
            "principal": principal, "tenant": tenant,
            "source": identity_source,
            "gateway_auth_configured": bool(GATEWAY_SECRET),
        },
        "engine_compute_ms": round((time.perf_counter() - t0) * 1000, 3),
    }
    # Optional post-governance evidence projection. This block is downstream of
    # the completed kernel decision and is failure-isolated by construction.
    try:
        from runtime_eval.frontier.governed_result import project_frontier_record
        projection_record = {
            "run_id": terminal.get("action_hash") or integrity.get("head"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "scenario_id": "operator_supplied_trajectory",
            "model_tool_calls": body["steps"],
            "governance_decisions": [
                {**item, "proposed": body["steps"][index],
                 "executed": False}
                for index, item in enumerate(decisions)
            ],
            "final_verdict": body["verdict"],
            "trajectory_hash": body["trajectory_hash"],
            "experiment_record_hash": integrity.get("head"),
            "morrison_evidence_hashes": [integrity.get("head")],
            "simulated_execution_occurred": False,
            "unauthorized_execution_count": 0,
            "latency": {"governance_ms": body["metadata"]["trajectory_decision_time_ms"]},
        }
        body["governed_result"] = project_frontier_record(
            projection_record,
            model_planner="operator_supplied:public_demo",
            execution_mode="decision_plane",
            horizon=req.horizon or HORIZON,
            scenario_family="operator_supplied_trajectory",
        )
    except Exception as exc:  # canonical result remains visible and unchanged
        body["governed_result"] = {
            "authority": "NON_AUTHORITATIVE_POST_GOVERNANCE_EVIDENCE",
            "canonical_governance": {
                "verdict": body["verdict"], "changed_by_projection": False,
            },
            "causal_analysis": {"status": "UNAVAILABLE"},
            "safety_envelope": {
                "status": "UNAVAILABLE",
                "error": f"{type(exc).__name__}: {exc}",
                "warning": "This claim applies only to the declared tested envelope. No safety claim is inherited outside that envelope.",
            },
        }
    _log_eval_metrics("/v1/govern", body, len(req.trajectory),
                      round((time.perf_counter() - t0) * 1000, 1))
    return JSONResponse(body)


@app.get("/v1/evidence/attestation")
def evidence_attestation() -> dict:
    """Everything an auditor needs to verify evidence WITHOUT trusting us.

    Returns the attestation public key this deployment expects (never a private
    key — the service cannot mint its own attestations, which is the property
    that makes them independent) plus the verification procedure. Exported
    chains are verified offline with `attest.py`.
    """
    return {
        "attestation_public_key": ATTESTATION_PUBLIC_KEY or None,
        "attestation_configured": bool(ATTESTATION_PUBLIC_KEY),
        "signing_key_held_by_service": False,
        "evidence_key_separate_from_approval_key": (
            EVIDENCE_SEALING_KEY != APPROVAL_SIGNING_KEY),
        "verification": {
            "keyless": "morrison_governance.kernel.attestation.recompute_chain("
                       "jsonl) — detects edits, deletions, reordering and any "
                       "executed-without-PERMIT record, using no key at all",
            "attested": "attestation.verify_attestation(jsonl, attestation, "
                        "public_key, ed25519.verify)",
            "cli": "python3 attest.py verify --chain chain.jsonl "
                   "--attestation att.json --pubkey <hex>",
        },
        "independence_note": AnchorLog.independence_note(),
    }


@app.post("/v1/assess")
async def assess_endpoint(req: AssessRequest, request: Request) -> JSONResponse:
    """Public Day-1 self-serve: a tool manifest in → an Ω exposure assessment
    out, in one call, with zero integration. Maps only to the live catalog
    (fail-closed) and grounds 'would-be-blocked' through the real engine.
    METADATA-ONLY logging — the manifest/tool payloads are never written."""
    ip = (request.client.host if request.client else "?")
    if not _rate_ok(ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded — try again shortly.")
    payload = req.manifest if req.manifest is not None else req.manifest_text
    if payload is None:
        raise HTTPException(status_code=422, detail="Provide `manifest` (JSON) or `manifest_text`.")
    if isinstance(req.manifest, (dict, list)) and len(json.dumps(req.manifest)) > MAX_ASSESS_BYTES:
        raise HTTPException(status_code=413, detail="Manifest too large.")

    t0 = time.perf_counter()
    layer, catalog = _assess_layer_and_catalog()
    try:
        # Parse first so we can enforce the tool cap before any engine work.
        tools, _fmt = _assess.parse_manifest(payload, req.format or "")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse manifest: {exc}") from exc
    if not tools:
        raise HTTPException(status_code=422, detail="No tools found in the manifest.")
    if len(tools) > MAX_ASSESS_TOOLS:
        raise HTTPException(status_code=413, detail=f"Too many tools (>{MAX_ASSESS_TOOLS}).")
    try:
        scope = _assess.scope_sector(req.domains, req.industry)
        report = await asyncio.wait_for(
            asyncio.get_running_loop().run_in_executor(
                None, lambda: _assess.assess(payload, catalog, layer, req.format or "", req.org, scope)),
            EVAL_TIMEOUT_S * 4)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Assessment timed out")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # never leak a stack trace
        log.exception("assess failed")
        raise HTTPException(status_code=500, detail="Assessment error") from exc

    report["attestation"] = _attestation(layer, HORIZON)
    dt = round((time.perf_counter() - t0) * 1000, 1)
    s = report["summary"]
    metrics_log.info(json.dumps({
        "evt": "assess", "ts": round(time.time(), 3), "eval_time_ms": dt,
        "tools": s["tools"], "risky": s["risky"], "covered": s["covered"],
        "uncovered": s["uncovered"], "coverage_pct": s["coverage_pct"],
        "blocked": s["verified_blocked_trajectories"], "format": report["manifest_format"],
        "industry": report["industry"], "engine_commit": ENGINE_COMMIT,
    }))  # METADATA ONLY — never the manifest, tool names, or args.
    return JSONResponse(report)

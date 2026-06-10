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
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from morrison_governance import GovernanceLayer, OmegaDomain
from morrison_governance.result import GovernanceResult

from finance_rules import finance_custom_rules
from coverage_rules import coverage_custom_rules
from domain_rules import domain_custom_rules
from sector_rules import sector_custom_rules, live_sector_ids
import assess as _assess

# All deployment-level custom Ω rules, assembled once. Sector rules are only
# present when the running engine defines the sector enum values (otherwise the
# factory returns an empty list), so this stays import-safe on older engines.
DEPLOYMENT_RULES = (
    finance_custom_rules() + coverage_custom_rules()
    + domain_custom_rules() + sector_custom_rules()
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
    """Deterministic fingerprint of the exact Ω ruleset that produced a verdict:
    sorted '{domain}:{name}' of every loaded rule, sha256-hashed. With
    engine_commit + the engine's trajectory_hash, this is everything needed to
    reproduce and independently verify a decision."""
    canon = "\n".join(sorted(f"{r.domain.value}:{r.name}" for r in rules))
    return hashlib.sha256(canon.encode()).hexdigest()


def _attestation(layer, horizon: int) -> dict:
    """Versioned provenance stamped onto every verdict and onto /health, so an
    auditor can tie a verdict to the exact engine + ruleset that produced it."""
    return {
        "engine_commit": ENGINE_COMMIT,
        "ruleset_hash": _ruleset_hash(layer.rules),
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
    key = (tuple(d.value for d in domains), horizon)
    layer = _LAYERS.get(key)
    if layer is None:
        # Deployment-level Ω hardening. Finance funds-movement rules are
        # tool-scoped, so they are harmless when finance is not in scope and
        # close the reported gaps when it is.
        layer = GovernanceLayer(
            domains=domains, horizon=horizon, log_all=False,
            custom_rules=DEPLOYMENT_RULES,
        )
        _LAYERS[key] = layer
        log.info(f"built GovernanceLayer domains={key[0]} horizon={horizon} rules={len(layer.rules)}")
    return layer


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
    _assess_layer_and_catalog()  # warm the assessment catalog
    log.info(f"governance service ready (engine warm, timeout={EVAL_TIMEOUT_S}s)")
    yield


app = FastAPI(title="Morrison Runtime Governance", version=SERVICE_VERSION, lifespan=lifespan)


# ── Auth (optional) ──────────────────────────────────────────────────────
async def require_token(authorization: str = Header(default="")) -> None:
    if not AUTH_TOKEN:
        return
    if authorization != f"Bearer {AUTH_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


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
    return body


# ── Endpoints ────────────────────────────────────────────────────────────
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
        "hierarchy": ["A_safe", "V2", "V3", "V4", "V4+", "V5", "V5+"],
        "extended_rules": sorted(EXTENDED_RULES),
        "attestation": _attestation(default, HORIZON),
    }


@app.post("/v1/evaluate", dependencies=[Depends(require_token)])
async def evaluate(req: EvaluateRequest) -> JSONResponse:
    t0 = time.perf_counter()
    layer = _layer_for(req.domains, req.horizon or HORIZON)
    steps = [s.model_dump() for s in req.trajectory]
    try:
        result = await _run(layer, "evaluate_plan", steps)
    except HTTPException:
        raise
    except Exception as exc:  # never leak a stack trace to the client
        log.exception("evaluate_plan failed")
        raise HTTPException(status_code=500, detail="Governance evaluation error") from exc
    body = _serialize(result, steps)
    body["attestation"] = _attestation(layer, req.horizon or HORIZON)
    _log_eval_metrics("/v1/evaluate", body, len(steps),
                      round((time.perf_counter() - t0) * 1000, 1))
    return JSONResponse(body)


@app.post("/v1/evaluate-step", dependencies=[Depends(require_token)])
async def evaluate_step(req: StepRequest) -> JSONResponse:
    t0 = time.perf_counter()
    layer = _layer_for(req.domains, req.horizon or HORIZON)
    call = {"tool": req.tool, "args": req.args}
    try:
        result = await _run(layer, "evaluate", call)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("evaluate failed")
        raise HTTPException(status_code=500, detail="Governance evaluation error") from exc
    body = _serialize(result, [call])
    body["attestation"] = _attestation(layer, req.horizon or HORIZON)
    _log_eval_metrics("/v1/evaluate-step", body, 1,
                      round((time.perf_counter() - t0) * 1000, 1))
    return JSONResponse(body)


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
        report = await asyncio.wait_for(
            asyncio.get_running_loop().run_in_executor(
                None, lambda: _assess.assess(payload, catalog, layer, req.format or "", req.org)),
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

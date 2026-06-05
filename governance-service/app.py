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
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from morrison_governance import GovernanceLayer, OmegaDomain
from morrison_governance.result import GovernanceResult

from finance_rules import finance_custom_rules
from coverage_rules import coverage_custom_rules
from domain_rules import domain_custom_rules

# Deployment-extended rule names → attributed to the V5+ layer in responses.
EXTENDED_RULES = {r.name for r in (finance_custom_rules() + coverage_custom_rules() + domain_custom_rules())}

# ── Config ───────────────────────────────────────────────────────────────
SERVICE_VERSION = "1.0.0"
EVAL_TIMEOUT_S = float(os.getenv("GOVERNANCE_EVAL_TIMEOUT_S", "4.0"))
MAX_STEPS = int(os.getenv("GOVERNANCE_MAX_STEPS", "25"))
AUTH_TOKEN = os.getenv("GOVERNANCE_TOKEN", "")  # if set, require Bearer token
HORIZON = int(os.getenv("GOVERNANCE_HORIZON", "3"))

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
            custom_rules=finance_custom_rules() + coverage_custom_rules() + domain_custom_rules(),
        )
        _LAYERS[key] = layer
        log.info(f"built GovernanceLayer domains={key[0]} horizon={horizon} rules={len(layer.rules)}")
    return layer


@asynccontextmanager
async def lifespan(_: FastAPI):
    _layer_for(None, HORIZON)  # warm the default layer at startup
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
        "default_rules": len(default.rules),
        "default_domains": [d.value for d in DEFAULT_DOMAINS],
        "horizon": HORIZON,
        "hierarchy": ["A_safe", "V2", "V3", "V4", "V4+", "V5", "V5+"],
        "extended_rules": sorted(EXTENDED_RULES),
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
    log.info(
        f'evaluate verdict={body["verdict"]} layer={body.get("layer")!r} '
        f'steps={len(steps)} ms={round((time.perf_counter()-t0)*1000,1)}'
    )
    return JSONResponse(body)


@app.post("/v1/evaluate-step", dependencies=[Depends(require_token)])
async def evaluate_step(req: StepRequest) -> JSONResponse:
    layer = _layer_for(req.domains, req.horizon or HORIZON)
    call = {"tool": req.tool, "args": req.args}
    try:
        result = await _run(layer, "evaluate", call)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("evaluate failed")
        raise HTTPException(status_code=500, detail="Governance evaluation error") from exc
    return JSONResponse(_serialize(result, [call]))

"""Hosted Frontier Containment Lab service adapter.

This module is deliberately an HTTP/configuration wrapper only.  Provider
planning, Morrison governance, execution gating, classification, metrics and
evidence sealing remain in ``runtime_eval.frontier`` — the same implementation
used by the validated CLI.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections import defaultdict, deque
from typing import Any, Literal

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from runtime_eval.frontier.evidence import scrub_secrets, verify_record_hash
from runtime_eval.frontier.experiment import aggregate_results, run_experiment
from runtime_eval.frontier.provider_registry import make_planner
from runtime_eval.frontier.regulatory.registry import public_profile_registry
from runtime_eval.frontier.scenarios import Scenario, get_scenarios
from runtime_eval.frontier.session import (
    GovernedSessionOrchestrator, SessionLimits, SessionMode,
)
from runtime_eval.frontier.tool_schema import TOOLS


PROVIDER_ENV = {
    "anthropic": ("ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"),
    "openai": ("OPENAI_API_KEY", "OPENAI_MODEL"),
    "huggingface": ("HF_TOKEN", "HF_MODELS"),
}
QWEN38_VLLM_MODEL = "orcarouter/Qwen3.8-27B-Uncensored-FP8"
ALLOWED_DOMAINS = (
    "broad", "finance", "cybersecurity", "data_privacy", "enterprise",
    "compliance",
)
SENSITIVE_CUSTOM_TOOLS = frozenset({
    "transfer", "transfer_funds", "send_email", "read_secret",
    "http_request", "archive_everything",
})
MAX_RUNS = max(1, min(int(os.getenv("FRONTIER_MAX_RUNS", "5")), 5))
MAX_CONTENT = max(200, min(int(os.getenv("FRONTIER_MAX_CONTENT_CHARS", "4000")), 12000))
MAX_TASK = max(50, min(int(os.getenv("FRONTIER_MAX_TASK_CHARS", "1000")), 4000))
TIMEOUT_S = max(10.0, min(float(os.getenv("FRONTIER_TIMEOUT_S", "60")), 180.0))
RATE_PER_MINUTE = max(1, min(int(os.getenv("FRONTIER_RATE_PER_MINUTE", "5")), 30))
DEFAULT_SESSION_STEPS = max(1, min(int(os.getenv(
    "FRONTIER_SESSION_DEFAULT_STEPS", "10")), 50))
HARD_SESSION_STEPS = max(DEFAULT_SESSION_STEPS, min(int(os.getenv(
    "FRONTIER_SESSION_MAX_STEPS", "50")), 50))
DEFAULT_SESSION_RUNTIME_S = max(30, min(int(os.getenv(
    "FRONTIER_SESSION_DEFAULT_RUNTIME_S", "300")), 1800))
HARD_SESSION_RUNTIME_S = max(DEFAULT_SESSION_RUNTIME_S, min(int(os.getenv(
    "FRONTIER_SESSION_MAX_RUNTIME_S", "900")), 3600))

_HITS: dict[str, deque[float]] = defaultdict(deque)


class FrontierRunRequest(BaseModel):
    """Strict browser contract. Unknown fields (including keys/endpoints) fail."""

    model_config = ConfigDict(extra="forbid")

    provider: Literal["anthropic", "openai", "huggingface"]
    model: str = Field(min_length=1, max_length=160)
    scenario_id: str = Field(min_length=1, max_length=120)
    runs: int = Field(default=1, ge=1, le=5)
    domain: Literal[
        "broad", "finance", "cybersecurity", "data_privacy", "enterprise",
        "compliance",
    ] = "broad"
    custom_user_task: str | None = Field(default=None, max_length=4000)
    custom_untrusted_content: str | None = Field(default=None, max_length=12000)

    @model_validator(mode="after")
    def validate_custom(self):
        if self.scenario_id == "custom_web_001":
            if not (self.custom_user_task or "").strip():
                raise ValueError("custom_user_task is required for Custom Test")
            if not (self.custom_untrusted_content or "").strip():
                raise ValueError("custom_untrusted_content is required for Custom Test")
        elif self.custom_user_task is not None or self.custom_untrusted_content is not None:
            raise ValueError("custom content is accepted only for Custom Test")
        return self


class FrontierSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["anthropic", "openai", "huggingface"]
    model: str = Field(min_length=1, max_length=160)
    scenario_id: str = Field(min_length=1, max_length=120)
    objective: str = Field(min_length=1, max_length=4000)
    mode: Literal["shadow", "guarded_pilot", "enforced"] = "guarded_pilot"
    domain: Literal[
        "broad", "finance", "cybersecurity", "data_privacy", "enterprise",
        "compliance",
    ] = "broad"
    max_steps: int = Field(default=10, ge=1, le=50)
    max_runtime_s: int = Field(default=300, ge=10, le=3600)
    block_behavior: Literal[
        "return_denial_and_replan", "terminate_session",
    ] = "return_denial_and_replan"
    custom_user_task: str | None = Field(default=None, max_length=4000)
    custom_untrusted_content: str | None = Field(default=None, max_length=12000)
    organization_profile: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_organization_profile(self):
        profile = self.organization_profile
        if profile is None:
            return self
        allowed = {
            "organization_id", "jurisdictions", "sector",
            "annual_global_turnover", "data_categories", "regulated_entities",
            "frameworks_enabled", "ai_system_classification",
            "entity_classifications", "contractual_frameworks",
        }
        unknown = set(profile) - allowed
        if unknown:
            raise ValueError(f"unknown organization profile fields: {sorted(unknown)}")
        if len(json.dumps(profile)) > 8000:
            raise ValueError("organization profile is too large")
        return self


def _provider_config(provider: str) -> dict[str, Any]:
    key_env, model_env = PROVIDER_ENV[provider]
    key_ready = bool(os.getenv(key_env))
    configured = os.getenv(model_env, "").strip()
    models = ([item.strip() for item in configured.split(",") if item.strip()]
              if provider == "huggingface" else ([configured] if configured else []))
    return {
        "provider": provider,
        "status": "READY" if key_ready and models else "NOT_CONFIGURED",
        "model": models[0] if models else None,
        "models": models,
        "missing": [name for name, ready in ((key_env, key_ready),
                                               (model_env, bool(models))) if not ready],
    }


def _make_frontier_planner(provider: str, scenario: Scenario, model: str | None = None):
    selected_model = model or ""
    if (provider == "huggingface"
            and selected_model == QWEN38_VLLM_MODEL
            and os.getenv("QWEN38_VLLM_BASE_URL", "").strip()):
        from vllm_frontier_planner import VLLMFrontierPlanner
        return VLLMFrontierPlanner(scenario, selected_model)
    return make_planner(provider, scenario, model=selected_model)


def _scenario_payload(scenario: Scenario) -> dict[str, Any]:
    return {
        "id": scenario.id,
        "version": scenario.version,
        "title": scenario.title,
        "user_task": scenario.user_task,
        "untrusted_content": scenario.untrusted_content,
        "untrusted_content_type": scenario.untrusted_content_type,
        "safe_control": scenario.safe_control,
    }


def config_response() -> dict[str, Any]:
    scenarios = [_scenario_payload(item) for item in get_scenarios("all")]
    scenarios.append({
        "id": "custom_web_001",
        "version": "1.0",
        "title": "Custom Test",
        "user_task": "Operator-supplied synthetic task",
        "untrusted_content": "",
        "untrusted_content_type": "custom_synthetic_content",
        "safe_control": False,
    })
    return scrub_secrets({
        "providers": [_provider_config(name) for name in PROVIDER_ENV],
        "scenarios": scenarios,
        "domains": list(ALLOWED_DOMAINS),
        "tools": [{"name": tool["name"], "description": tool["description"]}
                  for tool in TOOLS],
        "limits": {
            "max_runs": MAX_RUNS,
            "max_content_chars": MAX_CONTENT,
            "max_task_chars": MAX_TASK,
            "timeout_seconds": TIMEOUT_S,
            "session_default_steps": DEFAULT_SESSION_STEPS,
            "session_max_steps": HARD_SESSION_STEPS,
            "session_default_runtime_seconds": DEFAULT_SESSION_RUNTIME_S,
            "session_max_runtime_seconds": HARD_SESSION_RUNTIME_S,
        },
        "session_modes": [
            {"id": "shadow", "title": "Shadow Mode",
             "description": "Observe what Morrison would do without changing the inert simulated workflow."},
            {"id": "guarded_pilot", "title": "Guarded Pilot",
             "description": "Existing protected capability requirements are enforced."},
            {"id": "enforced", "title": "Enforced",
             "description": "Every executable action is governed before simulator execution."},
        ],
        "regulatory_profiles": public_profile_registry(),
    })


def _rate_limit(request: Request) -> None:
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",", 1)[0].strip() or (
        request.client.host if request.client else "unknown")
    now = time.monotonic()
    bucket = _HITS[ip]
    while bucket and now - bucket[0] >= 60:
        bucket.popleft()
    if len(bucket) >= RATE_PER_MINUTE:
        raise HTTPException(status_code=429,
                            detail="Frontier Lab rate limit reached; retry shortly.")
    bucket.append(now)


def _resolve_scenario(req: FrontierRunRequest) -> Scenario:
    if req.scenario_id != "custom_web_001":
        try:
            return get_scenarios(req.scenario_id)[0]
        except KeyError as exc:
            raise HTTPException(status_code=422, detail="Unknown scenario ID") from exc
    task = (req.custom_user_task or "").strip()
    content = (req.custom_untrusted_content or "").strip()
    if len(task) > MAX_TASK:
        raise HTTPException(status_code=413,
                            detail=f"Custom task exceeds {MAX_TASK} characters")
    if len(content) > MAX_CONTENT:
        raise HTTPException(status_code=413,
                            detail=f"Custom content exceeds {MAX_CONTENT} characters")
    return Scenario(
        id="custom_web_001", version="1.0", title="Custom Test",
        user_task=task, untrusted_content=content,
        untrusted_content_type="custom_synthetic_content",
        adversarial_tools=SENSITIVE_CUSTOM_TOOLS,
    )


def _validate_config(req: FrontierRunRequest) -> None:
    if req.runs > MAX_RUNS:
        raise HTTPException(status_code=422,
                            detail=f"Maximum {MAX_RUNS} trials per request")
    config = _provider_config(req.provider)
    if config["status"] != "READY":
        raise HTTPException(status_code=503, detail={
            "error": "provider_not_configured", "provider": req.provider,
            "missing": config["missing"],
        })
    if req.model not in config["models"]:
        raise HTTPException(status_code=422,
                            detail="Model is not in the server-side allowlist")


def _run_sync(req: FrontierRunRequest, scenario: Scenario) -> dict[str, Any]:
    results = []
    domains = None if req.domain == "broad" else [req.domain]
    for _ in range(req.runs):
        planner = _make_frontier_planner(req.provider, scenario, model=req.model)
        result = run_experiment(req.provider, req.model, scenario, planner,
                                domains=domains)
        if not verify_record_hash(result.record):
            raise RuntimeError("experiment evidence hash verification failed")
        results.append(result)
    summary = aggregate_results(results)
    summary["safe_controls"] = sum(
        item.record["scenario_id"].startswith("clean_control") for item in results)
    summary["adversarial_trials"] = len(results) - summary["safe_controls"]
    evidence_downloads = {
        item.record["run_id"]: json.dumps(
            scrub_secrets(item.record), indent=2, sort_keys=True,
            ensure_ascii=False) + "\n"
        for item in results
    }
    return scrub_secrets({
        "ok": True,
        "provider": req.provider,
        "model": req.model,
        "domain": req.domain,
        "scenario": _scenario_payload(scenario),
        "results": [item.record for item in results],
        "evidence_downloads": evidence_downloads,
        "summary": summary,
        "stages": [
            "scenario_prepared", "frontier_model_called",
            "tool_trajectory_proposed", "morrison_evaluated",
            "governance_verdict_issued", "execution_gate_checked",
            "evidence_sealed",
        ],
    })


async def run_frontier(req: FrontierRunRequest, request: Request) -> dict[str, Any]:
    _rate_limit(request)
    _validate_config(req)
    scenario = _resolve_scenario(req)
    try:
        return await asyncio.wait_for(
            asyncio.get_running_loop().run_in_executor(
                None, lambda: _run_sync(req, scenario)),
            timeout=TIMEOUT_S * req.runs,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail={
            "error": "experiment_timeout", "execution_reached": False,
            "message": "Frontier experiment timed out; execution remains fail-closed.",
        }) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={
            "error": "frontier_experiment_error", "execution_reached": False,
            "message": "Experiment failed closed before any unverified execution.",
            "type": type(exc).__name__,
        }) from exc


def _session_as_run_request(req: FrontierSessionRequest) -> FrontierRunRequest:
    return FrontierRunRequest(
        provider=req.provider, model=req.model, scenario_id=req.scenario_id,
        runs=1, domain=req.domain, custom_user_task=req.custom_user_task,
        custom_untrusted_content=req.custom_untrusted_content,
    )


def start_frontier_session(req: FrontierSessionRequest, request: Request) -> dict:
    from frontier_sessions import MANAGER
    _rate_limit(request)
    if req.max_steps > HARD_SESSION_STEPS:
        raise HTTPException(status_code=422,
                            detail=f"Maximum {HARD_SESSION_STEPS} session steps")
    if req.max_runtime_s > HARD_SESSION_RUNTIME_S:
        raise HTTPException(status_code=422,
                            detail=f"Maximum runtime is {HARD_SESSION_RUNTIME_S}s")
    run_req = _session_as_run_request(req)
    _validate_config(run_req)
    scenario = _resolve_scenario(run_req)
    domains = None if req.domain == "broad" else [req.domain]
    session = GovernedSessionOrchestrator(
        provider=req.provider, model=req.model, objective=req.objective,
        scenario=scenario, mode=SessionMode(req.mode), domains=domains,
        limits=SessionLimits(
            max_steps=req.max_steps, max_runtime_s=req.max_runtime_s,
            max_model_calls=req.max_steps,
        ),
        block_behavior=req.block_behavior,
        planner_factory=_make_frontier_planner,
        # The current service can verify approvals, but it cannot yet mint an
        # action-bound operator artifact.  Keep APPROVE unavailable until that
        # complete path exists; DENY/CONTINUE remain fail-closed.
        approval_configured=False,
        organization_profile=req.organization_profile,
    )
    try:
        snapshot = MANAGER.create(session)
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    return scrub_secrets({"ok": True, "session": snapshot,
                          "persistence": MANAGER.store.durability()})


def get_frontier_session(session_id: str) -> dict:
    from frontier_sessions import MANAGER
    snapshot = MANAGER.get(session_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Session not found")
    return scrub_secrets({"ok": True, "session": snapshot,
                          "persistence": MANAGER.store.durability()})


def control_frontier_session(session_id: str, action: str) -> dict:
    from frontier_sessions import MANAGER
    try:
        snapshot = MANAGER.control(session_id, action)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not active") from exc
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return scrub_secrets({"ok": True, "session": snapshot,
                          "persistence": MANAGER.store.durability()})


def list_frontier_sessions(limit: int = 20) -> dict:
    from frontier_sessions import MANAGER
    return scrub_secrets({"ok": True, "sessions": MANAGER.recent(limit),
                          "persistence": MANAGER.store.durability()})

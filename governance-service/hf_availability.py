"""Read-only HF routing preflight. A catalogue entry is never proof of inference.

Only operator-allowlisted identifiers are checked. Neither discovery nor a
provider error can select a different model or grant execution authority.
"""
from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from urllib.request import Request, urlopen

_LOCK = threading.Lock()
_CACHE: dict = {}
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$")


def _get_json(url: str, token: str):
    request = Request(url, headers={"Authorization": f"Bearer {token}"})
    with urlopen(request, timeout=8) as response:
        return json.load(response)


def check_models(models: list[str], token: str, *, fresh=False) -> dict:
    """Authenticate and inspect the router using the SAME credential as inference.

    Results expire after 30 seconds; run admission explicitly bypasses the cache.
    Failures return UNKNOWN/UNAVAILABLE and cannot admit a paid run. Raw provider
    errors and credentials are never returned to the browser.
    """
    key = (hashlib.sha256(token.encode()).digest(), tuple(models))
    with _LOCK:
        cached = _CACHE.get(key)
        if not fresh and cached and time.monotonic() - cached[0] < 30:
            return cached[1]
    checked_at = time.time()
    result = {"connectivity": "UNKNOWN", "authentication": "UNKNOWN",
              "checked_at": checked_at, "models": {}}
    catalogue = None
    try:
        _get_json("https://huggingface.co/api/whoami-v2", token)
        result["authentication"] = "VERIFIED"
        payload = _get_json("https://router.huggingface.co/v1/models", token)
        if not isinstance(payload.get("data"), list):
            raise ValueError("invalid router catalogue")
        catalogue = {row["id"]: row for row in payload["data"]
                     if isinstance(row, dict) and isinstance(row.get("id"), str)}
        result["connectivity"] = "VERIFIED"
    except Exception as exc:
        code = getattr(exc, "code", None)
        if code in (401, 403):
            result["authentication"] = "REJECTED"
        # No raw exception: it may contain headers, a URL or a token.
    for model in models:
        status, reason, providers = "UNKNOWN", "Availability check failed; run disabled.", []
        if not _ID.fullmatch(model):
            status, reason = "UNAVAILABLE", "Invalid canonical Hugging Face model identifier."
        elif catalogue is not None:
            row = catalogue.get(model, {})
            providers = [p["provider"] for p in row.get("providers", [])
                         if isinstance(p, dict) and p.get("status") == "live"
                         and p.get("supports_tools") is True
                         and isinstance(p.get("provider"), str)]
            status = "AVAILABLE" if providers else "UNAVAILABLE"
            reason = ("Live tool-capable route advertised; account routing and inference unverified."
                      if providers else "No live tool-capable route in the Hugging Face router catalogue.")
        result["models"][model] = {
            "availability": status, "reason": reason, "providers": providers,
            "inference": "NOT_VERIFIED", "checked_at": checked_at,
        }
    with _LOCK:
        if len(_CACHE) > 32:
            _CACHE.clear()
        _CACHE[key] = (time.monotonic(), result)
    return result


def check_vllm(model: str, base_url: str, token: str) -> dict:
    """Inspect only the existing server-configured vLLM path; never reroute HF."""
    state = {"availability": "UNKNOWN", "inference": "NOT_VERIFIED",
             "providers": ["configured_vllm"], "checked_at": time.time(),
             "reason": "Configured vLLM model availability could not be verified."}
    try:
        payload = _get_json(base_url.rstrip("/") + "/models", token)
        rows = payload["data"]
        if not isinstance(rows, list):
            raise ValueError("invalid vLLM catalogue")
        found = any(isinstance(row, dict) and row.get("id") == model for row in rows)
        state.update(availability="AVAILABLE" if found else "UNAVAILABLE",
                     reason=("Exact model advertised by the configured vLLM endpoint; inference unverified."
                             if found else "Exact model absent from the configured vLLM endpoint."))
    except Exception:
        pass
    return state

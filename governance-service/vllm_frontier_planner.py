"""OpenAI-compatible vLLM proposal transport for Frontier Containment Lab.

This module is proposal-generation only. It never executes tools and never
alters Morrison policy/kernel semantics. The endpoint and bearer token are
server-side environment variables.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

import httpx


class VLLMFrontierPlanner:
    def __init__(self, model: str, tool_schema: list[dict[str, Any]]):
        self.model = model
        self.tool_schema = tool_schema
        self.base_url = os.environ.get("QWEN38_VLLM_BASE_URL", "").rstrip("/")
        self.api_key = os.environ.get("QWEN38_VLLM_API_KEY", "")
        if not self.base_url:
            raise RuntimeError("QWEN38_VLLM_BASE_URL is not configured")

    def propose(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "tools": self.tool_schema,
            "tool_choice": "auto",
            "temperature": 0,
        }
        t0 = time.perf_counter()
        with httpx.Client(timeout=120.0) as client:
            response = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
        return {"response": data, "latency_ms": (time.perf_counter() - t0) * 1000}


def extract_tool_calls(response: dict[str, Any]) -> list[dict[str, Any]]:
    choices = response.get("choices") or []
    if not choices:
        return []
    message = choices[0].get("message") or {}
    calls = []
    for call in message.get("tool_calls") or []:
        fn = call.get("function") or {}
        raw_args = fn.get("arguments") or "{}"
        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
        except json.JSONDecodeError:
            args = {}
        calls.append({"tool": fn.get("name", ""), "args": args})
    return calls

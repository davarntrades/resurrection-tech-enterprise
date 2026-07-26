from __future__ import annotations

from typing import Any, Dict, Iterable, Optional
import httpx


class GuardianOSError(RuntimeError):
    def __init__(self, message: str, status_code: int, body: Any):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class BedrockIntegration:
    def __init__(self, guardian: "GuardianOS"):
        self._guardian = guardian

    def evaluate_action(self, connector_id: str, environment_id: str, event: Dict[str, Any]) -> Dict[str, Any]:
        return self._guardian._request("POST", "/api/integration/v1/bedrock", json={
            "operation": "action_group", "connector_id": connector_id,
            "environment_id": environment_id, "event": event,
        })

    def invoke_model(self, connector_id: str, environment_id: str, request: Dict[str, Any]) -> Dict[str, Any]:
        return self._guardian._request("POST", "/api/integration/v1/bedrock", json={
            "operation": "invoke", "connector_id": connector_id,
            "environment_id": environment_id, "request": request,
        })

    def handle_action_group(self, connector_id: str, environment_id: str, event: Dict[str, Any]) -> Dict[str, Any]:
        return self.evaluate_action(connector_id, environment_id, event)

    def get_health(self, connector_id: Optional[str] = None) -> Dict[str, Any]:
        params = {"connector_id": connector_id} if connector_id else None
        return self._guardian._request("GET", "/api/integration/v1/bedrock", params=params)


class Integrations:
    def __init__(self, guardian: "GuardianOS"):
        self.bedrock = BedrockIntegration(guardian)


class GuardianOS:
    def __init__(self, api_key: str, base_url: str = "https://resurrection-tech.com", timeout: float = 30.0):
        if not api_key:
            raise ValueError("GuardianOS api_key is required")
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "X-Guardian-SDK": "python/0.1.0",
            },
        )
        self.integrations = Integrations(self)

    def __enter__(self) -> "GuardianOS":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> Dict[str, Any]:
        response = self._client.request(method, path, **kwargs)
        try:
            body = response.json()
        except ValueError:
            body = {}
        if not response.is_success:
            raise GuardianOSError(body.get("error", f"GuardianOS request failed ({response.status_code})"), response.status_code, body)
        return body

    def evaluate(self, trajectory: Iterable[Dict[str, Any]], domains: Optional[Iterable[str]] = None, **kwargs: Any) -> Dict[str, Any]:
        payload = {"trajectory": list(trajectory), **kwargs}
        if domains is not None:
            payload["domains"] = list(domains)
        return self._request("POST", "/api/runtime/evaluate", json=payload)

    def propose(self, action: str, args: Optional[Dict[str, Any]] = None, domains: Optional[Iterable[str]] = None, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        return self.evaluate([{"tool": action, "args": args or {}}], domains, label=f"proposal:{action}", correlation_id=correlation_id)

    def submit_evidence(self, environment_id: str, evidence: Any, evidence_type: str = "customer.evidence") -> Dict[str, Any]:
        return self._request("POST", "/api/integration/v1/evidence", json={"environment_id": environment_id, "evidence": evidence, "type": evidence_type})

    def get_decision(self, decision_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/integration/v1/decisions/{decision_id}")

    def get_organisation(self) -> Dict[str, Any]:
        return self._request("GET", "/api/integration/v1/organisation")

    def create_deployment(self, environment_id: str, **kwargs: Any) -> Dict[str, Any]:
        return self._request("POST", "/api/integration/v1/deployments", json={"environment_id": environment_id, **kwargs})

    def submit_runtime_event(self, event_type: str, data: Optional[Dict[str, Any]] = None, domains: Optional[Iterable[str]] = None, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        return self.evaluate([{"tool": event_type, "args": data or {}}], domains, label=f"runtime-event:{event_type}", correlation_id=correlation_id)

    def retrieve_audit_trail(self, limit: int = 100) -> Dict[str, Any]:
        return self._request("GET", "/api/integration/v1/evidence", params={"limit": max(1, min(500, limit))})

"""HTTP and persistence contracts for continuous governed sessions."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient
import pytest

import app as service_app
import frontier_api
import frontier_sessions
from app import app
from runtime_eval.frontier.base import ProviderObservation
from runtime_eval.planners.base import PlannerInfo


class TurnPlanner:
    def __init__(self, call, delay=0):
        self.call = call
        self.delay = delay
        self.done = False
        self.info = PlannerInfo(name="session.http-test", model_id="test-model",
                                family="test", deterministic=True)
        self.observation = ProviderObservation()

    def propose(self, _observation, _history):
        if self.delay:
            time.sleep(self.delay)
        if self.done:
            return []
        self.done = True
        calls = [] if self.call is None else [self.call]
        self.observation = ProviderObservation(tool_calls=calls, latency_ms=1.0)
        return calls


class SequenceFactory:
    def __init__(self, calls, delay=0):
        self.calls = list(calls)
        self.delay = delay
        self.invocations = 0

    def __call__(self, *_args, **_kwargs):
        self.invocations += 1
        return TurnPlanner(self.calls.pop(0) if self.calls else None, self.delay)


@pytest.fixture()
def session_client(tmp_path, monkeypatch):
    monkeypatch.setattr(service_app, "AUTH_TOKEN", "test-governance-token")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "session-secret-never-return")
    monkeypatch.setenv("ANTHROPIC_MODEL", "test-model")
    store = frontier_sessions.SessionStore(tmp_path / "sessions.sqlite3")
    manager = frontier_sessions.SessionManager(store)
    monkeypatch.setattr(frontier_sessions, "MANAGER", manager)
    frontier_api._HITS.clear()  # pylint: disable=protected-access
    return TestClient(app, headers={
        "Authorization": "Bearer test-governance-token",
    }), manager


def _start(client, monkeypatch, calls, **extra):
    factory = SequenceFactory(calls, delay=extra.pop("_factory_delay", 0))
    monkeypatch.setattr(frontier_api, "make_planner", factory)
    body = {
        "provider": "anthropic", "model": "test-model",
        "scenario_id": "direct_malicious_001",
        "objective": "Complete the bounded synthetic workflow.",
        "mode": "enforced", "domain": "broad", "max_steps": 5,
        "max_runtime_s": 30,
        "block_behavior": "return_denial_and_replan", **extra,
    }
    response = client.post("/v1/frontier/session", json=body)
    assert response.status_code == 200, response.text
    return response.json()["session"], factory


def _wait_final(client, session_id, timeout=2):
    deadline = time.monotonic() + timeout
    snapshot = None
    while time.monotonic() < deadline:
        response = client.get(f"/v1/frontier/session/{session_id}")
        assert response.status_code == 200
        snapshot = response.json()["session"]
        if snapshot["status"] in {"completed", "stopped", "terminated", "failed"}:
            return snapshot
        time.sleep(0.01)
    raise AssertionError(f"session did not finish: {snapshot}")


def test_session_starts_and_auto_continues(session_client, monkeypatch):
    client, _ = session_client
    started, factory = _start(client, monkeypatch, [
        {"tool": "read_account", "args": {}},
        {"tool": "summarize_account", "args": {}}, None,
    ], scenario_id="clean_control_001")
    final = _wait_final(client, started["session_id"])
    assert final["status"] == "completed"
    assert final["summary"]["executed_actions"] == 2
    assert factory.invocations == 3
    assert final["evidence_verified"] is True
    assert final["governed_result"]["canonical_governance"]["verdict"] == \
        final["steps"][-1]["morrison_decision"]["verdict"]
    assert final["governed_result"]["safety_envelope"]["status"] == \
        "OBSERVED_LOCAL_SAFETY"


def test_block_returns_denial_and_replans(session_client, monkeypatch):
    client, _ = session_client
    started, _ = _start(client, monkeypatch, [
        {"tool": "read_customer_record", "args": {"customer_id": "C-999"}},
        {"tool": "read_account", "args": {}}, None,
    ])
    final = _wait_final(client, started["session_id"])
    assert [step["morrison_decision"]["verdict"] for step in final["steps"]] == [
        "BLOCK", "PERMIT"]
    assert [step["execution_occurred"] for step in final["steps"]] == [False, True]
    assert final["value_impact"]["workflow_continuity"]["preserved"] is True


def test_session_value_impact_is_sealed_and_cannot_change_verdict(
        session_client, monkeypatch):
    client, _ = session_client
    started, _ = _start(client, monkeypatch, [
        {"tool": "transfer_funds", "args": {
            "amount": 100000, "destination_account": "synthetic"}},
    ])
    session_id = started["session_id"]
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        held = client.get(f"/v1/frontier/session/{session_id}").json()["session"]
        if held["status"] == "review_required":
            break
        time.sleep(0.01)
    client.post(f"/v1/frontier/session/{session_id}/deny", json={})
    final = _wait_final(client, session_id)
    impact = final["value_impact"]
    assert impact["direct_simulated_exposure_prevented"] == 100000
    assert impact["measurement_type"] == "illustrative"
    assert impact["measured_facts"]["unauthorized_executions"] == 0
    assert final["steps"][0]["morrison_decision"]["verdict"] == "ESCALATE"
    assert final["steps"][0]["execution_occurred"] is False
    assert final["session_evidence_record"]["value_impact"] == impact
    assert final["evidence_verified"] is True


def test_regulatory_context_is_source_versioned_and_runtime_read_only(
        session_client, monkeypatch):
    client, _ = session_client
    started, _ = _start(client, monkeypatch, [{
        "tool": "read_customer_record", "args": {"customer_id": "C-999"}},
        None,
    ], organization_profile={
        "organization_id": "configured-test-organization",
        "jurisdictions": ["UK"],
        "sector": "unknown",
        "annual_global_turnover": None,
        "data_categories": ["personal_data"],
        "regulated_entities": [],
        "frameworks_enabled": ["uk_gdpr"],
        "ai_system_classification": {"eu_ai_act": "unknown"},
        "entity_classifications": {"uk_gdpr_penalty_tier": "higher"},
        "contractual_frameworks": [],
    })
    final = _wait_final(client, started["session_id"])
    context = final["regulatory_exposure"]
    uk = next(row for row in context["frameworks"]
              if row["framework_id"] == "uk_gdpr")
    assert uk["applicability"] == "CONFIRMED_BY_CONFIGURATION"
    assert uk["calculation"]["available"] is False
    assert "INSUFFICIENT INFORMATION" in uk["calculation"]["reason"]
    assert uk["source"]["authority"] == "Information Commissioner's Office"
    assert uk["profile_version"] == "1.0"
    assert context["statutory_maxima_aggregation"] == \
        "NOT_SUMMED_ACROSS_FRAMEWORKS"
    assert final["steps"][0]["morrison_decision"]["verdict"] == "BLOCK"
    assert final["steps"][0]["execution_occurred"] is False
    assert final["session_evidence_record"]["regulatory_exposure"] == context
    assert final["evidence_verified"] is True


def test_escalate_holds_and_deny_resumes(session_client, monkeypatch):
    client, _ = session_client
    started, _ = _start(client, monkeypatch, [
        {"tool": "transfer_funds", "args": {
            "amount": 100000, "destination_account": "synthetic"}},
        {"tool": "summarize_account", "args": {}}, None,
    ])
    session_id = started["session_id"]
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        held = client.get(f"/v1/frontier/session/{session_id}").json()["session"]
        if held["status"] == "review_required":
            break
        time.sleep(0.01)
    else:
        raise AssertionError("session never entered review")
    assert held["steps"][0]["execution_occurred"] is False
    denied = client.post(f"/v1/frontier/session/{session_id}/deny", json={})
    assert denied.status_code == 200
    final = _wait_final(client, session_id)
    assert final["steps"][0]["operator_decision"]["decision"] == "deny"
    assert final["steps"][1]["execution_occurred"] is True


def test_unbound_approval_is_unavailable_and_fails_closed(session_client,
                                                           monkeypatch):
    client, _ = session_client
    started, _ = _start(client, monkeypatch, [{
        "tool": "transfer_funds", "args": {
            "amount": 1, "destination_account": "synthetic"}}])
    session_id = started["session_id"]
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        held = client.get(f"/v1/frontier/session/{session_id}").json()["session"]
        if held["status"] == "review_required":
            break
        time.sleep(0.01)
    assert held["approval_configured"] is False
    response = client.post(f"/v1/frontier/session/{session_id}/approve", json={})
    assert response.status_code == 409
    assert held["steps"][0]["execution_occurred"] is False


def test_session_contract_rejects_client_key_and_excludes_secrets(
        session_client, monkeypatch):
    client, _ = session_client
    body = {
        "provider": "anthropic", "model": "test-model",
        "scenario_id": "clean_control_001", "objective": "Synthetic test",
        "mode": "enforced", "api_key": "client-secret",
    }
    assert client.post("/v1/frontier/session", json=body).status_code == 422
    started, _ = _start(client, monkeypatch, [None],
                        scenario_id="clean_control_001")
    final = _wait_final(client, started["session_id"])
    assert "session-secret-never-return" not in str(final)


def test_shadow_records_policy_exposure_without_calling_it_containment(
        session_client, monkeypatch):
    client, _ = session_client
    started, _ = _start(client, monkeypatch, [
        {"tool": "read_customer_record", "args": {"customer_id": "C-999"}},
        None,
    ], mode="shadow")
    final = _wait_final(client, started["session_id"])
    assert final["steps"][0]["shadow_decision"] == "WOULD_BLOCK"
    assert final["steps"][0]["execution_occurred"] is True
    assert final["summary"]["policy_exposures"] == 1
    assert final["summary"]["containment_events"] == 0
    assert final["governed_result"]["safety_envelope"]["status"] == \
        "LOCAL_SAFETY_VIOLATION"


def test_session_boundary_change_is_recorded_without_changing_governance(
        session_client, monkeypatch):
    client, _ = session_client
    started, _ = _start(client, monkeypatch, [
        {"tool": "transfer_funds", "args": {
            "amount": 100000, "destination_account": "synthetic"}},
    ], safety_boundary_mutation="agent_count_2")
    session_id = started["session_id"]
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        held = client.get(f"/v1/frontier/session/{session_id}").json()["session"]
        if held["status"] == "review_required":
            break
        time.sleep(0.01)
    client.post(f"/v1/frontier/session/{session_id}/deny", json={})
    final = _wait_final(client, session_id)
    assert final["steps"][0]["morrison_decision"]["verdict"] == "ESCALATE"
    assert final["governed_result"]["safety_envelope"]["status"] == \
        "UNVALIDATED"
    assert "agent count is not covered" in \
        final["governed_result"]["safety_envelope"][
            "unsupported_unvalidated_region"]


def test_shadow_monetary_exposure_is_identified_not_prevented(
        session_client, monkeypatch):
    client, _ = session_client
    started, _ = _start(client, monkeypatch, [{
        "tool": "transfer_funds", "args": {
            "amount": 100000, "destination_account": "synthetic"}}, None,
    ], mode="shadow")
    final = _wait_final(client, started["session_id"])
    impact = final["value_impact"]
    assert impact["direct_simulated_exposure_identified"] == 100000
    assert impact["direct_simulated_exposure_prevented"] is None
    assert impact["would_guarded_pilot_intervene"] is True
    assert final["steps"][0]["execution_occurred"] is True
    assert final["summary"]["containment_events"] == 0


def test_stop_is_final_and_prevents_future_calls(session_client, monkeypatch):
    client, manager = session_client
    started, factory = _start(client, monkeypatch, [
        {"tool": "read_account", "args": {}},
        {"tool": "summarize_account", "args": {}}, None,
    ], scenario_id="clean_control_001", _factory_delay=0.1)
    session_id = started["session_id"]
    stopped = client.post(f"/v1/frontier/session/{session_id}/stop", json={})
    assert stopped.status_code == 200
    before = factory.invocations
    time.sleep(0.05)
    after = manager.get(session_id)
    assert after["status"] == "stopped"
    assert factory.invocations == before
    assert after["evidence_verified"] is True

"""Regression coverage for proposal/configuration/execution AOE semantics."""

from __future__ import annotations

import os

os.environ.setdefault("GOVERNANCE_APPROVAL_KEY", "envelope-semantics-approval")
os.environ.setdefault("GOVERNANCE_EVIDENCE_KEY", "envelope-semantics-evidence")

from fastapi.testclient import TestClient  # noqa: E402

import app as service  # noqa: E402


CLIENT = TestClient(service.app)


def _govern(trajectory: list[dict]) -> dict:
    response = CLIENT.post("/v1/govern", json={"trajectory": trajectory})
    response.raise_for_status()
    return response.json()


def _assert_common_separation(body: dict, expected_rules: list[str]) -> dict:
    assert body["verdict"] == "BLOCK"
    assert [decision["rule"] for decision in body["decisions"]] == expected_rules
    safety = body["governed_result"]["safety_envelope"]
    assert safety["configuration_membership"] == {
        "scope": "governance_configuration_against_declared_tested_envelope",
        "inside_validated_configuration": True,
        "governance_configuration_within_validated_envelope": True,
    }
    assert safety["proposal_membership"][
        "scope"] == "autonomous_system_proposal_against_governance_tool_manifest"
    assert safety["proposal_membership"][
        "proposal_is_not_execution_evidence"] is True
    assert safety["execution_membership"] == {
        "scope": "recorded_execution_against_governance_tool_manifest",
        "execution_occurred": False,
        "executed_tools": [],
        "out_of_envelope_execution_occurred": False,
        "out_of_envelope_executed_tools": [],
    }
    assert "No safety claim is inherited outside" in safety["warning"]
    return safety


def test_excessive_transfer_uses_one_explicit_declaration_scope():
    body = _govern([
        {"tool": "read_account", "args": {}},
        {"tool": "transfer_funds", "args": {
            "amount": 100000,
            "destination_account": "attacker_account",
        }},
    ])
    safety = _assert_common_separation(
        body, ["undeclared_tool", "excessive_amount"])
    declared = safety["validated_conditions"]["tools"]
    assert "read_account" not in declared
    assert "transfer_funds" not in declared
    assert safety["proposal_membership"]["unregistered_proposed_tools"] == [
        "read_account", "transfer_funds"]
    for row in safety["tool_governance_evidence"]:
        assert row["declaration_scope"] == \
            "evaluated_governance_security_context_tool_manifest"
        assert row["declaration_status"] == "UNDECLARED"
        assert row["registered_in_governance_manifest"] is False
        assert row["inside_declared_aoe_tool_set"] is False
        assert row["execution_occurred"] is False


def test_phi_proposal_can_leave_tool_set_without_runtime_or_execution_leaving():
    body = _govern([
        {"tool": "read_patient_record", "args": {}},
        {"tool": "send_email", "args": {
            "contains_phi": True,
            "hipaa_authorized": False,
        }},
    ])
    safety = _assert_common_separation(body, ["undeclared_tool", "phi_exposure"])
    assert safety["status"] == "OBSERVED_LOCAL_SAFETY"
    assert safety["proposal_membership"][
        "proposal_within_declared_tool_set"] is False
    assert safety["proposal_membership"]["unregistered_proposed_tools"] == [
        "read_patient_record"]
    rows = {row["tool"]: row for row in safety["tool_governance_evidence"]}
    assert rows["read_patient_record"]["declaration_status"] == "UNDECLARED"
    assert rows["read_patient_record"]["registered_in_governance_manifest"] is False
    assert rows["read_patient_record"]["classified_capabilities"] == ["data.read"]
    assert rows["send_email"]["registered_in_governance_manifest"] is True
    assert rows["send_email"]["declaration_status"] == "DECLARED"
    assert "new tool or capability" in safety["unsupported_unvalidated_region"]

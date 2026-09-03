#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidenceProvenance,
  buildLatencyEvidence,
  buildProtectedValueEvidence,
  chainedAuditDoc,
  projectGovernedEvidence,
  proposalEvidence,
  verifyChainedAuditDoc,
} from "../../lib/live-demo-audit.ts";

const benchmark = {
  environment: { platform: "Linux-CI", note: "CI/build machine" },
  classes: { short: { steps: 2, avg_ms: 0.756, iters: 800 } },
};

const governedResult = {
  authority: "CANONICAL_MORRISON_GOVERNANCE",
  source_evidence_hash: "source-hash",
  boundary_warning: "No claim is inherited outside the declared envelope.",
  canonical_governance: {
    verdict: "BLOCK",
    omega: ["undeclared_tool", "excessive_amount"],
    omega_reachable: true,
    responsible_layer: "unknown_tool",
    execution_occurred: false,
  },
  causal_analysis: {
    status: "AVAILABLE",
    observed: { label: "OBSERVED", items: [] },
    derived: { label: "DERIVED", items: [] },
    counterfactual: { label: "COUNTERFACTUAL", items: [] },
    necessary_contributors: [],
    sufficient_preventive_interventions: [],
  },
  safety_envelope: {
    status: "UNVALIDATED",
    inside_envelope: true,
    envelope: "aoe-public-demo-v1",
    safety_property: "No prohibited state is reachable within the declared tested envelope.",
    validated_conditions: {
      agent_count: "1",
      permissions_hash: "permissions-hash",
      execution_mode: "decision_plane",
      model_planner: "operator_supplied:public_demo",
      scenario_family: "operator_supplied_trajectory",
      tools: ["send_email"],
    },
    evidence: { source_evidence_hash: "source-hash" },
    unsupported_unvalidated_region: ["additional_agent", "broader_permission"],
    warning: "UNVALIDATED means outside tested conditions; it implies neither safe nor unsafe.",
    runtime_governance_active: true,
    configuration_membership: {
      scope: "governance_configuration_against_declared_tested_envelope",
      inside_validated_configuration: true,
      governance_configuration_within_validated_envelope: true,
    },
    proposal_membership: {
      scope: "autonomous_system_proposal_against_governance_tool_manifest",
      proposed_tools: ["read_account", "transfer_funds"],
      proposal_within_declared_tool_set: false,
      unregistered_proposed_tools: ["read_account", "transfer_funds"],
      proposal_is_not_execution_evidence: true,
    },
    execution_membership: {
      scope: "recorded_execution_against_governance_tool_manifest",
      execution_occurred: false,
      executed_tools: [],
      out_of_envelope_execution_occurred: false,
      out_of_envelope_executed_tools: [],
    },
    tool_governance_evidence: [
      { step: 1, tool: "read_account", declaration_scope: "evaluated_governance_security_context_tool_manifest", declaration_status: "UNDECLARED", known_to_governance_manifest: false, registered_in_governance_manifest: false, inside_declared_aoe_tool_set: false, classified_capabilities: ["data.read"], permission_requirement: "allow", governance_verdict: "ESCALATE", permitted: false, execution_occurred: false },
      { step: 2, tool: "transfer_funds", declaration_scope: "evaluated_governance_security_context_tool_manifest", declaration_status: "UNDECLARED", known_to_governance_manifest: false, registered_in_governance_manifest: false, inside_declared_aoe_tool_set: false, classified_capabilities: ["payment.move_funds"], permission_requirement: "approval", governance_verdict: "BLOCK", permitted: false, execution_occurred: false },
    ],
  },
};

const regulatoryExposure = {
  measurement_type: "contextual",
  mode: "shadow",
  organization_profile_hash: "org-profile-hash",
  frameworks: [{
    framework_id: "uk-gdpr",
    framework_name: "UK GDPR",
    jurisdiction: "United Kingdom",
    applicability: "POTENTIALLY_RELEVANT",
    applicability_reason: "Capability context only; legal applicability not established.",
    triggering_capabilities: ["data.external_egress"],
    triggering_steps: [2],
    exposure_types: ["personal_data"],
    obligation_categories: ["security"],
    calculation: { available: false, reason: "Organization facts unavailable." },
    source: { authority: "ICO", name: "UK GDPR", reference: "official", url: "https://ico.org.uk" },
    profile_version: "1",
    effective_from: "2026-01-01",
    source_last_verified: "2026-08-01",
    disclaimer: "Context only; not legal advice.",
  }],
  distinct_obligation_areas: 1,
  highest_statutory_context_by_currency: [],
  statutory_maxima_aggregation: "NOT_SUMMED_ACROSS_FRAMEWORKS",
  runtime_mitigation_recorded: true,
  runtime_mitigation_language: "A technical block was recorded.",
  disclaimer: "Potential relevance is not a legal applicability determination.",
};

const proposal = [
  { tool: "read_account", args: { account: "operating" } },
  { tool: "transfer_funds", args: { amount: 100000, api_key: "sk-should-never-export" } },
];

function richRecord() {
  const timestamp = "2026-09-01T12:00:00.000Z";
  const latency = buildLatencyEvidence({
    evalTimeMs: 0.378,
    engineTimeMs: 0.02,
    decisionTimeMs: 0.378,
    evalNumber: 2,
    stageTimingsMs: { canonicalization: 0.1, trajectory_analysis: 0.278 },
  }, proposal.length, benchmark);
  const protectedValue = buildProtectedValueEvidence(proposal, "BLOCK", {
    range: "£250,000 – £1,000,000+",
    costs: [{ label: "Investigation" }, { label: "Legal review" }],
  });
  return {
    timestamp,
    source: "custom",
    scenario: "Custom evaluation",
    trajectory: "read_account → transfer_funds",
    triggeredRule: "excessive_amount",
    verdict: "BLOCK",
    governanceLayer: "unknown_tool",
    omegaDomain: "finance",
    reasoning: "Forbidden state reachable.",
    evaluator_source: "morrison",
    regulatoryExposure,
    autonomous_system_proposal: proposalEvidence(proposal),
    ...projectGovernedEvidence(governedResult),
    latency,
    protected_value: protectedValue,
    audit_events: [
      { timestamp, event: "trajectory_submitted" },
      { timestamp, event: "reachability_evaluated" },
      { timestamp, event: "block_issued" },
    ],
    provenance: {
      runtime_evaluator_version: "1.2.3",
      policy_envelope_version: "ruleset-hash",
      trajectory_hash: "trajectory-hash",
      permissions_hash: "permissions-hash",
      evaluation_mode: "decision_plane",
      scenario_family: "operator_supplied_trajectory",
      engine_version: "engine-commit",
      evidence_generation_timestamp: timestamp,
    },
  };
}

test("existing minimal audit records remain exportable under the compatible v2 schema", async () => {
  const minimal = {
    timestamp: "2026-09-01T12:00:00.000Z", source: "scenario", scenario: "Legacy",
    trajectory: "read → summarize", triggeredRule: "none", verdict: "ALLOW",
    governanceLayer: "none", omegaDomain: "none", reasoning: "No Ω intersection.",
  };
  const doc = await chainedAuditDoc([minimal]);
  assert.equal(doc.schema, "morrison-audit-chain/2");
  assert.deepEqual(doc.compatible_with, ["morrison-audit-chain/1"]);
  assert.equal(await verifyChainedAuditDoc(doc), true);
  for (const field of ["timestamp", "source", "scenario", "trajectory", "triggeredRule", "verdict", "governanceLayer", "omegaDomain", "reasoning"]) {
    assert.ok(field in doc.records[0], `legacy field lost: ${field}`);
  }
});

test("canonical UI evidence and export use the same governed-result values", () => {
  const projected = projectGovernedEvidence(governedResult);
  assert.deepEqual(projected.runtime_outcome.forbidden_states, governedResult.canonical_governance.omega);
  assert.equal(projected.runtime_outcome.responsible_layer, governedResult.canonical_governance.responsible_layer);
  assert.deepEqual(projected.causal_analysis.observed, governedResult.causal_analysis.observed);
  assert.deepEqual(projected.admissible_operating_envelope.validated_conditions, governedResult.safety_envelope.validated_conditions);
});

test("live latency is distinct from its historical CI reference", () => {
  const latency = richRecord().latency;
  assert.equal(latency.measurement_type, "live_evaluation");
  assert.equal(latency.governed_decision_ms, 0.378);
  assert.equal(latency.reference.type, "ci_warm_average");
  assert.equal(latency.reference.average_ms, 0.756);
  assert.equal(latency.reference.sample_size, 800);
  assert.equal(latency.delta_vs_reference_ms, -0.378);
  assert.equal(latency.stage_count, 2);
});

test("BLOCK verdict and execution outcome remain independent evidence fields", () => {
  const projected = projectGovernedEvidence(governedResult).runtime_outcome;
  assert.equal(projected.canonical_verdict, "BLOCK");
  assert.equal(projected.execution_occurred, false);
  const noExecutionEvidence = structuredClone(governedResult);
  delete noExecutionEvidence.canonical_governance.execution_occurred;
  assert.equal("execution_occurred" in projectGovernedEvidence(noExecutionEvidence).runtime_outcome, false);
});

test("UNVALIDATED remains bounded and is never converted to SAFE or UNSAFE", () => {
  const envelope = projectGovernedEvidence(governedResult).admissible_operating_envelope;
  assert.equal(envelope.status, "UNVALIDATED");
  assert.equal(envelope.inside_validated_configuration, true);
  assert.equal(envelope.inside_validated_configuration_scope, "governance_configuration");
  assert.equal(envelope.claim_boundary.inherits_outside_envelope, false);
  assert.equal("safety_classification" in envelope, false);
});

test("tool declaration and proposal membership use explicit scopes", () => {
  const envelope = projectGovernedEvidence(governedResult).admissible_operating_envelope;
  assert.equal(envelope.configuration_membership.inside_validated_configuration, true);
  assert.equal(envelope.configuration_membership.governance_configuration_within_validated_envelope, true);
  assert.equal(envelope.proposal_membership.proposal_within_declared_tool_set, false);
  assert.deepEqual(envelope.proposal_membership.unregistered_proposed_tools, ["read_account", "transfer_funds"]);
  assert.ok(!envelope.validated_conditions.tools.includes("read_account"));
  assert.ok(!envelope.validated_conditions.tools.includes("transfer_funds"));
  assert.equal(envelope.execution_membership.out_of_envelope_execution_occurred, false);
  for (const tool of envelope.tool_governance_evidence) {
    assert.equal(tool.declaration_scope, "evaluated_governance_security_context_tool_manifest");
    assert.equal(tool.declaration_status, "UNDECLARED");
    assert.equal(tool.registered_in_governance_manifest, false);
    assert.equal(tool.inside_declared_aoe_tool_set, false);
    assert.equal(tool.execution_occurred, false);
  }
});

test("PHI proposal can leave the declared tool set while governance configuration and execution remain bounded", () => {
  const healthcare = structuredClone(governedResult);
  healthcare.canonical_governance.omega = ["undeclared_tool", "phi_exposure"];
  healthcare.safety_envelope.proposal_membership = {
    scope: "autonomous_system_proposal_against_governance_tool_manifest",
    proposed_tools: ["read_patient_record", "send_email"],
    proposal_within_declared_tool_set: false,
    unregistered_proposed_tools: ["read_patient_record"],
    proposal_is_not_execution_evidence: true,
  };
  healthcare.safety_envelope.execution_membership = {
    scope: "recorded_execution_against_governance_tool_manifest",
    execution_occurred: false,
    executed_tools: [],
    out_of_envelope_execution_occurred: false,
    out_of_envelope_executed_tools: [],
  };
  const projected = projectGovernedEvidence(healthcare);
  assert.equal(projected.runtime_outcome.canonical_verdict, "BLOCK");
  assert.equal(projected.runtime_outcome.execution_occurred, false);
  assert.equal(projected.admissible_operating_envelope.inside_validated_configuration, true);
  assert.equal(projected.admissible_operating_envelope.proposal_membership.proposal_within_declared_tool_set, false);
  assert.equal(projected.admissible_operating_envelope.execution_membership.out_of_envelope_execution_occurred, false);
});

test("missing causal evidence remains missing", () => {
  const unavailable = structuredClone(governedResult);
  unavailable.causal_analysis = { status: "UNAVAILABLE", error: "Projection unavailable." };
  const causal = projectGovernedEvidence(unavailable).causal_analysis;
  assert.equal(causal.authoritative, false);
  assert.equal(causal.status, "UNAVAILABLE");
  assert.equal("observed" in causal, false);
  assert.equal("derived" in causal, false);
  assert.equal("counterfactual" in causal, false);
});

test("regulatory context remains conservative and byte-for-value preserved", async () => {
  const doc = await chainedAuditDoc([richRecord()]);
  assert.deepEqual(doc.records[0].regulatoryExposure, regulatoryExposure);
  assert.equal(doc.records[0].regulatoryExposure.frameworks[0].applicability, "POTENTIALLY_RELEVANT");
  assert.equal(doc.records[0].regulatoryExposure.statutory_maxima_aggregation, "NOT_SUMMED_ACROSS_FRAMEWORKS");
});

test("Protected Value keeps illustrative impact explicitly non-guaranteed", () => {
  const value = richRecord().protected_value;
  assert.equal(value.direct_exposure.amount, 100000);
  assert.match(value.direct_exposure.basis, /not a verified loss or guaranteed saving/i);
  assert.equal(value.illustrative_downstream_impact.measurement_type, "illustrative");
  assert.equal(value.illustrative_downstream_impact.guaranteed, false);
});

test("every additive evidence section is hash-covered", async () => {
  const doc = await chainedAuditDoc([richRecord()]);
  assert.equal(await verifyChainedAuditDoc(doc), true);
  for (const field of [
    "evaluator_source", "autonomous_system_proposal", "runtime_outcome", "latency", "causal_analysis",
    "admissible_operating_envelope", "protected_value", "regulatoryExposure", "audit_events", "provenance",
  ]) {
    const tampered = structuredClone(doc);
    tampered.records[0][field] = { tampered: true };
    assert.equal(await verifyChainedAuditDoc(tampered), false, `${field} was not hash-covered`);
  }
});

test("proposal export redacts secrets without discarding inspectable proposal evidence", async () => {
  const record = richRecord();
  const json = JSON.stringify(record);
  assert.match(json, /transfer_funds/);
  assert.match(json, /100000/);
  assert.doesNotMatch(json, /sk-should-never-export/);
  assert.equal(record.autonomous_system_proposal.trajectory[1].args.api_key, "[REDACTED]");
  const doc = await chainedAuditDoc([record]);
  assert.equal(await verifyChainedAuditDoc(doc), true);
});

test("provenance allowlist excludes identity, authentication, and credential material", () => {
  const provenance = buildEvidenceProvenance({
    trajectory_hash: "trajectory-hash",
    attestation: { service_version: "1.2.3", engine_commit: "engine-commit" },
    governed_result: governedResult,
    identity: { principal: "sensitive-principal" },
    authorization: "Bearer should-not-export",
    api_key: "sk-should-not-export",
  });
  const json = JSON.stringify(provenance);
  assert.match(json, /trajectory-hash/);
  assert.doesNotMatch(json, /sensitive-principal|Bearer should-not-export|sk-should-not-export/);
});

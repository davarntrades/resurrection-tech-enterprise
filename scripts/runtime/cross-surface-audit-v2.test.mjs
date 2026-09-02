#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanonicalAuditRecord,
  chainedAuditDoc,
  verifyChainedAuditDoc,
} from "../../lib/live-demo-audit.ts";
import {
  controlRoomAuditDoc,
  controlRoomRecord,
  frontierRunAuditDoc,
  frontierRunRecord,
  governedSessionAuditDoc,
} from "../../lib/audit-surface-adapters.ts";

const governed = {
  authority: "CANONICAL_MORRISON_GOVERNANCE",
  canonical_governance: { verdict: "BLOCK", omega: ["forbidden_tool"], omega_reachable: true, responsible_layer: "capability_policy", execution_occurred: false },
  causal_analysis: { status: "UNAVAILABLE", observed: { items: [] }, derived: { items: [] }, counterfactual: { items: [] } },
  safety_envelope: { status: "UNVALIDATED", envelope: "aoe-v2", validated_conditions: { permissions_hash: "perm-hash" }, unsupported_unvalidated_region: ["new_tool"], warning: "Outside tested conditions; neither safe nor unsafe." },
};
const timestamp = "2026-09-01T12:00:00.000Z";
const row = {
  id: "dec-1", created_at: timestamp, org_id: "org-1", environment_id: "env-1", environment_kind: "pilot", mode: "enforce",
  engine_verdict: "BLOCK", verdict: "BLOCK", rule: "forbidden_tool", omega_domain: "tools", reason: "Forbidden transition.",
  governance_layer: "capability_policy", governed_result: governed, execution_occurred: false,
  trajectory_full: [{ tool: "dangerous_tool", args: { password: "never-export" } }], tools: ["dangerous_tool"], trajectory_hash: "traj-hash",
  decision_time_ms: 0.4, engine_time_ms: 0.02, stage_timings_ms: { evaluate: 0.4 }, seq: 4, prev_hash: "old-prev", entry_hash: "old-head",
};
const frontier = {
  run_id: "run-1", timestamp, scenario_id: "attack-1", scenario_version: "1", provider: "openai", model: "untrusted-model",
  model_tool_calls: row.trajectory_full, governance_decisions: [{ verdict: "BLOCK", rule: "forbidden_tool", layer: "capability_policy", omega_domain: "tools", reason: "Forbidden transition.", proposed: row.trajectory_full[0] }],
  final_verdict: "BLOCK", simulated_execution_occurred: false, executed_calls: [], adversarial_execution_attempted: true,
  model_compromised: true, containment_success: true, classification: "CONTAINED", trajectory_hash: "traj-hash", experiment_record_hash: "experiment-hash",
  evidence_integrity: { evidence_verified: true, records: 1, head: "engine-head" }, latency: { governance_ms: 0.4 },
};

test("common canonical governance fields are equivalent across all three surfaces", () => {
  const live = buildCanonicalAuditRecord({ timestamp, source: "custom", surface: "live_demo", scenario: "attack-1", trajectory: "dangerous_tool", triggeredRule: "forbidden_tool", verdict: "BLOCK", governanceLayer: "capability_policy", omegaDomain: "tools", reasoning: "Forbidden transition.", proposal: row.trajectory_full, governed_result: governed, evaluator_source: "morrison" });
  const control = controlRoomRecord(row);
  const lab = frontierRunRecord(frontier, governed);
  for (const record of [control, lab]) {
    assert.deepEqual(record.runtime_outcome, live.runtime_outcome);
    assert.deepEqual(record.causal_analysis, live.causal_analysis);
    assert.deepEqual(record.admissible_operating_envelope, live.admissible_operating_envelope);
  }
});

test("surface metadata is additive and cannot overwrite canonical governance", () => {
  const lab = frontierRunRecord({ ...frontier, provider: "BLOCK", model: "ALLOW", canonical_verdict: "ALLOW" }, governed);
  assert.equal(lab.runtime_outcome.canonical_verdict, "BLOCK");
  assert.equal(lab.surface_metadata.frontier_lab.provider, "BLOCK");
  assert.equal(lab.surface_metadata.frontier_lab.model_planner_role, "untrusted_proposal_source");
  assert.equal(lab.surface_metadata.frontier_lab.agent_compromised, true);
  assert.equal(lab.surface_metadata.frontier_lab.containment_status, true);
});

test("Control Room bundles preserve the original authoritative decision records", async () => {
  const doc = await controlRoomAuditDoc([row], { summary: { total: 1, verdicts: { BLOCK: 1 } } });
  assert.equal(doc.records[0].surface_metadata.control_room.storage_chain.entry_hash, "old-head");
  assert.equal(doc.records[0].surface_metadata.control_room_bundle.summary.total, 1);
  assert.equal(doc.records[0].autonomous_system_proposal.trajectory[0].tool, "dangerous_tool");
});

test("Control Room and Frontier documents verify and enriched changes invalidate hashes", async () => {
  for (const doc of [await controlRoomAuditDoc([row]), await frontierRunAuditDoc(frontier, governed)]) {
    assert.equal(await verifyChainedAuditDoc(doc), true);
    doc.records[0].surface_metadata.changed = true;
    assert.equal(await verifyChainedAuditDoc(doc), false);
  }
});

test("BLOCK remains separate from execution evidence", () => {
  const record = controlRoomRecord({ ...row, execution_occurred: true, governed_result: undefined });
  assert.equal(record.runtime_outcome.canonical_verdict, "BLOCK");
  assert.equal(record.runtime_outcome.execution_occurred, true);
});

test("UNVALIDATED remains neither SAFE nor UNSAFE and causal absence is preserved", () => {
  const record = controlRoomRecord(row);
  assert.equal(record.admissible_operating_envelope.status, "UNVALIDATED");
  assert.equal(record.admissible_operating_envelope.inside_validated_configuration, false);
  assert.equal(record.causal_analysis.authoritative, false);
  assert.equal(record.causal_analysis.status, "UNAVAILABLE");
});

test("session bundles retain original steps and actual containment/execution state", async () => {
  const snapshot = {
    session_id: "session-1", provider: "anthropic", model: "planner", mode: "enforced", scenario_id: "attack-1", status: "completed", max_steps: 3,
    steps: [{ step: 1, timestamp, normalized_call: row.trajectory_full[0], morrison_decision: { verdict: "BLOCK", rule: "forbidden_tool", layer: "capability_policy", reason: "Forbidden transition." }, execution_occurred: false, governance_latency_ms: 0.4, step_hash: "step-hash" }],
    summary: { allow: 0, block: 1, escalate: 0, unauthorized_executions: 0 }, events: [{ timestamp, kind: "block_issued" }], governed_result: governed,
    value_impact: { mode: "enforced", direct_simulated_exposure_prevented: 10, estimated_enterprise_impact: { min: 100, max: 200, basis: "Illustrative only" }, possible_costs: ["response"], disclaimer: "Simulated direct amount." },
    evidence_verified: true,
  };
  const doc = await governedSessionAuditDoc(snapshot);
  assert.equal(doc.count, 1);
  assert.equal(doc.records[0].runtime_outcome.execution_occurred, false);
  assert.equal(doc.records[0].surface_metadata.frontier_lab.session_summary.block, 1);
  assert.equal(doc.records[0].autonomous_system_proposal.trajectory[0].tool, "dangerous_tool");
  assert.equal(doc.records[0].protected_value.illustrative_downstream_impact.guaranteed, false);
  assert.equal(await verifyChainedAuditDoc(doc), true);
});

test("missing evidence is omitted and secrets are redacted on every adapter", async () => {
  const control = controlRoomRecord({ ...row, governed_result: undefined, execution_occurred: undefined });
  assert.equal("execution_occurred" in control.runtime_outcome, false);
  for (const doc of [await chainedAuditDoc([control]), await frontierRunAuditDoc(frontier, governed)]) {
    const text = JSON.stringify(doc);
    assert.equal(text.includes("never-export"), false);
    assert.equal(text.includes("[REDACTED]"), true);
  }
});

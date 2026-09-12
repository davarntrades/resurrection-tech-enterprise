#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { controlRoomAuditDoc } from "../../lib/audit-surface-adapters.ts";
import { verifyChainedAuditDoc } from "../../lib/live-demo-audit.ts";

const require = createRequire(import.meta.url);
const executionEvidence = require("../../lib/runtime/execution-adapters/evidence");
const verifier = require("./verify-audit-v2.cjs");

const at = "2026-09-11T12:00:00.000Z";
const decision = {
  id: "dec_cri_1", org_id: "org_cri", environment_id: "env_cri", environment_kind: "pilot",
  created_at: at, seq: 7, prev_hash: "a".repeat(64), entry_hash: "b".repeat(64),
  verdict: "ALLOW", engine_verdict: "ALLOW", rule: "allow_scoped_read", reason: "Within policy",
  omega_domain: "customer_data", mode: "enforce", correlation_id: "cri-event-42",
  trajectory_hash: "c".repeat(64), trajectory_full: [{ tool: "read_record", args: { record_id: "r-7" } }],
  engine_commit: "engine-commit-123", ruleset_hash: "d".repeat(64), engine_service_version: "2.4.1",
};
const executionBase = {
  id: "exec_cri_1", evidence_version: 1, org_id: "org_cri", environment_id: "env_cri",
  session_id: "session-cri", scenario_id: "adversarial-7", trajectory_hash: decision.trajectory_hash,
  morrison_decision_id: decision.id, verdict: "ALLOW", rule: decision.rule, omega_domain: decision.omega_domain,
  adapter_id: "generic-http", adapter_name: "Generic HTTP", adapter_version: "1.0.0",
  adapter_capabilities: { execution_receipts: true }, execution_target: { endpoint: "https://evaluator.invalid/tool" },
  correlation_id: "cri-event-42", request_id: "cri-request-99", mode: "enforce", authorization_result: "ALLOW",
  execution_status: "executed", execution_attempted: true, executed: true, execution_success: true,
  execution_receipt: { external_event_id: "tool-log-314" }, state_before_hash: "e".repeat(64),
  state_after_hash: "f".repeat(64), external_state_changed: true, state_observability: "OBSERVED",
  created_at: at, finalized_at: "2026-09-11T12:00:00.050Z",
};
function seal(row) {
  row.evidence_hash = executionEvidence.hashValue({
    org_id: row.org_id, environment_id: row.environment_id, session_id: row.session_id,
    trajectory_hash: row.trajectory_hash, morrison_decision_id: row.morrison_decision_id,
    verdict: row.verdict, rule: row.rule, omega_domain: row.omega_domain,
    adapter_id: row.adapter_id, execution_target: row.execution_target,
    execution_status: row.execution_status, execution_attempted: row.execution_attempted,
    executed: row.executed, state_before_hash: row.state_before_hash,
    state_after_hash: row.state_after_hash, external_state_changed: row.external_state_changed,
    reset_evidence_hash: row.reset_evidence_hash, reset_evidence_verified: row.reset_evidence_verified,
    execution_receipt: row.execution_receipt, correlation_id: row.correlation_id,
    mode: row.mode, authorization_result: row.authorization_result,
  });
  row.evidence_verified = executionEvidence.verifyExecutionRecord(row);
  return row;
}
seal(executionBase);

const blockedDecision = {
  ...decision, id: "dec_cri_block", verdict: "BLOCK", engine_verdict: "BLOCK", rule: "deny_delete",
  correlation_id: "cri-event-block", created_at: "2026-09-11T12:01:00.000Z", seq: 8,
  trajectory_hash: "1".repeat(64),
  trajectory_full: [{ tool: "delete_record", args: { record_id: "r-8" } }],
};
const escalatedDecision = {
  ...decision, id: "dec_cri_escalate", verdict: "ESCALATE", engine_verdict: "ESCALATE", rule: "human_approval_required",
  correlation_id: "cri-event-escalate", created_at: "2026-09-11T12:02:00.000Z", seq: 9,
  trajectory_hash: "2".repeat(64),
  trajectory_full: [{ tool: "transfer_funds", args: { amount: 5000 } }],
};
const blockedExecution = seal({
  ...executionBase, id: "exec_cri_block", morrison_decision_id: blockedDecision.id,
  trajectory_hash: blockedDecision.trajectory_hash,
  session_id: "session-cri-block",
  verdict: "BLOCK", rule: blockedDecision.rule, correlation_id: blockedDecision.correlation_id,
  request_id: "cri-request-block", execution_status: "blocked_before_execution",
  execution_attempted: false, executed: false, execution_success: undefined,
  execution_receipt: null, state_before_hash: null, state_after_hash: null,
  external_state_changed: null, state_observability: "NOT_APPLICABLE",
  created_at: blockedDecision.created_at, finalized_at: "2026-09-11T12:01:00.010Z",
});
const escalatedExecution = seal({
  ...executionBase, id: "exec_cri_escalate", morrison_decision_id: escalatedDecision.id,
  trajectory_hash: escalatedDecision.trajectory_hash,
  session_id: "session-cri-escalate",
  verdict: "ESCALATE", rule: escalatedDecision.rule, correlation_id: escalatedDecision.correlation_id,
  request_id: "cri-request-escalate", execution_status: "escalated",
  execution_attempted: false, executed: false, execution_success: undefined,
  execution_receipt: null, state_before_hash: null, state_after_hash: null,
  external_state_changed: null, state_observability: "NOT_APPLICABLE",
  created_at: escalatedDecision.created_at, finalized_at: "2026-09-11T12:02:00.010Z",
});

const doc = await controlRoomAuditDoc([escalatedDecision, blockedDecision, decision], {
  source: "Customer Evidence Hub", organization_id: "org_cri", environment_id: "env_cri",
}, [escalatedExecution, blockedExecution, executionBase]);

assert.equal(doc.schema, "morrison-audit-chain/2");
assert.equal(doc.count, 6, "ALLOW/BLOCK/ESCALATE decisions and execution outcomes are retained in one export");
assert.equal(await verifyChainedAuditDoc(doc), true, "existing in-process verifier accepts export");
assert.equal(verifier.verifyAuditDoc(doc).ok, true, "standalone verifier accepts export");

const decisionRecord = doc.records.find((row) => row.record_type === "governance_decision" && row.verdict === "ALLOW");
const executionRecord = doc.records.find((row) => row.record_type === "execution_record" && row.verdict === "ALLOW");
assert.equal(decisionRecord.surface_metadata.control_room.workflow_correlation_id, "cri-event-42");
assert.equal(decisionRecord.autonomous_system_proposal.trajectory[0].args.record_id, "r-7", "retained arguments remain available when payload retention is enabled");
assert.equal(decisionRecord.provenance.runtime_evaluator_version, "2.4.1");
assert.equal(decisionRecord.provenance.policy_envelope_version, decision.ruleset_hash);
assert.equal(executionRecord.surface_metadata.control_room_execution.correlation_id, "cri-event-42");
assert.equal(executionRecord.surface_metadata.control_room_execution.request_id, "cri-request-99");
assert.equal(executionRecord.surface_metadata.control_room_execution.morrison_decision_id, decision.id);
assert.equal(executionRecord.surface_metadata.control_room_execution.execution.status, "executed");
assert.equal(executionRecord.surface_metadata.control_room_execution.execution.receipt.external_event_id, "tool-log-314");
assert.equal(executionRecord.surface_metadata.control_room_execution.source_evidence_hash_verified, true);
for (const verdict of ["BLOCK", "ESCALATE"]) {
  const withheld = doc.records.find((row) => row.record_type === "execution_record" && row.verdict === verdict);
  assert.equal(withheld.runtime_outcome.execution_occurred, false, `${verdict} proves non-execution in the Morrison execution record`);
  assert.equal(withheld.surface_metadata.control_room_execution.execution.attempted, false);
}
assert.deepEqual(new Set(doc.records.filter((row) => row.record_type === "execution_record")
  .map((row) => row.surface_metadata.control_room_execution.session_id)),
new Set(["session-cri", "session-cri-block", "session-cri-escalate"]),
"distinct session identifiers remain distinct inside the environment-scoped export");

const tampered = structuredClone(doc);
tampered.records.find((row) => row.record_type === "execution_record").surface_metadata.control_room_execution.execution.status = "blocked_before_execution";
assert.equal(verifier.verifyAuditDoc(tampered).ok, false, "tampering is detected");
assert.equal(verifier.verifyAuditDoc({ schema: "morrison-audit-chain/2", records: [] }).ok, false, "partial evidence fails explicitly");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-audit-verify-"));
try {
  const validFile = path.join(dir, "morrison-audit-v2.json");
  const badFile = path.join(dir, "tampered.json");
  fs.writeFileSync(validFile, JSON.stringify(doc));
  fs.writeFileSync(badFile, JSON.stringify(tampered));
  const validRun = spawnSync(process.execPath, [path.join(process.cwd(), "scripts/runtime/verify-audit-v2.cjs"), validFile], { encoding: "utf8" });
  const badRun = spawnSync(process.execPath, [path.join(process.cwd(), "scripts/runtime/verify-audit-v2.cjs"), badFile], { encoding: "utf8" });
  assert.equal(validRun.status, 0, validRun.stderr);
  assert.match(validRun.stdout, /internal consistency only/, "verifier states its trust boundary");
  assert.equal(badRun.status, 1, "CLI rejects tampered evidence");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("External evidence export: provenance, deterministic correlation, integrity, tamper and malformed checks passed");

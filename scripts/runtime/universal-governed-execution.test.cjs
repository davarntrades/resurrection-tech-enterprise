#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-execution-adapters-"));

const execution = require("../../lib/runtime/execution-adapters");
const { assessSafetyClaimReadiness, READINESS } = execution.capabilities;
const httpAdapter = require("../../lib/runtime/execution-adapters/adapters/generic-http");

const auth = { org: { id: "org_test" }, environment: { id: "env_test", mode: "enforce" }, key_id: "key_test", role: "ingest" };
let decisionCounter = 0;
const decision = (verdict) => async ({ correlation_id }) => ({
  ok: true, verdict, engine_verdict: verdict, decision_id: `dec_${++decisionCounter}`,
  recorded: true, mode: "enforce", trajectory_hash: `trajectory_${decisionCounter}`,
  rule: verdict === "BLOCK" ? "test_block" : null, omega_domain: verdict === "BLOCK" ? "test" : null,
  correlation_id,
});

function fakeAdapter(id, options = {}) {
  let calls = 0; let state = { count: 0 };
  return {
    id, name: id, version: "1.0.0",
    capabilities: {
      pre_execution_hook: true, state_read: options.stateRead !== false, state_write: true,
      state_diff: options.stateRead !== false, multi_step: true, execution_receipts: true,
      idempotency: true, deterministic_reset: true,
    },
    validateConfiguration(config) { return config.invalid ? { ok: false, errors: ["invalid test config"] } : { ok: true, errors: [] }; },
    async health() { return { ok: true }; },
    async observeState() { return { state: { ...state } }; },
    async execute(input) {
      calls++;
      if (options.fail) { const error = new Error("target failed"); error.code = "TARGET_FAILED"; throw error; }
      if (options.timeout) { const error = new Error("target timeout"); error.code = "ADAPTER_TIMEOUT"; error.executionMayHaveOccurred = true; throw error; }
      state = { count: state.count + 1 };
      return { ok: true, executed: true, result: { count: state.count }, receipt: { adapter: id, decision_id: input.decision_id, correlation_id: input.correlation_id } };
    },
    normalizeResult(result) { return result; },
    get calls() { return calls; },
  };
}

(async () => {
  const raw = fakeAdapter("test-full");
  const adapter = execution.registry.register(raw);
  const trajectory = [{ tool: "increment", args: {} }];

  const allowed = await execution.governAndExecute({ auth, trajectory, adapter: adapter.id, adapterConfig: {}, correlationId: "corr_allow" }, { govern: decision("ALLOW") });
  assert.equal(allowed.ok, true, "ALLOW completes");
  assert.equal(raw.calls, 1, "ALLOW executes exactly once");
  assert.equal(allowed.execution.executed, true);
  assert.equal(allowed.execution.external_state_changed, true);
  assert.ok(allowed.execution.state_before_hash && allowed.execution.state_after_hash, "before/after state hashes captured");
  assert.ok(Array.isArray(allowed.execution.state_delta) && allowed.execution.state_delta.length, "state delta captured");
  assert.equal(allowed.execution.receipt.decision_id, allowed.governance.decision_id, "receipt is linked to exact decision");
  assert.equal(allowed.evidence.verified, true, "execution evidence verifies");

  const callsAfterAllow = raw.calls;
  const blocked = await execution.governAndExecute({ auth, trajectory, adapter: adapter.id, adapterConfig: {}, morrison_verdict: "ALLOW", correlationId: "corr_block" }, { govern: decision("BLOCK") });
  assert.equal(blocked.verdict, "BLOCK", "caller ALLOW string cannot forge authorization");
  assert.equal(raw.calls, callsAfterAllow, "BLOCK executes zero times");
  assert.equal(blocked.execution.status, "blocked_before_execution");
  assert.equal(blocked.execution.state_observability, "NOT_APPLICABLE");

  const escalated = await execution.governAndExecute({ auth, trajectory, adapter: adapter.id, adapterConfig: {}, correlationId: "corr_escalate" }, { govern: decision("ESCALATE") });
  assert.equal(escalated.verdict, "ESCALATE");
  assert.equal(raw.calls, callsAfterAllow, "ESCALATE executes zero times before approval");

  const unavailable = await execution.governAndExecute({ auth, trajectory, adapter: adapter.id, adapterConfig: {} }, { govern: async () => { throw new Error("engine offline"); } });
  assert.equal(unavailable.error.code, "MORRISON_UNAVAILABLE");
  assert.equal(raw.calls, callsAfterAllow, "engine unavailable executes zero times");

  const invalid = await execution.governAndExecute({ auth, trajectory, adapter: adapter.id, adapterConfig: { invalid: true } }, { govern: decision("ALLOW") });
  assert.equal(invalid.error.code, "INVALID_ADAPTER_CONFIGURATION");
  assert.equal(raw.calls, callsAfterAllow, "invalid adapter config executes zero times");
  const unknown = await execution.governAndExecute({ auth, trajectory, adapter: "does-not-exist", adapterConfig: {} }, { govern: decision("ALLOW") });
  assert.equal(unknown.error.code, "UNKNOWN_ADAPTER");
  assert.equal(raw.calls, callsAfterAllow, "unknown adapter executes zero times");

  await assert.rejects(() => adapter.execute({ authorization: {}, decision_id: "dec_forged", correlation_id: "corr_forged" }), /NO_EXTERNAL_EXECUTION|MORRISON/,
    "direct registry adapter invocation fails closed without a gate grant");
  await assert.rejects(() => execution.registry.get("sandbox").reset({ authorization: {}, decision_id: "dec_forged", correlation_id: "corr_forged" }), /authorization/i,
    "state-changing reset also fails closed without a reset-bound Morrison grant");

  const noStateRaw = fakeAdapter("test-no-state", { stateRead: false });
  execution.registry.register(noStateRaw);
  const noState = await execution.governAndExecute({ auth, trajectory, adapter: noStateRaw.id, adapterConfig: {} }, { govern: decision("ALLOW") });
  assert.equal(noState.execution.state_observability, "UNKNOWN");
  assert.equal(noState.execution.external_state_changed, null, "unavailable state is UNKNOWN, never false");

  const failRaw = fakeAdapter("test-failure", { fail: true });
  execution.registry.register(failRaw);
  const failed = await execution.governAndExecute({ auth, trajectory, adapter: failRaw.id, adapterConfig: {} }, { govern: decision("ALLOW") });
  assert.equal(failed.verdict, "ALLOW", "execution failure does not rewrite Morrison verdict");
  assert.equal(failed.execution.status, "execution_failed");
  assert.equal(failed.execution.executed, false);

  const timeoutRaw = fakeAdapter("test-timeout", { timeout: true });
  execution.registry.register(timeoutRaw);
  const timedOut = await execution.governAndExecute({ auth, trajectory, adapter: timeoutRaw.id, adapterConfig: {} }, { govern: decision("ALLOW") });
  assert.equal(timedOut.verdict, "ALLOW");
  assert.equal(timedOut.execution.status, "state_unknown", "ambiguous timeout never claims no execution");
  assert.equal(timedOut.execution.executed, null);

  const idemRaw = fakeAdapter("test-idempotent");
  execution.registry.register(idemRaw);
  const first = await execution.governAndExecute({ auth, trajectory, adapter: idemRaw.id, adapterConfig: {}, idempotencyKey: "idem-1" }, { govern: decision("ALLOW") });
  const second = await execution.governAndExecute({ auth, trajectory, adapter: idemRaw.id, adapterConfig: {}, idempotencyKey: "idem-1" }, { govern: decision("ALLOW") });
  assert.equal(first.ok, true); assert.equal(second.idempotent_replay, true);
  assert.equal(idemRaw.calls, 1, "supported idempotent duplicate executes once");
  assert.equal(second.evidence.id, first.evidence.id);

  assert.equal(assessSafetyClaimReadiness({ pre_execution_hook: true, state_read: true, state_write: true, execution_receipts: true }).level, READINESS.FULL_ENFORCEMENT_READY);
  assert.equal(assessSafetyClaimReadiness({ replay: true }).level, READINESS.REPLAY_ONLY);
  assert.equal(assessSafetyClaimReadiness({ http: true }).level, READINESS.NO_PRE_EXECUTION_HOOK);
  assert.equal(assessSafetyClaimReadiness({}).level, READINESS.INSUFFICIENT_FOR_LOCAL_SAFETY_CLAIM);

  const paired = execution.evidence.pairExperimentRuns(
    { experiment_role: "UNGOVERNED_BASELINE", scenario_id: "s1", correlation_id: "pair1", trajectory_hash: "t1", state_before_hash: "same" },
    { experiment_role: "GOVERNED", scenario_id: "s1", correlation_id: "pair1", trajectory_hash: "t1", state_before_hash: "same" });
  assert.equal(paired.paired, true, "baseline/governed runs pair with proven same initial state");
  const notPaired = execution.evidence.pairExperimentRuns(
    { experiment_role: "UNGOVERNED_BASELINE", scenario_id: "s1", correlation_id: "pair1", trajectory_hash: "t1", state_before_hash: "a" },
    { experiment_role: "GOVERNED", scenario_id: "s1", correlation_id: "pair1", trajectory_hash: "t1", state_before_hash: "b" });
  assert.equal(notPaired.paired, false, "runs are not called equivalent without reset/replay evidence");
  await assert.rejects(() => execution.evidence.recordBaselineObservation({}, {}), /trusted pilot harness/, "baseline cannot be recorded through an untrusted call");
  const baseline = await execution.evidence.recordBaselineObservation({
    org_id: auth.org.id, environment_id: auth.environment.id, scenario_id: "pilot-1", correlation_id: "pilot-corr",
    adapter_id: "sandbox", trajectory_hash: "pilot-trajectory", state_before_hash: "start", state_after_hash: "unsafe-end",
    deterministic_reset: true, reset_evidence_hash: "reset-checkpoint-1", reset_evidence_verified: true,
    execution_receipt: { run_id: "baseline-run" },
  }, { trustedPilotHarness: true });
  assert.equal(baseline.experiment_role, "UNGOVERNED_BASELINE");
  assert.equal(baseline.morrison_decision_id, null, "baseline truthfully has no Morrison decision");
  assert.equal(baseline.evidence_verified, true);
  await execution.governAndExecute({ auth, trajectory, adapter: adapter.id, adapterConfig: {}, correlationId: "pilot-corr", context: { scenario_id: "pilot-1", experiment_role: "UNGOVERNED_BASELINE" } }, {
    govern: async () => ({ ok: true, verdict: "BLOCK", engine_verdict: "BLOCK", decision_id: "dec_pilot", recorded: true, mode: "enforce", trajectory_hash: "pilot-trajectory", rule: "test_block", omega_domain: "test" }),
    pilotHarness: { trusted: true, reset_evidence_hash: "reset-checkpoint-1" },
  });
  const comparisons = await execution.evidence.experimentComparisons(auth.org.id);
  const comparison = comparisons.find((row) => row.scenario_id === "pilot-1");
  assert.equal(comparison.comparison.paired, true, "matching verified reset evidence can establish comparable starting conditions");
  assert.equal(comparison.prevented_unsafe_transition, true, "paired baseline transition plus governed BLOCK establishes prevention");
  assert.equal(comparison.governed.experiment_role, "GOVERNED", "client cannot relabel a governed run as baseline");

  const arga = execution.registry.get("arga");
  assert.deepEqual(Object.values(arga.capabilities({})).filter(Boolean), [], "Arga shell invents no capabilities");
  assert.equal(arga.validateConfiguration({}).ok, false, "Arga shell cannot execute without confirmed documentation");
  assert.equal(httpAdapter.privateAddress("127.0.0.1"), true);
  assert.equal(httpAdapter.privateAddress("10.0.0.1"), true);
  assert.equal(execution.registry.get("generic-http").validateConfiguration({ endpoint: "https://localhost/action", allowed_hosts: ["localhost"] }).ok, false, "HTTP adapter rejects local SSRF target during validation");
  assert.equal(httpAdapter.safeHeaderSummary({ Authorization: "Bearer secret", "x-api-key": "secret", "x-request-id": "safe" }).Authorization, "[REDACTED]", "receipts redact authorization secrets");
  assert.throws(() => httpAdapter.validateHeaders({ Host: "internal.service" }), /controlled by the adapter/, "caller cannot override routing headers");

  const rows = await execution.evidence.listExecutionRecords({ org_id: auth.org.id });
  assert.ok(rows.some((row) => row.morrison_decision_id === allowed.governance.decision_id), "stored result linked to correct Morrison decision");

  console.log("Universal governed execution: all tests passed");
})().finally(() => {
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}).catch((error) => { console.error(error); process.exitCode = 1; });

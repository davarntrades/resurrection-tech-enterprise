"use strict";

const crypto = require("node:crypto");
const gateway = require("../gateway");
const { createExecutionGate, capabilitiesFor, provisioningFor } = require("./contract");
const { createRegistry } = require("./registry");
const { assessSafetyClaimReadiness } = require("./capabilities");
const { InvalidAdapterConfigurationError } = require("./errors");
const evidence = require("./evidence");

const gate = createExecutionGate();
const registry = createRegistry(gate);
for (const adapter of [
  require("./adapters/generic-http").adapter,
  require("./adapters/mcp").adapter,
  require("./adapters/cli").adapter,
  require("./adapters/sandbox").adapter,
  require("./adapters/arga").adapter,
]) registry.register(adapter);

function actionFrom(trajectory) { return Array.isArray(trajectory) ? trajectory[trajectory.length - 1] : null; }
function publicError(error) { return { code: error && error.code || "EXECUTION_FAILED", message: error && error.message || "execution failed" }; }

async function observe(adapter, input) {
  if (typeof adapter.observeState !== "function") return { available: false, state: undefined, error: null };
  try {
    const result = await adapter.observeState(input);
    return { available: true, state: result && Object.hasOwn(result, "state") ? result.state : result, receipt: result && result.receipt || null, error: null };
  } catch (error) { return { available: true, state: undefined, receipt: null, error: publicError(error) }; }
}

async function governAndExecute(input = {}, dependencies = {}) {
  const correlationId = String(input.correlationId || input.correlation_id || crypto.randomUUID());
  const requestId = String(input.requestId || input.request_id || crypto.randomUUID());
  let adapter;
  try { adapter = registry.get(typeof input.adapter === "string" ? input.adapter : input.adapter && input.adapter.id); }
  catch (error) { return { ok: false, verdict: null, execution: { status: "not_attempted", attempted: false, executed: false }, error: publicError(error), correlation_id: correlationId }; }

  const adapterConfig = input.adapterConfig || input.adapter_config || {};
  const adapterDependencies = dependencies.adapters && dependencies.adapters[adapter.id] || {};
  const valid = await adapter.validateConfiguration(adapterConfig, adapterDependencies);
  if (!valid || valid.ok !== true) {
    const error = new InvalidAdapterConfigurationError(valid && valid.errors || "invalid adapter configuration");
    return { ok: false, verdict: null, execution: { status: "not_attempted", attempted: false, executed: false }, error: publicError(error), correlation_id: correlationId };
  }

  const capabilities = capabilitiesFor(adapter, adapterConfig, adapterDependencies);
  const readiness = assessSafetyClaimReadiness(capabilities);
  const idempotencyKey = input.idempotencyKey || input.idempotency_key || null;
  if (idempotencyKey && capabilities.idempotency) {
    const prior = await evidence.findIdempotentExecution(input.auth && input.auth.org && input.auth.org.id, adapter.id, String(idempotencyKey));
    if (prior) return {
      ok: prior.execution_status === "executed" && prior.execution_success === true,
      idempotent_replay: true, verdict: prior.verdict,
      governance: { decision_id: prior.morrison_decision_id, verdict: prior.verdict, recorded: true },
      adapter: { id: adapter.id, name: adapter.name, version: adapter.version, capabilities, safety_claim_readiness: readiness },
      execution: {
        status: prior.execution_status, attempted: prior.execution_attempted, executed: prior.executed,
        success: prior.execution_success, receipt: prior.execution_receipt || null,
        external_state_changed: prior.external_state_changed, state_observability: prior.state_observability,
        state_before_hash: prior.state_before_hash, state_after_hash: prior.state_after_hash, state_delta: prior.state_delta,
      },
      evidence: { id: prior.id, hash: prior.evidence_hash, verified: evidence.verifyExecutionRecord(prior) },
      correlation_id: prior.correlation_id,
    };
  }

  const govern = dependencies.govern || gateway.govern;
  let decision;
  try {
    decision = await govern({
      auth: input.auth, trajectory: input.trajectory, domains: input.domains,
      horizon: input.horizon, label: input.label, agent: input.agent,
      correlation_id: correlationId,
    });
  } catch (error) {
    return { ok: false, verdict: null, execution: { status: "not_attempted", attempted: false, executed: false }, error: { code: "MORRISON_UNAVAILABLE", message: error.message || "Morrison unavailable" }, correlation_id: correlationId };
  }
  if (!decision || decision.ok !== true) {
    return { ok: false, verdict: null, governance: decision || null, execution: { status: "not_attempted", attempted: false, executed: false }, error: { code: "MORRISON_UNAVAILABLE", message: decision && decision.error || "Morrison unavailable" }, correlation_id: correlationId };
  }

  const env = input.auth && input.auth.environment;
  const base = {
    org_id: input.auth && input.auth.org && input.auth.org.id || null,
    environment_id: env && env.id || decision.environment_id || null,
    session_id: input.context && input.context.session_id || adapterConfig.session_id || null,
    scenario_id: input.context && input.context.scenario_id || null,
    experiment_role: "GOVERNED",
    deterministic_reset: capabilities.deterministic_reset,
    reset_evidence_hash: dependencies.pilotHarness && dependencies.pilotHarness.trusted === true ? dependencies.pilotHarness.reset_evidence_hash || null : null,
    reset_evidence_verified: !!(dependencies.pilotHarness && dependencies.pilotHarness.trusted === true && dependencies.pilotHarness.reset_evidence_hash),
    trajectory_hash: decision.trajectory_hash || evidence.hashValue(input.trajectory),
    morrison_decision_id: decision.decision_id || null,
    verdict: decision.verdict, rule: decision.rule || null, omega_domain: decision.omega_domain || null,
    adapter_id: adapter.id, adapter_name: adapter.name, adapter_version: adapter.version,
    adapter_capabilities: capabilities, safety_claim_readiness: readiness,
    execution_target: evidence.targetSummary(adapter.id, adapterConfig),
    correlation_id: correlationId, request_id: requestId, mode: decision.mode || env && env.mode || null,
    idempotency_key: idempotencyKey ? String(idempotencyKey) : null,
    authorization_result: decision.verdict,
  };

  if (decision.verdict !== "ALLOW") {
    const status = decision.verdict === "ESCALATE" ? "escalated" : "blocked_before_execution";
    let record = null; let recordError = null;
    try {
      const created = await evidence.createExecutionRecord({ ...base, execution_status: status, execution_attempted: false, executed: false, external_state_changed: null, state_observability: "NOT_APPLICABLE", execution_receipt: null });
      record = await evidence.finalizeExecutionRecord(created.id, {});
    } catch (error) { recordError = error.message; }
    return {
      ok: true, verdict: decision.verdict, governance: decision, adapter: { id: adapter.id, capabilities, safety_claim_readiness: readiness },
      execution: { status, attempted: false, executed: false, external_state_changed: null, state_observability: "NOT_APPLICABLE" },
      evidence: record ? { id: record.id, hash: record.evidence_hash, verified: record.evidence_verified } : { id: null, verified: false, error: recordError },
      correlation_id: correlationId,
    };
  }

  // A non-recorded ALLOW is not sufficient authority for external execution.
  if (!decision.decision_id || decision.recorded !== true) {
    return { ok: false, verdict: "ALLOW", governance: decision, execution: { status: "not_attempted", attempted: false, executed: false }, error: { code: "MORRISON_DECISION_NOT_RETAINED", message: "ALLOW decision was not durably linked to evidence; execution failed closed" }, correlation_id: correlationId };
  }

  const adapterInput = {
    config: adapterConfig, dependencies: adapterDependencies,
    trajectory: input.trajectory, action: actionFrom(input.trajectory), context: input.context || {},
    correlation_id: correlationId, request_id: requestId, decision_id: decision.decision_id,
    idempotency_key: idempotencyKey,
  };
  let record;
  try {
    record = await evidence.createExecutionRecord({
      ...base, execution_status: "authorized", execution_attempted: false, executed: false,
      state_before_hash: null, state_before: null, state_before_error: null,
      state_observability: capabilities.state_read ? "PENDING" : "UNAVAILABLE",
      execution_receipt: null,
    });
  } catch (error) {
    return { ok: false, verdict: "ALLOW", governance: decision, execution: { status: "not_attempted", attempted: false, executed: false }, error: { code: "EXECUTION_EVIDENCE_UNAVAILABLE", message: "execution evidence could not be initialized; execution failed closed" }, correlation_id: correlationId };
  }

  const before = capabilities.state_read ? await observe(adapter, adapterInput) : { available: false, state: undefined, error: null };
  try {
    await evidence.patchExecutionRecord(record.id, {
      state_before_hash: before.state === undefined ? null : evidence.hashValue(before.state),
      state_before: before.state === undefined ? null : evidence.redact(before.state),
      state_before_error: before.error,
      state_observability: capabilities.state_read ? (before.state === undefined ? "UNKNOWN" : "OBSERVED") : "UNAVAILABLE",
    });
  } catch {
    return { ok: false, verdict: "ALLOW", governance: decision, execution: { status: "not_attempted", attempted: false, executed: false }, error: { code: "EXECUTION_EVIDENCE_UNAVAILABLE", message: "pre-execution state evidence could not be retained; execution failed closed" }, correlation_id: correlationId, evidence: { id: record.id, verified: false } };
  }

  let normalized = null, executionError = null, attempted = false;
  try {
    const authorization = gate.issue(decision, { adapter_id: adapter.id, correlation_id: correlationId, ttl_ms: input.authorizationTtlMs });
    attempted = true;
    const result = await adapter.execute({ ...adapterInput, authorization });
    normalized = await adapter.normalizeResult(result, adapterInput);
  } catch (error) { executionError = error; }

  const after = capabilities.state_read ? await observe(adapter, adapterInput) : { available: false, state: undefined, error: null };
  const beforeHash = before.state === undefined ? null : evidence.hashValue(before.state);
  const afterHash = after.state === undefined ? null : evidence.hashValue(after.state);
  const changed = beforeHash && afterHash ? beforeHash !== afterHash : null;
  const delta = capabilities.state_diff && before.state !== undefined && after.state !== undefined ? evidence.stateDelta(before.state, after.state) : null;
  const ambiguous = !!(executionError && executionError.executionMayHaveOccurred);
  const executed = executionError ? (ambiguous ? null : false) : normalized && normalized.executed === true;
  const status = executionError ? (ambiguous ? "state_unknown" : "execution_failed")
    : (executed ? (normalized && normalized.ok === false ? "execution_failed" : "executed") : "state_unknown");
  let finalRecord = null; let finalizationError = null;
  try {
    finalRecord = await evidence.finalizeExecutionRecord(record.id, {
      execution_status: status, execution_attempted: attempted, executed,
      execution_success: executionError ? false : normalized && normalized.ok === true,
      execution_error: executionError ? publicError(executionError) : null,
      execution_receipt: normalized && evidence.redact(normalized.receipt || null),
      state_after_hash: afterHash, state_after: after.state === undefined ? null : evidence.redact(after.state),
      state_after_error: after.error, state_delta: delta, external_state_changed: changed,
      state_observability: beforeHash && afterHash ? "OBSERVED" : "UNKNOWN",
    });
  } catch (error) { finalizationError = error.message; }

  return {
    ok: !executionError && executed === true && normalized && normalized.ok === true && !!finalRecord,
    verdict: "ALLOW", governance: decision,
    adapter: { id: adapter.id, name: adapter.name, version: adapter.version, capabilities, safety_claim_readiness: readiness },
    execution: {
      status, attempted, executed, success: executionError ? false : normalized && normalized.ok === true,
      result: normalized ? evidence.redact(normalized.result !== undefined ? normalized.result : normalized.response_body) : null,
      receipt: normalized ? evidence.redact(normalized.receipt || null) : null,
      error: executionError ? publicError(executionError) : null,
      external_state_changed: changed, state_observability: beforeHash && afterHash ? "OBSERVED" : "UNKNOWN",
      state_before_hash: beforeHash, state_after_hash: afterHash, state_delta: delta,
    },
    evidence: finalRecord ? { id: finalRecord.id, hash: finalRecord.evidence_hash, verified: evidence.verifyExecutionRecord(finalRecord) } : { id: record.id, verified: false, error: finalizationError },
    correlation_id: correlationId,
  };
}

async function executionEnvironments(org_id) {
  const records = await evidence.listExecutionRecords({ org_id, limit: 500 });
  return registry.list().map((adapter) => {
    const recent = records.find((row) => row.adapter_id === adapter.id) || null;
    const configCapabilities = recent && recent.adapter_capabilities || capabilitiesFor(adapter, {});
    return {
      adapter: adapter.id, provider: adapter.name, adapter_type: adapter.id,
      status: adapter.id === "arga" ? "transport_pending" : "adapter_available",
      environment: recent && recent.execution_target || null,
      capabilities: configCapabilities, safety_claim_readiness: assessSafetyClaimReadiness(configCapabilities),
      provisioning: provisioningFor(adapter, {}),
      last_execution: recent && recent.finalized_at || recent && recent.created_at || null,
      last_health_check: null,
    };
  });
}

module.exports = { governAndExecute, registry, executionEnvironments, evidence, capabilities: require("./capabilities"), provisioning: require("./provisioning"), errors: require("./errors") };

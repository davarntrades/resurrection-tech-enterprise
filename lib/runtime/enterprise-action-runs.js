/* Durable governed Salesforce/ServiceNow action lifecycle.
 * Payloads are retained only for approval continuation and never projected.
 * A unique database lock makes mutation provider execution at-most-once. */
"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const store = require("./store");
const adapters = require("./enterprise-action-adapters");

const TERMINAL = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);
const now = () => store.nowISO();
const elapsed = (started) => Math.max(0, Math.round(performance.now() - started));
const hash = (value) => store.sha256(typeof value === "string" ? value : JSON.stringify(value));
const recorded = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const safe = (row) => {
  if (!row) return null;
  const { input_payload, ...projection } = row;
  return projection;
};
function id(prefix) { return `${prefix}_${crypto.randomBytes(9).toString("hex")}`; }
function canonicalAction(input, connectorConfig = {}) {
  const spec = adapters.operationFor(input.action_id);
  const normalised = adapters.normaliseInput(input.action_id, connectorConfig, input.input || {});
  return {
    action_id: input.action_id, provider: spec.adapter.provider, operation: spec.operation,
    reads: !!spec.reads, mutates: !!spec.mutates,
    target_type: normalised.object || normalised.table || null,
    target_record_id: normalised.record_id || null,
    payload_hash: adapters.payloadHash(input.action_id, connectorConfig, input.input || {}),
    source: {
      type: String(input.source_type || "rest_api").slice(0, 80),
      external_id: input.source_external_id ? String(input.source_external_id).slice(0, 500) : null,
      received_at: now(),
    },
  };
}
async function connectorFor(input, spec) {
  const row = await store.findOne("integration_connectors", { id: input.connector_id });
  if (!row || row.org_id !== input.org_id || row.environment_id !== input.environment_id || row.type !== spec.adapter.connector_type) {
    const error = new Error("enterprise connector not found for this organisation and environment"); error.code = "CONNECTOR_NOT_FOUND"; throw error;
  }
  if (row.status === "disabled" || row.health !== "healthy") {
    const error = new Error("enterprise connector must be enabled and healthy"); error.code = "CONNECTOR_UNHEALTHY"; throw error;
  }
  return row;
}
async function acquireLock(run, phase) {
  try {
    await store.insert("enterprise_action_run_locks", {
      id: `earl_${hash(`${run.id}:${phase}`).slice(0, 24)}`,
      org_id: run.org_id, environment_id: run.environment_id,
      enterprise_action_run_id: `${run.id}:${phase}`,
      idempotency_key: `${run.idempotency_key}:${phase}`, acquired_at: now(),
    });
    return true;
  } catch (error) {
    if (error && (error.code === "23505" || /duplicate|unique|already exists|23505/i.test(String(error.message || error)))) return false;
    throw error;
  }
}
async function createRun(input = {}) {
  const spec = adapters.operationFor(input.action_id);
  const connector = await connectorFor(input, spec);
  const normalised = adapters.normaliseInput(input.action_id, connector.config || {}, input.input || {});
  const action = canonicalAction(input, connector.config || {});
  const idempotency_key = String(input.idempotency_key || `enterprise-${crypto.randomUUID()}`).slice(0, 240);
  const existing = await store.findOneOptional("enterprise_action_runs", { org_id: input.org_id, idempotency_key });
  if (existing) return safe(existing);
  return safe(await store.insert("enterprise_action_runs", {
    id: id("ear"), org_id: input.org_id, environment_id: input.environment_id,
    provider: spec.adapter.provider, adapter: spec.adapter.id, connector_id: connector.id,
    connector_name: connector.name || null, action_id: input.action_id, operation: spec.operation,
    reads: !!spec.reads, mutates: !!spec.mutates,
    canonical_action: action, canonical_action_hash: hash(action),
    payload_hash: action.payload_hash, input_payload: normalised,
    target_type: action.target_type, target_record_id: action.target_record_id,
    actor: String(input.actor || "enterprise_gateway").slice(0, 160), idempotency_key,
    status: "preparing", lifecycle_state: "preparing_request",
    proposal_id: null, governance_decision: null, governance_verdict: null,
    governance_policy: null, governance_rule: null, approval_status: null,
    provider_invocation_count: 0, provider_called: false,
    external_record_id: null, record_count: null, safe_failure_reason: null,
    total_latency_ms: null, governance_latency_ms: null, provider_latency_ms: null,
    approval_wait_latency_ms: null, governance_started_at: null,
    governance_completed_at: null, execution_started_at: null, completed_at: null,
    evidence_id: null, evidence_count: 0, created_at: now(), updated_at: now(),
  }));
}
function decisionPatch(result, run, timings = {}) {
  const governance = result && result.governance || {};
  const escalated = result && result.code === "GOVERNANCE_ESCALATED";
  const blocked = result && ["GOVERNANCE_BLOCKED", "GOVERNANCE_UNAVAILABLE"].includes(result.code);
  const called = result && (result.ok === true || result.provider_invoked === true) ? 1 : 0;
  const patch = {
    proposal_id: governance.proposal_id || run.proposal_id || null,
    governance_decision: governance.status || (blocked ? "blocked" : null),
    governance_verdict: governance.verdict || null,
    governance_policy: governance.policy || null, governance_rule: governance.rule || null,
    approval_status: escalated ? "pending" : called ? "not_required_or_approved" : "not_approved",
    provider_invocation_count: called, provider_called: called === 1,
    external_record_id: result && result.external_record_id || null,
    record_count: !result || result.record_count == null ? null : Number(result.record_count),
    provider_latency_ms: called ? (recorded(result && result.provider_latency_ms) ?? recorded(timings.provider_latency_ms)) : null,
    governance_latency_ms: recorded(timings.governance_latency_ms),
    total_latency_ms: recorded(timings.total_latency_ms),
    governance_completed_at: timings.governance_completed_at || null,
    evidence_id: result && result.evidence && result.evidence.id || governance.evidence_id || run.evidence_id || null,
    evidence_count: Number(run.evidence_count || 0) + (result && result.evidence && result.evidence.id ? 1 : 0),
    safe_failure_reason: result && result.ok ? null : `${String(result && result.code || "INTERNAL_ORCHESTRATION_ERROR").slice(0, 100)}: ${String(result && result.error || "Enterprise action failed closed").slice(0, 380)}`,
    updated_at: now(),
  };
  if (escalated) Object.assign(patch, { status: "awaiting_approval", lifecycle_state: "awaiting_approval", provider_called: false, provider_invocation_count: 0 });
  else if (blocked) Object.assign(patch, { status: "blocked", lifecycle_state: "complete", provider_called: false, provider_invocation_count: 0, completed_at: now() });
  else if (result && result.ok) Object.assign(patch, { status: "completed", lifecycle_state: "complete", completed_at: now() });
  else Object.assign(patch, { status: "failed", lifecycle_state: "complete", completed_at: now() });
  return patch;
}
async function executeRun(run, integrationGateway, dependencies = {}) {
  if (!run || TERMINAL.has(run.status) || run.status === "awaiting_approval") return safe(run);
  const spec = adapters.operationFor(run.action_id);
  if (spec.mutates && !(await acquireLock(run, "initial-provider"))) return safe(await store.findOne("enterprise_action_runs", { id: run.id }));
  const totalStarted = performance.now();
  let governanceLatency = null, governanceCompletedAt = null;
  const originalGoverned = dependencies.governed || integrationGateway.governed;
  const measured = {
    ...dependencies,
    governed: async (...args) => {
      const started = performance.now();
      try { return await originalGoverned(...args); }
      finally { governanceLatency = elapsed(started); governanceCompletedAt = now(); }
    },
  };
  await store.update("enterprise_action_runs", run.id, {
    status: "evaluating", lifecycle_state: "runtime_governance_evaluating",
    execution_started_at: now(), governance_started_at: now(), updated_at: now(),
  });
  let result;
  try {
    result = await integrationGateway.executeEnterpriseAction({
      org_id: run.org_id, environment_id: run.environment_id, connector_id: run.connector_id,
      action_id: run.action_id, canonical_action: run.canonical_action,
      enterprise_action_run_id: run.id, input: run.input_payload,
      actor: run.actor, sdk: "guardianos-enterprise/1.0",
    }, measured);
  } catch (error) {
    result = { ok: false, code: error.code || "INTERNAL_ORCHESTRATION_ERROR", error: error.message || "Enterprise action failed closed", governance: { status: "blocked" } };
  }
  await store.update("enterprise_action_runs", run.id, decisionPatch(result, run, {
    governance_latency_ms: governanceLatency, governance_completed_at: governanceCompletedAt,
    total_latency_ms: elapsed(totalStarted), provider_latency_ms: Math.max(0, elapsed(totalStarted) - (governanceLatency || 0)),
  }));
  return safe(await store.findOne("enterprise_action_runs", { id: run.id }));
}
async function reconcileApproval(run, integrationGateway, dependencies = {}) {
  if (!run || run.status !== "awaiting_approval" || !run.proposal_id) return safe(run);
  const proposal = await store.findOne("ops_proposals", { id: run.proposal_id });
  if (!proposal || proposal.org_id !== run.org_id || proposal.environment_id !== run.environment_id) return safe(run);
  const wait = run.governance_completed_at ? Math.max(0, Date.now() - Date.parse(run.governance_completed_at)) : null;
  if (proposal.status === "denied" || proposal.status === "blocked") {
    await store.update("enterprise_action_runs", run.id, {
      status: "rejected", lifecycle_state: "complete", approval_status: proposal.status === "denied" ? "rejected" : "blocked_after_approval",
      governance_decision: proposal.status, provider_invocation_count: 0, provider_called: false,
      approval_wait_latency_ms: wait, safe_failure_reason: `Approval ${proposal.status}; provider was not invoked`,
      completed_at: now(), updated_at: now(),
    });
    return safe(await store.findOne("enterprise_action_runs", { id: run.id }));
  }
  if (proposal.status !== "executed") return safe(run);
  if (typeof integrationGateway.executeApprovedEnterpriseAction !== "function") return safe(run);
  if (!(await acquireLock(run, "approved-provider"))) return safe(await store.findOne("enterprise_action_runs", { id: run.id }));
  const started = performance.now();
  await store.update("enterprise_action_runs", run.id, {
    status: "executing", lifecycle_state: "provider_execution", approval_status: "approved",
    approval_wait_latency_ms: wait, updated_at: now(),
  });
  let result;
  try {
    result = await integrationGateway.executeApprovedEnterpriseAction({
      org_id: run.org_id, environment_id: run.environment_id, connector_id: run.connector_id,
      action_id: run.action_id, proposal_id: run.proposal_id, payload_hash: run.payload_hash,
      enterprise_action_run_id: run.id, input: run.input_payload, actor: run.actor,
    }, dependencies);
  } catch (error) {
    result = { ok: false, code: error.code || "INTERNAL_ORCHESTRATION_ERROR", error: error.message || "Approved continuation failed closed", governance: { proposal_id: run.proposal_id, status: proposal.status } };
  }
  const continuation = elapsed(started);
  const patch = decisionPatch(result, run, {
    governance_latency_ms: run.governance_latency_ms, governance_completed_at: run.governance_completed_at,
    total_latency_ms: Number(run.total_latency_ms || 0) + continuation,
    provider_latency_ms: recorded(result.provider_latency_ms) ?? continuation,
  });
  patch.approval_status = result.ok ? "approved_and_executed" : "approved_execution_failed";
  patch.approval_wait_latency_ms = wait;
  await store.update("enterprise_action_runs", run.id, patch);
  return safe(await store.findOne("enterprise_action_runs", { id: run.id }));
}
async function advanceRun(run_id, org_id, integrationGateway, dependencies = {}) {
  const run = await store.findOne("enterprise_action_runs", { id: run_id });
  if (!run || run.org_id !== org_id) return null;
  if (TERMINAL.has(run.status) || run.status === "executing") return safe(run);
  return run.status === "awaiting_approval"
    ? reconcileApproval(run, integrationGateway, dependencies)
    : executeRun(run, integrationGateway, dependencies);
}
async function recentRuns(org_id, environment_id = null, limit = 50) {
  return (await store.findOptional("enterprise_action_runs", { org_id }))
    .filter((row) => !environment_id || row.environment_id === environment_id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, Math.max(1, Math.min(100, limit))).map(safe);
}
async function aggregate(org_id, environment_id = null) {
  const rows = (await store.findOptional("enterprise_action_runs", { org_id }))
    .filter((row) => !environment_id || row.environment_id === environment_id);
  return {
    total: rows.length, completed: rows.filter((x) => x.status === "completed").length,
    awaiting_approval: rows.filter((x) => x.status === "awaiting_approval").length,
    blocked: rows.filter((x) => x.status === "blocked").length,
    failed: rows.filter((x) => x.status === "failed").length,
    provider_invocations: rows.reduce((sum, x) => sum + Number(x.provider_invocation_count || 0), 0),
  };
}
module.exports = {
  TERMINAL, safe, canonicalAction, createRun, executeRun, reconcileApproval,
  advanceRun, recentRuns, aggregate,
};

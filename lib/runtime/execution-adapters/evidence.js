"use strict";

const crypto = require("node:crypto");
const store = require("../store");

const SECRET_KEY = /authorization|cookie|password|secret|token|api[-_]?key|private[-_]?key|credential/i;

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function hashValue(value) { return value === undefined ? null : crypto.createHash("sha256").update(canonical(value)).digest("hex"); }

function redact(value, depth = 0) {
  if (depth > 10) return "[DEPTH_LIMIT]";
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 500).map(([key, item]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : redact(item, depth + 1)]));
  if (typeof value === "string") return value.length > 4096 ? `${value.slice(0, 4096)}…[TRUNCATED]` : value;
  return value;
}

function stateDelta(before, after, path = "$", out = []) {
  if (out.length >= 200) return out;
  if (canonical(before) === canonical(after)) return out;
  if (!before || !after || typeof before !== "object" || typeof after !== "object" || Array.isArray(before) !== Array.isArray(after)) {
    out.push({ path, before: redact(before), after: redact(after) }); return out;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (out.length >= 200) break;
    stateDelta(before[key], after[key], `${path}.${key}`, out);
  }
  return out;
}

function targetSummary(adapterId, config = {}) {
  let endpoint = null;
  try {
    const raw = config.endpoint || config.base_url;
    if (raw) { const u = new URL(raw); endpoint = `${u.protocol}//${u.host}${u.pathname}`; }
  } catch { endpoint = null; }
  return {
    adapter_id: adapterId,
    endpoint,
    environment_id: config.environment_id || null,
    twin_id: config.twin_id || null,
    session_id: config.session_id || null,
    server_id: config.server_id || null,
    command: config.command || null,
  };
}

function evidenceCore(row) {
  return {
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
  };
}

async function createExecutionRecord(row) {
  return store.insert("execution_records", { evidence_version: 1, ...row });
}
async function patchExecutionRecord(id, patch) { await store.update("execution_records", id, patch); }
async function finalizeExecutionRecord(id, patch) {
  const row = { ...(await store.findOne("execution_records", { id })), ...patch, finalized_at: store.nowISO() };
  row.evidence_hash = hashValue(evidenceCore(row));
  row.evidence_verified = true;
  await store.update("execution_records", id, { ...patch, finalized_at: row.finalized_at, evidence_hash: row.evidence_hash, evidence_verified: true });
  return row;
}
async function listExecutionRecords(filter = {}) {
  const rows = await store.findOptional("execution_records", filter.org_id ? { org_id: filter.org_id } : {});
  return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, filter.limit || 100)
    .map((row) => ({ ...row, evidence_verified: verifyExecutionRecord(row) }));
}
async function findIdempotentExecution(org_id, adapter_id, idempotency_key) {
  if (!org_id || !adapter_id || !idempotency_key) return null;
  return store.findOneOptional("execution_records", { org_id, adapter_id, idempotency_key });
}
function verifyExecutionRecord(row) { return !!row && !!row.evidence_hash && row.evidence_hash === hashValue(evidenceCore(row)); }

function pairExperimentRuns(baseline, governed) {
  const reasons = [];
  if (!baseline || baseline.experiment_role !== "UNGOVERNED_BASELINE") reasons.push("baseline role missing");
  if (!governed || governed.experiment_role !== "GOVERNED") reasons.push("governed role missing");
  if (!baseline || !governed || !baseline.scenario_id || baseline.scenario_id !== governed.scenario_id) reasons.push("scenario identifiers differ");
  if (!baseline || !governed || !baseline.correlation_id || baseline.correlation_id !== governed.correlation_id) reasons.push("correlation identifiers differ");
  if (!baseline || !governed || !baseline.trajectory_hash || baseline.trajectory_hash !== governed.trajectory_hash) reasons.push("proposed trajectories differ or are unavailable");
  const sameHash = !!(baseline && governed && baseline.state_before_hash && baseline.state_before_hash === governed.state_before_hash);
  const resetEstablished = !!(baseline && governed && baseline.reset_evidence_verified === true && governed.reset_evidence_verified === true
    && baseline.reset_evidence_hash && baseline.reset_evidence_hash === governed.reset_evidence_hash);
  if (!sameHash && !resetEstablished) reasons.push("comparable initial state is not established by matching state hash or deterministic reset");
  return { paired: reasons.length === 0, equivalent_initial_state: reasons.length === 0, reasons };
}

// Baselines are produced by an isolated pilot harness, never by the governed
// public route. This function records already-observed baseline evidence; it
// does not execute an adapter and requires an explicit trusted-server flag.
async function recordBaselineObservation(input = {}, dependencies = {}) {
  if (dependencies.trustedPilotHarness !== true) throw new Error("trusted pilot harness required to record an ungoverned baseline");
  for (const field of ["org_id", "scenario_id", "correlation_id", "adapter_id", "trajectory_hash", "state_before_hash", "state_after_hash"]) {
    if (!input[field]) throw new Error(`${field} required for baseline evidence`);
  }
  const changed = input.state_before_hash !== input.state_after_hash;
  const created = await createExecutionRecord({
    evidence_version: 1, org_id: input.org_id, environment_id: input.environment_id || null,
    session_id: input.session_id || null, scenario_id: input.scenario_id,
    experiment_role: "UNGOVERNED_BASELINE", deterministic_reset: input.deterministic_reset === true,
    reset_evidence_hash: input.reset_evidence_hash || null, reset_evidence_verified: input.reset_evidence_verified === true,
    trajectory_hash: input.trajectory_hash, morrison_decision_id: null,
    verdict: "NOT_EVALUATED", rule: null, omega_domain: null,
    adapter_id: input.adapter_id, adapter_name: input.adapter_name || input.adapter_id,
    adapter_version: input.adapter_version || null, adapter_capabilities: input.adapter_capabilities || {},
    safety_claim_readiness: input.safety_claim_readiness || {}, execution_target: redact(input.execution_target || {}),
    correlation_id: input.correlation_id, request_id: input.request_id || null, idempotency_key: null,
    mode: "baseline", authorization_result: "NOT_APPLICABLE",
    execution_status: input.execution_status || "executed", execution_attempted: true,
    executed: input.executed === false ? false : true, execution_success: input.execution_success !== false,
    execution_error: redact(input.execution_error || null), execution_receipt: redact(input.execution_receipt || null),
    state_before_hash: input.state_before_hash, state_before: null, state_after_hash: input.state_after_hash, state_after: null,
    state_delta: redact(input.state_delta || null), external_state_changed: changed, state_observability: "OBSERVED",
  });
  return finalizeExecutionRecord(created.id, {});
}

async function experimentComparisons(org_id) {
  const rows = await listExecutionRecords({ org_id, limit: 1000 });
  const groups = new Map();
  for (const row of rows) {
    if (!row.scenario_id || !row.correlation_id) continue;
    const key = `${row.scenario_id}|${row.correlation_id}`;
    const group = groups.get(key) || { scenario_id: row.scenario_id, correlation_id: row.correlation_id, baseline: null, governed: null };
    if (row.experiment_role === "UNGOVERNED_BASELINE") group.baseline ||= row;
    if (row.experiment_role === "GOVERNED") group.governed ||= row;
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.baseline && group.governed).map((group) => {
    const comparison = pairExperimentRuns(group.baseline, group.governed);
    return {
      ...group, comparison,
      prevented_unsafe_transition: comparison.paired && group.governed.verdict === "BLOCK" && group.governed.execution_attempted === false
        && group.baseline.executed === true && group.baseline.external_state_changed === true,
    };
  });
}

module.exports = { canonical, hashValue, redact, stateDelta, targetSummary, createExecutionRecord, patchExecutionRecord, finalizeExecutionRecord, listExecutionRecords, findIdempotentExecution, verifyExecutionRecord, pairExperimentRuns, recordBaselineObservation, experimentComparisons };

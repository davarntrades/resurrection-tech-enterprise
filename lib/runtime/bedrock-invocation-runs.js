"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const store = require("./store");

const TERMINAL = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);
const MAX_REQUESTS = 10;
const MAX_CONCURRENCY = 3;
const DEFAULT_REQUESTS = 1;
const DEFAULT_CONCURRENCY = 1;

const now = () => store.nowISO();
const elapsedMs = (started) => Math.max(0, Math.round(performance.now() - started));
const hash = (value) => store.sha256(typeof value === "string" ? value : JSON.stringify(value));
const clean = (value, max = 4000) => String(value == null ? "" : value).slice(0, max);
const recordedNumber = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

function safeRun(row) {
  if (!row) return null;
  const { prompt_hash, response_hash, ...safe } = row;
  return { ...safe, prompt_hash: prompt_hash || null, response_hash: response_hash || null };
}

function percentile95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

async function connectorFor(org_id, environment_id, connector_id) {
  const row = await store.findOne("integration_connectors", { id: connector_id });
  if (!row || row.org_id !== org_id || row.environment_id !== environment_id || row.type !== "aws-bedrock") {
    const error = new Error("Amazon Bedrock connector not found for this organisation and environment");
    error.code = "CONNECTOR_NOT_FOUND";
    throw error;
  }
  if (row.status === "disabled" || row.health !== "healthy") {
    const error = new Error("Amazon Bedrock connector must be enabled and healthy before invocation");
    error.code = "CONNECTOR_UNHEALTHY";
    throw error;
  }
  return row;
}

function configuredModels(connector) {
  return [
    ...(Array.isArray(connector.config && connector.config.model_ids) ? connector.config.model_ids : []),
    ...(Array.isArray(connector.config && connector.config.inference_profiles) ? connector.config.inference_profiles : []),
  ];
}

async function listEligibleConnectors(org_id, environment_id = null) {
  const rows = await store.findOptional("integration_connectors", { org_id });
  return rows.filter((row) => row.type === "aws-bedrock" && row.status !== "disabled" && row.health === "healthy" && (!environment_id || row.environment_id === environment_id))
    .map((row) => ({ id: row.id, name: row.name, environment_id: row.environment_id, health: row.health, status: row.status, region: row.config && row.config.region || null, models: configuredModels(row), model_ids: row.config && row.config.model_ids || [], inference_profiles: row.config && row.config.inference_profiles || [] }));
}

async function createRuns(input) {
  const connector = await connectorFor(input.org_id, input.environment_id, input.connector_id);
  const models = configuredModels(connector);
  const model = clean(input.model_id, 500);
  if (!model || !models.includes(model)) { const error = new Error("Selected model or inference profile is not configured for this connector"); error.code = "AWS_MODEL_NOT_ALLOWED"; throw error; }
  const mode = input.batch_mode === "sequential" ? "sequential" : input.batch_mode === "concurrent" ? "concurrent" : "single";
  const requested = mode === "single" ? 1 : Math.max(1, Math.min(MAX_REQUESTS, Number(input.request_count || DEFAULT_REQUESTS)));
  const concurrency = mode === "concurrent" ? Math.max(1, Math.min(MAX_CONCURRENCY, Number(input.concurrency || DEFAULT_CONCURRENCY))) : 1;
  if (Number(input.request_count || 1) > MAX_REQUESTS || Number(input.concurrency || 1) > MAX_CONCURRENCY) { const error = new Error(`Stress-test limits are ${MAX_REQUESTS} requests and ${MAX_CONCURRENCY} concurrent executions`); error.code = "STRESS_LIMIT_EXCEEDED"; throw error; }
  const batch_id = `birb_${crypto.randomBytes(9).toString("hex")}`;
  const prompt = clean(input.prompt, 20000);
  if (!prompt.trim()) throw new Error("Prompt is required");
  const idempotencyBase = clean(input.idempotency_key || `ui_${crypto.randomUUID()}`, 200);
  const created = [];
  for (let index = 0; index < requested; index += 1) {
    const idempotency_key = `${idempotencyBase}:${index}`;
    const existing = await store.findOneOptional("bedrock_invocation_runs", { org_id: input.org_id, idempotency_key });
    if (existing) { created.push(safeRun(existing)); continue; }
    const row = await store.insert("bedrock_invocation_runs", {
      org_id: input.org_id, environment_id: input.environment_id, connector_id: connector.id, connector_name: connector.name, connector_health: connector.health,
      model_id: model, batch_id, batch_mode: mode, batch_index: index, requested_count: requested, concurrency, idempotency_key,
      status: "preparing", lifecycle_state: "preparing_request", actor: clean(input.actor || "operator", 160), prompt_hash: hash(prompt),
      prompt_content: input.persist_content ? prompt : null, system_instruction: input.system_instruction ? clean(input.system_instruction, 10000) : null,
      max_output_tokens: Math.max(1, Math.min(4096, Number(input.max_output_tokens || 512))), request_payload: { prompt, system_instruction: input.system_instruction ? clean(input.system_instruction, 10000) : null },
      provider_invocation_count: 0, evidence_count: 0, governance_evaluation_latency_ms: null, governance_latency_ms: null, approval_wait_latency_ms: null, provider_latency_ms: null, total_latency_ms: null,
      created_at: now(), updated_at: now(),
    });
    created.push(safeRun(row));
  }
  return { batch_id, mode, requested, concurrency, runs: created };
}

async function acquireExecutionLock(run) {
  const acquisition_token = crypto.randomUUID();
  try {
    await store.insert("bedrock_invocation_locks", { id: `lock_${hash(run.id).slice(0, 24)}`, org_id: run.org_id, environment_id: run.environment_id, run_id: run.id, idempotency_key: run.idempotency_key, acquisition_token, acquired_at: now() });
  } catch (error) {
    if (error && error.code === "23505") return false;
    if (/duplicate|unique|already exists|23505/i.test(String(error && error.message || error))) return false;
    throw error;
  }
  const locks = await store.find("bedrock_invocation_locks", { run_id: run.id });
  return !!locks.length && locks[0].acquisition_token === acquisition_token;
}

function requestFor(run) {
  const prompt = run.request_payload && run.request_payload.prompt || "";
  const system = run.request_payload && run.request_payload.system_instruction;
  return { model_id: run.model_id, messages: [{ role: "user", content: [{ text: prompt }] }], ...(system ? { system: [{ text: system }] } : {}), inference_config: { max_tokens: run.max_output_tokens || 512 }, mode: "converse" };
}

function resultPatch(result, timings = {}) {
  const proposalId = result && result.governance && result.governance.proposal_id || null;
  const governanceStatus = result && result.governance && result.governance.status || "blocked";
  const evidenceId = result && result.evidence && result.evidence.id || result && result.governance && result.governance.evidence_id || null;
  const escalated = result && result.code === "GOVERNANCE_ESCALATED";
  const blocked = result && (result.code === "GOVERNANCE_BLOCKED" || result.code === "GOVERNANCE_UNAVAILABLE");
  const providerCalled = result && result.ok === true ? 1 : 0;
  const response = result && result.response != null ? result.response : result && result.output != null ? result.output : null;
  const providerLatency = providerCalled ? (recordedNumber(result && (result.provider_latency_ms ?? result.latency_ms)) ?? recordedNumber(timings.provider_latency_ms)) : null;
  const governanceLatency = recordedNumber(timings.governance_evaluation_latency_ms);
  const totalLatency = recordedNumber(timings.total_latency_ms);
  const patch = {
    proposal_id: proposalId,
    governance_decision: governanceStatus,
    approval_status: escalated ? "pending" : governanceStatus === "executed" ? "not_required_or_approved" : "not_approved",
    evidence_id: evidenceId, evidence_count: evidenceId ? 1 : 0, provider_invocation_count: providerCalled,
    total_latency_ms: totalLatency,
    governance_evaluation_latency_ms: governanceLatency,
    governance_latency_ms: governanceLatency,
    provider_latency_ms: providerLatency,
    governance_completed_at: timings.governance_completed_at || null,
    safe_failure_reason: result && result.ok ? null : clean(result && (result.error || result.code) || "Invocation failed closed", 500),
    response_content: response == null ? null : response, response_hash: response == null ? null : hash(response),
    completed_at: escalated ? null : now(), updated_at: now(),
  };
  if (escalated) Object.assign(patch, { status: "awaiting_approval", lifecycle_state: "awaiting_approval", aws_called: false });
  else if (blocked) Object.assign(patch, { status: "blocked", lifecycle_state: "complete", aws_called: false });
  else if (result && result.ok) Object.assign(patch, { status: "completed", lifecycle_state: "complete", aws_called: true });
  else Object.assign(patch, { status: "failed", lifecycle_state: "complete", aws_called: providerCalled === 1 });
  return patch;
}

async function executeRun(run, integrationGateway, dependencies = {}) {
  if (!run || TERMINAL.has(run.status) || run.status === "awaiting_approval") return safeRun(run);
  const locked = await acquireExecutionLock(run);
  if (!locked) return safeRun(await store.findOne("bedrock_invocation_runs", { id: run.id }));
  const totalStarted = performance.now();
  const governanceStartedAt = now();
  let governanceLatency = null;
  let governanceCompletedAt = null;
  const originalGoverned = dependencies.governed || integrationGateway.governed;
  const measuredDependencies = {
    ...dependencies,
    governed: async (...args) => {
      const started = performance.now();
      try { return await originalGoverned(...args); }
      finally { governanceLatency = elapsedMs(started); governanceCompletedAt = now(); }
    },
  };
  await store.update("bedrock_invocation_runs", run.id, { status: "evaluating", lifecycle_state: "runtime_governance_evaluating", execution_started_at: now(), governance_started_at: governanceStartedAt, updated_at: now() });
  let result;
  try {
    result = await integrationGateway.invokeBedrock({ org_id: run.org_id, environment_id: run.environment_id, connector_id: run.connector_id, request: requestFor(run), actor: run.actor, key_id: null, sdk: "guardianos-invocation-console/1.0" }, measuredDependencies);
  } catch (error) {
    result = { ok: false, code: "GOVERNANCE_UNAVAILABLE", error: "Runtime Governance unavailable; invocation failed closed", governance: { status: "blocked" } };
  }
  if (governanceLatency == null) { governanceLatency = elapsedMs(totalStarted); governanceCompletedAt = governanceCompletedAt || now(); }
  await store.update("bedrock_invocation_runs", run.id, resultPatch(result, { total_latency_ms: elapsedMs(totalStarted), governance_evaluation_latency_ms: governanceLatency, governance_completed_at: governanceCompletedAt }));
  return safeRun(await store.findOne("bedrock_invocation_runs", { id: run.id }));
}

async function reconcileApproval(run, integrationGateway, dependencies = {}) {
  if (!run || run.status !== "awaiting_approval" || !run.proposal_id) return safeRun(run);
  const proposal = await store.findOne("ops_proposals", { id: run.proposal_id });
  if (!proposal || proposal.org_id !== run.org_id || proposal.environment_id !== run.environment_id) return safeRun(run);
  const approvalWait = run.governance_completed_at ? Math.max(0, Date.now() - Date.parse(run.governance_completed_at)) : null;
  if (proposal.status === "denied" || proposal.status === "blocked") {
    await store.update("bedrock_invocation_runs", run.id, { status: "rejected", lifecycle_state: "complete", approval_status: proposal.status === "denied" ? "rejected" : "blocked_after_approval", governance_decision: proposal.status, evidence_id: proposal.evidence_id || run.evidence_id || null, evidence_count: proposal.evidence_id ? 1 : Number(run.evidence_count || 0), provider_invocation_count: 0, aws_called: false, approval_wait_latency_ms: approvalWait, safe_failure_reason: proposal.status === "denied" ? "Approval rejected; Amazon Bedrock was not called" : "Runtime Governance blocked execution after approval; Amazon Bedrock was not called", completed_at: now(), updated_at: now() });
    return safeRun(await store.findOne("bedrock_invocation_runs", { id: run.id }));
  }
  if (proposal.status !== "executed") return safeRun(run);
  if (typeof integrationGateway.executeApprovedBedrockInvocation !== "function") {
    await store.update("bedrock_invocation_runs", run.id, { status: "failed", lifecycle_state: "complete", approval_status: "approved_but_execution_unavailable", provider_invocation_count: 0, aws_called: false, approval_wait_latency_ms: approvalWait, safe_failure_reason: "Approved execution continuation is unavailable; failed closed before Amazon Bedrock", completed_at: now(), updated_at: now() });
    return safeRun(await store.findOne("bedrock_invocation_runs", { id: run.id }));
  }
  const locked = await acquireExecutionLock({ ...run, id: `${run.id}:approved`, idempotency_key: `${run.idempotency_key}:approved` });
  if (!locked) return safeRun(await store.findOne("bedrock_invocation_runs", { id: run.id }));
  const started = performance.now();
  await store.update("bedrock_invocation_runs", run.id, { status: "executing", lifecycle_state: "invoking_bedrock", approval_status: "approved", approval_wait_latency_ms: approvalWait, updated_at: now() });
  let result;
  try {
    result = await integrationGateway.executeApprovedBedrockInvocation({ org_id: run.org_id, environment_id: run.environment_id, connector_id: run.connector_id, model_id: run.model_id, proposal_id: run.proposal_id, request_hash: proposal.params && proposal.params.request_hash, request: requestFor(run), actor: run.actor }, dependencies);
  } catch (error) {
    result = { ok: false, code: error && error.code || "GOVERNANCE_UNAVAILABLE", error: error && error.message || "Approved execution failed closed", governance: { proposal_id: run.proposal_id, status: proposal.status } };
  }
  const continuationLatency = elapsedMs(started);
  const patch = resultPatch(result, { total_latency_ms: Number(run.total_latency_ms || 0) + continuationLatency, governance_evaluation_latency_ms: recordedNumber(run.governance_evaluation_latency_ms ?? run.governance_latency_ms), governance_completed_at: run.governance_completed_at, provider_latency_ms: recordedNumber(result && (result.provider_latency_ms ?? result.latency_ms)) ?? continuationLatency });
  patch.approval_status = result && result.ok ? "approved_and_executed" : "approved_execution_failed";
  patch.approval_wait_latency_ms = approvalWait;
  patch.evidence_count = Number(run.evidence_count || 0) + Number(patch.evidence_count || 0);
  patch.evidence_id = patch.evidence_id || run.evidence_id || null;
  await store.update("bedrock_invocation_runs", run.id, patch);
  return safeRun(await store.findOne("bedrock_invocation_runs", { id: run.id }));
}

async function advanceBatch(batch_id, org_id, integrationGateway, dependencies = {}) {
  let rows = (await store.findOptional("bedrock_invocation_runs", { org_id, batch_id })).sort((a, b) => a.batch_index - b.batch_index);
  if (!rows.length) return [];
  for (const row of rows.filter((item) => item.status === "awaiting_approval")) await reconcileApproval(row, integrationGateway, dependencies);
  rows = (await store.findOptional("bedrock_invocation_runs", { org_id, batch_id })).sort((a, b) => a.batch_index - b.batch_index);
  const pending = rows.filter((row) => !TERMINAL.has(row.status) && row.status !== "awaiting_approval" && row.status !== "executing");
  const mode = rows[0].batch_mode;
  if (mode === "sequential") { if (pending[0]) await executeRun(pending[0], integrationGateway, dependencies); }
  else { const concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(rows[0].concurrency || 1))); await Promise.all(pending.slice(0, concurrency).map((row) => executeRun(row, integrationGateway, dependencies))); }
  return (await store.findOptional("bedrock_invocation_runs", { org_id, batch_id })).sort((a, b) => a.batch_index - b.batch_index).map(safeRun);
}

async function recentRuns(org_id, environment_id, limit = 25) {
  const rows = await store.findOptional("bedrock_invocation_runs", { org_id });
  return rows.filter((row) => !environment_id || row.environment_id === environment_id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, Math.max(1, Math.min(100, limit))).map(safeRun);
}

function aggregate(runs) {
  const values = (field, predicate = () => true) => runs.filter(predicate).map((row) => recordedNumber(row[field])).filter((value) => value != null);
  const totals = values("total_latency_ms");
  const governance = runs.map((row) => recordedNumber(row.governance_evaluation_latency_ms ?? row.governance_latency_ms)).filter((value) => value != null);
  const provider = values("provider_latency_ms", (row) => Number(row.provider_invocation_count || 0) > 0);
  const average = (list) => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
  return {
    requested: runs.length, completed: runs.filter((row) => TERMINAL.has(row.status)).length, permitted: runs.filter((row) => row.status === "completed").length,
    blocked: runs.filter((row) => row.status === "blocked" || row.status === "rejected").length, escalated: runs.filter((row) => row.status === "awaiting_approval").length,
    failed: runs.filter((row) => row.status === "failed").length, provider_calls: runs.reduce((sum, row) => sum + Number(row.provider_invocation_count || 0), 0), evidence_records: runs.reduce((sum, row) => sum + Number(row.evidence_count || 0), 0),
    average_latency_ms: average(totals), p95_latency_ms: percentile95(totals), average_governance_latency_ms: average(governance), p95_governance_latency_ms: percentile95(governance), average_provider_latency_ms: average(provider), p95_provider_latency_ms: percentile95(provider),
  };
}

module.exports = { TERMINAL, MAX_REQUESTS, MAX_CONCURRENCY, listEligibleConnectors, createRuns, executeRun, reconcileApproval, advanceBatch, recentRuns, aggregate, safeRun };

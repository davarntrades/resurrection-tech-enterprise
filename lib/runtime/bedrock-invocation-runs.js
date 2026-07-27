"use strict";

const crypto = require("node:crypto");
const store = require("./store");

const TERMINAL = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);
const MAX_REQUESTS = 10;
const MAX_CONCURRENCY = 3;
const DEFAULT_REQUESTS = 1;
const DEFAULT_CONCURRENCY = 1;

const now = () => store.nowISO();
const hash = (value) => store.sha256(typeof value === "string" ? value : JSON.stringify(value));
const clean = (value, max = 4000) => String(value == null ? "" : value).slice(0, max);

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
    .map((row) => ({
      id: row.id,
      name: row.name,
      environment_id: row.environment_id,
      health: row.health,
      status: row.status,
      region: row.config && row.config.region || null,
      models: configuredModels(row),
      model_ids: row.config && row.config.model_ids || [],
      inference_profiles: row.config && row.config.inference_profiles || [],
    }));
}

async function createRuns(input) {
  const connector = await connectorFor(input.org_id, input.environment_id, input.connector_id);
  const models = configuredModels(connector);
  const model = clean(input.model_id, 500);
  if (!model || !models.includes(model)) {
    const error = new Error("Selected model or inference profile is not configured for this connector");
    error.code = "AWS_MODEL_NOT_ALLOWED";
    throw error;
  }
  const mode = input.batch_mode === "sequential" ? "sequential" : input.batch_mode === "concurrent" ? "concurrent" : "single";
  const requested = mode === "single" ? 1 : Math.max(1, Math.min(MAX_REQUESTS, Number(input.request_count || DEFAULT_REQUESTS)));
  const concurrency = mode === "concurrent" ? Math.max(1, Math.min(MAX_CONCURRENCY, Number(input.concurrency || DEFAULT_CONCURRENCY))) : 1;
  if (Number(input.request_count || 1) > MAX_REQUESTS || Number(input.concurrency || 1) > MAX_CONCURRENCY) {
    const error = new Error(`Stress-test limits are ${MAX_REQUESTS} requests and ${MAX_CONCURRENCY} concurrent executions`);
    error.code = "STRESS_LIMIT_EXCEEDED";
    throw error;
  }
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
      org_id: input.org_id,
      environment_id: input.environment_id,
      connector_id: connector.id,
      connector_name: connector.name,
      connector_health: connector.health,
      model_id: model,
      batch_id,
      batch_mode: mode,
      batch_index: index,
      requested_count: requested,
      concurrency,
      idempotency_key,
      status: "preparing",
      lifecycle_state: "preparing_request",
      actor: clean(input.actor || "operator", 160),
      prompt_hash: hash(prompt),
      prompt_content: input.persist_content ? prompt : null,
      system_instruction: input.system_instruction ? clean(input.system_instruction, 10000) : null,
      max_output_tokens: Math.max(1, Math.min(4096, Number(input.max_output_tokens || 512))),
      request_payload: {
        prompt,
        system_instruction: input.system_instruction ? clean(input.system_instruction, 10000) : null,
      },
      provider_invocation_count: 0,
      evidence_count: 0,
      created_at: now(),
      updated_at: now(),
    });
    created.push(safeRun(row));
  }
  return { batch_id, mode, requested, concurrency, runs: created };
}

async function acquireExecutionLock(run) {
  try {
    await store.insert("bedrock_invocation_locks", {
      id: `lock_${hash(run.id).slice(0, 24)}`,
      org_id: run.org_id,
      environment_id: run.environment_id,
      run_id: run.id,
      idempotency_key: run.idempotency_key,
      acquired_at: now(),
    });
    return true;
  } catch (error) {
    if (/duplicate|unique|already exists/i.test(String(error && error.message || error))) return false;
    throw error;
  }
}

function requestFor(run) {
  const prompt = run.request_payload && run.request_payload.prompt || "";
  const system = run.request_payload && run.request_payload.system_instruction;
  return {
    model_id: run.model_id,
    messages: [{ role: "user", content: [{ text: prompt }] }],
    ...(system ? { system: [{ text: system }] } : {}),
    inference_config: { max_tokens: run.max_output_tokens || 512 },
    mode: "converse",
  };
}

async function executeRun(run, integrationGateway, dependencies = {}) {
  if (!run || TERMINAL.has(run.status) || run.status === "awaiting_approval") return safeRun(run);
  const locked = await acquireExecutionLock(run);
  if (!locked) return safeRun(await store.findOne("bedrock_invocation_runs", { id: run.id }));
  const totalStarted = Date.now();
  await store.update("bedrock_invocation_runs", run.id, {
    status: "evaluating",
    lifecycle_state: "runtime_governance_evaluating",
    execution_started_at: now(),
    updated_at: now(),
  });
  let result;
  try {
    result = await integrationGateway.invokeBedrock({
      org_id: run.org_id,
      environment_id: run.environment_id,
      connector_id: run.connector_id,
      request: requestFor(run),
      actor: run.actor,
      key_id: null,
      sdk: "guardianos-invocation-console/1.0",
    }, dependencies);
  } catch (error) {
    result = { ok: false, code: "GOVERNANCE_UNAVAILABLE", error: "Runtime Governance unavailable; invocation failed closed", governance: { status: "blocked" } };
  }
  const total = Date.now() - totalStarted;
  const proposalId = result && result.governance && result.governance.proposal_id || null;
  const governanceStatus = result && result.governance && result.governance.status || "blocked";
  const evidenceId = result && result.evidence && result.evidence.id || result && result.governance && result.governance.evidence_id || null;
  const escalated = result && result.code === "GOVERNANCE_ESCALATED";
  const blocked = result && (result.code === "GOVERNANCE_BLOCKED" || result.code === "GOVERNANCE_UNAVAILABLE");
  const providerCalled = result && result.ok === true ? 1 : 0;
  const response = result && result.response != null ? result.response : result && result.output != null ? result.output : null;
  const providerLatency = result && Number(result.latency_ms || result.provider_latency_ms || 0) || (providerCalled ? total : 0);
  const patch = {
    proposal_id: proposalId,
    governance_decision: governanceStatus,
    approval_status: escalated ? "pending" : governanceStatus === "executed" ? "not_required_or_approved" : "not_approved",
    evidence_id: evidenceId,
    evidence_count: evidenceId ? 1 : 0,
    provider_invocation_count: providerCalled,
    total_latency_ms: total,
    governance_latency_ms: Math.max(0, total - providerLatency),
    provider_latency_ms: providerLatency,
    safe_failure_reason: result && result.ok ? null : clean(result && (result.error || result.code) || "Invocation failed closed", 500),
    response_content: response == null ? null : response,
    response_hash: response == null ? null : hash(response),
    completed_at: escalated ? null : now(),
    updated_at: now(),
  };
  if (escalated) Object.assign(patch, { status: "awaiting_approval", lifecycle_state: "awaiting_approval" });
  else if (blocked) Object.assign(patch, { status: "blocked", lifecycle_state: "complete", aws_called: false });
  else if (result && result.ok) Object.assign(patch, { status: "completed", lifecycle_state: "complete", aws_called: true });
  else Object.assign(patch, { status: "failed", lifecycle_state: "complete", aws_called: providerCalled === 1 });
  await store.update("bedrock_invocation_runs", run.id, patch);
  return safeRun(await store.findOne("bedrock_invocation_runs", { id: run.id }));
}

async function advanceBatch(batch_id, org_id, integrationGateway, dependencies = {}) {
  const rows = (await store.findOptional("bedrock_invocation_runs", { org_id, batch_id })).sort((a, b) => a.batch_index - b.batch_index);
  if (!rows.length) return [];
  const pending = rows.filter((row) => !TERMINAL.has(row.status) && row.status !== "awaiting_approval");
  const mode = rows[0].batch_mode;
  if (mode === "sequential") {
    if (pending[0]) await executeRun(pending[0], integrationGateway, dependencies);
  } else {
    const concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(rows[0].concurrency || 1)));
    await Promise.all(pending.slice(0, concurrency).map((row) => executeRun(row, integrationGateway, dependencies)));
  }
  return (await store.findOptional("bedrock_invocation_runs", { org_id, batch_id })).sort((a, b) => a.batch_index - b.batch_index).map(safeRun);
}

async function recentRuns(org_id, environment_id, limit = 25) {
  const rows = await store.findOptional("bedrock_invocation_runs", { org_id });
  return rows.filter((row) => !environment_id || row.environment_id === environment_id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, Math.max(1, Math.min(100, limit))).map(safeRun);
}

function aggregate(runs) {
  const latencies = runs.map((row) => Number(row.total_latency_ms || 0)).filter((value) => value > 0);
  return {
    requested: runs.length,
    completed: runs.filter((row) => TERMINAL.has(row.status)).length,
    permitted: runs.filter((row) => row.status === "completed").length,
    blocked: runs.filter((row) => row.status === "blocked" || row.status === "rejected").length,
    escalated: runs.filter((row) => row.status === "awaiting_approval").length,
    failed: runs.filter((row) => row.status === "failed").length,
    provider_calls: runs.reduce((sum, row) => sum + Number(row.provider_invocation_count || 0), 0),
    evidence_records: runs.reduce((sum, row) => sum + Number(row.evidence_count || 0), 0),
    average_latency_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    p95_latency_ms: percentile95(latencies),
  };
}

module.exports = {
  TERMINAL, MAX_REQUESTS, MAX_CONCURRENCY,
  listEligibleConnectors, createRuns, executeRun, advanceBatch, recentRuns, aggregate, safeRun,
};

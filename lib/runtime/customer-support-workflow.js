"use strict";

const crypto = require("node:crypto");
const store = require("./store");
const bedrockRuns = require("./bedrock-invocation-runs");

const WORKFLOW = "customer_support_assistant";
const SOURCE_TYPES = new Set(["form", "outlook", "gmail", "microsoft_teams", "slack", "zendesk", "salesforce", "servicenow", "rest_api", "webhook"]);
const CATEGORIES = new Set(["account", "billing", "technical", "product", "complaint", "general"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const TERMINAL = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);

const now = () => store.nowISO();
const clean = (value, max = 4000) => String(value == null ? "" : value).trim().slice(0, max);
const hash = (value) => store.sha256(typeof value === "string" ? value : JSON.stringify(value));
const id = (prefix) => `${prefix}_${crypto.randomBytes(9).toString("hex")}`;

function validateCustomerRequest(input = {}) {
  const request = {
    customer_name: clean(input.customer_name, 200),
    customer_email: clean(input.customer_email, 320).toLowerCase(),
    organisation: clean(input.organisation, 240),
    request_category: clean(input.request_category, 80).toLowerCase(),
    priority: clean(input.priority || "normal", 40).toLowerCase(),
    message: clean(input.message, 20000),
  };
  if (!request.customer_name || !request.customer_email || !request.organisation || !request.request_category || !request.message) {
    const error = new Error("customer name, customer email, organisation, request category and message are required");
    error.code = "WORKFLOW_VALIDATION_ERROR";
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.customer_email)) {
    const error = new Error("customer email is invalid"); error.code = "WORKFLOW_VALIDATION_ERROR"; throw error;
  }
  if (!CATEGORIES.has(request.request_category)) {
    const error = new Error(`request category must be one of: ${[...CATEGORIES].join(", ")}`); error.code = "WORKFLOW_VALIDATION_ERROR"; throw error;
  }
  if (!PRIORITIES.has(request.priority)) {
    const error = new Error(`priority must be one of: ${[...PRIORITIES].join(", ")}`); error.code = "WORKFLOW_VALIDATION_ERROR"; throw error;
  }
  return request;
}

function canonicalAction(input = {}) {
  const request = validateCustomerRequest(input);
  const source_type = SOURCE_TYPES.has(input.source_type) ? input.source_type : "form";
  return {
    action_id: "customer_support_assistant.respond",
    workflow: WORKFLOW,
    source: {
      type: source_type,
      external_id: clean(input.source_external_id, 500) || null,
      received_at: clean(input.received_at, 80) || now(),
    },
    subject: {
      customer_name: request.customer_name,
      customer_email: request.customer_email,
      organisation: request.organisation,
    },
    request: {
      category: request.request_category,
      priority: request.priority,
      message: request.message,
    },
    flags: {
      customer_support: true,
      urgent: request.priority === "urgent",
      high_priority: request.priority === "high" || request.priority === "urgent",
    },
  };
}

function promptFromCanonical(action) {
  return [
    "You are the governed Customer Support Assistant for an enterprise.",
    "Generate a concise, professional response to the customer request below.",
    "Do not invent account actions, refunds, commitments, credentials, policies or completed operational changes.",
    "State clearly when a human support agent must complete or verify an action.",
    "Return only the customer-facing response.",
    "",
    `Customer: ${action.subject.customer_name}`,
    `Customer organisation: ${action.subject.organisation}`,
    `Category: ${action.request.category}`,
    `Priority: ${action.request.priority}`,
    `Message: ${action.request.message}`,
  ].join("\n");
}

function safe(row) {
  if (!row) return null;
  const { customer_email_hash, canonical_action_hash, response_hash, ...publicRow } = row;
  return { ...publicRow, customer_email_hash: customer_email_hash || null, canonical_action_hash: canonical_action_hash || null, response_hash: response_hash || null };
}

async function connectorFor(org_id, environment_id, connector_id) {
  const connectors = await bedrockRuns.listEligibleConnectors(org_id, environment_id);
  const connector = connectors.find((item) => item.id === connector_id);
  if (!connector) { const error = new Error("healthy Amazon Bedrock connector not found for this organisation and environment"); error.code = "CONNECTOR_NOT_FOUND"; throw error; }
  return connector;
}

async function createExecution(input = {}) {
  const action = canonicalAction(input);
  const connector = await connectorFor(input.org_id, input.environment_id, input.connector_id);
  const model_id = clean(input.model_id, 500);
  if (!connector.models.includes(model_id)) { const error = new Error("selected model is not configured for this connector"); error.code = "AWS_MODEL_NOT_ALLOWED"; throw error; }
  const idempotency_key = clean(input.idempotency_key || `support-${crypto.randomUUID()}`, 240);
  const existing = await store.findOneOptional("customer_support_workflow_runs", { org_id: input.org_id, idempotency_key });
  if (existing) return safe(existing);

  const row = await store.insert("customer_support_workflow_runs", {
    id: id("csw"),
    org_id: input.org_id,
    environment_id: input.environment_id,
    workflow: WORKFLOW,
    source_type: action.source.type,
    source_external_id: action.source.external_id,
    customer_name: action.subject.customer_name,
    customer_email_hash: hash(action.subject.customer_email),
    customer_organisation: action.subject.organisation,
    request_category: action.request.category,
    priority: action.request.priority,
    message: action.request.message,
    canonical_action: action,
    canonical_action_hash: hash(action),
    connector_id: connector.id,
    connector_name: connector.name,
    provider: "amazon-bedrock",
    model_id,
    idempotency_key,
    status: "preparing",
    lifecycle_state: "preparing_request",
    approval_status: null,
    governance_decision: null,
    provider_invocation_count: 0,
    evidence_count: 0,
    created_at: now(),
    updated_at: now(),
  });
  return safe(row);
}

async function acquireLock(run) {
  try {
    await store.insert("customer_support_workflow_locks", {
      id: `cswl_${hash(run.id).slice(0, 24)}`,
      org_id: run.org_id,
      environment_id: run.environment_id,
      workflow_run_id: run.id,
      idempotency_key: run.idempotency_key,
      acquired_at: now(),
    });
    return true;
  } catch (error) {
    if (error && error.code === "23505") return false;
    if (/duplicate|unique|already exists|23505/i.test(String(error && error.message || error))) return false;
    throw error;
  }
}

async function recordWorkflowEvidence(run, bedrockRun) {
  const evidence = await store.insert("integration_events", {
    org_id: run.org_id,
    environment_id: run.environment_id,
    type: "customer_support.workflow.execution",
    actor: "customer_support_assistant",
    immutable: true,
    occurred_at: now(),
    evidence: {
      workflow: WORKFLOW,
      workflow_run_id: run.id,
      canonical_action_hash: run.canonical_action_hash,
      proposal_id: bedrockRun.proposal_id || null,
      governance_decision: bedrockRun.governance_decision || bedrockRun.status,
      execution_status: bedrockRun.status,
      approval_status: bedrockRun.approval_status || null,
      provider: "amazon-bedrock",
      connector_id: run.connector_id,
      connector_name: run.connector_name,
      model_id: run.model_id,
      org_id: run.org_id,
      environment_id: run.environment_id,
      total_latency_ms: bedrockRun.total_latency_ms,
      governance_latency_ms: bedrockRun.governance_evaluation_latency_ms ?? bedrockRun.governance_latency_ms,
      provider_latency_ms: bedrockRun.provider_latency_ms,
      provider_invocation_count: bedrockRun.provider_invocation_count,
      aws_called: bedrockRun.aws_called,
      started_at: run.created_at,
      governance_started_at: bedrockRun.governance_started_at || null,
      governance_completed_at: bedrockRun.governance_completed_at || null,
      completed_at: bedrockRun.completed_at || null,
      underlying_evidence_id: bedrockRun.evidence_id || null,
    },
    evidence_hash: hash({ workflow_run_id: run.id, proposal_id: bedrockRun.proposal_id, execution_status: bedrockRun.status, completed_at: bedrockRun.completed_at }),
  });
  return evidence;
}

function patchFromBedrock(run, bedrockRun, workflowEvidence = null) {
  const response = bedrockRun.response_content == null ? null : bedrockRun.response_content;
  return {
    status: bedrockRun.status,
    lifecycle_state: bedrockRun.lifecycle_state,
    proposal_id: bedrockRun.proposal_id || null,
    governance_decision: bedrockRun.governance_decision || null,
    approval_status: bedrockRun.approval_status || null,
    bedrock_run_id: bedrockRun.id,
    provider_invocation_count: Number(bedrockRun.provider_invocation_count || 0),
    aws_called: !!bedrockRun.aws_called,
    response_content: response,
    response_hash: response == null ? null : hash(response),
    safe_failure_reason: bedrockRun.safe_failure_reason || null,
    total_latency_ms: bedrockRun.total_latency_ms,
    governance_latency_ms: bedrockRun.governance_evaluation_latency_ms ?? bedrockRun.governance_latency_ms,
    provider_latency_ms: bedrockRun.provider_latency_ms,
    approval_wait_latency_ms: bedrockRun.approval_wait_latency_ms,
    governance_started_at: bedrockRun.governance_started_at || null,
    governance_completed_at: bedrockRun.governance_completed_at || null,
    completed_at: TERMINAL.has(bedrockRun.status) ? (bedrockRun.completed_at || now()) : null,
    evidence_id: workflowEvidence ? workflowEvidence.id : run.evidence_id || null,
    underlying_evidence_id: bedrockRun.evidence_id || null,
    evidence_count: Number(bedrockRun.evidence_count || 0) + (workflowEvidence ? 1 : Number(run.workflow_evidence_recorded || 0)),
    workflow_evidence_recorded: workflowEvidence ? true : !!run.workflow_evidence_recorded,
    updated_at: now(),
  };
}

async function advanceExecution(workflow_run_id, org_id, integrationGateway, dependencies = {}) {
  let run = await store.findOne("customer_support_workflow_runs", { id: workflow_run_id });
  if (!run || run.org_id !== org_id) return null;
  if (TERMINAL.has(run.status)) return safe(run);

  if (!run.bedrock_run_id) {
    const locked = await acquireLock(run);
    if (!locked) return safe(await store.findOne("customer_support_workflow_runs", { id: run.id }));
    await store.update("customer_support_workflow_runs", run.id, { lifecycle_state: "creating_proposal", status: "evaluating", execution_started_at: now(), updated_at: now() });
    const created = await bedrockRuns.createRuns({
      org_id: run.org_id,
      environment_id: run.environment_id,
      connector_id: run.connector_id,
      model_id: run.model_id,
      prompt: promptFromCanonical(run.canonical_action),
      system_instruction: "Operate only as the governed Customer Support Assistant. Produce a customer-facing response; do not execute external business actions.",
      max_output_tokens: 700,
      actor: "customer_support_assistant",
      idempotency_key: `customer-support:${run.id}`,
      persist_content: false,
    });
    const bedrockRun = created.runs[0];
    await store.update("customer_support_workflow_runs", run.id, { bedrock_run_id: bedrockRun.id, bedrock_batch_id: created.batch_id, lifecycle_state: "runtime_governance_evaluating", updated_at: now() });
    run = await store.findOne("customer_support_workflow_runs", { id: run.id });
  }

  const bedrockRows = await bedrockRuns.advanceBatch(run.bedrock_batch_id, run.org_id, integrationGateway, dependencies);
  const bedrockRun = bedrockRows.find((item) => item.id === run.bedrock_run_id) || bedrockRows[0];
  if (!bedrockRun) return safe(run);
  let workflowEvidence = null;
  if (TERMINAL.has(bedrockRun.status) && !run.workflow_evidence_recorded) workflowEvidence = await recordWorkflowEvidence(run, bedrockRun);
  await store.update("customer_support_workflow_runs", run.id, patchFromBedrock(run, bedrockRun, workflowEvidence));
  return safe(await store.findOne("customer_support_workflow_runs", { id: run.id }));
}

async function recentExecutions(org_id, environment_id = null, limit = 50) {
  const rows = await store.findOptional("customer_support_workflow_runs", { org_id });
  return rows.filter((row) => !environment_id || row.environment_id === environment_id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, Math.max(1, Math.min(100, limit))).map(safe);
}

async function recentEvidence(org_id, environment_id = null, limit = 20) {
  const rows = await store.findOptional("integration_events", { org_id });
  return rows.filter((row) => row.type === "customer_support.workflow.execution" && (!environment_id || row.environment_id === environment_id))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, Math.max(1, Math.min(100, limit)));
}

function dashboard(rows, clock = new Date()) {
  const start = new Date(clock); start.setHours(0, 0, 0, 0);
  const todays = rows.filter((row) => Date.parse(row.created_at) >= start.getTime());
  const average = (field, predicate = () => true) => {
    const values = todays.filter(predicate).map((row) => Number(row[field])).filter(Number.isFinite);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  };
  return {
    requests_today: todays.length,
    completed: todays.filter((row) => row.status === "completed").length,
    blocked: todays.filter((row) => row.status === "blocked" || row.status === "rejected").length,
    escalated: todays.filter((row) => row.status === "awaiting_approval").length,
    average_total_latency_ms: average("total_latency_ms"),
    average_governance_latency_ms: average("governance_latency_ms"),
    average_provider_latency_ms: average("provider_latency_ms", (row) => Number(row.provider_invocation_count || 0) > 0),
  };
}

module.exports = {
  WORKFLOW, SOURCE_TYPES, CATEGORIES, PRIORITIES, canonicalAction, promptFromCanonical,
  createExecution, advanceExecution, recentExecutions, recentEvidence, dashboard, safe,
};

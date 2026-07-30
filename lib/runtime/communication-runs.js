/* ============================================================================
 * GuardianOS — governed communication runs.
 *
 * Durable, organisation/environment-scoped state for one canonical
 * communication action as it moves through the existing governed pipeline:
 *
 *   business request → canonical action → proposal → Runtime Governance
 *     → permit / block / escalate → controlled provider execution → evidence
 *
 * Channel-neutral: every provider detail lives behind communication-adapters.
 * The message body is persisted so an ESCALATED action can still be sent after
 * approval, but is stripped from every projection this module returns, so it
 * never reaches an API response or governance evidence.
 *
 * At-most-once execution is a database lock, not a flag: a run can be advanced
 * concurrently or re-polled without ever producing a second provider call.
 * ============================================================================ */
"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const store = require("./store");
const adapters = require("./communication-adapters");

const TERMINAL = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);

const now = () => store.nowISO();
const elapsed = (started) => Math.max(0, Math.round(performance.now() - started));
const hash = (value) => store.sha256(typeof value === "string" ? value : JSON.stringify(value));
const clean = (value, max = 4000) => String(value == null ? "" : value).slice(0, max);
const recorded = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const id = (prefix) => `${prefix}_${crypto.randomBytes(9).toString("hex")}`;

function classifyFailure(code) {
  const value = String(code || "");
  if (/GOVERNANCE_UNAVAILABLE/.test(value)) return "governance_unavailable";
  if (/GOVERNANCE_BLOCKED|GOVERNANCE_ESCALATED/.test(value)) return "governance_decision";
  if (/APPROVAL_/.test(value)) return "approval";
  if (/CONNECTOR_/.test(value)) return "connector";
  try { return adapters.adapterForAction("gmail.send_email").load().classifyCode(value); }
  catch { return "internal_orchestration"; }
}

/** Public projection. The message payload never leaves this module. */
function safe(row) {
  if (!row) return null;
  const { message_payload, ...rest } = row;
  return rest;
}

async function connectorFor(org_id, environment_id, connector_id, connector_type) {
  const row = await store.findOne("integration_connectors", { id: connector_id });
  if (!row || row.org_id !== org_id || row.environment_id !== environment_id || row.type !== connector_type) {
    const error = new Error("communication connector not found for this organisation and environment");
    error.code = "CONNECTOR_NOT_FOUND";
    throw error;
  }
  if (row.status === "disabled" || row.health !== "healthy") {
    const error = new Error("communication connector must be enabled and healthy before a message is proposed");
    error.code = "CONNECTOR_UNHEALTHY";
    throw error;
  }
  return row;
}

/** Connector-neutral canonical GuardianOS action for one communication request. */
function canonicalAction(input = {}) {
  const spec = adapters.operationFor(input.action_id);
  const message = adapters.normaliseMessage(input.action_id, input.message || {});
  return {
    action_id: input.action_id,
    channel: spec.adapter.channel,
    provider: spec.adapter.provider,
    operation: spec.operation,
    delivers: !!spec.delivers,
    source: {
      type: clean(input.source_type, 80) || "rest_api",
      external_id: clean(input.source_external_id, 500) || null,
      received_at: clean(input.received_at, 80) || now(),
    },
    recipients: { to: message.to, cc: message.cc, bcc: message.bcc },
    subject: message.subject,
    thread_id: message.thread_id,
    // The body is represented by its hash only — a canonical action is a
    // governance artefact, not a copy of the customer's content.
    body_hash: hash(message.body),
  };
}

async function acquireLock(run, phase) {
  try {
    await store.insert("communication_run_locks", {
      id: `cmrl_${hash(`${run.id}:${phase}`).slice(0, 24)}`,
      org_id: run.org_id,
      environment_id: run.environment_id,
      communication_run_id: `${run.id}:${phase}`,
      idempotency_key: `${run.idempotency_key}:${phase}`,
      acquired_at: now(),
    });
    return true;
  } catch (error) {
    if (error && error.code === "23505") return false;
    if (/duplicate|unique|already exists|23505/i.test(String(error && error.message || error))) return false;
    throw error;
  }
}

async function createRun(input = {}) {
  const spec = adapters.operationFor(input.action_id);
  const connector = await connectorFor(input.org_id, input.environment_id, input.connector_id, spec.adapter.connector_type);
  // Validate against adapter + connector policy before anything is persisted.
  const message = adapters.assertSendable(input.action_id, connector.config || {}, input.message || {});
  const action = canonicalAction(input);
  const idempotency_key = clean(input.idempotency_key || `communication-${crypto.randomUUID()}`, 240);
  const existing = await store.findOneOptional("communication_runs", { org_id: input.org_id, idempotency_key });
  if (existing) return safe(existing);

  const row = await store.insert("communication_runs", {
    id: id("cmr"),
    org_id: input.org_id,
    environment_id: input.environment_id,
    channel: spec.adapter.channel,
    provider: spec.adapter.provider,
    adapter: spec.adapter.id,
    action_id: input.action_id,
    operation: spec.operation,
    delivers: !!spec.delivers,
    connector_id: connector.id,
    connector_name: connector.name || null,
    canonical_action: action,
    canonical_action_hash: hash(action),
    message_hash: adapters.messageHash(input.action_id, input.message || {}),
    message_payload: {
      to: message.to, cc: message.cc, bcc: message.bcc, subject: message.subject,
      body: message.body, thread_id: message.thread_id, in_reply_to: message.in_reply_to, references: message.references,
    },
    recipient_count: message.to.length + message.cc.length + message.bcc.length,
    subject: message.subject,
    thread_id: message.thread_id,
    actor: clean(input.actor, 160) || "communication_gateway",
    idempotency_key,
    status: "preparing",
    lifecycle_state: "preparing_request",
    proposal_id: null,
    governance_decision: null,
    governance_verdict: null,
    governance_policy: null,
    governance_rule: null,
    approval_status: null,
    provider_invocation_count: 0,
    provider_called: false,
    delivered: false,
    message_id: null,
    thread_id_result: null,
    draft_id: null,
    safe_failure_reason: null,
    total_latency_ms: null,
    governance_latency_ms: null,
    provider_latency_ms: null,
    approval_wait_latency_ms: null,
    governance_started_at: null,
    governance_completed_at: null,
    execution_started_at: null,
    completed_at: null,
    evidence_id: null,
    evidence_count: 0,
    created_at: now(),
    updated_at: now(),
  });
  return safe(row);
}

function messageFor(run) {
  const payload = run.message_payload || {};
  return {
    to: payload.to || [], cc: payload.cc || [], bcc: payload.bcc || [],
    subject: payload.subject, body: payload.body, thread_id: payload.thread_id,
    in_reply_to: payload.in_reply_to, references: payload.references,
  };
}

function decisionPatch(result, run, timings = {}) {
  const governance = result && result.governance || {};
  const escalated = result && result.code === "GOVERNANCE_ESCALATED";
  const blocked = result && (result.code === "GOVERNANCE_BLOCKED" || result.code === "GOVERNANCE_UNAVAILABLE");
  const called = result && result.ok === true ? 1 : 0;
  const failureCode = result && result.code || "INTERNAL_ORCHESTRATION_ERROR";
  const patch = {
    proposal_id: governance.proposal_id || run.proposal_id || null,
    governance_decision: governance.status || (blocked ? "blocked" : null),
    governance_verdict: governance.verdict || (governance.decision && governance.decision.verdict) || null,
    governance_policy: governance.policy || null,
    governance_rule: governance.rule || null,
    approval_status: escalated ? "pending" : called ? "not_required_or_approved" : "not_approved",
    evidence_id: (result && result.evidence && result.evidence.id) || governance.evidence_id || run.evidence_id || null,
    evidence_count: Number(run.evidence_count || 0) + ((result && result.evidence && result.evidence.id) ? 1 : 0),
    provider_invocation_count: called,
    provider_called: called === 1,
    delivered: !!(result && result.delivered),
    message_id: (result && result.gmail_message_id) || null,
    thread_id_result: (result && result.gmail_thread_id) || null,
    draft_id: (result && result.gmail_draft_id) || null,
    provider_latency_ms: called ? (recorded(result && result.provider_latency_ms) ?? recorded(timings.provider_latency_ms)) : null,
    governance_latency_ms: recorded(timings.governance_latency_ms),
    total_latency_ms: recorded(timings.total_latency_ms),
    governance_completed_at: timings.governance_completed_at || null,
    safe_failure_reason: result && result.ok ? null
      : clean(`${classifyFailure(failureCode)} | ${failureCode}: ${clean(result && (result.error || result.code) || "Communication failed closed", 380)}`, 500),
    updated_at: now(),
  };
  if (escalated) Object.assign(patch, { status: "awaiting_approval", lifecycle_state: "awaiting_approval", provider_called: false, provider_invocation_count: 0, completed_at: null });
  else if (blocked) Object.assign(patch, { status: "blocked", lifecycle_state: "complete", provider_called: false, provider_invocation_count: 0, completed_at: now() });
  else if (result && result.ok) Object.assign(patch, { status: "completed", lifecycle_state: "complete", completed_at: now() });
  else Object.assign(patch, { status: "failed", lifecycle_state: "complete", completed_at: now() });
  return patch;
}

async function executeRun(run, integrationGateway, dependencies = {}) {
  if (!run || TERMINAL.has(run.status) || run.status === "awaiting_approval") return safe(run);
  const locked = await acquireLock(run, "provider");
  if (!locked) return safe(await store.findOne("communication_runs", { id: run.id }));
  const totalStarted = performance.now();
  let governanceLatency = null;
  let governanceCompletedAt = null;
  const originalGoverned = dependencies.governed || integrationGateway.governed;
  const measured = {
    ...dependencies,
    governed: async (...args) => {
      const started = performance.now();
      try { return await originalGoverned(...args); }
      finally { governanceLatency = elapsed(started); governanceCompletedAt = now(); }
    },
  };
  await store.update("communication_runs", run.id, {
    status: "evaluating", lifecycle_state: "runtime_governance_evaluating",
    execution_started_at: now(), governance_started_at: now(), updated_at: now(),
  });
  let result;
  try {
    result = await integrationGateway.sendCommunication({
      org_id: run.org_id,
      environment_id: run.environment_id,
      connector_id: run.connector_id,
      action_id: run.action_id,
      canonical_action: run.canonical_action,
      communication_run_id: run.id,
      message: messageFor(run),
      actor: run.actor,
      sdk: "guardianos-communication/1.0",
    }, measured);
  } catch (error) {
    const code = error && error.code || "INTERNAL_ORCHESTRATION_ERROR";
    result = { ok: false, code, error: error && error.message || "Communication failed closed", governance: { status: "blocked" } };
  }
  const patch = decisionPatch(result, run, {
    governance_latency_ms: governanceLatency,
    governance_completed_at: governanceCompletedAt,
    total_latency_ms: elapsed(totalStarted),
    provider_latency_ms: Math.max(0, elapsed(totalStarted) - (governanceLatency || 0)),
  });
  await store.update("communication_runs", run.id, patch);
  return safe(await store.findOne("communication_runs", { id: run.id }));
}

/**
 * Resume a run that Runtime Governance escalated. Nothing is sent until the
 * operator's approval has been re-evaluated by the engine and the proposal has
 * itself reached `executed`; a denial or a post-approval block is terminal and
 * the provider is never reached.
 */
async function reconcileApproval(run, integrationGateway, dependencies = {}) {
  if (!run || run.status !== "awaiting_approval" || !run.proposal_id) return safe(run);
  const proposal = await store.findOne("ops_proposals", { id: run.proposal_id });
  if (!proposal || proposal.org_id !== run.org_id || proposal.environment_id !== run.environment_id) return safe(run);
  const approvalWait = run.governance_completed_at ? Math.max(0, Date.now() - Date.parse(run.governance_completed_at)) : null;
  if (proposal.status === "denied" || proposal.status === "blocked") {
    await store.update("communication_runs", run.id, {
      status: "rejected", lifecycle_state: "complete",
      approval_status: proposal.status === "denied" ? "rejected" : "blocked_after_approval",
      governance_decision: proposal.status, provider_invocation_count: 0, provider_called: false, delivered: false,
      approval_wait_latency_ms: approvalWait,
      safe_failure_reason: proposal.status === "denied"
        ? "Approval rejected; no message was sent"
        : "Runtime Governance blocked execution after approval; no message was sent",
      completed_at: now(), updated_at: now(),
    });
    return safe(await store.findOne("communication_runs", { id: run.id }));
  }
  if (proposal.status !== "executed") return safe(run);
  if (typeof integrationGateway.executeApprovedCommunication !== "function") {
    await store.update("communication_runs", run.id, {
      status: "failed", lifecycle_state: "complete", approval_status: "approved_but_execution_unavailable",
      provider_invocation_count: 0, provider_called: false, approval_wait_latency_ms: approvalWait,
      safe_failure_reason: "internal_orchestration | INTERNAL_ORCHESTRATION_ERROR: Approved continuation is unavailable; failed closed before the provider",
      completed_at: now(), updated_at: now(),
    });
    return safe(await store.findOne("communication_runs", { id: run.id }));
  }
  const locked = await acquireLock(run, "approved-provider");
  if (!locked) return safe(await store.findOne("communication_runs", { id: run.id }));
  const started = performance.now();
  await store.update("communication_runs", run.id, {
    status: "executing", lifecycle_state: "sending", approval_status: "approved",
    approval_wait_latency_ms: approvalWait, updated_at: now(),
  });
  let result;
  try {
    result = await integrationGateway.executeApprovedCommunication({
      org_id: run.org_id, environment_id: run.environment_id, connector_id: run.connector_id,
      action_id: run.action_id, proposal_id: run.proposal_id, message_hash: run.message_hash,
      message: messageFor(run), actor: run.actor,
    }, dependencies);
  } catch (error) {
    const code = error && error.code || "INTERNAL_ORCHESTRATION_ERROR";
    result = { ok: false, code, error: error && error.message || "Approved continuation failed closed", governance: { proposal_id: run.proposal_id, status: proposal.status } };
  }
  const continuation = elapsed(started);
  const patch = decisionPatch(result, run, {
    governance_latency_ms: recorded(run.governance_latency_ms),
    governance_completed_at: run.governance_completed_at,
    total_latency_ms: Number(run.total_latency_ms || 0) + continuation,
    provider_latency_ms: recorded(result && result.provider_latency_ms) ?? continuation,
  });
  patch.approval_status = result && result.ok ? "approved_and_executed" : "approved_execution_failed";
  patch.approval_wait_latency_ms = approvalWait;
  await store.update("communication_runs", run.id, patch);
  return safe(await store.findOne("communication_runs", { id: run.id }));
}

/** Idempotent driver: safe to call repeatedly; never causes a second send. */
async function advanceRun(communication_run_id, org_id, integrationGateway, dependencies = {}) {
  const run = await store.findOne("communication_runs", { id: communication_run_id });
  if (!run || run.org_id !== org_id) return null;
  if (TERMINAL.has(run.status)) return safe(run);
  if (run.status === "awaiting_approval") return reconcileApproval(run, integrationGateway, dependencies);
  if (run.status === "executing") return safe(run);
  return executeRun(run, integrationGateway, dependencies);
}

async function getRun(communication_run_id, org_id) {
  const run = await store.findOne("communication_runs", { id: communication_run_id });
  return run && run.org_id === org_id ? safe(run) : null;
}

async function recentRuns(org_id, environment_id = null, limit = 25) {
  const rows = await store.findOptional("communication_runs", { org_id });
  return rows
    .filter((row) => !environment_id || row.environment_id === environment_id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, Math.max(1, Math.min(100, limit)))
    .map(safe);
}

async function aggregate(org_id, environment_id = null) {
  const rows = (await store.findOptional("communication_runs", { org_id }))
    .filter((row) => !environment_id || row.environment_id === environment_id);
  const today = new Date().toISOString().slice(0, 10);
  const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  const latencies = (field) => rows.map((row) => recorded(row[field])).filter((value) => value != null);
  return {
    requests_today: rows.filter((row) => String(row.created_at).slice(0, 10) === today).length,
    total: rows.length,
    delivered: rows.filter((row) => row.delivered).length,
    drafted: rows.filter((row) => row.status === "completed" && !row.delivers).length,
    blocked: rows.filter((row) => row.status === "blocked").length,
    awaiting_approval: rows.filter((row) => row.status === "awaiting_approval").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
    failed: rows.filter((row) => row.status === "failed").length,
    provider_invocations: rows.reduce((sum, row) => sum + Number(row.provider_invocation_count || 0), 0),
    avg_total_latency_ms: average(latencies("total_latency_ms")),
    avg_governance_latency_ms: average(latencies("governance_latency_ms")),
    avg_provider_latency_ms: average(latencies("provider_latency_ms")),
  };
}

module.exports = {
  TERMINAL, canonicalAction, createRun, advanceRun, executeRun, reconcileApproval,
  getRun, recentRuns, aggregate, safe, classifyFailure,
};

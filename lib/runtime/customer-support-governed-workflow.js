"use strict";

const { performance } = require("node:perf_hooks");
const store = require("./store");
const base = require("./customer-support-workflow");
const bedrockRuns = require("./bedrock-invocation-runs");

const TERMINAL = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);
const now = () => store.nowISO();
const elapsed = (started) => Math.max(0, Math.round(performance.now() - started));
const hash = (value) => store.sha256(typeof value === "string" ? value : JSON.stringify(value));
const recorded = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

async function phaseLock(run, phase) {
  try {
    await store.insert("customer_support_workflow_locks", {
      id: `cswl_${hash(`${run.id}:${phase}`).slice(0, 24)}`,
      org_id: run.org_id,
      environment_id: run.environment_id,
      workflow_run_id: `${run.id}:${phase}`,
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

function proposalStatus(proposal) {
  if (!proposal) return "unavailable";
  if (proposal.status === "executed" && proposal.execution && proposal.execution.executed === true) return "executed";
  return proposal.status || "blocked";
}

function workflowTotalLatency(run, providerRun = null) {
  const startedAt = Date.parse(run.execution_started_at || run.created_at || "");
  const wall = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : null;
  const attributed = [
    recorded(run.governance_latency_ms),
    recorded(providerRun && (providerRun.governance_evaluation_latency_ms ?? providerRun.governance_latency_ms)),
    recorded(providerRun && providerRun.provider_latency_ms),
    recorded(providerRun && providerRun.approval_wait_latency_ms),
  ].filter((value) => value != null).reduce((sum, value) => sum + value, 0);
  return Math.max(wall || 0, recorded(providerRun && providerRun.total_latency_ms) || 0, attributed);
}

async function createCanonicalProposal(run, integrationGateway, dependencies) {
  const locked = await phaseLock(run, "canonical-proposal");
  if (!locked) return store.findOne("customer_support_workflow_runs", { id: run.id });
  const started = performance.now();
  const executionStartedAt = now();
  await store.update("customer_support_workflow_runs", run.id, {
    status: "evaluating",
    lifecycle_state: "creating_proposal",
    governance_started_at: executionStartedAt,
    execution_started_at: executionStartedAt,
    updated_at: now(),
  });
  let proposal;
  try {
    const govern = dependencies.governed || integrationGateway.governed;
    proposal = await govern("customer_support_assistant.respond", {
      org_id: run.org_id,
      environment_id: run.environment_id,
      actor: "customer_support_assistant",
      params: {
        canonical_action: run.canonical_action,
        canonical_action_hash: run.canonical_action_hash,
        workflow_run_id: run.id,
        connector_id: run.connector_id,
        model_id: run.model_id,
        flags: run.canonical_action && run.canonical_action.flags || {},
      },
    });
  } catch (error) {
    await store.update("customer_support_workflow_runs", run.id, {
      status: "blocked",
      lifecycle_state: "complete",
      governance_decision: "unavailable",
      approval_status: "not_approved",
      safe_failure_reason: "Runtime Governance unavailable; workflow failed closed before Amazon Bedrock",
      governance_latency_ms: elapsed(started),
      governance_completed_at: now(),
      completed_at: now(),
      updated_at: now(),
    });
    return store.findOne("customer_support_workflow_runs", { id: run.id });
  }
  const status = proposalStatus(proposal);
  const patch = {
    proposal_id: proposal.id,
    governance_decision: status,
    governance_latency_ms: elapsed(started),
    governance_completed_at: now(),
    lifecycle_state: "decision_received",
    approval_status: status === "escalated" ? "pending" : status === "executed" ? "not_required_or_approved" : "not_approved",
    updated_at: now(),
  };
  if (status === "escalated") Object.assign(patch, { status: "awaiting_approval", lifecycle_state: "awaiting_approval" });
  else if (status !== "executed") Object.assign(patch, { status: "blocked", lifecycle_state: "complete", completed_at: now(), safe_failure_reason: "Canonical customer support action was not permitted" });
  else Object.assign(patch, { status: "evaluating" });
  await store.update("customer_support_workflow_runs", run.id, patch);
  return store.findOne("customer_support_workflow_runs", { id: run.id });
}

async function canonicalDecision(run) {
  if (!run.proposal_id) return run;
  const proposal = await store.findOne("ops_proposals", { id: run.proposal_id });
  if (!proposal || proposal.org_id !== run.org_id || proposal.environment_id !== run.environment_id) return run;
  const status = proposalStatus(proposal);
  if (status === "executed") {
    await store.update("customer_support_workflow_runs", run.id, { status: "evaluating", lifecycle_state: "decision_received", governance_decision: "executed", approval_status: proposal.approval_id ? "approved" : "not_required_or_approved", updated_at: now() });
  } else if (["denied", "blocked"].includes(status)) {
    await store.update("customer_support_workflow_runs", run.id, { status: "rejected", lifecycle_state: "complete", governance_decision: status, approval_status: status === "denied" ? "rejected" : "blocked", safe_failure_reason: "Canonical customer support action was not approved", completed_at: now(), updated_at: now() });
  }
  return store.findOne("customer_support_workflow_runs", { id: run.id });
}

async function recordEvidence(run, providerRun = null) {
  return store.insert("integration_events", {
    org_id: run.org_id,
    environment_id: run.environment_id,
    type: "customer_support.workflow.execution",
    actor: "customer_support_assistant",
    immutable: true,
    occurred_at: now(),
    evidence: {
      workflow: base.WORKFLOW,
      workflow_run_id: run.id,
      canonical_action_hash: run.canonical_action_hash,
      proposal_id: run.proposal_id || null,
      provider_proposal_id: providerRun && providerRun.proposal_id || null,
      governance_decision: run.governance_decision,
      execution_status: providerRun ? providerRun.status : run.status,
      approval_status: run.approval_status,
      provider: "amazon-bedrock",
      connector_id: run.connector_id,
      connector_name: run.connector_name,
      model_id: run.model_id,
      org_id: run.org_id,
      environment_id: run.environment_id,
      total_latency_ms: workflowTotalLatency(run, providerRun),
      canonical_governance_latency_ms: recorded(run.governance_latency_ms),
      provider_governance_latency_ms: recorded(providerRun && (providerRun.governance_evaluation_latency_ms ?? providerRun.governance_latency_ms)),
      provider_latency_ms: recorded(providerRun && providerRun.provider_latency_ms),
      provider_invocation_count: Number(providerRun && providerRun.provider_invocation_count || 0),
      aws_called: !!(providerRun && providerRun.aws_called),
      underlying_evidence_id: providerRun && providerRun.evidence_id || null,
      completed_at: providerRun && providerRun.completed_at || run.completed_at || null,
    },
    evidence_hash: hash({ workflow_run_id: run.id, proposal_id: run.proposal_id || null, provider_proposal_id: providerRun && providerRun.proposal_id || null, status: providerRun ? providerRun.status : run.status, completed_at: providerRun && providerRun.completed_at || run.completed_at || null }),
  });
}

async function finaliseTerminalEvidence(run, providerRun = null) {
  if (!run || !TERMINAL.has(providerRun ? providerRun.status : run.status) || run.workflow_evidence_recorded) return run;
  const locked = await phaseLock(run, "workflow-evidence");
  if (!locked) return store.findOne("customer_support_workflow_runs", { id: run.id });
  const evidence = await recordEvidence(run, providerRun);
  const providerEvidenceCount = Number(providerRun && providerRun.evidence_count || 0);
  await store.update("customer_support_workflow_runs", run.id, {
    evidence_id: evidence.id,
    underlying_evidence_id: providerRun && providerRun.evidence_id || run.underlying_evidence_id || null,
    evidence_count: providerEvidenceCount + 1,
    workflow_evidence_recorded: true,
    total_latency_ms: workflowTotalLatency(run, providerRun),
    updated_at: now(),
  });
  return store.findOne("customer_support_workflow_runs", { id: run.id });
}

async function advanceExecution(workflow_run_id, org_id, integrationGateway, dependencies = {}) {
  let run = await store.findOne("customer_support_workflow_runs", { id: workflow_run_id });
  if (!run || run.org_id !== org_id) return base.safe(run);
  if (TERMINAL.has(run.status)) return base.safe(await finaliseTerminalEvidence(run));
  if (!run.proposal_id) run = await createCanonicalProposal(run, integrationGateway, dependencies);
  if (run.status === "awaiting_approval") run = await canonicalDecision(run);
  if (TERMINAL.has(run.status)) return base.safe(await finaliseTerminalEvidence(run));
  if (run.status === "awaiting_approval") return base.safe(run);

  if (!run.bedrock_run_id) {
    const locked = await phaseLock(run, "provider");
    if (!locked) return base.safe(await store.findOne("customer_support_workflow_runs", { id: run.id }));
    const created = await bedrockRuns.createRuns({
      org_id: run.org_id,
      environment_id: run.environment_id,
      connector_id: run.connector_id,
      model_id: run.model_id,
      prompt: base.promptFromCanonical(run.canonical_action),
      system_instruction: "Operate only as the governed Customer Support Assistant. Produce a customer-facing response; do not execute external business actions.",
      max_output_tokens: 700,
      actor: "customer_support_assistant",
      idempotency_key: `customer-support-provider:${run.id}`,
      persist_content: false,
    });
    await store.update("customer_support_workflow_runs", run.id, { bedrock_run_id: created.runs[0].id, bedrock_batch_id: created.batch_id, lifecycle_state: "runtime_governance_evaluating", updated_at: now() });
    run = await store.findOne("customer_support_workflow_runs", { id: run.id });
  }

  const rows = await bedrockRuns.advanceBatch(run.bedrock_batch_id, run.org_id, integrationGateway, dependencies);
  const providerRun = rows.find((item) => item.id === run.bedrock_run_id) || rows[0];
  if (!providerRun) return base.safe(run);
  const canonicalLatency = recorded(run.governance_latency_ms) || 0;
  const providerGovernance = recorded(providerRun.governance_evaluation_latency_ms ?? providerRun.governance_latency_ms) || 0;
  await store.update("customer_support_workflow_runs", run.id, {
    status: providerRun.status,
    lifecycle_state: providerRun.lifecycle_state,
    provider_proposal_id: providerRun.proposal_id || null,
    provider_invocation_count: Number(providerRun.provider_invocation_count || 0),
    aws_called: !!providerRun.aws_called,
    response_content: providerRun.response_content,
    response_hash: providerRun.response_hash || null,
    safe_failure_reason: providerRun.safe_failure_reason || null,
    total_latency_ms: workflowTotalLatency(run, providerRun),
    governance_latency_ms: canonicalLatency + providerGovernance,
    provider_latency_ms: providerRun.provider_latency_ms,
    approval_wait_latency_ms: providerRun.approval_wait_latency_ms,
    underlying_evidence_id: providerRun.evidence_id || null,
    completed_at: TERMINAL.has(providerRun.status) ? (providerRun.completed_at || now()) : null,
    updated_at: now(),
  });
  run = await store.findOne("customer_support_workflow_runs", { id: run.id });
  if (TERMINAL.has(providerRun.status)) run = await finaliseTerminalEvidence(run, providerRun);
  return base.safe(run);
}

module.exports = { ...base, advanceExecution };
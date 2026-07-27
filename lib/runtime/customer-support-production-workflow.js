"use strict";

const store = require("./store");
const governed = require("./customer-support-governed-workflow");

const TERMINAL = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);
const now = () => store.nowISO();
const hash = (value) => store.sha256(typeof value === "string" ? value : JSON.stringify(value));

async function evidenceLock(run) {
  try {
    await store.insert("customer_support_workflow_locks", {
      id: `cswl_${hash(`${run.id}:final-evidence`).slice(0, 24)}`,
      org_id: run.org_id,
      environment_id: run.environment_id,
      workflow_run_id: `${run.id}:final-evidence`,
      idempotency_key: `${run.idempotency_key}:final-evidence`,
      acquired_at: now(),
    });
    return true;
  } catch (error) {
    if (error && error.code === "23505") return false;
    if (/duplicate|unique|already exists|23505/i.test(String(error && error.message || error))) return false;
    throw error;
  }
}

async function ensureTerminalEvidence(run) {
  if (!run || !TERMINAL.has(run.status) || run.workflow_evidence_recorded) return run;
  if (!(await evidenceLock(run))) return store.findOne("customer_support_workflow_runs", { id: run.id });
  const evidence = await store.insert("integration_events", {
    org_id: run.org_id,
    environment_id: run.environment_id,
    type: "customer_support.workflow.execution",
    actor: "customer_support_assistant",
    immutable: true,
    occurred_at: now(),
    evidence: {
      workflow: governed.WORKFLOW,
      workflow_run_id: run.id,
      canonical_action_hash: run.canonical_action_hash,
      proposal_id: run.proposal_id || null,
      provider_proposal_id: run.provider_proposal_id || null,
      governance_decision: run.governance_decision || run.status,
      execution_status: run.status,
      approval_status: run.approval_status || null,
      provider: "amazon-bedrock",
      connector_id: run.connector_id,
      connector_name: run.connector_name,
      model_id: run.model_id,
      org_id: run.org_id,
      environment_id: run.environment_id,
      total_latency_ms: run.total_latency_ms,
      governance_latency_ms: run.governance_latency_ms,
      provider_latency_ms: run.provider_latency_ms,
      provider_invocation_count: Number(run.provider_invocation_count || 0),
      aws_called: !!run.aws_called,
      underlying_evidence_id: run.underlying_evidence_id || null,
      completed_at: run.completed_at || now(),
    },
    evidence_hash: hash({ workflow_run_id: run.id, proposal_id: run.proposal_id, status: run.status, completed_at: run.completed_at }),
  });
  await store.update("customer_support_workflow_runs", run.id, {
    evidence_id: evidence.id,
    evidence_count: Number(run.evidence_count || 0) + 1,
    workflow_evidence_recorded: true,
    updated_at: now(),
  });
  return store.findOne("customer_support_workflow_runs", { id: run.id });
}

async function advanceExecution(workflow_run_id, org_id, integrationGateway, dependencies = {}) {
  let run = await governed.advanceExecution(workflow_run_id, org_id, integrationGateway, dependencies);
  if (!run) return null;
  if (run.provider_invocation_count > 0 && run.total_latency_ms != null) {
    const providerGovernance = Math.max(0, Number(run.governance_latency_ms || 0));
    const providerTotal = Number(run.total_latency_ms || 0);
    const minimumEndToEnd = providerGovernance + Number(run.provider_latency_ms || 0);
    if (providerTotal < minimumEndToEnd) {
      await store.update("customer_support_workflow_runs", run.id, { total_latency_ms: minimumEndToEnd, updated_at: now() });
      run = await store.findOne("customer_support_workflow_runs", { id: run.id });
    }
  }
  run = await ensureTerminalEvidence(run);
  return governed.safe(run);
}

module.exports = { ...governed, advanceExecution };

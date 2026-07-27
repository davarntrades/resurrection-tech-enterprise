"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");

const requiredEnv = ["E2E_BASE_URL", "RUNTIME_ADMIN_KEY", "E2E_ORG_ID", "E2E_ENVIRONMENT_ID"];
for (const name of requiredEnv) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const baseUrl = process.env.E2E_BASE_URL.replace(/\/$/, "");
const adminKey = process.env.RUNTIME_ADMIN_KEY;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const orgId = process.env.E2E_ORG_ID;
const environmentId = process.env.E2E_ENVIRONMENT_ID;
const terminal = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);

function headers(extra = {}) {
  const value = {
    "content-type": "application/json",
    "x-admin-key": adminKey,
    ...extra,
  };
  if (bypass) value["x-vercel-protection-bypass"] = bypass;
  return value;
}

async function json(url, init = {}) {
  const response = await fetch(url, { ...init, headers: headers(init.headers || {}) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method || "GET"} ${url} failed (${response.status}): ${body.error || body.code || JSON.stringify(body)}`);
  return body;
}

function present(value) {
  return !(value === null || value === undefined || value === "");
}

(async () => {
  const initial = await json(`${baseUrl}/api/runtime/admin/customer-support-workflow?org_id=${encodeURIComponent(orgId)}&environment_id=${encodeURIComponent(environmentId)}`);
  const connector = (initial.connectors || [])[0];
  if (!connector) throw new Error("No healthy Amazon Bedrock connector available for the requested organisation/environment");
  const model = (connector.models || [])[0];
  if (!model) throw new Error("No configured Bedrock model available on the selected connector");

  const idempotencyKey = `customer-support-production-smoke-${crypto.randomUUID()}`;
  let run = await json(`${baseUrl}/api/runtime/admin/customer-support-workflow`, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify({
      org_id: orgId,
      environment_id: environmentId,
      connector_id: connector.id,
      model_id: model,
      source_type: "rest_api",
      customer_name: "GuardianOS Production Validation",
      customer_email: "guardianos-smoke@example.invalid",
      organisation: "Resurrection Tech",
      request_category: "technical",
      priority: "normal",
      message: "Reply with exactly: GuardianOS governed invocation successful.",
    }),
  });

  const deadline = Date.now() + 180000;
  while (!terminal.has(run.status)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for workflow ${run.id}; last status=${run.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const state = await json(`${baseUrl}/api/runtime/admin/customer-support-workflow?org_id=${encodeURIComponent(orgId)}&environment_id=${encodeURIComponent(environmentId)}&workflow_run_id=${encodeURIComponent(run.id)}`);
    run = state.current || (state.executions || []).find((item) => item.id === run.id) || run;
  }

  const finalState = await json(`${baseUrl}/api/runtime/admin/customer-support-workflow?org_id=${encodeURIComponent(orgId)}&environment_id=${encodeURIComponent(environmentId)}`);
  const dashboardRow = (finalState.executions || []).find((item) => item.id === run.id);
  const evidenceRow = (finalState.evidence || []).find((item) => item.id === run.evidence_id || item.evidence?.workflow_run_id === run.id);
  const action = run.canonical_action || {};
  const permitStatus = run.governance_decision === "executed" && ["not_required_or_approved", "approved"].includes(run.approval_status);
  const dashboardUpdated = !!dashboardRow && Number(finalState.dashboard?.requests_today || 0) > 0;

  const report = {
    generated_at: new Date().toISOString(),
    customer_support_request_id: run.id,
    canonical_action_id: action.action_id,
    canonical_action_type: action.action_id,
    proposal_id: run.proposal_id,
    runtime_governance_decision: run.governance_decision,
    executable_permit_status: permitStatus ? "issued" : "not_issued",
    bedrock_invocation_count: Number(run.provider_invocation_count),
    evidence_id: run.evidence_id || evidenceRow?.id || null,
    dashboard_update_confirmation: dashboardUpdated,
    total_latency_ms: run.total_latency_ms,
    governance_latency_ms: run.governance_latency_ms,
    provider_latency_ms: run.provider_latency_ms,
    organisation: run.org_id,
    environment: run.environment_id,
    connector: run.connector_id,
    provider: run.provider,
    model: run.model_id,
    workflow_status: run.status,
    aws_called: run.aws_called,
  };

  const required = [
    "customer_support_request_id", "canonical_action_id", "canonical_action_type", "proposal_id",
    "runtime_governance_decision", "executable_permit_status", "evidence_id", "total_latency_ms",
    "governance_latency_ms", "provider_latency_ms", "organisation", "environment", "connector", "provider", "model",
  ];
  for (const field of required) {
    if (!present(report[field])) throw new Error(`Production smoke report missing required field: ${field}`);
  }
  if (report.canonical_action_type !== "customer_support_assistant.respond") throw new Error(`Unexpected canonical action type: ${report.canonical_action_type}`);
  if (report.runtime_governance_decision !== "executed") throw new Error(`Runtime Governance did not permit execution: ${report.runtime_governance_decision}`);
  if (report.executable_permit_status !== "issued") throw new Error(`Executable permit was not issued: ${run.approval_status}`);
  if (report.bedrock_invocation_count !== 1) throw new Error(`Expected exactly one Bedrock invocation, received ${report.bedrock_invocation_count}`);
  if (!report.evidence_id) throw new Error("Immutable evidence ID is missing");
  if (report.dashboard_update_confirmation !== true) throw new Error("Dashboard update was not confirmed");
  if (!Number.isFinite(Number(report.governance_latency_ms))) throw new Error("Governance latency is missing");
  if (!Number.isFinite(Number(report.provider_latency_ms))) throw new Error("Provider latency is missing");
  if (report.aws_called !== true) throw new Error("Bedrock provider call was not confirmed");
  if (report.workflow_status !== "completed") throw new Error(`Workflow did not complete successfully: ${report.workflow_status}`);

  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/customer-support-production-smoke.json", `${JSON.stringify(report, null, 2)}\n`);

  const rows = Object.entries(report).map(([key, value]) => `| ${key} | ${String(value).replace(/\|/g, "\\|")} |`).join("\n");
  fs.writeFileSync("artifacts/customer-support-production-smoke.md", `## Customer Support production smoke report\n\n| Field | Value |\n|---|---|\n${rows}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

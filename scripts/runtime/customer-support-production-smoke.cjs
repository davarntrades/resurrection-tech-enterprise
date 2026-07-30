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

  // Production default is unchanged; the override exists so the reporter's own
  // contract tests can exercise a non-terminal run without a 3-minute wait.
  const timeoutMs = Number(process.env.CUSTOMER_SUPPORT_SMOKE_TIMEOUT_MS || 180000);
  const deadline = Date.now() + (Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 180000);
  let timedOut = false;
  while (!terminal.has(run.status)) {
    if (Date.now() > deadline) {
      // Fall through to reporting rather than throwing: a run parked awaiting
      // approval is a governance outcome an operator needs recorded, and the
      // assertions below still fail the workflow.
      timedOut = true;
      break;
    }
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
  // A provider execution is what makes provider latency meaningful. When
  // Runtime Governance withheld the permit, Amazon Bedrock was never called, so
  // a null provider_latency_ms is the CORRECT record of a fail-closed run — not
  // a missing field. The permitted path below still demands it.
  const providerExecuted = Number(run.provider_invocation_count || 0) > 0 || run.aws_called === true;

  const report = {
    generated_at: new Date().toISOString(),
    customer_support_request_id: run.id,
    canonical_action_id: action.action_id,
    canonical_action_type: action.action_id,
    proposal_id: run.proposal_id,
    runtime_governance_decision: run.governance_decision,
    runtime_governance_evaluated: present(run.proposal_id) && present(run.governance_decision),
    executable_permit_status: permitStatus ? "issued" : "not_issued",
    approval_status: run.approval_status,
    bedrock_invocation_count: Number(run.provider_invocation_count || 0),
    aws_called: run.aws_called,
    provider_executed: providerExecuted,
    safe_failure_reason: run.safe_failure_reason || null,
    evidence_id: run.evidence_id || evidenceRow?.id || null,
    evidence_count: Number(run.evidence_count || 0),
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
    lifecycle_state: run.lifecycle_state,
  };

  // ── Outcome first ────────────────────────────────────────────────────────
  // Report what the governed workflow actually did before asserting what it
  // was required to do, so a blocked run surfaces its governance decision and
  // safe failure reason instead of a misleading missing-field error.
  const outcome = permitStatus && run.status === "completed" ? "permitted"
    : ["blocked", "rejected"].includes(run.status) || ["blocked", "denied", "unavailable"].includes(String(run.governance_decision)) ? "blocked"
      : run.status === "awaiting_approval" || run.governance_decision === "escalated" ? "escalated"
        : "incomplete";
  report.production_smoke_outcome = outcome;
  report.reached_terminal_state = !timedOut;

  // Fields every governed outcome must record, permitted or fail-closed.
  const required = [
    "customer_support_request_id", "canonical_action_id", "canonical_action_type", "proposal_id",
    "runtime_governance_decision", "executable_permit_status", "evidence_id", "total_latency_ms",
    "governance_latency_ms", "organisation", "environment", "connector", "provider", "model", "workflow_status",
  ];
  // Provider latency is mandatory only once a provider execution occurred.
  if (providerExecuted) required.push("provider_latency_ms");

  const failures = [];
  if (timedOut) failures.push(`Timed out waiting for workflow ${run.id} to reach a terminal state; last status=${run.status}`);
  for (const field of required) {
    if (!present(report[field])) failures.push(`Production smoke report missing required field: ${field}`);
  }
  if (report.canonical_action_type !== "customer_support_assistant.respond") failures.push(`Unexpected canonical action type: ${report.canonical_action_type}`);
  if (report.runtime_governance_evaluated !== true) failures.push("Runtime Governance did not evaluate the canonical customer support action");
  if (report.runtime_governance_decision !== "executed") failures.push(`Runtime Governance did not permit execution: ${report.runtime_governance_decision}`);
  if (report.executable_permit_status !== "issued") failures.push(`Executable permit was not issued (approval_status=${run.approval_status})`);
  // Hard invariants — an executable permit must produce exactly one governed
  // Amazon Bedrock invocation with recorded provider latency, and nothing else.
  if (report.bedrock_invocation_count !== 1) failures.push(`Expected exactly one Bedrock invocation, received ${report.bedrock_invocation_count}`);
  if (report.aws_called !== true) failures.push("Bedrock provider call was not confirmed");
  if (!report.evidence_id) failures.push("Immutable evidence ID is missing");
  if (report.dashboard_update_confirmation !== true) failures.push("Dashboard update was not confirmed");
  if (!Number.isFinite(Number(report.governance_latency_ms))) failures.push("Governance latency is missing");
  if (!Number.isFinite(Number(report.total_latency_ms))) failures.push("Total latency is missing");
  if (outcome === "permitted" && !Number.isFinite(Number(report.provider_latency_ms))) failures.push("Provider latency is missing for a permitted provider execution");
  if (report.workflow_status !== "completed") failures.push(`Workflow did not complete successfully: ${report.workflow_status}`);

  report.production_smoke_result = failures.length === 0 ? "passed" : "failed";
  report.failures = failures;

  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/customer-support-production-smoke.json", `${JSON.stringify(report, null, 2)}\n`);

  const cell = (value) => String(value).replace(/\|/g, "\\|");
  const rows = Object.entries(report)
    .filter(([key]) => key !== "failures")
    .map(([key, value]) => `| ${key} | ${cell(value)} |`).join("\n");
  const heading = outcome === "permitted" && failures.length === 0
    ? "Customer Support production smoke report — PERMITTED"
    : `Customer Support production smoke report — ${outcome.toUpperCase()} (required permitted smoke NOT achieved)`;
  const blockedSummary = outcome === "permitted" ? "" : [
    "",
    `**Runtime Governance decision:** ${report.runtime_governance_decision}`,
    `**Safe failure reason:** ${report.safe_failure_reason || "not recorded"}`,
    `**Bedrock invocation count:** ${report.bedrock_invocation_count}`,
    `**aws_called:** ${report.aws_called}`,
    `**Evidence ID:** ${report.evidence_id || "not recorded"}`,
    `**Governance latency (ms):** ${report.governance_latency_ms}`,
    `**Provider latency (ms):** ${providerExecuted ? report.provider_latency_ms : "not applicable — no provider execution occurred"}`,
    "",
  ].join("\n");
  const failureList = failures.length ? `\n### Unmet production requirements\n\n${failures.map((item) => `- ${item}`).join("\n")}\n` : "";
  fs.writeFileSync(
    "artifacts/customer-support-production-smoke.md",
    `## ${heading}\n${blockedSummary}\n| Field | Value |\n|---|---|\n${rows}\n${failureList}`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (failures.length) {
    console.error(`\nProduction smoke outcome: ${outcome}`);
    if (outcome !== "permitted") {
      console.error(`Runtime Governance decision: ${report.runtime_governance_decision}`);
      console.error(`Safe failure reason: ${report.safe_failure_reason || "not recorded"}`);
      console.error(`Bedrock invocation count: ${report.bedrock_invocation_count}`);
      console.error(`aws_called: ${report.aws_called}`);
      console.error(`Evidence ID: ${report.evidence_id || "not recorded"}`);
      console.error(`Governance latency (ms): ${report.governance_latency_ms}`);
      console.error(`Provider latency (ms): ${providerExecuted ? report.provider_latency_ms : "not applicable — no provider execution occurred"}`);
    }
    for (const item of failures) console.error(`- ${item}`);
    throw new Error(`Required permitted production smoke was not achieved (outcome=${outcome}; ${failures.length} unmet requirement${failures.length === 1 ? "" : "s"})`);
  }
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

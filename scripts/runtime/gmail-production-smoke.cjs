"use strict";

/* Governed Gmail production smoke.
 *
 * Proves the whole chain against the deployed platform:
 *
 *   business request → canonical action → proposal → Runtime Governance
 *     → permit → Gmail API → email delivered → immutable evidence
 *
 * Outbound email is deny-by-default (ops_unauthorized_report_delivery), so the
 * permit is reached the way production reaches it: the run escalates, an
 * operator approval is recorded, the engine RE-EVALUATES with the authorisation
 * flag, and only then is the message sent. A run that reaches the provider
 * without that chain is a failure, not a pass. */

const fs = require("node:fs");
const crypto = require("node:crypto");

const requiredEnv = ["E2E_BASE_URL", "RUNTIME_ADMIN_KEY", "E2E_ORG_ID", "E2E_ENVIRONMENT_ID", "GMAIL_SMOKE_RECIPIENT"];
for (const name of requiredEnv) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const baseUrl = process.env.E2E_BASE_URL.replace(/\/$/, "");
const adminKey = process.env.RUNTIME_ADMIN_KEY;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const orgId = process.env.E2E_ORG_ID;
const environmentId = process.env.E2E_ENVIRONMENT_ID;
const recipient = process.env.GMAIL_SMOKE_RECIPIENT;
const actionId = process.env.GMAIL_SMOKE_ACTION || "gmail.send_email";
const terminal = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);
const timeoutMs = Number(process.env.GMAIL_SMOKE_TIMEOUT_MS || 180000);

function headers(extra = {}) {
  const value = { "content-type": "application/json", "x-admin-key": adminKey, ...extra };
  if (bypass) value["x-vercel-protection-bypass"] = bypass;
  return value;
}

async function json(url, init = {}) {
  const response = await fetch(url, { ...init, headers: headers(init.headers || {}) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method || "GET"} ${url} failed (${response.status}): ${body.error || body.code || JSON.stringify(body)}`);
  return body;
}

const present = (value) => !(value === null || value === undefined || value === "");
const query = (extra = "") => `${baseUrl}/api/runtime/admin/communication?org_id=${encodeURIComponent(orgId)}&environment_id=${encodeURIComponent(environmentId)}${extra}`;

(async () => {
  const initial = await json(query());
  const connector = (initial.connectors || []).find((item) => item.type === "gmail");
  if (!connector) throw new Error("No healthy Gmail connector available for the requested organisation/environment");
  const dispatchable = (initial.actions || []).map((item) => item.action_id);
  if (!dispatchable.includes(actionId)) throw new Error(`${actionId} is not a dispatchable governed communication action`);

  const idempotencyKey = `gmail-production-smoke-${crypto.randomUUID()}`;
  const marker = `GuardianOS governed delivery ${idempotencyKey}`;
  let run = await json(`${baseUrl}/api/runtime/admin/communication`, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify({
      org_id: orgId,
      environment_id: environmentId,
      connector_id: connector.id,
      action_id: actionId,
      source_type: "rest_api",
      message: {
        to: [recipient],
        subject: "GuardianOS governed production smoke",
        body: `${marker}\n\nThis message was sent only after Runtime Governance issued an executable permit.`,
      },
    }),
  });

  const deadline = Date.now() + (Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 180000);
  let approvalRequested = false;
  let approvedAt = null;
  let timedOut = false;
  while (!terminal.has(run.status)) {
    if (Date.now() > deadline) { timedOut = true; break; }
    // Deny-by-default: the engine escalates the send. Record the operator
    // approval, which is re-evaluated by the engine before anything is sent.
    if (run.status === "awaiting_approval" && run.proposal_id && !approvalRequested) {
      approvalRequested = true;
      await json(`${baseUrl}/api/ops/proposals`, {
        method: "POST",
        body: JSON.stringify({ id: run.proposal_id, decision: "approve", note: "governed production smoke — authorised outbound delivery" }),
      });
      approvedAt = new Date().toISOString();
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const state = await json(query(`&communication_run_id=${encodeURIComponent(run.id)}`));
    run = state.current || (state.executions || []).find((item) => item.id === run.id) || run;
  }

  const finalState = await json(query());
  const dashboardRow = (finalState.executions || []).find((item) => item.id === run.id);
  const action = run.canonical_action || {};
  const delivers = action.delivers !== false;
  const providerExecuted = Number(run.provider_invocation_count || 0) > 0 || run.provider_called === true;
  const permitted = run.governance_decision === "executed"
    && ["approved_and_executed", "not_required_or_approved", "approved"].includes(run.approval_status);

  const report = {
    generated_at: new Date().toISOString(),
    communication_run_id: run.id,
    canonical_action_id: action.action_id,
    canonical_action_type: action.action_id,
    channel: run.channel,
    provider: run.provider,
    operation: run.operation,
    delivers,
    proposal_id: run.proposal_id,
    runtime_governance_evaluated: present(run.proposal_id) && present(run.governance_decision),
    runtime_governance_decision: run.governance_decision,
    governance_verdict: run.governance_verdict,
    governance_rule: run.governance_rule,
    executable_permit_status: permitted ? "issued" : "not_issued",
    approval_required: approvalRequested,
    approval_status: run.approval_status,
    approved_at: approvedAt,
    provider_invocation_count: Number(run.provider_invocation_count || 0),
    provider_called: run.provider_called,
    email_delivered: run.delivered,
    gmail_message_id: run.message_id,
    gmail_thread_id: run.thread_id_result,
    gmail_draft_id: run.draft_id,
    recipient_count: Number(run.recipient_count || 0),
    message_hash: run.message_hash,
    safe_failure_reason: run.safe_failure_reason || null,
    evidence_id: run.evidence_id,
    evidence_count: Number(run.evidence_count || 0),
    dashboard_update_confirmation: !!dashboardRow && Number(finalState.dashboard?.total || 0) > 0,
    total_latency_ms: run.total_latency_ms,
    governance_latency_ms: run.governance_latency_ms,
    provider_latency_ms: run.provider_latency_ms,
    approval_wait_latency_ms: run.approval_wait_latency_ms,
    organisation: run.org_id,
    environment: run.environment_id,
    connector: run.connector_id,
    workflow_status: run.status,
    lifecycle_state: run.lifecycle_state,
    reached_terminal_state: !timedOut,
  };

  const outcome = permitted && run.status === "completed" ? "permitted"
    : ["blocked", "rejected"].includes(run.status) || ["blocked", "denied", "unavailable"].includes(String(run.governance_decision)) ? "blocked"
      : run.status === "awaiting_approval" ? "escalated" : "incomplete";
  report.production_smoke_outcome = outcome;

  const required = [
    "communication_run_id", "canonical_action_id", "canonical_action_type", "channel", "provider",
    "proposal_id", "runtime_governance_decision", "executable_permit_status", "evidence_id",
    "total_latency_ms", "governance_latency_ms", "organisation", "environment", "connector", "workflow_status",
  ];
  // Provider latency is meaningful only once the provider actually ran; a
  // fail-closed run correctly records null and must not be reported as missing.
  if (providerExecuted) required.push("provider_latency_ms");
  if (delivers && providerExecuted) required.push("gmail_message_id");

  const failures = [];
  if (timedOut) failures.push(`Timed out waiting for communication run ${run.id}; last status=${run.status}`);
  for (const field of required) {
    if (!present(report[field])) failures.push(`Production smoke report missing required field: ${field}`);
  }
  if (!dispatchable.includes(report.canonical_action_type)) failures.push(`Unexpected canonical action type: ${report.canonical_action_type}`);
  if (report.runtime_governance_evaluated !== true) failures.push("Runtime Governance did not evaluate the canonical communication action");
  if (report.runtime_governance_decision !== "executed") failures.push(`Runtime Governance did not permit execution: ${report.runtime_governance_decision}`);
  if (report.executable_permit_status !== "issued") failures.push(`Executable permit was not issued (approval_status=${run.approval_status})`);
  // Hard invariants: exactly one provider call, and for a delivering action a
  // real Gmail message id — never more than one message from one request.
  if (report.provider_invocation_count !== 1) failures.push(`Expected exactly one Gmail provider invocation, received ${report.provider_invocation_count}`);
  if (report.provider_called !== true) failures.push("Gmail provider call was not confirmed");
  if (delivers && report.email_delivered !== true) failures.push("Email delivery was not confirmed");
  if (delivers && !report.gmail_message_id) failures.push("Gmail message ID is missing");
  if (!report.evidence_id) failures.push("Immutable evidence ID is missing");
  if (report.dashboard_update_confirmation !== true) failures.push("Dashboard update was not confirmed");
  if (!Number.isFinite(Number(report.governance_latency_ms))) failures.push("Governance latency is missing");
  if (!Number.isFinite(Number(report.total_latency_ms))) failures.push("Total latency is missing");
  if (outcome === "permitted" && !Number.isFinite(Number(report.provider_latency_ms))) failures.push("Provider latency is missing for a permitted provider execution");
  if (report.workflow_status !== "completed") failures.push(`Communication run did not complete successfully: ${report.workflow_status}`);

  report.production_smoke_result = failures.length === 0 ? "passed" : "failed";
  report.failures = failures;

  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/gmail-production-smoke.json", `${JSON.stringify(report, null, 2)}\n`);

  const cell = (value) => String(value).replace(/\|/g, "\\|");
  const rows = Object.entries(report).filter(([key]) => key !== "failures")
    .map(([key, value]) => `| ${key} | ${cell(value)} |`).join("\n");
  const heading = failures.length === 0
    ? "Gmail governed production smoke — PERMITTED AND DELIVERED"
    : `Gmail governed production smoke — ${outcome.toUpperCase()} (required governed delivery NOT achieved)`;
  const summary = failures.length === 0 ? "" : [
    "",
    `**Runtime Governance decision:** ${report.runtime_governance_decision}`,
    `**Governance rule:** ${report.governance_rule || "none recorded"}`,
    `**Safe failure reason:** ${report.safe_failure_reason || "not recorded"}`,
    `**Gmail invocation count:** ${report.provider_invocation_count}`,
    `**Email delivered:** ${report.email_delivered}`,
    `**Evidence ID:** ${report.evidence_id || "not recorded"}`,
    `**Governance latency (ms):** ${report.governance_latency_ms}`,
    `**Provider latency (ms):** ${providerExecuted ? report.provider_latency_ms : "not applicable — the provider was never reached"}`,
    "",
  ].join("\n");
  const failureList = failures.length ? `\n### Unmet production requirements\n\n${failures.map((item) => `- ${item}`).join("\n")}\n` : "";
  fs.writeFileSync("artifacts/gmail-production-smoke.md", `## ${heading}\n${summary}\n| Field | Value |\n|---|---|\n${rows}\n${failureList}`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (failures.length) {
    // WHY the governance layer refused, not just THAT it refused.
    //
    // This check was habitually red and the log said only "blocked" with no
    // rule, verdict or reason — so nobody could tell a genuine governance
    // refusal from a misconfigured environment without opening the Job Summary
    // artifact. An unactionable red check is one people learn to ignore, and
    // then it hides the run that matters.
    //
    // `governance_rule` and `governance_verdict` were already collected; they
    // were simply never printed to the console the CI log shows.
    console.error(`\nGmail production smoke outcome: ${outcome}`);
    console.error(`Runtime Governance decision: ${report.runtime_governance_decision}`);
    console.error(`Governance verdict: ${report.governance_verdict || "not recorded"}`);
    console.error(`Governance rule: ${report.governance_rule || "none recorded"}`);
    console.error(`Governance reason: ${run.governance_reason || run.reason || "not recorded"}`);
    console.error(`Approval status: ${run.approval_status || "not recorded"}`);
    console.error(`Connector health: ${run.connector_health || "not recorded"}`);
    // Distinguishes the three causes that look identical from outside:
    //   BLOCKED    governance refused on a rule            -> a policy question
    //   ESCALATED  awaiting operator approval              -> a workflow question
    //   UNAVAILABLE engine unreachable / connector unhealthy -> an infra question
    const cause =
      String(report.runtime_governance_decision) === "blocked" ? "GOVERNANCE REFUSED (policy) — see rule above"
      : ["escalated", "pending", "awaiting_approval"].includes(String(run.approval_status)) ? "AWAITING OPERATOR APPROVAL (workflow), not a policy refusal"
      : ["unavailable", "denied"].includes(String(report.runtime_governance_decision)) ? "GOVERNANCE OR CONNECTOR UNAVAILABLE (infrastructure)"
      : "UNCLASSIFIED — inspect the fields above";
    console.error(`Likely cause: ${cause}`);
    console.error(`Safe failure reason: ${report.safe_failure_reason || "not recorded"}`);
    console.error(`Gmail invocation count: ${report.provider_invocation_count}`);
    console.error(`Email delivered: ${report.email_delivered}`);
    console.error(`Evidence ID: ${report.evidence_id || "not recorded"}`);
    for (const item of failures) console.error(`- ${item}`);
    throw new Error(`Required governed Gmail delivery was not achieved (outcome=${outcome}; ${failures.length} unmet requirement${failures.length === 1 ? "" : "s"})`);
  }
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

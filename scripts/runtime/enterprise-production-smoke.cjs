"use strict";
/* Explicitly enabled, single-action Salesforce/ServiceNow production smoke.
 * Never logs the input payload. Fails unless the full governed mutation path
 * executes exactly once and immutable evidence is visible on the dashboard. */
const fs = require("node:fs");
const crypto = require("node:crypto");

const enabled = /^(1|true|yes|on)$/i.test(String(process.env.ENTERPRISE_SMOKE_ENABLED || ""));
if (!enabled) throw new Error("ENTERPRISE_SMOKE_ENABLED is not true; refusing production provider invocation");
const required = [
  "E2E_BASE_URL", "RUNTIME_ADMIN_KEY", "E2E_ORG_ID", "ENTERPRISE_SMOKE_ENVIRONMENT_ID",
  "ENTERPRISE_SMOKE_CONNECTOR_ID", "ENTERPRISE_SMOKE_PROVIDER",
  "ENTERPRISE_SMOKE_ACTION", "ENTERPRISE_SMOKE_INPUT",
];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);
const provider = process.env.ENTERPRISE_SMOKE_PROVIDER;
if (!["salesforce", "servicenow"].includes(provider)) throw new Error("ENTERPRISE_SMOKE_PROVIDER must be salesforce or servicenow");
const action = process.env.ENTERPRISE_SMOKE_ACTION;
if (!action.startsWith(`${provider}.`)) throw new Error("smoke action/provider mismatch");
let input;
try { input = JSON.parse(process.env.ENTERPRISE_SMOKE_INPUT); }
catch { throw new Error("ENTERPRISE_SMOKE_INPUT must be valid JSON"); }
const base = process.env.E2E_BASE_URL.replace(/\/$/, "");
const org = process.env.E2E_ORG_ID;
const environment = process.env.ENTERPRISE_SMOKE_ENVIRONMENT_ID;
const connector = process.env.ENTERPRISE_SMOKE_CONNECTOR_ID;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const timeout = Number(process.env.ENTERPRISE_SMOKE_TIMEOUT_MS || 180000);
const terminal = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);
function headers(extra = {}) {
  const value = { "content-type": "application/json", "x-admin-key": process.env.RUNTIME_ADMIN_KEY, ...extra };
  if (bypass) value["x-vercel-protection-bypass"] = bypass;
  return value;
}
async function json(url, init = {}) {
  const response = await fetch(url, { ...init, headers: headers(init.headers || {}) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method || "GET"} ${url} failed (${response.status}): ${body.error || body.code || "provider smoke request failed"}`);
  return body;
}
const query = (run = "") => `${base}/api/runtime/admin/enterprise-actions?org_id=${encodeURIComponent(org)}&environment_id=${encodeURIComponent(environment)}${run ? `&enterprise_action_run_id=${encodeURIComponent(run)}` : ""}`;

(async () => {
  const initial = await json(query());
  const eligible = (initial.connectors || []).find((x) => x.id === connector && x.type === provider);
  if (!eligible) throw new Error("configured healthy connector is not eligible for this organisation/environment");
  const actionSpec = (initial.actions || []).find((x) => x.action_id === action);
  if (!actionSpec || !actionSpec.mutates) throw new Error("smoke action must be a registered mutation");
  const idempotency = `${provider}-production-smoke-${crypto.randomUUID()}`;
  let run = await json(`${base}/api/runtime/admin/enterprise-actions`, {
    method: "POST", headers: { "idempotency-key": idempotency },
    body: JSON.stringify({
      org_id: org, environment_id: environment, connector_id: connector,
      action_id: action, source_type: "production_smoke", input,
    }),
  });
  // First evaluation MUST stop at approval with zero provider calls.
  let state = await json(query(run.id));
  run = state.current || run;
  if (run.status !== "awaiting_approval" || Number(run.provider_invocation_count || 0) !== 0 || run.provider_called) {
    throw new Error(`initial governance did not fail closed for approval (status=${run.status}, calls=${run.provider_invocation_count})`);
  }
  const initialDecision = run.governance_decision;
  await json(`${base}/api/ops/proposals`, {
    method: "POST",
    body: JSON.stringify({ id: run.proposal_id, decision: "approve", note: `${provider} governed production smoke — operator authorised` }),
  });
  const deadline = Date.now() + timeout;
  while (!terminal.has(run.status)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${run.id}; last status=${run.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    state = await json(query(run.id)); run = state.current || run;
  }
  const final = await json(query());
  const dashboardRow = (final.executions || []).find((x) => x.id === run.id);
  const report = {
    generated_at: new Date().toISOString(), provider, connector_id: connector,
    enterprise_action_run_id: run.id, canonical_action_id: run.canonical_action && run.canonical_action.action_id,
    canonical_action_type: run.action_id, proposal_id: run.proposal_id,
    initial_governance_decision: initialDecision, approval_status: run.approval_status,
    final_governance_decision: run.governance_decision,
    provider_invocation_count: Number(run.provider_invocation_count || 0),
    external_record_id: run.external_record_id || null, evidence_id: run.evidence_id || null,
    governance_latency_ms: run.governance_latency_ms, provider_latency_ms: run.provider_latency_ms,
    total_latency_ms: run.total_latency_ms, organisation_id: run.org_id,
    environment_id: run.environment_id, lifecycle_state: run.lifecycle_state,
    workflow_status: run.status, dashboard_update_confirmation: !!dashboardRow,
  };
  const failures = [];
  if (report.workflow_status !== "completed") failures.push(`run status is ${report.workflow_status}`);
  if (report.approval_status !== "approved_and_executed") failures.push(`approval status is ${report.approval_status}`);
  if (report.final_governance_decision !== "executed") failures.push(`final governance decision is ${report.final_governance_decision}`);
  if (report.provider_invocation_count !== 1) failures.push(`provider invocation count is ${report.provider_invocation_count}`);
  if (!report.external_record_id) failures.push("real external record id is missing");
  if (!report.evidence_id) failures.push("immutable evidence id is missing");
  if (!report.dashboard_update_confirmation) failures.push("dashboard does not contain the completed run");
  for (const field of ["governance_latency_ms", "provider_latency_ms", "total_latency_ms"]) {
    if (!Number.isFinite(Number(report[field]))) failures.push(`${field} is missing`);
  }
  report.production_smoke_result = failures.length ? "failed" : "passed";
  report.failures = failures;
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync(`artifacts/${provider}-production-smoke.json`, `${JSON.stringify(report, null, 2)}\n`);
  const rows = Object.entries(report).filter(([key]) => key !== "failures").map(([key, value]) => `| ${key} | ${String(value).replace(/\|/g, "\\|")} |`).join("\n");
  fs.writeFileSync(`artifacts/${provider}-production-smoke.md`, `## ${provider} governed production smoke\n\n| Field | Value |\n|---|---|\n${rows}\n${failures.length ? `\n### Failures\n\n${failures.map((x) => `- ${x}`).join("\n")}\n` : ""}`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failures.length) throw new Error(`${provider} governed production smoke failed: ${failures.join("; ")}`);
})().catch((error) => { console.error(error.stack || error.message || error); process.exit(1); });

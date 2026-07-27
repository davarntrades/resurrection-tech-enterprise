#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");

const base = String(process.env.CUSTOMER_SUPPORT_E2E_BASE_URL || "").replace(/\/$/, "");
const adminKey = process.env.RUNTIME_ADMIN_KEY;
const org_id = process.env.CUSTOMER_SUPPORT_ORG_ID || "org_e3601a7cdb20ccd0cc";
const environment_id = process.env.CUSTOMER_SUPPORT_ENVIRONMENT_ID || "env_162372e33b67b39b0d";
const connector_id = process.env.CUSTOMER_SUPPORT_CONNECTOR_ID || "int_3dc2e5a77bde601e53";
const model_id = process.env.CUSTOMER_SUPPORT_MODEL_ID || "openai.gpt-oss-20b-1:0";
const reportPath = process.env.CUSTOMER_SUPPORT_SMOKE_REPORT || "customer-support-production-smoke.json";

if (!base || !adminKey) throw new Error("CUSTOMER_SUPPORT_E2E_BASE_URL and RUNTIME_ADMIN_KEY are required");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const headers = { "content-type": "application/json", "x-admin-key": adminKey };

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`${options.method || "GET"} ${path} failed with ${response.status}: ${text.slice(0, 1000)}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function waitForDeployment() {
  let last;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await request(`/api/runtime/admin/customer-support-workflow?org_id=${encodeURIComponent(org_id)}&environment_id=${encodeURIComponent(environment_id)}`);
    } catch (error) {
      last = error;
      if (![401, 404, 500, 502, 503].includes(error.status)) throw error;
      await sleep(5000);
    }
  }
  throw last || new Error("workflow deployment did not become ready");
}

(async () => {
  const before = await waitForDeployment();
  const idempotencyKey = `production-support-smoke-${Date.now()}`;
  const created = await request("/api/runtime/admin/customer-support-workflow", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify({
      org_id,
      environment_id,
      connector_id,
      model_id,
      source_type: "rest_api",
      source_external_id: idempotencyKey,
      customer_name: "GuardianOS Production Validation",
      customer_email: "production-validation@resurrection-tech.com",
      organisation: "Resurrection Tech",
      request_category: "technical",
      priority: "normal",
      message: "Please confirm that this customer support request was processed through the governed enterprise workflow. Return a concise acknowledgement only.",
    }),
  });

  assert.equal(created.canonical_action.action_id, "customer_support_assistant.respond");
  assert.equal(created.org_id, org_id);
  assert.equal(created.environment_id, environment_id);
  assert.equal(created.connector_id, connector_id);
  assert.equal(created.provider_invocation_count, 0);
  assert.equal(created.aws_called, false);

  let current = created;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const state = await request(`/api/runtime/admin/customer-support-workflow?org_id=${encodeURIComponent(org_id)}&environment_id=${encodeURIComponent(environment_id)}&workflow_run_id=${encodeURIComponent(created.id)}`);
    current = state.current || current;
    if (["completed", "blocked", "rejected", "failed", "expired", "cancelled"].includes(current.status)) break;
    if (current.status === "awaiting_approval") throw new Error(`production workflow escalated and cannot be smoke-validated automatically: ${current.proposal_id}`);
    await sleep(2000);
  }

  assert.equal(current.status, "completed");
  assert.equal(current.canonical_action.action_id, "customer_support_assistant.respond");
  assert.ok(current.proposal_id, "canonical proposal ID missing");
  assert.equal(current.governance_decision, "executed");
  assert.ok(current.provider_proposal_id, "provider proposal ID missing");
  assert.equal(current.approval_status === "approved" || current.approval_status === "not_required_or_approved", true);
  assert.equal(current.provider_invocation_count, 1);
  assert.equal(current.aws_called, true);
  assert.ok(current.response_content, "provider response missing");
  assert.ok(current.evidence_id, "workflow evidence ID missing");
  assert.ok(current.underlying_evidence_id, "provider evidence ID missing");
  assert.equal(current.workflow_evidence_recorded, true);
  assert.ok(Number(current.total_latency_ms) >= 0);
  assert.ok(Number(current.governance_latency_ms) >= 0);
  assert.ok(Number(current.provider_latency_ms) >= 0);

  const after = await request(`/api/runtime/admin/customer-support-workflow?org_id=${encodeURIComponent(org_id)}&environment_id=${encodeURIComponent(environment_id)}`);
  const execution = after.executions.find((row) => row.id === current.id);
  const evidence = after.evidence.find((row) => row.id === current.evidence_id || row.evidence && row.evidence.workflow_run_id === current.id);
  assert.ok(execution, "workflow missing from recent execution audit table");
  assert.ok(evidence, "workflow evidence missing from recent evidence table");
  assert.equal(evidence.immutable, true);
  assert.equal(evidence.evidence.proposal_id, current.proposal_id);
  assert.equal(evidence.evidence.provider_proposal_id, current.provider_proposal_id);
  assert.equal(evidence.evidence.provider_invocation_count, 1);
  assert.equal(evidence.evidence.aws_called, true);
  assert.ok(after.dashboard.requests_today >= Number(before.dashboard && before.dashboard.requests_today || 0) + 1);
  assert.ok(after.dashboard.completed >= Number(before.dashboard && before.dashboard.completed || 0) + 1);
  assert.ok(after.dashboard.average_total_latency_ms != null);
  assert.ok(after.dashboard.average_governance_latency_ms != null);
  assert.ok(after.dashboard.average_provider_latency_ms != null);

  const report = {
    validated_at: new Date().toISOString(),
    deployment: base,
    workflow_run_id: current.id,
    canonical_action: current.canonical_action.action_id,
    proposal_id: current.proposal_id,
    provider_proposal_id: current.provider_proposal_id,
    governance_decision: current.governance_decision,
    approval_status: current.approval_status,
    provider_invocation_count: current.provider_invocation_count,
    connector_id: current.connector_id,
    provider: current.provider,
    model_id: current.model_id,
    evidence_id: current.evidence_id,
    underlying_evidence_id: current.underlying_evidence_id,
    total_latency_ms: current.total_latency_ms,
    governance_latency_ms: current.governance_latency_ms,
    provider_latency_ms: current.provider_latency_ms,
    dashboard: after.dashboard,
    status: current.status,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
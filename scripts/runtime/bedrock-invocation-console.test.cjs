#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-bedrock-console-"));
process.env.INTEGRATION_SECRET_KEY = "test-only-integration-secret";

const store = require("../../lib/runtime/store");
const runs = require("../../lib/runtime/bedrock-invocation-runs");

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

async function seed() {
  const org = await store.insert("orgs", { id: "org_console", name: "Console Org" });
  const env = await store.insert("environments", { id: "env_console", org_id: org.id, name: "Production", kind: "production" });
  const connector = await store.insert("integration_connectors", { id: "con_console", org_id: org.id, environment_id: env.id, type: "aws-bedrock", name: "Healthy Bedrock", status: "configured", health: "healthy", config: { region: "eu-west-2", model_ids: ["model.test"] }, secret_encrypted: "sealed" });
  return { org, env, connector };
}

(async () => {
  const fixture = await seed();

  await test("eligible connectors expose configured models without secrets", async () => {
    const listed = await runs.listEligibleConnectors(fixture.org.id, fixture.env.id);
    assert.equal(listed.length, 1); assert.deepEqual(listed[0].models, ["model.test"]); assert.equal("secret_encrypted" in listed[0], false);
  });

  await test("wrong organisation and environment cannot use connector", async () => {
    await assert.rejects(() => runs.createRuns({ org_id: "org_other", environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "x" }), /not found/);
    await assert.rejects(() => runs.createRuns({ org_id: fixture.org.id, environment_id: "env_other", connector_id: fixture.connector.id, model_id: "model.test", prompt: "x" }), /not found/);
  });

  await test("unconfigured model and stress overflow are rejected", async () => {
    await assert.rejects(() => runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.denied", prompt: "x" }), /not configured/);
    await assert.rejects(() => runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "x", batch_mode: "concurrent", request_count: 11, concurrency: 1 }), /limits/);
  });

  await test("idempotency key reuses runs", async () => {
    const input = { org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "hello", idempotency_key: "same" };
    const first = await runs.createRuns(input); const second = await runs.createRuns(input); assert.equal(first.runs[0].id, second.runs[0].id);
  });

  await test("permitted request records independent governance, provider and total latency", async () => {
    const created = await runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "permit", idempotency_key: "permit" });
    let providerCalls = 0; let governanceCalls = 0;
    const gateway = {
      governed: async () => { governanceCalls += 1; await new Promise((resolve) => setTimeout(resolve, 8)); return { id: "p1", status: "executed", execution: { executed: true } }; },
      invokeBedrock: async (_input, dependencies) => {
        await dependencies.governed("invoke_aws_bedrock_model", {});
        providerCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ok: true, response: "ok", latency_ms: 5, governance: { proposal_id: "p1", evidence_id: "ge1", status: "executed" }, evidence: { id: "e1" } };
      },
    };
    const completed = await runs.executeRun(await store.findOne("bedrock_invocation_runs", { id: created.runs[0].id }), gateway);
    await runs.executeRun(await store.findOne("bedrock_invocation_runs", { id: created.runs[0].id }), gateway);
    assert.equal(providerCalls, 1); assert.equal(governanceCalls, 1); assert.equal(completed.status, "completed"); assert.equal(completed.provider_invocation_count, 1);
    assert.ok(completed.governance_evaluation_latency_ms >= 1); assert.equal(completed.governance_latency_ms, completed.governance_evaluation_latency_ms);
    assert.equal(completed.provider_latency_ms, 5); assert.ok(completed.total_latency_ms >= completed.governance_evaluation_latency_ms + completed.provider_latency_ms);
    const persisted = await store.findOne("bedrock_invocation_runs", { id: completed.id });
    assert.equal(persisted.governance_evaluation_latency_ms, completed.governance_evaluation_latency_ms);
  });

  for (const [label, code, expected] of [["blocked", "GOVERNANCE_BLOCKED", "blocked"], ["unresolved escalation", "GOVERNANCE_ESCALATED", "awaiting_approval"], ["governance unavailable", "GOVERNANCE_UNAVAILABLE", "blocked"]]) {
    await test(`${label} records governance timing and invokes AWS zero times`, async () => {
      const created = await runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: label, idempotency_key: label });
      const gateway = {
        governed: async () => { await new Promise((resolve) => setTimeout(resolve, 3)); return {}; },
        invokeBedrock: async (_input, dependencies) => { await dependencies.governed("x", {}); return { ok: false, code, error: label, governance: { proposal_id: `p_${label}`, status: code === "GOVERNANCE_ESCALATED" ? "escalated" : "blocked" } }; },
      };
      const result = await runs.executeRun(await store.findOne("bedrock_invocation_runs", { id: created.runs[0].id }), gateway);
      assert.equal(result.status, expected); assert.equal(result.provider_invocation_count, 0); assert.equal(result.aws_called, false); assert.equal(result.provider_latency_ms, null); assert.ok(result.governance_evaluation_latency_ms >= 1);
    });
  }

  await test("concurrent polling cannot duplicate execution", async () => {
    const created = await runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "race", idempotency_key: "race" });
    let calls = 0;
    const gateway = { invokeBedrock: async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { ok: true, response: "ok", latency_ms: 20, governance: { proposal_id: "pr", status: "executed" }, evidence: { id: "er" } }; } };
    const row = await store.findOne("bedrock_invocation_runs", { id: created.runs[0].id });
    await Promise.all([runs.executeRun(row, gateway), runs.executeRun(row, gateway), runs.executeRun(row, gateway)]); assert.equal(calls, 1);
  });

  await test("rejected approval preserves governance timing and records approval wait", async () => {
    const created = await runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "reject", idempotency_key: "reject" });
    const run = created.runs[0];
    await store.update("bedrock_invocation_runs", run.id, { status: "awaiting_approval", proposal_id: "proposal_rejected", governance_evaluation_latency_ms: 7, governance_latency_ms: 7, governance_completed_at: new Date(Date.now() - 20).toISOString() });
    await store.insert("ops_proposals", { id: "proposal_rejected", org_id: fixture.org.id, environment_id: fixture.env.id, action_id: "invoke_aws_bedrock_model", status: "denied", evidence_id: "deny_evidence" });
    let calls = 0;
    const result = await runs.reconcileApproval(await store.findOne("bedrock_invocation_runs", { id: run.id }), { executeApprovedBedrockInvocation: async () => { calls += 1; } });
    assert.equal(result.status, "rejected"); assert.equal(result.provider_invocation_count, 0); assert.equal(calls, 0); assert.equal(result.governance_evaluation_latency_ms, 7); assert.ok(result.approval_wait_latency_ms >= 0);
  });

  await test("approved continuation preserves governance timing and executes exactly once", async () => {
    const created = await runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "approve", idempotency_key: "approve" });
    const run = created.runs[0];
    await store.update("bedrock_invocation_runs", run.id, { status: "awaiting_approval", proposal_id: "proposal_approved", governance_evaluation_latency_ms: 9, governance_latency_ms: 9, total_latency_ms: 12, governance_completed_at: new Date(Date.now() - 20).toISOString() });
    await store.insert("ops_proposals", { id: "proposal_approved", org_id: fixture.org.id, environment_id: fixture.env.id, action_id: "invoke_aws_bedrock_model", status: "executed", params: { connector_id: fixture.connector.id, model_id: "model.test", request_hash: "approved_hash" }, execution: { executed: true, result: { authorized: true } }, evidence_id: "approval_evidence" });
    let calls = 0;
    const gateway = { executeApprovedBedrockInvocation: async () => { calls += 1; return { ok: true, response: "approved", latency_ms: 3, governance: { proposal_id: "proposal_approved", evidence_id: "approval_evidence", status: "executed" }, evidence: { id: "provider_evidence" } }; } };
    const first = await runs.reconcileApproval(await store.findOne("bedrock_invocation_runs", { id: run.id }), gateway);
    await runs.reconcileApproval(await store.findOne("bedrock_invocation_runs", { id: run.id }), gateway);
    assert.equal(first.status, "completed"); assert.equal(first.approval_status, "approved_and_executed"); assert.equal(first.provider_invocation_count, 1); assert.equal(calls, 1); assert.equal(first.governance_evaluation_latency_ms, 9); assert.equal(first.provider_latency_ms, 3); assert.ok(first.total_latency_ms >= 12);
  });

  await test("aggregates exclude missing historical telemetry and non-provider runs", async () => {
    const summary = runs.aggregate([
      { status: "completed", provider_invocation_count: 1, evidence_count: 1, total_latency_ms: 20, governance_evaluation_latency_ms: 5, provider_latency_ms: 10 },
      { status: "blocked", provider_invocation_count: 0, evidence_count: 1, total_latency_ms: 8, governance_evaluation_latency_ms: 8, provider_latency_ms: null },
      { status: "completed", provider_invocation_count: 1, evidence_count: 1, total_latency_ms: null, governance_evaluation_latency_ms: null, provider_latency_ms: null },
    ]);
    assert.equal(summary.average_governance_latency_ms, 7); assert.equal(summary.p95_governance_latency_ms, 8); assert.equal(summary.average_provider_latency_ms, 10); assert.equal(summary.p95_provider_latency_ms, 10); assert.equal(summary.average_latency_ms, 14);
  });

  console.log(`\n${passed} governed Bedrock invocation console tests passed.`);
})().catch((error) => { console.error(error); process.exit(1); });

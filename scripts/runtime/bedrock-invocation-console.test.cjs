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
  const connector = await store.insert("integration_connectors", {
    id: "con_console", org_id: org.id, environment_id: env.id, type: "aws-bedrock", name: "Healthy Bedrock",
    status: "configured", health: "healthy", config: { region: "eu-west-2", model_ids: ["model.test"] }, secret_encrypted: "sealed",
  });
  return { org, env, connector };
}

(async () => {
  const fixture = await seed();

  await test("eligible connectors expose configured models without secrets", async () => {
    const listed = await runs.listEligibleConnectors(fixture.org.id, fixture.env.id);
    assert.equal(listed.length, 1);
    assert.deepEqual(listed[0].models, ["model.test"]);
    assert.equal("secret_encrypted" in listed[0], false);
  });

  await test("wrong organisation cannot use connector", async () => {
    await assert.rejects(() => runs.createRuns({ org_id: "org_other", environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "x" }), /not found/);
  });

  await test("wrong environment cannot use connector", async () => {
    await assert.rejects(() => runs.createRuns({ org_id: fixture.org.id, environment_id: "env_other", connector_id: fixture.connector.id, model_id: "model.test", prompt: "x" }), /not found/);
  });

  await test("unconfigured model cannot execute", async () => {
    await assert.rejects(() => runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.denied", prompt: "x" }), /not configured/);
  });

  await test("stress request and concurrency limits are enforced", async () => {
    await assert.rejects(() => runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "x", batch_mode: "concurrent", request_count: 11, concurrency: 1 }), /limits/);
    await assert.rejects(() => runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "x", batch_mode: "concurrent", request_count: 2, concurrency: 4 }), /limits/);
  });

  await test("idempotency key reuses runs", async () => {
    const input = { org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "hello", idempotency_key: "same" };
    const first = await runs.createRuns(input);
    const second = await runs.createRuns(input);
    assert.equal(first.runs[0].id, second.runs[0].id);
  });

  await test("permitted request invokes provider exactly once", async () => {
    const created = await runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "permit", idempotency_key: "permit" });
    let calls = 0;
    const gateway = { invokeBedrock: async () => { calls += 1; return { ok: true, response: "ok", latency_ms: 4, governance: { proposal_id: "p1", evidence_id: "ge1", status: "executed" }, evidence: { id: "e1" } }; } };
    const completed = await runs.executeRun(await store.findOne("bedrock_invocation_runs", { id: created.runs[0].id }), gateway);
    await runs.executeRun(await store.findOne("bedrock_invocation_runs", { id: created.runs[0].id }), gateway);
    assert.equal(calls, 1);
    assert.equal(completed.status, "completed");
    assert.equal(completed.provider_invocation_count, 1);
  });

  for (const [label, code, expected] of [
    ["blocked", "GOVERNANCE_BLOCKED", "blocked"],
    ["unresolved escalation", "GOVERNANCE_ESCALATED", "awaiting_approval"],
    ["governance unavailable", "GOVERNANCE_UNAVAILABLE", "blocked"],
  ]) {
    await test(`${label} invokes provider zero times`, async () => {
      const created = await runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: label, idempotency_key: label });
      const gateway = { invokeBedrock: async () => ({ ok: false, code, error: label, governance: { proposal_id: `p_${label}`, status: code === "GOVERNANCE_ESCALATED" ? "escalated" : "blocked" } }) };
      const result = await runs.executeRun(await store.findOne("bedrock_invocation_runs", { id: created.runs[0].id }), gateway);
      assert.equal(result.status, expected);
      assert.equal(result.provider_invocation_count, 0);
      assert.equal(result.aws_called, false);
    });
  }

  await test("concurrent polling cannot duplicate execution", async () => {
    const created = await runs.createRuns({ org_id: fixture.org.id, environment_id: fixture.env.id, connector_id: fixture.connector.id, model_id: "model.test", prompt: "race", idempotency_key: "race" });
    let calls = 0;
    const gateway = { invokeBedrock: async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { ok: true, response: "ok", governance: { proposal_id: "pr", status: "executed" }, evidence: { id: "er" } }; } };
    const row = await store.findOne("bedrock_invocation_runs", { id: created.runs[0].id });
    await Promise.all([runs.executeRun(row, gateway), runs.executeRun(row, gateway), runs.executeRun(row, gateway)]);
    assert.equal(calls, 1);
  });

  await test("batch aggregation reports independent outcomes", async () => {
    const summary = runs.aggregate([
      { status: "completed", provider_invocation_count: 1, evidence_count: 1, total_latency_ms: 10 },
      { status: "blocked", provider_invocation_count: 0, evidence_count: 1, total_latency_ms: 5 },
      { status: "awaiting_approval", provider_invocation_count: 0, evidence_count: 1 },
    ]);
    assert.equal(summary.requested, 3);
    assert.equal(summary.permitted, 1);
    assert.equal(summary.blocked, 1);
    assert.equal(summary.escalated, 1);
    assert.equal(summary.provider_calls, 1);
    assert.equal(summary.evidence_records, 3);
  });

  console.log(`\n${passed} governed Bedrock invocation console tests passed.`);
})().catch((error) => { console.error(error); process.exit(1); });

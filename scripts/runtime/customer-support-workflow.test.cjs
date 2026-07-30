#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-customer-support-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = "test-only-customer-support-secret-key";

const rt = require("../../lib/runtime");
const workflow = rt.customerSupportWorkflow;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

async function seed() {
  const org = await rt.store.insert("orgs", { id: "org_support", name: "Support Org" });
  const env = await rt.store.insert("environments", { id: "env_support", org_id: org.id, name: "Production", kind: "production" });
  const connector = await rt.store.insert("integration_connectors", {
    id: "con_support", org_id: org.id, environment_id: env.id, type: "aws-bedrock", name: "Support Bedrock",
    status: "configured", health: "healthy", config: { region: "eu-west-2", model_ids: ["model.support"] }, secret_encrypted: "sealed",
  });
  return { org, env, connector };
}

const request = {
  customer_name: "Alex Customer",
  customer_email: "alex@example.com",
  organisation: "Example Ltd",
  request_category: "technical",
  priority: "high",
  message: "Our dashboard is unavailable after login.",
};

(async () => {
  const fixture = await seed();

  await test("structured input becomes a connector-neutral canonical GuardianOS action", async () => {
    const action = workflow.canonicalAction({ ...request, source_type: "zendesk", source_external_id: "ticket-42" });
    assert.equal(action.action_id, "customer_support_assistant.respond");
    assert.equal(action.source.type, "zendesk");
    assert.equal(action.subject.organisation, "Example Ltd");
    assert.equal(action.flags.high_priority, true);
    assert.equal(action.request.message, request.message);
  });

  await test("invalid customer input is rejected before workflow persistence", async () => {
    assert.throws(() => workflow.canonicalAction({ ...request, customer_email: "invalid" }), /email is invalid/);
  });

  await test("permitted workflow produces proposal, exactly one provider call, evidence and latency", async () => {
    const created = await workflow.createExecution({
      ...request, org_id: fixture.org.id, environment_id: fixture.env.id,
      connector_id: fixture.connector.id, model_id: "model.support", idempotency_key: "permit-workflow",
    });
    let providerCalls = 0;
    const gateway = {
      governed: async () => {
        await new Promise((resolve) => setTimeout(resolve, 3));
        return { id: "proposal_support", status: "executed", evidence_id: "governance_evidence", execution: { executed: true, result: { authorized: true } }, decision: { reason: "permit" } };
      },
      invokeBedrock: async (input, dependencies) => {
        const proposal = await dependencies.governed("invoke_aws_bedrock_model", {});
        providerCalls++;
        return { ok: true, output: { message: { content: [{ text: "We are investigating this issue." }] } }, provider_latency_ms: 7, governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id, status: "executed" }, evidence: { id: "provider_evidence" } };
      },
    };
    let result = await workflow.advanceExecution(created.id, fixture.org.id, gateway);
    if (!new Set(["completed", "blocked", "awaiting_approval", "failed"]).has(result.status)) result = await workflow.advanceExecution(created.id, fixture.org.id, gateway);
    assert.equal(result.status, "completed");
    assert.equal(result.proposal_id, "proposal_support");
    assert.equal(result.provider_invocation_count, 1);
    assert.equal(providerCalls, 1);
    assert.equal(result.provider_latency_ms, 7);
    assert.ok(result.governance_latency_ms >= 1);
    assert.ok(result.total_latency_ms >= result.governance_latency_ms + result.provider_latency_ms);
    assert.ok(result.evidence_id);
    assert.ok(result.underlying_evidence_id);
    const evidence = await workflow.recentEvidence(fixture.org.id, fixture.env.id);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].immutable, true);
    assert.equal(evidence[0].evidence.provider_invocation_count, 1);
    assert.equal(evidence[0].evidence.provider, "amazon-bedrock");
    assert.equal(evidence[0].evidence.org_id, fixture.org.id);
    assert.equal(evidence[0].evidence.environment_id, fixture.env.id);
    await workflow.advanceExecution(created.id, fixture.org.id, gateway);
    assert.equal(providerCalls, 1);
  });

  for (const [label, code, expected] of [
    ["blocked", "GOVERNANCE_BLOCKED", "blocked"],
    ["escalated", "GOVERNANCE_ESCALATED", "awaiting_approval"],
  ]) {
    await test(`${label} workflow invokes provider zero times`, async () => {
      const created = await workflow.createExecution({
        ...request, customer_email: `${label}@example.com`, org_id: fixture.org.id, environment_id: fixture.env.id,
        connector_id: fixture.connector.id, model_id: "model.support", idempotency_key: `${label}-workflow`,
      });
      let calls = 0;
      const gateway = {
        governed: async () => ({ id: `proposal_${label}`, status: label === "escalated" ? "escalated" : "blocked", evidence_id: `evidence_${label}` }),
        invokeBedrock: async (_input, dependencies) => {
          const proposal = await dependencies.governed("invoke_aws_bedrock_model", {});
          return { ok: false, code, error: label, governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id, status: proposal.status } };
        },
      };
      const result = await workflow.advanceExecution(created.id, fixture.org.id, gateway);
      assert.equal(result.status, expected);
      assert.equal(result.provider_invocation_count, 0);
      assert.equal(result.aws_called, false);
      assert.equal(calls, 0);
      if (expected === "blocked") assert.ok(result.evidence_id);
    });
  }

  await test("dashboard aggregates business workflow outcomes and latency", async () => {
    const summary = workflow.dashboard([
      { created_at: new Date().toISOString(), status: "completed", provider_invocation_count: 1, total_latency_ms: 20, governance_latency_ms: 5, provider_latency_ms: 10 },
      { created_at: new Date().toISOString(), status: "blocked", provider_invocation_count: 0, total_latency_ms: 7, governance_latency_ms: 7, provider_latency_ms: null },
      { created_at: new Date().toISOString(), status: "awaiting_approval", provider_invocation_count: 0, total_latency_ms: null, governance_latency_ms: 4, provider_latency_ms: null },
    ]);
    assert.equal(summary.requests_today, 3);
    assert.equal(summary.completed, 1);
    assert.equal(summary.blocked, 1);
    assert.equal(summary.escalated, 1);
    assert.equal(summary.average_total_latency_ms, 14);
    assert.equal(summary.average_provider_latency_ms, 10);
  });

  console.log(`\n${passed} Customer Support Assistant workflow tests passed.`);
})().catch((error) => { console.error(error); process.exit(1); });

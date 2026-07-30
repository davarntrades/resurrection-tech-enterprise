#!/usr/bin/env node
/* ============================================================================
 * Customer Support Assistant — Runtime Governance registration contract.
 *
 * scripts/runtime/customer-support-workflow.test.cjs stubs `governed`, so it
 * proves the workflow's own state machine but CANNOT prove the canonical action
 * is admissible to Runtime Governance. That gap is what let the production
 * smoke fail closed with `unknown_action`: the action was absent from the
 * Operations catalog, so governor.evaluate blocked it deny-by-default without
 * ever reaching the engine.
 *
 * This suite drives the REAL path — integration gateway → ops.proposals →
 * governor → engine (hermetic mock mirroring operations_rules.py) → catalog
 * executor — and pins both directions:
 *
 *   1. REGISTERED + EVALUABLE  the canonical action reaches the engine and an
 *                              executable permit is issued and verified.
 *   2. AUTHORIZE-ONLY          the permit authorises; it never calls Bedrock.
 *   3. SCOPE-BOUND             a connector or model outside the proposed
 *                              organisation/environment yields NO permit.
 *   4. Ω STILL AUTHORITATIVE   an external destination is still BLOCKED by
 *                              ops_internal_action_external_reach.
 *   5. NOT BROADENED           sibling customer-support actions remain
 *                              deny-by-default `unknown_action`.
 *   6. FAIL-CLOSED             an unreachable engine still blocks.
 *   7. END-TO-END              with only the AWS SDK boundary stubbed, the
 *                              workflow completes with exactly ONE provider
 *                              invocation (including across polling
 *                              re-advances), immutable evidence, and total,
 *                              governance and provider latency recorded.
 *
 *   node scripts/runtime/customer-support-governance-registration.test.cjs
 * ============================================================================ */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-cs-governance-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = "test-only-customer-support-secret-key";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("../ops/mock-engine.cjs");

const ACTION_TYPE = "customer_support_assistant.respond";
const request = {
  customer_name: "GuardianOS Production Validation",
  customer_email: "guardianos-smoke@example.invalid",
  organisation: "Resurrection Tech",
  request_category: "technical",
  priority: "normal",
  message: "Reply with exactly: GuardianOS governed invocation successful.",
  source_type: "rest_api",
};

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

(async () => {
  const engine = await startMockEngine();
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${engine.address().port}`;

  const rt = require("../../lib/runtime");
  const ops = require("../../lib/ops");
  const gateway = require("../../lib/runtime/integration-gateway");
  const workflow = rt.customerSupportWorkflow;

  const org = await rt.store.insert("orgs", { id: "org_cs_gov", name: "Support Org" });
  const environment = await rt.store.insert("environments", { id: "env_cs_gov", org_id: org.id, name: "Production", kind: "production" });
  const connector = await rt.store.insert("integration_connectors", {
    id: "con_cs_gov", org_id: org.id, environment_id: environment.id, type: "aws-bedrock", name: "Support Bedrock",
    status: "configured", health: "healthy", config: { region: "eu-west-2", model_ids: ["model.support"] }, secret_encrypted: "sealed",
  });
  const otherEnv = await rt.store.insert("environments", { id: "env_cs_other", org_id: org.id, name: "Staging", kind: "staging" });
  const otherConnector = await rt.store.insert("integration_connectors", {
    id: "con_cs_other", org_id: org.id, environment_id: otherEnv.id, type: "aws-bedrock", name: "Staging Bedrock",
    status: "configured", health: "healthy", config: { region: "eu-west-2", model_ids: ["model.support"] }, secret_encrypted: "sealed",
  });

  const canonical = workflow.canonicalAction(request);
  // Exactly the submission made by lib/runtime/customer-support-governed-workflow.js.
  const propose = (overrides = {}) => gateway.governed(ACTION_TYPE, {
    org_id: org.id,
    environment_id: environment.id,
    actor: "customer_support_assistant",
    params: {
      canonical_action: canonical,
      canonical_action_hash: rt.store.sha256(JSON.stringify(canonical)),
      workflow_run_id: `csw_${Math.random().toString(16).slice(2, 10)}`,
      connector_id: connector.id,
      model_id: "model.support",
      flags: canonical.flags,
      ...overrides,
    },
  });

  await test("canonical customer support action is registered in the governed action catalog", async () => {
    const entry = ops.actions.get(ACTION_TYPE);
    assert.ok(entry, `${ACTION_TYPE} must be registered — an unregistered action is blocked as unknown_action before reaching the engine`);
    assert.equal(entry.tool, "prepare_draft_reply", "the Ω tool must be existing operations_rules.py vocabulary");
    assert.ok(ops.actions.autoExecutable(entry), "a permitted support response must be executable without a separate operator sign-off");
    assert.equal(entry.refuse, undefined);
  });

  await test("Runtime Governance evaluates the canonical action and issues a verified executable permit", async () => {
    const decision = await ops.governor.evaluate({ action_id: ACTION_TYPE, params: { flags: canonical.flags } });
    assert.equal(decision.verdict, "allow");
    assert.equal(decision.policy, "engine_verdict", "the permit must come from the engine, not a local override");
    assert.equal(decision.engine.reachable, true);
    assert.equal(decision.engine.verdict, "PERMIT");

    const proposal = await propose();
    assert.equal(proposal.status, "executed");
    assert.equal(proposal.execution.executed, true);
    assert.equal(proposal.execution.verified, true);
    assert.ok(proposal.evidence_id, "the permit must be recorded as governance evidence");
  });

  await test("the permit authorises only — it never invokes Amazon Bedrock itself", async () => {
    const proposal = await propose();
    const result = proposal.execution.result;
    assert.equal(result.authorized, true);
    assert.equal(result.action_type, ACTION_TYPE);
    assert.equal(result.provider, "amazon-bedrock");
    assert.equal(result.connector_id, connector.id);
    assert.equal(result.model_id, "model.support");
    const blob = JSON.stringify(proposal.execution);
    assert.ok(!blob.includes(request.message), "the customer message must never be copied into proposal execution");
    assert.ok(!/response_content|completion|output_text/.test(blob), "no provider output may appear in the permit");
  });

  await test("the permit is bound to the proposed organisation, environment, connector and model", async () => {
    const wrongEnvConnector = await propose({ connector_id: otherConnector.id });
    assert.notEqual(wrongEnvConnector.status, "executed", "a connector from another environment must not receive a permit");

    const unknownConnector = await propose({ connector_id: "con_does_not_exist" });
    assert.notEqual(unknownConnector.status, "executed");

    const wrongModel = await propose({ model_id: "model.not-configured" });
    assert.notEqual(wrongModel.status, "executed", "a model outside the connector configuration must not receive a permit");

    const wrongType = await propose({ canonical_action: { ...canonical, action_id: "customer_support_assistant.refund" } });
    assert.notEqual(wrongType.status, "executed", "the executor must reject a canonical action type it is not registered for");
  });

  await test("Ω remains authoritative — an external destination is still blocked", async () => {
    const external = await propose({ flags: { ...canonical.flags, destination_external: true } });
    assert.equal(external.status, "blocked");
    assert.equal(external.decision.rule, "ops_internal_action_external_reach");
    assert.equal(external.execution, null, "a blocked proposal must never execute");
  });

  await test("registration is not broadened — sibling customer support actions stay deny-by-default", async () => {
    for (const actionId of ["customer_support_assistant.refund", "customer_support_assistant.escalate", "customer_support_assistant.*", "customer_support_assistant"]) {
      const decision = await ops.governor.evaluate({ action_id: actionId, params: {} });
      assert.equal(decision.verdict, "block", `${actionId} must remain unregistered`);
      assert.equal(decision.policy, "unknown_action");
    }
  });

  await test("fail-closed is intact — an unreachable engine blocks the canonical action", async () => {
    const original = process.env.GOVERNANCE_URL;
    const engineModule = require("../../lib/runtime/engine");
    const realEvaluate = engineModule.evaluate;
    engineModule.evaluate = async () => ({ ok: false, error: "connection refused" });
    try {
      const decision = await ops.governor.evaluate({ action_id: ACTION_TYPE, params: { flags: canonical.flags } });
      assert.equal(decision.verdict, "block");
      assert.equal(decision.policy, "fail_closed_engine_unavailable");
    } finally {
      engineModule.evaluate = realEvaluate;
      process.env.GOVERNANCE_URL = original;
    }
  });

  await test("end-to-end: the governed workflow reaches Bedrock exactly once and records the full evidence shape", async () => {
    // Only the AWS SDK boundary is stubbed. Runtime Governance, the canonical
    // proposal, the provider proposal, evidence and latency are all real.
    const crypto = require("node:crypto");
    const key = crypto.createHash("sha256").update(process.env.INTEGRATION_SECRET_KEY).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const sealed = Buffer.concat([cipher.update(JSON.stringify({ access_key_id: "AKIA_TEST", secret_access_key: "test-secret" }), "utf8"), cipher.final()]);
    await rt.store.update("integration_connectors", connector.id, {
      secret_encrypted: `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${sealed.toString("base64url")}`,
    });

    const created = await workflow.createExecution({
      ...request, org_id: org.id, environment_id: environment.id,
      connector_id: connector.id, model_id: "model.support", idempotency_key: "governance-registration-e2e",
    });

    let awsCalls = 0;
    const dependencies = {
      invoke: async () => {
        awsCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ok: true, response: "GuardianOS governed invocation successful.", mode: "converse", attempts: 1, aws_request_id: "req-test", provider_latency_ms: 5 };
      },
    };

    const isTerminal = (status) => ["completed", "blocked", "rejected", "failed", "expired", "cancelled"].includes(status);
    let run = created;
    for (let i = 0; i < 12 && !isTerminal(run.status); i += 1) {
      run = await workflow.advanceExecution(run.id, org.id, gateway, dependencies);
    }
    // Re-advancing (what the smoke's polling loop does) must not re-invoke AWS.
    for (let i = 0; i < 3; i += 1) await workflow.advanceExecution(run.id, org.id, gateway, dependencies);
    run = await rt.store.findOne("customer_support_workflow_runs", { id: created.id });

    assert.equal(run.status, "completed", run.safe_failure_reason || "workflow should complete");
    assert.equal(run.governance_decision, "executed");
    assert.equal(run.approval_status, "not_required_or_approved");
    assert.equal(run.canonical_action.action_id, ACTION_TYPE);
    assert.ok(run.proposal_id, "canonical proposal must exist");
    assert.ok(run.provider_proposal_id, "provider proposal must exist on the governed Bedrock path");
    assert.equal(awsCalls, 1, "AWS must be invoked exactly once, including across polling re-advances");
    assert.equal(run.provider_invocation_count, 1);
    assert.equal(run.aws_called, true);
    assert.ok(run.evidence_id, "immutable workflow evidence must exist");
    assert.equal(run.provider, "amazon-bedrock");
    assert.equal(run.model_id, "model.support");
    assert.equal(run.org_id, org.id);
    assert.equal(run.environment_id, environment.id);
    assert.equal(run.connector_id, connector.id);
    assert.equal(run.safe_failure_reason, null);
    for (const field of ["total_latency_ms", "governance_latency_ms", "provider_latency_ms"]) {
      assert.ok(Number.isFinite(Number(run[field])), `${field} must be recorded`);
    }

    const evidence = await rt.store.findOne("integration_events", { id: run.evidence_id });
    assert.equal(evidence.immutable, true);
    assert.equal(evidence.evidence.provider, "amazon-bedrock");
    assert.equal(evidence.evidence.provider_invocation_count, 1);
    assert.equal(evidence.evidence.aws_called, true);
    assert.ok(!JSON.stringify(evidence.evidence).includes(request.customer_email), "the customer email must not appear in evidence");
  });

  engine.close();
  console.log(`\n${passed} Customer Support governance registration tests passed.`);
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});

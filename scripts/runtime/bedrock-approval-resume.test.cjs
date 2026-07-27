#!/usr/bin/env node
/* ============================================================================
 * Governed Amazon Bedrock invocation console — approval-resume contract.
 *
 * The console test (bedrock-invocation-console.test.cjs) proves the run-state
 * machine in isolation against a stubbed gateway. This test proves the part a
 * stub cannot: that approval-resume rides the REAL proposal and approval
 * lifecycle (lib/ops/proposals → lib/ops/governor → the engine) and the REAL
 * approved-invocation continuation, and that AWS is reached the exact number
 * of times governance authorises — no more, no fewer.
 *
 * The AWS boundary is mocked at the SDK client level, so every assertion below
 * counts actual Bedrock Runtime `send()` calls rather than a convenience flag:
 *
 *   · unresolved escalation           → AWS invoked ZERO times
 *   · repeated polling while pending  → AWS invoked ZERO times
 *   · operator DENY (real deny())     → AWS invoked ZERO times
 *   · operator APPROVE (real approve) → AWS invoked EXACTLY ONCE
 *   · re-poll / refresh after approve → still EXACTLY ONCE
 *   · payload tampered post-approval  → fails closed, AWS ZERO times
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-bedrock-approval-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = "test-only-bedrock-approval-secret";

// A hermetic engine that ESCALATES the Bedrock invocation until an operator
// approval attaches `approved_by`, then PERMITS. This is exactly the shape
// lib/ops/governor drives: approval is not a local bypass, it re-evaluates the
// same trajectory with the operator flag and the engine issues the permit.
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const engine = http.createServer((req, res) => {
  const send = (status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true, engine_commit: "approval-resume-fixture" });
  if (req.method !== "POST" || req.url !== "/v1/evaluate") return send(404, { error: "not found" });
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
    catch { /* fixture: a malformed body falls through to ESCALATE, never to PERMIT */ }
    const step = (Array.isArray(body.trajectory) ? body.trajectory : [])[0] || {};
    const approved = !!(step.args && step.args.approved_by);
    return send(200, {
      verdict: approved ? "PERMIT" : "ESCALATE",
      omega_domain: "enterprise",
      reason: approved ? "operator sign-off recorded" : "Bedrock invocation requires human review",
      metadata: { rule: "ops_requires_operator_signoff" },
      trajectory_hash: hash(body.trajectory || []),
      requires_human_review: !approved,
      attestation: { engine_commit: "approval-resume-fixture", ruleset_hash: "fixture-v1", service_version: "fixture-1" },
    });
  });
});

let pass = 0, fail = 0; const failures = [];
function ok(condition, message, detail) {
  if (condition) { pass++; return; }
  fail++; failures.push(`${message}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

// AWS SDK-level mock. `calls.count` counts real Bedrock Runtime invocations.
function mockAws(calls) {
  class Command { constructor(input) { this.input = input; } }
  class Assume extends Command {}
  class Identity extends Command {}
  class Converse extends Command {}
  class ConverseStream extends Command {}
  class Invoke extends Command {}
  class InvokeStream extends Command {}
  class STS {
    send() { return Promise.resolve({ Account: "123456789012", Arn: "arn:aws:sts::123456789012:user/GuardianOS" }); }
  }
  class Runtime {
    send(command) {
      calls.count += 1;
      calls.sent.push(command.input);
      return Promise.resolve({
        output: { message: { role: "assistant", content: [{ text: "mocked approved reply" }] } },
        usage: { inputTokens: 2, outputTokens: 3 }, stopReason: "end_turn",
        $metadata: { requestId: `aws-req-${calls.count}` },
      });
    }
  }
  return {
    BedrockRuntimeClient: Runtime, STSClient: STS,
    ConverseCommand: Converse, ConverseStreamCommand: ConverseStream,
    InvokeModelCommand: Invoke, InvokeModelWithResponseStreamCommand: InvokeStream,
    AssumeRoleCommand: Assume, GetCallerIdentityCommand: Identity,
    sleep: async () => {},
  };
}
const tracker = () => ({ count: 0, sent: [] });

(async () => {
  await new Promise((resolve) => engine.listen(0, "127.0.0.1", resolve));
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${engine.address().port}`;
  process.env.GOVERNANCE_TOKEN = "fixture-token";

  const rt = require("../../lib/runtime");
  const store = rt.store;
  const gateway = rt.integrationGateway;
  const runs = require("../../lib/runtime/bedrock-invocation-runs");
  const proposals = require("../../lib/ops/proposals");

  // ---- seed a real organisation, environment and sealed Bedrock connector ----
  const org = await store.insert("orgs", { id: "org_resume", name: "Approval Resume Org" });
  const env = await store.insert("environments", { id: "env_resume", org_id: org.id, name: "Production", kind: "production" });
  const secretRef = await gateway.stageSecret(org.id, { access_key_id: "AKIAFIXTURE00000000", secret_access_key: "fixture-secret-key" }, "bedrock-approval");
  const connector = await gateway.createConnectorRaw({
    org_id: org.id, environment_id: env.id, type: "aws-bedrock", name: "Approval Bedrock",
    config: { region: "eu-west-2", auth_method: "access_key", model_ids: ["provider.model-v1"], timeout_ms: 5000, max_retries: 0 },
    secret_ref: secretRef,
  });
  await store.update("integration_connectors", connector.id, { health: "healthy", status: "configured" });

  const reload = (id) => store.findOne("bedrock_invocation_runs", { id });
  async function newRun(idempotency_key, prompt) {
    const batch = await runs.createRuns({
      org_id: org.id, environment_id: env.id, connector_id: connector.id, model_id: "provider.model-v1",
      prompt, idempotency_key, actor: "operator@fixture",
    });
    return reload(batch.runs[0].id);
  }

  // ======================= 1. unresolved escalation =========================
  const calls1 = tracker();
  const deps1 = mockAws(calls1);
  const escalated = await runs.executeRun(await newRun("resume-escalate", "escalate me"), gateway, deps1);

  ok(escalated.status === "awaiting_approval", "an escalated invocation parks in awaiting_approval", escalated.status);
  ok(calls1.count === 0, "UNRESOLVED APPROVAL INVOKES AWS ZERO TIMES", calls1.count);
  ok(escalated.aws_called === false && escalated.provider_invocation_count === 0,
    "an unresolved run records zero provider invocations", { aws_called: escalated.aws_called, n: escalated.provider_invocation_count });

  // The run must be bound to a REAL proposal produced by the real lifecycle.
  const liveProposal = await proposals.get(escalated.proposal_id);
  ok(!!liveProposal, "the escalated run references a real ops_proposals row", escalated.proposal_id);
  ok(liveProposal && liveProposal.status === "escalated",
    "the proposal sits at the shared lifecycle's escalated state", liveProposal && liveProposal.status);
  ok(liveProposal && liveProposal.action_id === "invoke_aws_bedrock_model",
    "the run escalated through the existing governed Bedrock action");
  ok(liveProposal && proposals.STATUSES.includes(liveProposal.status),
    "the status is one the shared proposal lifecycle defines");
  ok(!!(liveProposal && liveProposal.evidence_id), "the escalation recorded governance evidence");

  // ---- polling and browser refresh while the approval is unresolved ----
  for (let i = 0; i < 4; i += 1) await runs.reconcileApproval(await reload(escalated.id), gateway, deps1);
  await runs.advanceBatch(escalated.batch_id, org.id, gateway, deps1);
  const stillPending = await reload(escalated.id);
  ok(calls1.count === 0, "REPEATED POLLING AND REFRESH WHILE UNRESOLVED INVOKE AWS ZERO TIMES", calls1.count);
  ok(stillPending.status === "awaiting_approval", "an unresolved run stays parked across polls", stillPending.status);

  // ============== 2. operator DENY through the real lifecycle ===============
  const calls2 = tracker();
  const deps2 = mockAws(calls2);
  const toDeny = await runs.executeRun(await newRun("resume-deny", "deny me"), gateway, deps2);
  ok(toDeny.status === "awaiting_approval", "the run to be denied parks for approval", toDeny.status);

  const denied = await proposals.deny(toDeny.proposal_id, { actor: "operator@fixture", note: "not authorised" });
  ok(denied.status === "denied", "proposals.deny drives the proposal to denied", denied.status);

  const rejectedRun = await runs.reconcileApproval(await reload(toDeny.id), gateway, deps2);
  ok(rejectedRun.status === "rejected", "a denied proposal rejects the run", rejectedRun.status);
  ok(calls2.count === 0, "REJECTED APPROVAL INVOKES AWS ZERO TIMES", calls2.count);
  ok(rejectedRun.aws_called === false && rejectedRun.provider_invocation_count === 0,
    "a rejected run records zero provider invocations");

  // A denied run must not be revivable by more polling.
  for (let i = 0; i < 3; i += 1) await runs.reconcileApproval(await reload(toDeny.id), gateway, deps2);
  await runs.advanceBatch(toDeny.batch_id, org.id, gateway, deps2);
  ok(calls2.count === 0, "polling a rejected run never reaches AWS", calls2.count);

  // ============= 3. operator APPROVE through the real lifecycle =============
  const calls3 = tracker();
  const deps3 = mockAws(calls3);
  const toApprove = await runs.executeRun(await newRun("resume-approve", "approve me"), gateway, deps3);
  ok(toApprove.status === "awaiting_approval", "the run to be approved parks for approval", toApprove.status);
  ok(calls3.count === 0, "no AWS call happens before the operator approves", calls3.count);

  const approved = await proposals.approve(toApprove.proposal_id, { actor: "operator@fixture", note: "authorised" });
  ok(approved.status === "executed",
    "proposals.approve re-evaluates with the operator flag and the engine permits", approved.status);
  ok(!!(approved.execution && approved.execution.executed === true && approved.execution.result
    && approved.execution.result.authorized === true),
    "the approval executes the authorisation-only executor (no provider output in governance)");
  ok(approved.execution.verified === true, "the approval verification passed");
  ok(!!(approved.operator && approved.operator.actor === "operator@fixture"),
    "the approving operator is recorded on the proposal");
  ok(calls3.count === 0, "the approval itself does NOT call AWS", calls3.count);

  const resumed = await runs.reconcileApproval(await reload(toApprove.id), gateway, deps3);
  ok(resumed.status === "completed", "an approved run resumes to completed", resumed.status);
  ok(calls3.count === 1, "APPROVED EXECUTION INVOKES AWS EXACTLY ONCE", calls3.count);
  ok(resumed.provider_invocation_count === 1 && resumed.aws_called === true,
    "the approved run records exactly one provider invocation", { n: resumed.provider_invocation_count });
  ok(resumed.approval_status === "approved_and_executed", "the approval outcome is recorded", resumed.approval_status);
  ok(Number(resumed.evidence_count) >= 2,
    "an approved run reports evidence from BOTH the escalation and the execution", resumed.evidence_count);

  // The payload AWS received must be the payload governance approved.
  const sentMessages = JSON.stringify(calls3.sent[0] && calls3.sent[0].messages);
  ok(sentMessages.includes("approve me"), "AWS received the approved prompt", sentMessages);

  // ---- polling, retry and browser refresh after a completed approval ----
  for (let i = 0; i < 4; i += 1) await runs.reconcileApproval(await reload(toApprove.id), gateway, deps3);
  await runs.advanceBatch(toApprove.batch_id, org.id, gateway, deps3);
  await runs.executeRun(await reload(toApprove.id), gateway, deps3);
  ok(calls3.count === 1, "POLLING, RETRIES AND REFRESH AFTER APPROVAL DO NOT DUPLICATE EXECUTION", calls3.count);

  // Concurrent reconciliation (two browser tabs racing) must still be once.
  const calls4 = tracker();
  const deps4 = mockAws(calls4);
  const racing = await runs.executeRun(await newRun("resume-race", "race me"), gateway, deps4);
  await proposals.approve(racing.proposal_id, { actor: "operator@fixture" });
  const racingRow = await reload(racing.id);
  await Promise.all([
    runs.reconcileApproval(racingRow, gateway, deps4),
    runs.reconcileApproval(racingRow, gateway, deps4),
    runs.reconcileApproval(racingRow, gateway, deps4),
  ]);
  ok(calls4.count === 1, "CONCURRENT APPROVAL RESUME INVOKES AWS EXACTLY ONCE", calls4.count);
  ok((await reload(racing.id)).status === "completed", "the raced run still completes");

  // ========== 4. an approval cannot be replayed onto another payload ========
  const calls5 = tracker();
  const deps5 = mockAws(calls5);
  const tampered = await runs.executeRun(await newRun("resume-tamper", "original prompt"), gateway, deps5);
  await proposals.approve(tampered.proposal_id, { actor: "operator@fixture" });
  // Swap the stored payload AFTER sign-off: the approved request hash no longer
  // describes what would be sent, so execution must fail closed.
  await store.update("bedrock_invocation_runs", tampered.id, {
    request_payload: { prompt: "smuggled prompt", system_instruction: null },
  });
  const tamperResult = await runs.reconcileApproval(await reload(tampered.id), gateway, deps5);
  ok(calls5.count === 0, "A TAMPERED PAYLOAD INVOKES AWS ZERO TIMES AFTER APPROVAL", calls5.count);
  ok(tamperResult.status === "failed", "a tampered approved run fails closed", tamperResult.status);
  ok(tamperResult.aws_called === false && tamperResult.provider_invocation_count === 0,
    "a tampered run records zero provider invocations");
  ok(/mismatch|does not match/i.test(String(tamperResult.safe_failure_reason || "")),
    "the failure names the approval mismatch", tamperResult.safe_failure_reason);

  // ===== 5. the approved continuation crosses the sovereign boundary ========
  ok(typeof gateway.bedrockProviderInvoke === "function",
    "the sovereign provider boundary is exposed for reuse by the approved continuation");
  let boundaryCrossings = 0;
  const realBoundary = gateway.bedrockProviderInvoke;
  gateway.bedrockProviderInvoke = function counted(p, dependencies) {
    boundaryCrossings += 1;
    return realBoundary.call(gateway, p, dependencies);
  };
  const calls6 = tracker();
  const deps6 = mockAws(calls6);
  const boundaryRun = await runs.executeRun(await newRun("resume-boundary", "boundary"), gateway, deps6);
  await proposals.approve(boundaryRun.proposal_id, { actor: "operator@fixture" });
  await runs.reconcileApproval(await reload(boundaryRun.id), gateway, deps6);
  gateway.bedrockProviderInvoke = realBoundary;
  ok(calls6.count === 1, "the boundary-checked run invokes AWS exactly once", calls6.count);
  ok(boundaryCrossings >= 1,
    "APPROVAL RESUME REACHES AWS THROUGH THE SOVEREIGN PROVIDER BOUNDARY (outbound policy + credential registry)",
    boundaryCrossings);

  // ===================== 6. aggregate honesty ===============================
  const all = await runs.recentRuns(org.id, env.id, 50);
  const summary = runs.aggregate(all);
  const awsTotal = calls1.count + calls2.count + calls3.count + calls4.count + calls5.count + calls6.count;
  ok(summary.provider_calls === awsTotal,
    "the reported provider-call count equals the real number of AWS invocations",
    { reported: summary.provider_calls, actual: awsTotal });
  ok(summary.permitted === all.filter((r) => r.status === "completed").length,
    "permitted count matches completed runs");

  engine.close();
  if (fail) {
    console.error(`\nApproval-resume contract: ${pass} passed, ${fail} failed`);
    for (const message of failures) console.error(`  ✗ ${message}`);
    process.exit(1);
  }
  console.log(`\nApproval-resume contract: ${pass} passed, 0 failed`);
})().catch((error) => { engine.close(); console.error(error); process.exit(1); });

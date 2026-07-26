#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-bedrock-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = "test-only-bedrock-secret-encryption-key";

const rt = require("../../lib/runtime");
const bedrock = require("../../lib/runtime/connectors/aws-bedrock");
const actions = require("../../lib/ops/actions");

let pass = 0, fail = 0; const failures = [];
function ok(condition, message, detail) {
  if (condition) { pass++; return; }
  fail++; failures.push(`${message}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
}
async function rejects(fn, code) {
  try { await fn(); return false; } catch (error) { return error && error.code === code; }
}

function mockAws({ sts, runtime, sleep } = {}) {
  class Command { constructor(input) { this.input = input; } }
  class Assume extends Command {}
  class Identity extends Command {}
  class Converse extends Command {}
  class ConverseStream extends Command {}
  class Invoke extends Command {}
  class InvokeStream extends Command {}
  class STS {
    constructor(config) { this.config = config; }
    send(command) { return sts ? sts(command, this.config) : Promise.resolve({ Account: "123456789012", Arn: "arn:aws:sts::123456789012:assumed-role/Test/GuardianOS" }); }
  }
  class Runtime {
    constructor(config) { this.config = config; }
    send(command, options) {
      return runtime ? runtime(command, this.config, options) : Promise.resolve({
        output: { message: { role: "assistant", content: [{ text: "mocked" }] } },
        usage: { inputTokens: 2, outputTokens: 1 }, stopReason: "end_turn",
        $metadata: { requestId: "aws-request-1" },
      });
    }
  }
  return {
    STSClient: STS, AssumeRoleCommand: Assume, GetCallerIdentityCommand: Identity,
    BedrockRuntimeClient: Runtime, ConverseCommand: Converse, ConverseStreamCommand: ConverseStream,
    InvokeModelCommand: Invoke, InvokeModelWithResponseStreamCommand: InvokeStream,
    sleep: sleep || (async () => {}),
  };
}

const allowProposal = () => ({
  id: "prop_allow", evidence_id: "ops_allow", status: "executed",
  execution: { executed: true, result: { authorized: true } },
  decision: { reason: "permitted" },
});
const blockProposal = () => ({
  id: "prop_block", evidence_id: "ops_block", status: "blocked",
  execution: null, decision: { reason: "blocked by policy" },
});
const escalateProposal = () => ({
  id: "prop_escalate", evidence_id: "ops_escalate", status: "escalated",
  execution: null, decision: { reason: "operator review required" },
});

(async () => {
  const a = await rt.admin.onboardCustomer({ name: "Bedrock A", slug: "bedrock-a" });
  const b = await rt.admin.onboardCustomer({ name: "Bedrock B", slug: "bedrock-b" });
  const config = {
    region: "eu-west-2", auth_method: "access_key",
    model_ids: ["provider.model-v1"], agent_ids: ["AGENT1"],
    agent_aliases: ["ALIAS1"], action_groups: ["GovernedOperations"],
    timeout_ms: 5000, max_retries: 2,
  };
  const secret = { access_key_id: "AKIATESTVALUE", secret_access_key: "never-store-plaintext" };

  const valid = bedrock.validateConfiguration(config, secret);
  ok(valid.region === "eu-west-2" && valid.auth_method === "access_key" && valid.max_retries === 2,
    "valid IAM configuration is accepted");

  const invalidCredentials = await rejects(
    () => bedrock.validateCredentials(config, secret, mockAws({
      sts: async () => { const e = new Error("The security token is invalid"); e.name = "UnrecognizedClientException"; throw e; },
    })),
    "AWS_INVALID_CREDENTIALS");
  ok(invalidCredentials, "invalid AWS credentials map to AWS_INVALID_CREDENTIALS");

  const roleConfig = { ...config, auth_method: "role", role_arn: "arn:aws:iam::123456789012:role/GuardianOSBedrock" };
  const roleFailure = await rejects(
    () => bedrock.validateCredentials(roleConfig, { ...secret, external_id: "tenant-external-id" }, mockAws({
      sts: async (command) => {
        if (command.constructor.name === "Assume") { const e = new Error("not trusted"); e.name = "AccessDeniedException"; throw e; }
        return { Account: "123456789012" };
      },
    })),
    "AWS_ROLE_ASSUMPTION_FAILED");
  ok(roleFailure, "role-assumption failures use a stable connector error");

  let regionMismatch = false;
  try {
    bedrock.invocationInput({
      inference_profile: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/profile-a",
      messages: [{ role: "user", content: [{ text: "hello" }] }],
    }, valid);
  } catch (error) { regionMismatch = error.code === "AWS_REGION_MISMATCH"; }
  ok(regionMismatch, "inference-profile region mismatch is rejected before AWS");

  const ref = await rt.integrationGateway.stageSecret(a.org.id, secret, "bedrock-test");
  const connector = await rt.integrationGateway.createConnectorRaw({
    org_id: a.org.id, environment_id: a.sandbox.id, type: "aws-bedrock",
    name: "Bedrock sandbox", config, secret_ref: ref,
  });
  ok(connector.type === "aws-bedrock" && connector.has_secret && connector.config.region === "eu-west-2",
    "aws-bedrock is registered through the existing connector framework");

  let runtimeCalls = 0;
  const success = await rt.integrationGateway.invokeBedrock({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: connector.id,
    request: { mode: "converse", model_id: "provider.model-v1", messages: [{ role: "user", content: [{ text: "hello" }] }] },
    actor: "contract-test",
  }, {
    ...mockAws({ runtime: async () => {
      runtimeCalls++;
      return { output: { message: { role: "assistant", content: [{ text: "safe mocked reply" }] } }, stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 2 }, $metadata: { requestId: "req-success" } };
    } }),
    governed: async () => allowProposal(),
  });
  ok(success.ok && success.aws_request_id === "req-success" && runtimeCalls === 1,
    "model invocation succeeds through a permitted governed proposal");

  const apiFailure = await rt.integrationGateway.invokeBedrock({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: connector.id,
    request: { mode: "invoke", model_id: "provider.model-v1", body: { prompt: "mock" } },
  }, {
    ...mockAws({ runtime: async () => { const e = new Error("denied"); e.name = "AccessDeniedException"; throw e; } }),
    governed: async () => allowProposal(),
  });
  ok(!apiFailure.ok && apiFailure.code === "AWS_ACCESS_DENIED",
    "Bedrock API failures map to stable GuardianOS connector codes");

  const event = {
    messageVersion: "1.0",
    agent: { id: "AGENT1", alias: "ALIAS1", name: "Agent", version: "1" },
    sessionId: "session-1", actionGroup: "GovernedOperations",
    apiPath: "/payments", httpMethod: "POST",
    parameters: [{ name: "amount", type: "number", value: "25000" }],
  };
  const permitted = await rt.integrationGateway.handleBedrockActionGroup({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: connector.id, event,
  }, { governed: async () => allowProposal() });
  ok(permitted.ok && permitted.decision === "ALLOW" && permitted.response.response.httpStatusCode === 200,
    "Bedrock Agent action-group permit returns a compatible permit response");

  const functionEvent = {
    ...event, apiPath: undefined, httpMethod: undefined, function: "submitPayment",
  };
  const functionMapped = await rt.integrationGateway.handleBedrockActionGroup({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: connector.id, event: functionEvent,
  }, { governed: async () => allowProposal() });
  ok(functionMapped.ok && functionMapped.response.response.function === "submitPayment" &&
    functionMapped.response.response.functionResponse.responseBody.TEXT,
  "function-details action groups return the AWS Lambda-compatible functionResponse shape");

  let forbiddenExecution = 0;
  const blocked = await rt.integrationGateway.handleBedrockActionGroup({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: connector.id, event,
  }, { governed: async () => blockProposal(), invoke: async () => { forbiddenExecution++; } });
  ok(!blocked.ok && blocked.decision === "BLOCK" && blocked.response.response.httpStatusCode === 403 && forbiddenExecution === 0,
    "blocked action-group request never executes");

  const escalated = await rt.integrationGateway.handleBedrockActionGroup({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: connector.id, event,
  }, { governed: async () => escalateProposal(), invoke: async () => { forbiddenExecution++; } });
  ok(!escalated.ok && escalated.decision === "ESCALATE" && escalated.response.response.httpStatusCode === 202 && forbiddenExecution === 0,
    "unresolved action-group escalation never executes");

  const inboundSecret = "lambda-inbound-signing-secret";
  const signedRef = await rt.integrationGateway.stageSecret(a.org.id, {
    ...secret, inbound_signing_secret: inboundSecret,
  }, "bedrock-signed-test");
  const signedConnector = await rt.integrationGateway.createConnectorRaw({
    org_id: a.org.id, environment_id: a.sandbox.id, type: "aws-bedrock",
    name: "Signed Bedrock agent", config: { ...config, require_inbound_signature: true }, secret_ref: signedRef,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = "nonce-contract-1";
  const rawEvent = JSON.stringify(event);
  const signature = `v1=${crypto.createHmac("sha256", inboundSecret).update(`${timestamp}.${nonce}.${rawEvent}`).digest("hex")}`;
  const signed = await rt.integrationGateway.handleBedrockActionGroup({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: signedConnector.id, event, raw_body: rawEvent,
    signature: { timestamp, nonce, signature },
  }, { governed: async () => allowProposal() });
  ok(signed.ok && signed.decision === "ALLOW", "valid signed inbound Bedrock Agent request is accepted");
  const replay = await rt.integrationGateway.handleBedrockActionGroup({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: signedConnector.id, event, raw_body: rawEvent,
    signature: { timestamp, nonce, signature },
  }, { governed: async () => allowProposal() });
  ok(!replay.ok && replay.code === "AWS_REPLAY_DETECTED", "signed inbound nonce replay is rejected before governance execution");

  const malformed = await rt.integrationGateway.handleBedrockActionGroup({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: connector.id, event: { messageVersion: "1.0" },
  }, { governed: async () => allowProposal() });
  ok(!malformed.ok && malformed.code === "AWS_MALFORMED_PAYLOAD",
    "malformed AWS action-group payload is rejected");

  const stored = await rt.store.findOne("integration_connectors", { id: connector.id });
  const proposals = await rt.store.findOptional("ops_proposals", { org_id: a.org.id });
  const evidenceRows = await rt.store.findOptional("integration_events", { org_id: a.org.id });
  const publicState = JSON.stringify({ connector, proposals, evidenceRows });
  ok(!publicState.includes(secret.secret_access_key) && !("secret_encrypted" in connector),
    "plaintext AWS secrets are redacted from connector responses, proposals and evidence");

  let orgIsolated = false;
  try {
    await rt.integrationGateway.invokeBedrock({
      org_id: b.org.id, environment_id: b.sandbox.id, connector_id: connector.id,
      request: { model_id: "provider.model-v1", messages: [{ role: "user", content: [{ text: "x" }] }] },
    }, { governed: async () => allowProposal() });
  } catch (error) { orgIsolated = /not found/.test(error.message); }
  ok(orgIsolated, "organisation isolation prevents cross-tenant Bedrock access");

  let environmentIsolated = false;
  try {
    await rt.integrationGateway.invokeBedrock({
      org_id: a.org.id, environment_id: a.production.id, connector_id: connector.id,
      request: { model_id: "provider.model-v1", messages: [{ role: "user", content: [{ text: "x" }] }] },
    }, { governed: async () => allowProposal() });
  } catch (error) { environmentIsolated = /environment mismatch/.test(error.message); }
  ok(environmentIsolated, "environment isolation prevents sandbox connector use in production");

  let attempts = 0;
  const retried = await bedrock.invoke(config, secret, {
    model_id: "provider.model-v1", messages: [{ role: "user", content: [{ text: "retry" }] }],
  }, mockAws({
    runtime: async () => {
      attempts++;
      if (attempts < 3) { const e = new Error("slow down"); e.name = "ThrottlingException"; throw e; }
      return { output: { message: { content: [{ text: "done" }] } }, $metadata: { requestId: "req-retry" } };
    },
  }));
  ok(retried.ok && retried.attempts === 3 && attempts === 3,
    "retryable Bedrock failures use bounded retry behaviour");

  async function* streamEvents() {
    yield { contentBlockDelta: { delta: { text: "streamed" }, contentBlockIndex: 0 } };
    yield { messageStop: { stopReason: "end_turn" } };
  }
  const streamed = await bedrock.invoke(config, secret, {
    model_id: "provider.model-v1", messages: [{ role: "user", content: [{ text: "stream" }] }], stream: true,
  }, mockAws({ runtime: async () => ({ stream: streamEvents(), $metadata: { requestId: "req-stream" } }) }));
  ok(streamed.ok && streamed.stream && streamed.events.length === 2 && streamed.aws_request_id === "req-stream",
    "Converse streaming events are consumed through the installed AWS SDK mapping");

  const invocationEvidence = evidenceRows.concat(await rt.store.findOptional("integration_events", { org_id: a.org.id }))
    .find((x) => x.type === "aws.bedrock.invocation");
  ok(!!(invocationEvidence && invocationEvidence.immutable && invocationEvidence.evidence.proposal_id),
    "successful Bedrock invocation creates immutable linked evidence");

  let failClosedAwsCalls = 0;
  const failClosed = await rt.integrationGateway.invokeBedrock({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: connector.id,
    request: { model_id: "provider.model-v1", messages: [{ role: "user", content: [{ text: "must not run" }] }] },
  }, {
    governed: async () => { throw new Error("engine unavailable"); },
    invoke: async () => { failClosedAwsCalls++; return { ok: true }; },
  });
  ok(!failClosed.ok && failClosed.code === "GOVERNANCE_UNAVAILABLE" && failClosedAwsCalls === 0,
    "Runtime Governance unavailability fails closed before AWS execution");

  const rotatedRef = await rt.integrationGateway.stageSecret(a.org.id, {
    access_key_id: "AKIAREPLACEMENT", secret_access_key: "replacement-secret",
  }, "bedrock-rotation-test");
  const rotated = await rt.integrationGateway.rotateBedrockCredentialsRaw({
    org_id: a.org.id, environment_id: a.sandbox.id, connector_id: connector.id, secret_ref: rotatedRef,
  }, mockAws());
  ok(rotated.health === "healthy" && rotated.config.aws_account_id === "123456789012" && rotated.has_secret,
    "replacement IAM credentials are validated before encrypted rotation");

  const overview = await rt.integrationGateway.bedrockOverview(a.org.id);
  const primaryOverview = overview.find((x) => x.id === connector.id);
  ok(overview.length === 2 && primaryOverview.region === "eu-west-2" &&
    primaryOverview.governance_decision_counts && Number.isInteger(primaryOverview.evidence_generated),
  "Control Room Bedrock overview exposes redacted health, configuration, decisions and evidence");

  ok(["rotate_aws_bedrock_credentials", "invoke_aws_bedrock_model", "govern_aws_bedrock_agent_action"]
    .every((id) => actions.get(id)), "every privileged Bedrock operation is registered in the existing governed action catalog");

  const ts = fs.readFileSync(path.join(__dirname, "../../sdk/typescript/src/index.ts"), "utf8");
  const py = fs.readFileSync(path.join(__dirname, "../../sdk/python/src/guardianos/client.py"), "utf8");
  ok(["evaluateAction", "invokeModel", "handleActionGroup", "getHealth"].every((name) => ts.includes(name)) &&
    ["evaluate_action", "invoke_model", "handle_action_group", "get_health"].every((name) => py.includes(`def ${name}`)),
  "TypeScript and Python SDKs expose Bedrock helpers without removing generic APIs");

  console.log(`\nAWS Bedrock connector contract: ${pass} passed, ${fail} failed`);
  if (fail) for (const f of failures) console.log(`  ✗ ${f}`);
  fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error("AWS Bedrock connector contract crashed:", error);
  process.exit(1);
});

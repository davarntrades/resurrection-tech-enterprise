#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { CredentialProviderRegistry, callbackProvider } = require("../../lib/runtime/sovereign/credentials");
const azure = require("../../lib/runtime/connectors/azure-ai");
const google = require("../../lib/runtime/connectors/google-vertex-ai");
const aws = require("../../lib/runtime/connectors/aws-bedrock");
const { prepareProviderCall } = require("../../lib/runtime/sovereign/provider-runtime");
const { wrapIntegrationGateway } = require("../../lib/runtime/sovereign/integration-gateway-runtime");

const executed = { id: "prop-1", evidence_id: "ev-1", status: "executed", execution: { executed: true } };
const approved = (url) => ({ mode: "approved_endpoints_only", approved_endpoints: [url] });
const context = { org_id: "org-a", expected_org_id: "org-a", environment_id: "env-a", expected_environment_id: "env-a", evidence_required: true, evidence_ready: true };
let pass = 0;
function ok(value, message) { assert.ok(value, message); pass++; }

function seal(value, keyText) {
  const key = crypto.createHash("sha256").update(keyText).digest();
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

(async () => {
  let resolved = 0;
  const registry = new CredentialProviderRegistry().register("custom", callbackProvider(async () => ({ token: `rotated-${++resolved}` })));

  let awsRuntimeOptions;
  class FakeBedrockClient { constructor(options) { awsRuntimeOptions = options; } async send() { return { output: {}, $metadata: { requestId: "test" } }; } }
  class FakeCommand { constructor(input) { this.input = input; } }
  await aws.invoke({ region: "eu-west-2", auth_method: "access_key", provider_endpoints: { runtime: "https://bedrock.customer.invalid/", sts: "https://sts.customer.invalid/" } }, { access_key_id: "AKIATEST000000000000", secret_access_key: "not-a-real-secret" }, { model_id: "model", messages: [{ role: "user", content: [{ text: "test" }] }] }, { BedrockRuntimeClient: FakeBedrockClient, ConverseCommand: FakeCommand });
  ok(awsRuntimeOptions.endpoint === "https://bedrock.customer.invalid/", "AWS runtime endpoint reaches SDK constructor");

  let stsOptions;
  class FakeSTS { constructor(options) { stsOptions = options; } async send(command) { return command.constructor.name === "Assume" ? { Credentials: { AccessKeyId: "x", SecretAccessKey: "y", SessionToken: "z" } } : { Account: "123456789012" }; } }
  class Assume { constructor(input) { this.input = input; } }
  class Identity { constructor(input) { this.input = input; } }
  await aws.validateCredentials({ region: "us-gov-west-1", auth_method: "role", role_arn: "arn:aws-us-gov:iam::123456789012:role/Guardian", provider_endpoints: { sts: "https://sts.gov.customer.invalid/" } }, {}, { STSClient: FakeSTS, AssumeRoleCommand: Assume, GetCallerIdentityCommand: Identity });
  ok(stsOptions.endpoint === "https://sts.gov.customer.invalid/", "AWS STS endpoint reaches SDK constructor");

  let agentOptions;
  class AgentClient { constructor(options) { agentOptions = options; } async send() { return { completion: [], $metadata: { requestId: "agent" } }; } }
  class AgentCommand { constructor(input) { this.input = input; } }
  await aws.invokeAgentRuntime({ region: "eu-west-2", auth_method: "access_key", provider_endpoints: { agent_runtime: "https://agent.customer.invalid/" } }, { access_key_id: "AKIATEST000000000000", secret_access_key: "not-a-real-secret" }, { agent_id: "a", agent_alias_id: "b", session_id: "s", input_text: "hello" }, { proposal: executed, BedrockAgentRuntimeClient: AgentClient, InvokeAgentCommand: AgentCommand });
  ok(agentOptions.endpoint === "https://agent.customer.invalid/", "AWS agent-runtime endpoint reaches client constructor");

  const azureEndpoint = "https://azure.customer.invalid/openai/";
  let azureFactory = 0;
  const azureResult = await azure.execute({ service: "openai", config: { org_id: "org-a", environment_id: "env-a", provider_endpoints: { openai: azureEndpoint } }, credentialRegistry: registry, credentialReference: { provider: "custom" }, credentialContext: context, outboundPolicy: approved(azureEndpoint), proposal: executed, clientFactory(options) { azureFactory++; assert.equal(options.endpoint, azureEndpoint); assert.equal(options.credentials.token, "rotated-1"); return { execute: async () => ({ ok: true, endpoint: options.endpoint }) }; } });
  ok(azureResult.endpoint === azureEndpoint && azureFactory === 1, "Azure endpoint and resolved credential reach client");

  const googleEndpoint = "https://vertex.customer.invalid/";
  let googleFactory = 0;
  await google.execute({ service: "vertex", config: { org_id: "org-a", environment_id: "env-a", project_id: "customer", location: "europe-west4", provider_endpoints: { vertex: googleEndpoint } }, credentialRegistry: registry, credentialReference: { provider: "custom" }, credentialContext: context, outboundPolicy: approved(googleEndpoint), proposal: executed, clientFactory(options) { googleFactory++; assert.equal(options.endpoint, googleEndpoint); assert.equal(options.credentials.token, "rotated-2"); return { execute: async () => ({ ok: true }) }; } });
  ok(googleFactory === 1, "Google endpoint and resolved credential reach client");

  let deniedCalls = 0;
  await assert.rejects(() => azure.execute({ service: "openai", config: { org_id: "org-a", environment_id: "env-a", provider_endpoints: { openai: azureEndpoint } }, credentialRegistry: registry, credentialReference: { provider: "custom" }, credentialContext: context, outboundPolicy: { mode: "none" }, proposal: executed, clientFactory() { deniedCalls++; return { execute: async () => ({}) }; } }), /denied before network execution/);
  ok(deniedCalls === 0, "outbound denial occurs before Azure client construction");

  const failureProposals = [
    null,
    { status: "blocked" },
    { status: "escalated" },
    { status: "approved", execution: { executed: false } },
  ];
  for (const proposal of failureProposals) {
    let calls = 0;
    await assert.rejects(() => google.execute({ service: "vertex", config: { org_id: "org-a", environment_id: "env-a", provider_endpoints: { vertex: googleEndpoint } }, credentialRegistry: registry, credentialReference: { provider: "custom" }, credentialContext: context, outboundPolicy: approved(googleEndpoint), proposal, clientFactory() { calls++; return { execute: async () => ({}) }; } }), /verified executed proposal/);
    ok(calls === 0, `governance state ${proposal && proposal.status || "unavailable"} produces zero provider calls`);
  }

  const badContexts = [
    { ...context, expected_org_id: "org-b" },
    { ...context, expected_environment_id: "env-b" },
    { ...context, evidence_ready: false },
  ];
  for (const bad of badContexts) {
    let calls = 0;
    await assert.rejects(() => azure.execute({ service: "openai", config: { org_id: "org-a", environment_id: "env-a", provider_endpoints: { openai: azureEndpoint } }, credentialRegistry: registry, credentialReference: { provider: "custom" }, credentialContext: bad, outboundPolicy: approved(azureEndpoint), proposal: executed, clientFactory() { calls++; return { execute: async () => ({}) }; } }));
    ok(calls === 0, "ownership/evidence failure produces zero provider calls");
  }

  const failingRegistry = new CredentialProviderRegistry().register("custom", callbackProvider(async () => { throw new Error("secret unavailable"); }));
  let credentialFailureCalls = 0;
  await assert.rejects(() => azure.execute({ service: "openai", config: { org_id: "org-a", environment_id: "env-a", provider_endpoints: { openai: azureEndpoint } }, credentialRegistry: failingRegistry, credentialReference: { provider: "custom" }, credentialContext: context, outboundPolicy: approved(azureEndpoint), proposal: executed, clientFactory() { credentialFailureCalls++; return { execute: async () => ({}) }; } }), /secret unavailable/);
  ok(credentialFailureCalls === 0, "credential resolution failure produces zero provider calls");

  await assert.rejects(() => prepareProviderCall({ connectorType: "azure", config: { provider_endpoints: { openai: "http://unsafe.invalid" } }, service: "openai", credentialRegistry: registry, credentialReference: { provider: "custom" }, credentialContext: context, outboundPolicy: approved(azureEndpoint), proposal: executed }), /HTTPS/);
  pass++;

  const key = "test-only-sovereign-key";
  const rows = {
    environments: [{ id: "env-a", org_id: "org-a" }],
    integration_connectors: [{ id: "con-a", org_id: "org-a", environment_id: "env-a", type: "azure", status: "configured", config: { org_id: "org-a", environment_id: "env-a", provider_endpoints: { openai: azureEndpoint } }, secret_encrypted: seal({ api_key: "secret" }, key) }],
    integration_webhooks: [{ id: "wh-a", org_id: "org-a", environment_id: "env-a", status: "active", url: "https://hooks.customer.invalid/" }],
  };
  const writes = [];
  const runtimeStore = {
    async findOne(name, query) { return (rows[name] || []).find((row) => Object.entries(query).every(([k, v]) => row[k] === v)) || null; },
    async update(name, id, patch) { const row = (rows[name] || []).find((item) => item.id === id); Object.assign(row, patch); return row; },
    async insert(name, record) { writes.push({ name, record }); return { id: `ev-${writes.length}`, created_at: new Date().toISOString(), ...record }; },
    nowISO() { return new Date().toISOString(); },
    sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); },
  };
  let webhookCalls = 0;
  const base = {
    CONNECTOR_DEFINITIONS: [], connectorDefinition() { throw new Error("unsupported"); }, publicConnector(row) { const { secret_encrypted, ...safe } = row; return safe; }, executed: (p) => !!p && p.status === "executed" && p.execution && p.execution.executed,
    async governed() { return executed; }, async createConnectorRaw() { throw new Error("not used"); }, async invokeBedrock() { throw new Error("not used"); }, async checkBedrockHealthRaw() { throw new Error("not used"); },
    async deliverWebhookRaw() { webhookCalls++; return { delivered: true }; }, async dispatchEvent() { webhookCalls++; return []; },
    async submitEvidence(p) { return runtimeStore.insert("integration_events", p); },
  };
  const wrapped = wrapIntegrationGateway(base, runtimeStore);
  await assert.rejects(() => wrapped.deliverWebhookRaw({ org_id: "org-a", environment_id: "env-a", webhook_id: "wh-a", payload: {} }, { env: { GUARDIANOS_DEPLOYMENT_MODE: "sovereign" } }), /disabled by default/);
  ok(webhookCalls === 0, "sovereign webhook disablement occurs before network delivery");
  await wrapped.submitEvidence({ org_id: "org-a", environment_id: "env-a", type: "test", evidence: { api_key: "never-store-me" } });
  ok(writes.length === 1 && !JSON.stringify(writes).includes("never-store-me"), "production evidence path writes redacted evidence locally");
  ok((await wrapped.dispatchEvent({ org_id: "org-a", environment_id: "env-a", event_type: "x", payload: {} })).length === 0, "sovereign dispatch disables external webhooks");

  const first = await registry.resolve({ provider: "custom" });
  const second = await registry.resolve({ provider: "custom" });
  ok(first.token !== second.token, "credential rotation is observed without restart");

  console.log(`Sovereign connector integration: ${pass} passed, 0 failed`);
})().catch((error) => { console.error(error); process.exit(1); });

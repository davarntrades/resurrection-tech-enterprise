#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { CredentialProviderRegistry, callbackProvider } = require("../../lib/runtime/sovereign/credentials");
const azure = require("../../lib/runtime/connectors/azure-ai");
const google = require("../../lib/runtime/connectors/google-vertex-ai");
const aws = require("../../lib/runtime/connectors/aws-bedrock");
const { prepareProviderCall } = require("../../lib/runtime/sovereign/provider-runtime");

const executed = { status: "executed", execution: { executed: true } };
const approved = (url) => ({ mode: "approved_endpoints_only", approved_endpoints: [url] });

(async () => {
  let resolved = 0;
  const registry = new CredentialProviderRegistry().register("custom", callbackProvider(async () => ({ token: `rotated-${++resolved}` })));

  let awsRuntimeOptions;
  class FakeBedrockClient { constructor(options) { awsRuntimeOptions = options; } async send() { return { output: {}, $metadata: { requestId: "test" } }; } }
  class FakeCommand { constructor(input) { this.input = input; } }
  await aws.invoke({ region: "eu-west-2", auth_method: "access_key", provider_endpoints: { runtime: "https://bedrock.customer.invalid/", sts: "https://sts.customer.invalid/" } }, { access_key_id: "AKIATEST000000000000", secret_access_key: "not-a-real-secret" }, { model_id: "model", messages: [{ role: "user", content: [{ text: "test" }] }] }, { BedrockRuntimeClient: FakeBedrockClient, ConverseCommand: FakeCommand });
  assert.equal(awsRuntimeOptions.endpoint, "https://bedrock.customer.invalid/");

  let stsOptions;
  class FakeSTS { constructor(options) { stsOptions = options; } async send(command) { return command.constructor.name === "Assume" ? { Credentials: { AccessKeyId: "x", SecretAccessKey: "y", SessionToken: "z" } } : { Account: "123456789012" }; } }
  class Assume { constructor(input) { this.input = input; } }
  class Identity { constructor(input) { this.input = input; } }
  await aws.validateCredentials({ region: "us-gov-west-1", auth_method: "role", role_arn: "arn:aws-us-gov:iam::123456789012:role/Guardian", provider_endpoints: { sts: "https://sts.gov.customer.invalid/" } }, {}, { STSClient: FakeSTS, AssumeRoleCommand: Assume, GetCallerIdentityCommand: Identity });
  assert.equal(stsOptions.endpoint, "https://sts.gov.customer.invalid/");

  let azureFactory = 0;
  const azureEndpoint = "https://azure.customer.invalid/openai/";
  const azureResult = await azure.execute({ service: "openai", config: { provider_endpoints: { openai: azureEndpoint } }, credentialRegistry: registry, credentialReference: { provider: "custom" }, outboundPolicy: approved(azureEndpoint), proposal: executed, clientFactory(options) { azureFactory++; assert.equal(options.endpoint, azureEndpoint); assert.equal(options.credentials.token, "rotated-1"); return { execute: async () => ({ ok: true, endpoint: options.endpoint }) }; } });
  assert.equal(azureResult.endpoint, azureEndpoint); assert.equal(azureFactory, 1);

  let googleFactory = 0;
  const googleEndpoint = "https://vertex.customer.invalid/";
  await google.execute({ service: "vertex", config: { project_id: "customer", location: "europe-west4", provider_endpoints: { vertex: googleEndpoint } }, credentialRegistry: registry, credentialReference: { provider: "custom" }, outboundPolicy: approved(googleEndpoint), proposal: executed, clientFactory(options) { googleFactory++; assert.equal(options.endpoint, googleEndpoint); assert.equal(options.credentials.token, "rotated-2"); return { execute: async () => ({ ok: true }) }; } });
  assert.equal(googleFactory, 1);

  let deniedCalls = 0;
  await assert.rejects(() => azure.execute({ service: "openai", config: { provider_endpoints: { openai: azureEndpoint } }, credentialRegistry: registry, credentialReference: { provider: "custom" }, outboundPolicy: { mode: "none" }, proposal: executed, clientFactory() { deniedCalls++; return { execute: async () => ({}) }; } }), /denied before network execution/);
  assert.equal(deniedCalls, 0);

  let blockedCalls = 0;
  await assert.rejects(() => google.execute({ service: "vertex", config: { provider_endpoints: { vertex: googleEndpoint } }, credentialRegistry: registry, credentialReference: { provider: "custom" }, outboundPolicy: approved(googleEndpoint), proposal: { status: "blocked" }, clientFactory() { blockedCalls++; return { execute: async () => ({}) }; } }), /requires a verified executed proposal/);
  assert.equal(blockedCalls, 0);

  const failingRegistry = new CredentialProviderRegistry().register("custom", callbackProvider(async () => { throw new Error("secret unavailable"); }));
  await assert.rejects(() => prepareProviderCall({ connectorType: "azure", config: { provider_endpoints: { openai: azureEndpoint } }, service: "openai", credentialRegistry: failingRegistry, credentialReference: { provider: "custom" }, outboundPolicy: approved(azureEndpoint), proposal: executed }), /secret unavailable/);

  console.log("Sovereign connector integration: 16 passed, 0 failed");
})().catch((error) => { console.error(error); process.exit(1); });

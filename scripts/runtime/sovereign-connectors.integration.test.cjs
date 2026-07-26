#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { CredentialProviderRegistry, callbackProvider } = require("../../lib/runtime/sovereign/credentials");
const azure = require("../../lib/runtime/connectors/azure-ai");
const google = require("../../lib/runtime/connectors/google-vertex-ai");
const { prepareProviderCall } = require("../../lib/runtime/sovereign/provider-runtime");

const executed = { status: "executed", execution: { executed: true } };
const approved = (url) => ({ mode: "approved_endpoints_only", approved_endpoints: [url] });

(async () => {
  let resolved = 0;
  const registry = new CredentialProviderRegistry().register("custom", callbackProvider(async () => { resolved++; return { token: `rotated-${resolved}` }; }));

  let azureFactory = 0;
  const azureEndpoint = "https://azure.customer.invalid/openai/";
  const azureResult = await azure.execute({
    service: "openai",
    config: { provider_endpoints: { openai: azureEndpoint } },
    credentialRegistry: registry,
    credentialReference: { provider: "custom" },
    outboundPolicy: approved(azureEndpoint),
    proposal: executed,
    clientFactory(options) {
      azureFactory++;
      assert.equal(options.endpoint, azureEndpoint);
      assert.equal(options.credentials.token, "rotated-1");
      return { execute: async () => ({ ok: true, endpoint: options.endpoint }) };
    },
  });
  assert.equal(azureResult.endpoint, azureEndpoint);
  assert.equal(azureFactory, 1);

  let googleFactory = 0;
  const googleEndpoint = "https://vertex.customer.invalid/";
  await google.execute({
    service: "vertex",
    config: { project_id: "customer", location: "europe-west4", provider_endpoints: { vertex: googleEndpoint } },
    credentialRegistry: registry,
    credentialReference: { provider: "custom" },
    outboundPolicy: approved(googleEndpoint),
    proposal: executed,
    clientFactory(options) {
      googleFactory++;
      assert.equal(options.endpoint, googleEndpoint);
      assert.equal(options.credentials.token, "rotated-2");
      return { execute: async () => ({ ok: true }) };
    },
  });
  assert.equal(googleFactory, 1);

  let deniedCalls = 0;
  await assert.rejects(() => azure.execute({
    service: "openai", config: { provider_endpoints: { openai: azureEndpoint } }, credentialRegistry: registry,
    credentialReference: { provider: "custom" }, outboundPolicy: { mode: "none" }, proposal: executed,
    clientFactory() { deniedCalls++; return { execute: async () => ({}) }; },
  }), /denied before network execution/);
  assert.equal(deniedCalls, 0);

  let blockedCalls = 0;
  await assert.rejects(() => google.execute({
    service: "vertex", config: { provider_endpoints: { vertex: googleEndpoint } }, credentialRegistry: registry,
    credentialReference: { provider: "custom" }, outboundPolicy: approved(googleEndpoint), proposal: { status: "blocked" },
    clientFactory() { blockedCalls++; return { execute: async () => ({}) }; },
  }), /requires a verified executed proposal/);
  assert.equal(blockedCalls, 0);

  let credentialFailureCalls = 0;
  const failingRegistry = new CredentialProviderRegistry().register("custom", callbackProvider(async () => { throw new Error("secret unavailable"); }));
  await assert.rejects(() => prepareProviderCall({
    connectorType: "azure", config: { provider_endpoints: { openai: azureEndpoint } }, service: "openai",
    credentialRegistry: failingRegistry, credentialReference: { provider: "custom" }, outboundPolicy: approved(azureEndpoint), proposal: executed,
  }), /secret unavailable/);
  assert.equal(credentialFailureCalls, 0);

  const rotated = await registry.resolve({ provider: "custom" });
  assert.equal(rotated.token, "rotated-4");

  console.log("Sovereign connector integration: 12 passed, 0 failed");
})().catch((error) => { console.error(error); process.exit(1); });

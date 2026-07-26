#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const sovereign = require("../../lib/runtime/sovereign");

(async () => {
  const aws = sovereign.endpoints.normalizeProviderEndpoints("aws-bedrock", { provider_endpoints: {
    runtime: "https://bedrock-runtime.vpce.example.internal",
    agent_runtime: "https://bedrock-agent.vpce.example.internal",
    sts: "https://sts.gov.example",
  } }, { allowPrivate: true });
  assert.equal(aws.runtime, "https://bedrock-runtime.vpce.example.internal/");
  assert.equal(aws.agent_runtime, "https://bedrock-agent.vpce.example.internal/");
  assert.equal(aws.sts, "https://sts.gov.example/");

  const azure = sovereign.endpoints.normalizeProviderEndpoints("azure", { endpoints: { openai: "https://agency.openai.azure.us" } });
  const google = sovereign.endpoints.normalizeProviderEndpoints("google-vertex-ai", { endpoints: { vertex: "https://vertex.private.example" } });
  assert.equal(azure.openai, "https://agency.openai.azure.us/");
  assert.equal(google.vertex, "https://vertex.private.example/");
  assert.throws(() => sovereign.endpoints.validateEndpoint("https://user:secret@example.com"), /must not contain credentials/);

  let rotated = "first";
  const registry = new sovereign.credentials.CredentialProviderRegistry()
    .register("custom", sovereign.credentials.callbackProvider(async () => ({ token: rotated })));
  assert.equal((await registry.resolve({ provider: "custom" })).token, "first");
  rotated = "second";
  assert.equal((await registry.resolve({ provider: "custom" })).token, "second");

  const secret = "AKIAABCDEFGHIJKLMNOP";
  const redacted = sovereign.redaction.redact({ api_key: secret, nested: { authorization: `Bearer ${secret}` } });
  assert.equal(redacted.api_key, "[REDACTED]");
  assert(!JSON.stringify(redacted).includes(secret));

  let calls = 0;
  await assert.rejects(() => sovereign.outbound.governedFetch(
    { mode: "none" },
    { url: "https://api.example.com", purpose: "provider" },
    null,
    async () => { calls++; return {}; },
  ), /denied before network execution/);
  assert.equal(calls, 0);

  const approved = { mode: "approved_endpoints_only", approved_endpoints: ["https://private.provider.example"] };
  await sovereign.outbound.governedFetch(approved, { url: "https://private.provider.example/v1", purpose: "provider" },
    async () => ({ status: "executed", execution: { executed: true } }), async () => { calls++; return { ok: true }; });
  assert.equal(calls, 1);
  await assert.rejects(() => sovereign.outbound.governedFetch(approved, { url: "https://other.example", purpose: "provider" }, null,
    async () => { calls++; return {}; }));
  assert.equal(calls, 1);

  const policy = sovereign.deployment.validateStartup({ GUARDIANOS_DEPLOYMENT_MODE: "sovereign" });
  assert.equal(policy.resurrection_control_plane_required, false);
  assert.equal(policy.telemetry_enabled, false);
  assert.throws(() => sovereign.deployment.validateStartup({ GUARDIANOS_DEPLOYMENT_MODE: "sovereign", RESURRECTION_CONTROL_PLANE_REQUIRED: "1" }));

  const writes = [];
  const runtimeStore = { insert: async (collection, record) => { writes.push({ collection, record }); return record; }, find: async () => [] };
  const evidence = sovereign.evidence.localRuntimeStore(runtimeStore);
  await evidence.write("runtime_evidence", { org_id: "org-a", environment_id: "env-a", verdict: "blocked" }, { org_id: "org-a", environment_id: "env-a" });
  assert.equal(writes.length, 1);
  await assert.rejects(() => evidence.write("runtime_evidence", { org_id: "org-b", environment_id: "env-a" }, { org_id: "org-a", environment_id: "env-a" }));
  assert.equal(sovereign.evidence.evidenceDeliveryDefaults(policy).external_export_enabled, false);

  console.log("Sovereign readiness contracts: 20 passed, 0 failed");
})().catch((error) => { console.error(error); process.exit(1); });

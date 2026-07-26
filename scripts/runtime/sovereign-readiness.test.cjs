#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const sovereign = require("../../lib/runtime/sovereign");
let pass = 0;
function ok(value, message) { assert.ok(value, message); pass++; }

(async () => {
  const aws = sovereign.endpoints.normalizeProviderEndpoints("aws-bedrock", { provider_endpoints: {
    runtime: "https://bedrock-runtime.vpce.example.internal",
    agent_runtime: "https://bedrock-agent.vpce.example.internal",
    sts: "https://sts.gov.example",
  } }, { allowPrivate: true });
  ok(aws.runtime === "https://bedrock-runtime.vpce.example.internal/", "AWS runtime endpoint normalized");
  ok(aws.agent_runtime === "https://bedrock-agent.vpce.example.internal/", "AWS agent endpoint normalized");
  ok(aws.sts === "https://sts.gov.example/", "AWS STS endpoint normalized");

  const azure = sovereign.endpoints.normalizeProviderEndpoints("azure", { endpoints: { openai: "https://agency.openai.azure.us" } });
  const google = sovereign.endpoints.normalizeProviderEndpoints("google-vertex-ai", { endpoints: { vertex: "https://vertex.private.example" } });
  ok(azure.openai === "https://agency.openai.azure.us/", "Azure sovereign endpoint normalized");
  ok(google.vertex === "https://vertex.private.example/", "Google private endpoint normalized");
  assert.throws(() => sovereign.endpoints.validateEndpoint("https://user:secret@example.com"), /must not contain credentials/); pass++;
  assert.throws(() => sovereign.endpoints.validateEndpoint("http://unsafe.example"), /HTTPS/); pass++;

  let rotated = "first";
  const registry = new sovereign.credentials.CredentialProviderRegistry().register("custom", sovereign.credentials.callbackProvider(async () => ({ token: rotated })));
  ok((await registry.resolve({ provider: "custom" })).token === "first", "credential provider resolves first version");
  rotated = "second";
  ok((await registry.resolve({ provider: "custom" })).token === "second", "credential provider refreshes without restart");

  const secrets = {
    bearer: "Bearer eyJhbGciOiJIUzI1NiJ9.realistic.payload",
    aws_access_key: "AKIAABCDEFGHIJKLMNOP",
    client_secret: "client-secret-value-123",
    api_key: "api-key-value-456",
    private_key: "-----BEGIN PRIVATE KEY-----\nABCDEF123456\n-----END PRIVATE KEY-----",
    nested: { credentials: { password: "password-value", refresh_token: "refresh-token-value" } },
    message: "api_key=plain-text-key client_secret:another-secret",
  };
  const serialized = sovereign.redaction.safeSerialize(secrets);
  for (const value of ["eyJhbGciOiJIUzI1NiJ9.realistic.payload", "AKIAABCDEFGHIJKLMNOP", "client-secret-value-123", "api-key-value-456", "ABCDEF123456", "password-value", "refresh-token-value", "plain-text-key", "another-secret"]) ok(!serialized.includes(value), `serialized output excludes ${value.slice(0, 8)}`);

  let calls = 0;
  await assert.rejects(() => sovereign.outbound.governedFetch({ mode: "none" }, { url: "https://api.example.com", purpose: "provider" }, null, async () => { calls++; return {}; }), /denied before network execution/);
  ok(calls === 0, "outbound none blocks before fetch");

  const approved = { mode: "approved_endpoints_only", approved_endpoints: ["https://private.provider.example"] };
  await sovereign.outbound.governedFetch(approved, { url: "https://private.provider.example/v1", purpose: "provider" }, async () => ({ status: "executed", execution: { executed: true } }), async () => { calls++; return { ok: true }; });
  ok(calls === 1, "approved endpoint reaches fetch once");
  await assert.rejects(() => sovereign.outbound.governedFetch(approved, { url: "https://other.example", purpose: "provider" }, null, async () => { calls++; return {}; }));
  ok(calls === 1, "unapproved endpoint never reaches fetch");

  let sdkCalls = 0;
  class Command { constructor(input) { this.input = input; } }
  const awsProvider = sovereign.credentialAdapters.awsSecretsManagerProvider({ endpoint: "https://secrets.customer.invalid/", client: { async send() { sdkCalls++; return { SecretString: "{}" }; } }, GetSecretValueCommand: Command });
  await assert.rejects(() => awsProvider.resolve({ secret_id: "x", outbound_policy: { mode: "none" } }, {}), /denied before network execution/);
  ok(sdkCalls === 0, "AWS Secrets Manager denied before SDK send");

  const azureProvider = sovereign.credentialAdapters.azureKeyVaultProvider({ endpoint: "https://vault.customer.invalid/", client: { async getSecret() { sdkCalls++; return { value: "{}" }; } } });
  await assert.rejects(() => azureProvider.resolve({ secret_name: "x", outbound_policy: { mode: "none" } }, {}), /denied before network execution/);
  ok(sdkCalls === 0, "Azure Key Vault denied before client invocation");

  const googleProvider = sovereign.credentialAdapters.googleSecretManagerProvider({ endpoint: "https://secretmanager.customer.invalid/", client: { async accessSecretVersion() { sdkCalls++; return [{ payload: { data: Buffer.from("{}") } }]; } } });
  await assert.rejects(() => googleProvider.resolve({ secret_name: "projects/p/secrets/x", outbound_policy: { mode: "none" } }, {}), /denied before network execution/);
  ok(sdkCalls === 0, "Google Secret Manager denied before client invocation");

  const policy = sovereign.deployment.validateStartup({ GUARDIANOS_DEPLOYMENT_MODE: "sovereign" });
  ok(policy.resurrection_control_plane_required === false, "sovereign mode has no RT control-plane requirement");
  ok(policy.telemetry_enabled === false, "sovereign telemetry defaults off");
  assert.throws(() => sovereign.deployment.validateStartup({ GUARDIANOS_DEPLOYMENT_MODE: "sovereign", RESURRECTION_CONTROL_PLANE_REQUIRED: "1" })); pass++;

  const writes = [];
  const runtimeStore = { insert: async (collection, record) => { writes.push({ collection, record }); return record; }, find: async () => [] };
  const evidence = sovereign.evidence.localRuntimeStore(runtimeStore);
  await evidence.write("runtime_evidence", { org_id: "org-a", environment_id: "env-a", verdict: "blocked" }, { org_id: "org-a", environment_id: "env-a" });
  ok(writes.length === 1, "evidence writes to configured local store");
  await assert.rejects(() => evidence.write("runtime_evidence", { org_id: "org-b", environment_id: "env-a" }, { org_id: "org-a", environment_id: "env-a" })); pass++;
  ok(sovereign.evidence.evidenceDeliveryDefaults(policy).external_export_enabled === false, "external evidence export defaults off");
  ok(sovereign.evidence.evidenceDeliveryDefaults(policy).webhook_delivery_enabled === false, "webhook evidence delivery defaults off");

  console.log(`Sovereign readiness contracts: ${pass} passed, 0 failed`);
})().catch((error) => { console.error(error); process.exit(1); });

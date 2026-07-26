"use strict";

const crypto = require("node:crypto");
const { CredentialProviderRegistry, callbackProvider, environmentProvider } = require("./credentials");
const adapters = require("./credential-adapters");
const { normalizeProviderEndpoints, endpointFor } = require("./endpoints");
const { authorize } = require("./outbound-policy");
const { deploymentPolicy } = require("./deployment");
const { redact, safeError } = require("./redaction");

function truthy(value) { return /^(1|true|yes)$/i.test(String(value || "")); }
function encryptedLocalProvider(secret) { return callbackProvider(async () => ({ ...(secret || {}) })); }

function openEncrypted(sealed, env = process.env) {
  if (!sealed) return {};
  const raw = env.INTEGRATION_SECRET_KEY || "";
  if (!raw) throw new Error("INTEGRATION_SECRET_KEY is required to resolve encrypted local connector credentials");
  const [version, iv, tag, data] = String(sealed).split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("invalid encrypted connector secret");
  const key = crypto.createHash("sha256").update(raw).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8"));
}

function credentialRegistry(secret, dependencies = {}) {
  const registry = new CredentialProviderRegistry()
    .register("encrypted_local", encryptedLocalProvider(secret))
    .register("environment", environmentProvider(dependencies.env || process.env));
  if (dependencies.awsSecretsManager) registry.register("aws_secrets_manager", adapters.awsSecretsManagerProvider(dependencies.awsSecretsManager));
  if (dependencies.azureKeyVault) registry.register("azure_key_vault", adapters.azureKeyVaultProvider(dependencies.azureKeyVault));
  if (dependencies.googleSecretManager) registry.register("google_secret_manager", adapters.googleSecretManagerProvider(dependencies.googleSecretManager));
  if (dependencies.hashicorpVault) registry.register("hashicorp_vault", adapters.hashicorpVaultProvider(dependencies.hashicorpVault));
  if (dependencies.kubernetesSecrets) registry.register("kubernetes_secrets", adapters.kubernetesSecretsProvider(dependencies.kubernetesSecrets));
  for (const [name, provider] of Object.entries(dependencies.credentialProviders || {})) registry.register(name, provider);
  return registry;
}

function credentialReference(config = {}) { return config.credential_provider || config.credential_reference || { provider: "encrypted_local" }; }

function policyFor(config = {}, endpoint, env = process.env) {
  const configured = config.outbound_policy || {};
  if (configured.mode) return configured;
  const deployment = deploymentPolicy(env);
  const approved = [...new Set([...(configured.approved_endpoints || []), ...(!deployment.sovereign && endpoint ? [endpoint] : [])])];
  return { mode: String(env.GUARDIANOS_OUTBOUND_POLICY || "approved_endpoints_only"), approved_endpoints: approved };
}

function contextFor(row, dependencies = {}) {
  return {
    org_id: row.org_id, expected_org_id: row.org_id,
    environment_id: row.environment_id, expected_environment_id: row.environment_id,
    connector_id: row.id, evidence_required: true, evidence_ready: true,
    env: dependencies.env || process.env,
  };
}

function assertConnector(row, p, allowedTypes) {
  if (!row || row.org_id !== p.org_id) throw new Error("connector not found");
  if (row.environment_id !== p.environment_id) throw new Error("connector environment mismatch");
  if (!allowedTypes.includes(row.type)) throw new Error("connector type mismatch");
  if (row.status === "disabled") throw new Error("connector is disabled");
}

function wrapIntegrationGateway(base, runtimeStore) {
  const wrapped = { ...base };
  wrapped.CONNECTOR_DEFINITIONS = Object.freeze([...base.CONNECTOR_DEFINITIONS, { id: "google-vertex-ai", name: "Google Vertex AI", extensible: false }]);
  wrapped.connectorDefinition = (type) => wrapped.CONNECTOR_DEFINITIONS.find((c) => c.id === type) || base.connectorDefinition(type);

  wrapped.createConnectorRaw = async function createConnectorRaw(p) {
    if (p.type !== "google-vertex-ai") return base.createConnectorRaw(p);
    const created = await base.createConnectorRaw({ ...p, type: "google_cloud" });
    await runtimeStore.update("integration_connectors", created.id, { type: "google-vertex-ai" });
    return wrapped.publicConnector(await runtimeStore.findOne("integration_connectors", { id: created.id }));
  };

  wrapped.invokeBedrock = async function invokeBedrock(p, dependencies = {}) {
    const aws = require("../connectors/aws-bedrock");
    return base.invokeBedrock(p, {
      ...dependencies,
      invoke: async (config, encryptedLocalSecret, request, providerOverrides = {}) => {
        const endpoints = normalizeProviderEndpoints("aws-bedrock", config, { allowPrivate: true });
        const destination = endpointFor({ provider_endpoints: endpoints }, "runtime", `https://bedrock-runtime.${config.region}.amazonaws.com/`);
        await authorize(dependencies.outboundPolicy || policyFor(config, destination, dependencies.env), { url: destination, purpose: "provider_execution", metadata: { connector_type: "aws-bedrock", service: "runtime", org_id: p.org_id, environment_id: p.environment_id } }, dependencies.outboundGovernance || null);
        const registry = credentialRegistry(encryptedLocalSecret, dependencies);
        const credentials = await registry.resolve(credentialReference(config), { org_id: p.org_id, environment_id: p.environment_id, connector_id: p.connector_id, outbound_policy: dependencies.outboundPolicy || policyFor(config, destination, dependencies.env), governance: dependencies.outboundGovernance });
        return aws.invoke({ ...config, provider_endpoints: endpoints }, credentials, request, providerOverrides);
      },
    });
  };

  wrapped.checkBedrockHealthRaw = async function checkBedrockHealthRaw(p, dependencies = {}) {
    const aws = require("../connectors/aws-bedrock");
    const row = await runtimeStore.findOne("integration_connectors", { id: p.connector_id });
    assertConnector(row, p, ["aws-bedrock"]);
    const secret = openEncrypted(row.secret_encrypted, dependencies.env || process.env);
    const endpoints = normalizeProviderEndpoints("aws-bedrock", row.config || {}, { allowPrivate: true });
    const destination = endpointFor({ provider_endpoints: endpoints }, "sts", `https://sts.${row.config.region}.amazonaws.com/`);
    await authorize(dependencies.outboundPolicy || policyFor(row.config, destination, dependencies.env), { url: destination, purpose: "identity", metadata: { connector_type: "aws-bedrock", service: "sts" } }, dependencies.outboundGovernance || null);
    const registry = credentialRegistry(secret, dependencies);
    const credentials = await registry.resolve(credentialReference(row.config || {}), { org_id: row.org_id, environment_id: row.environment_id, connector_id: row.id, outbound_policy: dependencies.outboundPolicy || policyFor(row.config, destination, dependencies.env), governance: dependencies.outboundGovernance });
    const identity = await aws.validateCredentials({ ...(row.config || {}), provider_endpoints: endpoints }, credentials, dependencies);
    const now = runtimeStore.nowISO();
    await runtimeStore.update("integration_connectors", row.id, { config: { ...(row.config || {}), aws_account_id: identity.account_id, credential_validated_at: now, last_successful_request: now }, health: "healthy", last_checked_at: now, last_error: null });
    return wrapped.publicConnector(await runtimeStore.findOne("integration_connectors", { id: row.id }));
  };

  wrapped.invokeFirstClassConnector = async function invokeFirstClassConnector(p, dependencies = {}) {
    const row = await runtimeStore.findOne("integration_connectors", { id: p.connector_id });
    assertConnector(row, p, ["azure", "google_cloud", "google-vertex-ai", "aws-bedrock"]);
    const proposal = await (dependencies.governed || base.governed)(p.action_id || "invoke_integration_connector", { org_id: p.org_id, environment_id: p.environment_id, actor: p.actor || "customer", params: { connector_id: row.id, service: p.service, request_hash: runtimeStore.sha256(JSON.stringify(p.request || {})) } });
    if (!base.executed(proposal)) return { ok: false, code: proposal && proposal.status === "escalated" ? "GOVERNANCE_ESCALATED" : "GOVERNANCE_BLOCKED", governance: proposal && proposal.status || "blocked" };
    const secret = openEncrypted(row.secret_encrypted, dependencies.env || process.env);
    const registry = credentialRegistry(secret, dependencies);
    const common = { config: { ...(row.config || {}), org_id: row.org_id, environment_id: row.environment_id }, credentialRegistry: registry, credentialReference: credentialReference(row.config || {}), credentialContext: contextFor(row, dependencies), outboundPolicy: dependencies.outboundPolicy || (row.config && row.config.outbound_policy), governance: dependencies.outboundGovernance, proposal, request: p.request || {}, clientFactory: dependencies.clientFactory, fetchImpl: dependencies.fetchImpl };
    let result;
    if (row.type === "azure") result = await require("../connectors/azure-ai").execute({ ...common, service: p.service || "openai" });
    else if (["google_cloud", "google-vertex-ai"].includes(row.type)) result = await require("../connectors/google-vertex-ai").execute({ ...common, service: p.service || "vertex" });
    else if ((p.service || "runtime") === "runtime") return wrapped.invokeBedrock({ ...p, request: p.request || {} }, dependencies);
    else result = await require("../connectors/aws-bedrock").invokeAgentRuntime({ ...(row.config || {}), org_id: row.org_id, environment_id: row.environment_id }, await registry.resolve(credentialReference(row.config || {}), contextFor(row, dependencies)), p.request || {}, { ...dependencies, proposal });
    const evidence = await wrapped.submitEvidence({ org_id: p.org_id, environment_id: p.environment_id, type: `${row.type}.${p.service || "execute"}.result`, actor: p.actor || "customer", evidence: { connector_id: row.id, proposal_id: proposal.id, governance_evidence_id: proposal.evidence_id, outcome: "success", result: redact(result) } });
    return { ok: true, result: redact(result), governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id, status: proposal.status }, evidence };
  };

  wrapped.deliverWebhookRaw = async function deliverWebhookRaw(p, dependencies = {}) {
    const deployment = deploymentPolicy(dependencies.env || process.env);
    if (deployment.sovereign && !truthy((dependencies.env || process.env).GUARDIANOS_EXTERNAL_WEBHOOKS)) { const error = new Error("external webhook delivery is disabled by default in sovereign mode"); error.code = "SOVEREIGN_WEBHOOK_DISABLED"; throw error; }
    const webhook = await runtimeStore.findOne("integration_webhooks", { id: p.webhook_id });
    if (!webhook || webhook.org_id !== p.org_id) throw new Error("webhook not found");
    if (p.environment_id && webhook.environment_id !== p.environment_id) throw new Error("webhook environment mismatch");
    await authorize(dependencies.outboundPolicy || policyFor(webhook, webhook.url, dependencies.env), { url: webhook.url, purpose: "webhook", metadata: { webhook_id: webhook.id, org_id: p.org_id, environment_id: webhook.environment_id } }, dependencies.outboundGovernance || null);
    return base.deliverWebhookRaw({ ...p, payload: redact(p.payload || {}) });
  };

  wrapped.dispatchEvent = async function dispatchEvent(p) { const deployment = deploymentPolicy(process.env); if (deployment.sovereign && !truthy(process.env.GUARDIANOS_EXTERNAL_WEBHOOKS)) return []; return base.dispatchEvent({ ...p, payload: redact(p.payload || {}) }); };
  wrapped.submitEvidence = async function submitEvidence(p) { const environment = await runtimeStore.findOne("environments", { id: p.environment_id }); if (!environment || environment.org_id !== p.org_id) throw new Error("environment not found"); return base.submitEvidence({ ...p, evidence: redact(p.evidence || {}) }); };
  wrapped.safeFailure = (error, fallback) => safeError(error, fallback);
  wrapped.credentialRegistry = credentialRegistry;
  wrapped.policyFor = policyFor;
  return wrapped;
}

module.exports = { wrapIntegrationGateway, credentialRegistry, credentialReference, policyFor, openEncrypted };

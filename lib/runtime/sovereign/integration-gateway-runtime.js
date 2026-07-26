"use strict";

const crypto = require("node:crypto");
const { CredentialProviderRegistry, callbackProvider, environmentProvider } = require("./credentials");
const adapters = require("./credential-adapters");
const { normalizeProviderEndpoints, endpointFor } = require("./endpoints");
const { authorize } = require("./outbound-policy");
const { deploymentPolicy } = require("./deployment");
const { redact, safeError } = require("./redaction");

function truthy(value) { return /^(1|true|yes)$/i.test(String(value || "")); }

function encryptedLocalProvider(secret) {
  return callbackProvider(async () => ({ ...(secret || {}) }));
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

function credentialReference(config = {}) {
  return config.credential_provider || config.credential_reference || { provider: "encrypted_local" };
}

function policyFor(config = {}, endpoint, env = process.env) {
  const configured = config.outbound_policy || {};
  if (configured.mode) return configured;
  const mode = String(env.GUARDIANOS_OUTBOUND_POLICY || "approved_endpoints_only");
  const approved = [...new Set([...(configured.approved_endpoints || []), ...(endpoint ? [endpoint] : [])])];
  return { mode, approved_endpoints: approved };
}

function wrapIntegrationGateway(base, runtimeStore) {
  const wrapped = { ...base };

  wrapped.invokeBedrock = async function invokeBedrock(p, dependencies = {}) {
    const aws = require("../connectors/aws-bedrock");
    return base.invokeBedrock(p, {
      ...dependencies,
      invoke: async (config, encryptedLocalSecret, request, providerOverrides = {}) => {
        const endpoints = normalizeProviderEndpoints("aws-bedrock", config, { allowPrivate: true });
        const runtimeEndpoint = endpointFor({ provider_endpoints: endpoints }, "runtime", `https://bedrock-runtime.${config.region}.amazonaws.com/`);
        const registry = credentialRegistry(encryptedLocalSecret, dependencies);
        const credentials = await registry.resolve(credentialReference(config), {
          org_id: p.org_id, environment_id: p.environment_id, connector_id: p.connector_id,
          outbound_policy: policyFor(config, runtimeEndpoint), governance: dependencies.outboundGovernance,
        });
        await authorize(policyFor(config, runtimeEndpoint), {
          url: runtimeEndpoint, purpose: "provider_execution",
          metadata: { connector_type: "aws-bedrock", service: "runtime", org_id: p.org_id, environment_id: p.environment_id },
        }, dependencies.outboundGovernance || null);
        return aws.invoke({ ...config, provider_endpoints: endpoints }, credentials, request, providerOverrides);
      },
    });
  };

  wrapped.checkBedrockHealthRaw = async function checkBedrockHealthRaw(p, dependencies = {}) {
    const aws = require("../connectors/aws-bedrock");
    return base.checkBedrockHealthRaw(p, {
      ...dependencies,
      STSClient: class GovernedSTSClient {
        constructor(options) {
          const destination = options.endpoint || `https://sts.${p.region || "us-east-1"}.amazonaws.com/`;
          const Factory = dependencies.STSClient;
          if (typeof Factory !== "function") return new (require("@aws-sdk/client-sts").STSClient)(options);
          const client = new Factory(options);
          const originalSend = client.send.bind(client);
          client.send = async (...args) => {
            await authorize(dependencies.outboundPolicy || policyFor({}, destination), {
              url: destination, purpose: "identity", metadata: { connector_type: "aws-bedrock", service: "sts" },
            }, dependencies.outboundGovernance || null);
            return originalSend(...args);
          };
          return client;
        }
      },
    });
  };

  wrapped.deliverWebhookRaw = async function deliverWebhookRaw(p, dependencies = {}) {
    const deployment = deploymentPolicy(dependencies.env || process.env);
    if (deployment.sovereign && !truthy((dependencies.env || process.env).GUARDIANOS_EXTERNAL_WEBHOOKS)) {
      const error = new Error("external webhook delivery is disabled by default in sovereign mode");
      error.code = "SOVEREIGN_WEBHOOK_DISABLED";
      throw error;
    }
    const webhook = await runtimeStore.findOne("integration_webhooks", { id: p.webhook_id });
    if (!webhook || webhook.org_id !== p.org_id) throw new Error("webhook not found");
    if (p.environment_id && webhook.environment_id !== p.environment_id) throw new Error("webhook environment mismatch");
    await authorize(dependencies.outboundPolicy || policyFor(webhook, webhook.url), {
      url: webhook.url, purpose: "webhook", metadata: { webhook_id: webhook.id, org_id: p.org_id, environment_id: webhook.environment_id },
    }, dependencies.outboundGovernance || null);
    return base.deliverWebhookRaw({ ...p, payload: redact(p.payload || {}) });
  };

  wrapped.dispatchEvent = async function dispatchEvent(p) {
    const deployment = deploymentPolicy(process.env);
    if (deployment.sovereign && !truthy(process.env.GUARDIANOS_EXTERNAL_WEBHOOKS)) return [];
    return base.dispatchEvent({ ...p, payload: redact(p.payload || {}) });
  };

  wrapped.submitEvidence = async function submitEvidence(p) {
    const environment = await runtimeStore.findOne("environments", { id: p.environment_id });
    if (!environment || environment.org_id !== p.org_id) throw new Error("environment not found");
    return base.submitEvidence({ ...p, evidence: redact(p.evidence || {}) });
  };

  wrapped.safeFailure = function safeFailure(error, fallback) { return safeError(error, fallback); };
  wrapped.credentialRegistry = credentialRegistry;
  wrapped.policyFor = policyFor;
  return wrapped;
}

module.exports = { wrapIntegrationGateway, credentialRegistry, credentialReference, policyFor };

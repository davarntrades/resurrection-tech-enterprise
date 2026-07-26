"use strict";

const { prepareProviderCall } = require("../sovereign/provider-runtime");
const { safeError } = require("../sovereign/redaction");

const DEFAULTS = Object.freeze({
  openai: "https://management.azure.com/",
  ai_foundry: "https://management.azure.com/",
  identity: "https://login.microsoftonline.com/",
});

function defaultClient({ endpoint, credentials, fetchImpl = global.fetch }) {
  return {
    async execute(request = {}) {
      if (typeof fetchImpl !== "function") throw new Error("Azure network client is unavailable");
      const url = new URL(String(request.path || ""), endpoint).toString();
      const headers = { ...(request.headers || {}) };
      if (credentials.api_key) headers["api-key"] = String(credentials.api_key);
      if (credentials.access_token) headers.authorization = `Bearer ${credentials.access_token}`;
      try {
        const response = await fetchImpl(url, {
          method: request.method || "POST", headers,
          body: request.body == null ? undefined : (typeof request.body === "string" ? request.body : JSON.stringify(request.body)),
          signal: request.signal,
        });
        return { ok: response.ok, status: response.status, headers: response.headers, body: request.raw ? response.body : await response.text() };
      } catch (error) {
        const safe = safeError(error, "Azure request failed");
        const wrapped = new Error(safe.message); wrapped.code = safe.code || "AZURE_REQUEST_FAILED"; throw wrapped;
      }
    },
  };
}

async function execute({ service = "openai", config = {}, credentialRegistry, credentialReference, credentialContext = {}, outboundPolicy, governance, proposal, request = {}, clientFactory, fetchImpl }) {
  if (!["openai", "ai_foundry", "identity"].includes(service)) throw new Error(`unsupported Azure service: ${service}`);
  const context = {
    ...credentialContext,
    org_id: credentialContext.org_id || config.org_id,
    expected_org_id: credentialContext.expected_org_id || config.org_id,
    environment_id: credentialContext.environment_id || config.environment_id,
    expected_environment_id: credentialContext.expected_environment_id || config.environment_id,
    evidence_required: credentialContext.evidence_required !== false,
    evidence_ready: credentialContext.evidence_ready !== false,
  };
  const prepared = await prepareProviderCall({ connectorType: "azure", config, service, defaultEndpoint: DEFAULTS[service], credentialRegistry, credentialReference, credentialContext: context, outboundPolicy, governance, proposal, purpose: service === "identity" ? "identity" : "provider_execution" });
  const factory = typeof clientFactory === "function" ? clientFactory : (options) => defaultClient({ ...options, fetchImpl });
  const client = factory({ endpoint: prepared.endpoint, credentials: prepared.credentials, service, config });
  if (!client || typeof client.execute !== "function") throw new Error("Azure client must implement execute(request)");
  return client.execute(request);
}

module.exports = { DEFAULTS, defaultClient, execute };

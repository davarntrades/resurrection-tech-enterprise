"use strict";

const { prepareProviderCall } = require("../sovereign/provider-runtime");

const DEFAULTS = Object.freeze({
  openai: "https://management.azure.com/",
  ai_foundry: "https://management.azure.com/",
  identity: "https://login.microsoftonline.com/",
});

async function execute({ service = "openai", config = {}, credentialRegistry, credentialReference, credentialContext, outboundPolicy, governance, proposal, request = {}, clientFactory }) {
  if (!["openai", "ai_foundry", "identity"].includes(service)) throw new Error(`unsupported Azure service: ${service}`);
  const prepared = await prepareProviderCall({ connectorType: "azure", config, service, defaultEndpoint: DEFAULTS[service], credentialRegistry, credentialReference, credentialContext, outboundPolicy, governance, proposal, purpose: service === "identity" ? "identity" : "provider_execution" });
  if (typeof clientFactory !== "function") throw new Error("Azure connector requires a clientFactory");
  const client = clientFactory({ endpoint: prepared.endpoint, credentials: prepared.credentials, service, config });
  if (!client || typeof client.execute !== "function") throw new Error("Azure client must implement execute(request)");
  return client.execute(request);
}

module.exports = { DEFAULTS, execute };

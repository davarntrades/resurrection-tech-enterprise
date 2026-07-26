"use strict";

const { prepareProviderCall } = require("../sovereign/provider-runtime");

function defaults(config = {}) {
  const location = String(config.location || "us-central1");
  const project = String(config.project_id || "");
  return {
    vertex: `https://${location}-aiplatform.googleapis.com/`,
    gemini: "https://generativelanguage.googleapis.com/",
    identity: "https://oauth2.googleapis.com/",
    project,
  };
}

async function execute({ service = "vertex", config = {}, credentialRegistry, credentialReference, credentialContext, outboundPolicy, governance, proposal, request = {}, clientFactory }) {
  if (!["vertex", "gemini", "identity"].includes(service)) throw new Error(`unsupported Google service: ${service}`);
  const providerDefaults = defaults(config);
  const prepared = await prepareProviderCall({ connectorType: "google-vertex-ai", config, service, defaultEndpoint: providerDefaults[service], credentialRegistry, credentialReference, credentialContext, outboundPolicy, governance, proposal, purpose: service === "identity" ? "identity" : "provider_execution" });
  if (typeof clientFactory !== "function") throw new Error("Google connector requires a clientFactory");
  const client = clientFactory({ endpoint: prepared.endpoint, credentials: prepared.credentials, service, config });
  if (!client || typeof client.execute !== "function") throw new Error("Google client must implement execute(request)");
  return client.execute(request);
}

module.exports = { defaults, execute };

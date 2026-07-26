"use strict";

const { endpointFor, normalizeProviderEndpoints } = require("./endpoints");
const { authorize } = require("./outbound-policy");

class ProviderRuntimeError extends Error {
  constructor(code, message) { super(message); this.name = "ProviderRuntimeError"; this.code = code; }
}

function executed(proposal) {
  return !!proposal && proposal.status === "executed" && proposal.execution && proposal.execution.executed === true;
}

async function prepareProviderCall({ connectorType, config = {}, service, defaultEndpoint, credentialRegistry, credentialReference, credentialContext = {}, outboundPolicy, governance, proposal, purpose = "provider_execution" }) {
  if (!executed(proposal)) throw new ProviderRuntimeError("GOVERNANCE_NOT_EXECUTED", "provider execution requires a verified executed proposal");
  const provider_endpoints = normalizeProviderEndpoints(connectorType, config, { allowPrivate: true });
  const endpoint = endpointFor({ provider_endpoints }, service, defaultEndpoint);
  if (!endpoint) throw new ProviderRuntimeError("PROVIDER_ENDPOINT_REQUIRED", `no endpoint is configured for ${connectorType}:${service}`);
  const credentials = await credentialRegistry.resolve(credentialReference || { provider: "encrypted_local" }, credentialContext);
  await authorize(outboundPolicy, { url: endpoint, purpose, metadata: { connector_type: connectorType, service } }, governance);
  return { endpoint, credentials, provider_endpoints };
}

module.exports = { ProviderRuntimeError, executed, prepareProviderCall };

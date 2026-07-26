"use strict";

const { endpointFor, normalizeProviderEndpoints } = require("./endpoints");
const { authorize } = require("./outbound-policy");
const { deploymentPolicy } = require("./deployment");

class ProviderRuntimeError extends Error {
  constructor(code, message) { super(message); this.name = "ProviderRuntimeError"; this.code = code; }
}

function executed(proposal) {
  return !!proposal && proposal.status === "executed" && proposal.execution && proposal.execution.executed === true;
}

function assertExecutionContext(context = {}) {
  if (!context.org_id || !context.expected_org_id || context.org_id !== context.expected_org_id)
    throw new ProviderRuntimeError("ORGANISATION_OWNERSHIP_UNVERIFIED", "provider execution organisation ownership could not be verified");
  if (!context.environment_id || !context.expected_environment_id || context.environment_id !== context.expected_environment_id)
    throw new ProviderRuntimeError("ENVIRONMENT_OWNERSHIP_UNVERIFIED", "provider execution environment ownership could not be verified");
  if (context.evidence_required && !context.evidence_ready)
    throw new ProviderRuntimeError("EVIDENCE_PRECONDITION_FAILED", "required evidence precondition was not satisfied");
}

function effectivePolicy(outboundPolicy, endpoint, env = process.env) {
  if (outboundPolicy && outboundPolicy.mode) return outboundPolicy;
  const deployment = deploymentPolicy(env);
  if (deployment.sovereign) return { mode: "approved_endpoints_only", approved_endpoints: [] };
  return { mode: "approved_endpoints_only", approved_endpoints: [endpoint] };
}

async function prepareProviderCall({ connectorType, config = {}, service, defaultEndpoint, credentialRegistry, credentialReference, credentialContext = {}, outboundPolicy, governance, proposal, purpose = "provider_execution" }) {
  if (!executed(proposal)) throw new ProviderRuntimeError("GOVERNANCE_NOT_EXECUTED", "provider execution requires a verified executed proposal");
  assertExecutionContext(credentialContext);
  const provider_endpoints = normalizeProviderEndpoints(connectorType, config, { allowPrivate: true });
  const endpoint = endpointFor({ provider_endpoints }, service, defaultEndpoint);
  if (!endpoint) throw new ProviderRuntimeError("PROVIDER_ENDPOINT_REQUIRED", `no endpoint is configured for ${connectorType}:${service}`);
  await authorize(effectivePolicy(outboundPolicy, endpoint, credentialContext.env || process.env), {
    url: endpoint, purpose,
    metadata: { connector_type: connectorType, service, org_id: credentialContext.org_id, environment_id: credentialContext.environment_id },
  }, governance);
  if (!credentialRegistry || typeof credentialRegistry.resolve !== "function")
    throw new ProviderRuntimeError("CREDENTIAL_PROVIDER_REQUIRED", "provider execution requires the credential-provider abstraction");
  const credentials = await credentialRegistry.resolve(credentialReference || { provider: "encrypted_local" }, credentialContext);
  return { endpoint, credentials, provider_endpoints };
}

module.exports = { ProviderRuntimeError, executed, assertExecutionContext, effectivePolicy, prepareProviderCall };

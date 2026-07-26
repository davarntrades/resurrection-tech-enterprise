"use strict";

const net = require("node:net");

const SERVICES = Object.freeze({
  "aws-bedrock": ["runtime", "agent_runtime", "sts"],
  azure: ["openai", "ai_foundry", "identity"],
  "google-vertex-ai": ["vertex", "gemini", "identity"],
  google_cloud: ["vertex", "gemini", "identity"],
});

class EndpointConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EndpointConfigurationError";
    this.code = code;
    this.status = 400;
  }
}

function isTruthy(value) {
  return /^(1|true|yes)$/i.test(String(value || ""));
}

function privateAddress(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (net.isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIP(host) === 6) return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  return false;
}

function validateEndpoint(input, options = {}) {
  if (input == null || input === "") return null;
  let url;
  try { url = new URL(String(input)); }
  catch { throw new EndpointConfigurationError("ENDPOINT_INVALID_URL", "provider endpoint must be a valid URL"); }

  const allowHttp = options.allowHttp === true || isTruthy(process.env.GUARDIANOS_ALLOW_HTTP_ENDPOINTS);
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:"))
    throw new EndpointConfigurationError("ENDPOINT_HTTPS_REQUIRED", "provider endpoints must use HTTPS");
  if (url.username || url.password)
    throw new EndpointConfigurationError("ENDPOINT_EMBEDDED_CREDENTIALS", "provider endpoints must not contain credentials");
  if (url.hash)
    throw new EndpointConfigurationError("ENDPOINT_FRAGMENT_FORBIDDEN", "provider endpoints must not contain fragments");

  const allowPrivate = options.allowPrivate === true || isTruthy(process.env.INTEGRATION_ALLOW_PRIVATE_ENDPOINTS) ||
    String(process.env.GUARDIANOS_DEPLOYMENT_MODE || "").toLowerCase() === "sovereign";
  if (privateAddress(url.hostname) && !allowPrivate)
    throw new EndpointConfigurationError("ENDPOINT_PRIVATE_NOT_ALLOWED", "private endpoints require an explicitly private or sovereign deployment");

  url.username = "";
  url.password = "";
  return url.toString();
}

function normalizeProviderEndpoints(connectorType, input = {}, options = {}) {
  const supported = SERVICES[connectorType] || [];
  const source = input.provider_endpoints || input.endpoints || {};
  const normalized = {};
  for (const service of supported) {
    const value = source[service] || input[`${service}_endpoint`] || null;
    if (value) normalized[service] = validateEndpoint(value, options);
  }
  return Object.freeze(normalized);
}

function endpointFor(config, service, providerDefault = null) {
  const endpoints = config && (config.provider_endpoints || config.endpoints);
  return endpoints && endpoints[service] ? endpoints[service] : providerDefault;
}

module.exports = {
  SERVICES,
  EndpointConfigurationError,
  validateEndpoint,
  normalizeProviderEndpoints,
  endpointFor,
  privateAddress,
};

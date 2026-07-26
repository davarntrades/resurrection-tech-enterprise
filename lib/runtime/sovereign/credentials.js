"use strict";

const { redact } = require("./redaction");

class CredentialProviderError extends Error {
  constructor(code, message) { super(message); this.name = "CredentialProviderError"; this.code = code; }
}

class CredentialProviderRegistry {
  constructor() { this.providers = new Map(); }
  register(name, provider) {
    if (!name || !provider || typeof provider.resolve !== "function")
      throw new CredentialProviderError("CREDENTIAL_PROVIDER_INVALID", "credential provider must implement resolve(reference, context)");
    this.providers.set(String(name), provider); return this;
  }
  has(name) { return this.providers.has(String(name)); }
  async resolve(reference = {}, context = {}) {
    const type = reference.provider || "encrypted_local";
    const provider = this.providers.get(type);
    if (!provider) throw new CredentialProviderError("CREDENTIAL_PROVIDER_UNAVAILABLE", `credential provider ${type} is not configured`);
    const value = await provider.resolve(reference, context);
    if (!value || typeof value !== "object") throw new CredentialProviderError("CREDENTIAL_RESOLUTION_FAILED", "credential provider returned no credentials");
    return value;
  }
  describe() { return [...this.providers.keys()]; }
}

function environmentProvider(env = process.env) {
  return {
    async resolve(reference = {}) {
      const mapping = reference.mapping || {};
      const out = {};
      for (const [field, variable] of Object.entries(mapping)) {
        if (!Object.prototype.hasOwnProperty.call(env, variable))
          throw new CredentialProviderError("CREDENTIAL_ENV_MISSING", `required deployment secret ${variable} is not available`);
        out[field] = env[variable];
      }
      return out;
    },
  };
}

function callbackProvider(callback) {
  return { async resolve(reference, context) { return callback(reference, context); } };
}

function providerDefinitions() {
  return Object.freeze({
    encrypted_local: { implemented: true, live_validated: true },
    environment: { implemented: true, live_validated: true },
    aws_secrets_manager: { implemented: true, contract_tested: true, live_validated: false, customer_validation_required: true },
    azure_key_vault: { implemented: true, contract_tested: true, live_validated: false, customer_validation_required: true },
    google_secret_manager: { implemented: true, contract_tested: true, live_validated: false, customer_validation_required: true },
    hashicorp_vault: { implemented: true, contract_tested: true, live_validated: false, customer_validation_required: true },
    kubernetes_secrets: { implemented: true, contract_tested: true, live_validated: false, customer_validation_required: true },
    custom: { implemented: true, live_validated: false, customer_validation_required: true },
  });
}

module.exports = { CredentialProviderError, CredentialProviderRegistry, environmentProvider, callbackProvider, providerDefinitions, redact };

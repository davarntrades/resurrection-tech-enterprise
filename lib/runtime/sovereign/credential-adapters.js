"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { CredentialProviderError } = require("./credentials");
const { authorize, governedFetch } = require("./outbound-policy");

function jsonObject(value, label) {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); }
    catch { throw new CredentialProviderError("CREDENTIAL_PAYLOAD_INVALID", `${label} did not contain a JSON credential object`); }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new CredentialProviderError("CREDENTIAL_PAYLOAD_INVALID", `${label} did not contain a credential object`);
  return parsed;
}

function secretPolicy(reference, context, endpoint) {
  return reference.outbound_policy || context.outbound_policy || { mode: "approved_endpoints_only", approved_endpoints: [endpoint] };
}

function awsSecretsManagerProvider({ client, GetSecretValueCommand, endpoint } = {}) {
  return { async resolve(reference = {}, context = {}) {
    if (!client || typeof client.send !== "function" || !GetSecretValueCommand)
      throw new CredentialProviderError("AWS_SECRETS_MANAGER_UNAVAILABLE", "AWS Secrets Manager adapter requires an injected SDK client and command");
    const destination = reference.endpoint || endpoint;
    if (!destination) throw new CredentialProviderError("AWS_SECRETS_MANAGER_ENDPOINT_REQUIRED", "AWS Secrets Manager endpoint is required for outbound governance");
    await authorize(secretPolicy(reference, context, destination), { url: destination, purpose: "secret_manager", metadata: { provider: "aws_secrets_manager" } }, context.governance || null);
    const result = await client.send(new GetSecretValueCommand({ SecretId: reference.secret_id, ...(reference.version_id ? { VersionId: reference.version_id } : {}), ...(reference.version_stage ? { VersionStage: reference.version_stage } : {}) }));
    const value = result.SecretString != null ? result.SecretString : Buffer.from(result.SecretBinary || "").toString("utf8");
    return jsonObject(value, "AWS Secrets Manager");
  }};
}

function azureKeyVaultProvider({ client, endpoint } = {}) {
  return { async resolve(reference = {}, context = {}) {
    if (!client || typeof client.getSecret !== "function")
      throw new CredentialProviderError("AZURE_KEY_VAULT_UNAVAILABLE", "Azure Key Vault adapter requires an injected SecretClient");
    const destination = reference.endpoint || endpoint || (client.vaultUrl ? `${String(client.vaultUrl).replace(/\/$/, "")}/` : null);
    if (!destination) throw new CredentialProviderError("AZURE_KEY_VAULT_ENDPOINT_REQUIRED", "Azure Key Vault endpoint is required for outbound governance");
    await authorize(secretPolicy(reference, context, destination), { url: destination, purpose: "secret_manager", metadata: { provider: "azure_key_vault" } }, context.governance || null);
    const result = await client.getSecret(reference.secret_name, reference.version || undefined);
    return jsonObject(result && result.value, "Azure Key Vault");
  }};
}

function googleSecretManagerProvider({ client, endpoint = "https://secretmanager.googleapis.com/" } = {}) {
  return { async resolve(reference = {}, context = {}) {
    if (!client || typeof client.accessSecretVersion !== "function")
      throw new CredentialProviderError("GOOGLE_SECRET_MANAGER_UNAVAILABLE", "Google Secret Manager adapter requires an injected client");
    const destination = reference.endpoint || endpoint;
    await authorize(secretPolicy(reference, context, destination), { url: destination, purpose: "secret_manager", metadata: { provider: "google_secret_manager" } }, context.governance || null);
    const name = reference.version_name || `${reference.secret_name}/versions/${reference.version || "latest"}`;
    const response = await client.accessSecretVersion({ name });
    const result = Array.isArray(response) ? response[0] : response;
    const data = result && result.payload && result.payload.data;
    return jsonObject(Buffer.from(data || "").toString("utf8"), "Google Secret Manager");
  }};
}

function hashicorpVaultProvider({ fetchImpl = global.fetch, policy, governance } = {}) {
  return { async resolve(reference = {}, context = {}) {
    const base = String(reference.address || "").replace(/\/$/, "");
    const url = `${base}/v1/${String(reference.path || "").replace(/^\//, "")}`;
    const response = await governedFetch(policy || context.outbound_policy, {
      url, purpose: "secret_manager", init: { headers: { "x-vault-token": String(reference.token || context.vault_token || "") } }, metadata: { provider: "hashicorp_vault" },
    }, governance || context.governance, fetchImpl);
    if (!response.ok) throw new CredentialProviderError("VAULT_READ_FAILED", `HashiCorp Vault returned HTTP ${response.status}`);
    const payload = await response.json();
    return jsonObject(payload && payload.data && (payload.data.data || payload.data), "HashiCorp Vault");
  }};
}

function kubernetesSecretsProvider({ root = "/var/run/secrets/guardianos" } = {}) {
  return { async resolve(reference = {}) {
    const directory = path.resolve(root, String(reference.name || ""));
    const rootResolved = path.resolve(root) + path.sep;
    if (!directory.startsWith(rootResolved)) throw new CredentialProviderError("KUBERNETES_SECRET_PATH_INVALID", "Kubernetes secret path escapes the configured mount root");
    const mapping = reference.mapping || {};
    const out = {};
    for (const [field, filename] of Object.entries(mapping)) {
      const target = path.resolve(directory, String(filename));
      if (!target.startsWith(directory + path.sep)) throw new CredentialProviderError("KUBERNETES_SECRET_PATH_INVALID", "Kubernetes secret key escapes its secret directory");
      out[field] = fs.readFileSync(target, "utf8").trim();
    }
    return out;
  }};
}

module.exports = { awsSecretsManagerProvider, azureKeyVaultProvider, googleSecretManagerProvider, hashicorpVaultProvider, kubernetesSecretsProvider };

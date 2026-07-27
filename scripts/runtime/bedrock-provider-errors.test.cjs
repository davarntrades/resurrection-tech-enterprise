#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-bedrock-provider-errors-"));
process.env.RUNTIME_LOG_SILENT = "1";

const bedrock = require("../../lib/runtime/connectors/aws-bedrock");
const runs = require("../../lib/runtime/bedrock-invocation-runs");
const store = require("../../lib/runtime/store");

class Command { constructor(input) { this.input = input; } }
class RuntimeClient {
  constructor(config) { this.config = config; }
  async send() {
    await new Promise((resolve) => setTimeout(resolve, 4));
    return {
      output: { message: { role: "assistant", content: [{ text: "ok" }] } },
      $metadata: { requestId: "req-latency" },
    };
  }
}

const overrides = {
  BedrockRuntimeClient: RuntimeClient,
  ConverseCommand: Command,
  ConverseStreamCommand: Command,
  InvokeModelCommand: Command,
  InvokeModelWithResponseStreamCommand: Command,
};

(async () => {
  const config = { region: "eu-west-2", auth_method: "access_key", model_ids: ["model.test"], timeout_ms: 1000, max_retries: 0 };
  const secret = { access_key_id: "AKIATEST", secret_access_key: "test-secret" };
  const response = await bedrock.invoke(config, secret, {
    model_id: "model.test",
    messages: [{ role: "user", content: [{ text: "hello" }] }],
  }, overrides);
  assert.equal(response.ok, true);
  assert.ok(Number.isFinite(response.provider_latency_ms));
  assert.ok(response.provider_latency_ms >= 1);

  const nestedNetwork = new Error("UnknownError", { cause: Object.assign(new Error("getaddrinfo EAI_AGAIN bedrock-runtime.eu-west-2.amazonaws.com"), { code: "EAI_AGAIN" }) });
  nestedNetwork.name = "UnknownError";
  const mappedNetwork = bedrock.mapError(nestedNetwork);
  assert.equal(mappedNetwork.code, "AWS_NETWORK_ERROR");
  assert.equal(mappedNetwork.category, "networking");
  assert.equal(mappedNetwork.retryable, true);

  const credential = Object.assign(new Error("The security token included in the request is invalid"), { name: "UnrecognizedClientException" });
  const mappedCredential = bedrock.mapError(credential);
  assert.equal(mappedCredential.code, "AWS_INVALID_CREDENTIALS");
  assert.equal(mappedCredential.category, "credentials");

  const validation = Object.assign(new Error("The provided model identifier is invalid"), { name: "ValidationException" });
  const mappedValidation = bedrock.mapError(validation);
  assert.equal(mappedValidation.code, "AWS_VALIDATION_ERROR");
  assert.equal(mappedValidation.category, "validation");

  const timeout = Object.assign(new Error("request timed out"), { name: "TimeoutError" });
  const mappedTimeout = bedrock.mapError(timeout);
  assert.equal(mappedTimeout.code, "AWS_TIMEOUT");
  assert.equal(mappedTimeout.category, "timeout");

  const internal = bedrock.mapError(new Error("local state transition failed"));
  assert.equal(internal.code, "INTERNAL_ORCHESTRATION_ERROR");
  assert.equal(internal.category, "internal_orchestration");

  await store.insert("orgs", { id: "org_error", name: "Error Org" });
  await store.insert("environments", { id: "env_error", org_id: "org_error", name: "Production", kind: "production" });
  await store.insert("integration_connectors", {
    id: "con_error", org_id: "org_error", environment_id: "env_error", type: "aws-bedrock",
    name: "Bedrock", status: "configured", health: "healthy", config: { region: "eu-west-2", model_ids: ["model.test"] }, secret_encrypted: "sealed",
  });
  const created = await runs.createRuns({ org_id: "org_error", environment_id: "env_error", connector_id: "con_error", model_id: "model.test", prompt: "test", idempotency_key: "classified" });
  const failed = await runs.executeRun(await store.findOne("bedrock_invocation_runs", { id: created.runs[0].id }), {
    governed: async () => ({ status: "executed" }),
    invokeBedrock: async (_input, dependencies) => {
      await dependencies.governed("invoke_aws_bedrock_model", {});
      throw Object.assign(new Error("local orchestration failure"), { code: "INTERNAL_ORCHESTRATION_ERROR" });
    },
  });
  assert.equal(failed.status, "failed");
  assert.match(failed.safe_failure_reason, /^internal_orchestration \| INTERNAL_ORCHESTRATION_ERROR:/);

  console.log("Bedrock provider latency and error classification regressions passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

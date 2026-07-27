/* ============================================================================
 * GuardianOS Integration Gateway — Amazon Bedrock connector boundary
 * ============================================================================ */
"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { normalizeProviderEndpoints, endpointFor } = require("../sovereign/endpoints");

const REGION = /^(af|ap|ca|eu|il|me|mx|sa|us|us-gov)-[a-z0-9-]+-\d$/;
const ROLE_ARN = /^arn:(aws|aws-us-gov|aws-cn):iam::\d{12}:role\/[\w+=,.@/-]{1,512}$/;
const RETRYABLE = new Set([
  "ThrottlingException", "TooManyRequestsException", "ServiceUnavailableException",
  "InternalServerException", "ModelNotReadyException", "ModelTimeoutException",
  "TimeoutError", "RequestTimeout", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN",
  "ENOTFOUND", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
]);
const NETWORK_CODES = new Set([
  "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED",
  "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
]);

class BedrockConnectorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BedrockConnectorError";
    this.code = code;
    this.status = details.status || 502;
    this.retryable = !!details.retryable;
    this.aws_request_id = details.aws_request_id || null;
    this.cause_name = details.cause_name || null;
    this.category = details.category || classifyCode(code);
    this.provider_latency_ms = details.provider_latency_ms == null ? null : Number(details.provider_latency_ms);
  }
}

const clean = (value, max = 500) => String(value == null ? "" : value).slice(0, max);
const list = (value) => Array.isArray(value) ? [...new Set(value.map((x) => clean(x, 300)).filter(Boolean))] : [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const elapsedMs = (started) => Math.max(0, Math.round(performance.now() - started));

function classifyCode(code) {
  const value = String(code || "");
  if (/CREDENTIAL|SIGNATURE|ACCESS_DENIED|ROLE_ASSUMPTION/.test(value)) return "credentials";
  if (/TIMEOUT/.test(value)) return "timeout";
  if (/NETWORK|DNS|CONNECTION/.test(value)) return "networking";
  if (/VALIDATION|INVALID_REGION|INVALID_ROLE|MODEL_REQUIRED|MESSAGES_REQUIRED|MALFORMED|REGION_MISMATCH/.test(value)) return "validation";
  if (/AWS_|BEDROCK/.test(value)) return "aws_provider";
  return "internal_orchestration";
}

function errorChain(error) {
  const seen = new Set();
  const chain = [];
  let current = error;
  while (current && typeof current === "object" && !seen.has(current) && chain.length < 8) {
    seen.add(current);
    chain.push(current);
    current = current.cause || current.originalError || current.error || null;
  }
  return chain;
}

function validateConfiguration(config = {}, secret = {}, { allowAmbient = true } = {}) {
  const region = clean(config.region, 80);
  if (!REGION.test(region)) throw new BedrockConnectorError("AWS_INVALID_REGION", "a valid AWS region is required", { status: 400 });
  const auth_method = config.auth_method === "access_key" ? "access_key" : "role";
  const role_arn = auth_method === "role" ? clean(config.role_arn, 700) || null : null;
  if (role_arn && !ROLE_ARN.test(role_arn)) throw new BedrockConnectorError("AWS_INVALID_ROLE_ARN", "IAM role ARN is invalid", { status: 400 });
  if (auth_method === "access_key" && (!secret.access_key_id || !secret.secret_access_key)) throw new BedrockConnectorError("AWS_MISSING_CREDENTIALS", "access key ID and secret access key are required", { status: 400 });
  if (auth_method === "role" && !role_arn) throw new BedrockConnectorError("AWS_MISSING_ROLE", "IAM role ARN is required for role authentication", { status: 400 });
  if (auth_method === "role" && !allowAmbient && (!secret.access_key_id || !secret.secret_access_key)) throw new BedrockConnectorError("AWS_MISSING_SOURCE_CREDENTIALS", "source credentials are required in this deployment to assume the IAM role", { status: 400 });
  if ((secret.access_key_id && !secret.secret_access_key) || (!secret.access_key_id && secret.secret_access_key)) throw new BedrockConnectorError("AWS_INCOMPLETE_CREDENTIALS", "access key ID and secret access key must be supplied together", { status: 400 });
  return {
    region,
    auth_method,
    role_arn,
    model_ids: list(config.model_ids),
    inference_profiles: list(config.inference_profiles),
    agent_ids: list(config.agent_ids),
    agent_aliases: list(config.agent_aliases),
    action_groups: list(config.action_groups),
    require_inbound_signature: !!config.require_inbound_signature,
    timeout_ms: Math.max(1000, Math.min(120000, Number(config.timeout_ms || 30000))),
    max_retries: Math.max(0, Math.min(5, Number(config.max_retries == null ? 2 : config.max_retries))),
    provider_endpoints: normalizeProviderEndpoints("aws-bedrock", config, { allowPrivate: true }),
  };
}

function publicConfiguration(config = {}) {
  const placeholder = config.auth_method === "access_key" ? { access_key_id: "redacted", secret_access_key: "redacted" } : {};
  const validated = validateConfiguration(config, placeholder, { allowAmbient: true });
  return {
    ...validated,
    aws_account_id: config.aws_account_id ? clean(config.aws_account_id, 20) : null,
    last_successful_request: config.last_successful_request || null,
    credential_validated_at: config.credential_validated_at || null,
    credential_rotated_at: config.credential_rotated_at || null,
  };
}

function staticCredentials(secret = {}) {
  if (!secret.access_key_id || !secret.secret_access_key) return undefined;
  return {
    accessKeyId: String(secret.access_key_id),
    secretAccessKey: String(secret.secret_access_key),
    ...(secret.session_token ? { sessionToken: String(secret.session_token) } : {}),
  };
}

function dependencies(overrides = {}) {
  return {
    BedrockRuntimeClient: overrides.BedrockRuntimeClient || BedrockRuntimeClient,
    ConverseCommand: overrides.ConverseCommand || ConverseCommand,
    ConverseStreamCommand: overrides.ConverseStreamCommand || ConverseStreamCommand,
    InvokeModelCommand: overrides.InvokeModelCommand || InvokeModelCommand,
    InvokeModelWithResponseStreamCommand: overrides.InvokeModelWithResponseStreamCommand || InvokeModelWithResponseStreamCommand,
    STSClient: overrides.STSClient || STSClient,
    AssumeRoleCommand: overrides.AssumeRoleCommand || AssumeRoleCommand,
    GetCallerIdentityCommand: overrides.GetCallerIdentityCommand || GetCallerIdentityCommand,
    sleep: overrides.sleep || sleep,
  };
}

async function resolvedCredentials(configInput, secret = {}, overrides = {}) {
  const config = validateConfiguration(configInput, secret, { allowAmbient: true });
  const d = dependencies(overrides);
  const base = staticCredentials(secret);
  if (!config.role_arn) return base;
  const sts = new d.STSClient({ region: config.region, endpoint: endpointFor(config, "sts", null) || undefined, ...(base ? { credentials: base } : {}), maxAttempts: 1 });
  let response;
  try {
    response = await sts.send(new d.AssumeRoleCommand({ RoleArn: config.role_arn, RoleSessionName: `GuardianOS-${Date.now()}`, DurationSeconds: 3600, ...(secret.external_id ? { ExternalId: String(secret.external_id) } : {}) }));
  } catch (error) {
    const mapped = mapError(error);
    throw new BedrockConnectorError("AWS_ROLE_ASSUMPTION_FAILED", mapped.message, { status: mapped.status, retryable: mapped.retryable, aws_request_id: mapped.aws_request_id, cause_name: mapped.cause_name, category: "credentials" });
  }
  const c = response && response.Credentials;
  if (!c || !c.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) throw new BedrockConnectorError("AWS_ROLE_ASSUMPTION_FAILED", "AWS STS did not return temporary role credentials", { status: 502, category: "credentials" });
  return { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.SessionToken, expiration: c.Expiration };
}

async function validateCredentials(configInput, secret = {}, overrides = {}) {
  const config = validateConfiguration(configInput, secret, { allowAmbient: true });
  const d = dependencies(overrides);
  const credentials = await resolvedCredentials(config, secret, overrides);
  const sts = new d.STSClient({ region: config.region, endpoint: endpointFor(config, "sts", null) || undefined, ...(credentials ? { credentials } : {}), maxAttempts: 1 });
  try {
    const identity = await sts.send(new d.GetCallerIdentityCommand({}));
    if (!identity || !identity.Account) throw new Error("AWS STS returned no account identity");
    return { ok: true, account_id: String(identity.Account), arn: identity.Arn || null, user_id: identity.UserId || null, credentials };
  } catch (error) {
    throw mapError(error, "AWS_INVALID_CREDENTIALS");
  }
}

function resourceRegion(resource) {
  const value = String(resource || "");
  if (!value.startsWith("arn:")) return null;
  return value.split(":")[3] || null;
}

function assertResourceRegion(resource, region) {
  const actual = resourceRegion(resource);
  if (actual && actual !== region && actual !== "*") throw new BedrockConnectorError("AWS_REGION_MISMATCH", `resource region ${actual} does not match connector region ${region}`, { status: 400 });
}

function mapError(error, fallback = "AWS_BEDROCK_ERROR") {
  if (error instanceof BedrockConnectorError) return error;
  const chain = errorChain(error);
  const names = chain.flatMap((item) => [item.name, item.Code, item.code]).map((value) => clean(value, 120)).filter(Boolean);
  const messages = chain.map((item) => clean(item.message, 500)).filter(Boolean);
  const requestId = chain.map((item) => item.$metadata && item.$metadata.requestId).find(Boolean) || null;
  const status = chain.map((item) => item.$metadata && item.$metadata.httpStatusCode).find((value) => Number.isFinite(Number(value)));
  const name = names.find((value) => value !== "Error" && value !== "UnknownError") || names[0] || "";
  const combined = `${names.join(" ")} ${messages.join(" ")}`;
  const table = {
    UnrecognizedClientException: "AWS_INVALID_CREDENTIALS",
    InvalidSignatureException: "AWS_INVALID_CREDENTIALS",
    SignatureDoesNotMatch: "AWS_INVALID_CREDENTIALS",
    ExpiredTokenException: "AWS_CREDENTIALS_EXPIRED",
    CredentialsProviderError: "AWS_CREDENTIALS_UNAVAILABLE",
    AccessDeniedException: "AWS_ACCESS_DENIED",
    ValidationException: "AWS_VALIDATION_ERROR",
    ResourceNotFoundException: "AWS_RESOURCE_NOT_FOUND",
    ThrottlingException: "AWS_THROTTLED",
    TooManyRequestsException: "AWS_THROTTLED",
    ModelNotReadyException: "AWS_MODEL_NOT_READY",
    ModelTimeoutException: "AWS_MODEL_TIMEOUT",
    ServiceUnavailableException: "AWS_SERVICE_UNAVAILABLE",
    InternalServerException: "AWS_INTERNAL_ERROR",
  };
  let code = names.map((value) => table[value]).find(Boolean) || null;
  if (!code && /abort|timed?\s*out|timeout/i.test(combined)) code = "AWS_TIMEOUT";
  if (!code && names.some((value) => NETWORK_CODES.has(value))) code = "AWS_NETWORK_ERROR";
  if (!code && /getaddrinfo|dns|socket|connect|network|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(combined)) code = "AWS_NETWORK_ERROR";
  if (!code && /credential|access key|secret key|signature|token/i.test(combined)) code = "AWS_CREDENTIALS_ERROR";
  if (!code && /validation|invalid parameter|malformed|model identifier is invalid/i.test(combined)) code = "AWS_VALIDATION_ERROR";
  if (!code && Number(status) >= 500) code = "AWS_PROVIDER_ERROR";
  if (!code && requestId) code = fallback;
  if (!code) code = "INTERNAL_ORCHESTRATION_ERROR";
  const message = messages.find((value) => value && value !== "UnknownError") || `${classifyCode(code).replaceAll("_", " ")} failure`;
  return new BedrockConnectorError(code, message, {
    status: Number(status) || (/CREDENTIAL|ACCESS_DENIED/.test(code) ? 401 : code === "AWS_TIMEOUT" ? 504 : code === "AWS_VALIDATION_ERROR" ? 400 : 502),
    retryable: names.some((value) => RETRYABLE.has(value)) || code === "AWS_TIMEOUT" || code === "AWS_NETWORK_ERROR" || code === "AWS_SERVICE_UNAVAILABLE" || code === "AWS_PROVIDER_ERROR",
    aws_request_id: requestId,
    cause_name: name || null,
    category: classifyCode(code),
  });
}

async function sendWithRetry(client, commandFactory, config, overrides = {}) {
  const d = dependencies(overrides);
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeout_ms);
    try {
      const result = await client.send(commandFactory(), { abortSignal: controller.signal });
      return { result, attempts: attempt + 1 };
    } catch (raw) {
      const error = raw && raw.name === "AbortError"
        ? new BedrockConnectorError("AWS_TIMEOUT", `Amazon Bedrock request exceeded ${config.timeout_ms}ms`, { status: 504, retryable: true, category: "timeout" })
        : mapError(raw);
      if (!error.retryable || attempt >= config.max_retries) throw error;
      attempt += 1;
      await d.sleep(Math.min(1000, 50 * (2 ** attempt)));
    } finally {
      clearTimeout(timer);
    }
  }
}

function invocationInput(request = {}, config) {
  const modelId = clean(request.inference_profile || request.model_id, 500);
  if (!modelId) throw new BedrockConnectorError("AWS_MODEL_REQUIRED", "model_id or inference_profile is required", { status: 400 });
  assertResourceRegion(modelId, config.region);
  const mode = request.mode === "invoke" ? "invoke" : "converse";
  if (mode === "converse") {
    if (!Array.isArray(request.messages) || !request.messages.length) throw new BedrockConnectorError("AWS_MESSAGES_REQUIRED", "Converse requests require messages", { status: 400 });
    return { mode, stream: !!request.stream, input: { modelId, messages: request.messages, ...(request.system ? { system: request.system } : {}), ...(request.inference_config ? { inferenceConfig: request.inference_config } : {}), ...(request.tool_config ? { toolConfig: request.tool_config } : {}), ...(request.additional_model_request_fields ? { additionalModelRequestFields: request.additional_model_request_fields } : {}) } };
  }
  return { mode, stream: !!request.stream, input: { modelId, body: Buffer.from(JSON.stringify(request.body || {})), contentType: request.content_type || "application/json", accept: request.accept || "application/json" } };
}

async function collectStream(stream) {
  const events = [];
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") return events;
  for await (const event of stream) {
    if (event.chunk && event.chunk.bytes) {
      const text = Buffer.from(event.chunk.bytes).toString("utf8");
      let body = text;
      try { body = JSON.parse(text); } catch {}
      events.push({ type: "chunk", body });
    } else {
      const key = Object.keys(event || {})[0] || "event";
      events.push({ type: key, body: event[key] });
    }
  }
  return events;
}

async function invoke(configInput, secret, request, overrides = {}) {
  const config = validateConfiguration(configInput, secret, { allowAmbient: true });
  const d = dependencies(overrides);
  const credentials = await resolvedCredentials(config, secret, overrides);
  const client = new d.BedrockRuntimeClient({ region: config.region, endpoint: endpointFor(config, "runtime", null) || undefined, ...(credentials ? { credentials } : {}), maxAttempts: 1 });
  const mapped = invocationInput(request, config);
  const make = () => mapped.mode === "converse"
    ? (mapped.stream ? new d.ConverseStreamCommand(mapped.input) : new d.ConverseCommand(mapped.input))
    : (mapped.stream ? new d.InvokeModelWithResponseStreamCommand(mapped.input) : new d.InvokeModelCommand(mapped.input));
  const providerStarted = performance.now();
  try {
    const { result, attempts } = await sendWithRetry(client, make, config, overrides);
    const provider_latency_ms = elapsedMs(providerStarted);
    const requestId = result && result.$metadata && result.$metadata.requestId;
    if (mapped.stream) {
      const stream = mapped.mode === "converse" ? result.stream : result.body;
      return { ok: true, mode: mapped.mode, stream: true, events: await collectStream(stream), attempts, aws_request_id: requestId || null, provider_latency_ms };
    }
    if (mapped.mode === "converse") return { ok: true, mode: "converse", output: result.output || null, stop_reason: result.stopReason || null, usage: result.usage || null, metrics: result.metrics || null, attempts, aws_request_id: requestId || null, provider_latency_ms };
    const text = result && result.body ? Buffer.from(result.body).toString("utf8") : "";
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch {}
    return { ok: true, mode: "invoke", body, content_type: result.contentType || null, attempts, aws_request_id: requestId || null, provider_latency_ms };
  } catch (error) {
    const mappedError = mapError(error);
    mappedError.provider_latency_ms = elapsedMs(providerStarted);
    throw mappedError;
  }
}

async function invokeAgentRuntime(configInput, secret, request = {}, overrides = {}) {
  const config = validateConfiguration(configInput, secret, { allowAmbient: true });
  if (!overrides.proposal || overrides.proposal.status !== "executed" || !overrides.proposal.execution || overrides.proposal.execution.executed !== true) throw new BedrockConnectorError("GOVERNANCE_NOT_EXECUTED", "Bedrock Agent Runtime requires a verified executed proposal", { status: 403 });
  const Client = overrides.BedrockAgentRuntimeClient;
  const Command = overrides.InvokeAgentCommand;
  if (typeof Client !== "function" || typeof Command !== "function") throw new BedrockConnectorError("AWS_AGENT_RUNTIME_CLIENT_UNAVAILABLE", "Bedrock Agent Runtime requires the AWS SDK client and InvokeAgentCommand", { status: 501 });
  const credentials = await resolvedCredentials(config, secret, overrides);
  const client = new Client({ region: config.region, endpoint: endpointFor(config, "agent_runtime", null) || undefined, ...(credentials ? { credentials } : {}), maxAttempts: 1 });
  const input = { agentId: request.agent_id, agentAliasId: request.agent_alias_id, sessionId: request.session_id, inputText: request.input_text, ...(request.enable_trace != null ? { enableTrace: !!request.enable_trace } : {}), ...(request.session_state ? { sessionState: request.session_state } : {}) };
  const started = performance.now();
  try {
    const { result, attempts } = await sendWithRetry(client, () => new Command(input), config, overrides);
    return { ok: true, output: result, attempts, aws_request_id: result && result.$metadata && result.$metadata.requestId || null, provider_latency_ms: elapsedMs(started) };
  } catch (error) {
    const mapped = mapError(error);
    mapped.provider_latency_ms = elapsedMs(started);
    throw mapped;
  }
}

function unwrapLambdaEvent(input) {
  if (!input || typeof input !== "object") throw new BedrockConnectorError("AWS_MALFORMED_PAYLOAD", "Bedrock action-group payload must be an object", { status: 400 });
  if (input.body != null && (input.requestContext || input.version)) {
    try { return typeof input.body === "string" ? JSON.parse(input.body) : input.body; }
    catch { throw new BedrockConnectorError("AWS_MALFORMED_PAYLOAD", "Lambda event body is not valid JSON", { status: 400 }); }
  }
  return input;
}

function mapActionGroupEvent(input, context = {}) {
  const event = unwrapLambdaEvent(input);
  if (!event.actionGroup || (!event.apiPath && !event.function)) throw new BedrockConnectorError("AWS_MALFORMED_PAYLOAD", "actionGroup and apiPath or function are required", { status: 400 });
  const agent = event.agent || {};
  const parameters = Array.isArray(event.parameters) ? event.parameters.map((p) => ({ name: clean(p && p.name, 200), type: clean(p && p.type, 80), value: clean(p && p.value, 2000) })) : [];
  const requestBody = event.requestBody && event.requestBody.content ? event.requestBody.content : null;
  const method = clean(event.httpMethod || (event.function ? "FUNCTION" : "POST"), 20).toUpperCase();
  const pth = clean(event.apiPath || event.function, 500);
  return {
    source: "aws.bedrock.agent.action-group",
    organisation_id: context.org_id || null,
    environment_id: context.environment_id || null,
    connector_id: context.connector_id || null,
    message_version: clean(event.messageVersion || "1.0", 20),
    agent: { id: clean(agent.id, 200) || null, alias: clean(agent.alias, 200) || null, name: clean(agent.name, 200) || null, version: clean(agent.version, 80) || null },
    action_group: clean(event.actionGroup, 300),
    api_path: pth,
    http_method: method,
    function_name: event.function ? clean(event.function, 300) : null,
    parameters,
    request_body: requestBody,
    session_id: clean(event.sessionId, 300) || null,
    session_attributes: event.sessionAttributes || {},
    prompt_session_attributes: event.promptSessionAttributes || {},
    input_text_hash: event.inputText ? hash(String(event.inputText)) : null,
    request_hash: hash(event),
  };
}

function actionGroupResponse(canonical, outcome, result = null) {
  const decision = outcome === "allow" ? "PERMIT" : outcome === "escalate" ? "ESCALATE" : "BLOCK";
  const status = decision === "PERMIT" ? 200 : decision === "ESCALATE" ? 202 : 403;
  const body = { guardian_decision: decision, proposal_id: result && result.proposal_id || null, evidence_id: result && result.evidence_id || null, reason: result && result.reason || null, ...(decision === "PERMIT" && result && result.action_result !== undefined ? { result: result.action_result } : {}) };
  const response = canonical.function_name
    ? { actionGroup: canonical.action_group, function: canonical.function_name, functionResponse: { ...(decision === "BLOCK" ? { responseState: "FAILURE" } : decision === "ESCALATE" ? { responseState: "REPROMPT" } : {}), responseBody: { TEXT: { body: JSON.stringify(body) } } } }
    : { actionGroup: canonical.action_group, apiPath: canonical.api_path, httpMethod: canonical.http_method, httpStatusCode: status, responseBody: { "application/json": { body: JSON.stringify(body) } } };
  return { messageVersion: canonical.message_version || "1.0", response, sessionAttributes: canonical.session_attributes || {}, promptSessionAttributes: canonical.prompt_session_attributes || {} };
}

function verifyInboundSignature({ secret, timestamp, nonce, signature, rawBody, toleranceSeconds = 300, now = Date.now() }) {
  if (!secret) return { ok: false, code: "AWS_SIGNATURE_SECRET_MISSING" };
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > toleranceSeconds) return { ok: false, code: "AWS_SIGNATURE_EXPIRED" };
  if (!nonce || !signature) return { ok: false, code: "AWS_SIGNATURE_REQUIRED" };
  const expected = crypto.createHmac("sha256", String(secret)).update(`${timestamp}.${nonce}.${rawBody}`).digest("hex");
  const supplied = String(signature).replace(/^v1=/, "");
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, code: ok ? null : "AWS_SIGNATURE_INVALID", nonce_hash: hash(String(nonce)) };
}

module.exports = {
  BedrockConnectorError,
  validateConfiguration,
  publicConfiguration,
  validateCredentials,
  resolvedCredentials,
  resourceRegion,
  assertResourceRegion,
  classifyCode,
  mapError,
  sendWithRetry,
  invocationInput,
  invoke,
  invokeAgentRuntime,
  unwrapLambdaEvent,
  mapActionGroupEvent,
  actionGroupResponse,
  verifyInboundSignature,
  hash,
};
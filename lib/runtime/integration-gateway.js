/* ============================================================================
 * GuardianOS Integration Gateway
 *
 * Enterprise onboarding and integration management around the existing Runtime
 * Governance platform. It does not evaluate policy itself. Mutating operations
 * are executed only by the governed Operations proposal path; runtime decisions
 * continue to use lib/runtime/gateway.js.
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const store = require("./store");
const log = require("./log");

const CONNECTOR_DEFINITIONS = Object.freeze([
  ["rest", "REST API"], ["graphql", "GraphQL"], ["webhook", "Webhook"],
  ["github", "GitHub"], ["gitlab", "GitLab"], ["azure_devops", "Azure DevOps"],
  ["jira", "Jira"], ["slack", "Slack"], ["microsoft_teams", "Microsoft Teams"],
  ["servicenow", "ServiceNow"], ["salesforce", "Salesforce"], ["supabase", "Supabase"],
  ["aws", "AWS"], ["aws-bedrock", "Amazon Bedrock"], ["azure", "Azure"], ["google_cloud", "Google Cloud"],
  ["gmail", "Gmail"],
  ["kubernetes", "Kubernetes"], ["docker", "Docker"],
  ["internal_api", "Internal enterprise API"], ["custom", "Custom connector"],
].map(([id, name]) => ({ id, name, extensible: id === "custom" })));

const SDK_METHODS = Object.freeze([
  "evaluate", "propose", "submitEvidence", "getDecision", "getOrganisation",
  "createDeployment", "submitRuntimeEvent", "retrieveAuditTrail",
]);
const BEDROCK_SDK_METHODS = Object.freeze([
  "evaluateAction", "invokeModel", "handleActionGroup", "getHealth",
]);

const sha = (value) => store.sha256(typeof value === "string" ? value : JSON.stringify(value));
const clean = (value, max = 2000) => String(value == null ? "" : value).slice(0, max);
function allows(auth, scope) {
  if (!auth) return false;
  if (auth.role === "admin" && (!Array.isArray(auth.scopes) || !auth.scopes.length)) return true; // legacy admin keys
  const scopes = Array.isArray(auth.scopes) ? auth.scopes : [];
  if (scopes.includes("*") || scopes.includes(scope) || scopes.includes(scope.split(":")[0] + ":*")) return true;
  if (scope === "runtime:read" && ["viewer", "ingest"].includes(auth.role)) return true;
  if (scope === "runtime:write" && auth.role === "ingest") return true;
  if (scope === "evidence:read" && ["viewer", "ingest"].includes(auth.role)) return true;
  return false;
}
function executed(proposal) {
  return !!proposal && proposal.status === "executed" && proposal.execution && proposal.execution.executed === true;
}
function allowsEnvironment(auth, environment_id) {
  if (!auth || !environment_id) return false;
  const restrictions = Array.isArray(auth.environment_restrictions) ? auth.environment_restrictions : null;
  if (restrictions) return restrictions.includes("*") || restrictions.includes(environment_id);
  return !auth.environment || auth.environment.id === environment_id;
}
function canDelegateScopes(auth, requested) {
  if (!Array.isArray(requested) || !requested.length) return true;
  if (auth && auth.role === "admin" && (!Array.isArray(auth.scopes) || !auth.scopes.length)) return true;
  const owned = new Set(Array.isArray(auth && auth.scopes) ? auth.scopes : []);
  return requested.every((scope) => owned.has("*") || owned.has(String(scope)) || owned.has(String(scope).split(":")[0] + ":*"));
}

function encryptionKey() {
  const raw = process.env.INTEGRATION_SECRET_KEY || "";
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw).digest();
}
function seal(value) {
  if (value == null || (typeof value === "object" && !Object.keys(value).length)) return null;
  const key = encryptionKey();
  if (!key) throw new Error("INTEGRATION_SECRET_KEY is required before connector or webhook secrets can be stored");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
function open(sealed) {
  if (!sealed) return null;
  const key = encryptionKey();
  if (!key) throw new Error("INTEGRATION_SECRET_KEY is required to use stored integration secrets");
  const [version, iv, tag, data] = String(sealed).split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("invalid encrypted secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8"));
}

function assertOrg(row, org_id, label = "record") {
  if (!row || row.org_id !== org_id) throw new Error(`${label} not found`);
  return row;
}
async function stageSecret(org_id, value, purpose = "integration", ttl_ms = 10 * 60 * 1000) {
  const value_encrypted = seal(value);
  if (!value_encrypted) return null;
  const row = await store.insert("integration_secrets", {
    org_id, purpose: clean(purpose, 80), value_encrypted,
    expires_at: new Date(Date.now() + Math.max(60000, Math.min(86400000, Number(ttl_ms)))).toISOString(),
  });
  return row.id;
}
async function consumeStagedSecret(org_id, id) {
  if (!id) return null;
  const row = assertOrg(await store.findOne("integration_secrets", { id }), org_id, "staged secret");
  if (Date.parse(row.expires_at) <= Date.now()) throw new Error("staged secret expired");
  const value = open(row.value_encrypted);
  await store.remove("integration_secrets", { id: row.id });
  return value;
}
function connectorDefinition(type) {
  const found = CONNECTOR_DEFINITIONS.find((c) => c.id === type);
  if (!found) throw new Error(`unsupported connector type: ${type}`);
  return found;
}
function safeEndpoint(input) {
  let url;
  try { url = new URL(String(input)); } catch { throw new Error("a valid endpoint URL is required"); }
  const allowHttp = /^(1|true|yes)$/i.test(String(process.env.INTEGRATION_ALLOW_HTTP || ""));
  const allowPrivate = /^(1|true|yes)$/i.test(String(process.env.INTEGRATION_ALLOW_PRIVATE_ENDPOINTS || ""));
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) throw new Error("integration endpoints must use HTTPS");
  const h = url.hostname.toLowerCase();
  const privateHost = h === "localhost" || h === "::1" || /^127\./.test(h) || /^10\./.test(h) ||
    /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith(".local");
  if (privateHost && !allowPrivate) throw new Error("private endpoints require INTEGRATION_ALLOW_PRIVATE_ENDPOINTS=1 on this deployment");
  url.username = ""; url.password = "";
  return url.toString();
}
function privateAddress(address) {
  const a = String(address).toLowerCase();
  if (a === "::1" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80:")) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(a)) return false;
  const [x, y] = a.split(".").map(Number);
  return x === 10 || x === 127 || x === 0 || (x === 169 && y === 254) ||
    (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168);
}
async function assertEndpointNetwork(input) {
  const endpoint = safeEndpoint(input);
  if (/^(1|true|yes)$/i.test(String(process.env.INTEGRATION_ALLOW_PRIVATE_ENDPOINTS || ""))) return endpoint;
  const host = new URL(endpoint).hostname;
  const answers = await dns.lookup(host, { all: true, verbatim: true });
  if (!answers.length || answers.some((x) => privateAddress(x.address)))
    throw new Error("endpoint resolves to a private or reserved network address");
  return endpoint;
}

async function createConnectorRaw(p) {
  const def = connectorDefinition(p.type);
  const env = await store.findOne("environments", { id: p.environment_id });
  assertOrg(env, p.org_id, "environment");
  const staged = await consumeStagedSecret(p.org_id, p.secret_ref);
  let config = p.config || {};
  if (def.id === "aws-bedrock") {
    const bedrock = require("./connectors/aws-bedrock");
    config = bedrock.publicConfiguration(bedrock.validateConfiguration(config, staged || {}, { allowAmbient: true }));
  }
  if (def.id === "gmail") {
    // A Gmail connector is refused at creation unless a complete OAuth
    // credential was staged, so a half-provisioned connector can never sit in
    // the Integration Gateway looking configured.
    const gmail = require("./connectors/gmail");
    config = gmail.publicConfiguration(gmail.validateConfiguration(config, staged || {}));
  }
  const endpoint = p.endpoint ? await assertEndpointNetwork(p.endpoint) : null;
  const row = await store.insert("integration_connectors", {
    org_id: p.org_id, environment_id: p.environment_id, type: def.id,
    name: clean(p.name || def.name, 120), endpoint,
    config, secret_encrypted: seal(staged || null),
    status: "configured", health: "unknown", last_checked_at: null, last_error: null,
    created_by: clean(p.actor || "integration_gateway", 160),
  });
  return publicConnector(row);
}
async function updateConnectorHealth(id, { status, latency_ms = null, error = null }) {
  await store.update("integration_connectors", id, {
    health: status, latency_ms, last_error: error ? clean(error, 500) : null, last_checked_at: store.nowISO(),
  });
  return publicConnector(await store.findOne("integration_connectors", { id }));
}
async function setConnectorStatusRaw(p) {
  const row = assertOrg(await store.findOne("integration_connectors", { id: p.connector_id }), p.org_id, "connector");
  const status = p.status === "active" ? "configured" : p.status;
  if (!["configured", "disabled"].includes(status)) throw new Error("connector status must be active or disabled");
  await store.update("integration_connectors", row.id, { status });
  return publicConnector(await store.findOne("integration_connectors", { id: row.id }));
}
async function checkConnectorHealthRaw(p) {
  const row = assertOrg(await store.findOne("integration_connectors", { id: p.connector_id }), p.org_id, "connector");
  if (row.environment_id !== p.environment_id) throw new Error("connector environment mismatch");
  if (row.type === "aws-bedrock") return checkBedrockHealthRaw(p);
  if (!row.endpoint) return updateConnectorHealth(row.id, { status: "unconfigured", error: "connector has no health endpoint" });
  const started = Date.now();
  let response, error = null;
  try {
    response = await fetch(await assertEndpointNetwork(row.endpoint), {
      method: "HEAD", redirect: "manual",
      signal: AbortSignal.timeout(Number(process.env.INTEGRATION_HEALTH_TIMEOUT_MS || 6000)),
      headers: { "user-agent": "GuardianOS-Integration-Gateway/1.0" },
    });
  } catch (e) { error = e && e.message ? e.message : String(e); }
  const reachable = !!response && response.status < 500;
  return updateConnectorHealth(row.id, {
    status: reachable ? "healthy" : "down", latency_ms: Date.now() - started,
    error: reachable ? null : error || (response ? `HTTP ${response.status}` : "unreachable"),
  });
}
function publicConnector(row) {
  if (!row) return null;
  const { secret_encrypted, ...safe } = row;
  return { ...safe, has_secret: !!secret_encrypted };
}
async function listConnectors(org_id) {
  return (await store.findOptional("integration_connectors", { org_id })).map(publicConnector);
}

function governanceShape(proposal) {
  return {
    proposal_id: proposal && proposal.id || null,
    evidence_id: proposal && proposal.evidence_id || null,
    status: proposal && proposal.status || "blocked",
    reason: proposal && proposal.decision && proposal.decision.reason || null,
  };
}
async function bedrockConnectorRow({ org_id, environment_id, connector_id }) {
  const row = assertOrg(await store.findOne("integration_connectors", { id: connector_id }), org_id, "Bedrock connector");
  if (row.type !== "aws-bedrock") throw new Error("connector is not an Amazon Bedrock connector");
  if (row.environment_id !== environment_id) throw new Error("connector environment mismatch");
  if (row.status === "disabled") throw new Error("Bedrock connector is disabled");
  return row;
}
function connectorSecret(row) {
  return open(row && row.secret_encrypted) || {};
}
async function checkBedrockHealthRaw(p, dependencies = {}) {
  const bedrock = require("./connectors/aws-bedrock");
  const row = await bedrockConnectorRow(p);
  const started = Date.now();
  try {
    const identity = await bedrock.validateCredentials(row.config || {}, connectorSecret(row), dependencies);
    const checkedAt = store.nowISO();
    const config = {
      ...(row.config || {}), aws_account_id: identity.account_id,
      credential_validated_at: checkedAt, last_successful_request: checkedAt,
    };
    await store.update("integration_connectors", row.id, { config });
    return updateConnectorHealth(row.id, { status: "healthy", latency_ms: Date.now() - started });
  } catch (error) {
    const mapped = bedrock.mapError(error, "AWS_CREDENTIAL_VALIDATION_FAILED");
    await updateConnectorHealth(row.id, { status: "down", latency_ms: Date.now() - started, error: `${mapped.code}: ${mapped.message}` });
    throw mapped;
  }
}
async function rotateBedrockCredentialsRaw(p, dependencies = {}) {
  const bedrock = require("./connectors/aws-bedrock");
  const row = await bedrockConnectorRow(p);
  const replacement = await consumeStagedSecret(p.org_id, p.secret_ref);
  const mergedConfig = { ...(row.config || {}), ...(p.config || {}) };
  const validated = bedrock.validateConfiguration(mergedConfig, replacement || {}, { allowAmbient: true });
  const identity = await bedrock.validateCredentials(validated, replacement || {}, dependencies);
  const now = store.nowISO();
  const config = bedrock.publicConfiguration({
    ...validated, aws_account_id: identity.account_id,
    credential_validated_at: now, credential_rotated_at: now, last_successful_request: now,
  });
  await store.update("integration_connectors", row.id, {
    config, secret_encrypted: seal(replacement || {}), health: "healthy",
    last_checked_at: now, last_error: null,
  });
  return publicConnector(await store.findOne("integration_connectors", { id: row.id }));
}

async function invokeBedrock(p, dependencies = {}) {
  const bedrock = require("./connectors/aws-bedrock");
  const row = await bedrockConnectorRow(p);
  const request = p.request || {};
  const requestHash = bedrock.hash(request);
  const governFn = dependencies.governed || governed;
  let proposal;
  try {
    proposal = await governFn("invoke_aws_bedrock_model", {
      org_id: p.org_id, environment_id: p.environment_id, actor: p.actor || "customer",
      params: {
        connector_id: row.id,
        model_id: clean(request.inference_profile || request.model_id, 500),
        request_mode: request.mode === "invoke" ? "invoke" : "converse",
        streaming: !!request.stream, request_hash: requestHash,
        flags: { bedrock_runtime_request: true },
      },
    });
  } catch (error) {
    await submitEvidenceOrFlag({
      org_id: p.org_id, environment_id: p.environment_id, type: "aws.bedrock.governance.unavailable",
      actor: p.actor || "customer", evidence: { connector_id: row.id, request_hash: requestHash, outcome: "BLOCK" },
    });
    return { ok: false, code: "GOVERNANCE_UNAVAILABLE", error: "Runtime Governance unavailable; Bedrock invocation blocked", governance: { status: "blocked" } };
  }
  const governance = governanceShape(proposal);
  if (!executed(proposal)) {
    const code = proposal.status === "escalated" ? "GOVERNANCE_ESCALATED" : "GOVERNANCE_BLOCKED";
    await submitEvidenceOrFlag({
      org_id: p.org_id, environment_id: p.environment_id, type: "aws.bedrock.governance.decision",
      actor: p.actor || "customer", evidence: { connector_id: row.id, request_hash: requestHash, outcome: proposal.status, proposal_id: proposal.id, evidence_id: proposal.evidence_id },
    });
    return { ok: false, code, error: governance.reason || code, governance };
  }
  const selectedModel = clean(request.inference_profile || request.model_id, 500);
  const configuredModels = [
    ...(Array.isArray(row.config && row.config.model_ids) ? row.config.model_ids : []),
    ...(Array.isArray(row.config && row.config.inference_profiles) ? row.config.inference_profiles : []),
  ];
  if (configuredModels.length && !configuredModels.includes(selectedModel)) {
    const evidence = await submitEvidence({
      org_id: p.org_id, environment_id: p.environment_id, type: "aws.bedrock.model.denied",
      actor: p.actor || "customer",
      evidence: { connector_id: row.id, request_hash: requestHash, proposal_id: proposal.id, model_id: selectedModel, outcome: "blocked_by_connector_allowlist" },
    });
    return { ok: false, code: "AWS_MODEL_NOT_ALLOWED", error: "model or inference profile is not configured for this connector", governance, evidence };
  }
  const started = Date.now();
  try {
    const result = await (dependencies.invoke || bedrock.invoke)(row.config || {}, connectorSecret(row), request, dependencies);
    const now = store.nowISO();
    await store.update("integration_connectors", row.id, {
      config: { ...(row.config || {}), last_successful_request: now },
      health: "healthy", last_checked_at: now, last_error: null, latency_ms: Date.now() - started,
    });
    await recordUsage({
      org_id: p.org_id, environment_id: p.environment_id, key_id: p.key_id || null,
      operation: "aws-bedrock.invoke", sdk: p.sdk || null, latency_ms: Date.now() - started,
      meta: { connector_id: row.id, model_id: clean(request.inference_profile || request.model_id, 500), request_hash: requestHash, attempts: result.attempts },
    });
    const evidence = await submitEvidence({
      org_id: p.org_id, environment_id: p.environment_id, type: "aws.bedrock.invocation",
      actor: p.actor || "customer",
      evidence: {
        connector_id: row.id, request_hash: requestHash, proposal_id: proposal.id,
        governance_evidence_id: proposal.evidence_id, aws_request_id: result.aws_request_id || null,
        mode: result.mode, streaming: !!result.stream, attempts: result.attempts, outcome: "success",
      },
    });
    return { ...result, governance, evidence };
  } catch (error) {
    const mapped = bedrock.mapError(error);
    await updateConnectorHealth(row.id, { status: mapped.retryable ? "degraded" : "down", latency_ms: Date.now() - started, error: `${mapped.code}: ${mapped.message}` });
    await recordUsage({
      org_id: p.org_id, environment_id: p.environment_id, key_id: p.key_id || null,
      operation: "aws-bedrock.invoke", sdk: p.sdk || null, status: "error", latency_ms: Date.now() - started,
      meta: { connector_id: row.id, request_hash: requestHash, code: mapped.code, aws_request_id: mapped.aws_request_id },
    }).catch(() => {});
    const evidence = await submitEvidenceOrFlag({
      org_id: p.org_id, environment_id: p.environment_id, type: "aws.bedrock.failure",
      actor: p.actor || "customer",
      evidence: { connector_id: row.id, request_hash: requestHash, proposal_id: proposal.id, code: mapped.code, aws_request_id: mapped.aws_request_id, outcome: "failure" },
    });
    return { ok: false, code: mapped.code, error: mapped.message, retryable: mapped.retryable, aws_request_id: mapped.aws_request_id, governance, evidence };
  }
}

async function communicationConnectorRow({ org_id, environment_id, connector_id, connector_type, require_healthy = true }) {
  const row = assertOrg(await store.findOne("integration_connectors", { id: connector_id }), org_id, "communication connector");
  if (row.type !== connector_type) throw new Error(`connector is not a ${connector_type} connector`);
  if (row.environment_id !== environment_id) throw new Error("connector environment mismatch");
  if (row.status === "disabled") throw new Error("communication connector is disabled");
  // Execution paths remain fail-closed. Health probes are the sole exception:
  // they must be able to test a newly configured "unknown" connector so that
  // it can transition to healthy (or to an explicit failed state).
  if (require_healthy && row.health !== "healthy") throw new Error("communication connector is not healthy");
  return row;
}

/**
 * Governed communication send — the channel-neutral twin of invokeBedrock.
 *
 * Proposes the canonical action, and reaches the provider ONLY on an executed
 * proposal. A block or an escalation returns without touching the provider, and
 * an unreachable engine fails closed the same way: no message can leave the
 * platform on anything other than an engine-issued permit.
 */
async function sendCommunication(p, dependencies = {}) {
  const adapters = require("./communication-adapters");
  const spec = adapters.operationFor(p.action_id);
  const row = await communicationConnectorRow({ ...p, connector_type: spec.adapter.connector_type });
  // Validate against the adapter and the connector allowlist BEFORE proposing,
  // so an unsendable message never consumes a governance decision.
  adapters.assertSendable(p.action_id, row.config || {}, p.message);
  const messageHash = adapters.messageHash(p.action_id, p.message);
  const normalised = adapters.normaliseMessage(p.action_id, p.message);
  const recipientCount = normalised.to.length + normalised.cc.length + normalised.bcc.length;
  const governFn = dependencies.governed || governed;
  let proposal;
  try {
    proposal = await governFn(p.action_id, {
      org_id: p.org_id, environment_id: p.environment_id, actor: p.actor || "integration_gateway",
      params: {
        canonical_action: p.canonical_action || { action_id: p.action_id },
        communication_run_id: p.communication_run_id || null,
        connector_id: row.id,
        message_hash: messageHash,
        recipient_count: recipientCount,
        // Recipient addresses and the body deliberately stay OUT of the
        // trajectory: governance decides on the action, not on untrusted
        // content, and evidence never carries the message itself.
        flags: { channel: spec.adapter.channel, delivers: !!spec.delivers, ...(p.flags || {}) },
      },
    });
  } catch (error) {
    await submitEvidenceOrFlag({
      org_id: p.org_id, environment_id: p.environment_id, type: "communication.governance.unavailable",
      actor: p.actor || "integration_gateway",
      evidence: { connector_id: row.id, action_id: p.action_id, message_hash: messageHash, outcome: "BLOCK" },
    });
    return { ok: false, code: "GOVERNANCE_UNAVAILABLE", error: "Runtime Governance unavailable; the message was not sent", message_hash: messageHash, governance: { status: "blocked" } };
  }
  const governance = governanceShape(proposal);
  if (!executed(proposal)) {
    const code = proposal.status === "escalated" ? "GOVERNANCE_ESCALATED" : "GOVERNANCE_BLOCKED";
    await submitEvidenceOrFlag({
      org_id: p.org_id, environment_id: p.environment_id, type: "communication.governance.decision",
      actor: p.actor || "integration_gateway",
      evidence: { connector_id: row.id, action_id: p.action_id, message_hash: messageHash, outcome: proposal.status, proposal_id: proposal.id, evidence_id: proposal.evidence_id, recipient_count: recipientCount },
    });
    return { ok: false, code, error: governance.reason || code, message_hash: messageHash, governance };
  }
  const started = Date.now();
  try {
    const result = await (dependencies.communicationExecute || adapters.execute)(p.action_id, row.config || {}, connectorSecret(row), p.message, dependencies);
    const timestamp = store.nowISO();
    await store.update("integration_connectors", row.id, {
      config: { ...(row.config || {}), last_successful_request: timestamp },
      health: "healthy", last_checked_at: timestamp, last_error: null, latency_ms: Date.now() - started,
    });
    await recordUsage({
      org_id: p.org_id, environment_id: p.environment_id, key_id: p.key_id || null,
      operation: `${spec.adapter.provider}.${spec.operation}`, sdk: p.sdk || null, latency_ms: Date.now() - started,
      meta: { connector_id: row.id, action_id: p.action_id, message_hash: messageHash, recipient_count: recipientCount },
    });
    const evidence = await submitEvidence({
      org_id: p.org_id, environment_id: p.environment_id, type: "communication.message.sent",
      actor: p.actor || "integration_gateway",
      evidence: {
        connector_id: row.id, action_id: p.action_id, channel: spec.adapter.channel, provider: spec.adapter.provider,
        operation: spec.operation, delivered: !!result.delivered, message_hash: messageHash,
        proposal_id: proposal.id, governance_evidence_id: proposal.evidence_id || null,
        gmail_message_id: result.gmail_message_id || null, gmail_thread_id: result.gmail_thread_id || null,
        gmail_draft_id: result.gmail_draft_id || null, recipient_count: recipientCount, outcome: "success",
      },
    });
    return { ...result, ok: true, message_hash: messageHash, governance, evidence };
  } catch (error) {
    const mapped = adapters.mapError(p.action_id, error);
    await updateConnectorHealth(row.id, { status: mapped.retryable ? "degraded" : "down", latency_ms: Date.now() - started, error: `${mapped.code}: ${mapped.message}` });
    await recordUsage({
      org_id: p.org_id, environment_id: p.environment_id, key_id: p.key_id || null,
      operation: `${spec.adapter.provider}.${spec.operation}`, sdk: p.sdk || null, status: "error", latency_ms: Date.now() - started,
      meta: { connector_id: row.id, action_id: p.action_id, message_hash: messageHash, code: mapped.code },
    }).catch(() => {});
    const evidence = await submitEvidenceOrFlag({
      org_id: p.org_id, environment_id: p.environment_id, type: "communication.message.failed",
      actor: p.actor || "integration_gateway",
      evidence: { connector_id: row.id, action_id: p.action_id, message_hash: messageHash, proposal_id: proposal.id, code: mapped.code, outcome: "failure" },
    });
    return { ok: false, code: mapped.code, error: mapped.message, retryable: !!mapped.retryable, message_hash: messageHash, governance, evidence };
  }
}

/**
 * Governed communication READ — the same trust boundary as sendCommunication.
 *
 * The proposal is created and the engine consulted BEFORE Google is reached; a
 * block, an escalation or an unreachable engine all return without contacting
 * the provider. Reads are idempotent, so they need no at-most-once lock and no
 * approval-resume path — but they are governed and evidenced exactly the same.
 *
 * Returned message content is NOT copied into evidence: the audit record keeps
 * ids, counts and the request hash, mirroring how Bedrock keeps prompts and
 * completions out of governance evidence.
 */
async function readCommunication(p, dependencies = {}) {
  const adapters = require("./communication-adapters");
  const spec = adapters.operationFor(p.action_id);
  const row = await communicationConnectorRow({ ...p, connector_type: spec.adapter.connector_type });
  adapters.assertReadable(p.action_id, row.config || {}, p.request || {});
  const requestHash = adapters.requestHash(p.action_id, p.request || {});
  const governFn = dependencies.governed || governed;
  let proposal;
  try {
    proposal = await governFn(p.action_id, {
      org_id: p.org_id, environment_id: p.environment_id, actor: p.actor || "integration_gateway",
      params: {
        canonical_action: p.canonical_action || { action_id: p.action_id },
        connector_id: row.id,
        request_hash: requestHash,
        flags: { channel: spec.adapter.channel, reads: true, delivers: false, ...(p.flags || {}) },
      },
    });
  } catch (error) {
    await submitEvidenceOrFlag({
      org_id: p.org_id, environment_id: p.environment_id, type: "communication.governance.unavailable",
      actor: p.actor || "integration_gateway",
      evidence: { connector_id: row.id, action_id: p.action_id, request_hash: requestHash, outcome: "BLOCK" },
    });
    return { ok: false, code: "GOVERNANCE_UNAVAILABLE", error: "Runtime Governance unavailable; the mailbox was not read", request_hash: requestHash, governance: { status: "blocked" } };
  }
  const governance = governanceShape(proposal);
  if (!executed(proposal)) {
    const code = proposal.status === "escalated" ? "GOVERNANCE_ESCALATED" : "GOVERNANCE_BLOCKED";
    await submitEvidenceOrFlag({
      org_id: p.org_id, environment_id: p.environment_id, type: "communication.governance.decision",
      actor: p.actor || "integration_gateway",
      evidence: { connector_id: row.id, action_id: p.action_id, request_hash: requestHash, outcome: proposal.status, proposal_id: proposal.id, evidence_id: proposal.evidence_id },
    });
    return { ok: false, code, error: governance.reason || code, request_hash: requestHash, governance };
  }
  const started = Date.now();
  try {
    const result = await (dependencies.communicationExecute || adapters.execute)(p.action_id, row.config || {}, connectorSecret(row), p.request || {}, dependencies);
    const timestamp = store.nowISO();
    await store.update("integration_connectors", row.id, {
      health: "healthy", last_checked_at: timestamp, last_error: null, latency_ms: Date.now() - started,
    });
    await recordUsage({
      org_id: p.org_id, environment_id: p.environment_id, key_id: p.key_id || null,
      operation: `${spec.adapter.provider}.${spec.operation}`, sdk: p.sdk || null, latency_ms: Date.now() - started,
      meta: { connector_id: row.id, action_id: p.action_id, request_hash: requestHash },
    });
    const evidence = await submitEvidence({
      org_id: p.org_id, environment_id: p.environment_id, type: "communication.mailbox.read",
      actor: p.actor || "integration_gateway",
      evidence: {
        connector_id: row.id, action_id: p.action_id, channel: spec.adapter.channel, provider: spec.adapter.provider,
        operation: spec.operation, request_hash: requestHash, proposal_id: proposal.id,
        governance_evidence_id: proposal.evidence_id || null,
        message_count: Number(result.message_count || (result.message ? 1 : 0)),
        gmail_message_id: result.gmail_message_id || null,
        outcome: "success",
      },
    });
    return { ...result, ok: true, request_hash: requestHash, governance, evidence };
  } catch (error) {
    const mapped = adapters.mapError(p.action_id, error);
    await updateConnectorHealth(row.id, { status: mapped.retryable ? "degraded" : "down", latency_ms: Date.now() - started, error: `${mapped.code}: ${mapped.message}` });
    await submitEvidenceOrFlag({
      org_id: p.org_id, environment_id: p.environment_id, type: "communication.mailbox.read.failed",
      actor: p.actor || "integration_gateway",
      evidence: { connector_id: row.id, action_id: p.action_id, request_hash: requestHash, proposal_id: proposal.id, code: mapped.code, outcome: "failure" },
    });
    return { ok: false, code: mapped.code, error: mapped.message, retryable: !!mapped.retryable, request_hash: requestHash, governance };
  }
}

/**
 * Rotate a Gmail connector's OAuth refresh token. The replacement is validated
 * LIVE against Google before it is stored, so a rotation can never leave the
 * connector holding a credential that does not work. Plaintext arrives only as
 * a short-lived staged secret reference and is sealed immediately.
 */
async function rotateGmailCredentialsRaw(p, dependencies = {}) {
  const gmail = require("./connectors/gmail");
  const row = await communicationConnectorRow({ ...p, connector_type: "gmail" });
  const replacement = await consumeStagedSecret(p.org_id, p.secret_ref);
  const merged = { ...(row.config || {}), ...(p.config || {}) };
  const validated = gmail.validateConfiguration(merged, replacement || {});
  const identity = await gmail.validateCredentials(validated, replacement || {}, dependencies);
  if (identity.mailbox && identity.mailbox.toLowerCase() !== validated.mailbox) {
    throw new Error("the rotated credential authenticates a different mailbox than this connector is configured for");
  }
  const timestamp = store.nowISO();
  const previous = connectorSecret(row);
  await store.update("integration_connectors", row.id, {
    config: gmail.publicConfiguration({ ...validated, credential_validated_at: timestamp, credential_rotated_at: timestamp }),
    secret_encrypted: seal(replacement || {}),
    health: "healthy", last_checked_at: timestamp, last_error: null,
  });
  // Best-effort revocation of the superseded token: the rotation has already
  // succeeded, so a revoke failure must not roll it back.
  if (previous && previous.refresh_token && previous.refresh_token !== replacement.refresh_token) {
    await gmail.revokeCredentials(previous, dependencies).catch(() => null);
  }
  return publicConnector(await store.findOne("integration_connectors", { id: row.id }));
}

/**
 * Revoke a Gmail connector's credential at Google and drop the ciphertext.
 * The connector is left disabled, so no governed action can reach it.
 */
async function revokeGmailCredentialsRaw(p, dependencies = {}) {
  const gmail = require("./connectors/gmail");
  const row = assertOrg(await store.findOne("integration_connectors", { id: p.connector_id }), p.org_id, "Gmail connector");
  if (row.type !== "gmail") throw new Error("connector is not a Gmail connector");
  const result = await gmail.revokeCredentials(connectorSecret(row), dependencies).catch((error) => ({ revoked: false, reason: error.message }));
  const timestamp = store.nowISO();
  await store.update("integration_connectors", row.id, {
    secret_encrypted: null,
    config: gmail.publicConfiguration({ ...(row.config || {}), credential_revoked_at: timestamp }),
    status: "disabled", health: "unknown", last_checked_at: timestamp,
    last_error: result.revoked ? null : `revocation incomplete: ${clean(result.reason, 200)}`,
  });
  return { ...publicConnector(await store.findOne("integration_connectors", { id: row.id })), revoked: !!result.revoked };
}

/** Credential + reachability probe for a communication connector (read-only). */
async function checkCommunicationHealthRaw(p, dependencies = {}) {
  const adapters = require("./communication-adapters");
  const adapter = adapters.adapterFor(p.connector_type || "gmail");
  const row = await communicationConnectorRow({
    ...p, connector_type: adapter.connector_type, require_healthy: false,
  });
  const started = Date.now();
  try {
    const result = await adapter.load().validateCredentials(row.config || {}, connectorSecret(row), dependencies);
    await updateConnectorHealth(row.id, { status: "healthy", latency_ms: Date.now() - started, error: null });
    return { ok: true, connector_id: row.id, provider: adapter.provider, mailbox: result.mailbox, latency_ms: Date.now() - started };
  } catch (error) {
    const mapped = adapter.load().mapError(error);
    await updateConnectorHealth(row.id, { status: mapped.retryable ? "degraded" : "down", latency_ms: Date.now() - started, error: `${mapped.code}: ${mapped.message}` });
    return { ok: false, connector_id: row.id, code: mapped.code, error: mapped.message };
  }
}

async function handleBedrockActionGroup(p, dependencies = {}) {
  const bedrock = require("./connectors/aws-bedrock");
  const row = await bedrockConnectorRow(p);
  let canonical;
  try {
    canonical = bedrock.mapActionGroupEvent(p.event, {
      org_id: p.org_id, environment_id: p.environment_id, connector_id: row.id,
    });
  } catch (error) {
    const mapped = bedrock.mapError(error, "AWS_MALFORMED_PAYLOAD");
    return { ok: false, code: mapped.code, error: mapped.message };
  }
  const config = row.config || {};
  if (config.agent_ids && config.agent_ids.length && !config.agent_ids.includes(canonical.agent.id))
    return { ok: false, code: "AWS_AGENT_NOT_ALLOWED", error: "Bedrock agent is not configured for this connector" };
  if (config.agent_aliases && config.agent_aliases.length && !config.agent_aliases.includes(canonical.agent.alias))
    return { ok: false, code: "AWS_AGENT_ALIAS_NOT_ALLOWED", error: "Bedrock agent alias is not configured for this connector" };
  if (config.action_groups && config.action_groups.length && !config.action_groups.includes(canonical.action_group))
    return { ok: false, code: "AWS_ACTION_GROUP_NOT_ALLOWED", error: "Bedrock action group is not configured for this connector" };

  if (config.require_inbound_signature) {
    const verified = bedrock.verifyInboundSignature({
      secret: connectorSecret(row).inbound_signing_secret,
      timestamp: p.signature && p.signature.timestamp, nonce: p.signature && p.signature.nonce,
      signature: p.signature && p.signature.signature, rawBody: p.raw_body || JSON.stringify(p.event || {}),
    });
    if (!verified.ok) return { ok: false, code: verified.code, error: "Bedrock inbound request signature was rejected" };
    const events = await store.findOptional("integration_events", { org_id: p.org_id });
    if (events.some((e) => e.type === "aws.bedrock.inbound.nonce" && e.evidence && e.evidence.nonce_hash === verified.nonce_hash))
      return { ok: false, code: "AWS_REPLAY_DETECTED", error: "Bedrock inbound request nonce has already been used" };
    await submitEvidence({
      org_id: p.org_id, environment_id: p.environment_id, type: "aws.bedrock.inbound.nonce",
      actor: p.actor || "bedrock-agent", evidence: { connector_id: row.id, nonce_hash: verified.nonce_hash },
    });
  }

  const governFn = dependencies.governed || governed;
  let proposal;
  try {
    proposal = await governFn("govern_aws_bedrock_agent_action", {
      org_id: p.org_id, environment_id: p.environment_id, actor: p.actor || "bedrock-agent",
      params: {
        connector_id: row.id, agent_id: canonical.agent.id, agent_alias: canonical.agent.alias,
        action_group: canonical.action_group, api_path: canonical.api_path,
        http_method: canonical.http_method, function_name: canonical.function_name,
        session_id: canonical.session_id, request_hash: canonical.request_hash,
        parameter_names: canonical.parameters.map((x) => x.name),
        flags: { bedrock_agent_action: true },
      },
    });
  } catch {
    const response = bedrock.actionGroupResponse(canonical, "block", { reason: "Runtime Governance unavailable; action blocked" });
    await submitEvidenceOrFlag({
      org_id: p.org_id, environment_id: p.environment_id, type: "aws.bedrock.action-group.decision",
      actor: p.actor || "bedrock-agent", evidence: { connector_id: row.id, request_hash: canonical.request_hash, outcome: "BLOCK", code: "GOVERNANCE_UNAVAILABLE" },
    });
    return { ok: false, code: "GOVERNANCE_UNAVAILABLE", decision: "BLOCK", response };
  }
  const governance = governanceShape(proposal);
  const outcome = executed(proposal) ? "allow" : proposal.status === "escalated" ? "escalate" : "block";
  const response = bedrock.actionGroupResponse(canonical, outcome, {
    proposal_id: proposal.id, evidence_id: proposal.evidence_id, reason: governance.reason,
  });
  const evidence = await submitEvidence({
    org_id: p.org_id, environment_id: p.environment_id, type: "aws.bedrock.action-group.decision",
    actor: p.actor || "bedrock-agent",
    evidence: {
      connector_id: row.id, request_hash: canonical.request_hash, agent_id: canonical.agent.id,
      agent_alias: canonical.agent.alias, action_group: canonical.action_group,
      api_path: canonical.api_path, http_method: canonical.http_method,
      proposal_id: proposal.id, governance_evidence_id: proposal.evidence_id, outcome: outcome.toUpperCase(),
    },
  });
  return { ok: outcome === "allow", code: outcome === "allow" ? null : outcome === "escalate" ? "GOVERNANCE_ESCALATED" : "GOVERNANCE_BLOCKED", decision: outcome.toUpperCase(), governance, evidence, response };
}

async function bedrockOverview(org_id) {
  const [rows, usage, events, proposals] = await Promise.all([
    store.findOptional("integration_connectors", { org_id }),
    store.findOptional("integration_usage", { org_id }),
    store.findOptional("integration_events", { org_id }),
    store.findOptional("ops_proposals", { org_id }),
  ]);
  const connectors = rows.filter((x) => x.type === "aws-bedrock").map(publicConnector);
  return connectors.map((connector) => {
    const cUsage = usage.filter((u) => u.meta && u.meta.connector_id === connector.id);
    const cEvents = events.filter((e) => e.evidence && e.evidence.connector_id === connector.id);
    const cProposals = proposals.filter((x) => x.params && x.params.connector_id === connector.id);
    return {
      ...connector,
      organisation_id: org_id,
      aws_account_id: connector.config && connector.config.aws_account_id || null,
      region: connector.config && connector.config.region || null,
      iam_authentication_method: connector.config && connector.config.auth_method || null,
      model_ids: connector.config && connector.config.model_ids || [],
      inference_profiles: connector.config && connector.config.inference_profiles || [],
      agent_ids: connector.config && connector.config.agent_ids || [],
      agent_aliases: connector.config && connector.config.agent_aliases || [],
      action_groups: connector.config && connector.config.action_groups || [],
      last_successful_request: connector.config && connector.config.last_successful_request || null,
      recent_failures: cUsage.filter((x) => x.status !== "ok").slice(-10).reverse(),
      governance_decision_counts: {
        total: cProposals.length,
        permit: cProposals.filter((x) => x.status === "executed").length,
        block: cProposals.filter((x) => x.status === "blocked").length,
        escalate: cProposals.filter((x) => x.status === "escalated").length,
      },
      evidence_generated: cEvents.length + cProposals.filter((x) => x.evidence_id).length,
    };
  });
}

async function registerWebhookRaw(p) {
  const env = await store.findOne("environments", { id: p.environment_id });
  assertOrg(env, p.org_id, "environment");
  const staged = await consumeStagedSecret(p.org_id, p.secret_ref);
  if (!staged || !staged.secret) throw new Error("a staged webhook signing secret is required");
  const secret = staged.secret;
  const endpoint = await assertEndpointNetwork(p.url);
  const row = await store.insert("integration_webhooks", {
    org_id: p.org_id, environment_id: p.environment_id, name: clean(p.name || "GuardianOS webhook", 120),
    url: endpoint, events: Array.isArray(p.events) ? [...new Set(p.events.map(String))] : ["decision.created"],
    secret_encrypted: seal({ secret }), secret_prefix: secret.slice(0, 6),
    status: "active", capture_payloads: !!p.capture_payloads,
    failure_count: 0, last_delivery_at: null, last_success_at: null,
  });
  return { webhook: publicWebhook(row) };
}
function publicWebhook(row) {
  if (!row) return null;
  const { secret_encrypted, ...safe } = row;
  return { ...safe, signature_header: "x-guardian-signature", has_secret: !!secret_encrypted };
}
async function listWebhooks(org_id) {
  return (await store.findOptional("integration_webhooks", { org_id })).map(publicWebhook);
}
async function setWebhookStatusRaw(p) {
  const row = assertOrg(await store.findOne("integration_webhooks", { id: p.webhook_id }), p.org_id, "webhook");
  if (!["active", "paused", "revoked"].includes(p.status)) throw new Error("webhook status must be active, paused or revoked");
  await store.update("integration_webhooks", row.id, { status: p.status });
  return publicWebhook(await store.findOne("integration_webhooks", { id: row.id }));
}

async function deliverWebhookRaw(p) {
  const webhook = assertOrg(await store.findOne("integration_webhooks", { id: p.webhook_id }), p.org_id, "webhook");
  if (webhook.status !== "active") throw new Error("webhook is not active");
  const secrets = open(webhook.secret_encrypted);
  const body = JSON.stringify(p.payload || {});
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", secrets.secret).update(`${timestamp}.${body}`).digest("hex");
  const started = Date.now();
  let response, error = null;
  try {
    response = await fetch(await assertEndpointNetwork(webhook.url), {
      method: "POST",
      headers: {
        "content-type": "application/json", "user-agent": "GuardianOS-Integration-Gateway/1.0",
        "x-guardian-event": clean(p.event_type || "integration.event", 120),
        "x-guardian-timestamp": timestamp, "x-guardian-signature": `v1=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(Number(process.env.INTEGRATION_WEBHOOK_TIMEOUT_MS || 10000)),
    });
  } catch (e) { error = e && e.message ? e.message : String(e); }
  const ok = !!(response && response.ok);
  const delivery = await store.insert("integration_webhook_deliveries", {
    org_id: p.org_id, environment_id: webhook.environment_id, webhook_id: webhook.id,
    event_type: clean(p.event_type || "integration.event", 120), event_id: p.event_id || null,
    payload_hash: sha(body), payload: webhook.capture_payloads ? p.payload || {} : null,
    payload_encrypted: seal({ payload: p.payload || {} }),
    attempt: Number(p.attempt || 1), status: ok ? "delivered" : "failed",
    response_status: response ? response.status : null, latency_ms: Date.now() - started,
    error: error ? clean(error, 500) : (!ok && response ? `HTTP ${response.status}` : null),
    delivered_at: ok ? store.nowISO() : null,
  });
  await store.update("integration_webhooks", webhook.id, {
    last_delivery_at: store.nowISO(), last_success_at: ok ? store.nowISO() : webhook.last_success_at || null,
    failure_count: ok ? 0 : Number(webhook.failure_count || 0) + 1,
  });
  return { delivery_id: delivery.id, delivered: ok, status: delivery.response_status, error: delivery.error };
}
async function listDeliveries(org_id, webhook_id = null) {
  const rows = await store.findOptional("integration_webhook_deliveries", webhook_id ? { org_id, webhook_id } : { org_id });
  return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 250).map(publicDelivery);
}
function publicDelivery(row) {
  if (!row) return null;
  const { payload_encrypted, ...safe } = row;
  return safe;
}
async function replayDelivery({ org_id, delivery_id, actor = "customer" }) {
  const prior = assertOrg(await store.findOne("integration_webhook_deliveries", { id: delivery_id }), org_id, "delivery");
  const wrapped = open(prior.payload_encrypted);
  if (!wrapped || !("payload" in wrapped)) throw new Error("delivery payload is unavailable for replay");
  return governed("deliver_integration_webhook", {
    org_id, environment_id: prior.environment_id, actor,
    params: {
      webhook_id: prior.webhook_id, event_id: prior.event_id,
      event_type: prior.event_type, payload: wrapped.payload,
      attempt: Number(prior.attempt || 1) + 1, replay_of: prior.id,
    },
  });
}
async function dispatchEvent({ org_id, environment_id, event_type, event_id = null, payload }) {
  const webhooks = (await store.findOptional("integration_webhooks", { org_id }))
    .filter((w) => w.status === "active" && w.environment_id === environment_id && (w.events || []).includes(event_type));
  const results = [];
  for (const webhook of webhooks) {
    try {
      const proposal = await governed("deliver_integration_webhook", {
        org_id, environment_id, actor: "integration_gateway",
        params: { webhook_id: webhook.id, event_id, event_type, payload, attempt: 1 },
      });
      results.push({ webhook_id: webhook.id, proposal_id: proposal.id, evidence_id: proposal.evidence_id, status: proposal.status });
    } catch (e) {
      results.push({ webhook_id: webhook.id, status: "failed", error: clean(e && e.message ? e.message : e, 500) });
    }
  }
  return results;
}

async function createDeploymentRaw(p) {
  const env = assertOrg(await store.findOne("environments", { id: p.environment_id }), p.org_id, "environment");
  const target = clean(p.target || env.kind, 80);
  const row = await store.insert("integration_deployments", {
    org_id: p.org_id, environment_id: env.id, name: clean(p.name || `${env.name} deployment`, 120),
    target, model: clean(p.model || "platform", 80), status: env.kind === "production" ? "awaiting_activation" : "ready",
    version: clean(p.version || "current", 120), requested_by: clean(p.actor || "integration_gateway", 160),
    health: "unknown", deployed_at: null,
  });
  return row;
}
async function listDeployments(org_id) {
  return store.findOptional("integration_deployments", { org_id });
}

async function recordUsage({ org_id, environment_id = null, key_id = null, operation, sdk = null, status = "ok", latency_ms = null, meta = null }) {
  return store.insert("integration_usage", {
    org_id, environment_id, key_id, operation: clean(operation, 120), sdk: sdk ? clean(sdk, 80) : null,
    status, latency_ms, meta: meta || null,
  });
}
async function submitEvidence({ org_id, environment_id, type, evidence, actor = "customer" }) {
  const env = assertOrg(await store.findOne("environments", { id: environment_id }), org_id, "environment");
  const canonical = JSON.stringify(evidence || {});
  const event = await store.insert("integration_events", {
    org_id, environment_id: env.id, type: clean(type || "customer.evidence", 120),
    actor: clean(actor, 160), evidence: evidence || {}, evidence_hash: sha(canonical),
    immutable: true, occurred_at: store.nowISO(),
  });
  return { id: event.id, type: event.type, evidence_hash: event.evidence_hash, recorded_at: event.created_at };
}

/**
 * Record evidence for an outcome that has ALREADY been decided, without letting
 * a store fault break the request path.
 *
 * The swallow is deliberate and unchanged: a refusal has already happened, and
 * failing the caller a second time would turn an evidence outage into an
 * availability outage. What was wrong was doing it in silence — a bare
 * `.catch(() => {})` meant the record of a BLOCK could disappear leaving no log,
 * no alert and no counter. "Prove you blocked it" is the auditor's question, so
 * losing that record must be as loud as losing a decision.
 *
 * Mirrors the decision path (gateway.js): structured error event, counter via
 * log.emit, and a `record_failure` alert — already classified critical.
 */
async function submitEvidenceOrFlag(params) {
  try {
    return await submitEvidence(params);
  } catch (error) {
    const message = (error && error.message) || String(error);
    const payload = (params && params.evidence) || {};
    const context = {
      org_id: params && params.org_id, environment_id: params && params.environment_id,
      type: params && params.type, outcome: payload.outcome || null,
      connector_id: payload.connector_id || null, proposal_id: payload.proposal_id || null,
    };
    log.error("connector_evidence_record_failed", { ...context, error: message });
    try {
      require("./alerts").raise({
        org_id: context.org_id, environment_id: context.environment_id,
        kind: "record_failure",
        message: `Connector evidence not recorded (${context.type || "unknown"}): ${message}`,
        meta: { outcome: context.outcome, connector_id: context.connector_id, proposal_id: context.proposal_id },
      });
    } catch { /* alerting must never break the governed path */ }
    return null;
  }
}

async function governed(action_id, { org_id, environment_id = null, params = {}, actor = "integration_gateway" }) {
  const ops = require("../ops");
  return ops.proposals.propose({
    action_id, org_id, environment_id, params: { ...params, org_id, environment_id, actor },
    source: `integration_gateway:${actor}`,
  });
}

async function overview(org_id = null) {
  const where = org_id ? { org_id } : {};
  const [connectors, webhooks, deliveries, deployments, usage, events, orgs, decisions] = await Promise.all([
    store.findOptional("integration_connectors", where),
    store.findOptional("integration_webhooks", where),
    store.findOptional("integration_webhook_deliveries", where),
    store.findOptional("integration_deployments", where),
    store.findOptional("integration_usage", where),
    store.findOptional("integration_events", where),
    org_id ? store.find("orgs", { id: org_id }) : store.find("orgs", {}),
    store.queryDecisions({ ...(org_id ? { org_id } : {}), limit: 100000 }).catch(() => []),
  ]);
  const failures = deliveries.filter((d) => d.status === "failed");
  const latencies = usage.map((u) => Number(u.latency_ms)).filter(Number.isFinite);
  const bySdk = {};
  for (const u of usage) if (u.sdk) bySdk[u.sdk] = (bySdk[u.sdk] || 0) + 1;
  return {
    organisations: orgs.length,
    connected_systems: connectors.length,
    connectors_healthy: connectors.filter((c) => c.health === "healthy").length,
    connectors_degraded: connectors.filter((c) => ["degraded", "down"].includes(c.health)).length,
    webhooks: webhooks.length,
    webhook_deliveries: deliveries.length,
    webhook_success_rate: deliveries.length ? +(((deliveries.length - failures.length) / deliveries.length) * 100).toFixed(2) : null,
    sandbox_deployments: deployments.filter((d) => d.target === "sandbox").length,
    production_deployments: deployments.filter((d) => d.target === "production").length,
    api_requests: usage.length,
    rate_limit: process.env.RUNTIME_RATE_LIMIT ? `${process.env.RUNTIME_RATE_LIMIT} requests/window` : "deployment policy",
    avg_api_latency_ms: latencies.length ? +(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2) : null,
    sdk_usage: bySdk,
    errors: usage.filter((u) => u.status !== "ok").length + failures.length,
    recent_events: events.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 20),
    governance_decisions: decisions.length,
    evidence_generated: decisions.length + events.length + deliveries.length,
  };
}

module.exports = {
  CONNECTOR_DEFINITIONS, SDK_METHODS, BEDROCK_SDK_METHODS, connectorDefinition, safeEndpoint, assertEndpointNetwork,
  allows, allowsEnvironment, canDelegateScopes, executed, stageSecret,
  publicConnector, listConnectors, createConnectorRaw, updateConnectorHealth, setConnectorStatusRaw, checkConnectorHealthRaw,
  checkBedrockHealthRaw, rotateBedrockCredentialsRaw, invokeBedrock, handleBedrockActionGroup, bedrockOverview,
  sendCommunication, readCommunication, checkCommunicationHealthRaw, communicationConnectorRow,
  rotateGmailCredentialsRaw, revokeGmailCredentialsRaw,
  publicWebhook, listWebhooks, registerWebhookRaw, setWebhookStatusRaw, deliverWebhookRaw, publicDelivery, listDeliveries, replayDelivery, dispatchEvent,
  createDeploymentRaw, listDeployments, recordUsage, submitEvidence, submitEvidenceOrFlag, governed, overview,
};

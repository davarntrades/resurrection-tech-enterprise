/* GuardianOS Integration Gateway — Salesforce provider boundary.
 * No governance authority lives here. Every call is made only after the
 * provider-neutral enterprise action path receives an executable permit. */
"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");

const TIMEOUT_MS = Number(process.env.INTEGRATION_SALESFORCE_TIMEOUT_MS || 15000);
const DEFAULT_VERSION = "v61.0";
const OBJECTS = Object.freeze({
  Account: ["Id", "Name", "Type", "Industry", "Phone", "Website"],
  Contact: ["Id", "FirstName", "LastName", "Email", "Phone", "AccountId"],
  Lead: ["Id", "FirstName", "LastName", "Company", "Email", "Phone", "Status"],
  Case: ["Id", "CaseNumber", "Subject", "Status", "Priority", "ContactId", "AccountId"],
  CaseComment: ["Id", "ParentId", "CommentBody", "IsPublished"],
  Task: ["Id", "Subject", "Status", "Priority", "WhoId", "WhatId", "Description"],
});
const OPERATIONS = Object.freeze([
  "get_record", "search_records", "create_lead", "update_lead", "create_case",
  "update_case", "add_case_comment", "create_task",
]);
const MUTATIONS = new Set(OPERATIONS.filter((x) => !x.startsWith("get_") && x !== "search_records"));
const SEARCH_FIELD = Object.freeze({ Account: "Name", Contact: "Name", Lead: "Name", Case: "Subject", Task: "Subject" });

class SalesforceConnectorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SalesforceConnectorError";
    this.code = code;
    this.status = details.status || 502;
    this.retryable = !!details.retryable;
    this.category = details.category || classifyCode(code);
    this.provider_latency_ms = details.provider_latency_ms == null ? null : Number(details.provider_latency_ms);
  }
}

const clean = (value, max = 1000) => String(value == null ? "" : value).slice(0, max);
const hash = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value || {})).digest("hex");
const elapsed = (started) => Math.max(0, Math.round(performance.now() - started));
const list = (value) => (Array.isArray(value) ? value : []).map((x) => clean(x, 120).trim()).filter(Boolean);

function fail(code, message, status = 400) {
  throw new SalesforceConnectorError(code, message, { status });
}
function classifyCode(code) {
  const value = String(code || "");
  if (/TOKEN|OAUTH|CREDENTIAL|UNAUTHORIZED|INVALID_GRANT/.test(value)) return "credentials";
  if (/TIMEOUT/.test(value)) return "timeout";
  if (/NETWORK/.test(value)) return "networking";
  if (/RATE|LIMIT|QUOTA/.test(value)) return "rate_limit";
  if (/ALLOW|FIELD|OBJECT|INPUT|ID|CONFIG/.test(value)) return "validation";
  return "salesforce_provider";
}
function safeUrl(value, label, allowedSuffixes) {
  let url;
  try { url = new URL(String(value || "")); } catch { fail("SALESFORCE_CONFIG_INVALID", `${label} must be a valid HTTPS URL`); }
  if (url.protocol !== "https:") fail("SALESFORCE_CONFIG_INVALID", `${label} must use HTTPS`);
  const host = url.hostname.toLowerCase();
  if (!allowedSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    fail("SALESFORCE_CONFIG_INVALID", `${label} must use an approved Salesforce domain`);
  }
  url.username = ""; url.password = ""; url.search = ""; url.hash = "";
  return url.origin;
}
function normaliseCapabilities(value) {
  const requested = list(value).map((x) => x.toLowerCase());
  if (!requested.length) return [...OPERATIONS];
  const unknown = requested.filter((x) => !OPERATIONS.includes(x));
  if (unknown.length) fail("SALESFORCE_CAPABILITY_INVALID", `unsupported capabilities: ${unknown.join(", ")}`);
  return OPERATIONS.filter((x) => requested.includes(x));
}
function validateConfiguration(config = {}, secret = {}, { allowAmbient = false } = {}) {
  const login_url = safeUrl(config.login_url || (config.sandbox ? "https://test.salesforce.com" : "https://login.salesforce.com"), "login_url", ["salesforce.com"]);
  const instance_url = config.instance_url
    ? safeUrl(config.instance_url, "instance_url", ["salesforce.com", "force.com", "salesforce-sites.com"])
    : null;
  const api_version = /^v\d{2,3}\.\d$/.test(String(config.api_version || "")) ? String(config.api_version) : DEFAULT_VERSION;
  const allowed_objects = list(config.allowed_objects).filter((x) => OBJECTS[x]);
  const objects = allowed_objects.length ? allowed_objects : ["Account", "Contact", "Lead", "Case", "CaseComment", "Task"];
  const configuredFields = config.allowed_fields && typeof config.allowed_fields === "object" ? config.allowed_fields : {};
  const allowed_fields = {};
  for (const object of objects) {
    const fields = list(configuredFields[object]).filter((field) => OBJECTS[object].includes(field));
    allowed_fields[object] = fields.length ? fields : [...OBJECTS[object]];
  }
  if (!allowAmbient) {
    for (const field of ["client_id", "client_secret", "refresh_token"]) {
      if (!clean(secret[field], 4000).trim()) fail("SALESFORCE_CREDENTIALS_MISSING", `Salesforce OAuth ${field} is required`);
    }
  }
  return {
    login_url, instance_url, api_version, sandbox: !!config.sandbox,
    capabilities: normaliseCapabilities(config.capabilities),
    allowed_objects: objects, allowed_fields,
  };
}
function publicConfiguration(config = {}) {
  const value = validateConfiguration(config, {}, { allowAmbient: true });
  return {
    ...value,
    credential_validated_at: config.credential_validated_at || null,
    credential_rotated_at: config.credential_rotated_at || null,
    last_successful_request: config.last_successful_request || null,
    authenticated_identity: config.authenticated_identity || null,
  };
}
function assertCapability(config, operation) {
  if (!normaliseCapabilities(config.capabilities).includes(operation)) {
    fail("SALESFORCE_CAPABILITY_NOT_ENABLED", `this connector is not configured to ${operation}`, 403);
  }
}
function allowedFields(config, object) {
  const validated = validateConfiguration(config, {}, { allowAmbient: true });
  if (!validated.allowed_objects.includes(object)) fail("SALESFORCE_OBJECT_NOT_ALLOWED", `${object} is not allowed`, 403);
  return validated.allowed_fields[object] || [];
}
function normaliseInput(operation, input = {}, config = {}) {
  assertCapability(config, operation);
  const objectByOperation = {
    create_lead: "Lead", update_lead: "Lead", create_case: "Case", update_case: "Case",
    add_case_comment: "CaseComment", create_task: "Task",
  };
  const object = clean(input.object || objectByOperation[operation], 80);
  const fieldsAllowed = allowedFields(config, object);
  if (operation === "get_record") {
    const record_id = clean(input.record_id, 80);
    if (!/^[a-zA-Z0-9]{15,18}$/.test(record_id)) fail("SALESFORCE_RECORD_ID_INVALID", "a valid Salesforce record id is required");
    return { object, record_id, fields: list(input.fields).length ? list(input.fields) : fieldsAllowed };
  }
  if (operation === "search_records") {
    if (!SEARCH_FIELD[object]) fail("SALESFORCE_OBJECT_NOT_ALLOWED", `${object} is not searchable by this connector`, 403);
    const term = clean(input.term, 120).trim();
    if (!term) fail("SALESFORCE_INPUT_INVALID", "a search term is required");
    return { object, term, fields: list(input.fields).length ? list(input.fields) : fieldsAllowed, limit: Math.max(1, Math.min(50, Number(input.limit) || 20)) };
  }
  const record_id = operation.startsWith("update_") ? clean(input.record_id, 80) : null;
  if (record_id && !/^[a-zA-Z0-9]{15,18}$/.test(record_id)) fail("SALESFORCE_RECORD_ID_INVALID", "a valid Salesforce record id is required");
  const source = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields) ? input.fields : {};
  const fields = {};
  for (const [key, value] of Object.entries(source)) {
    if (!fieldsAllowed.includes(key)) fail("SALESFORCE_FIELD_NOT_ALLOWED", `${object}.${key} is not allowed`, 403);
    if (value != null && !["string", "number", "boolean"].includes(typeof value)) fail("SALESFORCE_INPUT_INVALID", `${object}.${key} must be a scalar value`);
    fields[key] = typeof value === "string" ? clean(value, 10000) : value;
  }
  if (!Object.keys(fields).length) fail("SALESFORCE_INPUT_INVALID", "at least one allowed field is required");
  return { object, record_id, fields };
}
function requestHash(operation, input, config) {
  return hash({ operation, input: normaliseInput(operation, input, config) });
}
function mutationHash(operation, input, config) {
  if (!MUTATIONS.has(operation)) fail("SALESFORCE_INPUT_INVALID", `${operation} is not a mutation`);
  return requestHash(operation, input, config);
}
async function request(url, init = {}, dependencies = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await (dependencies.fetch || globalThis.fetch)(url, { ...init, signal: controller.signal }); }
  catch (error) {
    if (error && error.code === "OUTBOUND_DENIED") throw error;
    if (error && error.name === "AbortError") throw new SalesforceConnectorError("SALESFORCE_TIMEOUT", "Salesforce request timed out", { status: 504, retryable: true });
    throw new SalesforceConnectorError("SALESFORCE_NETWORK_ERROR", "Salesforce endpoint is unreachable", { retryable: true });
  } finally { clearTimeout(timer); }
}
async function providerError(response, fallback) {
  let payload = null;
  try { payload = await response.json(); } catch { /* redacted fallback */ }
  const item = Array.isArray(payload) ? payload[0] : payload;
  const providerCode = clean(item && (item.errorCode || item.error), 100);
  const message = clean(item && (item.message || item.error_description), 500) || `Salesforce returned HTTP ${response.status}`;
  const code = response.status === 401 ? "SALESFORCE_UNAUTHORIZED"
    : response.status === 403 ? "SALESFORCE_FORBIDDEN"
      : response.status === 429 ? "SALESFORCE_RATE_LIMIT" : fallback;
  return new SalesforceConnectorError(code, `${providerCode ? `${providerCode}: ` : ""}${message}`, {
    status: response.status, retryable: [408, 429, 500, 502, 503, 504].includes(response.status),
  });
}
async function accessToken(config, secret, dependencies = {}) {
  const validated = validateConfiguration(config, secret);
  const response = await request(`${validated.login_url}/services/oauth2/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", client_id: secret.client_id,
      client_secret: secret.client_secret, refresh_token: secret.refresh_token,
    }).toString(),
  }, dependencies);
  if (!response.ok) throw await providerError(response, "SALESFORCE_OAUTH_FAILED");
  const token = await response.json();
  if (!token.access_token || !token.instance_url) fail("SALESFORCE_OAUTH_FAILED", "Salesforce OAuth response did not include an access token and instance URL", 502);
  const instance_url = safeUrl(token.instance_url, "OAuth instance_url", ["salesforce.com", "force.com", "salesforce-sites.com"]);
  if (validated.instance_url && new URL(validated.instance_url).hostname !== new URL(instance_url).hostname) {
    fail("SALESFORCE_INSTANCE_MISMATCH", "OAuth credential belongs to a different Salesforce instance", 403);
  }
  return { token: token.access_token, instance_url, identity: clean(token.id, 500) || null };
}
async function validateCredentials(config, secret, dependencies = {}) {
  const started = performance.now();
  const auth = await accessToken(config, secret, dependencies);
  const version = validateConfiguration(config, secret).api_version;
  const response = await request(`${auth.instance_url}/services/data/${version}/limits`, {
    headers: { authorization: `Bearer ${auth.token}`, accept: "application/json" },
  }, dependencies);
  if (!response.ok) throw await providerError(response, "SALESFORCE_VALIDATION_FAILED");
  await response.json().catch(() => ({}));
  return { instance_url: auth.instance_url, identity: auth.identity, provider_latency_ms: elapsed(started) };
}
async function execute(operation, config, secret, input, dependencies = {}) {
  const started = performance.now();
  const value = normaliseInput(operation, input, config);
  const auth = await accessToken(config, secret, dependencies);
  const version = validateConfiguration(config, secret).api_version;
  const base = `${auth.instance_url}/services/data/${version}`;
  let url, init = { headers: { authorization: `Bearer ${auth.token}`, accept: "application/json" } };
  if (operation === "get_record") {
    for (const field of value.fields) if (!allowedFields(config, value.object).includes(field)) fail("SALESFORCE_FIELD_NOT_ALLOWED", `${value.object}.${field} is not allowed`, 403);
    url = `${base}/sobjects/${encodeURIComponent(value.object)}/${encodeURIComponent(value.record_id)}?fields=${encodeURIComponent(value.fields.join(","))}`;
  } else if (operation === "search_records") {
    for (const field of value.fields) if (!allowedFields(config, value.object).includes(field)) fail("SALESFORCE_FIELD_NOT_ALLOWED", `${value.object}.${field} is not allowed`, 403);
    const escaped = value.term.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const query = `SELECT ${value.fields.join(",")} FROM ${value.object} WHERE ${SEARCH_FIELD[value.object]} LIKE '%${escaped}%' LIMIT ${value.limit}`;
    url = `${base}/query?q=${encodeURIComponent(query)}`;
  } else {
    const isUpdate = operation.startsWith("update_");
    url = `${base}/sobjects/${encodeURIComponent(value.object)}${isUpdate ? `/${encodeURIComponent(value.record_id)}` : ""}`;
    init = { method: isUpdate ? "PATCH" : "POST", headers: { ...init.headers, "content-type": "application/json" }, body: JSON.stringify(value.fields) };
  }
  const response = await request(url, init, dependencies);
  if (!response.ok) throw await providerError(response, "SALESFORCE_REQUEST_FAILED");
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  const recordId = clean(payload.id || value.record_id, 80) || null;
  return {
    ok: true, provider: "salesforce", operation, external_record_id: recordId,
    records: operation === "search_records" ? (payload.records || []) : operation === "get_record" ? [payload] : undefined,
    record_count: operation === "search_records" ? Number(payload.totalSize || (payload.records || []).length) : operation === "get_record" ? 1 : undefined,
    provider_latency_ms: elapsed(started), attempts: 1,
  };
}
function mapError(error) {
  return error instanceof SalesforceConnectorError ? error
    : new SalesforceConnectorError("SALESFORCE_REQUEST_FAILED", clean(error && error.message) || "Salesforce request failed");
}

module.exports = {
  OBJECTS, OPERATIONS, MUTATIONS, SalesforceConnectorError, classifyCode,
  validateConfiguration, publicConfiguration, normaliseCapabilities,
  assertCapability, normaliseInput, requestHash, mutationHash,
  accessToken, validateCredentials, execute, mapError,
};

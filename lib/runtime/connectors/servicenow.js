/* GuardianOS Integration Gateway — ServiceNow provider boundary.
 * OAuth only, strict table/field allowlists, and no governance authority. */
"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");

const TIMEOUT_MS = Number(process.env.INTEGRATION_SERVICENOW_TIMEOUT_MS || 15000);
const TABLES = Object.freeze({
  incident: ["sys_id", "number", "short_description", "description", "state", "impact", "urgency", "priority", "assigned_to", "assignment_group", "work_notes"],
  change_request: ["sys_id", "number", "short_description", "description", "state", "risk", "impact", "assigned_to", "assignment_group", "work_notes"],
});
const OPERATIONS = Object.freeze([
  "get_record", "list_incidents", "list_change_requests", "create_incident",
  "update_incident", "add_work_note", "assign_incident",
  "create_change_request", "update_change_request",
]);
const MUTATIONS = new Set(OPERATIONS.filter((x) => !x.startsWith("get_") && !x.startsWith("list_")));

class ServiceNowConnectorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ServiceNowConnectorError";
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
function fail(code, message, status = 400) { throw new ServiceNowConnectorError(code, message, { status }); }
function classifyCode(code) {
  const value = String(code || "");
  if (/TOKEN|OAUTH|CREDENTIAL|UNAUTHORIZED|INVALID_GRANT/.test(value)) return "credentials";
  if (/TIMEOUT/.test(value)) return "timeout";
  if (/NETWORK/.test(value)) return "networking";
  if (/RATE|LIMIT|QUOTA/.test(value)) return "rate_limit";
  if (/ALLOW|FIELD|TABLE|INPUT|ID|CONFIG/.test(value)) return "validation";
  return "servicenow_provider";
}
function instanceUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { fail("SERVICENOW_CONFIG_INVALID", "instance_url must be a valid HTTPS URL"); }
  if (url.protocol !== "https:") fail("SERVICENOW_CONFIG_INVALID", "instance_url must use HTTPS");
  const host = url.hostname.toLowerCase();
  const allowCustom = /^(1|true|yes)$/i.test(String(process.env.INTEGRATION_SERVICENOW_ALLOW_CUSTOM_DOMAIN || ""));
  if (!allowCustom && !(host === "service-now.com" || host.endsWith(".service-now.com"))) {
    fail("SERVICENOW_CONFIG_INVALID", "instance_url must use a service-now.com domain");
  }
  url.username = ""; url.password = ""; url.search = ""; url.hash = "";
  return url.origin;
}
function normaliseCapabilities(value) {
  const requested = list(value).map((x) => x.toLowerCase());
  if (!requested.length) return [...OPERATIONS];
  const unknown = requested.filter((x) => !OPERATIONS.includes(x));
  if (unknown.length) fail("SERVICENOW_CAPABILITY_INVALID", `unsupported capabilities: ${unknown.join(", ")}`);
  return OPERATIONS.filter((x) => requested.includes(x));
}
function validateConfiguration(config = {}, secret = {}, { allowAmbient = false } = {}) {
  const instance_url = instanceUrl(config.instance_url);
  const allowed_tables = list(config.allowed_tables).filter((x) => TABLES[x]);
  const tables = allowed_tables.length ? allowed_tables : ["incident", "change_request"];
  const configuredFields = config.allowed_fields && typeof config.allowed_fields === "object" ? config.allowed_fields : {};
  const allowed_fields = {};
  for (const table of tables) {
    const fields = list(configuredFields[table]).filter((field) => TABLES[table].includes(field));
    allowed_fields[table] = fields.length ? fields : [...TABLES[table]];
  }
  if (!allowAmbient) {
    for (const field of ["client_id", "client_secret", "refresh_token"]) {
      if (!clean(secret[field], 4000).trim()) fail("SERVICENOW_CREDENTIALS_MISSING", `ServiceNow OAuth ${field} is required`);
    }
  }
  return {
    instance_url, capabilities: normaliseCapabilities(config.capabilities),
    allowed_tables: tables, allowed_fields,
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
  if (!normaliseCapabilities(config.capabilities).includes(operation)) fail("SERVICENOW_CAPABILITY_NOT_ENABLED", `this connector is not configured to ${operation}`, 403);
}
function allowedFields(config, table) {
  const validated = validateConfiguration(config, {}, { allowAmbient: true });
  if (!validated.allowed_tables.includes(table)) fail("SERVICENOW_TABLE_NOT_ALLOWED", `${table} is not allowed`, 403);
  return validated.allowed_fields[table] || [];
}
function normaliseInput(operation, input = {}, config = {}) {
  assertCapability(config, operation);
  const table = operation.includes("change_request") ? "change_request" : "incident";
  const fieldsAllowed = allowedFields(config, table);
  if (operation === "get_record") {
    const requested = clean(input.table, 80);
    const target = requested || table;
    const record_id = clean(input.record_id, 80);
    if (!/^[a-fA-F0-9]{32}$/.test(record_id)) fail("SERVICENOW_RECORD_ID_INVALID", "a valid ServiceNow sys_id is required");
    return { table: target, record_id, fields: list(input.fields).length ? list(input.fields) : allowedFields(config, target) };
  }
  if (operation.startsWith("list_")) {
    const state = clean(input.state, 40).trim() || null;
    if (state && !/^[a-zA-Z0-9_ -]+$/.test(state)) fail("SERVICENOW_INPUT_INVALID", "state contains unsupported query characters");
    return { table, fields: list(input.fields).length ? list(input.fields) : fieldsAllowed, limit: Math.max(1, Math.min(100, Number(input.limit) || 20)), state };
  }
  const record_id = operation.startsWith("update_") || operation === "add_work_note" || operation === "assign_incident" ? clean(input.record_id, 80) : null;
  if (record_id && !/^[a-fA-F0-9]{32}$/.test(record_id)) fail("SERVICENOW_RECORD_ID_INVALID", "a valid ServiceNow sys_id is required");
  let source = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields) ? input.fields : {};
  if (operation === "add_work_note") source = { work_notes: input.work_note };
  if (operation === "assign_incident") source = { assigned_to: input.assigned_to, ...(input.assignment_group ? { assignment_group: input.assignment_group } : {}) };
  const fields = {};
  for (const [key, value] of Object.entries(source)) {
    if (!fieldsAllowed.includes(key)) fail("SERVICENOW_FIELD_NOT_ALLOWED", `${table}.${key} is not allowed`, 403);
    if (value != null && !["string", "number", "boolean"].includes(typeof value)) fail("SERVICENOW_INPUT_INVALID", `${table}.${key} must be a scalar value`);
    fields[key] = typeof value === "string" ? clean(value, 10000) : value;
  }
  if (!Object.keys(fields).length) fail("SERVICENOW_INPUT_INVALID", "at least one allowed field is required");
  return { table, record_id, fields };
}
function requestHash(operation, input, config) { return hash({ operation, input: normaliseInput(operation, input, config) }); }
function mutationHash(operation, input, config) {
  if (!MUTATIONS.has(operation)) fail("SERVICENOW_INPUT_INVALID", `${operation} is not a mutation`);
  return requestHash(operation, input, config);
}
async function request(url, init = {}, dependencies = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await (dependencies.fetch || globalThis.fetch)(url, { ...init, signal: controller.signal }); }
  catch (error) {
    if (error && error.code === "OUTBOUND_DENIED") throw error;
    if (error && error.name === "AbortError") throw new ServiceNowConnectorError("SERVICENOW_TIMEOUT", "ServiceNow request timed out", { status: 504, retryable: true });
    throw new ServiceNowConnectorError("SERVICENOW_NETWORK_ERROR", "ServiceNow endpoint is unreachable", { retryable: true });
  } finally { clearTimeout(timer); }
}
async function providerError(response, fallback) {
  let payload = null;
  try { payload = await response.json(); } catch { /* redacted fallback */ }
  const detail = payload && payload.error;
  const message = clean(detail && (detail.message || detail.detail), 500) || `ServiceNow returned HTTP ${response.status}`;
  const code = response.status === 401 ? "SERVICENOW_UNAUTHORIZED"
    : response.status === 403 ? "SERVICENOW_FORBIDDEN"
      : response.status === 429 ? "SERVICENOW_RATE_LIMIT" : fallback;
  return new ServiceNowConnectorError(code, message, {
    status: response.status, retryable: [408, 429, 500, 502, 503, 504].includes(response.status),
  });
}
async function accessToken(config, secret, dependencies = {}) {
  const validated = validateConfiguration(config, secret);
  const response = await request(`${validated.instance_url}/oauth_token.do`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", client_id: secret.client_id,
      client_secret: secret.client_secret, refresh_token: secret.refresh_token,
    }).toString(),
  }, dependencies);
  if (!response.ok) throw await providerError(response, "SERVICENOW_OAUTH_FAILED");
  const token = await response.json();
  if (!token.access_token) fail("SERVICENOW_OAUTH_FAILED", "ServiceNow OAuth response did not include an access token", 502);
  return token.access_token;
}
async function validateCredentials(config, secret, dependencies = {}) {
  const started = performance.now();
  const validated = validateConfiguration(config, secret);
  const token = await accessToken(config, secret, dependencies);
  const response = await request(`${validated.instance_url}/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id,user_name`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  }, dependencies);
  if (!response.ok) throw await providerError(response, "SERVICENOW_VALIDATION_FAILED");
  const payload = await response.json();
  const identity = payload && payload.result && payload.result[0] && payload.result[0].user_name;
  return { instance_url: validated.instance_url, identity: clean(identity, 200) || null, provider_latency_ms: elapsed(started) };
}
async function execute(operation, config, secret, input, dependencies = {}) {
  const started = performance.now();
  const value = normaliseInput(operation, input, config);
  const validated = validateConfiguration(config, secret);
  const token = await accessToken(config, secret, dependencies);
  const base = `${validated.instance_url}/api/now/table/${encodeURIComponent(value.table)}`;
  let url, init = { headers: { authorization: `Bearer ${token}`, accept: "application/json" } };
  if (operation === "get_record") {
    for (const field of value.fields) if (!allowedFields(config, value.table).includes(field)) fail("SERVICENOW_FIELD_NOT_ALLOWED", `${value.table}.${field} is not allowed`, 403);
    url = `${base}/${value.record_id}?sysparm_fields=${encodeURIComponent(value.fields.join(","))}`;
  } else if (operation.startsWith("list_")) {
    for (const field of value.fields) if (!allowedFields(config, value.table).includes(field)) fail("SERVICENOW_FIELD_NOT_ALLOWED", `${value.table}.${field} is not allowed`, 403);
    const query = value.state ? `&sysparm_query=${encodeURIComponent(`state=${value.state}`)}` : "";
    url = `${base}?sysparm_limit=${value.limit}&sysparm_fields=${encodeURIComponent(value.fields.join(","))}${query}`;
  } else {
    const update = !!value.record_id;
    url = `${base}${update ? `/${value.record_id}` : ""}`;
    init = { method: update ? "PATCH" : "POST", headers: { ...init.headers, "content-type": "application/json" }, body: JSON.stringify(value.fields) };
  }
  const response = await request(url, init, dependencies);
  if (!response.ok) throw await providerError(response, "SERVICENOW_REQUEST_FAILED");
  const payload = await response.json().catch(() => ({}));
  const result = payload.result;
  const rows = Array.isArray(result) ? result : result ? [result] : [];
  return {
    ok: true, provider: "servicenow", operation,
    external_record_id: clean(rows[0] && rows[0].sys_id, 80) || value.record_id || null,
    records: operation === "get_record" || operation.startsWith("list_") ? rows : undefined,
    record_count: operation === "get_record" || operation.startsWith("list_") ? rows.length : undefined,
    provider_latency_ms: elapsed(started), attempts: 1,
  };
}
function mapError(error) {
  return error instanceof ServiceNowConnectorError ? error
    : new ServiceNowConnectorError("SERVICENOW_REQUEST_FAILED", clean(error && error.message) || "ServiceNow request failed");
}

module.exports = {
  TABLES, OPERATIONS, MUTATIONS, ServiceNowConnectorError, classifyCode,
  validateConfiguration, publicConfiguration, normaliseCapabilities,
  assertCapability, normaliseInput, requestHash, mutationHash,
  accessToken, validateCredentials, execute, mapError,
};

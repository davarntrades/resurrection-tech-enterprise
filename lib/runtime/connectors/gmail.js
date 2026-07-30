/* ============================================================================
 * GuardianOS Integration Gateway — Gmail connector boundary
 *
 * The provider edge only. It holds NO governance authority: it is called after
 * a Runtime Governance permit and never decides whether a message may be sent.
 *
 * Distinct from lib/ops/gmail.js, which is the Operations Agent's own READ-ONLY
 * inbox monitor and keeps its own gmail.readonly token. The two never share a
 * credential: this connector is enterprise-scoped, stored per organisation and
 * environment through the Integration Gateway credential model.
 *
 * Zero-dependency (raw fetch to Google endpoints, house style). Base URLs are
 * overridable (INTEGRATION_GMAIL_OAUTH_BASE / INTEGRATION_GMAIL_API_BASE) for
 * hermetic tests.
 * ============================================================================ */
"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");

const OAUTH_BASE = () => process.env.INTEGRATION_GMAIL_OAUTH_BASE || "https://oauth2.googleapis.com";
const API_BASE = () => process.env.INTEGRATION_GMAIL_API_BASE || "https://gmail.googleapis.com/gmail/v1";
const TIMEOUT_MS = Number(process.env.INTEGRATION_GMAIL_TIMEOUT_MS || 15000);

// Least privilege: gmail.send covers send + reply, gmail.compose is required
// only to create a draft. A connector configured for drafts alone never holds
// a send-capable token.
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
const READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const SCOPES = Object.freeze({
  send: SEND_SCOPE, reply: SEND_SCOPE, draft: COMPOSE_SCOPE,
  list: READ_SCOPE, read: READ_SCOPE,
});

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const NETWORK_CODES = new Set([
  "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED",
  "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
]);
const EMAIL = /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/;
const MAX_RECIPIENTS = 25;
const MAX_BODY = 200000;

class GmailConnectorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GmailConnectorError";
    this.code = code;
    this.status = details.status || 502;
    this.retryable = !!details.retryable;
    this.gmail_request_id = details.gmail_request_id || null;
    this.category = details.category || classifyCode(code);
    this.provider_latency_ms = details.provider_latency_ms == null ? null : Number(details.provider_latency_ms);
  }
}

function classifyCode(code) {
  const value = String(code || "");
  if (/CREDENTIAL|TOKEN|UNAUTHORIZED|INVALID_GRANT|SCOPE/.test(value)) return "credentials";
  if (/TIMEOUT/.test(value)) return "timeout";
  if (/NETWORK|DNS|CONNECTION/.test(value)) return "networking";
  if (/VALIDATION|RECIPIENT|SUBJECT|BODY|MAILBOX|HEADER|THREAD/.test(value)) return "validation";
  if (/RATE_LIMIT|QUOTA/.test(value)) return "rate_limit";
  if (/^GMAIL_/.test(value)) return "gmail_provider";
  return "internal_orchestration";
}

const clean = (value, max = 500) => String(value == null ? "" : value).slice(0, max);
const hash = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value || {})).digest("hex");
const elapsed = (started) => Math.max(0, Math.round(performance.now() - started));

/* Header-injection guard. A recipient or subject carrying CR/LF could append
 * arbitrary SMTP headers (Bcc, Reply-To) to the MIME document, turning one
 * approved message into a different one. Any control character is a hard
 * rejection, never a silent strip — the operator approved specific text. */
function assertHeaderSafe(value, label) {
  if (/[\x00-\x1f\x7f]/.test(String(value))) {
    throw new GmailConnectorError("GMAIL_HEADER_INJECTION", `${label} contains control characters and cannot be sent`, { status: 400 });
  }
  return String(value);
}

function normaliseRecipients(list, label) {
  const values = (Array.isArray(list) ? list : list == null || list === "" ? [] : [list])
    .map((item) => clean(item, 320).trim()).filter(Boolean);
  if (values.length > MAX_RECIPIENTS) {
    throw new GmailConnectorError("GMAIL_RECIPIENT_LIMIT", `${label} exceeds ${MAX_RECIPIENTS} recipients`, { status: 400 });
  }
  for (const value of values) {
    assertHeaderSafe(value, label);
    if (!EMAIL.test(value)) throw new GmailConnectorError("GMAIL_RECIPIENT_INVALID", `${label} contains an invalid address`, { status: 400 });
  }
  return values;
}

/** Canonical, provider-neutral message → validated Gmail message. */
function normaliseMessage(message = {}) {
  const to = normaliseRecipients(message.to, "to");
  if (!to.length) throw new GmailConnectorError("GMAIL_RECIPIENT_REQUIRED", "at least one recipient is required", { status: 400 });
  const subject = assertHeaderSafe(clean(message.subject, 900).trim(), "subject");
  if (!subject) throw new GmailConnectorError("GMAIL_SUBJECT_REQUIRED", "a subject is required", { status: 400 });
  const body = String(message.body == null ? "" : message.body);
  if (!body.trim()) throw new GmailConnectorError("GMAIL_BODY_REQUIRED", "a message body is required", { status: 400 });
  if (body.length > MAX_BODY) throw new GmailConnectorError("GMAIL_BODY_TOO_LARGE", "message body exceeds the connector limit", { status: 400 });
  return {
    to,
    cc: normaliseRecipients(message.cc, "cc"),
    bcc: normaliseRecipients(message.bcc, "bcc"),
    subject,
    body,
    thread_id: message.thread_id ? assertHeaderSafe(clean(message.thread_id, 200), "thread_id") : null,
    in_reply_to: message.in_reply_to ? assertHeaderSafe(clean(message.in_reply_to, 400), "in_reply_to") : null,
    references: message.references ? assertHeaderSafe(clean(message.references, 2000), "references") : null,
  };
}

/* Stable identity of the exact message about to leave the platform. The
 * governed proposal carries this hash, never the body — the same discipline the
 * Bedrock path uses to keep prompts out of governance evidence. */
function messageHash(message) {
  const m = normaliseMessage(message);
  return hash({
    to: m.to, cc: m.cc, bcc: m.bcc, subject: m.subject,
    body: hash(m.body), thread_id: m.thread_id, in_reply_to: m.in_reply_to,
  });
}

function rfc822(message, mailbox) {
  const m = normaliseMessage(message);
  const from = assertHeaderSafe(clean(mailbox, 320), "mailbox");
  const headers = [
    `From: ${from}`,
    `To: ${m.to.join(", ")}`,
    ...(m.cc.length ? [`Cc: ${m.cc.join(", ")}`] : []),
    ...(m.bcc.length ? [`Bcc: ${m.bcc.join(", ")}`] : []),
    `Subject: ${m.subject}`,
    ...(m.in_reply_to ? [`In-Reply-To: ${m.in_reply_to}`, `References: ${m.references || m.in_reply_to}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${m.body}`, "utf8").toString("base64url");
}

function validateConfig(config = {}) {
  const mailbox = clean(config.mailbox, 320).trim().toLowerCase();
  if (!mailbox || !EMAIL.test(mailbox)) {
    throw new GmailConnectorError("GMAIL_MAILBOX_INVALID", "a valid Gmail mailbox address is required", { status: 400 });
  }
  const allowed = (Array.isArray(config.allowed_recipient_domains) ? config.allowed_recipient_domains : [])
    .map((item) => clean(item, 253).trim().toLowerCase()).filter(Boolean);
  return { mailbox, allowed_recipient_domains: allowed };
}

const OPERATIONS = ["send", "reply", "draft", "list", "read"];
const MAX_LIST = 100;

function normaliseCapabilities(value) {
  const requested = (Array.isArray(value) ? value : []).map((item) => clean(item, 20).trim().toLowerCase()).filter(Boolean);
  // Absent capabilities means "whatever the action catalog and Ω allow" — the
  // connector adds no restriction. A non-empty list NARROWS it, so a sandbox or
  // staging connector can be provisioned draft-only and be unable to deliver
  // even if an operator approves a send.
  if (!requested.length) return [...OPERATIONS];
  const unknown = requested.filter((item) => !OPERATIONS.includes(item));
  if (unknown.length) throw new GmailConnectorError("GMAIL_CAPABILITY_INVALID", `unsupported connector capabilities: ${unknown.join(", ")}`, { status: 400 });
  return OPERATIONS.filter((item) => requested.includes(item));
}

/** The OAuth scopes this connector's capabilities actually require. */
function requiredScopes(config = {}) {
  const capabilities = normaliseCapabilities(config.capabilities);
  const scopes = new Set();
  for (const capability of capabilities) scopes.add(SCOPES[capability]);
  return [...scopes];
}

/**
 * Validate a connector configuration + credential pair before anything is
 * stored. `allowAmbient` skips the credential requirement so an existing
 * connector's public configuration can be recomputed without its secret.
 */
function validateConfiguration(config = {}, secret = {}, { allowAmbient = false } = {}) {
  const base = validateConfig(config);
  const capabilities = normaliseCapabilities(config.capabilities);
  if (!allowAmbient) {
    for (const field of ["client_id", "client_secret", "refresh_token"]) {
      if (!clean(secret && secret[field], 2000).trim()) {
        throw new GmailConnectorError("GMAIL_CREDENTIALS_MISSING", `Gmail OAuth ${field} is required`, { status: 400 });
      }
    }
  }
  return { ...base, capabilities };
}

/* Projection stored on the connector row and returned by the Integration
 * Gateway. Whitelist-only: no OAuth client id, client secret or refresh token
 * may ever reach a connector row's `config`, which is public to operators. */
function publicConfiguration(config = {}) {
  const validated = validateConfiguration(config, {}, { allowAmbient: true });
  return {
    mailbox: validated.mailbox,
    allowed_recipient_domains: validated.allowed_recipient_domains,
    capabilities: validated.capabilities,
    required_scopes: requiredScopes(config),
    credential_validated_at: config.credential_validated_at || null,
    credential_rotated_at: config.credential_rotated_at || null,
    credential_revoked_at: config.credential_revoked_at || null,
    last_successful_request: config.last_successful_request || null,
  };
}

/** Connector-level capability gate, applied before a proposal is created. */
function assertCapability(config, operation) {
  const capabilities = normaliseCapabilities((config || {}).capabilities);
  if (!capabilities.includes(operation)) {
    throw new GmailConnectorError("GMAIL_CAPABILITY_NOT_ENABLED", `this connector is not configured to ${operation}`, { status: 403 });
  }
}

/** Revoke the stored refresh token at Google. Used on decommission/rotation. */
async function revokeCredentials(secret = {}, dependencies = {}) {
  const token = clean(secret.refresh_token, 2000);
  if (!token) return { revoked: false, reason: "no refresh token stored" };
  const response = await request(`${OAUTH_BASE()}/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  }, dependencies);
  // Google answers 200 for a successful revoke and 400 for an already-invalid
  // token; both mean the credential is dead, which is the outcome we need.
  if (!response.ok && response.status !== 400) throw await readError(response, "GMAIL_REVOKE_FAILED");
  return { revoked: true, already_invalid: response.status === 400 };
}

/* Connector-level recipient allowlist. Independent of Runtime Governance and
 * deliberately narrower: a permit authorises the action, this bounds where the
 * deployment will ever deliver. Empty list = no connector-level restriction. */
function assertRecipientsAllowed(config, message) {
  const allowed = validateConfig(config).allowed_recipient_domains;
  if (!allowed.length) return;
  const m = normaliseMessage(message);
  for (const address of [...m.to, ...m.cc, ...m.bcc]) {
    const domain = address.split("@").pop().toLowerCase();
    if (!allowed.includes(domain)) {
      throw new GmailConnectorError("GMAIL_RECIPIENT_NOT_ALLOWED", `recipient domain ${domain} is not permitted for this connector`, { status: 403 });
    }
  }
}

async function request(url, init = {}, dependencies = {}) {
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    const code = error && (error.name === "AbortError" ? "GMAIL_TIMEOUT" : error.code);
    if (code === "GMAIL_TIMEOUT") throw new GmailConnectorError("GMAIL_TIMEOUT", "Gmail request timed out", { status: 504, retryable: true });
    if (NETWORK_CODES.has(String(code))) throw new GmailConnectorError("GMAIL_NETWORK_ERROR", "Gmail endpoint unreachable", { status: 502, retryable: true });
    throw new GmailConnectorError("GMAIL_CONNECTION_FAILED", clean(error && error.message) || "Gmail request failed", { status: 502, retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

async function readError(response, fallbackCode) {
  const body = await response.json().catch(() => ({}));
  const detail = body && body.error;
  const message = clean((detail && (detail.message || detail.error_description)) || (typeof detail === "string" ? detail : "") || `HTTP ${response.status}`);
  const retryable = RETRYABLE_STATUS.has(response.status);
  const code = response.status === 401 || response.status === 403
    ? (/scope/i.test(message) ? "GMAIL_SCOPE_INSUFFICIENT" : "GMAIL_UNAUTHORIZED")
    : response.status === 429 ? "GMAIL_RATE_LIMITED"
      : response.status === 404 ? "GMAIL_NOT_FOUND"
        : response.status >= 500 ? "GMAIL_PROVIDER_UNAVAILABLE" : fallbackCode;
  return new GmailConnectorError(code, message, {
    status: response.status, retryable,
    gmail_request_id: response.headers && typeof response.headers.get === "function" ? response.headers.get("x-request-id") : null,
  });
}

/* Exchange the stored refresh token for a short-lived access token. Access
 * tokens are never persisted — the Integration Gateway credential model stores
 * the refresh token only, sealed with INTEGRATION_SECRET_KEY. */
async function accessToken(secret = {}, dependencies = {}) {
  const client_id = clean(secret.client_id, 400);
  const client_secret = clean(secret.client_secret, 400);
  const refresh_token = clean(secret.refresh_token, 2000);
  if (!client_id || !client_secret || !refresh_token) {
    throw new GmailConnectorError("GMAIL_CREDENTIALS_MISSING", "Gmail OAuth client and refresh token are required", { status: 400 });
  }
  const response = await request(`${OAUTH_BASE()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }).toString(),
  }, dependencies);
  if (!response.ok) throw await readError(response, "GMAIL_TOKEN_REFUSED");
  const body = await response.json().catch(() => ({}));
  const token = clean(body && body.access_token, 4000);
  if (!token) throw new GmailConnectorError("GMAIL_TOKEN_REFUSED", "Gmail did not return an access token", { status: 502 });
  return { token, scope: clean(body && body.scope, 2000) };
}

async function call(path, { method = "POST", body = null, secret, config, dependencies = {} }) {
  const { mailbox } = validateConfig(config);
  const { token } = await accessToken(secret, dependencies);
  const response = await request(`${API_BASE()}/users/${encodeURIComponent(mailbox)}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, dependencies);
  if (!response.ok) throw await readError(response, "GMAIL_REQUEST_FAILED");
  return response.json().catch(() => ({}));
}

/** Health/credential probe. Read-only: never sends anything. */
async function validateCredentials(config, secret, dependencies = {}) {
  const started = performance.now();
  const profile = await call("/profile", { method: "GET", secret, config, dependencies });
  return {
    ok: true,
    mailbox: clean(profile && profile.emailAddress, 320) || validateConfig(config).mailbox,
    messages_total: Number(profile && profile.messagesTotal) || null,
    provider_latency_ms: elapsed(started),
  };
}

function delivered(result, started, mode) {
  return {
    ok: true,
    mode,
    gmail_message_id: clean(result && result.id, 200) || null,
    gmail_thread_id: clean(result && result.threadId, 200) || null,
    gmail_draft_id: mode === "draft" ? clean(result && result.id, 200) || null : null,
    label_ids: Array.isArray(result && result.labelIds) ? result.labelIds.slice(0, 20) : [],
    provider_latency_ms: elapsed(started),
    attempts: 1,
  };
}

/** Send a new message. Called only after an executable Runtime Governance permit. */
async function send(config, secret, message, dependencies = {}) {
  assertRecipientsAllowed(config, message);
  const { mailbox } = validateConfig(config);
  const started = performance.now();
  const result = await call("/messages/send", {
    secret, config, dependencies,
    body: { raw: rfc822(message, mailbox) },
  });
  return delivered(result, started, "send");
}

/** Reply on an existing thread. Requires the thread the approval was bound to. */
async function reply(config, secret, message, dependencies = {}) {
  const m = normaliseMessage(message);
  if (!m.thread_id) throw new GmailConnectorError("GMAIL_THREAD_REQUIRED", "a thread id is required to reply", { status: 400 });
  assertRecipientsAllowed(config, message);
  const { mailbox } = validateConfig(config);
  const started = performance.now();
  const result = await call("/messages/send", {
    secret, config, dependencies,
    body: { raw: rfc822(message, mailbox), threadId: m.thread_id },
  });
  return delivered(result, started, "reply");
}

/** Create a draft. Nothing leaves the mailbox — no message is delivered. */
async function createDraft(config, secret, message, dependencies = {}) {
  assertRecipientsAllowed(config, message);
  const { mailbox } = validateConfig(config);
  const m = normaliseMessage(message);
  const started = performance.now();
  const result = await call("/drafts", {
    secret, config, dependencies,
    body: { message: { raw: rfc822(message, mailbox), ...(m.thread_id ? { threadId: m.thread_id } : {}) } },
  });
  const draft = result && result.message ? result.message : result;
  return { ...delivered(draft, started, "draft"), gmail_draft_id: clean(result && result.id, 200) || null };
}

/* ── Read operations ──────────────────────────────────────────────────────
 * Governed exactly like the write path: proposed, evaluated and permitted
 * before Google is reached. Message CONTENT is returned to the caller that
 * asked for it but never enters governance evidence — the same discipline that
 * keeps Bedrock prompts and completions out of the audit record. */

function normaliseQuery(request = {}) {
  const query = assertHeaderSafe(clean(request.query, 500).trim(), "query");
  const max = Number(request.max_results);
  return {
    query: query || "in:inbox newer_than:7d",
    max_results: Number.isFinite(max) && max > 0 ? Math.min(MAX_LIST, Math.trunc(max)) : 25,
    include_body: !!request.include_body,
  };
}

function normaliseMessageRef(request = {}) {
  const message_id = assertHeaderSafe(clean(request.message_id, 200).trim(), "message_id");
  if (!message_id) throw new GmailConnectorError("GMAIL_MESSAGE_ID_REQUIRED", "a Gmail message id is required", { status: 400 });
  return { message_id, include_body: !!request.include_body };
}

/** Stable identity of a read request, for the proposal and evidence. */
function requestHash(operation, request) {
  const normalised = operation === "read" ? normaliseMessageRef(request) : normaliseQuery(request);
  return hash({ operation, ...normalised });
}

function header(payload, name) {
  const headers = (payload && payload.headers) || [];
  const found = headers.find((item) => String(item.name || "").toLowerCase() === name);
  return found ? clean(found.value, 900) : null;
}

function summarise(message, { include_body = false } = {}) {
  const payload = message && message.payload;
  return {
    gmail_message_id: clean(message && message.id, 200) || null,
    gmail_thread_id: clean(message && message.threadId, 200) || null,
    label_ids: Array.isArray(message && message.labelIds) ? message.labelIds.slice(0, 20) : [],
    from: header(payload, "from"),
    to: header(payload, "to"),
    subject: header(payload, "subject"),
    date: header(payload, "date"),
    snippet: clean(message && message.snippet, 500) || null,
    size_estimate: Number(message && message.sizeEstimate) || null,
    ...(include_body ? { body: decodeBody(payload) } : {}),
  };
}

/* Gmail returns a MIME tree; take the first text/plain part, falling back to
 * the top-level body. Data minimisation: only read when explicitly requested. */
function decodeBody(payload) {
  if (!payload) return null;
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  const plain = parts.find((part) => String(part.mimeType || "") === "text/plain") || payload;
  const data = plain && plain.body && plain.body.data;
  if (!data) return null;
  try { return Buffer.from(String(data), "base64url").toString("utf8").slice(0, MAX_BODY); }
  catch { return null; }
}

/** List messages matching a Gmail search query. Read-only. */
async function listMessages(config, secret, request = {}, dependencies = {}) {
  const { query, max_results } = normaliseQuery(request);
  const started = performance.now();
  const search = new URLSearchParams({ q: query, maxResults: String(max_results) });
  const listed = await call(`/messages?${search.toString()}`, { method: "GET", secret, config, dependencies });
  const ids = (Array.isArray(listed && listed.messages) ? listed.messages : []).slice(0, max_results);
  // Metadata-only hydration: headers and snippet, never the body.
  const messages = [];
  for (const item of ids) {
    const detail = await call(`/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, {
      method: "GET", secret, config, dependencies,
    });
    messages.push(summarise(detail));
  }
  return {
    ok: true, mode: "list", operation: "list",
    messages, message_count: messages.length,
    result_estimate: Number(listed && listed.resultSizeEstimate) || messages.length,
    query, provider_latency_ms: elapsed(started), attempts: 1,
  };
}

/** Read one message by id. Read-only. */
async function readMessage(config, secret, request = {}, dependencies = {}) {
  const { message_id, include_body } = normaliseMessageRef(request);
  const started = performance.now();
  const detail = await call(`/messages/${encodeURIComponent(message_id)}?format=${include_body ? "full" : "metadata"}`, {
    method: "GET", secret, config, dependencies,
  });
  return {
    ok: true, mode: "read", operation: "read",
    message: summarise(detail, { include_body }),
    gmail_message_id: clean(detail && detail.id, 200) || message_id,
    gmail_thread_id: clean(detail && detail.threadId, 200) || null,
    provider_latency_ms: elapsed(started), attempts: 1,
  };
}

function mapError(error) {
  if (error instanceof GmailConnectorError) return error;
  const code = error && error.code;
  if (NETWORK_CODES.has(String(code))) return new GmailConnectorError("GMAIL_NETWORK_ERROR", "Gmail endpoint unreachable", { status: 502, retryable: true });
  return new GmailConnectorError("GMAIL_REQUEST_FAILED", clean(error && error.message) || "Gmail request failed", { status: 502 });
}

module.exports = {
  SCOPES, SEND_SCOPE, COMPOSE_SCOPE, READ_SCOPE, OPERATIONS, GmailConnectorError,
  hash, messageHash, requestHash, normaliseMessage, normaliseQuery, normaliseMessageRef,
  validateConfig, assertRecipientsAllowed,
  validateConfiguration, publicConfiguration, requiredScopes, normaliseCapabilities, assertCapability,
  rfc822, accessToken, validateCredentials, revokeCredentials,
  send, reply, createDraft, listMessages, readMessage, mapError, classifyCode,
};

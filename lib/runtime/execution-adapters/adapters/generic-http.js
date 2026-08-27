"use strict";

const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const { ExecutionAdapterError } = require("../errors");

const SAFE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const SENSITIVE_HEADER = /authorization|proxy-authorization|cookie|token|secret|api[-_]?key/i;
const FORBIDDEN_REQUEST_HEADER = /^(host|connection|transfer-encoding|upgrade|proxy-connection|te|trailer)$/i;

function privateAddress(address) {
  if (!net.isIP(address)) return true;
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = address.toLowerCase();
  return v === "::" || v === "::1" || v.startsWith("::ffff:") || v.startsWith("fc") || v.startsWith("fd")
    || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")
    || v.startsWith("ff") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.")
    || v.startsWith("::ffff:192.168.");
}

function target(config = {}, override = {}) {
  const endpoint = override.endpoint || config.endpoint;
  let url;
  try { url = new URL(String(endpoint || "")); }
  catch { throw new ExecutionAdapterError("valid target endpoint required", { code: "INVALID_HTTP_ENDPOINT" }); }
  if (url.protocol !== "https:" && !(config.allow_http === true && process.env.NODE_ENV !== "production")) {
    throw new ExecutionAdapterError("HTTPS is required (HTTP is development-only and must be explicit)", { code: "HTTPS_REQUIRED" });
  }
  if (url.username || url.password) throw new ExecutionAdapterError("URL credentials are not permitted", { code: "URL_CREDENTIALS_FORBIDDEN" });
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")
      || (net.isIP(hostname) && privateAddress(hostname))) {
    throw new ExecutionAdapterError("private, local and special-use network targets are denied", { code: "SSRF_TARGET_DENIED" });
  }
  const allowed = Array.isArray(config.allowed_hosts) ? config.allowed_hosts.map((x) => String(x).toLowerCase()) : [];
  if (!allowed.length || !allowed.includes(url.hostname.toLowerCase())) {
    throw new ExecutionAdapterError("target host is not in allowed_hosts", { code: "HOST_NOT_ALLOWED" });
  }
  return url;
}

async function resolvedPublicAddress(hostname) {
  if (privateAddress(hostname)) throw new ExecutionAdapterError("private, local and special-use network targets are denied", { code: "SSRF_TARGET_DENIED" });
  let rows;
  try { rows = await dns.lookup(hostname, { all: true, verbatim: true }); }
  catch (cause) { throw new ExecutionAdapterError("target DNS resolution failed", { code: "DNS_FAILED", cause }); }
  if (!rows.length || rows.some((row) => privateAddress(row.address))) {
    throw new ExecutionAdapterError("target resolves to a private, local or special-use address", { code: "SSRF_TARGET_DENIED" });
  }
  return rows[0];
}

function mappedBody(config, input) {
  if (!config.body_mapping || typeof config.body_mapping !== "object") {
    return input.action == null ? { trajectory: input.trajectory, context: input.context || {} } : input.action;
  }
  const sources = { action: input.action, trajectory: input.trajectory, context: input.context, correlation_id: input.correlation_id, decision_id: input.decision_id };
  return Object.fromEntries(Object.entries(config.body_mapping).map(([key, source]) => [key,
    typeof source === "string" && Object.hasOwn(sources, source) ? sources[source] : source]));
}

function safeHeaderSummary(headers) {
  return Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [key, SENSITIVE_HEADER.test(key) ? "[REDACTED]" : String(value).slice(0, 256)]));
}

function validateHeaders(headers = {}) {
  const invalid = Object.keys(headers).find((key) => FORBIDDEN_REQUEST_HEADER.test(key));
  if (invalid) throw new ExecutionAdapterError(`request header is controlled by the adapter: ${invalid}`, { code: "FORBIDDEN_REQUEST_HEADER" });
}

async function performHttpRequest(config = {}, input = {}, override = {}) {
  const url = target(config, override);
  const resolved = await resolvedPublicAddress(url.hostname);
  const method = String(override.method || config.method || "POST").toUpperCase();
  if (!SAFE_METHODS.has(method)) throw new ExecutionAdapterError("unsupported HTTP method", { code: "METHOD_NOT_ALLOWED" });
  const headers = { ...(config.headers || {}), ...(override.headers || {}) };
  validateHeaders(headers);
  headers["content-type"] ||= "application/json";
  headers["x-morrison-decision-id"] = input.decision_id;
  headers["x-correlation-id"] = input.correlation_id;
  if (input.request_id) headers["x-request-id"] = input.request_id;
  if (input.idempotency_key) headers["idempotency-key"] = input.idempotency_key;
  const bodyValue = Object.hasOwn(override, "body") ? override.body : mappedBody(config, input);
  const payload = method === "GET" || bodyValue == null ? null : (typeof bodyValue === "string" ? bodyValue : JSON.stringify(bodyValue));
  if (payload) headers["content-length"] = String(Buffer.byteLength(payload));
  const timeoutMs = Math.min(30000, Math.max(100, Number(override.timeout_ms || config.timeout_ms || 8000)));
  const captureBytes = Math.min(1024 * 1024, Math.max(0, Number(config.max_response_bytes || 65536)));
  const transport = url.protocol === "https:" ? https : http;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    let dispatched = false;
    const req = transport.request({
      protocol: url.protocol, hostname: url.hostname, port: url.port || undefined,
      path: `${url.pathname}${url.search}`, method, headers, servername: url.hostname,
      lookup: (_hostname, options, callback) => callback(null, resolved.address, resolved.family),
    }, (res) => {
      const chunks = []; let captured = 0; let truncated = false;
      res.on("data", (chunk) => {
        const buffer = Buffer.from(chunk);
        if (captured < captureBytes) {
          const slice = buffer.subarray(0, captureBytes - captured); chunks.push(slice); captured += slice.length;
          if (slice.length < buffer.length) truncated = true;
        } else truncated = true;
      });
      res.on("end", () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        executed: true,
        status: res.statusCode,
        response_body: Buffer.concat(chunks).toString("utf8"), response_truncated: truncated,
        response_headers: { "content-type": res.headers["content-type"] || null, "content-length": res.headers["content-length"] || null },
        receipt: {
          transport: "http", request_id: input.request_id || null, correlation_id: input.correlation_id,
          decision_id: input.decision_id, method, host: url.hostname, path: url.pathname,
          request_headers: safeHeaderSummary(headers), response_status: res.statusCode,
          latency_ms: Date.now() - started, response_truncated: truncated,
        },
      }));
    });
    req.on("socket", () => { dispatched = true; });
    req.on("error", (cause) => reject(new ExecutionAdapterError("HTTP execution failed", {
      code: cause && cause.code || "HTTP_EXECUTION_FAILED", status: 502, executionMayHaveOccurred: dispatched, cause,
    })));
    req.setTimeout(timeoutMs, () => req.destroy(new ExecutionAdapterError("HTTP execution timed out", {
      code: "ADAPTER_TIMEOUT", status: 504, executionMayHaveOccurred: dispatched,
    })));
    if (payload) req.write(payload);
    req.end();
  });
}

const adapter = {
  id: "generic-http", name: "Generic HTTP", version: "1.0.0",
  capabilities: { pre_execution_hook: true, state_write: true, execution_receipts: true, idempotency: true, http: true },
  validateConfiguration(config = {}) {
    try { target(config); validateHeaders(config.headers); return { ok: true, errors: [] }; }
    catch (error) { return { ok: false, errors: [error.message] }; }
  },
  async health({ config }) {
    const valid = this.validateConfiguration(config); return { ok: valid.ok, status: valid.ok ? "configured" : "invalid", errors: valid.errors };
  },
  async execute(input) { return performHttpRequest(input.config, input); },
  normalizeResult(result) { return result; },
};

module.exports = { adapter, performHttpRequest, privateAddress, safeHeaderSummary, validateHeaders };

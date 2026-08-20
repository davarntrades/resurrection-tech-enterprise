/* ============================================================================
 * Runtime Governance — engine client.
 * ============================================================================ */
"use strict";
const http = require("node:http");
const https = require("node:https");
const { authorize } = require("./sovereign/outbound-policy");
const { deploymentPolicy } = require("./sovereign/deployment");
const { safeError } = require("./sovereign/redaction");

const DEPLOYMENT = deploymentPolicy(process.env);
const HOSTED_DEFAULT = "https://resurrection-tech-enterprise-production.up.railway.app";
const ENGINE_URL_SOURCE = process.env.GOVERNANCE_URL
  ? "environment"
  : DEPLOYMENT.sovereign ? "required_unset" : "hosted_default";
const ENGINE_URL = (process.env.GOVERNANCE_URL || (DEPLOYMENT.sovereign ? "" : HOSTED_DEFAULT)).replace(/\/$/, "");
const ENGINE_TOKEN = process.env.GOVERNANCE_TOKEN || "";
// Gateway identity. The engine honours x-governance-principal/-tenant ONLY when
// the request also carries this shared secret; without it the engine treats the
// caller as anonymous (holding no capability grants), which is fail-closed.
const GATEWAY_SECRET = process.env.GOVERNANCE_GATEWAY_SECRET || "";
const TIMEOUT_MS = Number(process.env.GOVERNANCE_TIMEOUT_MS || 8000);

function localHttpAllowed(url) {
  try {
    const parsed = new URL(url);
    return !DEPLOYMENT.sovereign && parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  } catch { return false; }
}

function outboundPolicy(url) {
  const configured = String(process.env.GUARDIANOS_OUTBOUND_POLICY || "approved_endpoints_only");
  const approved = String(process.env.GUARDIANOS_APPROVED_ENDPOINTS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!DEPLOYMENT.sovereign && url) approved.push(url);
  return { mode: configured, approved_endpoints: [...new Set(approved)], allow_http: localHttpAllowed(url) };
}

function httpFailureCode(status) {
  const code = Number(status || 0);
  if (code === 401 || code === 403) return "GOVERNANCE_AUTH_FAILURE";
  if (code === 404 || code === 405) return "GOVERNANCE_ENDPOINT_MISMATCH";
  if (code >= 500) return "GOVERNANCE_SERVICE_UNAVAILABLE";
  return "GOVERNANCE_HTTP_FAILURE";
}

function transportFailureCode(error) {
  const code = String(error && error.code || "").toUpperCase();
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "GOVERNANCE_DNS_FAILURE";
  if (["ECONNREFUSED", "ECONNRESET", "EPIPE"].includes(code)) return "GOVERNANCE_CONNECTION_FAILURE";
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code)) return "GOVERNANCE_TIMEOUT";
  if (["CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code)) return "GOVERNANCE_TLS_FAILURE";
  return "GOVERNANCE_NETWORK_FAILURE";
}

function configuration() {
  let endpoint_host = null;
  try { endpoint_host = ENGINE_URL ? new URL(ENGINE_URL).hostname : null; } catch {}
  return {
    configured: !!ENGINE_URL,
    endpoint_source: ENGINE_URL_SOURCE,
    endpoint_host,
    timeout_ms: TIMEOUT_MS,
    bearer_token_configured: !!ENGINE_TOKEN,
    gateway_secret_configured: !!GATEWAY_SECRET,
    sovereign: !!DEPLOYMENT.sovereign,
  };
}

async function request(method, pathname, body, dependencies = {}, identity = null) {
  if (!ENGINE_URL) return { ok: false, code: "GOVERNANCE_CONFIG_MISSING", error: "GOVERNANCE_URL is required in sovereign mode; no hosted control plane fallback is used" };
  let u;
  try { u = new URL(ENGINE_URL + pathname); }
  catch { return { ok: false, code: "GOVERNANCE_CONFIG_INVALID", error: "bad GOVERNANCE_URL" }; }
  const allowHttp = localHttpAllowed(ENGINE_URL);
  try {
    await authorize(dependencies.outboundPolicy || outboundPolicy(ENGINE_URL), {
      url: u.toString(), purpose: "runtime_governance", allow_http: allowHttp, metadata: { method, pathname },
    }, dependencies.outboundGovernance || null);
  } catch (error) {
    return { ok: false, code: error.code || "GOVERNANCE_EGRESS_DENIED", error: safeError(error, "governance egress denied").message };
  }
  return new Promise((resolve) => {
    const agent = dependencies.transport || (u.protocol === "https:" ? https : http);
    const payload = body ? JSON.stringify(body) : null;
    let req;
    try {
      req = agent.request({
        hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), path: u.pathname + u.search, method,
        headers: {
          "content-type": "application/json",
          ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
          ...(ENGINE_TOKEN ? { authorization: `Bearer ${ENGINE_TOKEN}` } : {}),
          ...(identity && identity.principal ? { "x-governance-principal": String(identity.principal) } : {}),
          ...(identity && identity.tenant ? { "x-governance-tenant": String(identity.tenant) } : {}),
          ...(GATEWAY_SECRET ? { "x-governance-gateway-auth": GATEWAY_SECRET } : {}),
        },
      }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          let json = null; try { json = JSON.parse(text); } catch {}
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          resolve({
            ok,
            status: res.statusCode,
            ...(ok ? {} : { code: httpFailureCode(res.statusCode), error: `engine HTTP ${res.statusCode}` }),
            json,
            text,
          });
        });
      });
    } catch (error) {
      return resolve({ ok: false, code: transportFailureCode(error), error: safeError(error, "engine request failed").message });
    }
    req.on("error", (error) => resolve({ ok: false, code: transportFailureCode(error), error: safeError(error, "engine request failed").message }));
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve({ ok: false, code: "GOVERNANCE_TIMEOUT", error: "engine timeout" }); });
    if (payload) req.write(payload);
    req.end();
  });
}

const health = (dependencies) => request("GET", "/health", null, dependencies);
// GOVERN — the enforcing chokepoint. This is the ONLY evaluation entry point
// the Control Room may use.
//
// It previously called /v1/evaluate, which returns the raw engine verdict with
// NO trust boundary: no authority quarantine, no capability policy, no trusted
// destination resolution, no tenancy check, no unknown-tool gate, no evidence
// chain. Measured consequence: `drop_database` with a caller-supplied
// `authorized: true`, and PII egress with a caller-supplied
// `destination_internal: true`, both returned ALLOW through the Control Room
// while the kernel blocked them everywhere else.
//
// `identity` is the authenticated org/environment, forwarded as gateway headers
// so the engine can bind the decision to a real principal and tenant.
const govern = (trajectory, domains, horizon, dependencies, identity) =>
  request("POST", "/v1/govern",
          { trajectory, ...(domains ? { domains } : {}), ...(horizon ? { horizon } : {}) },
          dependencies, identity);

// Retained for diagnostics ONLY (advisory verdict, no trust boundary). Never
// use it on an execution path — see `govern`.
const evaluate = (trajectory, domains, horizon, dependencies) => request("POST", "/v1/evaluate", { trajectory, ...(domains ? { domains } : {}), ...(horizon ? { horizon } : {}) }, dependencies);
const assess = (manifest, domains, dependencies) => request("POST", "/v1/assess", { manifest, ...(domains ? { domains } : {}) }, dependencies);

module.exports = {
  ENGINE_URL, ENGINE_URL_SOURCE, health, govern, evaluate, assess, request,
  outboundPolicy, localHttpAllowed, GATEWAY_SECRET, configuration,
  httpFailureCode, transportFailureCode,
};
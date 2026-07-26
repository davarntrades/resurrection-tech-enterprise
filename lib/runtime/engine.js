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
const ENGINE_URL = (process.env.GOVERNANCE_URL || (DEPLOYMENT.sovereign ? "" : HOSTED_DEFAULT)).replace(/\/$/, "");
const ENGINE_TOKEN = process.env.GOVERNANCE_TOKEN || "";
const TIMEOUT_MS = Number(process.env.GOVERNANCE_TIMEOUT_MS || 8000);

function outboundPolicy(url) {
  const configured = String(process.env.GUARDIANOS_OUTBOUND_POLICY || "approved_endpoints_only");
  const approved = String(process.env.GUARDIANOS_APPROVED_ENDPOINTS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!DEPLOYMENT.sovereign && url) approved.push(url);
  return { mode: configured, approved_endpoints: [...new Set(approved)] };
}

async function request(method, pathname, body, dependencies = {}) {
  if (!ENGINE_URL) return { ok: false, error: "GOVERNANCE_URL is required in sovereign mode; no hosted control plane fallback is used" };
  let u; try { u = new URL(ENGINE_URL + pathname); } catch { return { ok: false, error: "bad GOVERNANCE_URL" }; }
  try {
    await authorize(dependencies.outboundPolicy || outboundPolicy(ENGINE_URL), {
      url: u.toString(), purpose: "runtime_governance", metadata: { method, pathname },
    }, dependencies.outboundGovernance || null);
  } catch (error) {
    return { ok: false, error: safeError(error, "governance egress denied").message, code: error.code || "OUTBOUND_DENIED" };
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
        },
      }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          let json = null; try { json = JSON.parse(text); } catch {}
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json, text });
        });
      });
    } catch (error) { return resolve({ ok: false, error: safeError(error, "engine request failed").message }); }
    req.on("error", (error) => resolve({ ok: false, error: safeError(error, "engine request failed").message }));
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve({ ok: false, error: "engine timeout" }); });
    if (payload) req.write(payload);
    req.end();
  });
}

const health = (dependencies) => request("GET", "/health", null, dependencies);
const evaluate = (trajectory, domains, horizon, dependencies) => request("POST", "/v1/evaluate", { trajectory, ...(domains ? { domains } : {}), ...(horizon ? { horizon } : {}) }, dependencies);
const assess = (manifest, domains, dependencies) => request("POST", "/v1/assess", { manifest, ...(domains ? { domains } : {}) }, dependencies);

module.exports = { ENGINE_URL, health, evaluate, assess, request, outboundPolicy };

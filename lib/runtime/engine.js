/* ============================================================================
 * Runtime Governance — engine client.
 *
 * Thin zero-dependency client for the EXISTING Morrison governance service
 * (/v1/evaluate, /v1/assess, /health). The gateway calls this; the engine is
 * never modified. Fails soft: on any transport error it returns a structured
 * { ok:false } so the gateway can record an ENGINE_UNAVAILABLE decision rather
 * than crash a customer's request path.
 * ============================================================================ */
"use strict";
const http = require("node:http");
const https = require("node:https");

const ENGINE_URL = (process.env.GOVERNANCE_URL || "https://resurrection-tech-enterprise-production.up.railway.app").replace(/\/$/, "");
const ENGINE_TOKEN = process.env.GOVERNANCE_TOKEN || "";
const TIMEOUT_MS = Number(process.env.GOVERNANCE_TIMEOUT_MS || 8000);

function request(method, pathname, body) {
  return new Promise((resolve) => {
    let u; try { u = new URL(ENGINE_URL + pathname); } catch { return resolve({ ok: false, error: "bad GOVERNANCE_URL" }); }
    const agent = u.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = agent.request({
      hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), path: u.pathname, method,
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
        let json = null; try { json = JSON.parse(text); } catch { /* non-json */ }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json, text });
      });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve({ ok: false, error: "engine timeout" }); });
    if (payload) req.write(payload);
    req.end();
  });
}

const health = () => request("GET", "/health");
const evaluate = (trajectory, domains, horizon) =>
  request("POST", "/v1/evaluate", { trajectory, ...(domains ? { domains } : {}), ...(horizon ? { horizon } : {}) });
const assess = (manifest, domains) => request("POST", "/v1/assess", { manifest, ...(domains ? { domains } : {}) });

module.exports = { ENGINE_URL, health, evaluate, assess, request };

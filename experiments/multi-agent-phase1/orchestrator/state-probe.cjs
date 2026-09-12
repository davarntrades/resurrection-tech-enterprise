/* ============================================================================
 * Phase-1 environment state probe.
 *
 * Reads the synthetic environment's state directly, as the ORCHESTRATOR rather
 * than through the execution boundary. Kept separate from the adapter's
 * pre/post-state observation on purpose: the adapter's reading is Morrison
 * evidence, this one is not, and the analyser compares them.
 * ============================================================================ */
"use strict";

const http = require("node:http");
const https = require("node:https");

function get(urlString, token, timeoutMs = 10000) {
  const url = new URL(urlString);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: url.protocol, hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname, method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try { resolve({ status: res.statusCode, json: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, json: null, text }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("state probe timed out")));
    req.end();
  });
}

/** Current state, or a typed failure. Never throws: a failed probe must not be
 *  indistinguishable from a probe that observed a healthy environment. */
async function probe(baseUrl, token) {
  try {
    const { status, json } = await get(new URL("/v1/state", baseUrl).toString(), token);
    if (status !== 200 || !json) return { observed: false, status, error: "state unavailable" };
    return { observed: true, ...json };
  } catch (error) {
    return { observed: false, error: String(error.message || error) };
  }
}

/** The environment's own append-only log — the independent comparison source. */
async function fetchLog(baseUrl, token) {
  try {
    const { status, json } = await get(new URL("/v1/log", baseUrl).toString(), token);
    if (status !== 200 || !json) return { observed: false, status, entries: [] };
    return { observed: true, count: json.count, entries: json.entries || [] };
  } catch (error) {
    return { observed: false, error: String(error.message || error), entries: [] };
  }
}

module.exports = { probe, fetchLog };

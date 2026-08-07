#!/usr/bin/env node
"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const PORT = Number(process.env.MOCK_GOVERNANCE_PORT || 18791);
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function evaluate(body = {}) {
  const trajectory = Array.isArray(body.trajectory) ? body.trajectory : [];
  const tools = trajectory.map((step) => String(step && step.tool || ""));
  const domains = Array.isArray(body.domains) ? body.domains : [];
  let verdict = "ALLOW";
  let omega_domain = domains[0] || "general";
  let rule = "safe_default";
  let reason = "trajectory is admissible";
  if (tools.includes("transfer_funds") || tools.includes("wire_transfer")) {
    verdict = "BLOCK"; omega_domain = "finance"; rule = "finance.catastrophic_transfer"; reason = "catastrophic transfer path blocked";
  } else if (tools.includes("recommend_transfer")) {
    verdict = "ESCALATE"; omega_domain = "finance"; rule = "finance.human_review"; reason = "recommendation requires human review";
  }
  return {
    verdict, omega_domain, reason,
    metadata: { rule },
    trajectory_hash: hash(trajectory),
    engine_compute_ms: 0.25,
    requires_human_review: verdict === "ESCALATE",
    review: verdict === "ESCALATE" ? { required: true } : null,
    attestation: { engine_commit: "hermetic-ci", ruleset_hash: "hermetic-rules-v1", service_version: "ci-fixture-1" },
  };
}

// /v1/govern — the ENFORCING endpoint the Control Room now calls. Mirrors the
// real service's response: GovernanceResult-compatible fields at the top level
// (so the existing adapters need no change) plus per-step `decisions`, the
// evidence summary and the resolved identity.
//
// The real endpoint honours x-governance-principal/-tenant only alongside the
// gateway shared secret; this fixture reports which it saw so a client that
// stops sending them fails visibly here rather than silently degrading to an
// anonymous principal in production.
function govern(body = {}, headers = {}) {
  const base = evaluate(body);
  const verdict = { ALLOW: "PERMIT", BLOCK: "BLOCK", ESCALATE: "ESCALATE" }[base.verdict] || base.verdict;
  const gatewayOk = Boolean(headers["x-governance-gateway-auth"]);
  const principal = gatewayOk ? (headers["x-governance-principal"] || "anonymous") : "anonymous";
  const tenant = gatewayOk ? (headers["x-governance-tenant"] || "") : "";
  const decision = {
    verdict,
    layer: verdict === "PERMIT" ? "V4" : "A_safe",
    reason: base.reason,
    rule: base.metadata.rule,
    omega_domain: base.omega_domain,
    action_hash: base.trajectory_hash,
    capabilities: [],
    requirement: verdict === "PERMIT" ? "allow" : "approval",
    authorization: { approved: false, principal, tenant },
    forged_authority_claims: [],
    destination: {},
  };
  return {
    ...base,
    verdict,
    permitted: verdict === "PERMIT",
    blocked: verdict === "BLOCK",
    escalated: verdict === "ESCALATE",
    layer: decision.layer,
    decisions: [decision],
    evidence: { verified: true, records: 1, head: base.trajectory_hash.slice(0, 16), problems: [] },
    identity: {
      principal, tenant,
      source: gatewayOk ? "gateway_verified" : "rejected_untrusted_header",
      gateway_auth_configured: true,
    },
    enforcement: "kernel",
  };
}

const ROUTES = ["/v1/evaluate", "/v1/govern", "/v1/assess"];

const server = http.createServer((req, res) => {
  const send = (status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true, engine_commit: "hermetic-ci", live_sectors: ["finance"] });
  if (req.method !== "POST" || !ROUTES.includes(req.url)) return send(404, { error: "not found" });
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
    if (req.url === "/v1/govern") return send(200, govern(body, req.headers));
    return send(200, req.url === "/v1/evaluate" ? evaluate(body) : { ok: true, verdict: "ALLOW" });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`Hermetic governance engine listening on ${PORT}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));

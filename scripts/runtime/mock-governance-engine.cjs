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

const server = http.createServer((req, res) => {
  const send = (status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true, engine_commit: "hermetic-ci", live_sectors: ["finance"] });
  if (req.method !== "POST" || !["/v1/evaluate", "/v1/assess"].includes(req.url)) return send(404, { error: "not found" });
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
    return send(200, req.url === "/v1/evaluate" ? evaluate(body) : { ok: true, verdict: "ALLOW" });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`Hermetic governance engine listening on ${PORT}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));

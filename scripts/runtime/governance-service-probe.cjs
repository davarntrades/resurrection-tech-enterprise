"use strict";

const fs = require("node:fs");
const engine = require("../../lib/runtime/engine");

(async () => {
  const started = Date.now();
  const configuration = engine.configuration();
  const result = await engine.health();
  const report = {
    generated_at: new Date().toISOString(),
    probe_scope: "ci_runner_to_governance_service",
    authoritative_for_application_env: false,
    endpoint_source: configuration.endpoint_source,
    endpoint_host: configuration.endpoint_host,
    bearer_token_configured: configuration.bearer_token_configured,
    gateway_secret_configured: configuration.gateway_secret_configured,
    timeout_ms: configuration.timeout_ms,
    reachable: result.ok === true,
    http_status: result.status || null,
    diagnostic_code: result.ok === true ? "GOVERNANCE_HEALTHY" : result.code || "GOVERNANCE_UNAVAILABLE",
    error: result.ok === true ? null : result.error || null,
    latency_ms: Date.now() - started,
    result: result.ok === true ? "passed" : "failed",
    note: "This proves CI-runner reachability only. The production application boundary remains authoritative and is validated by the governed production smoke.",
  };

  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/governance-service-probe.json", `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(
    "artifacts/governance-service-probe.md",
    [
      "## Runtime Governance service probe",
      "",
      `**Result:** ${report.result.toUpperCase()}`,
      `**Diagnostic class:** ${report.diagnostic_code}`,
      `**Endpoint source:** ${report.endpoint_source}`,
      `**Endpoint host:** ${report.endpoint_host || "not configured"}`,
      `**HTTP status:** ${report.http_status ?? "not reached"}`,
      `**Latency (ms):** ${report.latency_ms}`,
      `**Error:** ${report.error || "none"}`,
      "",
      report.note,
      "",
    ].join("\n"),
  );

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!result.ok) process.exit(1);
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

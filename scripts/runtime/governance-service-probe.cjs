"use strict";

const fs = require("node:fs");
const engine = require("../../lib/runtime/engine");

(async () => {
  const started = Date.now();
  const configuration = engine.configuration();
  const health = await engine.health();
  const evaluation = health.ok
    ? await engine.evaluate([{ tool: "read_logs", args: { diagnostic_probe: true } }], ["enterprise"], 1)
    : { ok: false, code: "HEALTH_PREREQUISITE_FAILED", error: "health probe failed; evaluation probe not attempted" };

  const healthOk = health.ok === true;
  const evaluationOk = evaluation.ok === true && !!evaluation.json;
  const report = {
    generated_at: new Date().toISOString(),
    probe_scope: "ci_runner_to_governance_service",
    authoritative_for_application_env: false,
    endpoint_source: configuration.endpoint_source,
    endpoint_host: configuration.endpoint_host,
    bearer_token_configured: configuration.bearer_token_configured,
    gateway_secret_configured: configuration.gateway_secret_configured,
    timeout_ms: configuration.timeout_ms,
    health: {
      reachable: healthOk,
      http_status: health.status || null,
      diagnostic_code: healthOk ? "GOVERNANCE_HEALTHY" : health.code || "GOVERNANCE_UNAVAILABLE",
      error: healthOk ? null : health.error || null,
    },
    advisory_evaluation: {
      reachable: evaluationOk,
      http_status: evaluation.status || null,
      diagnostic_code: evaluationOk ? "GOVERNANCE_EVALUATE_REACHABLE" : evaluation.code || "GOVERNANCE_EVALUATE_UNAVAILABLE",
      verdict: evaluationOk ? evaluation.json.verdict || null : null,
      error: evaluationOk ? null : evaluation.error || null,
    },
    latency_ms: Date.now() - started,
    result: healthOk && evaluationOk ? "passed" : "failed",
    note: "This proves CI-runner reachability of /health and the advisory /v1/evaluate path only. The production application boundary remains authoritative and is validated by the governed production smoke.",
  };

  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/governance-service-probe.json", `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(
    "artifacts/governance-service-probe.md",
    [
      "## Runtime Governance service probe",
      "",
      `**Result:** ${report.result.toUpperCase()}`,
      `**Endpoint source:** ${report.endpoint_source}`,
      `**Endpoint host:** ${report.endpoint_host || "not configured"}`,
      `**Health:** ${report.health.diagnostic_code} (HTTP ${report.health.http_status ?? "not reached"})`,
      `**Advisory /v1/evaluate:** ${report.advisory_evaluation.diagnostic_code} (HTTP ${report.advisory_evaluation.http_status ?? "not reached"})`,
      `**Advisory verdict:** ${report.advisory_evaluation.verdict || "not returned"}`,
      `**Bearer token configured in this probe:** ${report.bearer_token_configured}`,
      `**Latency (ms):** ${report.latency_ms}`,
      `**Error:** ${report.advisory_evaluation.error || report.health.error || "none"}`,
      "",
      report.note,
      "",
    ].join("\n"),
  );

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.result !== "passed") process.exit(1);
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

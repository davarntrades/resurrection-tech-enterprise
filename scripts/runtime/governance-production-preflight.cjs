"use strict";

const fs = require("node:fs");

for (const name of ["E2E_BASE_URL", "RUNTIME_ADMIN_KEY"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const baseUrl = String(process.env.E2E_BASE_URL).replace(/\/$/, "");
const adminKey = process.env.RUNTIME_ADMIN_KEY;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

function headers() {
  const out = { "x-admin-key": adminKey };
  if (bypass) out["x-vercel-protection-bypass"] = bypass;
  return out;
}

(async () => {
  const started = Date.now();
  let response;
  let body = {};
  try {
    response = await fetch(`${baseUrl}/api/runtime/admin/governance-health`, {
      method: "GET",
      headers: headers(),
      signal: AbortSignal.timeout(Number(process.env.GOVERNANCE_PREFLIGHT_TIMEOUT_MS || 15000)),
    });
    body = await response.json().catch(() => ({}));
  } catch (error) {
    body = {
      ok: false,
      checked_at: new Date().toISOString(),
      latency_ms: Date.now() - started,
      engine: {
        reachable: false,
        code: error && error.name === "TimeoutError" ? "APPLICATION_TO_GOVERNANCE_PREFLIGHT_TIMEOUT" : "APPLICATION_PREFLIGHT_REQUEST_FAILURE",
        error: error && error.message || String(error),
      },
    };
  }

  const report = {
    generated_at: new Date().toISOString(),
    application_reachable: !!response,
    application_http_status: response?.status || null,
    governance_reachable: body.ok === true && body.engine?.reachable === true,
    diagnostic_code: body.ok === true ? "GOVERNANCE_HEALTHY" : body.engine?.code || "GOVERNANCE_UNAVAILABLE",
    endpoint_source: body.configuration?.endpoint_source || null,
    endpoint_host: body.configuration?.endpoint_host || null,
    bearer_token_configured: body.configuration?.bearer_token_configured ?? null,
    gateway_secret_configured: body.configuration?.gateway_secret_configured ?? null,
    sovereign: body.configuration?.sovereign ?? null,
    engine_http_status: body.engine?.status || null,
    engine_service_version: body.engine?.service_version || null,
    engine_ruleset_hash: body.engine?.ruleset_hash || null,
    latency_ms: body.latency_ms ?? Date.now() - started,
    error: body.engine?.error || null,
    result: body.ok === true && body.engine?.reachable === true ? "passed" : "failed",
  };

  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/governance-production-preflight.json", `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(
    "artifacts/governance-production-preflight.md",
    [
      "## Runtime Governance production preflight",
      "",
      `**Result:** ${report.result.toUpperCase()}`,
      `**Diagnostic class:** ${report.diagnostic_code}`,
      `**Endpoint source:** ${report.endpoint_source || "not reported"}`,
      `**Endpoint host:** ${report.endpoint_host || "not reported"}`,
      `**Engine HTTP status:** ${report.engine_http_status ?? "not reached"}`,
      `**Bearer token configured:** ${report.bearer_token_configured ?? "unknown"}`,
      `**Gateway secret configured:** ${report.gateway_secret_configured ?? "unknown"}`,
      `**Latency (ms):** ${report.latency_ms}`,
      `**Error:** ${report.error || "none"}`,
      "",
      "This preflight is diagnostic only. An unhealthy governance engine remains a failed production gate and does not permit provider execution.",
      "",
    ].join("\n"),
  );

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.result !== "passed") process.exit(1);
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

/* ============================================================================
 * Phase-1 preflight — the configuration gate.
 *
 * Runs before any transition is proposed. If a required check fails the
 * orchestrator refuses to start, because a result produced under unknown
 * configuration is not a result.
 *
 * The honesty rule applied throughout: a check reports what it OBSERVED, and a
 * value that cannot be observed is reported as `unobservable`, never inferred
 * from an operator's assertion and never silently passed. Two required settings
 * are genuinely not exposed by any endpoint:
 *
 *   RUNTIME_REQUIRE_RECORD    not surfaced. Verified only by its EFFECT — every
 *                             decision must come back recorded:true, which the
 *                             orchestrator asserts on every transition and the
 *                             analyser re-checks against the evidence tables.
 *   GOVERNANCE_GATEWAY_SECRET not surfaced by /api/runtime/health, but every
 *                             /v1/govern response carries
 *                             identity.gateway_auth_configured, so it is
 *                             confirmed from the first real decision rather than
 *                             taken on trust.
 * ============================================================================ */
"use strict";

const http = require("node:http");
const https = require("node:https");

const PASS = "PASS", FAIL = "FAIL", WARN = "WARN", UNOBSERVABLE = "UNOBSERVABLE";

function getJson(urlString, headers = {}, timeoutMs = 15000) {
  const url = new URL(urlString);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: url.protocol, hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search, method: "GET", headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* reported as unparseable */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("preflight request timed out")));
    req.end();
  });
}

async function preflight(config) {
  const checks = [];
  const add = (name, status, detail, required = true) => checks.push({ name, status, detail, required });

  // ── 1. Synthetic environment reachable, and authenticated ──────────────────
  try {
    const unauth = await getJson(new URL("/v1/health", config.envBaseUrl).toString());
    add("Environment refuses unauthenticated access",
      unauth.status === 401 ? PASS : FAIL,
      `GET /v1/health without a token returned HTTP ${unauth.status} (expected 401)`);
  } catch (error) {
    add("Environment refuses unauthenticated access", FAIL, `unreachable: ${error.message}`);
  }

  try {
    const authed = await getJson(new URL("/v1/health", config.envBaseUrl).toString(),
      { authorization: `Bearer ${config.envToken}` });
    const state = authed.json && authed.json.state;
    add("Environment reachable with the orchestrator credential",
      authed.status === 200 ? PASS : FAIL,
      `HTTP ${authed.status}${state ? ` · budget_remaining=${state.budget_remaining}` : ""}`);
    add("Environment starts outside Ω_test",
      state && state.omega_test_violated === false ? PASS : FAIL,
      state ? `omega_test_violated=${state.omega_test_violated}` : "state not returned");
  } catch (error) {
    add("Environment reachable with the orchestrator credential", FAIL, `unreachable: ${error.message}`);
  }

  // ── 2. Agent isolation ─────────────────────────────────────────────────────
  const { inspectChildEnv } = require("../agents/sandbox.cjs");
  const FORBIDDEN = [
    "RTX_ENV_TOKEN", "RTX_ENV_URL", "RT_INGEST_KEY", "RT_PLATFORM_URL", "RT_ADMIN_KEY",
    "SUPABASE_SERVICE_ROLE_KEY", "GOVERNANCE_TOKEN", "GOVERNANCE_GATEWAY_SECRET",
  ];
  for (const planner of ["deterministic", "claude"]) {
    const env = inspectChildEnv(planner);
    const leaked = FORBIDDEN.filter((name) => env[name] !== undefined);
    add(`Agent sandbox holds no privileged credential (${planner} planner)`,
      leaked.length === 0 ? PASS : FAIL,
      leaked.length ? `LEAKED: ${leaked.join(", ")}` : `agent env limited to: ${Object.keys(env).sort().join(", ")}`);
  }

  // ── 3. Platform configuration (http transport only) ────────────────────────
  if (config.transport === "http") {
    try {
      const health = await getJson(`${String(config.platformUrl).replace(/\/$/, "")}/api/runtime/health`);
      const body = health.json || {};
      add("Engine reachable", body.engine && body.engine.reachable ? PASS : FAIL,
        body.engine ? `${body.engine.url} reachable=${body.engine.reachable} commit=${body.engine.engine_commit || "unknown"}` : "health payload missing engine block");
      add("Durable evidence backend (Supabase)",
        body.store && body.store.durable === true && body.store.backend === "supabase" ? PASS : FAIL,
        body.store ? `backend=${body.store.backend} durable=${body.store.durable}` : "health payload missing store block");
      add("RUNTIME_REQUIRE_DURABLE=1", body.require_durable === true ? PASS : FAIL,
        `require_durable=${body.require_durable}`);
      add("Rate limiting deliberately configured",
        body.observability && body.observability.rate_limiting === true ? PASS : FAIL,
        body.observability ? `rate_limiting=${body.observability.rate_limiting} — must be explicitly ON, not implicitly disabled` : "observability block missing");
    } catch (error) {
      add("Platform health reachable", FAIL, `unreachable: ${error.message}`);
    }
  } else {
    const rt = require(config.runtimeModulePath || "../../../lib/runtime");
    add("Durable evidence backend (Supabase)", rt.store.durable() ? PASS : FAIL, `backend=${rt.store.backend()}`);
    add("RUNTIME_REQUIRE_DURABLE=1", /^(1|true|yes)$/i.test(String(process.env.RUNTIME_REQUIRE_DURABLE || "")) ? PASS : FAIL,
      `RUNTIME_REQUIRE_DURABLE=${process.env.RUNTIME_REQUIRE_DURABLE || "unset"}`);
    add("RUNTIME_REQUIRE_RECORD=1", /^(1|true|yes)$/i.test(String(process.env.RUNTIME_REQUIRE_RECORD || "")) ? PASS : FAIL,
      `RUNTIME_REQUIRE_RECORD=${process.env.RUNTIME_REQUIRE_RECORD || "unset"}`);
    add("Rate limiting deliberately configured", Number(process.env.RUNTIME_RATE_LIMIT || 0) > 0 ? PASS : FAIL,
      `RUNTIME_RATE_LIMIT=${process.env.RUNTIME_RATE_LIMIT || "unset"}`);
    add("GOVERNANCE_GATEWAY_SECRET configured", process.env.GOVERNANCE_GATEWAY_SECRET ? PASS : FAIL,
      process.env.GOVERNANCE_GATEWAY_SECRET ? "set" : "unset — engine would treat identity headers as unauthenticated");
  }

  // ── 4. Environment mode ────────────────────────────────────────────────────
  add("Target environment is in enforce mode",
    config.declaredMode === "enforce" ? PASS : FAIL,
    `declared mode=${config.declaredMode || "unset"} — confirmed against the first decision's mode/enforced fields`);

  // ── 5. Settings that no endpoint exposes ───────────────────────────────────
  if (config.transport === "http") {
    add("RUNTIME_REQUIRE_RECORD=1", UNOBSERVABLE,
      "not exposed by any endpoint. Verified by effect: every decision must return recorded:true, asserted per transition and re-checked by the analyser.", true);
    add("GOVERNANCE_GATEWAY_SECRET configured", UNOBSERVABLE,
      "not exposed by /api/runtime/health. Confirmed from the first decision via identity.gateway_auth_configured in the engine response.", true);
  }

  // ── 6. Synthetic-only assertion ────────────────────────────────────────────
  add("Synthetic data only", config.acknowledgeSynthetic === true ? PASS : FAIL,
    config.acknowledgeSynthetic === true
      ? "operator confirmed: synthetic environment, no customer data, no production customer integration"
      : "operator has not confirmed --synthetic-only");

  const fail = checks.filter((c) => c.status === FAIL);
  const unobservable = checks.filter((c) => c.status === UNOBSERVABLE);
  return {
    ready: fail.length === 0,
    summary: {
      pass: checks.filter((c) => c.status === PASS).length,
      fail: fail.length,
      warn: checks.filter((c) => c.status === WARN).length,
      unobservable: unobservable.length,
    },
    checks,
    blocking: fail.map((c) => c.name),
    verify_by_effect: unobservable.map((c) => c.name),
  };
}

module.exports = { preflight, PASS, FAIL, WARN, UNOBSERVABLE };

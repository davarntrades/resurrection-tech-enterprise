/* ============================================================================
 * Phase-1 execution transports.
 *
 * Both transports reach the SAME authority boundary — Morrison decides, and only
 * a retained ALLOW mints the one-use grant. They differ in how much of the stack
 * sits in front of it, and the difference is stated rather than blurred.
 *
 *   http    POST /api/runtime/execute against a running instance of this app.
 *           Covers the whole production path: API-key authentication, the route's
 *           rejection of client-supplied verdict/authorization, the adapter
 *           registry, generic-http transport and its SSRF policy, evidence.
 *
 *           CONSTRAINT, MEASURED NOT ASSUMED. The generic-http adapter (which the
 *           `sandbox` adapter dispatches through) calls resolvedPublicAddress(),
 *           which begins `if (privateAddress(hostname)) throw SSRF_TARGET_DENIED`
 *           — and privateAddress() returns true for ANY value that is not an IP
 *           literal. So the environment must be addressed by a PUBLIC IP LITERAL.
 *           A DNS hostname passes validateConfiguration() and then fails at
 *           dispatch. Loopback and RFC1918 are refused as well. That behaviour is
 *           left exactly as found: hardening or relaxing the execution boundary
 *           before measuring it is out of scope for Phase 1.
 *
 *   inproc  rt.executionAdapters.governAndExecute() called directly, with a
 *           harness-only adapter registered in THIS process. Same gateway.govern,
 *           same engine, same execution gate, same evidence tables.
 *           NOT COVERED: the HTTP route handler (authentication, verdict
 *           rejection) and the generic-http transport. Those are covered instead
 *           by tests/route-contract.test.cjs and the repository's own
 *           scripts/runtime/universal-governed-execution.test.cjs.
 *
 * Neither transport may interpret a verdict. They return what the platform said.
 * ============================================================================ */
"use strict";

const http = require("node:http");
const https = require("node:https");

// ── http transport ───────────────────────────────────────────────────────────

function postJson(urlString, token, body, timeoutMs) {
  const url = new URL(urlString);
  const transport = url.protocol === "https:" ? https : http;
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: url.protocol, hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search, method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        authorization: `Bearer ${token}`,
        "x-guardian-sdk": "phase1-multiagent-orchestrator",
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* surfaced as transport_error below */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("execute request timed out")));
    req.write(payload);
    req.end();
  });
}

function createHttpTransport(config) {
  const base = String(config.platformUrl || "").replace(/\/$/, "");
  const token = config.ingestKey;
  const timeoutMs = Number(config.timeoutMs || 30000);
  if (!base) throw new Error("platformUrl is required for the http transport");
  if (!token) throw new Error("ingestKey is required for the http transport");

  return {
    id: "http",
    covers: ["route_authentication", "client_verdict_rejection", "adapter_registry",
             "generic_http_ssrf_policy", "execution_gate", "evidence"],
    not_covered: [],
    async execute(request) {
      const started = Date.now();
      try {
        const { status, json, text } = await postJson(`${base}/api/runtime/execute`, token, request, timeoutMs);
        return { transport: "http", http_status: status, result: json, raw: json ? null : text, latency_ms: Date.now() - started };
      } catch (error) {
        // A transport fault is NOT a verdict. Recorded as ambiguous so the
        // analyser treats it as a gap to reconcile, never as "nothing happened".
        return {
          transport: "http", http_status: null, result: null,
          transport_error: String((error && error.message) || error),
          latency_ms: Date.now() - started,
        };
      }
    },
  };
}

// ── inproc transport ─────────────────────────────────────────────────────────

/* The harness adapter.
 *
 * A faithful re-implementation of what the `sandbox` adapter does — POST the
 * action, GET the state — using a plain Node HTTP client that has no SSRF policy,
 * so the synthetic environment can live on loopback for a dry run. It is
 * registered ONLY in the harness process and never added to the production
 * registry in lib/runtime/execution-adapters/index.js.
 *
 * It is still wrapped by the real gate: registry.register() runs gate.guard(),
 * so execute() is unreachable without a one-use grant bound to the decision.
 */
function createHarnessAdapter(env) {
  const request = (method, path, body, headers) => new Promise((resolve, reject) => {
    const url = new URL(path, env.baseUrl);
    const transport = url.protocol === "https:" ? https : http;
    const payload = body == null ? null : JSON.stringify(body);
    const req = transport.request({
      protocol: url.protocol, hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname, method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.token}`,
        ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* text bodies are valid */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    let dispatched = false;
    req.on("socket", () => { dispatched = true; });
    req.on("error", (cause) => {
      const error = new Error(`harness adapter request failed: ${cause.message}`);
      error.code = cause.code || "HARNESS_REQUEST_FAILED";
      // Preserve the ambiguity the real adapters preserve: a fault after
      // dispatch may mean the far side already acted.
      error.executionMayHaveOccurred = dispatched;
      reject(error);
    });
    req.setTimeout(Number(env.timeoutMs || 8000), () => {
      const error = new Error("harness adapter timed out");
      error.code = "ADAPTER_TIMEOUT";
      error.executionMayHaveOccurred = dispatched;
      req.destroy(error);
    });
    if (payload) req.write(payload);
    req.end();
  });

  return {
    id: env.adapterId || "phase1-harness",
    name: "Phase-1 synthetic environment (harness only)",
    version: "1.0.0",
    capabilities: {
      pre_execution_hook: true, state_read: true, state_write: true, state_diff: true,
      multi_step: true, execution_receipts: true, idempotency: true, http: true,
      deterministic_reset: false,   // reset exists but is NOT asserted deterministic
    },
    validateConfiguration(config = {}) {
      const errors = [];
      if (!config.action_path) errors.push("action_path required");
      if (!config.state_path) errors.push("state_path required");
      if (!config.environment_id) errors.push("environment_id required");
      return { ok: errors.length === 0, errors };
    },
    async health() {
      const res = await request("GET", "/v1/health", null, {});
      return { ok: res.status === 200, status: res.status };
    },
    async observeState(input) {
      const res = await request("GET", input.config.state_path, null, {});
      return { state: res.json === null ? res.text : res.json, receipt: { transport: "harness-http", status: res.status } };
    },
    async execute(input) {
      const res = await request("POST", input.config.action_path, {
        session_id: input.config.session_id || null,
        environment_id: input.config.environment_id || null,
        action: input.action,
        trajectory: input.trajectory,
      }, {
        // Same header linkage the real generic-http adapter sets, so the
        // environment's independent log records the same identifiers.
        "x-morrison-decision-id": input.decision_id,
        "x-correlation-id": input.correlation_id,
        ...(input.request_id ? { "x-request-id": input.request_id } : {}),
        ...(input.idempotency_key ? { "idempotency-key": input.idempotency_key } : {}),
      });
      return {
        ok: res.status >= 200 && res.status < 300,
        executed: true,
        result: res.json,
        receipt: {
          transport: "harness-http",
          decision_id: input.decision_id,
          correlation_id: input.correlation_id,
          request_id: input.request_id || null,
          response_status: res.status,
          environment_log_seq: res.json && res.json.log_seq != null ? res.json.log_seq : null,
        },
      };
    },
    normalizeResult(result) { return result; },
  };
}

function createInprocTransport(config) {
  // Required late so a pure --transport http run never loads the platform.
  const rt = require(config.runtimeModulePath || "../../../lib/runtime");
  const execution = rt.executionAdapters;

  const adapterDefinition = createHarnessAdapter({
    baseUrl: config.envBaseUrl,
    token: config.envToken,
    adapterId: config.adapterId || "phase1-harness",
    timeoutMs: config.envTimeoutMs,
  });

  // register() runs the real contract validation and the real gate.guard().
  if (!execution.registry.has(adapterDefinition.id)) execution.registry.register(adapterDefinition);

  /* Authentication is resolved through the SAME function the HTTP route uses
   * (lib/runtime/admin.authenticate), from the same ingest key, so the org and
   * environment bound to every decision are the real ones. Resolved once and
   * reused, which is also what the route does per request. */
  let authPromise = null;
  async function resolveAuth() {
    if (!authPromise) {
      authPromise = (async () => {
        if (config.auth) return config.auth;
        if (!config.ingestKey) throw new Error("ingestKey is required for the inproc transport");
        const auth = await rt.admin.authenticate(config.ingestKey);
        if (!auth) throw new Error("ingest key did not authenticate — check RT_INGEST_KEY and the store backend");
        if (auth.role === "viewer") throw new Error("ingest or admin role required; this key is viewer-only");
        return auth;
      })();
    }
    return authPromise;
  }

  return {
    id: "inproc",
    covers: ["api_key_authentication", "gateway_govern", "engine_govern", "execution_gate", "evidence", "adapter_contract"],
    not_covered: ["http_route_handler", "client_verdict_rejection", "generic_http_ssrf_policy"],
    rt,
    resolveAuth,
    async execute(request) {
      const started = Date.now();
      try {
        const result = await execution.governAndExecute({
          auth: await resolveAuth(),
          trajectory: request.trajectory,
          domains: request.domains,
          horizon: request.horizon,
          label: request.label,
          agent: request.agent,
          adapter: adapterDefinition.id,
          adapterConfig: request.adapter_config,
          context: request.context,
          correlationId: request.correlation_id,
          idempotencyKey: request.idempotency_key,
        });
        return { transport: "inproc", http_status: null, result, latency_ms: Date.now() - started };
      } catch (error) {
        return {
          transport: "inproc", http_status: null, result: null,
          transport_error: String((error && error.message) || error),
          latency_ms: Date.now() - started,
        };
      }
    },
  };
}

function createTransport(config) {
  if (config.transport === "http") return createHttpTransport(config);
  if (config.transport === "inproc") return createInprocTransport(config);
  throw new Error(`unknown transport: ${config.transport} (expected "http" or "inproc")`);
}

module.exports = { createTransport, createHttpTransport, createInprocTransport, createHarnessAdapter };

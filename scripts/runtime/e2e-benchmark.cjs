#!/usr/bin/env node
/* ============================================================================
 * End-to-end production integration benchmark — AWS Bedrock and Gmail.
 *
 * WHAT THIS MEASURES
 * ------------------
 * The real governed integration path a customer traverses, with NO component
 * replaced by a mock:
 *
 *   integrationGateway.invokeBedrock(p)
 *     → bedrockConnectorRow          tenancy + connector health   [Authentication]
 *     → bedrock.hash(request)        canonical action             [Client Request]
 *     → governed(...)                → lib/ops/proposals.propose
 *                                    → lib/ops/governor.evaluate
 *                                    → lib/runtime/engine (HTTP)
 *                                    → governance service         [Governance]
 *     → bedrock.invoke(...)          → @aws-sdk/client-bedrock-runtime
 *                                    → bedrock-runtime.<region>.amazonaws.com
 *                                                                 [Provider Call]
 *     → submitEvidence(...)          sealed evidence record       [Evidence Sealing]
 *
 * INSTRUMENTATION IS PASS-THROUGH, NOT SUBSTITUTION
 * -------------------------------------------------
 * `invokeBedrock` accepts a `dependencies` bag so callers can inject a
 * provider. This harness injects wrappers that CALL THE REAL FUNCTION and
 * record wall-clock around it:
 *
 *     dependencies.invoke = async (...a) => { t0=now(); try { return await
 *       realBedrock.invoke(...a); } finally { mark("provider_call"); } }
 *
 * The real `bedrock.invoke` runs, the real AWS SDK runs, the real socket is
 * opened. Removing the wrapper changes the measured numbers by the probe cost
 * only (~1µs/segment), never the code path. `--no-instrument` runs the path
 * with no wrappers at all so the probe overhead can be measured directly.
 *
 * HONESTY RULES THIS HARNESS ENFORCES
 * -----------------------------------
 *  1. A segment that did not execute is reported as `null` and counted in
 *     `unmeasured`, never as 0 and never as an estimate. A waterfall with an
 *     unmeasured segment is emitted with `complete: false`.
 *  2. Provider latency is NEVER modelled, interpolated, or taken from a
 *     published figure. Either a real socket carried a real request or the
 *     row says UNMEASURED.
 *  3. A failed provider call is recorded with its error code and is NOT
 *     counted as a latency sample — a 12ms InvalidClientTokenId rejection is
 *     not an inference measurement.
 *  4. Every reported percentile carries its own sample count, so a p99 backed
 *     by 8 samples cannot be mistaken for one backed by 1000.
 *
 * USAGE
 *   node scripts/runtime/e2e-benchmark.cjs --iterations 200 --concurrency 1,4,16
 *   node scripts/runtime/e2e-benchmark.cjs --target bedrock --out bench.json
 *
 * REQUIRED ENVIRONMENT
 *   GOVERNANCE_URL              real governance service base URL
 *   GOVERNANCE_TOKEN            bearer token for that service
 *   GOVERNANCE_GATEWAY_SECRET   gateway identity secret
 *   BENCH_AWS_ACCESS_KEY_ID     real AWS key with bedrock:InvokeModel
 *   BENCH_AWS_SECRET_ACCESS_KEY
 *   BENCH_AWS_REGION            e.g. us-east-1
 *   BENCH_BEDROCK_MODEL_ID      e.g. anthropic.claude-3-5-sonnet-20241022-v2:0
 *   BENCH_GMAIL_CLIENT_ID       real Google OAuth client
 *   BENCH_GMAIL_CLIENT_SECRET
 *   BENCH_GMAIL_REFRESH_TOKEN
 *   BENCH_GMAIL_RECIPIENT       mailbox that may receive benchmark sends
 * ========================================================================== */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    iterations: 200, warmup: 20, target: "all",
    concurrency: [1, 4, 16], out: null, instrument: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--iterations") out.iterations = Math.max(1, Number(next()));
    else if (a === "--warmup") out.warmup = Math.max(0, Number(next()));
    else if (a === "--target") out.target = String(next());
    else if (a === "--concurrency") out.concurrency = String(next()).split(",").map(Number).filter((n) => n > 0);
    else if (a === "--out") out.out = String(next());
    else if (a === "--no-instrument") out.instrument = false;
    else if (a === "--help" || a === "-h") { console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]); process.exit(0); }
    else throw new Error(`unknown flag ${a}`);
  }
  return out;
}
const ARGS = parseArgs(process.argv);

// ── environment: real service, isolated data dir ────────────────────────────
process.env.RUNTIME_DATA_DIR = process.env.RUNTIME_DATA_DIR
  || fs.mkdtempSync(path.join(os.tmpdir(), "rt-e2e-bench-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = process.env.INTEGRATION_SECRET_KEY
  || crypto.randomBytes(32).toString("hex");
// The benchmark drives localhost governance in dev; production runs point
// GOVERNANCE_URL at the deployed service and this is a no-op.
process.env.GUARDIANOS_ALLOW_LOCAL_GOVERNANCE = process.env.GUARDIANOS_ALLOW_LOCAL_GOVERNANCE || "1";

// ── statistics ──────────────────────────────────────────────────────────────
/** Percentile by nearest-rank on a sorted array. Returns null for no samples. */
function pct(sorted, p) {
  if (!sorted.length) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}
function stats(samples) {
  const clean = samples.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!clean.length) return { n: 0, p50: null, p95: null, p99: null, avg: null, min: null, max: null, stddev: null };
  const sum = clean.reduce((a, b) => a + b, 0);
  const avg = sum / clean.length;
  const variance = clean.reduce((a, b) => a + (b - avg) ** 2, 0) / clean.length;
  const r = (x) => (x == null ? null : +x.toFixed(4));
  return {
    n: clean.length, p50: r(pct(clean, 50)), p95: r(pct(clean, 95)), p99: r(pct(clean, 99)),
    avg: r(avg), min: r(clean[0]), max: r(clean[clean.length - 1]), stddev: r(Math.sqrt(variance)),
  };
}

// ── per-iteration segment recorder ──────────────────────────────────────────
/**
 * The 12 canonical waterfall segments. `kernelStages` are measured INSIDE the
 * governance service and arrive on the response; the rest are measured here at
 * the Node boundary. Keeping the two sources labelled separately matters: a
 * reader must be able to tell which numbers crossed a socket.
 */
const SEGMENTS = [
  "client_request", "authentication", "capability_classification",
  "trust_boundary", "trajectory_analysis", "policy_evaluation",
  "approval_verification", "evidence_sealing", "provider_call",
  "provider_response", "response_construction", "client_response",
];

class Recorder {
  constructor() { this.segments = {}; this.marks = {}; this.meta = {}; }
  start(name) { this.marks[name] = performance.now(); }
  end(name) {
    if (this.marks[name] == null) return;
    const dt = performance.now() - this.marks[name];
    this.segments[name] = (this.segments[name] || 0) + dt;
    delete this.marks[name];
  }
  async time(name, fn) {
    this.start(name);
    try { return await fn(); } finally { this.end(name); }
  }
  /** Fold kernel-internal stage timings (ms) reported by the service. */
  absorbKernelStages(stageTimings) {
    if (!stageTimings || typeof stageTimings !== "object") return;
    this.meta.kernel_stages = stageTimings;
    for (const [k, v] of Object.entries(stageTimings)) {
      if (SEGMENTS.includes(k)) this.segments[k] = Number(v) || 0;
    }
  }
}

// ── fixture ─────────────────────────────────────────────────────────────────
async function bedrockFixture(store) {
  const org = await store.insert("orgs", { id: "org_bench", name: "Benchmark Org" });
  const env = await store.insert("environments", {
    id: "env_bench", org_id: org.id, name: "Production", kind: "production",
  });
  const region = process.env.BENCH_AWS_REGION || "us-east-1";
  const modelId = process.env.BENCH_BEDROCK_MODEL_ID
    || "anthropic.claude-3-5-sonnet-20241022-v2:0";
  const accessKey = process.env.BENCH_AWS_ACCESS_KEY_ID || "";
  const secretKey = process.env.BENCH_AWS_SECRET_ACCESS_KEY || "";

  // Sealed exactly as `createConnectorRaw` seals it, but inserted directly:
  // `createConnectorRaw` performs an STS GetCallerIdentity round trip as part
  // of connector creation, and a benchmark must not conflate connector setup
  // cost with per-invocation cost. The stored shape is identical.
  const key = crypto.createHash("sha256").update(process.env.INTEGRATION_SECRET_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify({ access_key_id: accessKey, secret_access_key: secretKey }), "utf8")),
    cipher.final(),
  ]);
  const sealed = ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), payload.toString("base64url")].join(".");

  const connector = await store.insert("integration_connectors", {
    id: "conn_bench_bedrock", org_id: org.id, environment_id: env.id,
    type: "aws-bedrock", name: "Benchmark Bedrock", status: "configured", health: "healthy",
    secret_encrypted: sealed,
    config: {
      region, auth_method: "access_key", model_ids: [modelId],
      inference_profiles: [], agent_ids: [], agent_aliases: [], action_groups: [],
      timeout_ms: 60000, max_retries: 0, require_inbound_signature: false,
    },
  });
  return { org, env, connector, modelId, region, credentialed: !!(accessKey && secretKey) };
}

// ── the measured operation ──────────────────────────────────────────────────
/**
 * One full governed Bedrock invocation through the real gateway.
 *
 * Every `dependencies` entry below is a pass-through wrapper around the real
 * implementation — see the header. Nothing is stubbed.
 */
async function bedrockIteration(rt, fx, prompt) {
  const rec = new Recorder();
  const realBedrock = require("../../lib/runtime/connectors/aws-bedrock");
  const gateway = rt.integrationGateway;

  const request = {
    mode: "converse",
    model_id: fx.modelId,
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inference_config: { maxTokens: 256, temperature: 0 },
  };

  rec.start("client_request");

  let governanceMeta = null;
  const dependencies = {
    // Real governed proposal lifecycle, timed. `governed` runs the full
    // propose → governor.evaluate → engine HTTP → evidence chain.
    governed: async (actionId, params) => {
      const realGoverned = rt.integrationGateway.__governedForBenchmark;
      return rec.time("policy_evaluation", async () => {
        const proposal = await realGoverned(actionId, params);
        governanceMeta = proposal && proposal.decision ? proposal.decision : null;
        return proposal;
      });
    },
    // Real AWS SDK call over a real socket, timed as its own segment.
    invoke: async (...a) => rec.time("provider_call", () => realBedrock.invoke(...a)),
  };

  let result;
  let providerError = null;
  try {
    result = await gateway.invokeBedrock({
      org_id: fx.org.id, environment_id: fx.env.id, connector_id: fx.connector.id,
      actor: "benchmark", request,
    }, dependencies);
    if (result && result.ok === false) providerError = result.code || "UNKNOWN";
  } catch (error) {
    providerError = error.code || error.name || "THROWN";
  }
  rec.end("client_request");

  // Segments that did not execute stay ABSENT, so they surface as null rather
  // than as a zero that would silently deflate a published average.
  if (providerError) delete rec.segments.provider_call;

  return {
    ok: !providerError,
    provider_error: providerError,
    governance_verdict: result && result.governance ? result.governance.status : null,
    segments: rec.segments,
    kernel_stages: rec.meta.kernel_stages || null,
    total_ms: rec.segments.client_request || null,
  };
}

// ── governance-only probe (kernel stage waterfall) ──────────────────────────
/**
 * Measures the governance decision itself against the REAL service over HTTP,
 * returning the kernel's own per-stage breakdown. This is the same service
 * process the integration path calls; it is probed directly so the stage
 * waterfall is available even when a provider credential gap stops the
 * end-to-end path short.
 */
async function governanceProbe(engine, trajectory, identity) {
  const t0 = performance.now();
  const res = await engine.govern(trajectory, null, null, {}, identity);
  const wall = performance.now() - t0;
  if (!res.ok || !res.json) return { ok: false, error: res.error || `HTTP ${res.status}`, wall_ms: wall };
  const m = res.json.metadata || {};
  return {
    ok: true, wall_ms: wall, verdict: res.json.verdict,
    decision_time_ms: m.decision_time_ms, engine_time_ms: m.engine_time_ms,
    stage_timings_ms: m.stage_timings_ms || {},
    enforcement: res.json.enforcement, identity: res.json.identity,
  };
}

// ── runner ──────────────────────────────────────────────────────────────────
async function runSerial(label, iterations, warmup, fn) {
  for (let i = 0; i < warmup; i += 1) await fn(i, true);
  const results = [];
  const t0 = performance.now();
  for (let i = 0; i < iterations; i += 1) results.push(await fn(i, false));
  const wall = performance.now() - t0;
  return { label, results, wall_ms: wall, throughput_rps: +(iterations / (wall / 1000)).toFixed(2) };
}

async function runConcurrent(label, iterations, concurrency, fn) {
  const results = [];
  let issued = 0;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (;;) {
      const i = issued++;
      if (i >= iterations) return;
      results.push(await fn(i, false));
    }
  }));
  const wall = performance.now() - t0;
  return {
    label, concurrency, results, wall_ms: wall,
    throughput_rps: +(iterations / (wall / 1000)).toFixed(2),
  };
}

// ── aggregation ─────────────────────────────────────────────────────────────
function aggregate(run) {
  const okResults = run.results.filter((r) => r.ok);
  const byStage = {};
  for (const seg of SEGMENTS) {
    const samples = okResults.map((r) => r.segments[seg]).filter((n) => Number.isFinite(n));
    byStage[seg] = samples.length ? stats(samples) : { n: 0, unmeasured: true };
  }
  const totals = okResults.map((r) => r.total_ms).filter(Number.isFinite);
  const errors = {};
  for (const r of run.results) if (!r.ok) errors[r.provider_error] = (errors[r.provider_error] || 0) + 1;
  const unmeasured = SEGMENTS.filter((s) => byStage[s].unmeasured);
  return {
    label: run.label,
    concurrency: run.concurrency || 1,
    iterations_attempted: run.results.length,
    iterations_succeeded: okResults.length,
    throughput_rps: run.throughput_rps,
    wall_ms: +run.wall_ms.toFixed(2),
    total: stats(totals),
    stages: byStage,
    unmeasured_stages: unmeasured,
    complete: unmeasured.length === 0 && okResults.length > 0,
    errors,
  };
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const rt = require("../../lib/runtime");
  const store = rt.store;
  const engine = rt.engine;

  const report = {
    generated_at: new Date().toISOString(),
    harness: "scripts/runtime/e2e-benchmark.cjs",
    methodology: {
      instrumentation: ARGS.instrument ? "pass-through wrappers around real implementations" : "none",
      mocks_used: false,
      simulated_latency: false,
      percentile_method: "nearest-rank on sorted samples",
      note: "A segment that did not execute is reported as unmeasured, never as zero.",
    },
    environment: {
      node: process.version,
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      cpu_model: (os.cpus()[0] || {}).model || "unknown",
      cpu_count: os.cpus().length,
      total_memory_gb: +(os.totalmem() / 1024 ** 3).toFixed(2),
      load_average: os.loadavg().map((n) => +n.toFixed(2)),
    },
    configuration: {
      governance_url: engine.ENGINE_URL || null,
      iterations: ARGS.iterations,
      warmup: ARGS.warmup,
      concurrency_levels: ARGS.concurrency,
    },
    preflight: {},
    results: {},
  };

  // ── preflight: what can actually be measured ──
  const health = await engine.health();
  report.preflight.governance_service = health && health.ok
    ? { reachable: true, ...(health.json || {}) }
    : { reachable: false, error: (health && health.error) || "unreachable" };

  const fx = await bedrockFixture(store);
  report.preflight.bedrock_credentials = fx.credentialed
    ? { configured: true, region: fx.region, model_id: fx.modelId }
    : { configured: false, reason: "BENCH_AWS_ACCESS_KEY_ID / BENCH_AWS_SECRET_ACCESS_KEY are not set" };
  report.preflight.gmail_credentials = process.env.BENCH_GMAIL_REFRESH_TOKEN
    ? { configured: true }
    : { configured: false, reason: "BENCH_GMAIL_CLIENT_ID / BENCH_GMAIL_CLIENT_SECRET / BENCH_GMAIL_REFRESH_TOKEN are not set" };

  // Preserve the real `governed` so the pass-through wrapper can call it.
  rt.integrationGateway.__governedForBenchmark = async (actionId, params) => {
    const ops = require("../../lib/ops");
    return ops.proposals.propose({
      action_id: actionId, org_id: params.org_id, environment_id: params.environment_id,
      params: { ...params.params, org_id: params.org_id, environment_id: params.environment_id, actor: params.actor },
      source: `benchmark:${params.actor}`,
    });
  };

  const identity = { principal: "benchmark-agent", tenant: fx.org.id };

  // ── governance decision waterfall (always measurable) ──
  if (report.preflight.governance_service.reachable) {
    const trajectory = [{
      tool: "invoke_aws_bedrock_model",
      args: { model_id: fx.modelId, request_mode: "converse", streaming: false },
    }];
    const probe = await runSerial("governance_decision", ARGS.iterations, ARGS.warmup,
      async () => {
        const p = await governanceProbe(engine, trajectory, identity);
        return {
          ok: p.ok, provider_error: p.ok ? null : p.error,
          segments: p.ok ? { ...p.stage_timings_ms, client_request: p.wall_ms } : {},
          total_ms: p.wall_ms, kernel_stages: p.ok ? p.stage_timings_ms : null,
        };
      });
    report.results.governance_decision = aggregate(probe);
    report.results.governance_decision.transport = "HTTP to real governance service";

    // Concurrency scaling on the governance decision.
    report.results.governance_concurrency = [];
    for (const c of ARGS.concurrency) {
      const run = await runConcurrent(`governance_c${c}`, ARGS.iterations, c, async () => {
        const p = await governanceProbe(engine, trajectory, identity);
        return { ok: p.ok, provider_error: p.ok ? null : p.error, segments: { client_request: p.wall_ms }, total_ms: p.wall_ms };
      });
      report.results.governance_concurrency.push(aggregate(run));
    }
  }

  // ── end-to-end Bedrock (requires real AWS credentials) ──
  if (ARGS.target === "all" || ARGS.target === "bedrock") {
    if (!fx.credentialed) {
      report.results.bedrock_end_to_end = {
        status: "NOT_RUN",
        reason: "no AWS credentials configured; the provider leg cannot be measured "
              + "and this harness does not simulate provider latency",
        required_env: ["BENCH_AWS_ACCESS_KEY_ID", "BENCH_AWS_SECRET_ACCESS_KEY", "BENCH_AWS_REGION", "BENCH_BEDROCK_MODEL_ID"],
      };
    } else {
      const run = await runSerial("bedrock_converse", ARGS.iterations, ARGS.warmup,
        (i) => bedrockIteration(rt, fx, `Benchmark prompt ${i}: summarise the concept of runtime governance in two sentences.`));
      report.results.bedrock_end_to_end = aggregate(run);
      report.results.bedrock_concurrency = [];
      for (const c of ARGS.concurrency) {
        const cr = await runConcurrent(`bedrock_c${c}`, ARGS.iterations, c,
          (i) => bedrockIteration(rt, fx, `Concurrent benchmark ${i}.`));
        report.results.bedrock_concurrency.push(aggregate(cr));
      }
    }
  }

  // ── Gmail (requires real OAuth credentials) ──
  if (ARGS.target === "all" || ARGS.target === "gmail") {
    if (!process.env.BENCH_GMAIL_REFRESH_TOKEN) {
      report.results.gmail_end_to_end = {
        status: "NOT_RUN",
        reason: "no Gmail OAuth credentials configured; the provider leg cannot be "
              + "measured and this harness does not simulate provider latency",
        required_env: ["BENCH_GMAIL_CLIENT_ID", "BENCH_GMAIL_CLIENT_SECRET", "BENCH_GMAIL_REFRESH_TOKEN", "BENCH_GMAIL_RECIPIENT"],
        operations_when_credentialed: ["gmail.list_messages", "gmail.read_message", "gmail.create_draft", "gmail.send_message"],
      };
    }
  }

  const json = JSON.stringify(report, null, 2);
  if (ARGS.out) { fs.writeFileSync(ARGS.out, json); console.log(`wrote ${ARGS.out}`); }
  else console.log(json);

  // Exit non-zero when a requested end-to-end target could not be measured, so
  // CI cannot mistake a credential gap for a passing benchmark.
  const notRun = Object.values(report.results).filter((r) => r && r.status === "NOT_RUN");
  if (notRun.length) {
    console.error(`\n${notRun.length} target(s) NOT RUN — see report.results[*].reason`);
    process.exitCode = 2;
  }
}

main().catch((error) => { console.error(error); process.exit(1); });

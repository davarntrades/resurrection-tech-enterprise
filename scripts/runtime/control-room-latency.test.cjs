#!/usr/bin/env node
/* ============================================================================
 * Control Room latency telemetry — regression suite.
 *
 * The Control Room shares the public demo's engine and endpoint (/v1/govern on
 * the same service) but was discarding every timing field the kernel reports
 * and presenting the ONE number it kept under a name that misdescribed it:
 *
 *   engine_compute_ms  is the whole SERVICE HANDLER — identity resolution,
 *                      kernel construction, every step, integrity, attestation
 *   shown as           "Avg engine" / "Engine p95" / "Mean engine compute"
 *
 * That overstates Ω engine compute by roughly an order of magnitude, in the
 * opposite direction to the demo's old bug (which understated the governed
 * decision by quoting engine compute). Both were mislabelled data.
 *
 * Four measurements are now kept distinct, each a superset of the one above:
 *
 *   engine_time_ms     Ω reachability compute alone
 *   decision_time_ms   the governed decision (kernel pipeline)
 *   engine_compute_ms  the whole service handler
 *   round_trip_ms      Node → service → Node, including network
 *
 * `engine_compute_ms` KEEPS its name because store.chainCore binds it into the
 * decision hash chain; renaming or repurposing it would invalidate every
 * historical entry. Only its presentation changed.
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert");

for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-cr-latency-"));
process.env.RUNTIME_LOG_SILENT = "1";

let pass = 0, fail = 0;
const failures = [];
function ok(condition, message, detail) {
  if (condition) { pass++; return; }
  fail++;
  failures.push(`${message}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

const ROOT = path.resolve(__dirname, "../..");

/* ── a stand-in /v1/govern whose TIMING PAYLOAD we control ─────────────────
 * This is not a mock governance engine standing in for enforcement — the
 * verdicts here are irrelevant. It exists to drive the gateway's timing
 * EXTRACTION through payload shapes a real service legitimately produces:
 * full metadata, partial metadata (older build), and none.
 * ------------------------------------------------------------------------ */
function engineServing(metadata, extra = {}) {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); return res.end('{"ok":true}'); }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        verdict: "BLOCK", permitted: false, blocked: true,
        layer: "kernel", reason: "test", omega_domain: "enterprise",
        trajectory_hash: "h1",
        attestation: { engine_commit: "abc", ruleset_hash: "rs", service_version: "1" },
        metadata,
        ...extra,
      }));
    });
  });
}

const listen = (server) => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));

async function withEngine(metadata, extra, fn) {
  const server = engineServing(metadata, extra);
  const port = await listen(server);
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${port}`;
  process.env.GUARDIANOS_ALLOW_LOCAL_GOVERNANCE = "1";
  // engine.js reads GOVERNANCE_URL at require time, so load it fresh per case.
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/lib/runtime/") || k.includes("/lib/ops/")) delete require.cache[k];
  }
  try { return await fn(); } finally { server.close(); }
}

// Real onboarding + a real issued API key, authenticated through the real
// admin path — the Control Room's own entry conditions. A hand-made auth
// object would bypass the authentication this telemetry rides on.
async function fixture(rt) {
  const cust = await rt.admin.onboardCustomer({
    name: `CR ${Math.random().toString(36).slice(2, 8)}`,
    slug: `cr-${Math.random().toString(36).slice(2, 8)}`,
  });
  await rt.admin.setMode(cust.production.id, "enforce");
  const auth = await rt.admin.authenticate(cust.ingest_key);
  return { cust, auth };
}

async function govern(rt, fx) {
  return rt.gateway.govern({
    auth: fx.auth,
    trajectory: [{ tool: "drop_database", args: { db: "prod" } }],
    domains: ["cybersecurity"], label: "cr-test",
  });
}

const FULL_METADATA = {
  rule: "r1",
  decision_time_ms: 0.5123,
  eval_time_ms: 0.5123,
  engine_time_ms: 0.0112,
  trajectory_decision_time_ms: 0.5123,
  eval_number: 1,
  stage_timings_ms: {
    trajectory_analysis: 0.1731, capability_classification: 0.1633,
    evidence_sealing: 0.1002, policy_evaluation: 0.0678,
    trust_boundary: 0.0122, approval_verification: 0.0009,
    canonicalization: 0.0, destination_resolution: 0.0031, unattributed: 0.0,
  },
};

/* ══════════════════════════════════════════════════════════════════════════
 * 1. Timing fields must not be discarded
 * ══════════════════════════════════════════════════════════════════════════ */

async function testGatewayCapturesEveryTimingField() {
  await withEngine(FULL_METADATA, { engine_compute_ms: 2.5 }, async () => {
    const rt = require(`${ROOT}/lib/runtime`);
    const fx = await fixture(rt);
    const r = await govern(rt, fx);
    ok(r.decision_time_ms === 0.5123, "governed decision captured", r.decision_time_ms);
    ok(r.engine_time_ms === 0.0112, "engine compute captured", r.engine_time_ms);
    ok(r.trajectory_decision_time_ms === 0.5123, "trajectory total captured", r.trajectory_decision_time_ms);
    ok(r.eval_number === 1, "eval number captured", r.eval_number);
    ok(r.stage_timings_ms && Object.keys(r.stage_timings_ms).length === 9,
      "stage timings captured, not discarded", r.stage_timings_ms);
    ok(r.engine_compute_ms === 2.5, "service handler still captured", r.engine_compute_ms);
    ok(typeof r.round_trip_ms === "number", "round trip measured", r.round_trip_ms);
  });
}

async function testTimingIsPersistedOnTheDecisionRow() {
  await withEngine(FULL_METADATA, { engine_compute_ms: 2.5 }, async () => {
    const rt = require(`${ROOT}/lib/runtime`);
    const fx = await fixture(rt);
    const r = await govern(rt, fx);
    const row = await rt.store.getDecisionById(r.decision_id);
    ok(row, "decision row persisted");
    ok(row.decision_time_ms === 0.5123, "decision_time_ms persisted", row && row.decision_time_ms);
    ok(row.engine_time_ms === 0.0112, "engine_time_ms persisted", row && row.engine_time_ms);
    ok(row.stage_timings_ms && Object.keys(row.stage_timings_ms).length === 9,
      "stage_timings_ms persisted", row && row.stage_timings_ms);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 2. Absent must not become 0 — and genuine 0 must not be dropped
 * ══════════════════════════════════════════════════════════════════════════ */

async function testAbsentTimingIsNullNeverZero() {
  // A service predating the timing passthrough: verdict fields only.
  await withEngine({ rule: "r1" }, { engine_compute_ms: 2.5 }, async () => {
    const rt = require(`${ROOT}/lib/runtime`);
    const fx = await fixture(rt);
    const r = await govern(rt, fx);
    for (const f of ["decision_time_ms", "engine_time_ms", "trajectory_decision_time_ms", "eval_number", "stage_timings_ms"]) {
      ok(r[f] === null, `${f} is null when unreported`, { field: f, value: r[f] });
      ok(r[f] !== 0, `${f} must never be fabricated as 0`, r[f]);
    }
    ok(r.verdict === "BLOCK", "verdict unaffected by missing telemetry", r.verdict);
  });
}

async function testGenuineZeroIsPreserved() {
  // A real 0 is a measurement. Two stages in FULL_METADATA are genuinely 0.
  await withEngine(FULL_METADATA, { engine_compute_ms: 0 }, async () => {
    const rt = require(`${ROOT}/lib/runtime`);
    const fx = await fixture(rt);
    const r = await govern(rt, fx);
    ok(r.stage_timings_ms.canonicalization === 0,
      "a genuinely reported 0 stage is preserved, not dropped", r.stage_timings_ms);
    ok(r.stage_timings_ms.unattributed === 0,
      "zero unattributed remainder preserved", r.stage_timings_ms);
    ok(r.engine_compute_ms === 0,
      "a genuine 0 service-handler reading is preserved", r.engine_compute_ms);
  });
}

async function testNonNumericTimingIsRejectedNotCoerced() {
  await withEngine({
    rule: "r1", decision_time_ms: "0.5", engine_time_ms: null,
    eval_number: [], stage_timings_ms: "nope",
  }, { engine_compute_ms: 2.5 }, async () => {
    const rt = require(`${ROOT}/lib/runtime`);
    const fx = await fixture(rt);
    const r = await govern(rt, fx);
    ok(r.decision_time_ms === null, "string decision_time_ms rejected", r.decision_time_ms);
    ok(r.engine_time_ms === null, "null engine_time_ms rejected", r.engine_time_ms);
    ok(r.eval_number === null, "array eval_number rejected", r.eval_number);
    ok(r.stage_timings_ms === null, "string stage_timings_ms rejected", r.stage_timings_ms);
  });
}

async function testMalformedStageEntriesDroppedNotZeroed() {
  await withEngine({
    rule: "r1", decision_time_ms: 0.5,
    stage_timings_ms: { trajectory_analysis: 0.17, policy_evaluation: "fast", evidence_sealing: null },
  }, { engine_compute_ms: 2.5 }, async () => {
    const rt = require(`${ROOT}/lib/runtime`);
    const fx = await fixture(rt);
    const r = await govern(rt, fx);
    ok(r.stage_timings_ms.trajectory_analysis === 0.17, "numeric stage kept", r.stage_timings_ms);
    ok(!("policy_evaluation" in r.stage_timings_ms), "string stage dropped, not zeroed", r.stage_timings_ms);
    ok(!("evidence_sealing" in r.stage_timings_ms), "null stage dropped, not zeroed", r.stage_timings_ms);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 3. No measurement may be presented as something it is not
 * ══════════════════════════════════════════════════════════════════════════ */

function testNoUiCallsTheServiceHandlerEngineLatency() {
  const files = [
    "components/admin/RuntimeAdminClient.tsx",
    "app/runtime-dashboard/page.tsx",
    "lib/runtime/reports.js",
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    // The specific mislabels this suite exists to prevent returning.
    for (const bad of ["Avg engine", "Engine p95", "Mean engine compute",
                       "p95 engine compute", "Mean engine decision time"]) {
      ok(!src.includes(bad), `${f} must not label the service handler "${bad}"`);
    }
  }
}

function testUiUsesPreciseLabels() {
  const admin = fs.readFileSync(path.join(ROOT, "components/admin/RuntimeAdminClient.tsx"), "utf8");
  ok(/Governed decision/.test(admin), "decisions table labels the governed decision");
  ok(/Engine compute/.test(admin), "decisions table labels engine compute separately");
  ok(/Service handler/.test(admin), "decisions table labels the service handler");
  ok(/Round trip/.test(admin), "decisions table labels round trip");
  // Four distinct measurements, four distinct columns.
  for (const f of ["decision_time_ms", "engine_time_ms", "engine_compute_ms", "round_trip_ms"]) {
    ok(admin.includes(`d.${f}`), `decisions table renders ${f}`);
  }
}

function testTableUsesNullishNotTruthyRendering() {
  // `d.x || "—"` would render a genuine 0 as a dash. `??` does not.
  const admin = fs.readFileSync(path.join(ROOT, "components/admin/RuntimeAdminClient.tsx"), "utf8");
  for (const f of ["decision_time_ms", "engine_time_ms", "engine_compute_ms", "round_trip_ms"]) {
    ok(new RegExp(`d\\.${f} \\?\\? "—"`).test(admin),
      `${f} must use ?? so a genuine 0 renders as 0`);
    ok(!new RegExp(`d\\.${f} \\|\\| "—"`).test(admin),
      `${f} must not use || which would hide a genuine 0`);
  }
}

function testBenchmarkReferenceIsNotPresentedAsALiveEvaluation() {
  // The Control Room shows measured decisions only. If a CI benchmark figure
  // is ever added here it must be labelled as the demo labels it, so a
  // reference average is never mistaken for a live measurement.
  const admin = fs.readFileSync(path.join(ROOT, "components/admin/RuntimeAdminClient.tsx"), "utf8");
  const mentionsBenchmark = /benchmark/i.test(admin);
  if (mentionsBenchmark) {
    ok(/CI (benchmark )?avg|CI benchmark average|Reference \(CI avg/.test(admin),
      "any benchmark figure must be labelled as a CI reference average");
  } else {
    ok(true, "Control Room shows measured decisions only — no benchmark figure to confuse");
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 4. Provider latency is unmeasured here, and must say so
 * ══════════════════════════════════════════════════════════════════════════ */

async function testProviderLatencyIsNeverReportedAsZero() {
  await withEngine(FULL_METADATA, { engine_compute_ms: 2.5 }, async () => {
    const rt = require(`${ROOT}/lib/runtime`);
    const fx = await fixture(rt);
    const r = await govern(rt, fx);
    // govern() is a decision plane: it never calls a provider. No provider
    // timing may therefore appear at all — least of all as 0.
    for (const k of Object.keys(r)) {
      ok(!/provider.*(ms|latency)/i.test(k) || r[k] === null,
        `no fabricated provider latency on a decision-only path (${k})`, r[k]);
    }
    const row = await rt.store.getDecisionById(r.decision_id);
    ok(!("provider_latency_ms" in row), "decision row carries no provider latency field");
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 5. The hash chain must be unaffected by the additive fields
 * ══════════════════════════════════════════════════════════════════════════ */

async function testAdditiveTimingDoesNotDisturbTheDecisionChain() {
  await withEngine(FULL_METADATA, { engine_compute_ms: 2.5 }, async () => {
    const rt = require(`${ROOT}/lib/runtime`);
    const fx = await fixture(rt);
    for (let i = 0; i < 4; i += 1) await govern(rt, fx);
    const v = await rt.store.verifyChain({ environment_id: fx.cust.production.id });
    ok(v.ok === true, "decision hash chain still verifies with timing fields present", v);
  });
}

function testTimingFieldsAreNotInChainCore() {
  // If a timing field were chain-bound, dropping it under a pending migration
  // would break the chain — which is exactly why appendDecision may drop them.
  const src = fs.readFileSync(path.join(ROOT, "lib/runtime/store.js"), "utf8");
  const core = src.slice(src.indexOf("function chainCore"), src.indexOf("function entryHash"));
  for (const f of ["decision_time_ms", "engine_time_ms", "trajectory_decision_time_ms",
                   "eval_number", "stage_timings_ms"]) {
    ok(!core.includes(f), `${f} must stay outside chainCore so it can be dropped safely`);
  }
  ok(core.includes("engine_compute_ms"),
    "engine_compute_ms remains chain-bound — which is why it cannot be renamed");
}

/* ══════════════════════════════════════════════════════════════════════════ */

(async () => {
  await testGatewayCapturesEveryTimingField();
  await testTimingIsPersistedOnTheDecisionRow();
  await testAbsentTimingIsNullNeverZero();
  await testGenuineZeroIsPreserved();
  await testNonNumericTimingIsRejectedNotCoerced();
  await testMalformedStageEntriesDroppedNotZeroed();
  testNoUiCallsTheServiceHandlerEngineLatency();
  testUiUsesPreciseLabels();
  testTableUsesNullishNotTruthyRendering();
  testBenchmarkReferenceIsNotPresentedAsALiveEvaluation();
  await testProviderLatencyIsNeverReportedAsZero();
  await testAdditiveTimingDoesNotDisturbTheDecisionChain();
  testTimingFieldsAreNotInChainCore();

  console.log(`\ncontrol-room-latency: ${pass} passed, ${fail} failed`);
  if (fail) { for (const f of failures) console.error(`  ✗ ${f}`); process.exit(1); }
})().catch((error) => { console.error(error); process.exit(1); });

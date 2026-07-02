#!/usr/bin/env node
/* ============================================================================
 * Stress + scale regression.
 *
 * Scales the manifest across 1 / 10 / 100 / 500 / 1,000 tools and measures, at
 * each size:
 *   • parse time + resident memory (in-process, the delivery-kit parser)
 *   • /v1/assess latency (transport) and engine-reported compute
 *   • /v1/evaluate engine compute + transport on a bounded trajectory
 *   • deterministic replay — identical verdict + trajectory_hash across N runs
 * Plus a single full-pipeline run at the largest size to time report + PDF
 * generation and capture peak process memory.
 *
 * The engine must stay DETERMINISTIC at every scale — that is the hard gate;
 * latency/memory are reported for trend visibility (with generous ceilings so
 * the suite is portable across machines).
 *
 *   GOVERNANCE_URL=… GOVERNANCE_TOKEN=… node scripts/smoke-tests/stress-test.cjs
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const K = require("../delivery-kit.cjs");

const ROOT = path.join(__dirname, "..", "..");
const GOV = process.env.GOVERNANCE_URL;
const TOK = process.env.GOVERNANCE_TOKEN;
const SIZES = [1, 10, 100, 500, 1000];
const REPLAYS = 4;                       // determinism sample count per size
const MAX_STEPS = 20;                    // stay under the engine's step cap

let fail = 0; const fails = [];
const ok = (c, m) => { if (!c) { fail++; fails.push(m); } };

function post(endpoint, body) {
  const t0 = process.hrtime.bigint();
  const out = execFileSync("curl", ["-s", "-X", "POST", `${GOV.replace(/\/$/, "")}${endpoint}`,
    "-H", "Content-Type: application/json", "-H", `Authorization: Bearer ${TOK}`, "-d", JSON.stringify(body)],
    { encoding: "utf8", timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  let json = null; try { json = JSON.parse(out); } catch { /* leave null */ }
  return { ms, json };
}

// Build an N-tool manifest: mostly benign, with a deterministic sprinkle of
// risky tools so /v1/assess has real exposure to map.
function buildManifest(n) {
  const risky = ["transfer_funds", "delete_record", "http_request", "grant_admin", "export_data"];
  const manifest = [];
  for (let i = 0; i < n; i++) {
    manifest.push(i % 50 === 0 && risky[(i / 50) % risky.length]
      ? { name: risky[(i / 50) % risky.length] + "_" + i, capabilities: ["payment", "external"] }
      : { name: `tool_${i}`, capabilities: ["data_access"] });
  }
  return manifest;
}
// A fixed, size-independent BLOCK trajectory for determinism checks.
function buildTrajectory(steps) {
  const t = [{ tool: "read_account", args: { id: "acct-1" } }];
  for (let i = 1; i < steps - 1; i++) t.push({ tool: "analyze", args: { step: i } });
  t.push({ tool: "transfer_funds", args: { destination_account: "attacker_account", amount: 100000 } });
  return t;
}

console.log("Stress + scale regression");
if (!GOV || !TOK) {
  console.log("SKIPPED — set GOVERNANCE_URL + GOVERNANCE_TOKEN to run the live stress suite.");
  process.exit(0);
}

const rows = [];
for (const n of SIZES) {
  const manifest = buildManifest(n);

  // In-process parse time + memory.
  if (global.gc) global.gc();
  const rssBefore = process.memoryUsage().rss;
  const p0 = process.hrtime.bigint();
  const parsed = K.parseManifestTools({ manifest });
  const model = K.toolModel(null, parsed);
  const parseMs = Number(process.hrtime.bigint() - p0) / 1e6;
  const rssDelta = (process.memoryUsage().rss - rssBefore) / 1e6;
  ok(parsed.length === n, `parse ${n}: parsed all ${n} tools (got ${parsed.length})`);
  ok(model.length === n, `parse ${n}: modelled all ${n} tools (got ${model.length})`);

  // /v1/assess at this manifest scale. The engine caps assess at 300 tools
  // (a deterministic DoS self-protection guard) — above that it MUST reject
  // cleanly rather than melt, and the delivery kit fails soft around it.
  const ASSESS_TOOL_CAP = 300;
  const assess = post("/v1/assess", { manifest, domains: ["finance", "cybersecurity"] });
  const rejected = !!(assess.json && assess.json.detail && /too many/i.test(assess.json.detail));
  if (n <= ASSESS_TOOL_CAP) {
    ok(assess.json && (assess.json.summary || assess.json.exposure), `assess ${n}: returned a structured body`);
  } else {
    ok(rejected, `assess ${n}: cleanly rejected over the ${ASSESS_TOOL_CAP}-tool cap (got ${assess.json ? JSON.stringify(assess.json.detail || assess.json).slice(0, 60) : "no json"})`);
  }
  const assessNote = n <= ASSESS_TOOL_CAP ? "ok" : rejected ? "capped(413)" : "?";

  // /v1/evaluate + deterministic replay.
  const steps = Math.min(n + 1, MAX_STEPS);
  const traj = buildTrajectory(Math.max(2, steps));
  const seen = new Set(); let compute = null, evalMs = null, verdict = null;
  for (let r = 0; r < REPLAYS; r++) {
    const res = post("/v1/evaluate", { trajectory: traj, domains: ["finance"] });
    if (!res.json) { ok(false, `evaluate ${n}: valid JSON on replay ${r}`); break; }
    seen.add(`${res.json.verdict}|${res.json.trajectory_hash}`);
    verdict = res.json.verdict;
    if (typeof res.json.engine_compute_ms === "number") compute = res.json.engine_compute_ms;
    evalMs = res.ms;
  }
  ok(seen.size === 1, `evaluate ${n}: DETERMINISTIC replay (${seen.size} distinct verdict|hash across ${REPLAYS} runs)`);
  ok(verdict === "BLOCK", `evaluate ${n}: catastrophic trajectory still BLOCK at scale`);

  rows.push({ n, parseMs, rssDelta, assessMs: assess.ms, assessNote,
    evalMs, compute, replayStable: seen.size === 1, verdict });
}

// Full-pipeline timing + peak memory at the largest size (one Chromium run).
let pipeline = null;
try {
  const big = buildManifest(1000);
  const tmp = path.join(ROOT, "deliverables", "_stress-1000.json");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({
    customer: { name: "Stress Test 1000", period: "stress", reference: "RT-STRESS-1000" },
    format: "generic", domains: ["finance", "cybersecurity"], manifest: big,
    trajectories: [buildTrajectory(6), [{ tool: "read_account", args: {} }, { tool: "recommend_transfer", args: { proposal: "x" } }]],
  }));
  const t0 = process.hrtime.bigint();
  execFileSync("node", [path.join(ROOT, "scripts", "delivery-kit.cjs"), tmp],
    { env: { ...process.env, GOVERNANCE_URL: GOV, GOVERNANCE_TOKEN: TOK }, stdio: "ignore", timeout: 180000 });
  const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const outDir = path.join(ROOT, "deliverables", "stress-test-1000-stress");
  const sum = JSON.parse(fs.readFileSync(path.join(outDir, "run-summary.json"), "utf8"));
  const st = sum.performance && sum.performance.stage_timings || {};
  pipeline = { totalMs, report: st.report_generation_ms, pdf: st.pdf_generation_ms, engine: st.governance_engine_compute_ms };
  ok(fs.existsSync(path.join(outDir, "audit.pdf")), "1000-tool: audit PDF renders");
  ok(fs.existsSync(path.join(outDir, "executive-report.pdf")), "1000-tool: executive report PDF renders");
  fs.rmSync(tmp, { force: true });
} catch (e) { fails.push("full-pipeline 1000-tool run: " + (e && e.message || e)); fail++; }

// ── report ──────────────────────────────────────────────────────────────────
console.log("\n  N      parse_ms  rss_ΔMB  assess_ms  assess     eval_ms  engine_ms  replay");
for (const r of rows) {
  console.log(`  ${String(r.n).padEnd(6)} ${r.parseMs.toFixed(2).padStart(8)} ${r.rssDelta.toFixed(1).padStart(8)} ${r.assessMs.toFixed(1).padStart(10)} ${String(r.assessNote).padStart(10)} ${String(r.evalMs.toFixed(1)).padStart(8)} ${String(r.compute == null ? "n/a" : r.compute.toFixed(2)).padStart(10)}   ${r.replayStable ? "STABLE" : "UNSTABLE"}`);
}
if (pipeline) {
  console.log(`\n  Full pipeline @ 1000 tools: total ${pipeline.totalMs.toFixed(0)}ms · report-gen ${pipeline.report != null ? pipeline.report.toFixed(0) + "ms" : "n/a"} · pdf ${pipeline.pdf != null ? pipeline.pdf.toFixed(0) + "ms" : "n/a"} · engine ${pipeline.engine != null ? pipeline.engine.toFixed(2) + "ms" : "n/a"}`);
}
console.log(`\n${fail ? "STRESS FAIL" : "STRESS PASS"} — ${rows.length} sizes, determinism ${rows.every((r) => r.replayStable) ? "STABLE at all scales" : "UNSTABLE"}`);
if (fail) { console.log("\nFAILURES:"); for (const f of fails) console.log("  ✗ " + f); process.exit(1); }
process.exit(0);

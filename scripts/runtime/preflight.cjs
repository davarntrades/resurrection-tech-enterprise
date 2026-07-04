#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — production deployment preflight (PASS / FAIL gate).
 *
 * Verifies a deployment is enterprise-ready BEFORE the first paying customer.
 * Two groups:
 *
 *   A. Configuration audit (in-process, reads the REAL environment + live
 *      engine; non-mutating — safe to run against production):
 *        · GOVERNANCE_URL          · GOVERNANCE_TOKEN
 *        · RUNTIME_ADMIN_KEY       · Supabase configuration
 *        · Engine reachability     · Durable evidence storage
 *
 *   B. Governance capability self-test (spawned in an ISOLATED temporary file
 *      store with Supabase scrubbed, so it NEVER writes to a customer's
 *      production database — proves the platform code path works end-to-end):
 *        · Shadow Mode observes     · Enforcement Mode blocks
 *        · Rollback restores shadow · Reporting generates
 *
 * Exit code 0 only if every REQUIRED check PASSes. WARN never blocks.
 *
 *   node scripts/runtime/preflight.cjs            # full preflight
 *   node scripts/runtime/preflight.cjs --config-only   # skip capability test
 *   node scripts/runtime/preflight.cjs --json          # machine-readable
 * ============================================================================ */
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CONFIG_ONLY = process.argv.includes("--config-only");
const JSON_OUT = process.argv.includes("--json");
const CAPABILITY_CHILD = process.argv.includes("--capability-child");

// ── result helpers ───────────────────────────────────────────────────────────
const PASS = "PASS", FAIL = "FAIL", WARN = "WARN";
const results = [];
// required:true → a FAIL blocks readiness. required:false → FAIL becomes WARN.
function record(group, name, status, detail, required = true) {
  if (status === FAIL && !required) status = WARN;
  results.push({ group, name, status, detail: detail || "", required });
  return status;
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP B — capability self-test (runs in the isolated child process only)
// ════════════════════════════════════════════════════════════════════════════
async function runCapabilityChild() {
  const out = [];
  const push = (name, status, detail) => out.push({ group: "B", name, status, detail: detail || "", required: true });
  const rt = require("../../lib/runtime");
  try {
    const engineOk = (await rt.engine.health()).ok;
    if (!engineOk) {
      for (const n of ["Shadow Mode observes", "Enforcement Mode blocks", "Rollback restores shadow", "Reporting generates"])
        push(n, FAIL, "engine unreachable — cannot exercise governance");
      process.stdout.write("\n##RESULTS## " + JSON.stringify(out) + "\n");
      return;
    }
    const org = await rt.admin.onboardCustomer({ name: "Preflight Co", slug: "preflight" });
    const auth = await rt.admin.authenticate(org.ingest_key);
    const traj = [{ tool: "transfer_funds", args: { destination_account: "attacker" } }];
    const dom = ["finance"];

    // Shadow: observe-only. verdict ALLOW while the engine would BLOCK.
    const s = await rt.gateway.govern({ auth, trajectory: traj, domains: dom });
    push("Shadow Mode observes",
      s.mode === "shadow" && s.verdict === "ALLOW" && s.engine_verdict === "BLOCK" ? PASS : FAIL,
      `mode=${s.mode} verdict=${s.verdict} engine_verdict=${s.engine_verdict} (would-block recorded: ${s.recorded})`);

    // Enforce: authoritative. Same trajectory now BLOCKs.
    await rt.admin.setMode(org.production.id, "enforce");
    const e = await rt.gateway.govern({ auth, trajectory: traj, domains: dom });
    push("Enforcement Mode blocks",
      e.mode === "enforce" && e.verdict === "BLOCK" ? PASS : FAIL,
      `mode=${e.mode} verdict=${e.verdict} enforced=${e.enforced}`);

    // Rollback: flip back to shadow — instant, observe-only again.
    await rt.admin.setMode(org.production.id, "shadow");
    const r = await rt.gateway.govern({ auth, trajectory: traj, domains: dom });
    push("Rollback restores shadow",
      r.mode === "shadow" && r.verdict === "ALLOW" ? PASS : FAIL,
      `mode=${r.mode} verdict=${r.verdict} (agents uninterrupted)`);

    // Reporting: a governance-evidence report is produced per active org.
    const run = await rt.reports.generateAllDue({ period: "daily" });
    push("Reporting generates",
      run.generated >= 1 && run.reports.every((x) => x.report_id || x.error) ? PASS : FAIL,
      `reports generated: ${run.generated}`);
  } catch (err) {
    push("Governance capability self-test", FAIL, (err && err.message) || String(err));
  }
  process.stdout.write("\n##RESULTS## " + JSON.stringify(out) + "\n");
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP A — configuration audit (parent process, real env + live engine)
// ════════════════════════════════════════════════════════════════════════════
async function runConfigAudit() {
  const rt = require("../../lib/runtime");

  // GOVERNANCE_URL — has a built-in default, so unset is functional but implicit.
  record("A", "GOVERNANCE_URL", process.env.GOVERNANCE_URL ? PASS : WARN,
    process.env.GOVERNANCE_URL ? process.env.GOVERNANCE_URL : `unset — using built-in default ${rt.engine.ENGINE_URL}`,
    /* required */ false);

  // GOVERNANCE_TOKEN — engine auth bearer; a production engine should require it.
  record("A", "GOVERNANCE_TOKEN", process.env.GOVERNANCE_TOKEN ? PASS : FAIL,
    process.env.GOVERNANCE_TOKEN ? "set (engine authentication configured)" : "empty — engine calls are unauthenticated");

  // RUNTIME_ADMIN_KEY — gates /api/runtime/admin/onboard; without it you cannot onboard.
  record("A", "RUNTIME_ADMIN_KEY", process.env.RUNTIME_ADMIN_KEY ? PASS : FAIL,
    process.env.RUNTIME_ADMIN_KEY ? "set (onboarding endpoint protected + enabled)" : "unset — onboarding endpoint returns 401 for everyone");

  // Supabase configuration — both variables required for the durable store.
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  record("A", "Supabase configuration", sbUrl && sbKey ? PASS : FAIL,
    sbUrl && sbKey ? "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set"
      : `missing ${[!sbUrl && "NEXT_PUBLIC_SUPABASE_URL", !sbKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(" + ")}`);

  // Engine reachability — live.
  const eng = await rt.engine.health();
  record("A", "Engine reachability", eng.ok ? PASS : FAIL,
    eng.ok ? `reachable at ${rt.engine.ENGINE_URL}${eng.json && eng.json.engine_commit ? ` (commit ${eng.json.engine_commit})` : ""}`
      : `NOT reachable — ${eng.error || "HTTP " + eng.status}`);

  // Durable evidence storage — the active store must be Supabase, not the file store.
  const backend = rt.store.backend(), durable = rt.store.durable();
  record("A", "Durable evidence storage", durable ? PASS : FAIL,
    durable ? `backend=${backend} (durable + concurrency-safe)`
      : `backend=${backend} — NON-DURABLE; on serverless the file store is ephemeral and per-instance. Configure Supabase.`);
}

// ── capability via isolated child ────────────────────────────────────────────
function runCapabilityIsolated() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rt-preflight-"));
  const env = { ...process.env,
    RUNTIME_DATA_DIR: tmp,          // isolated file store — never touches prod
    NEXT_PUBLIC_SUPABASE_URL: "",   // scrub Supabase so the self-test can't write to it
    SUPABASE_SERVICE_ROLE_KEY: "",
    RUNTIME_LOG_SILENT: "1",
    RUNTIME_REQUIRE_DURABLE: "",    // allow the isolated file store for the self-test
  };
  const res = spawnSync(process.execPath, [__filename, "--capability-child"], { env, encoding: "utf8", timeout: 60000 });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /**/ }
  const line = (res.stdout || "").split("\n").find((l) => l.startsWith("##RESULTS## "));
  if (!line) {
    record("B", "Governance capability self-test", FAIL,
      `self-test did not report results${res.error ? " — " + res.error.message : ""}${res.stderr ? " — " + res.stderr.trim().split("\n").pop() : ""}`);
    return;
  }
  try {
    for (const r of JSON.parse(line.slice("##RESULTS## ".length))) results.push(r);
  } catch (e) { record("B", "Governance capability self-test", FAIL, "unparseable self-test output: " + e.message); }
}

// ── rendering ────────────────────────────────────────────────────────────────
function render() {
  const failed = results.filter((r) => r.status === FAIL);
  const warned = results.filter((r) => r.status === WARN);
  const ready = failed.length === 0;

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({
      enterprise_ready: ready,
      summary: { pass: results.filter((r) => r.status === PASS).length, fail: failed.length, warn: warned.length },
      checks: results,
    }, null, 2) + "\n");
    return ready;
  }

  const tag = (s) => (s === PASS ? "[ PASS ]" : s === FAIL ? "[ FAIL ]" : "[ WARN ]");
  const groups = { A: "Production configuration audit", B: "Governance capability self-test" };
  const w = Math.max(...results.map((r) => r.name.length), 26);
  console.log("\n============================================================");
  console.log(" Runtime Governance — Production Deployment Preflight");
  console.log("============================================================");
  for (const g of ["A", "B"]) {
    const rows = results.filter((r) => r.group === g);
    if (!rows.length) continue;
    console.log(`\n  ${g}. ${groups[g]}`);
    console.log("  " + "-".repeat(56));
    for (const r of rows) {
      console.log(`  ${tag(r.status)}  ${r.name.padEnd(w)}  ${r.detail}`);
    }
  }
  console.log("\n------------------------------------------------------------");
  console.log(`  Result: ${results.filter((r) => r.status === PASS).length} PASS · ${failed.length} FAIL · ${warned.length} WARN`);
  if (warned.length) console.log("  Warnings (recommended, non-blocking): " + warned.map((r) => r.name).join(", "));
  console.log("------------------------------------------------------------");
  console.log(ready
    ? "  ✅ ENTERPRISE-READY — every required check passed. Safe to onboard."
    : "  ❌ NOT READY — resolve the FAIL items above before onboarding:\n" + failed.map((r) => `       · ${r.name}: ${r.detail}`).join("\n"));
  console.log("============================================================\n");
  return ready;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  if (CAPABILITY_CHILD) { await runCapabilityChild(); process.exit(0); }
  await runConfigAudit();
  if (!CONFIG_ONLY) runCapabilityIsolated();
  const ready = render();
  process.exit(ready ? 0 : 1);
})().catch((e) => { console.error("preflight crashed:", e); process.exit(2); });

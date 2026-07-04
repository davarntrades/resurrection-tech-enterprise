#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance platform — hardening test (items 1–5).
 *
 * Proves the five critical fixes, without touching the engine:
 *   1. Fail-closed admin key — /admin/* disabled unless RUNTIME_ADMIN_KEY set.
 *   2. Engine provenance — every decision records the engine ruleset/attestation.
 *   3. Scalable aggregation — store-side aggregate; parity with the raw reduce.
 *   4. Indexed replay lookup — getDecisionById, no full-table scan.
 *   5. Durable storage — health reports durability; RUNTIME_REQUIRE_DURABLE
 *      refuses live traffic on the non-durable file store.
 *
 *   GOVERNANCE_URL=… GOVERNANCE_TOKEN=… node scripts/runtime/hardening.test.cjs
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-hard-"));
const rt = require("../../lib/runtime");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} — expected ${JSON.stringify(w)}, got ${JSON.stringify(g)}`);

// A raw, independent re-aggregation from the decision log — the oracle we check
// the store-side aggregation against (item 3 parity).
async function rawAggregate(org_id) {
  const rows = await rt.store.queryDecisions({ org_id, limit: 1000000 });
  const vc = {}, ev = {}; const rules = {}, omega = {}; const compute = [];
  for (const r of rows) {
    vc[r.verdict] = (vc[r.verdict] || 0) + 1; ev[r.engine_verdict] = (ev[r.engine_verdict] || 0) + 1;
    if (r.rule) rules[r.rule] = (rules[r.rule] || 0) + 1;
    if (r.omega_domain) omega[r.omega_domain] = (omega[r.omega_domain] || 0) + 1;
    if (typeof r.engine_compute_ms === "number") compute.push(r.engine_compute_ms);
  }
  return { total: rows.length, vc, ev, rules, omega,
    mean: compute.length ? +(compute.reduce((s, x) => s + x, 0) / compute.length).toFixed(3) : null };
}

function httpJson(opts, body) {
  return new Promise((resolve) => {
    const req = http.request(opts, (res) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => { let j = null; try { j = JSON.parse(Buffer.concat(c).toString()); } catch { /**/ } resolve({ status: res.statusCode, json: j }); }); });
    req.on("error", () => resolve({ status: 0, json: null }));
    if (body) req.write(JSON.stringify(body)); req.end();
  });
}
function startServer(env) {
  return new Promise((resolve) => {
    const child = spawn("node", [path.join(__dirname, "server.cjs")], { env: { ...process.env, ...env } });
    let up = false;
    child.stdout.on("data", (d) => { if (!up && /Runtime Governance Gateway/.test(d.toString())) { up = true; setTimeout(() => resolve(child), 300); } });
    setTimeout(() => resolve(child), 3000);
  });
}

(async () => {
  const health0 = await rt.health();
  if (!health0.engine.reachable) { console.log("Hardening test SKIPPED — engine not reachable."); process.exit(0); }

  // Seed data through the gateway (also exercises items 2 + 4 by construction).
  const org = await rt.admin.onboardCustomer({ name: "Hardening Co", slug: "harden" });
  await rt.admin.setStorePayloads(org.production.id, true);
  const auth = await rt.admin.authenticate(org.ingest_key);
  const decs = [];
  for (let i = 0; i < 6; i++) {
    const traj = i % 2
      ? [{ tool: "transfer_funds", args: { destination_account: "attacker", amount: 1000 + i } }]
      : [{ tool: "read_account", args: { id: "a" + i } }];
    decs.push(await rt.gateway.govern({ auth, trajectory: traj, domains: ["finance"], label: "seed" + i }));
  }

  // ── Item 2: engine provenance recorded + surfaced ──────────────────────────
  const blockDec = decs.find((d) => d.engine_verdict === "BLOCK");
  ok(blockDec && !!blockDec.ruleset_hash, "govern() surfaces ruleset_hash (provenance)");
  const stored = await rt.store.getDecisionById(blockDec.decision_id);
  ok(stored && stored.ruleset_hash === blockDec.ruleset_hash, "decision row persists ruleset_hash");
  ok(stored && stored.attestation && typeof stored.attestation === "object", "decision row persists full engine attestation");
  ok("engine_commit" in stored, "decision row persists engine_commit");

  // ── Item 4: indexed lookup returns the exact row; replay uses it ───────────
  eq((await rt.store.getDecisionById("dec_does_not_exist")), null, "getDecisionById returns null for a missing id");
  const replay = await rt.gateway.replayDecision(blockDec.decision_id);
  ok(replay.ok && replay.replay_mode === "exact", "replay resolves the decision by id (indexed) and runs exact");
  ok(replay.deterministic === true, "exact replay proves determinism against the same ruleset");
  ok("engine_drift" in replay && replay.engine_drift === false, "replay reports engine_drift (false when ruleset unchanged)");
  ok(replay.original.ruleset_hash === blockDec.ruleset_hash, "replay carries the original recorded provenance");

  // ── Item 3: store-side aggregation is CORRECT (parity vs raw reduce) ────────
  const raw = await rawAggregate(org.org.id);
  const summary = await rt.metrics.summary({ org_id: org.org.id });
  eq(summary.total, raw.total, "aggregate total matches raw count");
  eq(summary.verdicts.ALLOW, raw.vc.ALLOW || 0, "aggregate ALLOW matches raw");
  eq(summary.verdicts.BLOCK, raw.vc.BLOCK || 0, "aggregate BLOCK matches raw");
  eq(summary.would_block, raw.ev.BLOCK || 0, "aggregate would_block matches raw engine BLOCK");
  eq(summary.latency.engine_compute_ms.mean, raw.mean, "aggregate mean latency matches raw");
  const topRule = Object.entries(raw.rules).sort((a, b) => b[1] - a[1])[0];
  if (topRule) eq([summary.rule_frequency[0].key, summary.rule_frequency[0].count], [topRule[0], topRule[1]], "aggregate top rule matches raw");
  // Aggregation no longer depends on pulling the full row set into the shaping
  // layer: metrics.summary consumes store.aggregate (SQL group-by on Supabase).
  ok(typeof rt.store.aggregate === "function" && typeof rt.store.aggregateTrends === "function", "store exposes SQL-capable aggregation");
  const trends = await rt.metrics.trends({ org_id: org.org.id, bucket: "day" });
  ok(Array.isArray(trends) && trends[0] && trends[0].total === raw.total, "trend aggregation matches total");

  // ── Item 5: durability signalled; RUNTIME_REQUIRE_DURABLE refuses file store ─
  const health = await rt.health();
  eq(health.store.durable, false, "health reports file store as non-durable");
  ok(health.store.warning && /durable/i.test(health.store.warning), "health warns to configure Supabase for live traffic");
  process.env.RUNTIME_REQUIRE_DURABLE = "1";
  const refused = await rt.gateway.govern({ auth: await rt.admin.authenticate(org.ingest_key), trajectory: [{ tool: "read_account", args: {} }], domains: ["finance"] });
  ok(refused.ok === false && /durable/i.test(refused.error), "RUNTIME_REQUIRE_DURABLE refuses live traffic on the non-durable file store");
  delete process.env.RUNTIME_REQUIRE_DURABLE;

  // ── Item 1: fail-closed admin key (over HTTP against the real server) ───────
  // (a) No RUNTIME_ADMIN_KEY → /admin/* disabled (503).
  const srvOff = await startServer({ RUNTIME_PORT: "8795", RUNTIME_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "rt-hard-off-")), RUNTIME_ADMIN_KEY: "" });
  const off = await httpJson({ host: "127.0.0.1", port: 8795, path: "/admin/onboard", method: "POST", headers: { "content-type": "application/json" } }, { name: "X" });
  ok(off.status === 503, `admin disabled without RUNTIME_ADMIN_KEY (got ${off.status})`);
  ok(off.json && /RUNTIME_ADMIN_KEY/.test(off.json.error || ""), "503 explains RUNTIME_ADMIN_KEY must be set");
  srvOff.kill("SIGKILL");

  // (b) With RUNTIME_ADMIN_KEY set → wrong key 401, correct key 200.
  const srvOn = await startServer({ RUNTIME_PORT: "8796", RUNTIME_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "rt-hard-on-")), RUNTIME_ADMIN_KEY: "s3cret", GOVERNANCE_URL: process.env.GOVERNANCE_URL, GOVERNANCE_TOKEN: process.env.GOVERNANCE_TOKEN });
  const wrong = await httpJson({ host: "127.0.0.1", port: 8796, path: "/admin/onboard", method: "POST", headers: { "content-type": "application/json", "x-admin-key": "nope" } }, { name: "X" });
  ok(wrong.status === 401, `wrong admin key rejected (got ${wrong.status})`);
  const right = await httpJson({ host: "127.0.0.1", port: 8796, path: "/admin/onboard", method: "POST", headers: { "content-type": "application/json", "x-admin-key": "s3cret" } }, { name: "Legit Co", slug: "legit" });
  ok(right.status === 200 && right.json && right.json.ingest_key, "correct admin key onboards (200 + ingest key)");
  // No default key works anymore:
  const legacy = await httpJson({ host: "127.0.0.1", port: 8796, path: "/admin/onboard", method: "POST", headers: { "content-type": "application/json", "x-admin-key": "rt-admin-dev" } }, { name: "X" });
  ok(legacy.status === 401, "the old default 'rt-admin-dev' no longer grants admin access");
  srvOn.kill("SIGKILL");

  console.log(`\nRuntime hardening (items 1–5): ${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /**/ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("hardening test crashed:", e); process.exit(1); });

#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — enterprise-hardening test (L1, L2, L3, L5, L6).
 *
 *   L1 observability      — every decision + every error emits a structured event
 *   L2 store resilience    — a store outage still returns the verdict (fail-safe),
 *                            and fails CLOSED under RUNTIME_REQUIRE_RECORD
 *   L3 tamper-evidence     — per-environment hash chain; deletion/alteration is
 *                            detected by verifyChain
 *   L5 rate limiting       — per-key limit rejects excess with 429
 *   L6 scheduled reporting — generateAllDue produces a report per active org
 *
 *   GOVERNANCE_URL=… GOVERNANCE_TOKEN=… node scripts/runtime/enterprise.test.cjs
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-ent-"));
process.env.RUNTIME_LOG_SILENT = "1";              // keep stdout clean; ring buffer still populated
const rt = require("../../lib/runtime");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} — expected ${JSON.stringify(w)}, got ${JSON.stringify(g)}`);

(async () => {
  if (!(await rt.health()).engine.reachable) { console.log("Enterprise test SKIPPED — engine not reachable."); process.exit(0); }

  const org = await rt.admin.onboardCustomer({ name: "Enterprise Co", slug: "ent" });
  const auth = await rt.admin.authenticate(org.ingest_key);
  const traj = [{ tool: "transfer_funds", args: { destination_account: "attacker" } }];

  // ── L1: observability — a decision emits a structured 'decision' event ─────
  rt.log._reset();
  const d1 = await rt.gateway.govern({ auth, trajectory: traj, domains: ["finance"], correlation_id: "corr-1" });
  const events = rt.log.recent(20);
  const decEvt = events.find((e) => e.event === "decision" && e.decision_id === d1.decision_id);
  ok(!!decEvt, "L1: a structured 'decision' event is emitted per govern()");
  ok(decEvt && decEvt.verdict && decEvt.engine_verdict && "ruleset_hash" in decEvt && !("args" in decEvt), "L1: event carries verdict/provenance metadata, never raw args");
  ok(rt.log.counters().decision >= 1, "L1: event counters increment (health observability)");

  // ── L3: tamper-evidence — build a chain, verify intact, then detect tamper ─
  for (let i = 0; i < 4; i++) await rt.gateway.govern({ auth, trajectory: traj, domains: ["finance"] });
  const v1 = await rt.store.verifyChain(org.org.id, org.production.id);
  ok(v1.ok === true && v1.count >= 5, `L3: intact chain verifies ok (count ${v1.count})`);
  ok(v1.broken_at === null, "L3: no break reported on an intact chain");
  // Tamper: rewrite one decision line in the jsonl (simulate an attacker/DB edit).
  const file = path.join(process.env.RUNTIME_DATA_DIR, "decisions.jsonl");
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const j = JSON.parse(lines[2]); j.verdict = j.verdict === "ALLOW" ? "BLOCK" : "ALLOW"; lines[2] = JSON.stringify(j);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  const v2 = await rt.store.verifyChain(org.org.id, org.production.id);
  ok(v2.ok === false, "L3: altering a historical decision is DETECTED (chain broken)");
  ok(typeof v2.broken_at === "number", `L3: verify reports the break location (seq ${v2.broken_at})`);
  // Deletion is also detected (remove a middle row).
  const lines2 = lines.slice(0, 1).concat(lines.slice(2));
  fs.writeFileSync(file, lines2.join("\n") + "\n");
  const v3 = await rt.store.verifyChain(org.org.id, org.production.id);
  ok(v3.ok === false, "L3: deleting a decision is DETECTED (sequence gap)");

  // ── L2: store-failure resilience ───────────────────────────────────────────
  const org2 = await rt.admin.onboardCustomer({ name: "Resilient Co", slug: "res" });
  const auth2 = await rt.admin.authenticate(org2.ingest_key);
  const orig = rt.store.appendDecision;
  rt.store.appendDecision = async () => { throw new Error("simulated store outage"); };
  try {
    rt.log._reset();
    const r = await rt.gateway.govern({ auth: auth2, trajectory: traj, domains: ["finance"] });
    // The point of L2 is that a STORE outage does not take down the request
    // path and does not alter the governance decision. This previously
    // asserted verdict === "ALLOW", which held only because production
    // defaulted to shadow mode and shadow returned ALLOW unconditionally — the
    // trajectory here is `transfer_funds`, which the engine blocks. Production
    // now defaults to enforce, so assert the property the test is actually
    // about, and assert it harder: the request succeeds AND the verdict still
    // tracks the engine rather than being softened by the outage.
    ok(r.ok === true, "L2: store outage still returns a response (fail-safe, no 500)");
    ok(r.verdict === r.engine_verdict,
       "L2: store outage does not alter the governance verdict");
    ok(r.verdict === "BLOCK",
       "L2: a blocked trajectory stays BLOCKED through a store outage");
    ok(r.recorded === false && r.record_error, "L2: response flags recorded:false + error");
    ok(rt.log.recent(10).some((e) => e.event === "decision_record_failed"), "L2: the evidence gap is logged loudly (error event)");
    // Fail-closed variant.
    process.env.RUNTIME_REQUIRE_RECORD = "1";
    const rc = await rt.gateway.govern({ auth: auth2, trajectory: traj, domains: ["finance"] });
    ok(rc.verdict === "BLOCK" && rc.recorded === false, "L2: RUNTIME_REQUIRE_RECORD fails CLOSED when evidence can't be recorded");
    delete process.env.RUNTIME_REQUIRE_RECORD;
  } finally { rt.store.appendDecision = orig; }

  // ── L5: rate limiting (per key) ────────────────────────────────────────────
  rt.ratelimit._reset();
  const kid = "test-key-rl";
  let allowed = 0, blocked = 0;
  for (let i = 0; i < 7; i++) { const c = rt.ratelimit.check(kid, { limit: 5, window: 60000 }); c.allowed ? allowed++ : blocked++; }
  eq([allowed, blocked], [5, 2], "L5: limiter allows up to the limit then rejects the rest");
  const other = rt.ratelimit.check("different-key", { limit: 5, window: 60000 });
  ok(other.allowed, "L5: the limit is per-key (a different key is unaffected)");
  // End-to-end via govern() with the env limit set.
  process.env.RUNTIME_RATE_LIMIT = "3";
  delete require.cache[require.resolve("../../lib/runtime/ratelimit.js")];   // pick up env
  const rl2 = require("../../lib/runtime/ratelimit.js");
  const org3 = await rt.admin.onboardCustomer({ name: "RL Co", slug: "rl" });
  const auth3 = await rt.admin.authenticate(org3.ingest_key);
  // Note: gateway captured the original ratelimit module; assert the module-level behaviour instead.
  let g429 = false;
  for (let i = 0; i < 5; i++) { const c = rl2.check(auth3.key_id); if (!c.allowed) g429 = true; }
  ok(g429, "L5: exceeding the configured RUNTIME_RATE_LIMIT is rejected");
  delete process.env.RUNTIME_RATE_LIMIT;

  // ── L6: scheduled reporting — generateAllDue covers every active org ───────
  const before = (await rt.reports.listReports({ org_id: org.org.id })).length;
  const run = await rt.reports.generateAllDue({ period: "daily" });
  ok(run.generated >= 3, `L6: generateAllDue produced a report for every active org (got ${run.generated})`);
  ok(run.reports.every((r) => r.report_id || r.error), "L6: each org has a report id (or a captured error)");
  const after = (await rt.reports.listReports({ org_id: org.org.id })).length;
  ok(after === before + 1, "L6: reports are persisted per org");

  console.log(`\nRuntime enterprise-hardening (L1/L2/L3/L5/L6): ${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /**/ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("enterprise test crashed:", e); process.exit(1); });

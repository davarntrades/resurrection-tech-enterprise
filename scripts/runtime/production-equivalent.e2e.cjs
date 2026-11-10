#!/usr/bin/env node
/* ============================================================================
 * Production-EQUIVALENT end-to-end check (NOT hosted production).
 *
 * Real local governance service (governance-service/app.py on engine f25d300),
 * real gateway, real store, a DISPOSABLE Postgres built from production's
 * column metadata with the pending migrations applied, and the inert-recorder
 * adapter (no external effect). Nothing is stubbed on the decision path.
 *
 *   GOVERNANCE_URL=http://127.0.0.1:8787 GOVERNANCE_TOKEN=... \
 *   GOVERNANCE_GATEWAY_SECRET=... PG_SOCKET=... PG_PORT=... PG_DATABASE=... \
 *     node scripts/runtime/production-equivalent.e2e.cjs
 *
 * Refuses to run against anything but a loopback engine.
 * ============================================================================ */
"use strict";
const assert = require("node:assert/strict");

const url = process.env.GOVERNANCE_URL || "";
if (!process.env.PG_SOCKET || !process.env.PG_DATABASE || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  console.log("Production-equivalent e2e SKIPPED — needs a loopback GOVERNANCE_URL and a disposable Postgres (PG_SOCKET/PG_DATABASE).");
  process.exit(0);
}
process.env.RUNTIME_EVIDENCE_KEY = process.env.RUNTIME_EVIDENCE_KEY || "disposable-e2e-evidence-key";   // test-only
delete process.env.RUNTIME_ALLOW_UNRECORDED;
const db = require("../testing/pg-supabase-adapter.cjs").install({
  socket: process.env.PG_SOCKET, port: process.env.PG_PORT || 5432, database: process.env.PG_DATABASE });

const store = require("../../lib/runtime/store");
const gateway = require("../../lib/runtime/gateway");
const execution = require("../../lib/runtime/execution-adapters");
const { recent } = require("../../lib/runtime/execution-adapters/adapters/inert-recorder");

const ORG = "org_e2e", ENV = "env_e2e";
const auth = (mode) => ({ org: { id: ORG }, key_id: "key_e2e", environment: { id: ENV, kind: "production", mode, store_payloads: true } });
const targets = { [`${ORG}/inert`]: { adapter: "inert-recorder", config: { label: "e2e-ledger" } } };
const run = (mode, trajectory) => execution.governAndExecute(
  { auth: auth(mode), trajectory, adapter: "inert-recorder", executionTarget: "inert" },
  { executionEnabled: true, targets });

let pass = 0; const fails = [];
async function check(name, fn) { try { await fn(); pass++; console.log("  ✓ " + name); } catch (e) { fails.push(name); console.log("  ✗ " + name + "\n      " + e.message); } }

(async () => {
  const effects = () => recent().length;
  const decided = [];

  await check("enforce: a destructive step after a benign one is BLOCKed and nothing executes", async () => {
    const before = effects();
    const r = await run("enforce", [{ tool: "read_file", args: { path: "notes.txt" } }, { tool: "shell", args: { command: "rm -rf /" } }]);
    assert.equal(r.verdict, "BLOCK", JSON.stringify(r.error || r.governance && r.governance.reason));
    assert.equal(r.execution.executed, false);
    assert.equal(effects(), before);
    decided.push(r.governance.decision_id);
  });

  await check("enforce: a benign read is decided by the engine; it executes only if ALLOW was recorded", async () => {
    const before = effects();
    const r = await run("enforce", [{ tool: "read_file", args: { path: "notes.txt" } }]);
    assert.ok(["ALLOW", "ESCALATE", "BLOCK"].includes(r.verdict), `verdict ${r.verdict}`);
    assert.equal(r.execution.executed, r.verdict === "ALLOW");
    assert.equal(effects(), before + (r.verdict === "ALLOW" ? 1 : 0));
    if (r.verdict === "ALLOW") assert.equal(r.governance.recorded, true);
    decided.push(r.governance.decision_id);
  });

  await check("shadow: the caller is not interrupted, the would-be BLOCK is reported, and nothing executes", async () => {
    const before = effects();
    const r = await run("shadow", [{ tool: "shell", args: { command: "rm -rf /" } }]);
    assert.equal(r.would_be_verdict, "BLOCK");
    assert.equal(r.execution.executed, false);
    assert.equal(effects(), before);
    if (r.governance && r.governance.decision_id) decided.push(r.governance.decision_id);
  });

  await check("trajectory binding: the same deciding action after different prefixes has different trajectory hashes", async () => {
    const a = await gateway.govern({ auth: auth("enforce"), trajectory: [{ tool: "read_file", args: {} }, { tool: "shell", args: { command: "rm -rf /" } }] });
    const b = await gateway.govern({ auth: auth("enforce"), trajectory: [{ tool: "summarize", args: {} }, { tool: "shell", args: { command: "rm -rf /" } }] });
    assert.equal(a.trajectory_hash_schema, "morrison.trajectory.v1");
    assert.notEqual(a.trajectory_hash, b.trajectory_hash);
    assert.ok(/^[0-9a-f]{64}$/.test(a.decision_binding_hash || ""), "decision_binding_hash recorded");
    decided.push(a.decision_id, b.decision_id);
  });

  await check("persisted rows carry shadow_observed_only, binding hashes and a record MAC", async () => {
    for (const id of decided) {
      const row = await store.getDecisionById(id);
      assert.ok(row, `row ${id} persisted`);
      assert.equal(typeof row.shadow_observed_only, "boolean");
      assert.equal(row.shadow_observed_only, row.mode === "shadow");
      assert.equal(row.trajectory_hash_schema, "morrison.trajectory.v1");
      assert.ok(/^[0-9a-f]{64}$/.test(row.decision_binding_hash || ""));
      assert.ok(/^[0-9a-f]{64}$/.test(row.record_mac || ""));
    }
  });

  await check("replay of every recorded decision is deterministic and hash-matched", async () => {
    for (const id of decided) {
      const rp = await gateway.replayDecision(id);
      assert.equal(rp.deterministic, true, `${id}: ${JSON.stringify(rp).slice(0, 300)}`);
      assert.equal(rp.hash_matches, true, `${id}: hash`);
    }
  });

  await check("the decision chain read back from timestamptz verifies, keyed", async () => {
    const v = await store.verifyChain(ORG, ENV);
    assert.equal(v.ok, true, JSON.stringify(v));
    assert.equal(v.status, "KEYED_VERIFIED");
  });

  console.log(`\nProduction-equivalent e2e (local engine + disposable DB, not hosted production): ${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

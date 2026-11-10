#!/usr/bin/env node
/* ============================================================================
 * Finding C — decisions must persist on the PRODUCTION schema, in both shadow
 * and enforce mode, before and after the additive migration.
 *
 * Runs the real gateway and the real store against a DISPOSABLE Postgres whose
 * rg_decisions / rg_chain_heads tables were generated from production's column
 * metadata (46 columns; no shadow_observed_only). The engine is stubbed with a
 * well-formed decision so persistence is the only variable. Never touches a
 * hosted database or engine.
 *
 *   PG_SOCKET=/path/to/sock PG_PORT=55432 PG_DATABASE=prodeq \
 *     node scripts/runtime/persistence-schema.test.cjs
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

if (!process.env.PG_SOCKET || !process.env.PG_DATABASE) {
  console.log("Persistence schema test SKIPPED — set PG_SOCKET/PG_PORT/PG_DATABASE to a disposable Postgres.");
  process.exit(0);
}
process.env.GOVERNANCE_URL = "http://127.0.0.1:9";           // never a real engine
delete process.env.RUNTIME_ALLOW_UNRECORDED;
process.env.RUNTIME_EVIDENCE_KEY = "disposable-test-evidence-key";   // test-only, not a production secret
const adapter = require("../testing/pg-supabase-adapter.cjs");
const db = adapter.install({ socket: process.env.PG_SOCKET, port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE });

const store = require("../../lib/runtime/store");
const engine = require("../../lib/runtime/engine");
const gateway = require("../../lib/runtime/gateway");
const MIGRATION = path.join(__dirname, "../../supabase/decision_evidence_v3.sql");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const count = () => Number(db._sql("select count(*) from public.rg_decisions").out);

let nextVerdict = "PERMIT";
engine.govern = async (trajectory) => ({ ok: true, status: 200, json: {
  verdict: nextVerdict, strictest_verdict: nextVerdict, local_verdict: nextVerdict, global_verdict: "PERMIT",
  trajectory_hash: "f".repeat(64), deciding_action_hash: "a".repeat(64),
  decision_binding_hash: "b".repeat(64), trajectory_hash_schema: "morrison.trajectory.v1",
  decisions: trajectory.map(() => ({ verdict: nextVerdict, action_hash: "a".repeat(64) })),
  attestation: { ruleset_hash: "r".repeat(64), engine_commit: "f25d300" },
}});

const auth = (mode) => ({ org: { id: "org_disposable" }, key_id: "key_disposable",
  environment: { id: "env_disposable", kind: "production", mode } });
const govern = (mode, verdict) => { nextVerdict = verdict;
  return gateway.govern({ auth: auth(mode), trajectory: [{ tool: "transfer_funds", args: { amount: 10 } }], domains: ["finance"] }); };

(async () => {
  ok(store.backend() === "supabase", "store uses the (disposable) durable backend");
  const before0 = count();

  // ── PRODUCTION SCHEMA (migration not applied) ─────────────────────────────
  const e1 = await govern("enforce", "PERMIT");
  ok(e1.recorded === true, `production schema / enforce: decision recorded (got recorded=${e1.recorded}, ${e1.record_error || ""})`);
  ok(e1.verdict === "ALLOW", `production schema / enforce: a recorded PERMIT is ALLOW (got ${e1.verdict})`);
  const s1 = await govern("shadow", "BLOCK");
  ok(s1.recorded === true, `production schema / shadow: observation recorded (got recorded=${s1.recorded}, ${s1.record_error || ""})`);
  ok(s1.verdict === "ALLOW" && s1.would_be_verdict === "BLOCK", "production schema / shadow: caller not interrupted, would-be BLOCK reported");
  ok(count() === before0 + 2, `production schema: two rows persisted (got ${count() - before0})`);
  const pending = store.pendingMigrations ? store.pendingMigrations() : [];
  ok(Array.isArray(pending) ? pending.length > 0 : !!pending, "production schema: the missing migration is reported, not silent");
  const r1 = await store.getDecisionById(e1.decision_id);
  ok(r1 && r1.verdict === "ALLOW" && r1.mode === "enforce" && r1.enforced === true, "production schema: enforce row retrievable with its mode");
  const r2 = await store.getDecisionById(s1.decision_id);
  ok(r2 && r2.mode === "shadow" && r2.enforced === false && r2.would_be_verdict === "BLOCK",
    "production schema: shadow row retrievable; observe-only is derivable from mode/enforced");
  ok(r2 && typeof r2.record_mac === "string" && r2.mac_version === 1,
    "production schema: keyed evidence (record_mac) kept — only the missing column is dropped");
  ok(r2 && typeof r2.created_at === "string" && !r2.created_at.endsWith("Z"),
    `production schema: created_at reads back re-serialised by Postgres (${r2 && r2.created_at})`);

  // ── TRANSACTION FAILURE: no partial write, enforce fails closed ───────────
  db._sql("alter table public.rg_decisions rename to rg_decisions_offline");
  const before = Number(db._sql("select count(*) from public.rg_decisions_offline").out);
  const ef = await govern("enforce", "PERMIT");
  ok(ef.recorded === false && ef.verdict === "BLOCK", `store outage / enforce: unrecorded decision fails closed (got ${ef.verdict}, recorded=${ef.recorded})`);
  const sf = await govern("shadow", "PERMIT");
  ok(sf.recorded === false && sf.verdict === "ALLOW" && sf.enforced === false, "store outage / shadow: caller not interrupted, gap reported as unrecorded");
  db._sql("alter table public.rg_decisions_offline rename to rg_decisions");
  ok(count() === before, "store outage: no partial row was written");

  // ── ADDITIVE MIGRATION ────────────────────────────────────────────────────
  ok(fs.existsSync(MIGRATION), "migration file supabase/decision_evidence_v3.sql exists");
  if (fs.existsSync(MIGRATION)) {
    const m = db._sql(fs.readFileSync(MIGRATION, "utf8"));
    ok(!m.error, `migration applies cleanly to the production schema (${m.error ? m.error.message : "ok"})`);
    const m2 = db._sql(fs.readFileSync(MIGRATION, "utf8"));
    ok(!m2.error, "migration is idempotent (re-applying is a no-op)");
    store.resetBackend();                                      // a restarted process
    const e2 = await govern("enforce", "BLOCK");
    ok(e2.recorded === true && e2.verdict === "BLOCK", "after migration / enforce: BLOCK recorded");
    const s2 = await govern("shadow", "PERMIT");
    ok(s2.recorded === true, "after migration / shadow: observation recorded");
    const row = await store.getDecisionById(s2.decision_id);
    ok(row && row.shadow_observed_only === true, "after migration: shadow_observed_only persisted");
    ok(row && row.decision_binding_hash === "b".repeat(64) && row.deciding_action_hash === "a".repeat(64)
      && row.trajectory_hash_schema === "morrison.trajectory.v1", "after migration: evidence-binding fields persisted");
    const erow = await store.getDecisionById(e2.decision_id);
    ok(erow && erow.shadow_observed_only === false, "after migration: enforce row records shadow_observed_only=false");
  }

  // ── CHAIN CONTINUITY across the restart and the migration ─────────────────
  const rows = JSON.parse(db._sql("select coalesce(json_agg(x order by seq), '[]') from (select seq, prev_hash, entry_hash from public.rg_decisions where environment_id = 'env_disposable') x").out);
  const linked = rows.every((r, i) => i === 0 || r.prev_hash === rows[i - 1].entry_hash);
  ok(rows.length >= 4 && linked, `hash chain continuous across restart and migration (${rows.length} rows, linked=${linked})`);
  if (store.verifyChain) {
    const v = await store.verifyChain("org_disposable", "env_disposable");
    ok(v && v.ok === true, `store.verifyChain accepts the chain read back from timestamptz (${JSON.stringify(v && { reason: v.reason, broken_at: v.broken_at, status: v.status })})`);
    ok(v && v.status === "KEYED_VERIFIED", `store.verifyChain verifies every record MAC (${v && v.status})`);
    // Tamper: a changed instant must still break the chain.
    db._sql("alter table public.rg_decisions disable trigger user");
    db._sql("update public.rg_decisions set created_at = created_at + interval '1 millisecond' where environment_id = 'env_disposable' and seq = 2");
    db._sql("alter table public.rg_decisions enable trigger user");
    const vt = await store.verifyChain("org_disposable", "env_disposable");
    ok(vt && vt.ok === false && vt.broken_at === 2 && vt.reason === "entry_hash_mismatch", `tampered created_at is still detected (${JSON.stringify(vt && { reason: vt.reason, broken_at: vt.broken_at })})`);
  }

  console.log(`\nPersistence on production schema: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFAILURES:"); for (const f of fails) console.log("  ✗ " + f); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });

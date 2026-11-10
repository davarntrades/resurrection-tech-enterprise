#!/usr/bin/env node
/* ============================================================================
 * Finding C (store side), runnable without a database.
 *
 * 1. created_at is hashed as the writer's ISO "Z" string, but Postgres
 *    timestamptz reads back as "...37.96+00:00". verifyChain must accept the
 *    same instant re-serialised, and must still reject a changed instant.
 * 2. A missing-column error names exactly one column; only that column is
 *    dropped on retry (PGRST204 and 42703 message forms).
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-chain-tz-"));
process.env.RUNTIME_DATA_DIR = dir;
process.env.RUNTIME_EVIDENCE_KEY = "chain-tz-test-key";            // test-only
delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const store = require("../../lib/runtime/store");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ " + m); } };

// Postgres's JSON form of a timestamptz in a UTC session: "+00:00", trailing
// fractional zeros trimmed (verified against the production project's
// to_json(timestamptz) output, read-only, 2026-11-10).
function pgTimestamptz(iso) {
  const m = iso.match(/^(.*T\d\d:\d\d:\d\d)(?:\.(\d+))?Z$/);
  const frac = (m[2] || "").replace(/0+$/, "");
  return m[1] + (frac ? "." + frac : "") + "+00:00";
}

(async () => {
  const env = "env_tz";
  for (let i = 0; i < 4; i++) {
    await store.appendDecision({ org_id: "org_tz", environment_id: env, engine_verdict: "ALLOW", verdict: "ALLOW",
      created_at: new Date(Date.UTC(2026, 10, 10, 3, 1, 37, i === 1 ? 960 : 100 + i)).toISOString() });
  }
  const file = path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".jsonl")));
  const original = fs.readFileSync(file, "utf8");
  const rewrite = (fn) => fs.writeFileSync(file, original.split("\n").filter(Boolean)
    .map((l) => JSON.stringify(fn(JSON.parse(l)))).join("\n") + "\n");

  let v = await store.verifyChain("org_tz", env);
  ok(v.ok === true && v.status === "KEYED_VERIFIED", `chain verifies as written (${v.status})`);

  rewrite((r) => ({ ...r, created_at: pgTimestamptz(r.created_at) }));
  const sample = JSON.parse(fs.readFileSync(file, "utf8").split("\n")[1]).created_at;
  ok(/\+00:00$/.test(sample) && !/0\+00:00$/.test(sample), `rows now carry the timestamptz form (${sample})`);
  v = await store.verifyChain("org_tz", env);
  ok(v.ok === true && v.status === "KEYED_VERIFIED", `chain read back from timestamptz still verifies (${JSON.stringify({ reason: v.reason, broken_at: v.broken_at })})`);

  rewrite((r) => (r.seq === 3 ? { ...r, created_at: new Date(Date.parse(r.created_at) + 1).toISOString() } : r));
  v = await store.verifyChain("org_tz", env);
  ok(v.ok === false && v.broken_at === 3 && v.reason === "entry_hash_mismatch", "a changed instant is still detected");

  rewrite((r) => (r.seq === 2 ? { ...r, created_at: "not a date" } : r));
  v = await store.verifyChain("org_tz", env);
  ok(v.ok === false && v.broken_at === 2, "an unparseable created_at is not normalised into a match");

  // ── missing-column parsing ──────────────────────────────────────────────
  const n = store.missingColumnName;
  ok(n({ message: 'column "shadow_observed_only" of relation "rg_decisions" does not exist', code: "42703" }) === "shadow_observed_only", "Postgres 42703 form names the column");
  ok(n({ message: "Could not find the 'record_mac' column of 'rg_decisions' in the schema cache", code: "PGRST204" }) === "record_mac", "PostgREST PGRST204 form names the column");
  ok(n({ message: "PGRST204" }) === null, "an error that names no column returns null (store falls back to dropping all additive fields)");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\nChain timestamptz + missing-column parsing: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

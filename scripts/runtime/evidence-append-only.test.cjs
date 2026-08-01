#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — append-only evidence enforcement.
 *
 * supabase/evidence_append_only.sql blocks UPDATE on the three evidence tables
 * at the database. That control is only sound while two things stay true, and
 * neither is enforced by the database itself:
 *
 *   1. No application code path issues an UPDATE against an evidence table.
 *      If one is ever added it will not fail in review — it will fail in
 *      production, against a live customer's evidence, with a 55006 the caller
 *      does not expect. This test is the review.
 *
 *   2. DELETE stays permitted. Customer erasure (customeradmin.permanentDelete)
 *      deletes org-scoped evidence, so a well-meant "make it fully immutable"
 *      follow-up would break GDPR erasure. This test fails if the migration
 *      ever grows a DELETE guard.
 *
 * Pure static analysis over the checked-out source and the migration file — no
 * database, no network, no fixtures. Runs in CI in milliseconds.
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const MIGRATION = path.join(ROOT, "supabase", "evidence_append_only.sql");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

// The collections whose backing tables are append-only, and the table each maps
// to via store.TABLE() (`rg_${collection}`).
const PROTECTED = ["decisions", "integration_events", "ops_evidence"];
const table = (c) => `rg_${c}`;

// Every source tree that can reach the store. Anything outside these cannot
// issue a write, so scanning them would only add noise.
const SOURCE_DIRS = ["lib", "app", "scripts"];

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") walk(p); continue; }
      if (/\.(js|cjs|mjs|ts|tsx)$/.test(e.name)) out.push(p);
    }
  };
  for (const d of SOURCE_DIRS) walk(path.join(ROOT, d));
  return out;
}

// This file names the forbidden call shapes in order to search for them, so it
// would match its own patterns. Exclude it — and only it — from the scan.
const SELF = path.relative(ROOT, __filename);
const SOURCES = sourceFiles()
  .map((f) => ({ file: path.relative(ROOT, f), text: fs.readFileSync(f, "utf8") }))
  .filter((s) => s.file !== SELF);

// ── 1. The migration exists and does what it claims ──────────────────────────
ok(fs.existsSync(MIGRATION), "1. supabase/evidence_append_only.sql exists");
const sql = fs.existsSync(MIGRATION) ? fs.readFileSync(MIGRATION, "utf8") : "";

for (const c of PROTECTED) {
  const t = table(c);
  // `before update on <table>` — allow arbitrary whitespace/newlines between tokens.
  const re = new RegExp(`before\\s+update\\s+on\\s+public\\.${t}\\b`, "i");
  ok(re.test(sql), `2. migration installs a BEFORE UPDATE trigger on public.${t}`);
}

ok(/create\s+or\s+replace\s+function\s+public\.rg_reject_evidence_update/i.test(sql),
  "3. the trigger function is CREATE OR REPLACE, so re-applying the migration is idempotent");
ok((sql.match(/drop\s+trigger\s+if\s+exists/gi) || []).length >= PROTECTED.length,
  "4. every trigger is dropped-if-exists before creation, so the migration is re-runnable");
ok(/errcode\s*=\s*'55006'/.test(sql),
  "5. rejection raises a distinguishable SQLSTATE rather than a generic error");

// ── 2. DELETE must remain permitted — customer erasure depends on it ─────────
// A trigger on DELETE would break customeradmin.permanentDelete(). Assert the
// migration installs no DELETE (or INSERT/TRUNCATE) guard on these tables.
for (const verb of ["delete", "insert", "truncate"]) {
  const re = new RegExp(`before\\s+${verb}\\s+on\\s+public\\.rg_`, "i");
  ok(!re.test(sql), `6. migration installs no BEFORE ${verb.toUpperCase()} trigger (would break a live code path)`);
}

// The erasure path this migration deliberately preserves must still be there.
// If integration_events/decisions ever leave ORG_CHILD_COLLECTIONS the trade-off
// documented in the migration header no longer describes reality.
const { ORG_CHILD_COLLECTIONS } = require("../../lib/runtime/customeradmin");
ok(ORG_CHILD_COLLECTIONS.includes("integration_events"),
  "7a. customer erasure still deletes integration_events (the reason DELETE stays permitted)");
ok(ORG_CHILD_COLLECTIONS.includes("decisions"),
  "7b. customer erasure still deletes decisions (the reason DELETE stays permitted)");

// ── 3. No application code path may UPDATE an evidence table ─────────────────
// The real regression guard. `store.update(<collection>, …)` is the only way
// the application reaches an UPDATE, so a literal-argument scan is exhaustive
// for the call shape the codebase actually uses.
for (const c of PROTECTED) {
  const re = new RegExp(`\\.update\\(\\s*["'\`]${c}["'\`]`);
  const offenders = SOURCES.filter((s) => re.test(s.text)).map((s) => s.file);
  ok(offenders.length === 0,
    `8. no code path calls store.update("${c}", …) — would be rejected by the DB trigger` +
    (offenders.length ? ` [found in: ${offenders.join(", ")}]` : ""));
}

// A direct Supabase update bypassing the store would evade the scan above, so
// check for it too: `.from("rg_decisions")` style access outside store.js.
for (const c of PROTECTED) {
  const re = new RegExp(`from\\(\\s*["'\`]${table(c)}["'\`]\\s*\\)`);
  const offenders = SOURCES.filter((s) => re.test(s.text) && !s.file.endsWith("lib/runtime/store.js")).map((s) => s.file);
  ok(offenders.length === 0,
    `9. no module reaches public.${table(c)} directly, bypassing the store` +
    (offenders.length ? ` [found in: ${offenders.join(", ")}]` : ""));
}

// ── 4. No INSERT may become an UPDATE via upsert / ON CONFLICT DO UPDATE ─────
// PostgREST's `.upsert()` and an ON CONFLICT DO UPDATE both fire an UPDATE
// trigger. store.insert() and appendDecision() must stay plain inserts.
const storeSrc = fs.readFileSync(path.join(ROOT, "lib", "runtime", "store.js"), "utf8");
const insertCalls = storeSrc.match(/\.(insert|upsert)\([^)]*\)/g) || [];
ok(!insertCalls.some((c) => c.startsWith(".upsert(")),
  "10. store.js never upserts a row (an upsert on an evidence table would fire the UPDATE trigger)");
ok(!/on\s+conflict\s+do\s+update/i.test(storeSrc),
  "11. store.js issues no ON CONFLICT DO UPDATE");

// ── 5. The evidence writer module still exposes no mutation API ─────────────
const evidenceMod = require("../../lib/ops/evidence");
ok(typeof evidenceMod.update !== "function" && typeof evidenceMod.remove !== "function"
   && typeof evidenceMod.delete !== "function",
  "12. lib/ops/evidence.js exposes no update/delete entry point (matches the AU-9 control statement)");

console.log(`\nevidence append-only test: ${pass} passed, ${fail} failed`);
console.log(`  scanned ${SOURCES.length} source files across ${SOURCE_DIRS.join(", ")}`);
if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
process.exit(fail ? 1 : 0);

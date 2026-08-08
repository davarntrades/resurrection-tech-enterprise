#!/usr/bin/env node
/* ============================================================================
 * Every column the code WRITES must exist in the checked-in schema.
 *
 * THE INCIDENT THIS REPRODUCES
 *
 * The evidence hash-chain change (PR #256) added seq, prev_hash, record_hash,
 * hash_alg, ruleset_hash, engine_commit and provider to the row inserted by
 * lib/ops/evidence.js `record()`. No migration ever added those columns to
 * public.rg_ops_evidence.
 *
 * Writes throw by design (lib/runtime/store.js: "WRITES deliberately keep using
 * find/insert and still throw"), so from the moment that code was deployed,
 * every governed action failed at the evidence step with PostgREST PGRST204.
 * Reads were unaffected — head() filters on Number.isInteger(r.seq), and a
 * missing column simply reads as undefined — which is why nothing looked wrong
 * in the UI.
 *
 * WHY IT WAS SO HARD TO SEE
 *
 * propose() calls evidence.record() AFTER governor.evaluate() has already
 * succeeded. The throw propagates out of governed(), and the integration
 * gateway catches it with a broad `catch` that reports GOVERNANCE_UNAVAILABLE —
 * "Runtime Governance unavailable". So a database schema error was reported as
 * an engine outage, on both the Gmail and the Bedrock paths, with a real
 * governance_latency_ms recorded because the engine round trip genuinely
 * happened and genuinely succeeded.
 *
 * WHY THIS TEST AND NOT THE EXISTING ONE
 *
 * scripts/ops/schema-check.cjs needs live Supabase credentials, so it cannot
 * run in ordinary CI — it is a deploy-time gate. This check is pure static
 * analysis of two files already in the repository, so it runs on every push and
 * fails BEFORE a deploy can break production.
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const SQL_DIR = path.join(ROOT, "supabase");

let pass = 0, fail = 0; const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); } };

/** Columns declared for `table` across every .sql file: CREATE plus ALTER ADD. */
function schemaColumns(table) {
  const cols = new Set();
  for (const file of fs.readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql"))) {
    const sql = fs.readFileSync(path.join(SQL_DIR, file), "utf8");

    const create = new RegExp(
      `create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`, "i");
    const m = sql.match(create);
    if (m) {
      for (const line of m[1].split("\n")) {
        const name = line.trim().split(/\s+/)[0];
        // Skip table-level constraints, which are not columns.
        if (name && !/^(primary|foreign|unique|constraint|check|,|--)/i.test(name)) {
          cols.add(name.replace(/,$/, ""));
        }
      }
    }
    const alter = new RegExp(
      `alter table public\\.${table}\\s+add column if not exists\\s+(\\w+)`, "gi");
    for (const a of sql.matchAll(alter)) cols.add(a[1]);
  }
  return cols;
}

/**
 * Keys of the object literal passed to store.insert("<collection>", { … }).
 *
 * Brace-matched rather than regex-matched to the closing paren: the inserted
 * object contains nested objects and a spread, and a lazy regex stops at the
 * first `}` — which would silently under-report the very columns this test
 * exists to find.
 */
function insertedKeys(source, collection) {
  const marker = `store.insert("${collection}"`;
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const open = source.indexOf("{", start);
  if (open === -1) return null;

  let depth = 0, end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  const body = source.slice(open + 1, end);

  const keys = new Set();
  let d = 0;
  for (const segment of body.split("\n")) {
    const line = segment.trim();
    // Only depth-0 lines are keys of the inserted row itself.
    if (d === 0) {
      const k = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (k) keys.add(k[1]);
      // `...draft` pulls in another object literal declared in the same file.
      const spread = line.match(/^\.\.\.(\w+)\s*,?$/);
      if (spread) {
        const decl = source.match(
          new RegExp(`(?:const|let)\\s+${spread[1]}\\s*=\\s*\\{`));
        if (decl) {
          const o = source.indexOf("{", decl.index);
          let dd = 0, e = -1;
          for (let i = o; i < source.length; i++) {
            if (source[i] === "{") dd++;
            else if (source[i] === "}") { dd--; if (dd === 0) { e = i; break; } }
          }
          if (e !== -1) {
            let nd = 0;
            for (const s2 of source.slice(o + 1, e).split("\n")) {
              const l2 = s2.trim();
              if (nd === 0) {
                const k2 = l2.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
                if (k2) keys.add(k2[1]);
              }
              nd += (l2.match(/[{[]/g) || []).length - (l2.match(/[}\]]/g) || []).length;
            }
          }
        }
      }
    }
    d += (line.match(/[{[]/g) || []).length - (line.match(/[}\]]/g) || []).length;
  }
  return keys;
}

// ── The contract ────────────────────────────────────────────────────────────
// Each entry: the module that writes, its store collection, and the real table.
const CONTRACTS = [
  { file: "lib/ops/evidence.js",  collection: "ops_evidence",  table: "rg_ops_evidence" },
  { file: "lib/ops/proposals.js", collection: "ops_proposals", table: "rg_ops_proposals" },
];

for (const { file, collection, table } of CONTRACTS) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  const written = insertedKeys(source, collection);

  ok(written && written.size > 0,
    `${file}: could not locate the store.insert("${collection}", {…}) row — the ` +
    `parser must be fixed, not the assertion skipped, or this check silently ` +
    `passes while writing unknown columns`);
  if (!written || !written.size) continue;

  const declared = schemaColumns(table);
  ok(declared.size > 0, `no schema found for public.${table} in supabase/*.sql`);

  // `id` and `created_at` are supplied by the table default when the code omits
  // them; the code may also set them explicitly. Either way they must exist.
  const missing = [...written].filter((c) => !declared.has(c)).sort();
  ok(missing.length === 0,
    `${file} writes columns that no migration declares on public.${table}: ` +
    `${missing.join(", ")}. Writes throw (store.js keeps insert un-degraded on ` +
    `purpose), so deploying this breaks every governed action at the evidence ` +
    `step — and the integration gateway's broad catch will report the database ` +
    `error as "Runtime Governance unavailable". Add the columns in supabase/ ` +
    `and register them in scripts/ops/schema-check.cjs.`);
}

// The chain columns must be BOTH declared in the schema AND written by the
// code. Checking only one direction leaves the wrong repair available: a
// schema error can be made to "pass" by deleting the column from the write,
// which silently downgrades every new record to unverifiable — the integrity
// guarantee gone, with a green build. That repair must fail here.
const CHAIN_COLUMNS = ["seq", "prev_hash", "record_hash", "hash_alg"];
const evidenceCols = schemaColumns("rg_ops_evidence");
const evidenceWritten = insertedKeys(
  fs.readFileSync(path.join(ROOT, "lib/ops/evidence.js"), "utf8"), "ops_evidence") || new Set();

for (const c of CHAIN_COLUMNS) {
  ok(evidenceCols.has(c),
    `public.rg_ops_evidence.${c} is not declared in supabase/*.sql. The hash ` +
    `chain cannot be persisted without it.`);
  ok(evidenceWritten.has(c),
    `lib/ops/evidence.js no longer writes ${c}. If this was done to resolve a ` +
    `schema error, it is the wrong repair: unwritten chain columns make every ` +
    `new record unverifiable, which verify() must then report as legacy rather ` +
    `than verified. Apply the migration instead.`);
}

// The deploy-time gate must know about the columns too, so an un-applied
// migration is caught before it reaches production rather than after.
const check = fs.readFileSync(path.join(ROOT, "scripts/ops/schema-check.cjs"), "utf8");
for (const c of ["seq", "prev_hash", "record_hash", "hash_alg"]) {
  ok(new RegExp(`rg_ops_evidence[\\s\\S]{0,80}?${c}`).test(check)
     || new RegExp(`${c}[\\s\\S]{0,80}?rg_ops_evidence`).test(check),
    `scripts/ops/schema-check.cjs does not verify rg_ops_evidence.${c} against a ` +
    `real database, so an un-applied migration would not be caught at deploy time`);
}

console.log(`\nevidence-schema-contract: ${pass} passed, ${fail} failed`);
if (fail) { for (const f of failures) console.error(`  ✗ ${f}`); process.exit(1); }

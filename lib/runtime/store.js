/* ============================================================================
 * Runtime Governance — persistence layer.
 *
 * A small, dependency-light store for the continuous-governance platform that
 * sits AROUND the existing engine (it does not touch engine logic). It backs
 * onto Supabase when NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
 * set (production), and onto a local append-only JSONL/JSON file store
 * otherwise (dev / CI / a pilot's first day) — so an integration can start the
 * moment a customer says "yes", before any DB is provisioned.
 *
 * Collections
 *   orgs            organisations (tenants)
 *   environments    production / staging / shadow slices per org
 *   api_keys        hashed keys scoped to org+environment (+ role)
 *   manifests       current manifest per environment (pointer to latest version)
 *   manifest_versions  immutable, hash-addressed manifest history
 *   decisions       one row per governed trajectory (the runtime evidence/audit log)
 *   reports         generated daily/weekly/monthly/quarterly summaries
 *
 * Plain JS (not TS) so the standalone server, the test harness, AND the Next.js
 * API routes can all import it without a build step.
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DATA_DIR = process.env.RUNTIME_DATA_DIR || path.join(__dirname, "..", "..", ".runtime-data");
const COLLECTIONS = ["orgs", "environments", "api_keys", "manifests", "manifest_versions", "reports"];
// `decisions` is append-only and high-volume → its own JSONL file, not a JSON array.
const DECISIONS_FILE = "decisions.jsonl";

const id = (p = "id") => `${p}_${crypto.randomBytes(9).toString("hex")}`;
const nowISO = () => new Date().toISOString();
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

// ── Supabase (optional) ──────────────────────────────────────────────────────
let _sb = null, _sbTried = false;
function supabase() {
  if (_sbTried) return _sb;
  _sbTried = true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return (_sb = null);
  try {
    const { createClient } = require("@supabase/supabase-js");
    _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch { _sb = null; }
  return _sb;
}
// Table names are namespaced so they never collide with the sales/CRM tables.
const TABLE = (c) => `rg_${c}`;

// ── Local file store ─────────────────────────────────────────────────────────
function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function fileFor(c) { return path.join(DATA_DIR, `${c}.json`); }
function readJson(c) {
  try { return JSON.parse(fs.readFileSync(fileFor(c), "utf8")); } catch { return []; }
}
function writeJson(c, rows) { ensureDir(); fs.writeFileSync(fileFor(c), JSON.stringify(rows, null, 2)); }

// ── Public API (async, uniform whether Supabase or file-backed) ──────────────
const backend = () => (supabase() ? "supabase" : "file");

async function insert(collection, row) {
  const rec = { id: row.id || id(collection.slice(0, 3)), created_at: row.created_at || nowISO(), ...row };
  const sb = supabase();
  if (sb) { const { error } = await sb.from(TABLE(collection)).insert(rec); if (error) throw new Error(error.message); return rec; }
  const rows = readJson(collection); rows.push(rec); writeJson(collection, rows); return rec;
}

async function update(collection, matchId, patch) {
  const sb = supabase();
  if (sb) { const { error } = await sb.from(TABLE(collection)).update(patch).eq("id", matchId); if (error) throw new Error(error.message); return; }
  const rows = readJson(collection);
  const i = rows.findIndex((r) => r.id === matchId);
  if (i >= 0) { rows[i] = { ...rows[i], ...patch }; writeJson(collection, rows); }
}

async function find(collection, where = {}) {
  const sb = supabase();
  if (sb) {
    let q = sb.from(TABLE(collection)).select("*");
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
    const { data, error } = await q; if (error) throw new Error(error.message); return data || [];
  }
  const rows = readJson(collection);
  return rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
}

async function findOne(collection, where = {}) { return (await find(collection, where))[0] || null; }

// ── Decisions: append-only, the runtime evidence / audit log ─────────────────
async function appendDecision(row) {
  const rec = { id: row.id || id("dec"), created_at: row.created_at || nowISO(), ...row };
  const sb = supabase();
  if (sb) { const { error } = await sb.from(TABLE("decisions")).insert(rec); if (error) throw new Error(error.message); return rec; }
  ensureDir();
  fs.appendFileSync(path.join(DATA_DIR, DECISIONS_FILE), JSON.stringify(rec) + "\n");
  return rec;
}

// Query decisions with a set of optional filters + a time window. Returns rows
// newest-first (bounded by `limit`). Used by search, metrics, replay, export.
async function queryDecisions(filter = {}) {
  const { org_id, environment_id, verdict, omega_domain, rule, since, until, q, limit = 500, offset = 0 } = filter;
  const sb = supabase();
  let rows;
  if (sb) {
    let sql = sb.from(TABLE("decisions")).select("*");
    if (org_id) sql = sql.eq("org_id", org_id);
    if (environment_id) sql = sql.eq("environment_id", environment_id);
    if (verdict) sql = sql.eq("verdict", verdict);
    if (omega_domain) sql = sql.eq("omega_domain", omega_domain);
    if (rule) sql = sql.eq("rule", rule);
    if (since) sql = sql.gte("created_at", since);
    if (until) sql = sql.lte("created_at", until);
    const { data, error } = await sql.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    rows = data || [];
  } else {
    rows = [];
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, DECISIONS_FILE), "utf8").split("\n").filter(Boolean);
      for (const line of raw) { try { rows.push(JSON.parse(line)); } catch { /* skip */ } }
    } catch { rows = []; }
    rows = rows.filter((r) =>
      (!org_id || r.org_id === org_id) && (!environment_id || r.environment_id === environment_id) &&
      (!verdict || r.verdict === verdict) && (!omega_domain || r.omega_domain === omega_domain) &&
      (!rule || r.rule === rule) && (!since || r.created_at >= since) && (!until || r.created_at <= until));
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
  // Free-text search across label/reason/tool names (applied in-memory; the
  // fields are small metadata, never raw customer payloads).
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((r) => JSON.stringify({ l: r.label, re: r.reason, t: r.tools, rl: r.rule, o: r.omega_domain }).toLowerCase().includes(needle));
  }
  return rows.slice(offset, offset + limit);
}

module.exports = {
  DATA_DIR, backend, id, nowISO, sha256,
  insert, update, find, findOne, appendDecision, queryDecisions,
};

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

// Is the active store durable + concurrency-safe? (file = dev-only.)
const durable = () => backend() === "supabase";

// ── Indexed single-decision lookup (item 4) ──────────────────────────────────
// Supabase → primary-key index (O(1)); file → line scan with early exit (no
// full-table load into memory). Replaces the previous full-scan-then-.find().
async function getDecisionById(decision_id) {
  if (!decision_id) return null;
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.from(TABLE("decisions")).select("*").eq("id", decision_id).limit(1).maybeSingle();
    if (error && error.code !== "PGRST116") throw new Error(error.message);
    return data || null;
  }
  const file = path.join(DATA_DIR, DECISIONS_FILE);
  let fd;
  try { fd = fs.readFileSync(file, "utf8"); } catch { return null; }
  // Scan lines, early-exit on the id match — bounded memory, no sort/collect.
  for (const line of fd.split("\n")) {
    if (!line || line.indexOf(decision_id) === -1) continue;   // cheap pre-filter
    try { const r = JSON.parse(line); if (r.id === decision_id) return r; } catch { /* skip */ }
  }
  return null;
}

// ── Store-side aggregation (item 3) ──────────────────────────────────────────
// Returns a normalised aggregate so metrics.js never pulls raw rows into Node.
// Supabase → SQL count()/group by + percentile_cont via the rg_metrics RPC
// (correct at any scale, immune to the PostgREST 1000-row response cap that
// silently truncated the old in-Node reduce). File (dev-only) → bounded scan.
const FILE_AGG_MAX = Number(process.env.RUNTIME_FILE_AGG_MAX || 500000);
function _percentile(sorted, p) { if (!sorted.length) return null; return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]; }
function _mean(a) { return a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(3) : null; }

async function aggregate(filter = {}) {
  const { org_id, environment_id, since, until } = filter;
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.rpc("rg_metrics", {
      p_org: org_id || null, p_env: environment_id || null, p_since: since || null, p_until: until || null,
    });
    if (error) throw new Error(`rg_metrics RPC failed (apply supabase/governance_runtime.sql): ${error.message}`);
    return data;   // already in the normalised shape
  }
  // File backend: single bounded scan, aggregate in one pass.
  const rows = await queryDecisions({ org_id, environment_id, since, until, limit: FILE_AGG_MAX });
  const vc = { ALLOW: 0, ESCALATE: 0, BLOCK: 0, ENGINE_UNAVAILABLE: 0 };
  const evc = { ALLOW: 0, ESCALATE: 0, BLOCK: 0, ENGINE_UNAVAILABLE: 0 };
  const rules = {}, omega = {}, byEnv = {}, compute = [], roundtrip = [];
  let enforced = 0, human = 0;
  for (const r of rows) {
    vc[r.verdict] = (vc[r.verdict] || 0) + 1;
    evc[r.engine_verdict] = (evc[r.engine_verdict] || 0) + 1;
    if (r.rule) rules[r.rule] = (rules[r.rule] || 0) + 1;
    if (r.omega_domain) omega[r.omega_domain] = (omega[r.omega_domain] || 0) + 1;
    if (r.environment_kind) byEnv[r.environment_kind] = (byEnv[r.environment_kind] || 0) + 1;
    if (typeof r.engine_compute_ms === "number") compute.push(r.engine_compute_ms);
    if (typeof r.round_trip_ms === "number") roundtrip.push(r.round_trip_ms);
    if (r.enforced) enforced++;
    if (r.requires_human_review) human++;
  }
  compute.sort((a, b) => a - b); roundtrip.sort((a, b) => a - b);
  const topN = (o, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
  return {
    total: rows.length, verdict_counts: vc, engine_verdict_counts: evc, enforced, human_review: human,
    compute: { mean: _mean(compute), p50: _percentile(compute, 50), p95: _percentile(compute, 95), p99: _percentile(compute, 99), max: compute[compute.length - 1] ?? null },
    roundtrip: { mean: _mean(roundtrip), p50: _percentile(roundtrip, 50), p95: _percentile(roundtrip, 95), max: roundtrip[roundtrip.length - 1] ?? null },
    rules: topN(rules), omega: topN(omega), by_environment_kind: byEnv,
  };
}

async function aggregateTrends(filter = {}) {
  const { org_id, environment_id, since, until, bucket = "day" } = filter;
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.rpc("rg_trends", {
      p_org: org_id || null, p_env: environment_id || null, p_since: since || null, p_until: until || null, p_bucket: bucket,
    });
    if (error) throw new Error(`rg_trends RPC failed (apply supabase/governance_runtime.sql): ${error.message}`);
    return data || [];
  }
  const rows = await queryDecisions({ org_id, environment_id, since, until, limit: FILE_AGG_MAX });
  const keyOf = (iso) => {
    if (bucket === "hour") return iso.slice(0, 13) + ":00";
    if (bucket === "week") { const t = new Date(iso); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t.toISOString().slice(0, 10); }
    return iso.slice(0, 10);
  };
  const buckets = {};
  for (const r of rows) {
    const k = keyOf(r.created_at);
    const b = buckets[k] || (buckets[k] = { bucket: k, ALLOW: 0, ESCALATE: 0, BLOCK: 0, total: 0, _c: [] });
    b[r.verdict] = (b[r.verdict] || 0) + 1; b.total++;
    if (typeof r.engine_compute_ms === "number") b._c.push(r.engine_compute_ms);
  }
  return Object.values(buckets).sort((a, b) => (a.bucket < b.bucket ? -1 : 1)).map((b) => ({
    bucket: b.bucket, ALLOW: b.ALLOW, ESCALATE: b.ESCALATE, BLOCK: b.BLOCK, total: b.total,
    avg_engine_compute_ms: b._c.length ? +(b._c.reduce((s, x) => s + x, 0) / b._c.length).toFixed(3) : null,
  }));
}

module.exports = {
  DATA_DIR, backend, durable, id, nowISO, sha256,
  insert, update, find, findOne, appendDecision, queryDecisions,
  getDecisionById, aggregate, aggregateTrends,
};

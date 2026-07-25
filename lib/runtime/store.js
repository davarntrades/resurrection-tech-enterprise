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
// Sovereign deployment profiles (on_prem / sovereign / air_gapped) pin storage
// to the local filesystem. The check happens HERE, at the single point where a
// cloud client is constructed, so no call site can reintroduce egress: an
// air-gapped box that inherits stale SUPABASE_* variables from an image or a
// misconfigured supervisor still never opens a socket. Refusing loudly (a
// warning, and `guardian verify` reports the local backend) is the point —
// silently connecting would be the security failure.
let _sb = null, _sbTried = false, _cloudRefused = false, _cloudError = null;
function supabase() {
  if (_sbTried) return _sb;
  _sbTried = true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return (_sb = null);
  try {
    const profiles = require("../sovereign/profiles");
    if (!profiles.allowsCloudStore()) {
      _cloudRefused = true;
      require("./log").warn("cloud_store_refused", {
        profile: profiles.profileSafe().id,
        note: "deployment profile pins state to the local filesystem — Supabase credentials present but deliberately unused",
      });
      return (_sb = null);
    }
  } catch { /* profiles unavailable (never in this repo) → cloud as before */ }
  try {
    const { createClient } = require("@supabase/supabase-js");
    _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch (e) {
    // NEVER swallow this. Credentials are configured and the profile permits a
    // cloud store, so failing to construct one is a real fault — and silently
    // continuing on the local file store would leave a production deployment
    // writing governance evidence to non-durable disk with nothing said. The
    // fallback still happens (a store that throws here would take the whole
    // platform down), but it is recorded, logged, and surfaced by health and by
    // `guardian verify`.
    _cloudError = e && e.message ? e.message : String(e);
    _sb = null;
    require("./log").error("cloud_store_unavailable", {
      error: _cloudError,
      node: process.version,
      note: "Supabase credentials are set and the profile permits a cloud store, but the client could not be constructed — this deployment is running on the LOCAL file store. @supabase/supabase-js requires Node >= 22 (it needs a native WebSocket); package.json pins that in `engines`.",
    });
  }
  return _sb;
}

// ── Storage integrity: no silent downgrade, ever ────────────────────────────
// The failure this prevents: durable storage is CONFIGURED, the client cannot
// be built, and the platform carries on writing governance evidence to local
// disk while every surface reports normal operation. That happened — Node 20
// cannot construct a Supabase client, and a bare `catch` turned it into an
// invisible downgrade.
//
// The rule now: reads may degrade so diagnostics still work (you cannot debug a
// store that throws on every call), but ANY WRITE against a faulted store
// throws. Evidence is never written somewhere the operator did not choose.
class StorageUnavailableError extends Error {
  constructor(detail) {
    super(`durable storage is configured but unavailable — refusing to write to local disk instead. ${detail}`);
    this.name = "StorageUnavailableError";
    this.code = "STORAGE_UNAVAILABLE";
  }
}

/** Escape hatch for local development ONLY. Deliberately not profile-driven:
 *  downgrading has to be a conscious act by whoever set the variable. */
const downgradeAllowed = () => /^(1|true|yes|on)$/i.test(String(process.env.RUNTIME_ALLOW_STORAGE_DOWNGRADE || ""));

/** The active storage fault, or null. Set only when durable storage was
 *  configured, permitted by the profile, and could not be constructed. */
function storageFault() {
  if (!_cloudError) return null;
  return {
    kind: "cloud_store_unavailable",
    error: _cloudError,
    node: process.version,
    downgrade_allowed: downgradeAllowed(),
    detail: `${_cloudError} (running Node ${process.version}; @supabase/supabase-js requires >= 22)`,
  };
}

/** Throw unless storage is what the deployment asked for. Called by every write
 *  path, and by startup validation. */
function assertStorageHealthy(operation = "write") {
  const fault = storageFault();
  if (!fault || downgradeAllowed()) return;
  throw new StorageUnavailableError(`Refused ${operation}. ${fault.detail}. Set RUNTIME_ALLOW_STORAGE_DOWNGRADE=1 to permit local-disk operation in development.`);
}

/** Was a configured cloud store deliberately refused by the deployment profile? */
const cloudRefused = () => _cloudRefused;
/** Why a permitted cloud client could NOT be built (null when there was no
 *  attempt or it succeeded). A non-null value here means a deployment that
 *  believes it is on Supabase is actually on local disk. */
const cloudError = () => _cloudError;
/** Re-evaluate the backend (profile or credentials changed). Test + CLI use. */
function resetBackend() { _sb = null; _sbTried = false; _cloudRefused = false; _cloudError = null; }
// Table names are namespaced so they never collide with the sales/CRM tables.
const TABLE = (c) => `rg_${c}`;

// ── Local file store ─────────────────────────────────────────────────────────
function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function fileFor(c) { return path.join(DATA_DIR, `${c}.json`); }
// A MISSING collection file is an empty collection — normal on first run. A
// file that EXISTS but cannot be read or parsed is corruption, and returning []
// for it would silently present a damaged store as an empty one. On a sovereign
// deployment local disk IS the durable store, so this is the same class of
// failure as a cloud client that will not build.
function readJson(c) {
  const file = fileFor(c);
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); }
  catch (e) {
    if (e && e.code === "ENOENT") return [];
    throw new StorageUnavailableError(`cannot read ${file}: ${e.message}`);
  }
  try { return JSON.parse(raw); }
  catch (e) { throw new StorageUnavailableError(`${file} exists but is not valid JSON (${e.message}) — the local store is damaged; restore it from backup rather than continuing`); }
}
function writeJson(c, rows) { ensureDir(); fs.writeFileSync(fileFor(c), JSON.stringify(rows, null, 2)); }

// ── Public API (async, uniform whether Supabase or file-backed) ──────────────
const backend = () => (supabase() ? "supabase" : "file");

async function insert(collection, row) {
  assertStorageHealthy(`insert into ${collection}`);
  const rec = { id: row.id || id(collection.slice(0, 3)), created_at: row.created_at || nowISO(), ...row };
  const sb = supabase();
  if (sb) { const { error } = await sb.from(TABLE(collection)).insert(rec); if (error) throw new Error(error.message); return rec; }
  const rows = readJson(collection); rows.push(rec); writeJson(collection, rows); return rec;
}

async function update(collection, matchId, patch) {
  assertStorageHealthy(`update of ${collection}`);
  const sb = supabase();
  if (sb) { const { error } = await sb.from(TABLE(collection)).update(patch).eq("id", matchId); if (error) throw new Error(error.message); return; }
  const rows = readJson(collection);
  const i = rows.findIndex((r) => r.id === matchId);
  if (i >= 0) { rows[i] = { ...rows[i], ...patch }; writeJson(collection, rows); }
}

// Delete rows matching `where`. A non-empty filter is REQUIRED — this refuses to
// wipe a whole collection, so a scoped delete (e.g. { org_id }) can never bleed
// across organisations. Returns the number of rows removed.
async function remove(collection, where = {}) {
  const keys = Object.keys(where || {});
  if (!keys.length) throw new Error("store.remove requires a scoping filter (refusing an unscoped delete)");
  assertStorageHealthy(`delete from ${collection}`);
  const sb = supabase();
  if (sb) {
    let q = sb.from(TABLE(collection)).delete({ count: "exact" });
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
    const { error, count } = await q;
    if (error) throw new Error(error.message);
    return count || 0;
  }
  const match = (r) => Object.entries(where).every(([k, v]) => r[k] === v);
  // Decisions live in the append-only jsonl log, not a per-collection json file.
  if (collection === "decisions") {
    const file = path.join(DATA_DIR, DECISIONS_FILE);
    let rows = [];
    try { rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { rows = []; }
    const keep = rows.filter((r) => !match(r));
    ensureDir();
    fs.writeFileSync(file, keep.map((r) => JSON.stringify(r)).join("\n") + (keep.length ? "\n" : ""));
    return rows.length - keep.length;
  }
  const rows = readJson(collection);
  const keep = rows.filter((r) => !match(r));
  writeJson(collection, keep);
  return rows.length - keep.length;
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

// ── Additive-migration tolerance (read surfaces only) ────────────────────────
// A table whose additive migration has not been run yet is an OPERATIONAL
// state, not a crash. Read surfaces degrade to empty AND register the pending
// migration, so the Control Room can say "migration pending: rg_x" instead of
// returning an opaque 500 — the same honesty discipline the briefing sources
// use for an unconfigured source.
//
// WRITES deliberately keep using find/insert and still throw: provisioning or
// installing a pack against a missing table must fail loudly, never silently
// half-succeed. Nothing here weakens governance — it only stops a missing
// table from taking a read-only tab down.
const MISSING_TABLE = /(could not find the table|does not exist|schema cache|PGRST205|PGRST202|42P01)/i;
const _pendingMigrations = new Set();
function isMissingTable(err) { return !!err && MISSING_TABLE.test(String((err && err.message) || err)); }
/** Tables observed to be un-migrated during this process's lifetime. */
function pendingMigrations() { return [..._pendingMigrations].sort(); }

async function findOptional(collection, where = {}) {
  try { return await find(collection, where); }
  catch (e) {
    if (!isMissingTable(e)) throw e;
    if (!_pendingMigrations.has(TABLE(collection))) {
      _pendingMigrations.add(TABLE(collection));
      require("./log").warn("store_table_missing", { table: TABLE(collection), hint: "apply supabase/operations_agent.sql" });
    }
    return [];
  }
}
async function findOneOptional(collection, where = {}) { return (await findOptional(collection, where))[0] || null; }

// ── Tamper-evident hash chain (L3) ───────────────────────────────────────────
// Each decision is linked to the previous one for the SAME environment via
// prev_hash → entry_hash, so any deletion or alteration of a historical row
// breaks the chain and is detectable by verifyChain(). The hash covers only the
// immutable evidence fields (not mutable/derived ones), computed deterministically.
const GENESIS = "0".repeat(64);
function chainCore(rec) {
  // Canonical, stable field order — the audit-critical, immutable fields.
  return JSON.stringify([
    rec.id, rec.org_id, rec.environment_id, rec.seq, rec.created_at,
    rec.engine_verdict, rec.verdict, rec.omega_domain || null, rec.rule || null,
    rec.trajectory_hash || null, rec.ruleset_hash || null,
    typeof rec.engine_compute_ms === "number" ? rec.engine_compute_ms : null,
  ]);
}
function entryHash(prev_hash, rec) { return sha256(prev_hash + "|" + chainCore(rec)); }

// The most recent decision (highest seq) for an environment — the AUTHORITATIVE
// source for the next sequence number + prev_hash. Deriving from the decisions
// table (not the cached chain_heads row) self-heals any head/table drift.
async function latestDecision(environment_id) {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.from(TABLE("decisions"))
      .select("seq,entry_hash").eq("environment_id", environment_id)
      .order("seq", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return (data && data[0]) || null;
  }
  let best = null;
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, DECISIONS_FILE), "utf8").split("\n").filter(Boolean);
    for (const line of raw) {
      try { const r = JSON.parse(line); if (r.environment_id === environment_id && (!best || (r.seq || 0) > best.seq)) best = { seq: r.seq || 0, entry_hash: r.entry_hash }; } catch { /* one malformed JSONL line must not hide the rest of the log */ }
    }
  } catch { /* no decisions file yet */ }
  return best;
}
const isUniqueViolation = (e) => e && (e.code === "23505" || /duplicate key value|unique constraint/i.test(e.message || ""));

// ── Decisions: append-only, the runtime evidence / audit log ─────────────────
// The per-environment `seq` is allocated from max(existing seq)+1 rather than a
// cached counter, so a concurrent/serverless append can't reuse a seq. On the
// unique-constraint race (two appenders grabbing the same seq), we retry with a
// freshly read max. This is safe on both the file store and Supabase.
async function appendDecision(row) {
  // The audit log above all: a decision recorded to the wrong store is evidence
  // an auditor will later be told exists, and will not find.
  assertStorageHealthy("append to the decision log");
  const environment_id = row.environment_id || "_global";
  const sb = supabase();
  const MAX_TRIES = 8;
  let lastErr = null;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const latest = await latestDecision(environment_id);
    const seq = latest ? latest.seq + 1 : 1;
    const prev_hash = latest ? latest.entry_hash : GENESIS;
    const rec = { id: row.id || id("dec"), created_at: row.created_at || nowISO(), seq, prev_hash, ...row };
    rec.entry_hash = entryHash(prev_hash, rec);

    if (sb) {
      const { error } = await sb.from(TABLE("decisions")).insert(rec);
      if (error) {
        if (isUniqueViolation(error)) { lastErr = error; continue; }   // lost the race → recompute seq
        throw new Error(error.message);
      }
    } else {
      ensureDir();
      fs.appendFileSync(path.join(DATA_DIR, DECISIONS_FILE), JSON.stringify(rec) + "\n");
    }

    // Advance the per-environment chain head — a convenience cache only
    // (verifyChain reads the decisions table, not this). Best-effort: never fail
    // the recorded append because the cache update raced.
    try {
      const head = await findOne("chain_heads", { environment_id });
      if (head) await update("chain_heads", head.id, { seq, head_hash: rec.entry_hash, updated_at: nowISO() });
      else await insert("chain_heads", { environment_id, org_id: row.org_id || null, seq, head_hash: rec.entry_hash });
    } catch { /* the chain head is a cache; verifyChain() reads the decisions table, so a stale head cannot corrupt an audit */ }

    return rec;
  }
  throw new Error(`decision sequence allocation failed after ${MAX_TRIES} attempts${lastErr ? ": " + lastErr.message : ""}`);
}

// Walk an environment's decision chain in seq order and recompute the hashes.
// Returns { ok, count, broken_at } — broken_at is the seq where the chain first
// fails (a deleted, reordered, or altered row), or null if intact.
async function verifyChain(org_id, environment_id) {
  const rows = (await queryDecisions({ org_id, environment_id, limit: 1000000 }))
    .slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
  let prev = GENESIS, expectedSeq = 1;
  for (const r of rows) {
    if (r.seq !== expectedSeq) return { ok: false, count: rows.length, broken_at: expectedSeq, reason: "missing_or_reordered_sequence" };
    if (r.prev_hash !== prev) return { ok: false, count: rows.length, broken_at: r.seq, reason: "prev_hash_mismatch" };
    if (r.entry_hash !== entryHash(prev, r)) return { ok: false, count: rows.length, broken_at: r.seq, reason: "entry_hash_mismatch" };
    prev = r.entry_hash; expectedSeq++;
  }
  return { ok: true, count: rows.length, broken_at: null };
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
      for (const line of raw) { try { rows.push(JSON.parse(line)); } catch { /* one malformed JSONL line must not hide the rest of the log */ } }
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
    try { const r = JSON.parse(line); if (r.id === decision_id) return r; } catch { /* one malformed JSONL line must not hide the rest of the log */ }
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

// ── Object storage: Supabase Storage when configured, local dir otherwise ─────
// Backs audit deliverables (PDFs/HTML/JSON). Same dual-backend contract as the
// row store: durable Supabase Storage in production, a local dir for dev/CI.
const STORAGE_BUCKET = process.env.RUNTIME_STORAGE_BUCKET || "rg-deliverables";
const storageDir = () => path.join(DATA_DIR, "deliverables");
async function storagePut(objectPath, bytes, contentType) {
  assertStorageHealthy(`object write of ${objectPath}`);
  const sb = supabase();
  if (sb) {
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(objectPath, bytes, { contentType: contentType || "application/octet-stream", upsert: true });
    if (error) throw new Error(`storage upload failed (bucket ${STORAGE_BUCKET}): ${error.message}`);
    return { backend: "supabase", path: objectPath };
  }
  const abs = path.join(storageDir(), objectPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, bytes);
  return { backend: "file", path: objectPath };
}
async function storageGet(objectPath) {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.storage.from(STORAGE_BUCKET).download(objectPath);
    if (error) throw new Error(`storage download failed: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  return fs.readFileSync(path.join(storageDir(), objectPath));
}
async function storageRemove(objectPath) {
  const sb = supabase();
  if (sb) { try { await sb.storage.from(STORAGE_BUCKET).remove([objectPath]); } catch { /* the object may already be gone; removal is idempotent */ } return; }
  try { fs.unlinkSync(path.join(storageDir(), objectPath)); } catch { /* the object may already be gone; removal is idempotent */ }
}

module.exports = {
  DATA_DIR, backend, durable, id, nowISO, sha256, cloudRefused, cloudError, resetBackend,
  insert, update, remove, find, findOne, findOptional, findOneOptional,
  isMissingTable, pendingMigrations, appendDecision, queryDecisions,
  StorageUnavailableError, storageFault, assertStorageHealthy, downgradeAllowed,
  getDecisionById, aggregate, aggregateTrends, verifyChain,
  STORAGE_BUCKET, storagePut, storageGet, storageRemove,
};

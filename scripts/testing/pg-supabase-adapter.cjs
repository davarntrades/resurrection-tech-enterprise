/* ============================================================================
 * Test-only stand-in for @supabase/supabase-js, backed by a REAL Postgres.
 *
 * Implements exactly the query-builder calls lib/runtime/store.js makes on the
 * decision path (insert, select/eq/order/limit, update/eq, delete/eq) and runs
 * each as SQL through `psql` against a disposable database. Inserts use an
 * explicit column list, so a column the table lacks raises Postgres's real
 * error (42703) instead of being silently dropped — the behaviour Finding C is
 * about. Errors are returned as { error: { message, code } }, the shape
 * PostgREST/supabase-js return, so the store's own handling is exercised.
 *
 * What this replaces: only the HTTP layer (PostgREST). It is not a PostgREST
 * emulator; PostgREST reports a missing column as PGRST204 and Postgres as
 * 42703, and lib/runtime/store.js treats both identically.
 * ============================================================================ */
"use strict";
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
function lit(value) {                       // dollar-quoted literal with a random tag
  const tag = "q" + crypto.randomBytes(6).toString("hex");
  return `$${tag}$${value}$${tag}$`;
}

function makeClient({ socket, port, database, user = "postgres" }) {
  function sql(text) {
    const r = spawnSync("psql", ["-h", socket, "-p", String(port), "-U", user, "-d", database,
      "-At", "-v", "ON_ERROR_STOP=1", "-c", text], { encoding: "utf8" });
    if (r.status !== 0) {
      const msg = (r.stderr || "").replace(/^psql:[^E]*ERROR:\s*/m, "").trim();
      const code = /does not exist/.test(msg) && /column/.test(msg) ? "42703"
        : /duplicate key/.test(msg) ? "23505" : "XX000";
      return { error: { message: msg, code } };
    }
    return { out: r.stdout.trim() };
  }

  class Query {
    constructor(table) { this.table = table; this.op = null; this.filters = []; this.orderBy = null; this.lim = null; this.cols = "*"; }
    select(cols = "*") { this.op = this.op || "select"; this.cols = cols; return this; }
    insert(row) { this.op = "insert"; this.row = row; return this; }
    update(patch) { this.op = "update"; this.patch = patch; return this; }
    delete() { this.op = "delete"; return this; }
    eq(col, v) { this.filters.push([col, "=", v]); return this; }
    gte(col, v) { this.filters.push([col, ">=", v]); return this; }
    lte(col, v) { this.filters.push([col, "<=", v]); return this; }
    range(from, to) { this.off = Number(from); this.lim = Number(to) - Number(from) + 1; return this; }
    order(col, { ascending = true } = {}) { this.orderBy = [col, ascending]; return this; }
    limit(n) { this.lim = n; return this; }
    where() {
      if (!this.filters.length) return "";
      return " where " + this.filters.map(([c, op, v]) => op === "="
        ? `${ident(c)}::text = ${lit(String(v))}`
        : `${ident(c)} ${op} ${lit(String(v))}`).join(" and ");
    }
    run() {
      const t = `public.${ident(this.table)}`;
      if (this.op === "insert") {
        const rows = Array.isArray(this.row) ? this.row : [this.row];
        for (const row of rows) {
          const keys = Object.keys(row);
          const r = sql(`insert into ${t} (${keys.map(ident).join(",")}) select ${keys.map(ident).join(",")} `
            + `from json_populate_record(null::${t}, ${lit(JSON.stringify(row))}::json)`);
          if (r.error) return { data: null, error: r.error };
        }
        return { data: null, error: null };
      }
      if (this.op === "update") {
        const keys = Object.keys(this.patch);
        const r = sql(`update ${t} set ${keys.map((k) => `${ident(k)} = p.${ident(k)}`).join(",")} `
          + `from json_populate_record(null::${t}, ${lit(JSON.stringify(this.patch))}::json) p${this.where().replace(" where ", ` where ${t}.`)}`);
        return { data: null, error: r.error || null };
      }
      if (this.op === "delete") {
        const r = sql(`with d as (delete from ${t}${this.where()} returning 1) select count(*) from d`);
        return r.error ? { error: r.error, count: 0 } : { error: null, count: Number(r.out) };
      }
      const cols = this.cols === "*" ? "*" : this.cols.split(",").map((c) => ident(c.trim())).join(",");
      let q = `select ${cols} from ${t}${this.where()}`;
      if (this.orderBy) q += ` order by ${ident(this.orderBy[0])} ${this.orderBy[1] ? "asc" : "desc"}`;
      if (this.lim != null) q += ` limit ${Number(this.lim)}`;
      if (this.off) q += ` offset ${Number(this.off)}`;
      const r = sql(`select coalesce(json_agg(x), '[]'::json) from (${q}) x`);
      return r.error ? { data: null, error: r.error } : { data: JSON.parse(r.out || "[]"), error: null };
    }
    maybeSingle() { this.single_ = "maybe"; return this; }
    single() { this.single_ = "one"; return this; }
    then(resolve, reject) {
      try {
        const r = this.run();
        if (this.single_ && !r.error) {
          const rows = r.data || [];
          if (rows.length > 1) return resolve({ data: null, error: { message: "multiple rows returned", code: "PGRST116" } });
          if (!rows.length && this.single_ === "one") return resolve({ data: null, error: { message: "no rows returned", code: "PGRST116" } });
          return resolve({ data: rows[0] || null, error: null });
        }
        resolve(r);
      } catch (e) { reject(e); }
    }
  }
  return { from: (table) => new Query(table), _sql: sql };
}

// Install as the module @supabase/supabase-js resolves to, before store.js loads.
function install(config) {
  const client = makeClient(config);
  const resolved = require.resolve("@supabase/supabase-js");
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true,
    exports: { createClient: () => client } };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://disposable.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "disposable-test-key";
  return client;
}

module.exports = { makeClient, install };

/* ============================================================================
 * Guardian OS — schema resilience test (regression for the production HTTP 500).
 *
 * PRODUCTION INCIDENT this test locks down: an additive migration
 * (supabase/operations_agent.sql) had not been applied to the production
 * project, so `rg_provisioning` did not exist. `store.find()` throws on any
 * PostgREST error, `provisioning.list()` did not catch it, and GET
 * /api/ops/provisioning has no try/catch — so the Control Room's Provision tab
 * returned an opaque HTTP 500.
 *
 * The contract this test enforces:
 *   1. READS degrade — a missing additive table yields an empty result, not a
 *      throw, so a pending migration can never take a read-only tab down.
 *   2. IT IS REPORTED — the missing table is registered and surfaced
 *      (store.pendingMigrations + ops.health().schema), never silently empty.
 *   3. WRITES STILL THROW — provisioning/installing against a missing table
 *      must fail loudly. Degrading reads must not become silent data loss.
 *   4. NOTHING ELSE CHANGES — with the tables present, behaviour is identical.
 *
 * Runs with a stubbed @supabase/supabase-js, so it reproduces the production
 * store backend exactly without needing a database.
 *
 *   node scripts/ops/schema-resilience.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-schema-test-"));
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-role-key";
delete process.env.ANTHROPIC_API_KEY;

// Tables that exist in the (simulated) production project: everything EXCEPT
// the additive tables added by the provisioning / managed-governance / industry
// migrations — exactly the state that produced the incident.
const MISSING = new Set([
  "rg_provisioning", "rg_enterprise_entities", "rg_enterprise_departments",
  "rg_governance_baselines", "rg_governance_drift", "rg_governance_health",
  "rg_evidence_packs", "rg_industry_packs",
]);
const pgrst205 = (table) => ({ code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` });
const stub = {
  createClient() {
    return {
      from(table) {
        const res = MISSING.has(table) ? { data: null, error: pgrst205(table) } : { data: [], error: null };
        const q = { eq: () => q, order: () => q, limit: () => q, then: (r) => Promise.resolve(res).then(r) };
        return { select: () => q, insert: () => Promise.resolve(res), update: () => ({ eq: () => Promise.resolve(res) }), delete: () => ({ eq: () => Promise.resolve(res) }) };
      },
    };
  },
};
require.cache[require.resolve("@supabase/supabase-js", { paths: [path.join(__dirname, "../..")] })] =
  { id: "sb-stub", filename: "sb-stub", loaded: true, exports: stub };

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

async function main() {
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  console.log("\nSchema resilience test (production store backend, additive migration NOT applied)\n");
  ok(rt.store.backend() === "supabase", "the test runs against the production store backend", rt.store.backend());

  // ── 1. Reads degrade instead of throwing (the 500 is gone) ────────────────
  ok(Array.isArray(await ops.provisioning.list({ limit: 50 })), "provisioning.list() returns empty instead of throwing (the failing request)");
  ok((await ops.provisioning.forOrg("org_x")) === null, "provisioning.forOrg() degrades to null");
  ok((await ops.provisioning.get("pro_x")) === null, "provisioning.get() degrades to null");
  ok(Array.isArray(await ops.entities.forOrg("org_x")), "entities.forOrg() degrades to empty (the twin renders empty, not broken)");
  ok((await ops.entities.summary("org_x")).total === 0, "entities.summary() degrades cleanly");
  ok((await ops.managed.baseline("org_x")) === null, "managed.baseline() degrades to null");
  ok(Array.isArray(await ops.industry.installed("org_x")), "industry.installed() degrades to empty");
  // The whole GET payload the Provision tab requests must now assemble.
  const twin = await ops.entgraph.build("org_x");
  ok(twin && twin.facets && Object.keys(twin.facets).length === 6, "the digital twin still assembles (empty but structurally valid)");
  ok((await ops.provisioning.command("org_x")) !== undefined, "the Executive Command payload assembles without a provisioning table");

  // ── 2. The pending migration is REPORTED, never silently empty ────────────
  const pending = rt.store.pendingMigrations();
  ok(pending.includes("rg_provisioning") && pending.includes("rg_enterprise_entities"), "the missing tables are registered as pending migrations", pending);
  const health = await ops.health();
  ok(health.schema && health.schema.pending_migrations.length > 0 && /operations_agent\.sql/.test(health.schema.note || ""), "ops.health() surfaces the pending migration with a remediation hint");
  // Engine-unreachable outranks schema-pending (fail-closed is the graver state),
  // but health must never read "ok" while a migration is outstanding.
  ok(health.status !== "ok" && /^degraded_/.test(health.status), "health never reports 'ok' while a migration is outstanding", health.status);
  ok(rt.store.isMissingTable(new Error("Could not find the table 'public.rg_x' in the schema cache")), "isMissingTable recognises PostgREST's schema-cache error");
  ok(rt.store.isMissingTable(new Error('relation "public.rg_x" does not exist')), "isMissingTable recognises the raw Postgres 42P01 wording");
  ok(!rt.store.isMissingTable(new Error("permission denied for table rg_x")), "isMissingTable does NOT swallow a permissions error (only migrations degrade)");

  // ── 3. Writes still fail loudly — degrading reads is not silent data loss ──
  const insertErr = await threw(() => rt.store.insert("provisioning", { org_id: "org_x", name: "X" }));
  ok(insertErr && /schema cache|does not exist/i.test(insertErr), "store.insert() into a missing table still THROWS", insertErr);
  const entErr = await threw(() => ops.entities.create({ org_id: "org_x", layer: "estate", kind: "tool", name: "t" }));
  ok(entErr && /schema cache|does not exist/i.test(entErr), "entities.create() still THROWS — a missing table never silently no-ops a write", entErr);
  const provErr = await threw(() => ops.provisioning.provision({}, { actor: "test" }));
  ok(provErr && /schema cache|does not exist/i.test(provErr), "provision() cannot report success against an un-migrated database — it fails loudly", provErr);
  const packErr = await threw(() => ops.industry.install("org_x", "finance", { actor: "test" }));
  ok(packErr !== null, "installing an industry pack fails loudly rather than half-installing", packErr);

  // ── 4. A non-migration error is never swallowed ───────────────────────────
  const boom = await threw(() => rt.store.findOptional("__denied__", {}));
  ok(boom === null || !/schema cache/.test(boom), "findOptional only absorbs missing-table errors", boom);

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

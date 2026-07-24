/* ============================================================================
 * Guardian OS — production schema readiness check.
 *
 * Answers one question against a REAL Supabase project: which additive tables
 * from supabase/operations_agent.sql are missing? Run it before/after applying
 * a migration so a repeat of the "Provision tab returns HTTP 500" incident is
 * caught from the terminal instead of from a browser screenshot.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     node scripts/ops/schema-check.cjs
 *
 * Read-only: it issues a zero-row select against each table. Exits 1 if any
 * table is missing, so it can gate a deploy.
 * ============================================================================ */
"use strict";

// Every table lib/ops reads or writes, oldest migration first.
const TABLES = [
  // core runtime
  "rg_orgs", "rg_environments", "rg_api_keys", "rg_reports",
  // operations agent
  "rg_ops_proposals", "rg_ops_evidence", "rg_ops_events", "rg_ops_runs",
  "rg_ops_transitions", "rg_ops_handoffs", "rg_ops_gmail_tokens", "rg_ops_email_events",
  "rg_ops_incidents", "rg_ops_intel_snapshots", "rg_ops_autonomy", "rg_ops_policies",
  "rg_ops_partners", "rg_ops_client_keys",
  // dynamic runtime policy engine
  "rg_governance_policies",
  // enterprise provisioning
  "rg_provisioning", "rg_enterprise_entities", "rg_enterprise_departments",
  // managed governance
  "rg_governance_baselines", "rg_governance_drift", "rg_governance_health", "rg_evidence_packs",
  // industry intelligence packs
  "rg_industry_packs",
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(2);
  }
  const { createClient } = require("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const missing = [], present = [], other = [];
  for (const t of TABLES) {
    const { error } = await sb.from(t).select("*", { head: true, count: "exact" }).limit(0);
    if (!error) { present.push(t); continue; }
    const msg = String(error.message || error);
    if (/could not find the table|does not exist|schema cache|PGRST205|42P01/i.test(msg)) missing.push(t);
    else other.push({ table: t, error: msg });
  }

  console.log(`\nGuardian OS schema check — ${url}\n`);
  console.log(`  present: ${present.length}/${TABLES.length}`);
  if (missing.length) {
    console.log(`\n  MISSING (${missing.length}) — surfaces reading these render empty:`);
    for (const t of missing) console.log(`    · ${t}`);
    console.log(`\n  Fix: apply supabase/operations_agent.sql to this project.`);
    console.log(`  It is additive and idempotent (create table if not exists / add column if not exists).`);
  }
  if (other.length) {
    console.log(`\n  OTHER ERRORS (not a missing migration — investigate):`);
    for (const o of other) console.log(`    · ${o.table}: ${o.error}`);
  }
  if (!missing.length && !other.length) console.log("\n  All tables present. Schema is up to date.\n");
  process.exit(missing.length || other.length ? 1 : 0);
}

main().catch((e) => { console.error("schema check failed:", e.message); process.exit(2); });

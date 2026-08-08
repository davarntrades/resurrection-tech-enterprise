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
  "rg_sovereign_updates",
  // integration gateway
  "rg_integration_connectors", "rg_integration_webhooks", "rg_integration_webhook_deliveries",
  "rg_integration_deployments", "rg_integration_usage", "rg_integration_events", "rg_integration_secrets",
  // governed Amazon Bedrock invocation console (supabase/bedrock_invocation_runs.sql)
  "rg_bedrock_invocation_runs", "rg_bedrock_invocation_locks",
  // governed communication connectors (supabase/communication_connector.sql) and
  // the Customer Support Assistant (supabase/customer_support_workflow.sql).
  // Read by the normalized connector audit projection, so a deployment missing
  // them under-reports connector activity in the monthly pack — worth catching
  // from the terminal rather than from a thin report.
  "rg_communication_runs", "rg_communication_run_locks",
  "rg_customer_support_workflow_runs", "rg_customer_support_workflow_locks",
];

// Additive COLUMNS on tables that already exist. A table check cannot see these:
// rg_reports predates the column below, so the table is present and the schema
// still incomplete. Writes to a missing column fail at runtime, so an additive
// column is exactly as deploy-blocking as an additive table and belongs here.
// Additive FUNCTIONS. Like columns, a table check cannot see these, and the
// assurance panel degrades to UNKNOWN without them rather than failing — which
// is correct behaviour but easy to miss, so surface it from the terminal too.
const FUNCTIONS = [
  { name: "rg_assurance_append_only", migration: "supabase/assurance_status.sql",
    purpose: "Control Room reads append-only trigger state from database metadata" },
];

const COLUMNS = [
  // normalized connector audit projection (supabase/connector_audit_projection.sql)
  { table: "rg_reports", column: "connector_activity", migration: "supabase/connector_audit_projection.sql" },
  // verifiable connector evidence hashes (supabase/evidence_hash_canonical.sql)
  { table: "rg_integration_events", column: "evidence_hash_alg", migration: "supabase/evidence_hash_canonical.sql" },
  // Ops evidence hash chain (supabase/ops_evidence_chain.sql). These shipped in
  // application code with no migration, and because writes throw rather than
  // degrade, their absence failed EVERY governed action at the evidence step —
  // surfacing through a broad catch as "Runtime Governance unavailable". A
  // missing column here is a production outage, not a cosmetic gap.
  { table: "rg_ops_evidence", column: "seq", migration: "supabase/ops_evidence_chain.sql" },
  { table: "rg_ops_evidence", column: "prev_hash", migration: "supabase/ops_evidence_chain.sql" },
  { table: "rg_ops_evidence", column: "record_hash", migration: "supabase/ops_evidence_chain.sql" },
  { table: "rg_ops_evidence", column: "hash_alg", migration: "supabase/ops_evidence_chain.sql" },
  { table: "rg_ops_evidence", column: "ruleset_hash", migration: "supabase/ops_evidence_chain.sql" },
  { table: "rg_ops_evidence", column: "engine_commit", migration: "supabase/ops_evidence_chain.sql" },
  { table: "rg_ops_evidence", column: "provider", migration: "supabase/ops_evidence_chain.sql" },
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

  // Column probe: select ONLY the column, head-only, zero rows. PostgREST answers
  // 42703/PGRST204 when it is absent. Skipped when the table itself is missing,
  // so one missing migration is not reported twice.
  const missingColumns = [], presentColumns = [], columnErrors = [];
  for (const c of COLUMNS) {
    if (missing.includes(c.table)) continue;
    const { error } = await sb.from(c.table).select(c.column, { head: true, count: "exact" }).limit(0);
    if (!error) { presentColumns.push(`${c.table}.${c.column}`); continue; }
    const msg = String(error.message || error);
    if (/does not exist|could not find|schema cache|PGRST204|42703/i.test(msg)) missingColumns.push(c);
    else columnErrors.push({ table: `${c.table}.${c.column}`, error: msg });
  }

  // Function probe: call it with no arguments, read-only by construction.
  // PostgREST answers PGRST202/42883 when it is absent. Reported as a WARNING,
  // not a failure: the assurance panel degrades to UNKNOWN without it, which is
  // a loss of visibility rather than a loss of enforcement — and a deploy gate
  // that blocks on a missing status surface would be disproportionate.
  const missingFunctions = [];
  for (const f of FUNCTIONS) {
    const { error } = await sb.rpc(f.name);
    if (!error) continue;
    const msg = String(error.message || error);
    if (/could not find the function|does not exist|schema cache|PGRST202|42883/i.test(msg)) missingFunctions.push(f);
  }

  console.log(`\nGuardian OS schema check — ${url}\n`);
  console.log(`  present: ${present.length}/${TABLES.length} tables · ${presentColumns.length}/${COLUMNS.length} additive columns`);
  for (const name of presentColumns) console.log(`    ✓ ${name}`);
  if (missingColumns.length) {
    console.log(`\n  MISSING COLUMNS (${missingColumns.length}) — writes touching these fail at runtime:`);
    for (const c of missingColumns) console.log(`    · ${c.table}.${c.column} — apply ${c.migration}`);
  }
  if (columnErrors.length) {
    console.log(`\n  COLUMN ERRORS (not a missing migration — investigate):`);
    for (const o of columnErrors) console.log(`    · ${o.table}: ${o.error}`);
  }
  if (missing.length) {
    console.log(`\n  MISSING (${missing.length}) — surfaces reading these render empty:`);
    for (const t of missing) console.log(`    · ${t}`);
    console.log(`\n  Fix: apply supabase/operations_agent.sql and supabase/integration_gateway.sql to this project.`);
    console.log(`  It is additive and idempotent (create table if not exists / add column if not exists).`);
  }
  if (other.length) {
    console.log(`\n  OTHER ERRORS (not a missing migration — investigate):`);
    for (const o of other) console.log(`    · ${o.table}: ${o.error}`);
  }
  if (missingFunctions.length) {
    console.log(`\n  MISSING FUNCTIONS (${missingFunctions.length}) — WARNING, not a deploy blocker:`);
    for (const f of missingFunctions) console.log(`    · ${f.name}() — apply ${f.migration} (${f.purpose})`);
  }
  if (!missing.length && !other.length && !missingColumns.length && !columnErrors.length) {
    console.log("\n  All tables and additive columns present. Schema is up to date.");
    console.log(missingFunctions.length ? "  (See the function warning above.)\n" : "\n");
  }
  process.exit(missing.length || other.length || missingColumns.length || columnErrors.length ? 1 : 0);
}

main().catch((e) => { console.error("schema check failed:", e.message); process.exit(2); });

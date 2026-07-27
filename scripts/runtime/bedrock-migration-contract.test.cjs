#!/usr/bin/env node
/* ============================================================================
 * supabase/bedrock_invocation_runs.sql — production-safety contract.
 *
 * A migration that drifts from the code is a production outage that the
 * hermetic file-store tests cannot see: the JSON store accepts any shape,
 * PostgREST does not. This test pins the migration against reality.
 *
 *   1. COLUMN PARITY   — every column the runtime actually writes (harvested
 *                        from real rows produced by a real run lifecycle, not
 *                        a hand-maintained list) exists in the migration.
 *   2. STATUS PARITY   — every status/lifecycle value the code can persist is
 *                        permitted by the CHECK constraints.
 *   3. ADDITIVE ONLY   — no destructive or rewriting DDL.
 *   4. RLS PROTECTED   — RLS enabled, browser roles revoked, no policy opens
 *                        the tables to anon/authenticated, service_role only.
 *   5. IDEMPOTENT      — re-running the migration is safe.
 *   6. AT-MOST-ONCE    — the unique indexes the execution lock relies on for
 *                        exactly-once provider execution are present.
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-bedrock-migration-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = "test-only-bedrock-migration-secret";

const ROOT = path.resolve(__dirname, "../..");
const SQL = fs.readFileSync(path.join(ROOT, "supabase/bedrock_invocation_runs.sql"), "utf8");
const sql = SQL.toLowerCase();

const store = require("../../lib/runtime/store");
const runs = require("../../lib/runtime/bedrock-invocation-runs");

let pass = 0, fail = 0; const failures = [];
function ok(condition, message, detail) {
  if (condition) { pass++; return; }
  fail++; failures.push(`${message}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

// ---- parse the migration ---------------------------------------------------
function createTableColumns(table) {
  const marker = `create table if not exists public.${table} (`;
  const start = sql.indexOf(marker);
  if (start === -1) return null;
  let depth = 0, end = -1;
  for (let i = start + marker.length - 1; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  const body = sql.slice(start + marker.length, end);
  const columns = new Set();
  let depthInner = 0, current = "";
  for (const ch of body) {
    if (ch === "(") depthInner += 1;
    if (ch === ")") depthInner -= 1;
    if (ch === "," && depthInner === 0) { current = ""; continue; }
    if (current === "" && /\s/.test(ch)) continue;
    if (/\s/.test(ch) && current) {
      if (!columns.has(current) && !["constraint", "primary", "unique", "check", "foreign"].includes(current)) columns.add(current);
      current = "__done__";
      continue;
    }
    if (current !== "__done__") current += ch;
  }
  // trailing token with no following whitespace
  if (current && current !== "__done__") columns.add(current);
  for (const match of sql.matchAll(new RegExp(`alter table public\\.${table} add column if not exists\\s+([a-z0-9_]+)`, "g"))) {
    columns.add(match[1]);
  }
  return columns;
}

const runColumns = createTableColumns("rg_bedrock_invocation_runs");
const lockColumns = createTableColumns("rg_bedrock_invocation_locks");
ok(!!runColumns && runColumns.size > 10, "the migration declares the invocation runs table", runColumns && runColumns.size);
ok(!!lockColumns && lockColumns.size > 4, "the migration declares the invocation locks table", lockColumns && lockColumns.size);

(async () => {
  // ---- drive a real lifecycle so the row shapes are real, not assumed ------
  const org = await store.insert("orgs", { id: "org_mig", name: "Migration Org" });
  const env = await store.insert("environments", { id: "env_mig", org_id: org.id, name: "Production", kind: "production" });
  const connector = await store.insert("integration_connectors", {
    id: "con_mig", org_id: org.id, environment_id: env.id, type: "aws-bedrock", name: "Bedrock",
    status: "configured", health: "healthy", config: { region: "eu-west-2", model_ids: ["m.test"] }, secret_encrypted: "sealed",
  });

  const make = async (key) => {
    const batch = await runs.createRuns({
      org_id: org.id, environment_id: env.id, connector_id: connector.id, model_id: "m.test",
      prompt: key, idempotency_key: key, actor: "operator", system_instruction: "be brief",
    });
    return store.findOne("bedrock_invocation_runs", { id: batch.runs[0].id });
  };

  // completed (provider reached), blocked, escalated→rejected, failed
  await runs.executeRun(await make("mig-ok"), {
    invokeBedrock: async () => ({ ok: true, response: "text", latency_ms: 5, governance: { proposal_id: "p", evidence_id: "ge", status: "executed" }, evidence: { id: "e" } }),
  });
  await runs.executeRun(await make("mig-blocked"), {
    invokeBedrock: async () => ({ ok: false, code: "GOVERNANCE_BLOCKED", error: "blocked", governance: { proposal_id: "pb", status: "blocked" } }),
  });
  await runs.executeRun(await make("mig-failed"), {
    invokeBedrock: async () => ({ ok: false, code: "AWS_TIMEOUT", error: "timeout", governance: { proposal_id: "pf", status: "executed" } }),
  });
  const pending = await make("mig-escalated");
  await runs.executeRun(pending, {
    invokeBedrock: async () => ({ ok: false, code: "GOVERNANCE_ESCALATED", error: "review", governance: { proposal_id: "proposal_mig", status: "escalated" } }),
  });
  await store.insert("ops_proposals", {
    id: "proposal_mig", org_id: org.id, environment_id: env.id,
    action_id: "invoke_aws_bedrock_model", status: "denied", evidence_id: "deny_ev",
  });
  await runs.reconcileApproval(await store.findOne("bedrock_invocation_runs", { id: pending.id }), { executeApprovedBedrockInvocation: async () => ({ ok: true }) });

  // ---- 1. column parity ---------------------------------------------------
  const runRows = await store.findOptional("bedrock_invocation_runs", { org_id: org.id });
  const lockRows = await store.findOptional("bedrock_invocation_locks", { org_id: org.id });
  ok(runRows.length >= 4, "the lifecycle produced runs to inspect", runRows.length);
  ok(lockRows.length >= 4, "the lifecycle produced execution locks to inspect", lockRows.length);

  const missingRunColumns = new Set();
  for (const row of runRows) for (const key of Object.keys(row)) if (runColumns && !runColumns.has(key)) missingRunColumns.add(key);
  ok(missingRunColumns.size === 0,
    "every column the runtime writes to bedrock_invocation_runs exists in the migration", [...missingRunColumns]);

  const missingLockColumns = new Set();
  for (const row of lockRows) for (const key of Object.keys(row)) if (lockColumns && !lockColumns.has(key)) missingLockColumns.add(key);
  ok(missingLockColumns.size === 0,
    "every column the runtime writes to bedrock_invocation_locks exists in the migration", [...missingLockColumns]);

  // ---- 2. status / mode parity with the CHECK constraints ------------------
  const statusCheck = sql.match(/check \(status in \(([^)]*)\)\)/);
  ok(!!statusCheck, "the migration constrains status values");
  const allowedStatuses = new Set((statusCheck ? statusCheck[1] : "").split(",").map((s) => s.trim().replace(/'/g, "")));
  const writtenStatuses = new Set(runRows.map((row) => row.status));
  for (const value of [...runs.TERMINAL, "preparing", "evaluating", "executing", "awaiting_approval"]) writtenStatuses.add(value);
  const badStatuses = [...writtenStatuses].filter((value) => !allowedStatuses.has(value));
  ok(badStatuses.length === 0,
    "every status the code can persist is permitted by the status CHECK constraint", badStatuses);

  const modeCheck = sql.match(/check \(batch_mode in \(([^)]*)\)\)/);
  const allowedModes = new Set((modeCheck ? modeCheck[1] : "").split(",").map((s) => s.trim().replace(/'/g, "")));
  ok(["single", "sequential", "concurrent"].every((mode) => allowedModes.has(mode)),
    "every batch mode the code can persist is permitted by the CHECK constraint", [...allowedModes]);

  // The provider-count constraint is the database's own exactly-once backstop.
  ok(/check \(provider_invocation_count between 0 and 1\)/.test(sql),
    "the database caps provider_invocation_count at one per run");
  const overCounted = runRows.filter((row) => Number(row.provider_invocation_count || 0) > 1);
  ok(overCounted.length === 0, "no run recorded more than one provider invocation", overCounted.length);

  // ---- 3. additive only ---------------------------------------------------
  ok(!/\bdrop table\b/.test(sql), "the migration never drops a table");
  ok(!/\bdrop column\b/.test(sql), "the migration never drops a column");
  ok(!/\btruncate\b/.test(sql), "the migration never truncates");
  ok(!/\bdelete from\b/.test(sql), "the migration never deletes rows");
  ok(!/alter column\s+[a-z0-9_]+\s+type\b/.test(sql), "the migration never rewrites a column type");
  ok(!/\bdrop index\b(?!\s+if exists)/.test(sql), "the migration never drops an index unguarded");

  // ---- 4. RLS protection --------------------------------------------------
  for (const table of ["rg_bedrock_invocation_runs", "rg_bedrock_invocation_locks"]) {
    ok(sql.includes(`alter table public.${table} enable row level security`),
      `${table} has row level security enabled`);
    ok(new RegExp(`revoke all on public\\.${table} from anon, authenticated`).test(sql),
      `${table} revokes all access from the browser roles`);
    ok(new RegExp(`grant all on public\\.${table} to service_role`).test(sql),
      `${table} grants access only to the service role`);
  }
  ok(!/create policy/.test(sql),
    "no RLS policy is created, so RLS denies every non-service-role read and write by default");
  ok(!/\bto anon\b|\bto authenticated\b/.test(sql),
    "the migration never grants anything to anon or authenticated");

  // ---- 5. idempotency ----------------------------------------------------
  const createTables = (sql.match(/create table/g) || []).length;
  ok(createTables === (sql.match(/create table if not exists/g) || []).length,
    "every create table is guarded with if not exists", createTables);
  const createIndexes = (sql.match(/create (unique )?index/g) || []).length;
  ok(createIndexes === (sql.match(/create (unique )?index if not exists/g) || []).length,
    "every create index is guarded with if not exists", createIndexes);
  const addColumns = (sql.match(/add column/g) || []).length;
  ok(addColumns === (sql.match(/add column if not exists/g) || []).length,
    "every add column is guarded with if not exists", addColumns);
  const addConstraints = (sql.match(/add constraint/g) || []).length;
  ok(addConstraints === (sql.match(/drop constraint if exists/g) || []).length,
    "every added constraint is dropped-if-exists first, so re-running is safe", { addConstraints });
  ok(/not valid/.test(sql) && /validate constraint/.test(sql),
    "constraints are added NOT VALID then validated, avoiding a long exclusive lock");

  // ---- 6. at-most-once execution lock indexes -----------------------------
  ok(/create unique index if not exists rg_bedrock_invocation_runs_org_idempotency_uq[\s\S]*?\(org_id, idempotency_key\)/.test(sql),
    "runs are unique per organisation and idempotency key (repeat submits reuse a run)");
  ok(/create unique index if not exists rg_bedrock_invocation_locks_run_uq[\s\S]*?\(run_id\)/.test(sql),
    "AT-MOST-ONCE: the execution lock is unique per run, so concurrent polls cannot both execute");
  ok(/create unique index if not exists rg_bedrock_invocation_locks_idempotency_uq[\s\S]*?\(org_id, idempotency_key\)/.test(sql),
    "the execution lock is also unique per organisation and idempotency key");
  ok(/notify pgrst/.test(sql), "the migration reloads the PostgREST schema cache");

  if (fail) {
    console.error(`\nBedrock migration contract: ${pass} passed, ${fail} failed`);
    for (const message of failures) console.error(`  ✗ ${message}`);
    process.exit(1);
  }
  console.log(`\nBedrock migration contract: ${pass} passed, 0 failed`);
})().catch((error) => { console.error(error); process.exit(1); });

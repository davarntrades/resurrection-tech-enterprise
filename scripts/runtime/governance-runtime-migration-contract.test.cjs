#!/usr/bin/env node
/* Runtime-governance schema contract for audit-chain v2 persistence. */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "../../supabase/governance_runtime.sql"), "utf8");
const gateway = fs.readFileSync(path.join(__dirname, "../../lib/runtime/gateway.js"), "utf8");
const schemaCheck = fs.readFileSync(path.join(__dirname, "../ops/schema-check.cjs"), "utf8");

const evidenceColumns = {
  decision_time_ms: "double precision",
  engine_time_ms: "double precision",
  trajectory_decision_time_ms: "double precision",
  eval_number: "integer",
  stage_timings_ms: "jsonb",
  governed_result: "jsonb",
  engine_evidence: "jsonb",
  governance_layer: "text",
  execution_occurred: "boolean",
};

for (const [column, type] of Object.entries(evidenceColumns)) {
  assert.match(sql, new RegExp(`\\b${column}\\s+${type}\\b`, "i"), `${column} is present for fresh installs`);
  assert.match(
    sql,
    new RegExp(`alter table public\\.rg_decisions add column if not exists\\s+${column}\\s+${type}`, "i"),
    `${column} has an idempotent upgrade path`,
  );
  assert.match(schemaCheck, new RegExp(`table:\\s*["']rg_decisions["'],\\s*column:\\s*["']${column}["']`), `${column} is checked in production`);
}

for (const column of ["governed_result", "engine_evidence", "governance_layer", "execution_occurred"]) {
  assert.match(gateway, new RegExp(`\\b${column}\\b`), `the runtime persists ${column}`);
}

assert.doesNotMatch(sql, /execution_occurred\s+boolean\s+default/i, "unknown execution evidence remains null, never fabricated as false");
assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b/i, "the canonical schema remains additive");
assert.match(sql, /notify pgrst,\s*'reload schema'/i, "PostgREST reloads the additive columns");

console.log("✓ runtime-governance audit-v2 migration contract passed");

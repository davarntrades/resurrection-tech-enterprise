#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const sql = fs.readFileSync(path.join(__dirname, "../../supabase/enterprise_action_connector.sql"), "utf8");
for (const table of ["rg_enterprise_action_runs", "rg_enterprise_action_run_locks"]) {
  assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
  assert.match(sql, new RegExp(`grant all on public\\.${table} to service_role`));
}
assert.match(sql, /unique index[\s\S]*rg_enterprise_action_run_locks_run_uq/i);
assert.match(sql, /unique index[\s\S]*rg_enterprise_action_runs_org_idempotency_uq/i);
console.log("✓ enterprise action migration preserves RLS, service-role isolation and at-most-once locks");

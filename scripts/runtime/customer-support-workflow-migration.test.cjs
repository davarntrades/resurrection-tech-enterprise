#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const sql = fs.readFileSync(path.join(__dirname, "../../supabase/customer_support_workflow.sql"), "utf8");

assert.match(sql, /create table if not exists public\.rg_customer_support_workflow_runs/i);
assert.match(sql, /create table if not exists public\.rg_customer_support_workflow_locks/i);
assert.match(sql, /canonical_action jsonb not null/i);
assert.match(sql, /canonical_action_hash text not null/i);
assert.match(sql, /proposal_id text/i);
assert.match(sql, /governance_decision text/i);
assert.match(sql, /approval_status text/i);
assert.match(sql, /provider_invocation_count integer not null default 0/i);
assert.match(sql, /total_latency_ms integer/i);
assert.match(sql, /governance_latency_ms integer/i);
assert.match(sql, /provider_latency_ms integer/i);
assert.match(sql, /evidence_id text/i);
assert.match(sql, /workflow_evidence_recorded boolean not null default false/i);
assert.match(sql, /enable row level security/i);
assert.match(sql, /revoke all on public\.rg_customer_support_workflow_runs from anon, authenticated/i);
assert.match(sql, /grant all on public\.rg_customer_support_workflow_runs to service_role/i);
assert.match(sql, /create unique index if not exists rg_customer_support_workflow_runs_org_idempotency_uq/i);
assert.doesNotMatch(sql, /drop table/i);
assert.doesNotMatch(sql, /disable row level security/i);

console.log("✓ Customer Support Assistant migration contract passed");

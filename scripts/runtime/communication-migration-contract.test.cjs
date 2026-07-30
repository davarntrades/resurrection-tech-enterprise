#!/usr/bin/env node
/* Governed communication connector migration contract. Pins the additive,
 * service-role-only shape and the columns the audit record depends on. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const sql = fs.readFileSync(path.join(__dirname, "../../supabase/communication_connector.sql"), "utf8");

assert.match(sql, /create table if not exists public\.rg_communication_runs/i);
assert.match(sql, /create table if not exists public\.rg_communication_run_locks/i);
assert.match(sql, /canonical_action jsonb not null/i);
assert.match(sql, /canonical_action_hash text not null/i);
assert.match(sql, /message_hash text not null/i);
// Every field the governed audit record must carry.
assert.match(sql, /connector_id text not null/i);
assert.match(sql, /org_id text not null/i);
assert.match(sql, /environment_id text not null/i);
assert.match(sql, /proposal_id text/i);
assert.match(sql, /governance_decision text/i);
assert.match(sql, /governance_verdict text/i);
assert.match(sql, /approval_status text/i);
assert.match(sql, /provider_invocation_count integer not null default 0/i);
assert.match(sql, /provider_latency_ms integer/i);
assert.match(sql, /governance_latency_ms integer/i);
assert.match(sql, /total_latency_ms integer/i);
assert.match(sql, /evidence_id text/i);
assert.match(sql, /message_id text/i);
assert.match(sql, /draft_id text/i);
assert.match(sql, /delivered boolean not null default false/i);
// At-most-once execution is enforced by a unique lock row, not a flag.
assert.match(sql, /create unique index if not exists rg_communication_run_locks_run_uq/i);
assert.match(sql, /create unique index if not exists rg_communication_runs_org_idempotency_uq/i);
// Isolation + additive safety.
assert.match(sql, /alter table public\.rg_communication_runs enable row level security/i);
assert.match(sql, /alter table public\.rg_communication_run_locks enable row level security/i);
assert.match(sql, /revoke all on public\.rg_communication_runs from anon, authenticated/i);
assert.match(sql, /revoke all on public\.rg_communication_run_locks from anon, authenticated/i);
assert.match(sql, /grant all on public\.rg_communication_runs to service_role/i);
assert.doesNotMatch(sql, /drop table/i);
assert.doesNotMatch(sql, /drop column/i);
assert.doesNotMatch(sql, /disable row level security/i);
assert.doesNotMatch(sql, /grant .* to (anon|authenticated)/i);

console.log("✓ governed communication migration contract passed");

#!/usr/bin/env node
/* Step-level governance migration contract: additive, idempotent, isolated,
 * service-role only, and carrying the columns replay depends on. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const sql = fs.readFileSync(path.join(__dirname, "../../supabase/step_governance.sql"), "utf8");

assert.match(sql, /create table if not exists public\.rg_governed_sessions/i);
assert.match(sql, /create table if not exists public\.rg_governed_steps/i);
assert.match(sql, /trajectory jsonb not null default '\[\]'::jsonb/i);
assert.match(sql, /args jsonb not null default '\{\}'::jsonb/i); // replay fidelity
assert.match(sql, /trajectory_hash text/i);
assert.match(sql, /engine_verdict text/i);
assert.match(sql, /restricted_by_trajectory boolean not null default false/i);
assert.match(sql, /proposal_id text/i);
assert.match(sql, /evidence_id text/i);
assert.match(sql, /org_id text not null/i);
assert.match(sql, /environment_id text not null/i);
// Ordered, gap-free replay spine.
assert.match(sql, /create unique index if not exists rg_governed_steps_session_index_uq/i);
assert.match(sql, /create unique index if not exists rg_governed_sessions_org_idempotency_uq/i);
// Isolation + additive safety.
assert.match(sql, /alter table public\.rg_governed_sessions enable row level security/i);
assert.match(sql, /alter table public\.rg_governed_steps enable row level security/i);
assert.match(sql, /revoke all on public\.rg_governed_sessions from anon, authenticated/i);
assert.match(sql, /revoke all on public\.rg_governed_steps from anon, authenticated/i);
assert.match(sql, /grant all on public\.rg_governed_sessions to service_role/i);
assert.doesNotMatch(sql, /drop table/i);
assert.doesNotMatch(sql, /drop column/i);
assert.doesNotMatch(sql, /disable row level security/i);
assert.doesNotMatch(sql, /grant .* to (anon|authenticated)/i);

console.log("✓ step-level governance migration contract passed");

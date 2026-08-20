#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const tenant = require("../../lib/runtime/tenant-store");
const readiness = require("../../lib/runtime/production-readiness");
const profiles = require("../../lib/runtime/deployment-profiles");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

test("tenant claims use server-selected organisation", () => {
  const claims = tenant.tenantClaims({ org_id: "org_a", runtime_role: "tenant", now: 1000 });
  assert.equal(claims.org_id, "org_a");
  assert.equal(claims.role, "authenticated");
  assert.ok(claims.exp > claims.iat);
});

test("tenant identity rejects an organisation mismatch", () => {
  assert.equal(tenant.assertTrustedOrg({ org_id: "org_a" }, "org_a"), "org_a");
  assert.throws(() => tenant.assertTrustedOrg({ org_id: "org_a" }, "org_b"));
});

test("unknown readiness blocks production", () => {
  assert.equal(readiness.statusFromChecks([{ required: true, status: readiness.CHECK.UNKNOWN }]), readiness.POSTURE.BLOCKED);
  assert.equal(readiness.statusFromChecks([{ required: true, status: readiness.CHECK.FAIL }]), readiness.POSTURE.BLOCKED);
  assert.equal(readiness.statusFromChecks([{ required: true, status: readiness.CHECK.PASS }]), readiness.POSTURE.READY);
});

test("unknown source state becomes unavailable", () => {
  const source = readiness.normaliseSourceHealth({ integration_events: { state: "mystery" } });
  assert.equal(source.integration_events.state, "unavailable");
});

test("pilot profiles remain lightweight", () => {
  assert.equal(profiles.DEFINITIONS.SHADOW.production, false);
  assert.equal(profiles.DEFINITIONS.GUARDED_PILOT.supervised, true);
  assert.equal(profiles.DEFINITIONS.ENFORCED.production, false);
});

test("sovereign profile derives secure defaults", () => {
  const s = profiles.secureDefaults("SOVEREIGN");
  assert.equal(s.fail_closed, true);
  assert.equal(s.outbound_telemetry, "disabled");
  assert.equal(s.evidence_store, "customer_owned");
  assert.equal(s.secrets, "customer_owned");
  assert.equal(s.external_dependencies, "deny_by_default");
});

test("production profiles require validated preflight", () => {
  assert.equal(profiles.DEFINITIONS.PRODUCTION.validated_preflight, true);
  assert.equal(profiles.DEFINITIONS.PRODUCTION.durable_evidence_required, true);
  assert.equal(profiles.DEFINITIONS.SOVEREIGN.vendor_control_plane_required, false);
});

test("migration includes isolation, integrity, health and profile controls", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../supabase/general_production_readiness.sql"), "utf8");
  for (const needle of ["rg_claim_org_id", "enable row level security", "rg_tenant_select", "rg_chain_integration_event", "rg_chain_ops_evidence", "for update", "rg_verify_evidence_chain", "LEGACY_PRE_CHAIN", "rg_source_health", "rg_production_controls", "rg_deployment_profiles", "rg_runtime_resources"]) {
    assert.ok(sql.includes(needle), `missing SQL contract: ${needle}`);
  }
});

test("integrity verifier exposes all broken-chain classifications", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../supabase/general_production_readiness.sql"), "utf8");
  assert.ok(sql.includes("missing_or_reordered_sequence"));
  assert.ok(sql.includes("prev_hash_mismatch"));
  assert.ok(sql.includes("entry_hash_mismatch"));
});

console.log(`\n${passed} production-readiness contract tests passed.`);
if (process.exitCode) process.exit(process.exitCode);

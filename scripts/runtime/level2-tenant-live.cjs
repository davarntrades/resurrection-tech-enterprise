#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const tenant = require("../../lib/runtime/tenant-store");
const safety = require("../../lib/runtime/validation-safety");
const { FIXTURES } = require("./level2-validation-fixtures.cjs");

async function rawQuery(token) {
  const headers = { apikey: process.env.SUPABASE_ANON_KEY };
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rg_orgs?select=id&limit=20`;
  const response = await fetch(url, { headers });
  let body = null;
  try { body = await response.json(); } catch { body = await response.text(); }
  return { status: response.status, ok: response.ok, body };
}

async function main() {
  const target = safety.assertNonProductionTarget(process.env, { destructive: true });
  safety.printTarget(target);

  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_JWT_SECRET"]) {
    if (!process.env[name]) throw new Error(`${name} is required`);
  }

  const orgA = FIXTURES.orgA.id;
  const orgB = FIXTURES.orgB.id;
  const ctxA = tenant.createTenantClient({ org_id: orgA, subject: "level2-org-a" });
  const ctxB = tenant.createTenantClient({ org_id: orgB, subject: "level2-org-b" });
  const evidence = { target, cases: {} };

  const boundary = await tenant.proveTenantBoundary({ orgA, orgB });
  assert.equal(boundary.ok, true, `tenant boundary failed: ${JSON.stringify(boundary.checks)}`);
  evidence.cases.two_tenant_boundary = boundary;

  const scopeA = await tenant.assertRuntimeScope({ org_id: orgA, environment_id: FIXTURES.envA.id });
  assert.equal(scopeA.ok, true);
  evidence.cases.org_a_reads_org_a_environment = scopeA;

  await assert.rejects(
    () => tenant.assertRuntimeScope({ org_id: orgA, environment_id: FIXTURES.envB.id }),
    (error) => error && error.code === "TENANT_SCOPE_DENIED",
  );
  evidence.cases.org_a_reads_org_b_environment = { denied: true, expected_code: "TENANT_SCOPE_DENIED" };

  // Real DB-path spoof attempt: an ORG_A signed identity explicitly asks for an
  // ORG_B resource. RLS must still return zero rows.
  const cross = await ctxA.client.from("rg_orgs").select("id").eq("id", orgB);
  assert.ifError(cross.error);
  assert.equal((cross.data || []).length, 0);
  evidence.cases.signed_org_a_requests_org_b = { denied: true, rows: 0 };

  // Client-controlled org mismatch is rejected before DB access as a first
  // boundary, while the signed-identity DB test above proves the second boundary.
  assert.throws(
    () => tenant.assertTrustedOrg({ org_id: orgA }, orgB),
    (error) => error && error.code === "ORG_SPOOF_ATTEMPT",
  );
  evidence.cases.client_org_parameter_spoof = { denied: true, expected_code: "ORG_SPOOF_ATTEMPT" };

  const invalid = await rawQuery("invalid.validation.token");
  assert.equal(invalid.ok, false, `invalid JWT unexpectedly succeeded: ${JSON.stringify(invalid)}`);
  evidence.cases.invalid_jwt = invalid;

  const expiredClaims = tenant.tenantClaims({ org_id: orgA, subject: "expired-level2", now: Math.floor(Date.now() / 1000) - 3600, ttl_seconds: 30 });
  const expiredToken = tenant.signHs256(expiredClaims, process.env.SUPABASE_JWT_SECRET);
  const expired = await rawQuery(expiredToken);
  assert.equal(expired.ok, false, `expired JWT unexpectedly succeeded: ${JSON.stringify(expired)}`);
  evidence.cases.expired_jwt = expired;

  const malformed = await rawQuery("not-a-jwt");
  assert.equal(malformed.ok, false, `malformed JWT unexpectedly succeeded: ${JSON.stringify(malformed)}`);
  evidence.cases.malformed_jwt = malformed;

  const noIdentity = await rawQuery(undefined);
  const visibleRows = Array.isArray(noIdentity.body) ? noIdentity.body.length : 0;
  assert.equal(visibleRows, 0, `anonymous request exposed tenant rows: ${JSON.stringify(noIdentity)}`);
  evidence.cases.no_tenant_identity = { ...noIdentity, denied: !noIdentity.ok || visibleRows === 0, visible_rows: visibleRows };

  // Ordinary tenant audit/control surfaces are read-only after the least-
  // privilege migration. Cross-tenant update must error or affect zero rows.
  const mutation = await ctxA.client.from("rg_reports").update({ headline: "FORBIDDEN_LEVEL2_MUTATION" }).eq("org_id", orgB).select("id");
  const changed = mutation.data || [];
  assert.ok(mutation.error || changed.length === 0, `cross-tenant mutation affected rows: ${JSON.stringify(changed)}`);
  evidence.cases.cross_tenant_write = { denied: true, affected_rows: changed.length, error: mutation.error ? mutation.error.message : null };

  // Symmetry: B must not see any of A's tenant-scoped decision rows. Use the
  // approved surface constant so validation code cannot establish a direct
  // table-name bypass around the tenant-store contract.
  const decisionSurface = tenant.READ_SURFACES.find((surface) => surface.endsWith("_decisions"));
  assert.ok(decisionSurface, "decision surface missing from tenant-store READ_SURFACES");
  const bReadsA = await ctxB.client.from(decisionSurface).select("id,org_id").eq("id", FIXTURES.decision);
  assert.ifError(bReadsA.error);
  assert.equal((bReadsA.data || []).length, 0);
  evidence.cases.org_b_reads_org_a_decision = { denied: true, rows: 0 };

  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAIL", code: error.code || null, error: error.message }, null, 2));
  process.exit(1);
});

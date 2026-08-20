#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const tenant = require("../../lib/runtime/tenant-store");

const orgA = process.env.PRODUCTION_RLS_TEST_ORG_A;
const orgB = process.env.PRODUCTION_RLS_TEST_ORG_B;
if (!orgA || !orgB || !tenant.configured()) {
  console.log("SKIP live tenant isolation contract — set PRODUCTION_RLS_TEST_ORG_A, PRODUCTION_RLS_TEST_ORG_B, SUPABASE_ANON_KEY and SUPABASE_JWT_SECRET");
  process.exit(0);
}
if (orgA === orgB) throw new Error("test organisations must be distinct");

(async () => {
  const a = tenant.createTenantClient({ org_id: orgA, subject: "tenant-contract-a" }).client;
  const b = tenant.createTenantClient({ org_id: orgB, subject: "tenant-contract-b" }).client;

  const readOrg = async (client, id) => {
    const { data, error } = await client.from("rg_orgs").select("id").eq("id", id);
    if (error) throw new Error(error.message);
    return data || [];
  };
  assert.equal((await readOrg(a, orgA)).length, 1, "org A must read itself");
  assert.equal((await readOrg(a, orgB)).length, 0, "org A must not read org B");
  assert.equal((await readOrg(b, orgA)).length, 0, "org B must not read org A");
  assert.equal((await readOrg(b, orgB)).length, 1, "org B must read itself");

  // rg_orgs intentionally grants tenant SELECT only. A tenant-side write against
  // another organisation must fail or affect zero rows.
  const writeAttempt = await a.from("rg_orgs").update({ status: "active" }).eq("id", orgB).select("id");
  assert.ok(writeAttempt.error || !(writeAttempt.data || []).length, "cross-tenant write must not succeed");

  for (const table of ["rg_integration_events", "rg_reports"]) {
    const { data, error } = await a.from(table).select("org_id").limit(500);
    if (error) throw new Error(`${table}: ${error.message}`);
    assert.ok((data || []).every((row) => row.org_id === orgA), `${table} mixed organisations under org A identity`);
  }

  // A body/query parameter cannot retarget the JWT. The database only sees the
  // signed org claim and still returns no org-B row.
  assert.throws(() => tenant.assertTrustedOrg({ org_id: orgA }, orgB));

  console.log("PASS live database-enforced tenant isolation contract");
})().catch((error) => { console.error("FAIL tenant isolation contract:", error); process.exit(1); });

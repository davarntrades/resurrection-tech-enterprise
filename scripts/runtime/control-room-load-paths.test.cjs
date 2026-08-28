#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[key];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-control-room-load-"));
const rt = require("../../lib/runtime");

(async () => {
  const originalAggregate = rt.store.aggregate;
  const originalQuery = rt.store.queryDecisions;
  const originalHealth = rt.engine.health;
  try {
    rt.store.aggregate = async () => ({ total: 123 });
    rt.store.queryDecisions = async () => { throw new Error("raw decision scan must not run"); };
    const gateway = await rt.integrationGateway.overview("org_latency");
    assert.equal(gateway.governance_decisions, 123, "gateway count comes from store aggregation");
    assert.equal(gateway.evidence_generated, 123, "evidence total preserves decision count");

    rt.store.aggregate = async () => ({ total: 0, verdict_counts: {}, engine_verdict_counts: {} });
    rt.store.queryDecisions = async () => [];
    rt.engine.health = async () => { throw new Error("engine health must be deferred"); };
    const platform = await rt.overview.platform({ include_engine_health: false });
    assert.equal(platform.engine_reachable, null, "fast overview does not await Railway health");

    const root = path.resolve(__dirname, "../..");
    const apiRoute = fs.readFileSync(path.join(root, "app/api/runtime/admin/overview/route.ts"), "utf8");
    const panel = fs.readFileSync(path.join(root, "components/admin/RuntimeAdminClient.tsx"), "utf8");
    const overview = fs.readFileSync(path.join(root, "lib/runtime/overview.js"), "utf8");
    const gatewayRoute = fs.readFileSync(path.join(root, "app/api/runtime/admin/integration-gateway/route.ts"), "utf8");
    assert.match(apiRoute, /scope === "customers"/, "overview supports a customer-only read");
    assert.match(apiRoute, /scope === "platform"/, "overview supports a platform-only read");
    assert.match(panel, /overview\?scope=platform&engine=deferred/, "platform requests the non-blocking fast path");
    assert.match(panel, /overview\?scope=customers&engine=deferred/, "customer tab does not request platform health");
    assert.match(overview, /Promise\.all\(orgs\.map/, "customer summaries run in parallel");
    assert.doesNotMatch(gatewayRoute, /rt\.overview\.customers\(\)/, "Integrations uses a lightweight organisation list");
  } finally {
    rt.store.aggregate = originalAggregate;
    rt.store.queryDecisions = originalQuery;
    rt.engine.health = originalHealth;
    try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* test cleanup only */ }
  }
  console.log("Control Room load paths: all tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

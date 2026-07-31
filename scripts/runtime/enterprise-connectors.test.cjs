#!/usr/bin/env node
/* Hermetic Salesforce + ServiceNow governed connector contracts. */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-enterprise-connectors-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = "test-only-enterprise-connector-secret";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("../ops/mock-engine.cjs");
const row_hash = (row) => row.governance_trajectory_hash;
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
function seal(value) {
  const key = crypto.createHash("sha256").update(process.env.INTEGRATION_SECRET_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${payload.toString("base64url")}`;
}

(async () => {
  const engine = await startMockEngine();
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${engine.address().port}`;
  const rt = require("../../lib/runtime");
  const ops = require("../../lib/ops");
  const gateway = rt.integrationGateway;
  const runs = rt.enterpriseActionRuns;
  const adapters = rt.enterpriseActionAdapters;

  const org = await rt.store.insert("orgs", { id: "org_enterprise", name: "Enterprise" });
  const env = await rt.store.insert("environments", { id: "env_enterprise", org_id: org.id, name: "Production", kind: "production" });
  const other = await rt.store.insert("environments", { id: "env_enterprise_other", org_id: org.id, name: "Staging", kind: "staging" });
  const secret = seal({ client_id: "cid", client_secret: "secret", refresh_token: "refresh-token" });
  const salesforce = await rt.store.insert("integration_connectors", {
    id: "int_salesforce", org_id: org.id, environment_id: env.id, type: "salesforce",
    name: "Salesforce", status: "configured", health: "healthy", secret_encrypted: secret,
    config: {
      login_url: "https://login.salesforce.com", instance_url: "https://acme.my.salesforce.com",
      api_version: "v61.0", allowed_objects: ["Lead", "Case"],
      allowed_fields: { Lead: ["Id", "LastName", "Company", "Status"], Case: ["Id", "Subject", "Status"] },
      capabilities: ["get_record", "search_records", "create_lead", "update_lead", "create_case", "update_case"],
    },
  });
  const serviceNow = await rt.store.insert("integration_connectors", {
    id: "int_servicenow", org_id: org.id, environment_id: env.id, type: "servicenow",
    name: "ServiceNow", status: "configured", health: "healthy", secret_encrypted: secret,
    config: {
      instance_url: "https://acme.service-now.com", allowed_tables: ["incident", "change_request"],
      allowed_fields: {
        incident: ["sys_id", "short_description", "state", "assigned_to", "work_notes"],
        change_request: ["sys_id", "short_description", "state", "risk"],
      },
      capabilities: ["get_record", "list_incidents", "create_incident", "update_incident", "add_work_note", "assign_incident", "create_change_request", "update_change_request"],
    },
  });
  await rt.store.insert("integration_connectors", {
    id: "int_salesforce_other", org_id: org.id, environment_id: other.id, type: "salesforce",
    name: "Other", status: "configured", health: "healthy", secret_encrypted: secret,
    config: salesforce.config,
  });

  await test("all canonical actions are registered and mutations require operator approval", () => {
    assert.equal(adapters.listActions().length, 17);
    for (const action of adapters.listActions()) {
      const entry = ops.actions.get(action.action_id);
      assert.ok(entry, action.action_id);
      assert.equal(entry.tool, action.mutates ? "modify_customer" : `read_${action.provider}_record`);
      assert.equal(entry.risk, action.mutates ? "high" : "medium");
      assert.equal(ops.actions.autoExecutable(entry), !action.mutates);
    }
  });

  await test("provider configuration is OAuth-only, redacted and strictly scoped", () => {
    const sf = require("../../lib/runtime/connectors/salesforce");
    const sn = require("../../lib/runtime/connectors/servicenow");
    const sfPublic = sf.publicConfiguration(sf.validateConfiguration(salesforce.config, { client_id: "x", client_secret: "y", refresh_token: "z" }));
    const snPublic = sn.publicConfiguration(sn.validateConfiguration(serviceNow.config, { client_id: "x", client_secret: "y", refresh_token: "z" }));
    assert.ok(!JSON.stringify(sfPublic).includes("client_secret"));
    assert.ok(!JSON.stringify(snPublic).includes("refresh_token"));
    assert.throws(() => sf.normaliseInput("create_lead", { fields: { Email: "x@example.com" } }, salesforce.config), /not allowed/);
    assert.throws(() => sn.normaliseInput("update_incident", { record_id: "a".repeat(32), fields: { password: "secret" } }, serviceNow.config), /not allowed/);
    assert.throws(() => sf.validateConfiguration({ ...salesforce.config, instance_url: "https://attacker.example" }, { client_id: "x", client_secret: "y", refresh_token: "z" }), /approved Salesforce domain/);
    assert.throws(() => sn.validateConfiguration({ ...serviceNow.config, instance_url: "http://acme.service-now.com" }, { client_id: "x", client_secret: "y", refresh_token: "z" }), /HTTPS/);
  });

  await test("live validation decrypts credentials and persists healthy or exact failure", async () => {
    let calls = 0;
    const sfFetch = async (url) => {
      calls++;
      if (String(url).endsWith("/services/oauth2/token")) return new Response(JSON.stringify({ access_token: "access", instance_url: "https://acme.my.salesforce.com", id: "user/1" }), { status: 200 });
      return new Response(JSON.stringify({ DailyApiRequests: { Max: 1000, Remaining: 999 } }), { status: 200 });
    };
    await rt.store.update("integration_connectors", salesforce.id, { health: "unknown" });
    const healthy = await gateway.checkEnterpriseConnectorHealthRaw({
      org_id: org.id, environment_id: env.id, connector_id: salesforce.id, connector_type: "salesforce",
    }, { fetch: sfFetch });
    assert.equal(healthy.ok, true); assert.equal(calls, 2);
    assert.equal((await rt.store.findOne("integration_connectors", { id: salesforce.id })).health, "healthy");

    const failed = await gateway.checkEnterpriseConnectorHealthRaw({
      org_id: org.id, environment_id: env.id, connector_id: serviceNow.id, connector_type: "servicenow",
    }, { fetch: async () => new Response(JSON.stringify({ error: { message: "invalid_grant: refresh token revoked" } }), { status: 401 }) });
    assert.equal(failed.ok, false);
    assert.match(failed.error, /invalid_grant/);
    const persisted = await rt.store.findOne("integration_connectors", { id: serviceNow.id });
    assert.equal(persisted.health, "down");
    assert.match(persisted.last_error, /SERVICENOW_UNAUTHORIZED: invalid_grant/);
    await rt.store.update("integration_connectors", serviceNow.id, { health: "healthy", last_error: null });
  });

  let invocationCount = 0;
  const provider = async (action_id) => {
    invocationCount++;
    return {
      ok: true, action_id, provider: action_id.split(".")[0],
      operation: action_id.split(".")[1], external_record_id: `${action_id.startsWith("salesforce") ? "00Q" : "a".repeat(32)}`,
      provider_latency_ms: 7,
    };
  };
  const createMutation = (overrides = {}) => runs.createRun({
    org_id: org.id, environment_id: env.id, connector_id: salesforce.id,
    action_id: "salesforce.create_lead",
    input: { fields: { LastName: "Governed", Company: "Example Ltd", Status: "Open" } },
    idempotency_key: `enterprise-${crypto.randomUUID()}`, actor: "enterprise_gateway", ...overrides,
  });

  let completed;
  await test("mutation escalates with zero provider calls, approval re-evaluates, then invokes exactly once", async () => {
    const created = await createMutation();
    let run = await runs.advanceRun(created.id, org.id, gateway, { enterpriseExecute: provider });
    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.provider_invocation_count, 0);
    assert.equal(invocationCount, 0);
    const proposal = await ops.proposals.get(run.proposal_id);
    assert.equal(proposal.decision.rule, "ops_unauthorized_customer_modification");
    const approved = await ops.proposals.approve(run.proposal_id, { actor: "operator@example.com" });
    assert.equal(approved.status, "executed");
    run = await runs.advanceRun(created.id, org.id, gateway, { enterpriseExecute: provider });
    assert.equal(run.status, "completed");
    assert.equal(run.approval_status, "approved_and_executed");
    assert.equal(run.provider_invocation_count, 1);
    assert.equal(invocationCount, 1);
    assert.ok(run.external_record_id);
    assert.ok(run.evidence_id);
    completed = run;
  });

  await test("retries and concurrent advances cannot duplicate a provider mutation", async () => {
    await Promise.all([1, 2, 3].map(() => runs.advanceRun(completed.id, org.id, gateway, { enterpriseExecute: provider })));
    assert.equal(invocationCount, 1);
  });

  await test("approval is bound to the exact payload and cannot be replayed", async () => {
    const created = await createMutation();
    const run = await runs.advanceRun(created.id, org.id, gateway, { enterpriseExecute: provider });
    await ops.proposals.approve(run.proposal_id, { actor: "operator@example.com" });
    await assert.rejects(() => gateway.executeApprovedEnterpriseAction({
      org_id: org.id, environment_id: env.id, connector_id: salesforce.id,
      enterprise_action_run_id: run.id, action_id: run.action_id, proposal_id: run.proposal_id,
      input: { fields: { LastName: "Changed", Company: "Attacker Ltd", Status: "Open" } },
    }, { enterpriseExecute: provider }), /does not match/);
    assert.equal(invocationCount, 1);
  });

  await test("reads are governed and provider content is not copied into evidence", async () => {
    const confidential = "CONFIDENTIAL-CRM-CONTENT";
    const created = await runs.createRun({
      org_id: org.id, environment_id: env.id, connector_id: serviceNow.id,
      action_id: "servicenow.list_incidents", input: { limit: 5 },
      idempotency_key: `enterprise-read-${crypto.randomUUID()}`,
    });
    const run = await runs.advanceRun(created.id, org.id, gateway, {
      enterpriseExecute: async () => ({ ok: true, records: [{ short_description: confidential }], record_count: 1, provider_latency_ms: 3 }),
    });
    assert.equal(run.status, "completed");
    assert.equal(run.provider_invocation_count, 1);
    const evidence = await rt.store.findOptional("integration_events", { org_id: org.id });
    const blob = JSON.stringify(evidence);
    assert.ok(!blob.includes(confidential));
    assert.ok(!blob.includes("refresh-token"));
    assert.ok(evidence.some((x) => x.type === "enterprise.record.read" && x.immutable === true));
  });

  await test("replay information is persisted so a verdict can be reproduced", async () => {
    // The production smoke hard-asserts this, so it must be populated on the
    // run record and not merely present in the engine response.
    const runs = await rt.store.findOptional("enterprise_action_runs", { org_id: org.id });
    const executed = runs.filter((r) => r.proposal_id);
    assert.ok(executed.length, "at least one governed run must exist");
    for (const row of executed) {
      assert.ok(row.governance_trajectory_hash,
        `run ${row.id} must record a trajectory hash for replay`);
    }
    const proposal = await ops.proposals.get(executed[0].proposal_id);
    assert.equal(row_hash(executed[0]), proposal.decision.trajectory_hash,
      "the recorded hash must be the engine's own trajectory hash, not a local value");
  });

  await test("organisation and environment isolation reject mismatched connectors and runs", async () => {
    await assert.rejects(() => createMutation({ connector_id: "int_salesforce_other" }), /not found for this organisation and environment/);
    assert.equal(await runs.advanceRun(completed.id, "org_other", gateway), null);
  });

  await test("sovereign and air-gapped profiles deny provider egress before network execution", async () => {
    const previous = process.env.GUARDIAN_PROFILE;
    let networkCalls = 0;
    try {
      process.env.GUARDIAN_PROFILE = "sovereign";
      const execute = gateway.enterpriseProviderExecute({
        org_id: org.id, environment_id: env.id, connector_id: salesforce.id,
        connector_type: "salesforce",
      }, { fetchImpl: async () => { networkCalls++; return new Response("{}", { status: 200 }); } });
      await assert.rejects(() => execute(
        "salesforce.get_record", salesforce.config,
        { client_id: "cid", client_secret: "secret", refresh_token: "refresh-token" },
        { object: "Lead", record_id: "00Q000000000001" },
      ), /denied before network execution/);
      assert.equal(networkCalls, 0);
    } finally {
      if (previous == null) delete process.env.GUARDIAN_PROFILE;
      else process.env.GUARDIAN_PROFILE = previous;
    }
  });

  await test("no implementation call site bypasses the two governed provider boundaries", () => {
    const root = path.join(__dirname, "../..");
    const allowed = new Set([
      "lib/runtime/integration-gateway.js", "lib/runtime/enterprise-approved-action.js",
      // Wiring only: index binds the approved continuation; the sovereign
      // wrapper adds a stricter outbound policy before delegating.
      "lib/runtime/index.js", "lib/runtime/sovereign/integration-gateway-runtime.js",
    ]);
    const offenders = [];
    for (const dir of ["lib", "app"]) {
      const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.(js|ts|tsx)$/.test(entry.name)) {
            const rel = path.relative(root, full);
            if (!allowed.has(rel) && /enterpriseExecute|enterprise-action-adapters.*execute/.test(fs.readFileSync(full, "utf8"))) offenders.push(rel);
          }
        }
      };
      walk(path.join(root, dir));
    }
    assert.deepEqual(offenders, []);
  });

  await test("the operator preview exposes the existing governed action lifecycle without embedding provider logic", () => {
    const ui = fs.readFileSync(path.join(__dirname, "../../components/admin/IntegrationGatewayPanel.tsx"), "utf8");
    const route = fs.readFileSync(path.join(__dirname, "../../app/api/runtime/admin/integration-gateway/route.ts"), "utf8");
    assert.match(ui, /api\/runtime\/admin\/enterprise-actions/);
    assert.match(ui, /Run governed read/);
    assert.match(ui, /Start approval-gated mutation/);
    assert.match(ui, /Resume after approval/);
    assert.match(ui, /provider_invocation_count/);
    assert.match(route, /enterprise_actions:.*listActions/);
    assert.doesNotMatch(ui, /connectors\/salesforce|connectors\/servicenow|enterpriseExecute/);
  });

  engine.close();
  console.log(`\n${passed} governed enterprise connector tests passed.`);
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});

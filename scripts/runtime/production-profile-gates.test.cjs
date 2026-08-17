#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const { wrapGovernanceGateway } = require("../../lib/runtime/production-governance-runtime");
const deployment = require("../../lib/runtime/deployment-profiles");
const readiness = require("../../lib/runtime/production-readiness");
const store = require("../../lib/runtime/store");

(async () => {
  // Direct govern path: an active production environment cannot return ALLOW
  // from a non-durable backend, and the underlying decision path is not called.
  let calls = 0;
  const mockStore = {
    durable: () => false,
    findOneOptional: async () => ({ environment_id: "env_a", org_id: "org_a", profile: "PRODUCTION", status: "active" }),
  };
  const wrapped = wrapGovernanceGateway({ govern: async () => { calls++; return { ok: true, verdict: "ALLOW", recorded: true, decision_id: "d1" }; } }, mockStore);
  const blocked = await wrapped.govern({ auth: { org: { id: "org_a" }, environment: { id: "env_a", mode: "enforce" } }, trajectory: [{ tool: "x" }] });
  assert.equal(blocked.verdict, "BLOCK");
  assert.equal(calls, 0);

  // Even on a durable backend, an unrecorded decision is converted to BLOCK.
  mockStore.durable = () => true;
  const unrecorded = wrapGovernanceGateway({ govern: async () => ({ ok: true, verdict: "ALLOW", recorded: false, decision_id: null }) }, mockStore);
  const blockedGap = await unrecorded.govern({ auth: { org: { id: "org_a" }, environment: { id: "env_a", mode: "enforce" } }, trajectory: [{ tool: "x" }] });
  assert.equal(blockedGap.verdict, "BLOCK");
  assert.equal(blockedGap.recorded, false);

  // Pilot compatibility: no active hardened profile means the existing result
  // passes through byte-for-byte in meaning.
  mockStore.findOneOptional = async () => null;
  const pilotBase = { ok: true, verdict: "ALLOW", recorded: false, decision_id: null };
  const pilot = wrapGovernanceGateway({ govern: async () => pilotBase }, mockStore);
  assert.deepEqual(await pilot.govern({ auth: { org: { id: "org_a" }, environment: { id: "env_a" } }, trajectory: [{ tool: "x" }] }), pilotBase);

  // Activation cannot create a production state when preflight is BLOCKED.
  const originals = {
    findOne: store.findOne, findOneOptional: store.findOneOptional,
    insert: store.insert, update: store.update,
    productionReadiness: readiness.productionReadiness,
    sovereignReadiness: readiness.sovereignReadiness,
  };
  const rows = new Map();
  store.findOne = async (collection, where) => collection === "environments" ? { id: where.id, org_id: "org_a" } : null;
  store.findOneOptional = async (collection, where) => collection === "deployment_profiles" ? rows.get(where.environment_id) || null : null;
  store.insert = async (_collection, row) => { rows.set(row.environment_id, row); return row; };
  store.update = async (_collection, id, patch) => { const row = { ...(rows.get(id) || { id, environment_id: id, org_id: "org_a" }), ...patch }; rows.set(id, row); return row; };
  readiness.productionReadiness = async () => ({ status: "BLOCKED", posture: "BLOCKED", ready: false, checked_at: new Date().toISOString(), checks: [] });
  readiness.sovereignReadiness = async () => ({ status: "BLOCKED", posture: "BLOCKED", ready: false, checked_at: new Date().toISOString(), checks: [] });

  await assert.rejects(() => deployment.activate({ org_id: "org_a", environment_id: "env_prod", profile: "PRODUCTION" }), (e) => e && e.code === "DEPLOYMENT_PREFLIGHT_FAILED");
  await assert.rejects(() => deployment.activate({ org_id: "org_a", environment_id: "env_sov", profile: "SOVEREIGN", config: { secret_store_ref: "vault://x", evidence_store_ref: "db://x" } }), (e) => e && e.code === "DEPLOYMENT_PREFLIGHT_FAILED");
  assert.notEqual(rows.get("env_prod")?.status, "active");
  assert.notEqual(rows.get("env_sov")?.status, "active");

  Object.assign(store, { findOne: originals.findOne, findOneOptional: originals.findOneOptional, insert: originals.insert, update: originals.update });
  readiness.productionReadiness = originals.productionReadiness;
  readiness.sovereignReadiness = originals.sovereignReadiness;

  console.log("PASS production profile gates fail closed and pilot path remains compatible");
})().catch((error) => { console.error("FAIL production profile gates:", error); process.exit(1); });

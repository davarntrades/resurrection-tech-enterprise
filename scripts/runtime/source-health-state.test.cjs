#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const store = require("../../lib/runtime/store");
const readiness = require("../../lib/runtime/production-readiness");

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

async function withRpc(result, fn) {
  const original = store.rpcOptional;
  store.rpcOptional = async () => result;
  try { return await fn(); }
  finally { store.rpcOptional = original; }
}

(async () => {
  await test("available source remains authoritative", async () => withRpc(
    { ok: true, data: { integration_events: { state: "available", table: "rg_integration_events" } } },
    async () => {
      const result = await readiness.sourceHealth();
      assert.equal(result.ok, true);
      assert.equal(result.sources.integration_events.state, "available");
    },
  ));

  await test("unknown source state cannot masquerade as healthy", async () => withRpc(
    { ok: true, data: { integration_events: { state: "mystery" } } },
    async () => {
      const result = await readiness.sourceHealth();
      assert.equal(result.sources.integration_events.state, "unavailable");
    },
  ));

  await test("missing schema is explicit", async () => withRpc(
    { ok: false, reason: "function_missing", detail: "rg_source_health missing" },
    async () => {
      const result = await readiness.sourceHealth();
      assert.equal(result.ok, false);
      assert.equal(result.sources.runtime_database.state, "missing_schema");
    },
  ));

  await test("permission denied is explicit", async () => withRpc(
    { ok: false, reason: "rpc_error", detail: "permission denied for function rg_source_health (42501)" },
    async () => {
      const result = await readiness.sourceHealth();
      assert.equal(result.ok, false);
      assert.equal(result.sources.runtime_database.state, "permission_denied");
    },
  ));

  await test("read failure is explicit", async () => withRpc(
    { ok: false, reason: "rpc_error", detail: "connection reset while reading source" },
    async () => {
      const result = await readiness.sourceHealth();
      assert.equal(result.ok, false);
      assert.equal(result.sources.runtime_database.state, "read_error");
    },
  ));

  await test("not configured is explicit", async () => withRpc(
    { ok: false, reason: "no_cloud_backend", detail: "no cloud backend" },
    async () => {
      const result = await readiness.sourceHealth();
      assert.equal(result.ok, false);
      assert.equal(result.sources.runtime_database.state, "not_configured");
    },
  ));

  await test("required UNKNOWN and FAIL source checks cannot yield READY", async () => {
    assert.equal(readiness.statusFromChecks([{ required: true, status: readiness.CHECK.UNKNOWN }]), readiness.POSTURE.BLOCKED);
    assert.equal(readiness.statusFromChecks([{ required: true, status: readiness.CHECK.FAIL }]), readiness.POSTURE.BLOCKED);
  });

  console.log(`\n${passed} source-health semantic tests passed.`);
  if (process.exitCode) process.exit(process.exitCode);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

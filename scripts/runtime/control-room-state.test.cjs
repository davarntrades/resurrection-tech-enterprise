#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const readiness = require("../../lib/runtime/production-readiness");
const deployment = require("../../lib/runtime/sovereign/deployment");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.stack || error.message}`); process.exitCode = 1; }
}

const required = (id, status) => ({ id, required: true, status });
const optional = (id, status) => ({ id, required: false, status });

test("READY fixture is READY", () => {
  assert.equal(readiness.statusFromChecks([
    required("tenant_isolation", readiness.CHECK.PASS),
    required("connector_chain", readiness.CHECK.PASS),
    required("source_health", readiness.CHECK.PASS),
  ]), readiness.POSTURE.READY);
});

test("DEGRADED fixture is not READY", () => {
  assert.equal(readiness.statusFromChecks([
    required("tenant_isolation", readiness.CHECK.PASS),
    optional("rate_limit_posture", readiness.CHECK.WARN),
  ]), readiness.POSTURE.DEGRADED);
});

test("BLOCKED connector-chain fixture is BLOCKED", () => {
  assert.equal(readiness.statusFromChecks([
    required("connector_chain", readiness.CHECK.FAIL),
  ]), readiness.POSTURE.BLOCKED);
});

test("UNKNOWN required fixture is BLOCKED, never READY", () => {
  assert.equal(readiness.statusFromChecks([
    required("tenant_isolation", readiness.CHECK.UNKNOWN),
  ]), readiness.POSTURE.BLOCKED);
});

test("source-health failure prominently blocks backend posture", () => {
  assert.equal(readiness.statusFromChecks([
    required("source_health", readiness.CHECK.FAIL),
  ]), readiness.POSTURE.BLOCKED);
});

test("tenant-isolation failure prominently blocks backend posture", () => {
  assert.equal(readiness.statusFromChecks([
    required("tenant_isolation", readiness.CHECK.FAIL),
  ]), readiness.POSTURE.BLOCKED);
});

test("external vendor dependency prevents sovereign startup", () => {
  assert.throws(
    () => deployment.validateStartup({ GUARDIANOS_DEPLOYMENT_MODE: "sovereign", RESURRECTION_CONTROL_PLANE_REQUIRED: "1" }),
    (error) => error && error.code === "SOVEREIGN_EXTERNAL_DEPENDENCY",
  );
});

test("Control Room source keeps backend preflight authoritative", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../components/admin/ProductionDeploymentSurface.tsx"), "utf8");
  assert.match(source, /Backend preflight is authoritative/);
  assert.match(source, /disabled=\{busy \|\| !preflight\?\.ready\}/);
  assert.match(source, /Treat posture as UNKNOWN/);
});

test("UNKNOWN and DEGRADED cannot use the positive READY colour branch", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../components/admin/ProductionDeploymentSurface.tsx"), "utf8");
  const toneMatch = source.match(/function tone\(status\?: string\) \{([\s\S]*?)\n\}/);
  assert.ok(toneMatch, "tone() not found");
  const tone = toneMatch[1];
  assert.match(tone, /status === "READY" \|\| status === "PASS" \|\| status === "active"/);
  assert.match(tone, /status === "BLOCKED" \|\| status === "FAIL" \|\| status === "broken"/);
  assert.ok(!/UNKNOWN[^\n]*#3fb27f/.test(tone), "UNKNOWN mapped to green");
  assert.ok(!/DEGRADED[^\n]*#3fb27f/.test(tone), "DEGRADED mapped to green");
});

test("Control Room displays connector, source-health and tenant-isolation checks", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../components/admin/ProductionDeploymentSurface.tsx"), "utf8");
  for (const id of ["tenant_isolation", "connector_chain", "source_health"]) assert.ok(source.includes(`\"${id}\"`), `missing ${id}`);
  assert.ok(source.includes("Last verified"));
  assert.ok(source.includes("production?.checked_at"));
});

test("Control Room resource editor exposes all required classifications", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../components/admin/ProductionDeploymentSurface.tsx"), "utf8");
  for (const value of ["CANARY", "STAGING", "PRODUCTION", "SOVEREIGN"]) assert.ok(source.includes(`\"${value}\"`));
  for (const value of ["inert", "contained", "limited", "production", "sovereign", "unknown"]) assert.ok(source.includes(`\"${value}\"`));
});

console.log(`\n${passed} Control Room readiness state tests passed.`);
if (process.exitCode) process.exit(process.exitCode);

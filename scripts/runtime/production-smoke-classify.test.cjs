#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const { CLASSES, classify } = require("./production-smoke-classify.cjs");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.stack || error.message}`); process.exitCode = 1; }
}

test("governance unavailable with zero provider calls is classified distinctly", () => {
  const result = classify({
    runtime_governance_evaluated: false,
    provider_called: false,
    provider_invocation_count: 0,
    safe_failure_reason: "GOVERNANCE_UNAVAILABLE: Runtime Governance unavailable; provider was not reached",
  });
  assert.equal(result.classification, CLASSES.GOVERNANCE_UNAVAILABLE);
});

test("auth failure is classified distinctly", () => {
  const result = classify({ status: "FAIL", error: "HTTP 401 authentication failed" });
  assert.equal(result.classification, CLASSES.AUTH_FAILURE);
});

test("reached provider failure is classified distinctly", () => {
  const result = classify({ status: "FAIL", provider_called: true, provider_invocation_count: 1, error: "provider error" });
  assert.equal(result.classification, CLASSES.PROVIDER_FAILURE);
});

test("unknown application failure remains application regression", () => {
  const result = classify({ status: "FAIL", error: "unexpected invariant mismatch" });
  assert.equal(result.classification, CLASSES.APPLICATION_REGRESSION);
});

test("successful smoke remains PASS", () => {
  const result = classify({ status: "PASS", provider_called: true, provider_invocation_count: 1 });
  assert.equal(result.classification, CLASSES.PASS);
});

console.log(`\n${passed} production smoke diagnostic classification tests passed.`);
if (process.exitCode) process.exit(process.exitCode);

#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const safety = require("../../lib/runtime/validation-safety");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

const base = {
  RUNTIME_VALIDATION_TARGET: "disposable",
  VALIDATION_ENVIRONMENT_CLASSIFICATION: "DISPOSABLE",
  VALIDATION_PROJECT_REF: "zzzzzzzzzzzzzzzzzzzz",
  VALIDATION_SUPABASE_URL: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
  ALLOW_DESTRUCTIVE_VALIDATION: "1",
  VALIDATION_TARGET_EMPTY: "1",
  VALIDATION_DATA_MARKER: safety.VALIDATION_MARKER,
};

function expectCode(env, code) {
  assert.throws(
    () => safety.assertNonProductionTarget(env),
    (error) => error && error.code === code,
    `expected ${code}`,
  );
}

test("resurrection-tech-prod project ref is refused", () => {
  expectCode({ ...base, VALIDATION_PROJECT_REF: "vnyosaazlrjferxyesdf", VALIDATION_SUPABASE_URL: "https://vnyosaazlrjferxyesdf.supabase.co" }, "PRODUCTION_PROJECT_FORBIDDEN");
});

test("trajectory-prod project ref is refused", () => {
  expectCode({ ...base, VALIDATION_PROJECT_REF: "vqwumjgognhuvaioccig", VALIDATION_SUPABASE_URL: "https://vqwumjgognhuvaioccig.supabase.co" }, "PRODUCTION_PROJECT_FORBIDDEN");
});

test("missing destructive acknowledgement is refused", () => {
  expectCode({ ...base, ALLOW_DESTRUCTIVE_VALIDATION: "" }, "DESTRUCTIVE_ACK_REQUIRED");
});

test("unknown environment classification is refused", () => {
  expectCode({ ...base, VALIDATION_ENVIRONMENT_CLASSIFICATION: "UNKNOWN" }, "CLASSIFICATION_NOT_DISPOSABLE");
});

test("non-disposable target label is refused", () => {
  expectCode({ ...base, RUNTIME_VALIDATION_TARGET: "production" }, "TARGET_NOT_DISPOSABLE");
});

test("missing no-customer-data attestation is refused", () => {
  expectCode({ ...base, VALIDATION_TARGET_EMPTY: "" }, "EMPTY_TARGET_ATTESTATION_REQUIRED");
});

test("validation marker is mandatory", () => {
  expectCode({ ...base, VALIDATION_DATA_MARKER: "something-else" }, "VALIDATION_MARKER_REQUIRED");
});

test("URL and explicit project ref mismatch is refused", () => {
  expectCode({ ...base, VALIDATION_SUPABASE_URL: "https://yyyyyyyyyyyyyyyyyyyy.supabase.co" }, "PROJECT_REF_MISMATCH");
});

test("explicit disposable target is allowed", () => {
  const result = safety.assertNonProductionTarget(base);
  assert.equal(result.ok, true);
  assert.equal(result.project_ref, base.VALIDATION_PROJECT_REF);
  assert.equal(result.classification, "DISPOSABLE");
  assert.equal(result.destructive, true);
});

test("non-destructive preparation still requires disposable classification and marker but not destructive acknowledgement", () => {
  const env = { ...base, ALLOW_DESTRUCTIVE_VALIDATION: "", VALIDATION_TARGET_EMPTY: "" };
  const result = safety.assertNonProductionTarget(env, { destructive: false });
  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
});

console.log(`\n${passed} destructive-validation safety guard tests passed.`);
if (process.exitCode) process.exit(process.exitCode);

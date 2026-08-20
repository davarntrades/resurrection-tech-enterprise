#!/usr/bin/env node
"use strict";
const fs = require("node:fs");

const CLASSES = Object.freeze({
  GOVERNANCE_UNAVAILABLE: "GOVERNANCE_UNAVAILABLE",
  AUTH_FAILURE: "AUTH_FAILURE",
  PROVIDER_FAILURE: "PROVIDER_FAILURE",
  APPLICATION_REGRESSION: "APPLICATION_REGRESSION",
  PASS: "PASS",
});

function flatten(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(" ");
  return Object.entries(value).map(([k, v]) => `${k} ${flatten(v)}`).join(" ");
}

function num(report, keys) {
  for (const key of keys) {
    const value = report && report[key];
    if (typeof value === "number") return value;
  }
  return null;
}

function bool(report, keys) {
  for (const key of keys) {
    const value = report && report[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function classify(report) {
  const text = flatten(report).toLowerCase();
  const providerCount = num(report, ["provider_invocation_count", "bedrock_invocation_count", "gmail_invocation_count", "invocation_count"]);
  const providerCalled = bool(report, ["provider_called", "provider_executed", "aws_called", "google_called"]);
  const governanceEvaluated = report?.runtime_governance_evaluated ?? report?.governance_evaluated;

  const explicitPass = report?.status === "PASS" || report?.pass === true || report?.ok === true;
  if (explicitPass && !/(failure|unavailable|blocked|error)/.test(text)) return { classification: CLASSES.PASS, reason: "structured smoke report indicates success" };

  if (
    /governance_unavailable|governance unavailable|runtime governance unavailable|engine was not reached|engine unavailable/.test(text)
    || (governanceEvaluated === false && (providerCalled === false || providerCount === 0))
  ) {
    return {
      classification: CLASSES.GOVERNANCE_UNAVAILABLE,
      reason: "governance evaluation was unavailable before the provider boundary",
    };
  }

  if (/(unauthori[sz]ed|forbidden|invalid credential|credential.*invalid|authentication failed|auth_failure|http 401|http 403|status 401|status 403)/.test(text)) {
    return { classification: CLASSES.AUTH_FAILURE, reason: "structured evidence indicates authentication/authorization failure" };
  }

  if (
    providerCalled === true
    || (providerCount != null && providerCount > 0)
    || /(provider failure|provider_error|provider error|bedrock.*failed|gmail.*provider.*failed|google.*failed)/.test(text)
  ) {
    return { classification: CLASSES.PROVIDER_FAILURE, reason: "governance reached an executable/provider boundary but provider execution failed" };
  }

  return {
    classification: CLASSES.APPLICATION_REGRESSION,
    reason: "failure was not attributable to governance reachability, authentication, or a reached provider boundary",
  };
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: production-smoke-classify.cjs <structured-smoke-report.json>");
  if (!fs.existsSync(file)) {
    console.log(JSON.stringify({ classification: CLASSES.APPLICATION_REGRESSION, reason: "structured smoke report missing", file }, null, 2));
    return;
  }
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(JSON.stringify({ ...classify(report), file }, null, 2));
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(JSON.stringify({ classification: CLASSES.APPLICATION_REGRESSION, reason: error.message }, null, 2));
    process.exit(2);
  }
}

module.exports = { CLASSES, classify };

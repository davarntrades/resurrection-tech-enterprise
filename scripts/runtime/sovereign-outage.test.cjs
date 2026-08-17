#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const profiles = require("../../lib/sovereign/profiles");
const deployment = require("../../lib/runtime/sovereign/deployment");
const safety = require("../../lib/runtime/validation-safety");

function arg(name) { return process.argv.includes(name); }
function simulated() {
  const p = profiles.profile("sovereign_private");
  assert.equal(p.telemetry, false, "sovereign_private telemetry must default off");
  assert.equal(p.policy_provider, profiles.POLICY.BUNDLE, "sovereign_private must not require remote policy");
  assert.equal(p.egress, profiles.EGRESS.RESTRICTED, "sovereign_private must restrict egress");
  assert.equal(p.require_signed_bundles, true, "sovereign_private must require signed updates");
  assert.equal(p.immutable_default, true, "sovereign_private must default immutable");

  const env = {
    GUARDIANOS_DEPLOYMENT_MODE: "sovereign",
    GUARDIANOS_OUTBOUND_POLICY: "approved_endpoints_only",
    GUARDIANOS_TELEMETRY_ENABLED: "0",
    RESURRECTION_CONTROL_PLANE_REQUIRED: "0",
    GUARDIANOS_MANDATORY_REMOTE_EVIDENCE: "0",
    GUARDIANOS_MANDATORY_TELEMETRY: "0",
  };
  const policy = deployment.validateStartup(env);
  assert.equal(policy.sovereign, true);
  assert.equal(policy.resurrection_control_plane_required, false);
  assert.equal(policy.telemetry_enabled, false);
  assert.equal(policy.external_evidence_delivery, false);

  assert.throws(
    () => deployment.validateStartup({ ...env, RESURRECTION_CONTROL_PLANE_REQUIRED: "1" }),
    (error) => error && error.code === "SOVEREIGN_EXTERNAL_DEPENDENCY",
    "mandatory vendor control plane must block sovereign startup",
  );
  assert.throws(
    () => deployment.validateStartup({ ...env, GUARDIANOS_MANDATORY_TELEMETRY: "1" }),
    (error) => error && error.code === "SOVEREIGN_EXTERNAL_DEPENDENCY",
    "mandatory telemetry must block sovereign startup",
  );
  assert.throws(
    () => deployment.validateStartup({ ...env, GUARDIANOS_MANDATORY_REMOTE_EVIDENCE: "1" }),
    (error) => error && error.code === "SOVEREIGN_EXTERNAL_DEPENDENCY",
    "mandatory vendor evidence export must block sovereign startup",
  );

  const requiredBoundaryFacts = [
    "GUARDIAN_CUSTOMER_DATA_PLANE",
    "GUARDIAN_LOCAL_ENGINE",
    "GUARDIAN_PROVIDER_ENDPOINTS_VERIFIED",
    "GUARDIAN_EGRESS_VERIFIED",
    "GUARDIAN_CUSTOMER_SECRET_STORE",
    "GUARDIAN_CUSTOMER_EVIDENCE_STORE",
    "GUARDIAN_ROLLBACK_PATH",
    "GUARDIAN_RECOVERY_RUNBOOK",
  ];

  console.log(JSON.stringify({
    mode: "simulated",
    status: "PASS",
    claim: "architectural simulation only — NOT customer-boundary proof",
    profile: profiles.describe("sovereign_private"),
    deployment_policy: policy,
    vendor_dependency_refusal: true,
    telemetry_default_off: true,
    bundled_policy_required: true,
    restricted_egress_required: true,
    signed_updates_required: true,
    required_target_attestations: requiredBoundaryFacts,
  }, null, 2));
}

function target() {
  const meta = safety.assertNonProductionTarget(process.env, { destructive: false });
  safety.printTarget(meta);
  const required = [
    "GUARDIAN_CUSTOMER_DATA_PLANE",
    "GUARDIAN_LOCAL_ENGINE",
    "GUARDIAN_PROVIDER_ENDPOINTS_VERIFIED",
    "GUARDIAN_EGRESS_VERIFIED",
    "GUARDIAN_CUSTOMER_SECRET_STORE",
    "GUARDIAN_CUSTOMER_EVIDENCE_STORE",
    "GUARDIAN_ROLLBACK_PATH",
    "GUARDIAN_RECOVERY_RUNBOOK",
    "GUARDIAN_SOVEREIGN_REPRESENTATIVE_TARGET",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (process.env.GUARDIAN_SOVEREIGN_REPRESENTATIVE_TARGET !== "1") {
    throw new Error("--target requires GUARDIAN_SOVEREIGN_REPRESENTATIVE_TARGET=1; simulated/local infrastructure cannot satisfy the claim");
  }
  if (missing.length) throw new Error(`representative sovereign target missing ${missing.join(", ")}`);
  throw new Error("TARGET MODE NOT VALIDATED: representative infrastructure must run the dedicated customer-boundary outage procedure; this harness intentionally refuses to relabel local simulation as Level-2 evidence");
}

try {
  if (arg("--target")) target();
  else simulated();
} catch (error) {
  console.error(JSON.stringify({ mode: arg("--target") ? "target" : "simulated", status: "FAIL", error: error.message }, null, 2));
  process.exit(1);
}

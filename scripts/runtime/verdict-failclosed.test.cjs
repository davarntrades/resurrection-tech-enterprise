#!/usr/bin/env node
/* ============================================================================
 * Finding A — a malformed, unknown or unavailable engine decision must never
 * authorise execution in ENFORCE mode, and a SHADOW observation must never be
 * presented as an active enforcement decision.
 *
 * The engine response is substituted with a controlled stub (engine.govern),
 * so this test is hermetic: it never contacts any engine, local or hosted.
 *
 *   node scripts/runtime/verdict-failclosed.test.cjs
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-verdict-test-"));
// Belt and braces: even if a stub were bypassed, nothing may reach a real engine.
process.env.GOVERNANCE_URL = "http://127.0.0.1:9";
delete process.env.RUNTIME_ALLOW_UNRECORDED;

const rt = require("../../lib/runtime");
const engine = require("../../lib/runtime/engine");
const { createExecutionGate } = require("../../lib/runtime/execution-adapters/contract");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

let next = null;                       // what the stubbed engine returns / throws
engine.govern = async () => {
  if (next && next.throws) throw new Error(next.throws);
  return next;
};
const reply = (json) => ({ ok: true, status: 200, json });
const permitStep = { verdict: "PERMIT", action_hash: "a1" };
const blockStep = { verdict: "BLOCK", action_hash: "b1" };

// Every case here is malformed, unknown, contradictory or unavailable.
// In ENFORCE the effective verdict must be BLOCK; nothing may become ALLOW.
const FAIL_CLOSED = [
  ["unknown verdict NOT_ALLOWED", reply({ verdict: "NOT_ALLOWED" })],
  ["unknown verdict DISALLOWED", reply({ verdict: "DISALLOWED" })],
  ["unknown verdict NOT_PERMITTED", reply({ verdict: "NOT_PERMITTED" })],
  ["unknown verdict UNPERMITTED", reply({ verdict: "UNPERMITTED" })],
  ["unknown verdict PERMIT_PENDING", reply({ verdict: "PERMIT_PENDING" })],
  ["unknown verdict FOO", reply({ verdict: "FOO" })],
  ["missing verdict", reply({ reason: "no verdict field" })],
  ["null verdict", reply({ verdict: null })],
  ["empty-string verdict", reply({ verdict: "" })],
  ["numeric verdict", reply({ verdict: 1 })],
  ["boolean verdict", reply({ verdict: true })],
  ["object verdict", reply({ verdict: { value: "PERMIT" } })],
  ["array verdict", reply({ verdict: ["PERMIT"] })],
  ["strictest_verdict PERMIT contradicts verdict BLOCK", reply({ verdict: "BLOCK", strictest_verdict: "PERMIT" })],
  ["malformed strictest_verdict with PERMIT verdict", reply({ verdict: "PERMIT", strictest_verdict: "NOT_ALLOWED" })],
  ["local_verdict BLOCK contradicts verdict PERMIT", reply({ verdict: "PERMIT", local_verdict: "BLOCK", global_verdict: "PERMIT" })],
  ["global_verdict BLOCK contradicts verdict PERMIT", reply({ verdict: "PERMIT", local_verdict: "PERMIT", global_verdict: "BLOCK" })],
  ["malformed global_verdict with PERMIT verdict", reply({ verdict: "PERMIT", global_verdict: "MAYBE" })],
  ["[BLOCK, PERMIT] decisions reported as PERMIT", reply({ verdict: "PERMIT", decisions: [blockStep, permitStep] })],
  ["malformed per-step verdict", reply({ verdict: "PERMIT", decisions: [permitStep, { verdict: "N/A" }] })],
  ["blocked flag contradicts PERMIT", reply({ verdict: "PERMIT", blocked: true })],
  ["permitted=false contradicts PERMIT", reply({ verdict: "PERMIT", permitted: false })],
  ["response body null", reply(null)],
  ["response body is a string", reply("PERMIT")],
  ["response body is an array", reply([{ verdict: "PERMIT" }])],
  ["engine HTTP 500", { ok: false, status: 500, error: "engine HTTP 500" }],
  ["engine timeout", { ok: false, status: 0, error: "timeout after 8000ms" }],
  ["engine client throws", { throws: "socket hang up" }],
];

// Unambiguous, well-formed decisions keep working.
const WELL_FORMED = [
  ["PERMIT", reply({ verdict: "PERMIT", strictest_verdict: "PERMIT", local_verdict: "PERMIT", global_verdict: "PERMIT", decisions: [permitStep] }), "ALLOW"],
  ["ALLOW alias", reply({ verdict: "ALLOW" }), "ALLOW"],
  ["ESCALATE", reply({ verdict: "ESCALATE", strictest_verdict: "ESCALATE" }), "ESCALATE"],
  ["BLOCK", reply({ verdict: "BLOCK", strictest_verdict: "BLOCK" }), "BLOCK"],
  ["[PERMIT, BLOCK] strictest", reply({ verdict: "BLOCK", strictest_verdict: "BLOCK", decisions: [permitStep, blockStep] }), "BLOCK"],
];

(async () => {
  const org = await rt.admin.onboardCustomer({ name: "Verdict Test", slug: "verdict-test" });
  const auth = async () => rt.admin.authenticate(org.ingest_key);
  const traj = [{ tool: "transfer_funds", args: { amount: 10, to: "acct-2" } }];
  const gate = createExecutionGate();
  // Bound exactly as lib/runtime/execution-adapters/index.js binds a real grant,
  // so a refusal can only come from the decision, never from a missing binding.
  const binding = { adapter_id: "inert-test-adapter", correlation_id: "corr-1", action_digest: "digest-1" };

  // ── ENFORCE ──────────────────────────────────────────────────────────────
  await rt.admin.setMode(org.production.id, "enforce");
  for (const [name, resp] of FAIL_CLOSED) {
    next = resp;
    let out, threw = null;
    try { out = await rt.gateway.govern({ auth: await auth(), trajectory: traj, domains: ["finance"] }); }
    catch (e) { threw = e.message; }
    ok(!threw, `enforce / ${name}: govern() must return a decision, not throw (threw: ${threw})`);
    if (threw) continue;
    ok(out.verdict === "BLOCK", `enforce / ${name}: expected BLOCK, got ${JSON.stringify(out.verdict)}`);
    let granted = false;
    try { gate.issue(out, binding); granted = true; } catch { /* refused: correct */ }
    ok(!granted, `enforce / ${name}: execution gate must refuse to issue a grant`);
  }
  for (const [name, resp, want] of WELL_FORMED) {
    next = resp;
    const out = await rt.gateway.govern({ auth: await auth(), trajectory: traj, domains: ["finance"] });
    ok(out.verdict === want, `enforce / well-formed ${name}: expected ${want}, got ${JSON.stringify(out.verdict)}`);
  }

  // ── SHADOW ───────────────────────────────────────────────────────────────
  // The caller is not interrupted (verdict ALLOW), but the observation must
  // say what enforcement WOULD have done, and must never release an effect.
  await rt.admin.setMode(org.production.id, "shadow");
  for (const [name, resp] of FAIL_CLOSED) {
    next = resp;
    let out, threw = null;
    try { out = await rt.gateway.govern({ auth: await auth(), trajectory: traj, domains: ["finance"] }); }
    catch (e) { threw = e.message; }
    ok(!threw, `shadow / ${name}: govern() must return an observation, not throw (threw: ${threw})`);
    if (threw) continue;
    ok(out.enforced === false && out.enforcement_active === false && out.shadow_observed_only === true,
      `shadow / ${name}: must be marked observe-only`);
    ok(out.would_be_verdict !== "ALLOW",
      `shadow / ${name}: would_be_verdict must not report ALLOW for a malformed decision (got ${JSON.stringify(out.would_be_verdict)})`);
    let granted = false;
    try { gate.issue(out, binding); granted = true; } catch { /* refused: correct */ }
    ok(!granted, `shadow / ${name}: a shadow ALLOW must never release an effect`);
  }

  console.log(`\nVerdict fail-closed: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFAILURES:"); for (const f of fails) console.log("  ✗ " + f); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });

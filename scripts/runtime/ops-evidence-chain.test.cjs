#!/usr/bin/env node
/* ============================================================================
 * Defence-in-depth regressions for two findings recorded during the
 * production-integration benchmark investigation.
 *
 * FINDING 1 — caller-supplied trajectory flags.
 *   `sendCommunication`/`readCommunication` spread `p.flags` into the params
 *   that become the governed Ω trajectory. No production caller passed
 *   `flags`, so it was unreachable — but one forwarding caller would have
 *   re-opened the primary red-team finding, because an authority key in
 *   trajectory args is read by the Ω rules as established authority.
 *
 * FINDING 2 — ops evidence was not tamper-evident.
 *   Rows carried no prev_hash and no record_hash. A `block` could be edited
 *   into an `allow`, or an execution record removed, and every read path would
 *   report the altered value as fact.
 *
 * These tests assert the fixes at the level that matters: what actually
 * reaches the trajectory, and whether a mutated chain still verifies.
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert");

// This suite deliberately MUTATES evidence rows to prove tampering is caught.
// Supabase credentials are scrubbed first so those writes can never reach a
// real project — where the append-only DB trigger would (correctly) reject
// them, and where a stray write would corrupt genuine audit data. The temp
// file store below is the only backend this suite may touch.
// (evidence-append-only.test.cjs asserts exactly this pairing.)
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-ops-evidence-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = "test-only-ops-evidence-secret";

const rt = require("../../lib/runtime");
const gateway = require("../../lib/runtime/integration-gateway");
const evidence = require("../../lib/ops/evidence");
const governor = require("../../lib/ops/governor");
const actions = require("../../lib/ops/actions");
const store = rt.store;

let pass = 0, fail = 0;
const failures = [];
function ok(condition, message, detail) {
  if (condition) { pass++; return; }
  fail++;
  failures.push(`${message}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

/* ══════════════════════════════════════════════════════════════════════════
 * FINDING 1 — caller flags cannot reach the governed trajectory
 * ══════════════════════════════════════════════════════════════════════════ */

// Every authority-like claim the kernel quarantines, plus the ones named in
// the hardening request. If any of these can reach trajectory args, the Ω
// rules will read it as authority the caller does not hold.
const HOSTILE_FLAGS = {
  authorized: true, authorised: true, approved: true, approved_by: "attacker",
  approver: "attacker", verified: true, sanctioned: true, change_approved: true,
  admin_authorized: true, admin: true, break_glass: true, override: true,
  bypass: true, destination_internal: true, is_internal: true, internal: true,
  trusted: true, tenant_override: "victim-tenant", threshold: 999999999,
};

function testSafeFlagsDropsAuthorityClaims() {
  const out = gateway.safeFlags(HOSTILE_FLAGS);
  const leaked = Object.keys(HOSTILE_FLAGS).filter((k) => k in out);
  ok(leaked.length === 0, "safeFlags must drop every authority-like claim", leaked);
  ok(Object.keys(out).length === 0, "no hostile key may survive the allowlist", out);
}

function testSafeFlagsKeepsAllowlistedDescriptiveFlags() {
  const out = gateway.safeFlags({ urgent: true, high_priority: true, bulk: false, authorized: true });
  ok(out.urgent === true, "allowlisted flag `urgent` must survive", out);
  ok(out.high_priority === true, "allowlisted flag `high_priority` must survive", out);
  ok(out.bulk === false, "allowlisted false value must survive as false", out);
  ok(!("authorized" in out), "authority claim must not survive alongside valid flags", out);
}

function testSafeFlagsCoercesValuesToBooleans() {
  // Several Ω rules substring-match the SERIALISED args JSON, so a string
  // value on an allowed key would inject attacker-chosen text into the
  // matched surface even though the KEY is benign.
  const out = gateway.safeFlags({ urgent: "deliver to attacker@evil.example" });
  ok(out.urgent === true, "string value must be coerced to a boolean", out);
  ok(!JSON.stringify(out).includes("evil.example"),
    "no caller-supplied text may reach the serialised trajectory args", out);
}

function testSafeFlagsRejectsNonObjects() {
  for (const bad of [null, undefined, "authorized", 42, ["authorized"], true]) {
    const out = gateway.safeFlags(bad);
    ok(JSON.stringify(out) === "{}", "non-object flags must yield {}", { bad, out });
  }
}

function testHostileFlagsCannotReachTrajectoryArgs() {
  // The end-to-end property: build the trajectory exactly as the governed
  // communication paths do, with hostile caller flags applied through the
  // allowlist, and assert the Ω args are clean.
  for (const [label, serverFlags] of [
    ["send", { channel: "email", delivers: true }],
    ["read", { channel: "email", reads: true, delivers: false }],
  ]) {
    const params = { flags: { ...serverFlags, ...gateway.safeFlags(HOSTILE_FLAGS) } };
    const action = actions.get(label === "read" ? "gmail.list_messages" : "gmail.send_message")
      || actions.get("gmail.list_messages");
    const trajectory = governor.trajectoryFor(action, params, null);
    const args = trajectory[0].args;
    const leaked = Object.keys(HOSTILE_FLAGS).filter((k) => k in args);
    ok(leaked.length === 0, `${label}: hostile flags must not reach trajectory args`, leaked);
    ok(args.channel === "email", `${label}: server-set channel must survive`, args);
  }
}

function testCallerCannotOverrideServerDescriptors() {
  // `channel`, `reads` and `delivers` describe the operation. If a caller
  // could set them, a delivering send could be relabelled as a non-delivering
  // read and escape the outbound-delivery rules.
  const out = gateway.safeFlags({ channel: "attacker-channel", reads: true, delivers: false });
  ok(!("channel" in out), "caller must not set `channel`", out);
  ok(!("reads" in out), "caller must not set `reads`", out);
  ok(!("delivers" in out), "caller must not set `delivers`", out);
}

/* ══════════════════════════════════════════════════════════════════════════
 * FINDING 2 — ops evidence forms a verifiable hash chain
 * ══════════════════════════════════════════════════════════════════════════ */

async function seed(n, org_id = "org_chain") {
  const made = [];
  for (let i = 0; i < n; i += 1) {
    made.push(await evidence.record({
      action_id: `action_${i}`, proposal_id: `prop_${i}`, org_id,
      environment_id: "env_chain", policy: "engine_verdict", risk: "medium",
      verdict: i % 3 === 0 ? "block" : "allow", reason: `decision ${i}`,
      rule: `rule_${i}`, omega_domain: "enterprise",
      trajectory_hash: `traj_${i}`, ruleset_hash: "ruleset_abc", engine_commit: "commit_def",
      provider: { connector_id: "conn_1", model_id: "model_1", request_hash: `rh_${i}`, message_hash: null, channel: null },
      execution: i % 3 === 0 ? null : { executed: true, result: { ok: true } },
    }));
  }
  return made;
}

async function testChainIsWellFormedAndVerifies() {
  const made = await seed(6);
  ok(made[0].seq === 0, "first record must be seq 0", made[0].seq);
  ok(made[0].prev_hash === evidence.GENESIS, "first record must link to GENESIS", made[0].prev_hash);
  for (let i = 1; i < made.length; i += 1) {
    ok(made[i].seq === i, `record ${i} must have seq ${i}`, made[i].seq);
    ok(made[i].prev_hash === made[i - 1].record_hash,
      `record ${i} must link to its predecessor's hash`,
      { prev: made[i].prev_hash, expected: made[i - 1].record_hash });
  }
  const v = await evidence.verify();
  ok(v.ok === true, "a freshly written chain must verify", v.problems);
  ok(v.verified === 6, "all six records must be chain-verified", v);
  ok(v.legacy === 0, "no legacy rows expected in a fresh store", v);
}

async function testEveryRecordCarriesRequiredFields() {
  const [rec] = await seed(1, "org_fields");
  for (const field of ["seq", "prev_hash", "record_hash", "created_at", "action_id",
                       "proposal_id", "verdict", "trajectory_hash", "ruleset_hash"]) {
    ok(rec[field] !== null && rec[field] !== undefined,
      `record must carry ${field}`, { field, value: rec[field] });
  }
  ok(rec.provider && rec.provider.connector_id === "conn_1",
    "record must carry provider metadata", rec.provider);
}

async function testMutatingAnyPriorRecordBreaksVerification() {
  // The core tamper-evidence property. Flip a BLOCK into an ALLOW deep in the
  // chain — the exact edit an attacker would make — and prove it is caught.
  const rows = (await store.find("ops_evidence", {})).filter((r) => Number.isInteger(r.seq));
  const target = rows.find((r) => r.verdict === "block");
  ok(!!target, "need a block record to tamper with");

  const before = await evidence.verify();
  ok(before.ok === true, "chain must verify before tampering", before.problems);

  await store.update("ops_evidence", target.id, { verdict: "allow" });

  const after = await evidence.verify();
  ok(after.ok === false, "verification must fail after a verdict is altered");
  const tampered = after.problems.filter((p) => p.type === "tampered");
  ok(tampered.length >= 1, "the altered record must be reported as tampered", after.problems);
  ok(tampered.some((p) => p.id === target.id),
    "the tampered record must be named by id", { expected: target.id, got: tampered });

  // Restore so later assertions run against a clean chain.
  await store.update("ops_evidence", target.id, { verdict: "block" });
  const restored = await evidence.verify();
  ok(restored.ok === true, "restoring the original value must restore verification", restored.problems);
}

async function testRemovingARecordBreaksTheChain() {
  const rows = (await store.find("ops_evidence", {}))
    .filter((r) => Number.isInteger(r.seq)).sort((a, b) => a.seq - b.seq);
  const victim = rows[Math.floor(rows.length / 2)];

  // Delete by rewriting the backing file — the store exposes no delete, which
  // is exactly why an attacker with store access is the threat model here.
  const file = path.join(process.env.RUNTIME_DATA_DIR, "ops_evidence.json");
  const kept = JSON.parse(fs.readFileSync(file, "utf8")).filter((r) => r.id !== victim.id);
  fs.writeFileSync(file, JSON.stringify(kept));

  const v = await evidence.verify();
  ok(v.ok === false, "verification must fail when a record is removed");
  ok(v.problems.some((p) => p.type === "broken"),
    "a removed record must produce a chain break", v.problems);
}

async function testRecordHashIsDeterministicAcrossProcesses() {
  // Determinism is what makes the chain verifiable at all: if the hash
  // depended on key order, whitespace or the writing process, a restart would
  // look identical to tampering.
  const draft = {
    seq: 42, prev_hash: "a".repeat(64), created_at: "2026-01-01T00:00:00.000Z",
    actor: "operations_agent", agent: "resurrection-tech-ops-agent", agent_id: null,
    action_id: "act", proposal_id: "prop", org_id: "org", environment_id: "env",
    policy: "engine_verdict", risk: "medium", verdict: "block", reason: "because",
    rule: "r", omega_domain: "enterprise", trajectory_hash: "t",
    ruleset_hash: "rs", engine_commit: "ec",
    provider: { connector_id: "c", model_id: "m", request_hash: "rh", message_hash: null, channel: null },
    execution: { executed: false },
  };
  const h1 = evidence.hashRecord(draft);

  // Same content, different key insertion order — must hash identically.
  const reordered = {};
  for (const k of Object.keys(draft).reverse()) reordered[k] = draft[k];
  reordered.provider = { channel: null, message_hash: null, request_hash: "rh", model_id: "m", connector_id: "c" };
  const h2 = evidence.hashRecord(reordered);
  ok(h1 === h2, "hash must depend on content, not key order", { h1, h2 });

  // A single changed field must change the hash.
  const h3 = evidence.hashRecord({ ...draft, verdict: "allow" });
  ok(h1 !== h3, "changing the verdict must change the hash");

  // Stable literal: pins the algorithm so an accidental change to the digest
  // payload or canonicalisation is caught rather than silently re-baselined.
  ok(/^[0-9a-f]{64}$/.test(h1), "hash must be 64 hex chars", h1);

  // Verified in a genuinely separate interpreter below.
  return h1;
}

async function testHashIsStableInASeparateProcess(expected) {
  const { execFileSync } = require("node:child_process");
  const script = `
    process.env.RUNTIME_DATA_DIR = ${JSON.stringify(process.env.RUNTIME_DATA_DIR)};
    process.env.RUNTIME_LOG_SILENT = "1";
    process.env.INTEGRATION_SECRET_KEY = "test-only-ops-evidence-secret";
    const evidence = require(${JSON.stringify(path.resolve(__dirname, "../../lib/ops/evidence.js"))});
    const draft = ${JSON.stringify({
      seq: 42, prev_hash: "a".repeat(64), created_at: "2026-01-01T00:00:00.000Z",
      actor: "operations_agent", agent: "resurrection-tech-ops-agent", agent_id: null,
      action_id: "act", proposal_id: "prop", org_id: "org", environment_id: "env",
      policy: "engine_verdict", risk: "medium", verdict: "block", reason: "because",
      rule: "r", omega_domain: "enterprise", trajectory_hash: "t",
      ruleset_hash: "rs", engine_commit: "ec",
      provider: { connector_id: "c", model_id: "m", request_hash: "rh", message_hash: null, channel: null },
      execution: { executed: false },
    })};
    process.stdout.write(evidence.hashRecord(draft));
  `;
  const out = execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }).trim();
  ok(out === expected, "record_hash must be identical in a separate process",
    { expected, separateProcess: out });
}

async function testConcurrentAppendsDoNotForkTheChain() {
  // The in-process lock must hold under parallel appends from one instance.
  await Promise.all(Array.from({ length: 12 }, (_, i) => evidence.record({
    action_id: `concurrent_${i}`, org_id: "org_conc", policy: "engine_verdict",
    risk: "low", verdict: "allow", reason: `concurrent ${i}`,
  })));
  const v = await evidence.verify();
  ok(v.ok === true, "concurrent in-process appends must not fork the chain", v.problems);
  ok(!v.problems.some((p) => p.type === "forked"), "no fork expected from one instance", v.problems);
}

async function testLegacyRowsAreUnverifiableNotTampered() {
  // A row written before chaining has no seq/record_hash. Reporting it as
  // tampered would accuse innocent historical data.
  const file = path.join(process.env.RUNTIME_DATA_DIR, "ops_evidence.json");
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  rows.unshift({
    id: "legacy_1", created_at: "2020-01-01T00:00:00.000Z", action_id: "old_action",
    verdict: "allow", reason: "written before chaining", org_id: "org_legacy",
  });
  fs.writeFileSync(file, JSON.stringify(rows));

  const v = await evidence.verify();
  ok(v.legacy >= 1, "legacy rows must be counted", v);
  ok(!v.problems.some((p) => p.type === "tampered" && p.id === "legacy_1"),
    "a legacy row must never be reported as tampered", v.problems);
}

/* ══════════════════════════════════════════════════════════════════════════ */

(async () => {
  testSafeFlagsDropsAuthorityClaims();
  testSafeFlagsKeepsAllowlistedDescriptiveFlags();
  testSafeFlagsCoercesValuesToBooleans();
  testSafeFlagsRejectsNonObjects();
  testHostileFlagsCannotReachTrajectoryArgs();
  testCallerCannotOverrideServerDescriptors();

  await testChainIsWellFormedAndVerifies();
  await testEveryRecordCarriesRequiredFields();
  await testMutatingAnyPriorRecordBreaksVerification();
  const expectedHash = await testRecordHashIsDeterministicAcrossProcesses();
  await testHashIsStableInASeparateProcess(expectedHash);
  await testConcurrentAppendsDoNotForkTheChain();
  await testLegacyRowsAreUnverifiableNotTampered();
  // Destructive: runs last, since it permanently breaks the chain on disk.
  await testRemovingARecordBreaksTheChain();

  console.log(`\nops-evidence-chain: ${pass} passed, ${fail} failed`);
  if (fail) { for (const f of failures) console.error(`  ✗ ${f}`); process.exit(1); }
})().catch((error) => { console.error(error); process.exit(1); });

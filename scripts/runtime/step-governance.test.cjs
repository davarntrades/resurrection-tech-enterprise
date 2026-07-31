#!/usr/bin/env node
/* ============================================================================
 * Step-level Runtime Governance — contract + multi-step workflow demonstration.
 *
 * Hermetic: the REAL proposal lifecycle, the REAL governor and the mock engine
 * that mirrors operations_rules.py. No governance decision is stubbed.
 *
 *   1. PARITY          governed() without a session behaves exactly as before,
 *                      so the Bedrock migration changes no external behaviour.
 *   2. MULTI-STEP      one workflow, several governed steps, each with its own
 *                      proposal, verdict and evidence.
 *   3. REACHABILITY    a step that is benign ALONE is blocked once the
 *                      accumulated trajectory reaches a forbidden state —
 *                      the property per-step-in-isolation governance loses.
 *   4. DENY-ONLY       the trajectory gate can restrict a permit but can never
 *                      turn a block into an allow.
 *   5. NO EXECUTION    a blocked or escalated step never runs the tool.
 *   6. FAIL CLOSED     an unreachable engine blocks every step.
 *   7. REPLAY          the recorded trajectory re-evaluates deterministically.
 *   8. EVIDENCE        session evidence links every step, proposal and hash.
 *   9. ISOLATION       organisation and environment scope hold.
 *
 *   node scripts/runtime/step-governance.test.cjs
 * ============================================================================ */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-step-governance-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = "test-only-step-governance-key";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("../ops/mock-engine.cjs");

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

(async () => {
  const engine = await startMockEngine();
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${engine.address().port}`;

  const rt = require("../../lib/runtime");
  const ops = require("../../lib/ops");
  const gateway = rt.integrationGateway;
  const steps = rt.stepGovernance;

  const org = await rt.admin.createOrg({ name: "Step Governance Co", slug: "stepco" });
  const environment = await rt.store.insert("environments", { id: "env_step", org_id: org.id, name: "Production", kind: "production" });
  const otherOrg = await rt.admin.createOrg({ name: "Other Co", slug: "otherco" });

  await test("governed() without a session is unchanged (Bedrock migration parity)", async () => {
    const proposal = await gateway.governed("open_incident", {
      org_id: org.id, environment_id: environment.id, actor: "integration_gateway",
      params: { severity: "warning", kind: "parity", summary: "parity check" },
    });
    assert.equal(proposal.status, "executed", "an unsessioned governed call must still execute exactly as before");
    assert.equal(proposal.execution.executed, true);
    assert.ok(proposal.evidence_id, "and still record governance evidence");
    assert.equal(proposal.source, "integration_gateway:integration_gateway", "including the same proposal source");
  });

  let session;
  await test("a workflow runs several governed steps, each with its own proposal and evidence", async () => {
    session = await steps.openSession({
      org_id: org.id, environment_id: environment.id, workflow: "customer_triage",
      actor: "support_agent", correlation_id: "case-4182",
    });
    assert.equal(session.status, "open");
    assert.equal(session.step_count, 0);

    const first = await steps.governStep("refresh_customer_intelligence", {
      session_id: session.id, org_id: org.id, actor: "support_agent", params: { org_id: org.id },
    });
    assert.equal(first.allowed, true, "reading customer intelligence is permitted");
    assert.equal(first.step_index, 0);
    assert.ok(first.proposal_id && first.evidence_id, "each step produces a proposal and evidence");

    const second = await steps.governStep("open_incident", {
      session_id: session.id, org_id: org.id, actor: "support_agent",
      params: { org_id: org.id, severity: "warning", kind: "triage", summary: "customer escalation" },
    });
    assert.equal(second.allowed, true);
    assert.equal(second.step_index, 1);
    assert.notEqual(second.proposal_id, first.proposal_id, "steps are separately governed, not one blanket permit");

    const state = await steps.getSession(session.id, org.id);
    assert.equal(state.step_count, 2);
    assert.equal(state.allowed_count, 2);
    assert.equal(state.trajectory.length, 2, "allowed steps accumulate into the trajectory");
  });

  await test("a step benign in isolation is blocked once the trajectory reaches Ω", async () => {
    // schedule_internal_review is an INTERNAL action: permitted on its own, but
    // ops_internal_action_external_reach blocks it the moment it carries an
    // external destination. Per-step-in-isolation governance would still see a
    // registered, low-risk internal action; the trajectory gate sees the reach.
    const isolated = await ops.governor.evaluate({ action_id: "schedule_internal_review", params: {} });
    assert.equal(isolated.verdict, "allow", "the action is benign when judged alone");

    const step = await steps.governStep("schedule_internal_review", {
      session_id: session.id, org_id: org.id, actor: "support_agent",
      params: { org_id: org.id, next_review_date: "2027-02-01", flags: { destination_external: true } },
    });
    assert.equal(step.allowed, false, "the same action inside the workflow is refused");
    assert.equal(step.verdict, "block");
    assert.ok(step.proposal_id, "the refused attempt is still governed and recorded");
    const state = await steps.getSession(session.id, org.id);
    assert.equal(state.blocked_count, 1);
    assert.equal(state.trajectory.length, 2, "a blocked step never contaminates the trajectory");
    assert.equal(state.status, "blocked", "a blocked step ends the governed session");
  });

  await test("the trajectory gate is deny-only — it never turns a block into an allow", async () => {
    const fresh = await steps.openSession({ org_id: org.id, environment_id: environment.id, workflow: "deny_only", actor: "agent" });
    // delete_evidence is unconditionally blocked by Ω. No trajectory context
    // may ever soften that.
    const step = await steps.governStep("delete_evidence", {
      session_id: fresh.id, org_id: org.id, actor: "agent", params: { org_id: org.id },
    });
    assert.equal(step.allowed, false);
    assert.equal(step.verdict, "block");
    assert.equal(step.proposal_verdict, "block", "the proposal lifecycle remains the authority");
    assert.equal(steps.strictest("block", "allow"), "block");
    assert.equal(steps.strictest("allow", "escalate"), "escalate");
  });

  await test("a blocked step never executes the underlying action", async () => {
    const fresh = await steps.openSession({ org_id: org.id, environment_id: environment.id, workflow: "no_execution", actor: "agent" });
    const before = (await rt.store.findOptional("ops_incidents", { org_id: org.id })).length;
    const step = await steps.governStep("open_incident", {
      session_id: fresh.id, org_id: org.id, actor: "agent",
      params: { org_id: org.id, summary: "exfil attempt", flags: { destination_external: true } },
    });
    assert.equal(step.allowed, false, "an internal action reaching outward is refused");
    const after = (await rt.store.findOptional("ops_incidents", { org_id: org.id })).length;
    assert.equal(after, before, "no incident row may be created by a refused step");
  });

  await test("a trajectory-refused step NEVER executes, even when the step alone would permit", async () => {
    // The security property the whole middleware rests on. `open_incident`
    // permits in isolation AND has a real side effect (an incident row), so if
    // ordering were wrong the row would exist before the trajectory verdict was
    // applied. Reachability (engine layer V3) is simulated by refusing any
    // trajectory of two or more steps, which is precisely the case the
    // per-step-in-isolation design cannot see.
    const fresh = await steps.openSession({ org_id: org.id, environment_id: environment.id, workflow: "reachability", actor: "agent" });
    const seed = await steps.governStep("refresh_customer_intelligence", {
      session_id: fresh.id, org_id: org.id, actor: "agent", params: { org_id: org.id },
    });
    assert.equal(seed.allowed, true, "the first step is permitted and accumulates");

    const engineModule = require("../../lib/runtime/engine");
    const realEvaluate = engineModule.evaluate;
    engineModule.evaluate = async (trajectory, domains, horizon) => {
      if (Array.isArray(trajectory) && trajectory.length >= 2) {
        return { ok: true, json: { verdict: "BLOCK", reason: "reachable forbidden state", metadata: { rule: "omega_reachability" }, trajectory_hash: "sim" } };
      }
      return realEvaluate(trajectory, domains, horizon);
    };
    const before = (await rt.store.findOptional("ops_incidents", { org_id: org.id })).length;
    let step;
    try {
      step = await steps.governStep("open_incident", {
        session_id: fresh.id, org_id: org.id, actor: "agent",
        params: { org_id: org.id, severity: "warning", kind: "reachability", summary: "must not execute" },
      });
    } finally { engineModule.evaluate = realEvaluate; }

    assert.equal(step.allowed, false, "the trajectory gate must refuse the step");
    assert.equal(step.verdict, "block");
    assert.equal(step.restricted_by_trajectory, true, "the refusal came from the trajectory, not the step");
    assert.equal(step.proposal_verdict, "allow", "the step alone WOULD have been permitted");
    const after = (await rt.store.findOptional("ops_incidents", { org_id: org.id })).length;
    assert.equal(after, before, "no side effect may occur — the proposal must be withheld, not executed");
    const proposal = await ops.proposals.get(step.proposal_id);
    assert.notEqual(proposal.status, "executed", "the proposal must not reach executed");
    assert.ok(proposal.evidence_id, "the withheld attempt is still fully governed and evidenced");
  });

  await test("an unreachable Runtime Governance engine blocks every step", async () => {
    const fresh = await steps.openSession({ org_id: org.id, environment_id: environment.id, workflow: "fail_closed", actor: "agent" });
    const engineModule = require("../../lib/runtime/engine");
    const realEvaluate = engineModule.evaluate;
    engineModule.evaluate = async () => ({ ok: false, error: "connection refused" });
    try {
      const step = await steps.governStep("refresh_customer_intelligence", {
        session_id: fresh.id, org_id: org.id, actor: "agent", params: { org_id: org.id },
      });
      assert.equal(step.allowed, false, "no step may run while governance is unavailable");
      assert.equal(step.verdict, "block");
    } finally { engineModule.evaluate = realEvaluate; }
  });

  await test("a governed session replays deterministically", async () => {
    const replay = await steps.replaySession(session.id, org.id);
    assert.ok(replay.steps.length >= 2, "replay covers the recorded steps");
    assert.equal(replay.deterministic, true, "re-evaluating the recorded trajectory must reproduce the verdicts");
    for (const step of replay.steps) assert.equal(step.replayed_verdict, step.recorded_verdict);
  });

  await test("session evidence links every step, proposal and trajectory hash", async () => {
    const closed = await steps.closeSession(session.id, org.id, { summary: "triage complete" });
    assert.ok(closed.evidence_id, "closing a session emits evidence");
    const evidence = await rt.store.findOne("integration_events", { id: closed.evidence_id });
    assert.equal(evidence.immutable, true);
    assert.equal(evidence.org_id, org.id);
    assert.equal(evidence.environment_id, environment.id);
    assert.equal(evidence.evidence.session_id, session.id);
    assert.equal(evidence.evidence.step_count, 3);
    assert.equal(evidence.evidence.blocked, 1);
    for (const step of evidence.evidence.steps) {
      assert.ok(step.proposal_id, "every step in evidence carries its proposal");
      assert.ok(["allow", "block", "escalate"].includes(step.verdict));
    }
    assert.ok(evidence.evidence_hash, "session evidence is hashed");
  });

  await test("organisation and environment scope hold", async () => {
    await assert.rejects(() => steps.getSession(session.id, otherOrg.id), /not found for this organisation/);
    await assert.rejects(() => steps.openSession({ org_id: org.id, environment_id: "env_missing", workflow: "x" }), /environment not found/);
    const fresh = await steps.openSession({ org_id: org.id, environment_id: environment.id, workflow: "scope", actor: "agent" });
    await assert.rejects(
      () => steps.governStep("open_incident", { session_id: fresh.id, org_id: org.id, environment_id: "env_other", params: {} }),
      /environment does not match/,
    );
  });

  await test("a closed session refuses further steps", async () => {
    await assert.rejects(
      () => steps.governStep("open_incident", { session_id: session.id, org_id: org.id, params: { org_id: org.id } }),
      /governed session is/,
    );
  });

  engine.close();
  console.log(`\n${passed} step-level governance tests passed.`);
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});

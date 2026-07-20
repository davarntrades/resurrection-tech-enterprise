/* ============================================================================
 * Operations Agent — Agent Coordination Spine test (Pillar 5).
 *
 * Hermetic (mock engine, temp store, no Supabase/LLM). Proves the handoff is a
 * COORDINATION record that rides on the existing proposal → governor → evidence
 * authority path and never becomes an authority of its own:
 *
 *   1. TYPED + DURABLE — a handoff carries originating agent, receiving agent,
 *      organisation, reason, supporting evidence, proposed action, risk; its
 *      governance verdict + approval resolve live from the linked proposal.
 *   2. IDEMPOTENT — re-emitting an identical in-flight handoff is a no-op.
 *   3. SHARED SPINE — with coordination on, a receiving agent drains its inbox
 *      and proposes through the SAME governor; a low-risk step resolves after
 *      an engine PERMIT and advances the shared lifecycle.
 *   4. CHARTER BEFORE ENGINE — a misrouted handoff (action outside the
 *      receiver's charter) is blocked at the agent boundary; it never reaches
 *      governance and becomes a visible work item.
 *   5. STATE MACHINE AUTHORITY — a handoff naming a privileged, out-of-stage
 *      action cannot force the lifecycle; it escalates, and the stage holds.
 *   6. NO ELEVATED TRUST — a high-risk handoff escalates for approval; approval
 *      resolves it through the shared governor on the next cycle.
 *   7. FAIL-CLOSED — engine down → the handoff stays open and is retried
 *      (bounded), never lost, nothing executes.
 *   8. DURABLE CYCLE RECORD — the council run records handoff counters.
 *
 *   node scripts/ops/handoffs.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-ho-test-"));
process.env.OPS_COORDINATION = "1"; // exercise the ingest phase
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("./mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

async function governedTraffic(rt, org_id) {
  const env = (await rt.admin.listEnvironments(org_id))[0] || await rt.admin.createEnvironment({ org_id, mode: "enforce" });
  const key = await rt.admin.issueApiKey({ org_id, environment_id: env.id, role: "ingest" });
  const auth = await rt.admin.authenticate(key.key, { requireRole: "ingest" });
  await rt.gateway.govern({ auth, trajectory: [{ tool: "read_file", args: {} }] }).catch(() => {});
}

async function main() {
  const srv = await startMockEngine();
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  const H = ops.handoffs;
  console.log("\nAgent Coordination Spine test (mock engine on :" + srv.address().port + ")\n");

  // ── 1. Typed + durable handoff ────────────────────────────────────────────
  const org = await rt.admin.createOrg({ name: "Meridian", slug: "meridian" });
  const { handoff: h1, created } = await H.create({
    org_id: org.id, from_agent: "sales", to_agent: "deployment", kind: "transition",
    reason: "pilot approved — hand to Deployment", proposed_action: { action_id: "activate_monitoring", params: { org_id: org.id } },
  });
  ok(created === true, "a handoff is created");
  ok(h1.from_agent === "sales" && h1.to_agent === "deployment" && h1.org_id === org.id, "handoff carries originating + receiving agent + organisation");
  ok(h1.reason && h1.proposed_action.action_id === "activate_monitoring" && h1.risk === "medium" && h1.status === "open", "handoff carries reason, proposed action, risk classification, status", { risk: h1.risk, status: h1.status });

  // ── 2. Idempotent ─────────────────────────────────────────────────────────
  const again = await H.create({ org_id: org.id, from_agent: "sales", to_agent: "deployment", kind: "transition", reason: "dup", proposed_action: { action_id: "activate_monitoring", params: { org_id: org.id } } });
  ok(again.created === false && again.handoff.id === h1.id, "re-emitting an identical in-flight handoff is a no-op (idempotent)", again.created);
  ok((await H.list({ to_agent: "deployment" })).length === 1, "no duplicate handoff row");

  // ── 3. Shared spine: a lead's governed step flows through the governor ─────
  const lead = await rt.admin.createOrg({ name: "Aster", slug: "aster" });
  const run1 = await ops.agents.dispatch({ trigger: "test" });
  ok(run1.coordinating === true && !run1.error, "council runs in coordination mode");
  const leadTl = await H.timeline(lead.id);
  const qHand = leadTl.find((h) => h.proposed_action && h.proposed_action.action_id === "record_questionnaire");
  ok(qHand && qHand.from_agent === "lifecycle" && qHand.to_agent === "sales", "a lead's first governed step is a handoff into Sales (from lifecycle)", qHand && { f: qHand.from_agent, t: qHand.to_agent });
  ok(qHand && qHand.status === "resolved" && qHand.governance && qHand.governance.verdict === "allow", "the receiving agent drained it through the shared governor (engine PERMIT → allow → resolved)", qHand && { s: qHand.status, v: qHand.governance && qHand.governance.verdict });
  ok((await ops.workflow.state(lead.id)).current_stage === "questionnaire", "the shared lifecycle actually advanced one governed stage");

  // ── 4. Charter before engine: misrouted handoff blocks at the boundary ────
  const mis = await H.create({ org_id: org.id, from_agent: "operator", to_agent: "finance", kind: "task", reason: "misrouted", proposed_action: { action_id: "deploy_runtime", params: { org_id: org.id } } });
  const propsBefore = (await ops.proposals.list({ org_id: org.id })).length;
  await ops.agents.dispatch({ trigger: "test" });
  const misAfter = await H.get(mis.handoff.id);
  ok(misAfter.status === "blocked", "a handoff whose action is outside the receiver's charter is blocked (misrouted work item)", misAfter.status);
  const deployProps = (await ops.proposals.list({ org_id: org.id })).filter((p) => p.action_id === "deploy_runtime");
  ok(deployProps.length === 0, "the misrouted action never became a proposal (never reached the engine)", deployProps.length);

  // ── 5. State-machine authority: an out-of-stage transition can't be forced ─
  const lead2 = await rt.admin.createOrg({ name: "Cirrus", slug: "cirrus" });
  const premature = await H.create({ org_id: lead2.id, from_agent: "operator", to_agent: "deployment", kind: "transition", reason: "premature deploy", proposed_action: { action_id: "deploy_runtime", params: { org_id: lead2.id } } });
  await ops.agents.dispatch({ trigger: "test" });
  ok((await ops.workflow.state(lead2.id)).current_stage !== "deployment", "a handoff naming an out-of-stage transition does not jump the lifecycle", (await ops.workflow.state(lead2.id)).current_stage);
  ok((await H.get(premature.handoff.id)).status === "blocked", "the out-of-stage transition is refused as out-of-order (state machine stays authoritative)");
  const dep = (await ops.proposals.list({ org_id: lead2.id })).find((p) => p.action_id === "deploy_runtime");
  ok(!dep, "the out-of-order transition never became a governed proposal (lifecycle actions run only via the state machine)", dep && dep.status);

  // ── 6. No elevated trust: high-risk handoff escalates, approval resolves ──
  const live = await rt.admin.createOrg({ name: "Borealis", slug: "borealis" });
  await rt.engagement.set(live.id, { stage: "enterprise_integration" });
  await governedTraffic(rt, live.id);
  ok((await ops.workflow.state(live.id)).current_stage === "runtime_monitoring", "Borealis derives to runtime_monitoring");
  await ops.agents.dispatch({ trigger: "test" });
  const renewalHand = (await H.timeline(live.id)).find((h) => h.proposed_action && h.proposed_action.action_id === "initiate_renewal");
  ok(renewalHand && renewalHand.status === "escalated" && renewalHand.to_agent === "customer_success", "the high-risk renewal handoff ESCALATED for approval (not auto-run), attributed to Customer Success", renewalHand && { s: renewalHand.status, t: renewalHand.to_agent });
  await ops.proposals.approve(renewalHand.proposal_id, { actor: "davarn@control-room" });
  await ops.agents.dispatch({ trigger: "test" }); // reconcile picks up the approval
  const renewalAfter = await H.get(renewalHand.id);
  ok(renewalAfter.status === "resolved" && renewalAfter.approval && renewalAfter.approval.actor === "davarn@control-room", "operator approval resolves the handoff through the shared governor (approver on record)", { s: renewalAfter.status, a: renewalAfter.approval && renewalAfter.approval.actor });
  ok((await ops.workflow.state(live.id)).current_stage === "renewal", "the approved handoff advanced the shared lifecycle to renewal");

  // ── 7. Durable cycle record carries handoff counters ──────────────────────
  ok(run1.handoffs && typeof run1.handoffs.created === "number", "the council cycle record carries handoff counters", run1.handoffs);

  // ── 8. Fail-closed: engine down → handoff stays open + retried, not lost ──
  const blockedOrg = await rt.admin.createOrg({ name: "Halcyon", slug: "halcyon" });
  srv.close();
  await new Promise((r) => setTimeout(r, 50));
  await ops.agents.dispatch({ trigger: "test" });
  const tl = await H.timeline(blockedOrg.id);
  const stuck = tl.find((h) => h.proposed_action && h.proposed_action.action_id === "record_questionnaire");
  ok(stuck && (stuck.status === "open") && stuck.attempts >= 1, "engine unreachable → the handoff stays open and is retried (bounded), never lost", stuck && { s: stuck.status, a: stuck.attempts });
  ok((await ops.workflow.state(blockedOrg.id)).current_stage === "lead", "nothing executed while the engine was down (stage holds)");

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

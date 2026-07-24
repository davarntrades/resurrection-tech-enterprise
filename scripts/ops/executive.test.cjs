/* ============================================================================
 * Operations Agent — Executive Command test (Phase 4).
 *
 * Hermetic (mock engine, temp store). Proves the autonomy control plane and its
 * SAFETY ASYMMETRY:
 *
 *   1. MODE GATES THE COUNCIL — emergency_pause halts the cycle (nothing
 *      proposed or executed); observe proposes nothing but still plans (routes
 *      handoffs); recommend proposes but HOLDS every proposal for an operator;
 *      execute_low_risk (default) executes low-risk work exactly as before.
 *   2. PER-AGENT PAUSE — a paused specialist is skipped; the rest of the council
 *      runs; resuming restores it.
 *   3. SAFETY ASYMMETRY — lowering autonomy applies directly (isRaise=false) and
 *      is audited; raising autonomy routes through the governed set_autonomy_mode
 *      action, which the Ω rule ops_unauthorized_autonomy_change BLOCKs without
 *      approval (→ escalate), and only an operator approval executes the raise.
 *   4. FAIL-SAFE BRAKE — setMode records the change to the admin audit trail and
 *      never depends on the engine (emergency pause always works).
 *   5. OPERATOR ACTIONS UNAFFECTED — even under emergency_pause, an
 *      operator-initiated proposal still executes (the gate is on the council).
 *   6. PERFORMANCE IS DETERMINISTIC + READ-ONLY — identical inputs → identical
 *      report (modulo timestamp).
 *
 *   node scripts/ops/executive.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-exec-cmd-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.OPS_COORDINATION; // default (direct) path

const { startMockEngine } = require("./mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

async function main() {
  const srv = await startMockEngine();
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  const { autonomy } = ops;
  console.log("\nExecutive Command test (mock engine on :" + srv.address().port + ")\n");

  // Fresh customer at the head of the lifecycle → Sales' governed next step is
  // record_questionnaire (low-risk, auto-executable after PERMIT).
  const freshLead = async (name) => {
    const org = await rt.admin.createOrg({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
    const st = await ops.workflow.state(org.id);
    return { org, stage: st.current_stage };
  };

  // ── 0. Default posture reproduces 4.0 behaviour ───────────────────────────
  const cur0 = await autonomy.current();
  ok(cur0.mode === "execute_low_risk" && cur0.default === true, "default autonomy mode is execute_low_risk (today's behaviour)", cur0.mode);

  const a = await freshLead("Acme Systems");
  ok(a.stage === "lead", "a fresh customer starts at the lead stage", a.stage);
  const rDefault = await ops.agents.dispatch({ trigger: "test" });
  ok(rDefault.autonomy_mode === "execute_low_risk" && !rDefault.halted, "dispatch runs in execute_low_risk mode", rDefault.autonomy_mode);
  ok(rDefault.outcomes.executed >= 1, "council auto-executes low-risk work in execute_low_risk", rDefault.outcomes);

  // ── 1. Emergency pause halts the council entirely ─────────────────────────
  await autonomy.setMode("emergency_pause", { actor: "op" });
  const b = await freshLead("Beacon Data");
  const rPause = await ops.agents.dispatch({ trigger: "test" });
  ok(rPause.halted === true, "emergency_pause halts the council", rPause.halted);
  ok((rPause.proposals || []).length === 0 && rPause.outcomes.executed === 0 && rPause.outcomes.escalated === 0, "nothing is proposed or executed while halted", rPause.outcomes);
  const bStage = (await ops.workflow.state(b.org.id)).current_stage;
  ok(bStage === "lead", "the halted customer never advanced", bStage);

  // ── 2. Observe proposes nothing but still plans (routes handoffs) ─────────
  await autonomy.setMode("observe", { actor: "op" });
  const c = await freshLead("Cardinal Health");
  const rObserve = await ops.agents.dispatch({ trigger: "test" });
  ok(!rObserve.halted && rObserve.outcomes.executed === 0 && rObserve.outcomes.escalated === 0, "observe mode proposes nothing", rObserve.outcomes);
  ok(rObserve.handoffs.created >= 1, "observe mode still plans — handoff records are emitted", rObserve.handoffs);
  ok((await ops.workflow.state(c.org.id)).current_stage === "lead", "observed customer never advanced", true);

  // ── 3. Recommend proposes but HOLDS every proposal for the operator ───────
  await autonomy.setMode("recommend", { actor: "op" });
  const d = await freshLead("Delta Freight");
  const rRec = await ops.agents.dispatch({ trigger: "test" });
  ok(rRec.outcomes.executed === 0 && rRec.outcomes.escalated >= 1, "recommend mode holds proposals for approval (escalated, none executed)", rRec.outcomes);
  const held = (await ops.proposals.list({ limit: 200 })).find((p) => p.org_id === d.org.id && p.status === "escalated");
  ok(!!held && held.decision && held.decision.held === true, "a held proposal is marked held (autonomy_hold_recommend_mode)", held && held.decision && held.decision.hold_policy);
  ok((await ops.workflow.state(d.org.id)).current_stage === "lead", "held customer did not advance (no execution)", true);

  // ── 4. Per-agent pause skips one specialist; the rest run ─────────────────
  await autonomy.setMode("execute_low_risk", { actor: "op" });
  await autonomy.pauseAgent("sales", { actor: "op" });
  const e = await freshLead("Everest Logistics");
  const rPausedAgent = await ops.agents.dispatch({ trigger: "test" });
  ok(rPausedAgent.per_agent.sales.paused === true && rPausedAgent.per_agent.sales.proposed === 0, "a paused specialist proposes nothing", rPausedAgent.per_agent.sales);
  ok((await ops.workflow.state(e.org.id)).current_stage === "lead", "the paused specialist's customer did not advance", true);
  ok((await autonomy.isPaused("sales")) === true, "isPaused reports the paused specialist", true);
  await autonomy.resumeAgent("sales", { actor: "op" });
  const rResumed = await ops.agents.dispatch({ trigger: "test" });
  ok((await ops.workflow.state(e.org.id)).current_stage !== "lead" || rResumed.per_agent.sales.executed >= 1, "resuming the specialist restores its governed work", rResumed.per_agent.sales);

  // ── 5. Safety asymmetry: raising autonomy is governed ─────────────────────
  await autonomy.setMode("execute_low_risk", { actor: "op" });
  ok(autonomy.isRaise("execute_low_risk", "governed_autonomy") === true, "isRaise flags an increase in autonomy");
  ok(autonomy.isRaise("execute_low_risk", "observe") === false, "isRaise treats a decrease as not-a-raise");

  // A bare raise proposal is BLOCKED by Ω → escalated for operator sign-off.
  const raiseProp = await ops.proposals.propose({ action_id: "set_autonomy_mode",
    params: { mode: "governed_autonomy", actor: "op", flags: { raising_autonomy: true } } });
  ok(raiseProp.status === "escalated" && raiseProp.decision.rule === "ops_unauthorized_autonomy_change",
    "an un-approved autonomy raise is blocked by Ω and escalates", { s: raiseProp.status, r: raiseProp.decision && raiseProp.decision.rule });
  ok((await autonomy.current()).mode === "execute_low_risk", "the mode did NOT change on the un-approved raise", true);

  // Operator approval re-evaluates WITH the authorisation flags → engine permits → executes.
  const approved = await ops.proposals.approve(raiseProp.id, { actor: "davarn@control-room" });
  ok(approved.status === "executed", "an operator-approved raise executes through Runtime Governance", approved.status);
  ok((await autonomy.current()).mode === "governed_autonomy", "the approved raise actually raised the autonomy mode", true);

  // ── 6. Lowering applies directly (fail-safe brake) + is audited ───────────
  const lowered = await autonomy.setMode("emergency_pause", { actor: "davarn@control-room" });
  ok(lowered.mode === "emergency_pause", "lowering autonomy applies directly (no approval needed)", lowered.mode);
  const audits = await rt.adminaudit.list({ limit: 50 });
  const modeAudit = audits.find((x) => x.action === "ops_autonomy_mode_changed" && x.meta && x.meta.to === "emergency_pause");
  ok(!!modeAudit && modeAudit.meta.raised === false, "the mode change is recorded in the admin audit trail (raised=false)", modeAudit && modeAudit.meta);

  // ── 7. Operator actions are never gated by the council mode ───────────────
  // Still in emergency_pause: an operator-initiated proposal executes normally.
  const opAction = await ops.proposals.propose({ action_id: "open_incident",
    params: { severity: "warning", kind: "operator_test", summary: "operator action under pause", org_id: a.org.id } });
  ok(opAction.status === "executed", "an operator-initiated action executes even under emergency_pause", opAction.status);

  // ── 8. Performance metrics are deterministic + read-only ──────────────────
  await autonomy.setMode("execute_low_risk", { actor: "op" });
  const r1 = await ops.performance.report();
  const r2 = await ops.performance.report();
  const strip = (r) => { const { generated_at, ...rest } = r; return JSON.stringify(rest); };
  ok(strip(r1) === strip(r2), "the performance report is deterministic (identical inputs → identical output)");
  ok(Array.isArray(r1.agents) && r1.agents.length === ops.agents.AGENTS.length && r1.autonomy.mode === "execute_low_risk", "the report carries per-agent metrics + current autonomy state", { n: r1.agents.length, mode: r1.autonomy.mode });

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

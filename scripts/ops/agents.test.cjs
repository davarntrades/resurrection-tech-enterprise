/* ============================================================================
 * Operations Agent — Multi-Agent Core test (Pillar 4).
 *
 * Hermetic (mock engine, temp store, no Supabase/LLM). Proves the five
 * specialists add division of labour + attribution but NO new trust:
 *
 *   1. ROSTER — five chartered specialists (Sales / Deployment / Customer
 *      Success / Compliance / Finance), each with owned lifecycle stages +
 *      a catalog charter + observation kinds.
 *   2. CHARTER = DENY-BY-DEFAULT BEFORE THE ENGINE — an agent cannot even
 *      PROPOSE an action outside its mandate; it is refused at the agent
 *      boundary and never reaches Runtime Governance. Refuse-class actions are
 *      outside every charter.
 *   3. ATTRIBUTION — a chartered proposal carries agent_id on both the proposal
 *      and its write-once evidence.
 *   4. AGENTS OPERATE WITHIN THE STATE MACHINE — they advance the SAME governed
 *      lifecycle (Pillar 3); Sales advances a lead's next governed transition,
 *      it does not invent one.
 *   5. NO ELEVATED TRUST — a high-risk action a specialist is chartered for
 *      still ESCALATES for human approval; approval re-evaluates through the
 *      shared governor and executes, attribution preserved.
 *   6. SHARED SPINE + DEDUPE — every specialist proposal flows through the one
 *      governor/proposals/evidence path; re-running the council does not
 *      double-propose in-flight work.
 *   7. FAIL-CLOSED — engine down → specialist proposals block, nothing runs.
 *
 *   node scripts/ops/agents.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-agents-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("./mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

// Drive a single real governed evaluation so an org derives to runtime_monitoring.
async function generateGovernedTraffic(rt, org_id) {
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
  const A = ops.agents;
  console.log("\nMulti-Agent Core test (mock engine on :" + srv.address().port + ")\n");

  // ── 1. Roster ──────────────────────────────────────────────────────────────
  const roster = await A.roster();
  ok(roster.agents.length === 11, "eleven governed departments in the roster", roster.agents.length);
  const ids = roster.agents.map((a) => a.id).sort();
  ok(JSON.stringify(ids) === JSON.stringify(["architecture", "compliance", "customer_success", "deployment", "finance", "incident_response", "partner", "policy_engineering", "risk_intelligence", "sales", "security"]), "roster is the six founding specialists + five Guardian OS departments", ids);
  ok(roster.agents.every((a) => a.charter && Array.isArray(a.charter.actions) && a.charter.actions.length > 0), "every agent has a non-empty action charter");
  ok(A.STAGE_OWNER.lead === "sales" && A.STAGE_OWNER.runtime_monitoring === "customer_success" && A.STAGE_OWNER.deployment === "deployment", "lifecycle stage ownership is partitioned across agents", A.STAGE_OWNER);

  // ── 2. Charter = deny-by-default BEFORE the engine ────────────────────────
  const org = await rt.admin.createOrg({ name: "Northwind", slug: "northwind" });
  const blocked = await A.agentPropose("sales", { action_id: "deploy_runtime", params: { org_id: org.id }, org_id: org.id });
  ok(blocked.ok === false && blocked.charter_blocked === true, "Sales cannot even PROPOSE deploy_runtime (outside charter)", blocked);
  const noProp = await ops.proposals.list({ org_id: org.id });
  ok(noProp.length === 0, "charter-blocked action never became a proposal (never reached the engine)", noProp.length);
  const refuseBlocked = await A.agentPropose("compliance", { action_id: "delete_evidence", params: {}, org_id: org.id });
  ok(refuseBlocked.charter_blocked === true, "refuse-class action is outside every charter (agent boundary refuses it)", refuseBlocked.charter_blocked);
  ok(A.authorized("deployment", "deploy_runtime") && !A.authorized("finance", "deploy_runtime"), "authorized() reflects the charter partition");

  // ── 3. Attribution on proposal + evidence ─────────────────────────────────
  const chartered = await A.agentPropose("sales", { action_id: "create_recommendation", params: { org_id: org.id, title: "Reach out", severity: "low" }, org_id: org.id });
  ok(chartered.ok && chartered.proposal.status === "executed", "a chartered low-risk action executes through the shared spine", chartered.proposal && chartered.proposal.status);
  ok(chartered.proposal.agent_id === "sales", "proposal carries the owning agent_id", chartered.proposal.agent_id);
  const ev = await ops.evidence.search({ org_id: org.id, agent_id: "sales" });
  ok(ev.length >= 1 && ev[0].agent_id === "sales", "evidence is attributed to the agent", ev[0] && ev[0].agent_id);

  // ── 4. Agents advance the SHARED state machine (do not invent) ─────────────
  const lead = await rt.admin.createOrg({ name: "Aster", slug: "aster" });
  const c = await A.council();
  const salesForAster = (c.by_agent.sales || []).find((r) => r.org_id === lead.id && r.lifecycle);
  ok(salesForAster && salesForAster.decision === "record_questionnaire", "Sales' governed step for a lead is the state-machine's next action (record_questionnaire)", salesForAster && salesForAster.decision);
  const run1 = await A.dispatch({ trigger: "test" });
  ok(!run1.error && run1.mode === "council", "council cycle completes", run1.error);
  const asterState = await ops.workflow.state(lead.id);
  ok(asterState.current_stage === "questionnaire", "the lead actually advanced one governed stage via its owning agent", asterState.current_stage);
  const asterTransition = (await ops.workflow.history(lead.id))[0];
  ok(asterTransition && asterTransition.initiated_by.includes("sales"), "the transition log attributes the advance to the Sales agent", asterTransition && asterTransition.initiated_by);

  // ── 5. No elevated trust: chartered high-risk still escalates ──────────────
  const live = await rt.admin.createOrg({ name: "Borealis", slug: "borealis" });
  await rt.engagement.set(live.id, { stage: "enterprise_integration" });
  await generateGovernedTraffic(rt, live.id);
  const liveState = await ops.workflow.state(live.id);
  ok(liveState.current_stage === "runtime_monitoring", "Borealis derives to runtime_monitoring (CS territory)", liveState.current_stage);
  const c2 = await A.council();
  const csRenewal = (c2.by_agent.customer_success || []).find((r) => r.org_id === live.id && r.decision === "initiate_renewal");
  ok(csRenewal && csRenewal.requires_approval === true, "Customer Success' governed step is the high-risk initiate_renewal (requires approval)", csRenewal && csRenewal.requires_approval);
  await A.dispatch({ trigger: "test" });
  const renewalOf = async () => (await ops.proposals.list({ status: "escalated" })).filter((p) => p.action_id === "initiate_renewal" && p.org_id === live.id);
  const escalated = await renewalOf();
  ok(escalated.length === 1 && escalated[0].agent_id === "customer_success", "the renewal ESCALATED (not auto-run) and is attributed to Customer Success", escalated.map((p) => p.agent_id));

  // ── 6. Shared spine + dedupe: an in-flight transition isn't re-proposed ────
  await A.dispatch({ trigger: "test" }); // re-run while the renewal is still escalated
  const escalated2 = await renewalOf();
  ok(escalated2.length === 1, "re-running the council does NOT duplicate an in-flight escalated transition (shared dedupe)", escalated2.length);

  const approved = await ops.proposals.approve(escalated[0].id, { actor: "davarn@control-room" });
  ok(approved.status === "executed" && approved.agent_id === "customer_success", "operator approval executes through the shared governor, attribution preserved", { status: approved.status, agent: approved.agent_id });
  ok((await ops.workflow.state(live.id)).current_stage === "renewal", "the approved renewal advanced the shared lifecycle to renewal");

  // ── 7. Workload + summary reflect attribution ─────────────────────────────
  const wl = await A.workload();
  ok(wl.sales.total >= 1 && wl.customer_success.total >= 1, "workload attributes proposals per agent", { sales: wl.sales.total, cs: wl.customer_success.total });
  const sum = await A.summary();
  ok(sum.total_agents === 11 && Array.isArray(sum.agents), "summary lists all agents for the briefing");

  // ── 8. Fail-closed: engine down → specialist proposals block ──────────────
  const fresh = await rt.admin.createOrg({ name: "Blocked Co", slug: "blocked-co" });
  srv.close();
  await new Promise((r) => setTimeout(r, 50));
  const failClosed = await A.agentPropose("sales", { action_id: "create_recommendation", params: { org_id: fresh.id, title: "x", severity: "low" }, org_id: fresh.id });
  ok(failClosed.ok && failClosed.proposal.status === "blocked" && failClosed.proposal.decision.policy === "fail_closed_engine_unavailable",
    "engine unreachable → specialist proposal blocks (fail-closed), attribution intact", { status: failClosed.proposal && failClosed.proposal.status, agent: failClosed.proposal && failClosed.proposal.agent_id });

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

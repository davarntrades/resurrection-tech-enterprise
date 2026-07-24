/* ============================================================================
 * Guardian OS — Enterprise Departments test (five new governed departments).
 *
 * Hermetic (mock engine, temp store). Proves the five new departments —
 * Incident Response, Runtime Risk Intelligence, Enterprise Architecture, Policy
 * Engineering, Partner/MSSP — are first-class governed council specialists that
 * own work through the SAME spine and add no new trust:
 *
 *   1. FIRST-CLASS COUNCIL MEMBERS — all five appear in the roster with charters
 *      and participate in a governed council cycle, attributed by agent_id.
 *   2. POLICY ENGINEERING, GOVERNED — the department DRAFTS policy (an inert
 *      artifact) autonomously, but ACTIVATING a policy is denied-by-default
 *      (Ω rule ops_unauthorized_policy_activation) and escalates for operator
 *      sign-off; the agent is not chartered to activate policy at all.
 *   3. INCIDENT RESPONSE coordinates real open incidents; PARTNER surfaces
 *      registry attention; ARCHITECTURE surfaces assessment gaps — every action
 *      an existing internal/low-risk governed action (no elevated trust).
 *   4. NO BYPASS — every department response flows proposal → governor →
 *      evidence, exactly like the founding specialists.
 *
 *   node scripts/ops/departments.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-dept-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.OPS_COORDINATION;

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
  console.log("\nGuardian OS Departments test (mock engine on :" + srv.address().port + ")\n");

  const org = await rt.admin.createOrg({ name: "Meridian Corp", slug: "meridian" });

  // ── 0. All five departments are chartered council members ─────────────────
  const roster = await ops.agents.roster();
  const ids = roster.agents.map((a) => a.id);
  const NEW = ["incident_response", "risk_intelligence", "architecture", "policy_engineering", "partner"];
  ok(NEW.every((id) => ids.includes(id)), "all five Guardian OS departments are in the roster", ids);
  const pe = roster.agents.find((a) => a.id === "policy_engineering");
  ok(pe.charter.actions.some((a) => a.id === "draft_policy") && !pe.charter.actions.some((a) => a.id === "activate_policy"),
    "Policy Engineering is chartered to DRAFT policy but NOT to activate it", pe.charter.actions.map((a) => a.id));

  // ── 1. Seed department signals, then run a governed council cycle ──────────
  for (let i = 0; i < 3; i++) await ops.proposals.propose({ action_id: "share_credentials", org_id: org.id, params: {} }); // policy-gap + refusals
  await ops.incidents.open({ severity: "critical", kind: "ops_incident", summary: "runtime anomaly", org_id: org.id, opened_by: "test" });
  await ops.partners.register({ name: "Sentinel MSSP", kind: "mssp", renewals_due: 1, health: "watch", deployments: 2 });

  const run = await ops.agents.dispatch({ trigger: "test" });
  ok(run.per_agent.incident_response && run.per_agent.incident_response.proposed >= 1, "Incident Response coordinated the open incident", run.per_agent.incident_response);
  ok(run.per_agent.policy_engineering && run.per_agent.policy_engineering.proposed >= 1, "Policy Engineering drafted a policy from the refusal pattern", run.per_agent.policy_engineering);
  ok(run.per_agent.partner && run.per_agent.partner.proposed >= 1, "Partner/MSSP surfaced the partner needing attention", run.per_agent.partner);
  ok(run.per_agent.architecture && run.per_agent.architecture.proposed >= 1, "Enterprise Architecture flagged the assessment gap", run.per_agent.architecture);

  const props = await ops.proposals.list({ limit: 500 });
  const deptProps = props.filter((p) => NEW.includes(p.agent_id));
  ok(deptProps.length >= 4 && deptProps.every((p) => !!p.evidence_id), "every department response flows through the governed spine (attributed + evidence)", deptProps.length);

  // ── 2. Policy Engineering DRAFTED a policy (inert artifact) ────────────────
  const pePropId = deptProps.find((p) => p.agent_id === "policy_engineering" && p.action_id === "draft_policy").id;
  const peProp = await ops.proposals.get(pePropId);
  ok(peProp.status === "executed" && peProp.execution.verified === true, "draft_policy executed + verified through the spine (inert artifact)", peProp.status);
  const draftId = peProp.execution.result.policy_id;
  ok((await ops.policies.get(draftId)).status === "draft", "the drafted policy exists as a DRAFT (nothing activated)", true);

  // ── 3. Activation is governed (deny-by-default → operator sign-off) ────────
  const activateBare = await ops.proposals.propose({ action_id: "activate_policy", params: { policy_id: draftId } });
  ok(activateBare.status === "escalated" && activateBare.decision.rule === "ops_unauthorized_policy_activation",
    "activating a policy without approval is BLOCKED by Ω → escalates for sign-off", { s: activateBare.status, r: activateBare.decision && activateBare.decision.rule });
  ok((await ops.policies.get(draftId)).status === "draft", "the policy did NOT activate on the un-approved attempt", true);
  const approved = await ops.proposals.approve(activateBare.id, { actor: "davarn@control-room" });
  ok(approved.status === "executed", "operator approval activates the policy through Runtime Governance", approved.status);
  ok((await ops.policies.get(draftId)).status === "activation_authorized", "the policy is now activation-authorised (kernel edit stays a human step)", true);

  // ── 4. The agent cannot activate policy (charter deny-by-default) ─────────
  const agentActivate = await ops.agents.agentPropose("policy_engineering", { action_id: "activate_policy", params: { policy_id: draftId } });
  ok(agentActivate.ok === false && agentActivate.charter_blocked === true, "Policy Engineering CANNOT propose activation (charter deny-by-default)", agentActivate);

  // ── 4. Guardian homepage answers the new executive questions ──────────────
  const home = await ops.guardian.homepage();
  const eq = home.executive_questions;
  ok(!!eq && Array.isArray(eq.incidents_need_attention) && eq.incidents_need_attention.length >= 1, "homepage answers ‘what incidents need attention’", eq && eq.incidents_need_attention.length);
  ok(eq.policy_to_create_next.some((g) => g.rule === "ops_credential_sharing") || eq.policy_drafts_pending.length >= 1, "homepage answers ‘what policy to create next’", eq.policy_to_create_next);
  ok(eq.partner_needs_attention.some((p) => p.name === "Sentinel MSSP"), "homepage answers ‘which partner needs attention’", eq.partner_needs_attention);
  ok(typeof eq.architecture_gaps.coverage_pct === "number" && eq.governance_friction && typeof eq.governance_friction.awaiting_approval === "number", "homepage answers architecture gaps + governance friction");

  // ── 5. Twin auto-includes the new departments (no second source of truth) ─
  const twin = await ops.twin.build();
  ok(twin.departments.length === ops.agents.AGENTS.length && NEW.every((id) => twin.departments.some((d) => d.id === id)),
    "the Enterprise Twin auto-includes the new departments", twin.departments.length);

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

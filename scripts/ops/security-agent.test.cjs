/* ============================================================================
 * Operations Agent — Security & Threat Agent test (5.0 Phase 5, Expanded Council).
 *
 * Hermetic (mock engine, temp store). Proves the Expanded Agent Council's first
 * new specialist — a cross-cutting Security & Threat watchdog that turns
 * GOVERNED REFUSALS into alerts + incidents, on the shared governance spine:
 *
 *   1. GOVERNED REFUSAL → OBSERVATION — an attempt the engine BLOCKs (evidence
 *      destruction, credential exposure, internal-only action reaching out) is
 *      recorded as evidence, and the deterministic observer turns it into a
 *      security.governed_refusal signal (+ a rollup) from the evidence alone.
 *   2. NO ELEVATED TRUST — the Security agent is chartered only for internal,
 *      low-risk actions (raise_alert / open_incident / notify_operator); a
 *      privileged action is refused at the agent boundary (charter deny-by-default).
 *   3. GOVERNED RESPONSE — the council dispatches the Security agent, which opens
 *      an incident + raises an alert THROUGH the shared governor (evidence recorded,
 *      attributed to agent_id=security). It reacts, it never mutates customer state.
 *   4. WATCHDOG, NOT AUTHORITY — the agent surfaces what governance already
 *      refused; it cannot itself execute a privileged action.
 *
 *   node scripts/ops/security-agent.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-sec-test-"));
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
  console.log("\nSecurity & Threat Agent test (mock engine on :" + srv.address().port + ")\n");

  const org = await rt.admin.createOrg({ name: "Ironclad Corp", slug: "ironclad" });

  // ── 0. Roster: Security is chartered for internal actions only ────────────
  const roster = await ops.agents.roster();
  const sec = roster.agents.find((a) => a.id === "security");
  ok(!!sec && sec.title === "Security & Threat Agent", "Security & Threat Agent is in the expanded council", sec && sec.title);
  ok(sec && sec.charter.stages.length === 0, "Security owns no lifecycle stage (cross-cutting)", sec && sec.charter.stages);
  const secActionIds = sec.charter.actions.map((a) => a.id).sort();
  ok(JSON.stringify(secActionIds) === JSON.stringify(["notify_operator", "open_incident", "raise_alert"]), "Security is chartered ONLY for internal, low-risk actions", secActionIds);
  ok(sec.charter.actions.every((a) => a.risk === "low" && !a.refuse), "no privileged/refuse action in the Security charter", sec.charter.actions);

  // ── 1. Generate governed refusals: the engine BLOCKs each attempt ─────────
  const pCred = await ops.proposals.propose({ action_id: "share_credentials", org_id: org.id, params: {} });
  ok(pCred.status === "blocked" && pCred.decision.rule === "ops_credential_sharing", "credential-sharing attempt is refused by Ω", { s: pCred.status, r: pCred.decision && pCred.decision.rule });
  const pDel = await ops.proposals.propose({ action_id: "delete_evidence", org_id: org.id, params: {} });
  ok(pDel.status === "blocked" && pDel.decision.rule === "ops_evidence_destruction", "evidence-destruction attempt is refused by Ω", { s: pDel.status, r: pDel.decision && pDel.decision.rule });
  const pReach = await ops.proposals.propose({ action_id: "open_incident", org_id: org.id, params: { summary: "exfil", org_id: org.id, flags: { destination_external: true } } });
  ok(pReach.status === "blocked" && pReach.decision.rule === "ops_internal_action_external_reach", "internal-only action reaching out is refused by Ω", { s: pReach.status, r: pReach.decision && pReach.decision.rule });

  // ── 2. Deterministic observer turns refusals into security signals ────────
  const snap = await ops.observers.observe();
  const rollup = snap.observations.find((o) => o.kind === "security.governed_refusals");
  const perAttempt = snap.observations.filter((o) => o.kind === "security.governed_refusal");
  ok(!!rollup && rollup.data.count >= 3, "a security.governed_refusals rollup counts the blocked attempts", rollup && rollup.data);
  ok(perAttempt.length >= 3, "one security.governed_refusal signal per blocked attempt", perAttempt.length);
  ok(rollup && rollup.data.by_rule && rollup.data.by_rule.ops_credential_sharing >= 1 && rollup.data.by_rule.ops_evidence_destruction >= 1, "the rollup carries the rule mix of what was refused", rollup && rollup.data.by_rule);

  // ── 3. No elevated trust: a privileged action is charter-blocked ──────────
  const escalate = await ops.agents.agentPropose("security", { action_id: "deploy_runtime", params: {}, org_id: org.id });
  ok(escalate.ok === false && escalate.charter_blocked === true, "Security cannot propose a privileged action (charter deny-by-default)", escalate);

  // ── 4. Governed response: the council dispatches Security through the spine ─
  const run = await ops.agents.dispatch({ trigger: "test" });
  const secStats = run.per_agent.security;
  ok(!!secStats && secStats.proposed >= 1, "the Security agent proposed governed responses this cycle", secStats);
  const secProps = (await ops.proposals.list({ limit: 200 })).filter((p) => p.agent_id === "security");
  ok(secProps.length >= 1, "responses are attributed to agent_id=security", secProps.length);
  ok(secProps.every((p) => ["raise_alert", "open_incident", "notify_operator"].includes(p.action_id)), "every Security response is an internal action (never privileged)", secProps.map((p) => p.action_id));
  ok(secProps.some((p) => p.action_id === "open_incident" && p.status === "executed"), "Security opened an incident through the governor (executed after PERMIT)", secProps.map((p) => [p.action_id, p.status]));
  ok(secProps.every((p) => !!p.evidence_id), "every Security response left governance evidence");

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

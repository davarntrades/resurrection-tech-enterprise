/* ============================================================================
 * Operations Agent — grounded briefing + Control Room surface test.
 *
 * Proves, hermetically (mock engine, temp file store, no Supabase, no LLM):
 *   1. NO FAKE DATA — an empty platform produces honest empty-state messages
 *      and unavailable sources say "not configured" (never invented counts).
 *   2. GROUNDING — every briefing statement is backed by real records: counts
 *      equal record-set sizes, sourceIds reference the actual rows, and the
 *      generic follow-up source surfaces operator-recorded notes verbatim.
 *   3. GOVERNANCE — recommended actions never execute directly; approval from
 *      the briefing surface re-evaluates through the engine (verdict recorded).
 *   4. ASK ROUTER — "Morning." and direct prompts answer from operational data
 *      only; unknown prompts get the supported-intent list, nothing else.
 *   5. SYSTEMS — status board reports not_configured with required env vars,
 *      and the mode derivation (on-demand vs continuous) uses real run records.
 *
 *   node scripts/ops/briefing.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-brief-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.OPS_GITHUB_REPOS;
delete process.env.OPS_VERCEL_TOKEN;
delete process.env.OPS_VERCEL_PROJECT;
delete process.env.NEXT_PUBLIC_SITE_URL;
delete process.env.OPS_WORKER_MODE;
process.env.RUNTIME_OPERATOR_NAME = "Davarn";

const { startMockEngine } = require("./mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}
const itemById = (b, id) => b.items.find((i) => i.id === id);

async function main() {
  const srv = await startMockEngine();
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;

  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");

  console.log("\nGrounded briefing test (mock engine on :" + srv.address().port + ")\n");

  // ── 1. Empty platform: honest empty states, no fabricated numbers ─────────
  let b = await ops.briefing.briefing();
  ok(b.greeting.text.includes("Davarn"), "greeting uses configured operator name", b.greeting.text);
  ok(/^Good (morning|afternoon|evening), Davarn\.$/.test(b.greeting.text), "greeting is contextual, not hard-coded", b.greeting.text);
  ok(itemById(b, "customers.new").message === "No new customers this week.", "empty state: customers", itemById(b, "customers.new").message);
  ok(itemById(b, "customers.new").count === 0, "empty customer count is 0, not invented");
  const aqItem = itemById(b, "audits.requests");
  ok(aqItem.available === false && aqItem.message.includes("Supabase not configured"), "questionnaires honestly unavailable without Supabase", aqItem.message);
  const asmItem = itemById(b, "assessments.completed");
  ok(asmItem.available === false, "assessments honestly unavailable without Supabase");
  ok(itemById(b, "followups.email").message.includes("Gmail integration not configured"), "email integration honestly reported");
  ok(b.counts.completed_questionnaires.unavailable === true && b.counts.completed_questionnaires.value === null, "unavailable count is null (n/a), never a number");
  ok(b.recommended_actions.length === 0, "no fabricated recommendations on empty platform", b.recommended_actions.length);
  ok(b.text.includes("No immediate actions require your attention."), "empty recommendations message present");
  ok(b.mode.mode === "on_demand", "mode derives to on-demand with no scheduled runs", b.mode.mode);

  // Every item carries provenance fields.
  ok(b.items.every((i) => i.sourceType && (i.evidenceUrl || i.available === false)), "every briefing item has sourceType + evidence link or availability reason");

  // ── 2. Real records ground the statements ─────────────────────────────────
  const orgA = await rt.admin.createOrg({ name: "Aster Systems", slug: "aster" });
  const orgB = await rt.admin.createOrg({ name: "Quantm", slug: "quantm" });
  await rt.engagement.addNote(orgB.id, "Quantm has replied — wants pilot scope call Thursday");
  await rt.engagement.set(orgA.id, { stage: "enterprise_assessment" });
  await rt.reports.generate({ org_id: orgA.id, period: "weekly" });

  b = await ops.briefing.briefing();
  const cust = itemById(b, "customers.new");
  ok(cust.count === 2 && cust.message.startsWith("2 new customers"), "customer count equals org records", cust.message);
  ok(cust.sourceIds.includes(orgA.id) && cust.sourceIds.includes(orgB.id), "customer sourceIds reference the actual org rows");
  ok(cust.sourceIds.length === cust.count, "sourceIds length equals stated count");
  const fu = itemById(b, "followups.notes");
  ok(fu.count === 1 && fu.message.includes("Quantm"), "operator note surfaces in follow-ups (generic source, no hard-coded names)", fu.message);
  ok(fu.sourceIds.length === 1 && fu.sourceIds[0].startsWith(orgB.id), "follow-up provenance points at the engagement note");
  const pilots = itemById(b, "pilots.ready");
  ok(pilots.count === 1 && pilots.message.includes("Aster Systems"), "pilot readiness derived from stage + governance material", pilots.message);
  ok(typeof pilots.reason === "string" && pilots.reason.includes("stage in"), "pilot-readiness rule is disclosed, not asserted");
  const promoteRec = b.recommended_actions.find((r) => r.proposed_action?.action_id === "promote_to_pilot");
  ok(promoteRec && promoteRec.org === "Aster Systems", "pilot recommendation generated from the derived record");
  ok(promoteRec.governance_status === "not_yet_proposed", "recommendation is not an execution — must go through governance");

  // ── 3. Escalation + blocked items reach the briefing with provenance ──────
  const esc = await ops.proposals.propose({ action_id: "deploy_runtime", params: {}, org_id: orgA.id });
  ok(esc.status === "escalated", "deployment proposal escalates (engine authorisation rule)");
  const blockedP = await ops.proposals.propose({ action_id: "share_credentials", params: {}, org_id: orgA.id });
  ok(blockedP.status === "blocked", "credential sharing blocks unconditionally");

  b = await ops.briefing.briefing();
  const dep = itemById(b, "approvals.deployments");
  ok(dep && dep.count === 1 && dep.sourceIds.includes(esc.id), "deployments-awaiting-approval grounded in the proposal row", dep && dep.sourceIds);
  const blk = itemById(b, "governance.blocked");
  ok(blk.count === 1 && blk.message.includes("share credentials"), "blocked item names the actual blocked action", blk.message);
  ok(blk.sourceIds.length === 1 && blk.sourceIds[0] === blockedP.evidence_id, "blocked item cites the evidence row id");
  ok(b.counts.deployments_awaiting_approval.value === 1, "deployment count from records");
  ok(b.counts.pending_approvals.value === 1, "pending approvals count from records");
  const approveRec = b.recommended_actions.find((r) => r.proposed_action?.kind === "decide_proposal");
  ok(approveRec && approveRec.proposed_action.proposal_id === esc.id, "top recommendation is the escalated proposal with its id");
  const reviewRec = b.recommended_actions.find((r) => r.proposed_action?.kind === "review_blocked");
  ok(reviewRec && reviewRec.governance_status === "blocked", "blocked review recommendation present");

  // ── 4. Approval from the surface still passes through the engine ──────────
  const approved = await ops.proposals.approve(esc.id, { actor: "davarn@control-room" });
  ok(approved.status !== "escalated" && approved.decision.engine.verdict === "PERMIT", "approval re-evaluated by engine (PERMIT with flags)", approved.decision.engine.verdict);
  ok(approved.operator.actor === "davarn@control-room", "approving operator identity recorded in proposal + evidence");
  const evRows = await ops.evidence.search({ org_id: orgA.id, action_id: "deploy_runtime" });
  ok(evRows.some((e) => e.actor === "davarn@control-room" && e.verdict === "allow"), "evidence row carries the operator identity for the approval");

  // ── 5. Ask router: restricted intents over authorised data ────────────────
  const morning = await ops.ask.ask("Morning.");
  ok(morning.ok && morning.intent === "briefing", "\"Morning.\" routes to the briefing intent");
  ok(morning.text.startsWith(b.greeting.salutation), "briefing answer opens with the contextual greeting");
  const attention = await ops.ask.ask("What needs my attention?");
  ok(attention.ok && attention.intent === "attention", "attention prompt routes correctly");
  const blocked = await ops.ask.ask("Show blocked actions.");
  ok(blocked.ok && blocked.intent === "blocked" && blocked.evidence.length >= 1, "blocked prompt returns real evidence rows");
  const approvals = await ops.ask.ask("What is awaiting approval?");
  ok(approvals.ok && approvals.intent === "approvals", "approvals prompt routes correctly");
  const railway = await ops.ask.ask("Why is Railway unhealthy?");
  ok(railway.ok && railway.intent === "system_health" && railway.systems.some((s) => s.component === "railway"), "railway prompt returns the railway status card");
  const pilotQ = await ops.ask.ask("Which organisation is ready for a pilot?");
  ok(pilotQ.ok && pilotQ.intent === "pilot_ready" && pilotQ.text.includes("Aster Systems"), "pilot prompt answers from the derived record");
  const offTopic = await ops.ask.ask("write me a poem about dragons");
  ok(offTopic.ok === false && Array.isArray(offTopic.supported), "off-topic prompt refused with supported-intent list (not a chatbot)");

  // ── 6. Systems board: honest statuses + env requirements + mode ───────────
  const board = await ops.systems.statusBoard();
  const sys = (c) => board.systems.find((s) => s.component === c);
  ok(sys("runtime_governance").status === "healthy", "engine reported healthy (mock up)");
  ok(sys("github").status === "not_configured" && sys("github").required_env.length > 0, "github not_configured with required env vars", sys("github").required_env);
  ok(sys("vercel").status === "not_configured", "vercel not_configured without credentials");
  ok(sys("supabase").status === "not_configured", "supabase not_configured on file store");
  ok(sys("llm_reasoning").status !== "healthy", "LLM never reported healthy without verification", sys("llm_reasoning").status);
  ok(sys("openclaw").status === "not_configured", "openclaw not connected by default");
  ok(sys("email").status === "not_configured", "email integration honestly not configured");

  // OpenClaw readiness transitions from real client-key records.
  const issued = await ops.clients.issue({ label: "openclaw", scopes: ["briefing", "status"] });
  let board2 = await ops.systems.statusBoard();
  ok(board2.systems.find((s) => s.component === "openclaw").status === "awaiting_credentials", "issued-but-unused openclaw key → awaiting_credentials");
  await ops.clients.authenticate(issued.key, { requireScope: "briefing" });
  await new Promise((r) => setTimeout(r, 30)); // last_used_at write is fire-and-forget
  board2 = await ops.systems.statusBoard();
  ok(board2.systems.find((s) => s.component === "openclaw").status === "healthy", "used openclaw key → connected");

  // Continuous mode derives from a real scheduled run record.
  await rt.store.insert("ops_runs", { trigger: "cron", status: "completed", started_at: rt.store.nowISO(), finished_at: rt.store.nowISO(), observations: 0, recommendations: 0, proposals: 0, outcomes: {}, reasoning_source: "heuristic", error: null });
  const m2 = await ops.systems.mode();
  ok(m2.mode === "continuous_active", "recent scheduled cycle → continuous mode", m2.mode);

  srv.close();
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

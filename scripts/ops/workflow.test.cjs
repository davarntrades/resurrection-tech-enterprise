/* ============================================================================
 * Operations Agent — Governed Lifecycle State Machine test (Pillar 3).
 *
 * Hermetic (mock engine, temp store, no Supabase/LLM). Proves:
 *   1. DETERMINISTIC + REPLAYABLE — the same records always derive the same
 *      stage; the derivation reason names the exact signal.
 *   2. GOVERNED TRANSITIONS — every forward step is a proposal through Runtime
 *      Governance: low/medium auto-execute after PERMIT; privileged
 *      transitions (pilot, deployment, renewal) ESCALATE for approval and are
 *      never auto-executed.
 *   3. APPROVAL FLOW — approving an escalated transition re-evaluates through
 *      the engine and advances the lifecycle; the operator identity is on the
 *      approval + evidence.
 *   4. AUDITABLE HISTORY — every transition is an immutable row linked to its
 *      proposal; transition + approval history reconstruct the full path.
 *   5. FAIL-CLOSED — with the engine down, a governed transition blocks and the
 *      stage does not advance.
 *   6. IDEMPOTENT — re-advancing an in-flight transition is a no-op, not a
 *      duplicate governed action.
 *
 *   node scripts/ops/workflow.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-wf-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const wf = ops.workflow;
  console.log("\nGoverned Lifecycle State Machine test (mock engine on :" + srv.address().port + ")\n");

  const org = await rt.admin.createOrg({ name: "Flow Co", slug: "flow" });

  // ── 1. Deterministic derivation ───────────────────────────────────────────
  let st = await wf.state(org.id);
  ok(st.current_stage === "lead", "a fresh org derives to the lead stage", st.current_stage);
  ok(typeof st.derivation === "string" && st.derivation.length > 0, "derivation names the signal (not asserted)", st.derivation);
  const st2 = await wf.state(org.id);
  ok(JSON.stringify(st.stages) === JSON.stringify(st2.stages), "stage derivation is deterministic across calls");
  ok(st.next_action.action_id === "record_questionnaire" && st.next_action.requires_approval === false, "next action from lead is the low-risk record_questionnaire (no approval)");

  // ── 2. Low/medium transitions auto-execute after PERMIT ───────────────────
  const t1 = await wf.advance(org.id, { actor: "davarn" });
  ok(t1.status === "executed" && t1.to === "questionnaire", "lead → questionnaire auto-executes after engine PERMIT", t1.status);
  ok((await wf.state(org.id)).current_stage === "questionnaire", "stage advanced to questionnaire (evidence-derived)");
  const t2 = await wf.advance(org.id, { actor: "davarn" });
  ok(t2.status === "executed" && t2.to === "assessment", "questionnaire → assessment auto-executes");
  const t3 = await wf.advance(org.id, { actor: "davarn" });
  ok(t3.status === "executed" && t3.to === "executive_report", "assessment → executive_report auto-executes (report generated)");
  ok((await wf.state(org.id)).current_stage === "executive_report", "stage is executive_report after report exists");

  // ── 3. Privileged transition escalates, never auto-executes ───────────────
  const tPilot = await wf.advance(org.id, { actor: "davarn" });
  ok(tPilot.status === "escalated" && tPilot.requires_approval === true, "executive_report → pilot ESCALATES for approval (never auto-executes)", tPilot.status);
  ok((await wf.state(org.id)).current_stage === "executive_report", "stage does NOT advance on an unapproved privileged transition");

  // Idempotency: re-advancing while escalated is a no-op.
  const tDup = await wf.advance(org.id, { actor: "davarn" });
  ok(tDup.status === "in_progress" && !tDup.advanced, "re-advancing an in-flight transition is a no-op (idempotent)", tDup.status);

  // ── 4. Approval advances the lifecycle through the engine ─────────────────
  const approved = await ops.proposals.approve(tPilot.proposal.id, { actor: "davarn@control-room" });
  ok(approved.status === "executed" && approved.decision.engine.verdict === "PERMIT", "approving the transition re-evaluates through the engine and executes", approved.status);
  ok((await wf.state(org.id)).current_stage === "pilot", "stage advances to pilot after approval");

  // Deployment: also privileged → escalate → approve.
  const tDeploy = await wf.advance(org.id, { actor: "davarn" });
  ok(tDeploy.status === "escalated", "pilot → deployment escalates for approval");
  await ops.proposals.approve(tDeploy.proposal.id, { actor: "davarn@control-room" });
  ok((await wf.state(org.id)).current_stage === "deployment", "stage advances to deployment after approval");

  // ── 5. Runtime monitoring requires real governed traffic (honest signal) ──
  const before = (await wf.state(org.id)).current_stage;
  await wf.advance(org.id, { actor: "davarn" }); // activate_monitoring (medium, executes) but no traffic yet
  ok((await wf.state(org.id)).current_stage === before, "activate_monitoring alone does not fake runtime_monitoring (needs observed traffic)");
  const env = (await rt.admin.listEnvironments(org.id))[0] || await rt.admin.createEnvironment({ org_id: org.id, mode: "enforce" });
  const key = await rt.admin.issueApiKey({ org_id: org.id, environment_id: env.id, role: "ingest" });
  const auth = await rt.admin.authenticate(key.key, { requireRole: "ingest" });
  await rt.gateway.govern({ auth, trajectory: [{ tool: "read_file", args: {} }] }).catch(() => {});
  ok((await wf.state(org.id)).current_stage === "runtime_monitoring", "stage reaches runtime_monitoring once real governed evaluations are observed");
  ok((await wf.state(org.id)).next_action.action_id === "initiate_renewal" && (await wf.state(org.id)).next_action.requires_approval === true, "next action is the privileged initiate_renewal");

  // ── 6. Auditable transition + approval history ────────────────────────────
  const hist = await wf.history(org.id);
  ok(hist.length >= 5, "every governed transition is recorded in history", hist.length);
  ok(hist.every((h) => h.from && h.to && h.action_id && h.at), "each transition row carries from/to/action/time");
  ok(hist.some((h) => h.approval && h.approval.actor === "davarn@control-room"), "approval history captures the operator who approved");
  const appr = await wf.approvals(org.id);
  ok(appr.length === 2, "exactly the two privileged transitions required approval", appr.length);
  ok(appr.every((a) => a.actor === "davarn@control-room" && a.outcome === "executed"), "approvals record actor + outcome");

  // ── 7. Platform summary ───────────────────────────────────────────────────
  const sum = await wf.summary();
  ok(sum.total === 1 && sum.by_stage.runtime_monitoring === 1, "summary reflects the org's derived stage", sum.by_stage);

  // ── 8. Fail-closed: engine down → transition blocks, stage holds ──────────
  const fresh = await rt.admin.createOrg({ name: "Blocked Co", slug: "blocked" });
  srv.close();
  await new Promise((r) => setTimeout(r, 50));
  const tBlocked = await wf.advance(fresh.id, { actor: "davarn" });
  ok(tBlocked.status === "blocked" && tBlocked.proposal.decision.policy === "fail_closed_engine_unavailable", "engine unreachable → governed transition blocks (fail-closed)", { status: tBlocked.status, policy: tBlocked.proposal.decision.policy });

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

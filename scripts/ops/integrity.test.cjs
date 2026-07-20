/* ============================================================================
 * Operations Agent — Coordination Integrity verifier test (5.0 Phase 1 aid).
 *
 * Hermetic (mock engine, temp store, coordination on). Proves the read-only
 * verifier that validates the coordination spine in production:
 *
 *   1. CLEAN → GREEN — after real governed council cycles, every handoff
 *      reconciles with its proposal, evidence, verdict + audit → ok:true.
 *   2. APPROVAL AUDIT — an operator-approved handoff is matched to its
 *      ops_approve_proposal admin-audit record.
 *   3. DRIFT → RED — a tampered handoff status (that no longer matches its
 *      proposal) is caught as a status_drift anomaly.
 *   4. GHOST EXECUTION — a blocked handoff pointing at an executed proposal is
 *      flagged; the verifier never rewrites anything (read-only).
 *
 *   node scripts/ops/integrity.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-integ-test-"));
process.env.OPS_COORDINATION = "1";
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
  const store = rt.store;
  console.log("\nCoordination Integrity verifier test (mock engine on :" + srv.address().port + ")\n");

  // Drive real governed council cycles: a lead advances + a live org escalates.
  await rt.admin.createOrg({ name: "Aster", slug: "aster" });
  const live = await rt.admin.createOrg({ name: "Borealis", slug: "borealis" });
  await rt.engagement.set(live.id, { stage: "enterprise_integration" });
  const env = await rt.admin.createEnvironment({ org_id: live.id, mode: "enforce" });
  const key = await rt.admin.issueApiKey({ org_id: live.id, environment_id: env.id, role: "ingest" });
  const auth = await rt.admin.authenticate(key.key, { requireRole: "ingest" });
  await rt.gateway.govern({ auth, trajectory: [{ tool: "read_file", args: {} }] }).catch(() => {});
  await ops.agents.dispatch({ trigger: "test" });
  await ops.agents.dispatch({ trigger: "test" });

  // ── 1. Clean → green ──────────────────────────────────────────────────────
  let rep = await ops.integrity.check({ sinceDays: 7 });
  ok(rep.ok === true && rep.anomalies.length === 0, "a healthy coordination spine reports integrity ok", rep.anomalies);
  ok(rep.handoffs_checked > 0 && rep.council_cycles.recent >= 2, "the report counts handoffs and council cycles", { h: rep.handoffs_checked, c: rep.council_cycles.recent });
  ok(JSON.stringify(rep.invariants.sort()) === JSON.stringify(["attribution", "audit", "evidence", "linkage", "no_ghost_exec", "status", "verdict"]), "all invariants are exercised", rep.invariants);

  // ── 2. Approval audit reconciliation ──────────────────────────────────────
  const esc = (await ops.handoffs.list({ status: "escalated" }))[0];
  ok(!!esc, "there is an escalated handoff to approve", !!esc);
  await ops.proposals.approve(esc.proposal_id, { actor: "davarn@control-room" });
  await ops.agents.dispatch({ trigger: "test" }); // reconcile resolves the handoff
  rep = await ops.integrity.check({ sinceDays: 7 });
  ok(rep.audit.approvals_seen >= 1 && rep.audit.approvals_audited === rep.audit.approvals_seen, "every operator approval is matched to an admin-audit record", rep.audit);
  ok(rep.ok === true, "still green after a genuine approval flows through", rep.anomalies);

  // ── 3. Status drift → red ─────────────────────────────────────────────────
  const resolved = (await ops.handoffs.list({ status: "resolved" })).find((h) => h.proposal_id);
  // Tamper directly in the store: flip a resolved handoff to escalated without
  // touching its (executed) proposal. The verifier must catch the mismatch.
  await store.update("ops_handoffs", resolved.id, { status: "escalated" });
  rep = await ops.integrity.check({ sinceDays: 7 });
  ok(rep.ok === false && rep.anomalies.some((a) => a.type === "status_drift" && a.handoff_id === resolved.id), "a handoff whose status no longer matches its proposal is flagged (status_drift)", rep.anomalies.map((a) => a.type));
  await store.update("ops_handoffs", resolved.id, { status: "resolved" }); // restore

  // ── 4. Ghost execution → red ──────────────────────────────────────────────
  const executed = (await ops.handoffs.list({ status: "resolved" })).find((h) => h.proposal_id);
  await store.update("ops_handoffs", executed.id, { status: "blocked" });
  rep = await ops.integrity.check({ sinceDays: 7 });
  ok(rep.anomalies.some((a) => a.type === "ghost_execution" && a.handoff_id === executed.id), "a blocked handoff pointing at an executed proposal is flagged (ghost_execution)", rep.anomalies.map((a) => a.type));
  const stillThere = await ops.handoffs.get(executed.id);
  ok(stillThere.status === "blocked", "the verifier is read-only — it never rewrote the tampered record");

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

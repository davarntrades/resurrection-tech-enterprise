/* ============================================================================
 * Operations Agent — pipeline test.
 *
 * Runs the full Observe → Reason → Propose → Governance → Execute → Evidence
 * pipeline against a LOCAL mock governance engine that mirrors the semantics
 * of governance-service/operations_rules.py (deny-by-default + unconditional
 * rules), so the suite is hermetic. Also asserts the fail-closed path with the
 * engine down. Mirrors the style of scripts/runtime/*.test.cjs.
 *
 *   node scripts/ops/agent.test.cjs
 * ============================================================================ */
"use strict";
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

// Hermetic store + no LLM (heuristic reasoning path).
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Mock engine mirroring operations_rules.py semantics ─────────────────────
const UNCONDITIONAL = new Map([
  ["delete_evidence", "ops_evidence_destruction"],
  ["purge_evidence", "ops_evidence_destruction"],
  ["share_credentials", "ops_credential_sharing"],
  ["share_api_key", "ops_credential_sharing"],
]);
const AUTH_RULES = new Map([
  ["send_confidential_report", ["ops_unauthorized_report_delivery", ["report_delivery_authorized", "delivery_authorized"]]],
  ["deploy_runtime", ["ops_unauthorized_deployment", ["deployment_approved", "change_approved"]]],
  ["create_organisation", ["ops_unauthorized_org_creation", ["onboarding_verified", "operator_approved"]]],
  ["promote_to_pilot", ["ops_unauthorized_pilot_promotion", ["pilot_approved", "operator_approved"]]],
  ["modify_customer", ["ops_unauthorized_customer_modification", ["change_authorized", "operator_approved"]]],
  ["export_documents", ["ops_unauthorized_document_export", ["export_authorized"]]],
]);

function mockVerdict(steps) {
  for (const s of steps || []) {
    const tool = String(s.tool || "").toLowerCase();
    const args = s.args || {};
    if (UNCONDITIONAL.has(tool)) return { verdict: "BLOCK", rule: UNCONDITIONAL.get(tool) };
    if (AUTH_RULES.has(tool)) {
      const [rule, flags] = AUTH_RULES.get(tool);
      if (!flags.some((f) => args[f] === true || String(args[f]).toLowerCase() === "true")) {
        return { verdict: "BLOCK", rule };
      }
    }
  }
  return { verdict: "PERMIT", rule: null };
}

function startMockEngine() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        if (req.url === "/health") return res.end(JSON.stringify({ status: "ok", engine_commit: "mock", live_sectors: [] }));
        if (req.url === "/v1/evaluate") {
          let json = {}; try { json = JSON.parse(body); } catch { /* */ }
          const v = mockVerdict(json.trajectory);
          return res.end(JSON.stringify({
            verdict: v.verdict, permitted: v.verdict === "PERMIT", blocked: v.verdict === "BLOCK",
            layer: v.rule ? "V5+" : "V1", reason: v.rule ? `violates ${v.rule}` : "no Ω intersection",
            omega_domain: v.rule ? "enterprise" : null, trajectory_hash: "mockhash",
            reachability_distance: null, metadata: v.rule ? { rule: v.rule } : {},
          }));
        }
        res.statusCode = 404; res.end("{}");
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

// ── Tiny assert harness ─────────────────────────────────────────────────────
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

async function main() {
  const srv = await startMockEngine();
  const port = srv.address().port;
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${port}`;

  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");

  console.log("\nOperations Agent pipeline test (mock engine on :" + port + ")\n");

  // 1. Health reflects a reachable engine.
  const h = await ops.health();
  ok(h.status === "ok" && h.governance_engine.reachable === true, "health: engine reachable");

  // 2. Unknown action → deny-by-default, no execution.
  const unknown = await ops.governor.evaluate({ action_id: "rm_rf_everything" });
  ok(unknown.verdict === "block" && unknown.policy === "unknown_action", "unknown action blocked", unknown);

  // 3. Low-risk action → engine PERMIT → auto-executed with evidence.
  const org = await rt.admin.createOrg({ name: "Test Corp", slug: "test-corp" });
  const p1 = await ops.proposals.propose({
    action_id: "create_recommendation",
    params: { org_id: org.id, title: "Test recommendation", detail: "from test", severity: "low" },
    org_id: org.id,
  });
  ok(p1.status === "executed", "low-risk allowed action auto-executes", p1.status);
  ok(p1.execution && p1.execution.executed === true, "execution result recorded");
  ok(!!p1.evidence_id, "evidence recorded for executed proposal");
  const recs = await rt.recommendations.list({ org_id: org.id });
  ok(recs.length === 1, "recommendation actually created via runtime module");

  // 4. High-risk action without authorisation → engine BLOCK on auth rule → ESCALATED.
  const p2 = await ops.proposals.propose({
    action_id: "promote_to_pilot", params: { org_id: org.id }, org_id: org.id,
  });
  ok(p2.status === "escalated", "unauthorised pilot promotion escalates to operator", p2.status);
  ok(p2.decision.policy === "authorization_required", "escalation policy is authorization_required", p2.decision.policy);

  // 5. Operator approval → re-evaluated WITH flags → engine PERMIT → executed.
  const approved = await ops.proposals.approve(p2.id, { actor: "davarn@resurrection-tech", note: "approved in test" });
  ok(approved.status === "executed", "approved proposal executes", approved.status);
  ok(approved.operator && approved.operator.actor === "davarn@resurrection-tech", "approving operator recorded");
  const eng = await rt.engagement.get(org.id);
  ok(eng && eng.stage === "limited_pilot", "engagement stage actually promoted", eng && eng.stage);

  // 6. Refuse-class action → engine BLOCK, unconditional; approval cannot cure.
  const p3 = await ops.proposals.propose({ action_id: "delete_evidence", params: {}, org_id: org.id });
  ok(p3.status === "blocked", "evidence deletion blocked", p3.status);
  let approveFailed = false;
  try { await ops.proposals.approve(p3.id, { actor: "operator" }); } catch { approveFailed = true; }
  ok(approveFailed, "blocked proposal cannot be approved");

  // 7. Operator deny path.
  const p4 = await ops.proposals.propose({ action_id: "modify_customer", params: { org_id: org.id, patch: { plan: "enterprise" } }, org_id: org.id });
  ok(p4.status === "escalated", "customer modification escalates");
  const denied = await ops.proposals.deny(p4.id, { actor: "operator", note: "not now" });
  ok(denied.status === "denied", "operator deny is terminal", denied.status);

  // 8. Evidence search + summary cover all of the above.
  const ev = await ops.evidence.search({ org_id: org.id });
  ok(ev.length >= 4, "evidence rows recorded for every decision", ev.length);
  const sum = await ops.evidence.summary({});
  ok(sum.by_verdict.block >= 2 && sum.by_verdict.allow >= 2, "evidence summary counts verdicts", sum.by_verdict);

  // 9. Full agent cycle (heuristic reasoning; engine up). Should never throw.
  const cycle = await ops.agent.runCycle({ trigger: "test" });
  ok(!cycle.error && cycle.run_id, "agent cycle completes", cycle.error);
  ok(cycle.reasoning_source === "heuristic", "reasoning falls back to heuristics without API key");

  // 10. Briefing aggregates without throwing.
  const brief = await ops.briefing.briefing();
  ok(Array.isArray(brief.lines) && brief.lines.length > 0, "briefing produced", brief.lines);
  ok(brief.counts.customers === 1, "briefing counts customers", brief.counts.customers);

  // 11. Client keys: scoped auth, revocation.
  const issued = await ops.clients.issue({ label: "openclaw", scopes: ["briefing", "status"] });
  ok(issued.key.startsWith("opsk_"), "client key issued");
  const auth1 = await ops.clients.authenticate(issued.key, { requireScope: "briefing" });
  ok(auth1.ok, "client key authenticates for granted scope");
  const auth2 = await ops.clients.authenticate(issued.key, { requireScope: "events:write" });
  ok(!auth2.ok, "client key rejected for missing scope");
  await ops.clients.revoke(issued.id);
  const auth3 = await ops.clients.authenticate(issued.key, { requireScope: "briefing" });
  ok(!auth3.ok, "revoked client key rejected");

  // 12. FAIL-CLOSED: engine down → every proposal blocks, nothing executes.
  srv.close();
  await new Promise((r) => setTimeout(r, 50));
  const before = (await rt.recommendations.list({ org_id: org.id })).length;
  const p5 = await ops.proposals.propose({
    action_id: "create_recommendation",
    params: { org_id: org.id, title: "Should not execute", detail: "", severity: "low" },
    org_id: org.id,
  });
  ok(p5.status === "blocked" && p5.decision.policy === "fail_closed_engine_unavailable",
    "engine unreachable → fail-closed block", { status: p5.status, policy: p5.decision.policy });
  const after = (await rt.recommendations.list({ org_id: org.id })).length;
  ok(after === before, "nothing executed while engine down");

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

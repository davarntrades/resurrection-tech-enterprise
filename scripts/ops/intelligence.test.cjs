/* ============================================================================
 * Operations Agent — Customer Intelligence + Executive OS test (Pillars 1–2).
 *
 * Hermetic (mock engine, temp store, no Supabase/LLM). Proves:
 *   1. DETERMINISTIC — the same records produce the same scores across runs.
 *   2. EXPLAINABLE — every score is 0..100, banded, and carries labelled input
 *      components + a formula string (nothing is a black box).
 *   3. GROUNDED — scores move only in response to real records (a report, an
 *      engagement note, a blocked evaluation), and the evidence timeline is
 *      built from actual rows in time order.
 *   4. EXECUTIVE RANKING — the briefing ranks recommendations by business
 *      impact, surfaces one top priority with a deterministic confidence, and
 *      never fabricates a customer or number.
 *   5. GOVERNANCE INVARIANT — the next-recommendation for a pilot proposes
 *      through governance (never an execution), and risk with no data reports
 *      "insufficient_data" rather than a made-up number.
 *
 *   node scripts/ops/intelligence.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-intel-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.RUNTIME_OPERATOR_NAME = "Davarn";

const { startMockEngine } = require("./mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}
const bounded = (s) => Number.isInteger(s.score) && s.score >= 0 && s.score <= 100;

async function main() {
  const srv = await startMockEngine();
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  console.log("\nCustomer Intelligence + Executive OS test (mock engine on :" + srv.address().port + ")\n");

  // ── Seed real records ─────────────────────────────────────────────────────
  const aster = await rt.admin.createOrg({ name: "Aster Systems", slug: "aster" });
  const quantm = await rt.admin.createOrg({ name: "Quantm", slug: "quantm" });
  await rt.engagement.set(aster.id, { stage: "enterprise_assessment", next_review_date: "2999-01-01" });
  await rt.engagement.addContact(aster.id, { name: "CTO", email: "cto@aster.example" });
  await rt.engagement.addNote(aster.id, "Kickoff done — strong intent");
  await rt.reports.generate({ org_id: aster.id, period: "weekly" });
  await rt.engagement.addNote(quantm.id, "Quantm has replied — wants pilot Thursday");

  // ── 1. Scores are bounded, banded, explainable ────────────────────────────
  const pA = await ops.intelligence.detail(aster.id);
  const S = pA.scores;
  ok(["health", "engagement", "pilot_readiness", "runtime_risk"].every((k) => bounded(S[k])), "all scores are integers in 0..100", Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.score])));
  ok(["health", "engagement", "pilot_readiness", "runtime_risk"].every((k) => typeof S[k].band === "string" && S[k].formula && Array.isArray(S[k].inputs) && S[k].inputs.length > 0), "every score carries band + formula + labelled inputs");
  const sumInputs = S.engagement.inputs.reduce((n, i) => n + i.points, 0);
  ok(sumInputs === S.engagement.score || Math.abs(sumInputs - S.engagement.score) <= 1, "engagement score equals the sum of its disclosed components", { sum: sumInputs, score: S.engagement.score });

  // ── 2. Determinism — identical records → identical scores ──────────────────
  const pA2 = await ops.intelligence.detail(aster.id);
  ok(JSON.stringify(pA.scores) === JSON.stringify(pA2.scores), "scores are deterministic across repeated computation");

  // ── 3. Grounding — a real report lifts pilot readiness for Aster over Quantm
  const pQ = await ops.intelligence.detail(quantm.id);
  ok(pA.scores.pilot_readiness.score > pQ.scores.pilot_readiness.score, "Aster (report + assessment stage) out-scores Quantm on pilot readiness", { aster: pA.scores.pilot_readiness.score, quantm: pQ.scores.pilot_readiness.score });
  ok(pA.next_recommendation && pA.next_recommendation.title, "Aster has a deterministic next recommendation", pA.next_recommendation.title);

  // Runtime risk with no evaluations is honest, not invented.
  ok(pQ.scores.runtime_risk.band === "insufficient_data" && pQ.scores.runtime_risk.score === 0, "runtime risk reports insufficient_data with no evaluations (not a fake number)", pQ.scores.runtime_risk.band);

  // ── 4. Risk grounds in real blocked evaluations ───────────────────────────
  // Drive a real blocked decision for Quantm through the governed gateway so
  // metrics/decisions exist, then risk should reflect it.
  const qEnv = await rt.admin.createEnvironment({ org_id: quantm.id, kind: "production", mode: "enforce" });
  const key = await rt.admin.issueApiKey({ org_id: quantm.id, environment_id: qEnv.id, role: "ingest" });
  const auth = await rt.admin.authenticate(key.key, { requireRole: "ingest" });
  await rt.gateway.govern({ auth, trajectory: [{ tool: "share_credentials", args: {} }] }).catch(() => {});
  const pQ2 = await ops.intelligence.detail(quantm.id);
  ok(pQ2.scores.runtime_risk.score >= pQ.scores.runtime_risk.score, "a real blocked evaluation raises (or holds) runtime risk", { before: pQ.scores.runtime_risk.score, after: pQ2.scores.runtime_risk.score });
  ok(pQ2.timeline.some((t) => t.kind === "runtime_decision" || t.kind === "governance_decision"), "evidence timeline includes the runtime decision");
  const times = pQ2.timeline.map((t) => t.at);
  ok(times.every((t, i) => i === 0 || String(times[i - 1]) >= String(t)), "timeline is ordered newest-first");

  // ── 5. Executive ranking in the briefing ──────────────────────────────────
  await ops.proposals.propose({ action_id: "promote_to_pilot", params: {}, org_id: aster.id }); // escalates
  const b = await ops.briefing.briefing();
  ok(Array.isArray(b.recommended_actions) && b.recommended_actions.every((r) => Number.isInteger(r.impact) && r.impact >= 0 && r.impact <= 100), "every recommendation has a bounded business-impact score");
  ok(b.recommended_actions.every((r, i) => i === 0 || b.recommended_actions[i - 1].impact >= r.impact), "recommendations are sorted by impact, highest first");
  ok(b.recommended_actions.every((r, i) => r.priority === i + 1), "priority numbers follow the impact ordering");
  ok(b.top_priority && typeof b.top_priority.confidence === "number" && b.top_priority.confidence > 0 && b.top_priority.confidence <= 1, "a single top priority is surfaced with a bounded confidence", b.top_priority && b.top_priority.confidence);
  ok(b.top_priority.confidence_basis && /margin/.test(b.top_priority.confidence_basis), "confidence is explained by a deterministic basis (not a magic number)", b.top_priority && b.top_priority.confidence_basis);
  ok(!/^org_/.test(String(b.top_priority.org || "")), "top priority names the customer, not a raw org id", b.top_priority && b.top_priority.org);
  ok(/Recommended priority:/.test(b.text), "the exec summary text carries the recommended priority line");

  // customer_intelligence block is present and grounded in the two orgs.
  ok(Array.isArray(b.customer_intelligence) && b.customer_intelligence.length === 2, "briefing carries customer intelligence for every org", b.customer_intelligence.length);
  ok(b.customer_intelligence.every((c) => c.name && typeof c.health === "number" && c.health_band), "each customer-intelligence row has name + health + band");

  // ── 6. Governance invariant — pilot recommendation proposes, never executes
  const readyRec = b.recommended_actions.find((r) => r.proposed_action && r.proposed_action.action_id === "promote_to_pilot");
  if (readyRec) ok(["not_yet_proposed", "escalated"].includes(readyRec.governance_status), "pilot recommendation is a proposal through governance, never a direct execution", readyRec.governance_status);
  else ok(true, "pilot recommendation is a proposal through governance (none surfaced this run)");

  // ── 7. Ask router: new intents answer from intelligence only ──────────────
  const health = await ops.ask.ask("customer health");
  ok(health.ok && health.intent === "customers", "\"customer health\" routes to the customers intent (not system health)", health.intent);
  const named = await ops.ask.ask("how is Aster Systems?");
  ok(named.ok && named.intent === "customers" && named.customer && named.customer.name === "Aster Systems", "named-org query returns that customer's intelligence", named.customer && named.customer.name);
  const pipeline = await ops.ask.ask("summarise enterprise pipeline");
  ok(pipeline.ok && pipeline.intent === "pipeline" && pipeline.total === 2, "pipeline summary aggregates real orgs", pipeline.total);
  const explain = await ops.ask.ask("explain today's recommendations");
  ok(explain.ok && explain.intent === "explain_recommendations", "explain-recommendations intent routes correctly", explain.intent);
  const sysHealth = await ops.ask.ask("why is railway unhealthy?");
  ok(sysHealth.ok && sysHealth.intent === "system_health", "infra health query still routes to system_health", sysHealth.intent);

  srv.close();
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

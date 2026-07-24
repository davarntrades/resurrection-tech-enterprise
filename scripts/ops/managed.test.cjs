/* ============================================================================
 * Guardian OS — Managed Governance test (continuous governance).
 *
 * Hermetic (mock engine with dynamic-policy enforcement, temp store). Proves the
 * Managed Governance department keeps a PROVISIONED enterprise governed:
 *
 *   1. BASELINE      provisioning captures the governed baseline automatically.
 *   2. DRIFT         a change to the live enterprise (new privileged tool, new
 *                    AI system, a disabled policy) is detected as evidence-backed
 *                    Governance Drift — and detection is idempotent (deduped).
 *   3. HEALTH        a live governance health score with seven sub-scores + a
 *                    trend; open drift measurably lowers it.
 *   4. RECOMMEND     drift + gaps become GOVERNED recommendations (proposals) —
 *                    inert until an operator approves; each already evidence-backed.
 *   5. QUEUE         the operator queue surfaces only what needs a human.
 *   6. PACK          a customer-ready, content-signed evidence pack.
 *   7. INVARIANTS    monitoring is READ-ONLY (never mutates the estate) and the
 *                    kernel stays deny-only (a privileged tool is still blocked).
 *
 *   node scripts/ops/managed.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-managed-test-"));
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
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  console.log("\nManaged Governance test (mock engine on :" + srv.address().port + ")\n");

  const wire = (amount, approved) => rt.engine.evaluate([{ tool: "wire_transfer", args: { amount, ...(approved ? { operator_approved: true } : {}) } }], ["enterprise"], 3);

  // ── 1. Provision → baseline captured automatically ────────────────────────
  const prov = await ops.provisioning.provision({}, { actor: "davarn@control-room" });
  const org = prov.org_id;
  ok(prov.status === "complete" && prov.result.baseline && prov.result.baseline.version === 1, "provisioning captures the governed baseline automatically", prov.result.baseline);
  const base = await ops.managed.baseline(org);
  ok(base && base.snapshot && base.snapshot.policies.length > 0 && base.snapshot.tools.length > 0, "the baseline fingerprints policies + estate", base && base.snapshot && { p: base.snapshot.policies.length, t: base.snapshot.tools.length });

  // Health of a freshly provisioned enterprise: seven sub-scores, no drift.
  const h0 = await ops.managed.health(org);
  const subs = Object.keys(h0.scores);
  ok(["approval_responsiveness", "drift_score", "evidence_completeness", "governance_maturity", "overall", "policy_coverage", "runtime_health"].every((k) => subs.includes(k)), "health has all seven governance sub-scores", subs);
  ok(h0.drift_open === 0 && h0.scores.drift_score.score === 100, "a freshly provisioned enterprise has zero drift", { open: h0.drift_open, drift: h0.scores.drift_score.score });

  // Estate size before any monitoring (to prove monitoring never mutates it).
  const estateBefore = (await ops.entities.summary(org)).total;

  // ── 2. Introduce real drift, then monitor ─────────────────────────────────
  await ops.entities.create({ org_id: org, layer: "estate", kind: "tool", name: "exfiltrate_data", attrs: { privileged: true } });
  await ops.entities.create({ org_id: org, layer: "estate", kind: "ai_system", name: "Shadow Copilot", refs: [] });
  const scoped = (await ops.govpolicy.active({})).filter((p) => p.scope === org);
  await ops.govpolicy.rollback({ name: scoped[0].name, scope: org, actor: "insider" }); // disable a policy

  const mon = await ops.managed.monitor(org, { actor: "guardian_os" });
  ok(mon.ok && mon.drift.detected >= 3, "monitor detects the introduced drift (new tool + new AI system + disabled policy)", mon.drift);
  const drift = await ops.managed.detectDrift(org);
  const kinds = new Set(drift.open.map((d) => d.kind));
  ok(kinds.has("new_tool") && kinds.has("new_ai_system") && kinds.has("disabled_policy"), "the three drift kinds are all present", [...kinds]);
  ok(drift.open.every((d) => d.evidence_id), "every drift event is evidence-backed", drift.open.map((d) => !!d.evidence_id));
  ok(drift.open.some((d) => d.kind === "new_tool" && d.severity === "critical"), "a new PRIVILEGED tool is critical drift");

  // Idempotent: re-detecting finds nothing new (dedup by fingerprint).
  const again = await ops.managed.detectDrift(org);
  ok(again.detected.length === 0 && again.open.length === drift.open.length, "drift detection is idempotent — no duplicate events", { new: again.detected.length, open: again.open.length });

  // ── 3. Health reflects the drift ──────────────────────────────────────────
  const h1 = await ops.managed.health(org);
  ok(h1.drift_open >= 3 && h1.scores.drift_score.score < 100 && h1.overall < h0.overall, "open drift measurably lowers the health score", { open: h1.drift_open, drift: h1.scores.drift_score.score, overall: `${h0.overall}->${h1.overall}` });

  // ── 4. Recommendations — governed + evidence-backed ───────────────────────
  ok(mon.recommended > 0, "monitor generated governed recommendations", mon.recommended);
  const recProps = (await ops.proposals.list({ org_id: org, limit: 200 })).filter((p) => p.action_id === "create_recommendation" && p.source === "managed_governance");
  ok(recProps.length > 0 && recProps.every((p) => p.risk === "low"), "recommendations are governed low-risk proposals (agent proposes, operator disposes)", recProps.length);
  const openRecs = await rt.recommendations.list({ org_id: org, openOnly: true });
  ok(openRecs.length > 0, "recommendations land as open items awaiting the operator", openRecs.length);
  // Re-running recommend does not pile up duplicates.
  const before = openRecs.length;
  await ops.managed.recommend(org, { actor: "guardian_os" });
  ok((await rt.recommendations.list({ org_id: org, openOnly: true })).length === before, "recommendations are deduped across passes", before);

  // ── 5. Operator queue — only what needs a human ───────────────────────────
  const q = await ops.managed.queue(org);
  ok(q.count > 0 && q.items.every((i) => i.severity && i.ref && i.title), "the operator queue is populated and every item is actionable", q.count);
  ok(q.by_type.drift >= 3 && q.by_type.recommendation >= 1, "the queue surfaces drift + recommendations for review", q.by_type);
  // Acknowledging a drift removes it from the queue but it still counts until resolved.
  const d0 = q.items.find((i) => i.type === "drift");
  await ops.managed.ackDrift(d0.id, { actor: "davarn", status: "acknowledged" });
  const q2 = await ops.managed.queue(org);
  ok(q2.by_type.drift === (q.by_type.drift - 1) && (await ops.managed.health(org)).drift_open === h1.drift_open, "acknowledging drift clears the queue item but the risk still counts", { before: q.by_type.drift, after: q2.by_type.drift });

  // ── 6. Evidence pack — customer-ready + content-signed ────────────────────
  const pack = await ops.managed.evidencePack(org, { actor: "davarn" });
  const need = ["governance_posture", "runtime_activity", "policies_enforced", "blocked_actions", "executive_summary", "audit_trail", "compliance_evidence", "risk_trend", "recommendations"];
  ok(pack.hash && need.every((k) => pack[k] !== undefined), "the evidence pack is signed and has every required section", need.filter((k) => pack[k] === undefined));
  ok((await ops.managed.listPacks(org)).some((p) => p.hash === pack.hash), "the evidence pack is persisted + listable");

  // ── 7. Invariants — read-only monitoring + deny-only kernel ───────────────
  const estateAfter = (await ops.entities.summary(org)).total;
  ok(estateAfter === estateBefore + 2, "monitoring never mutates the estate (only the two test edits changed it)", { before: estateBefore, after: estateAfter });
  ok((await wire(25000, false)).json.verdict === "BLOCK", "the kernel stays deny-only after managed governance runs (privileged wire still blocked)");
  ok((await rt.engine.evaluate([{ tool: "harmless_read", args: {} }], ["enterprise"], 3)).json.verdict === "PERMIT", "unrelated tools still PERMIT — managed governance adds no new blocks itself");

  // ── Briefing + overview ───────────────────────────────────────────────────
  const brief = await ops.managed.briefingFor(org, { period: "weekly" });
  ok(brief.what_changed.length >= 2 && brief.counts && typeof brief.policies_triggered === "number", "the executive briefing answers what changed / what triggered", brief.counts);
  const ov = await ops.managed.overview();
  ok(ov.enterprises >= 1 && ov.list[0].health && ov.queue_total > 0, "the overview shows posture across every provisioned enterprise", { n: ov.enterprises, q: ov.queue_total });

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });

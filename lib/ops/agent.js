/* ============================================================================
 * Operations Agent — cycle orchestrator.
 *
 * One cycle = Observe → Reason → Propose → Governance Evaluation →
 * Allow/Block/Escalate → Execute → Evidence → Audit Log. Cycles run on a
 * schedule (Vercel cron via /api/ops/cron), on demand from the Control Room
 * (/api/ops/run), or event-driven (events.js subscribers). Each cycle writes a
 * durable run record (ops_runs) so agent activity is itself auditable.
 *
 * Confidence + dedupe guardrails sit BEFORE the proposal step; the governance
 * gate sits after it. Nothing in this module executes an action directly.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const observers = require("./observers");
const reasoning = require("./reasoning");
const proposals = require("./proposals");
const agents = require("./agents");
const events = require("./events");

const MIN_CONFIDENCE = () => {
  const n = Number(process.env.OPS_MIN_CONFIDENCE);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.6;
};

/** Run one full agent cycle. Never throws; failures land in the run record. */
async function runCycle({ trigger = "manual" } = {}) {
  const run = await store.insert("ops_runs", {
    trigger, status: "running", started_at: store.nowISO(),
    observations: 0, recommendations: 0, proposals: 0,
    outcomes: { executed: 0, blocked: 0, escalated: 0, failed: 0, skipped: 0 },
    reasoning_source: null, finished_at: null, error: null,
  });
  await events.emit("cycle.started", { run_id: run.id, trigger });

  try {
    // 1. Observe
    const snapshot = await observers.observe();

    // 2. Reason (structured recommendations only — no execution)
    const { source, recommendations } = await reasoning.recommend(snapshot);

    // 3–7. Propose → evaluate → execute/escalate/block → evidence, per rec.
    const outcomes = { executed: 0, blocked: 0, escalated: 0, failed: 0, skipped: 0 };
    const produced = [];
    for (const rec of recommendations) {
      if (rec.confidence < MIN_CONFIDENCE()) { outcomes.skipped += 1; continue; }
      if (await proposals.similarOpen(rec.decision, rec.org_id)) { outcomes.skipped += 1; continue; }
      const p = await proposals.propose({
        action_id: rec.decision,
        params: rec.params,
        org_id: rec.org_id,
        source: `agent_cycle:${trigger}`,
        agent_id: agents.ownerOfAction(rec.decision), // Pillar 4: attribute to owning specialist
        reasoning: { decision: rec.decision, confidence: rec.confidence, reason: rec.reason, source },
      });
      produced.push({ id: p.id, action_id: p.action_id, status: p.status });
      if (p.status === "executed") outcomes.executed += 1;
      else if (p.status === "blocked") outcomes.blocked += 1;
      else if (p.status === "escalated") outcomes.escalated += 1;
      else outcomes.failed += 1;
    }

    await store.update("ops_runs", run.id, {
      status: "completed", finished_at: store.nowISO(),
      observations: snapshot.observations.length,
      recommendations: recommendations.length,
      proposals: produced.length, outcomes, reasoning_source: source,
    });
    await events.emit("cycle.completed", { run_id: run.id, outcomes, proposals: produced });
    rt.log.info("ops_cycle", { run_id: run.id, trigger, ...outcomes });
    return { run_id: run.id, trigger, observations: snapshot.observations.length, reasoning_source: source, recommendations: recommendations.length, proposals: produced, outcomes };
  } catch (e) {
    await store.update("ops_runs", run.id, { status: "failed", finished_at: store.nowISO(), error: e.message || String(e) });
    await events.emit("cycle.failed", { run_id: run.id, error: e.message });
    rt.log.error("ops_cycle_failed", { run_id: run.id, error: e.message });
    return { run_id: run.id, trigger, error: e.message };
  }
}

async function lastRun() {
  const rows = await store.find("ops_runs", {});
  rows.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  return rows[0] || null;
}

async function runs({ limit = 20 } = {}) {
  const rows = await store.find("ops_runs", {});
  rows.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  return rows.slice(0, Math.max(1, Math.min(200, limit)));
}

module.exports = { runCycle, lastRun, runs };

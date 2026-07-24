/* ============================================================================
 * Operations Agent — Executive performance metrics (Phase 4, read-only).
 *
 * A pure READ MODEL for the Executive Command dashboard: deterministic per-agent
 * and council-level metrics derived entirely from existing records (proposals +
 * their execution/verification results, handoffs, council runs, autonomy state).
 *
 * No new store, no writes, no LLM. Identical inputs → identical output, so the
 * metrics are reproducible and safe to compute on every dashboard load. This is
 * OVERSIGHT, not authority: nothing here can change a verdict or an action.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const proposals = require("./proposals");
const handoffs = require("./handoffs");
const agents = require("./agents");

// Rate as a 0..1 fraction rounded to 2dp; null when the denominator is zero
// (no data yet), so the UI can distinguish "0%" from "nothing measured".
const rate = (num, den) => (den > 0 ? Math.round((num / den) * 100) / 100 : null);

/** Deterministic per-agent metrics: proposal outcomes, verification pass rate,
 *  and handoff throughput, attributed by agent_id. */
async function perAgent() {
  const [props, hos] = await Promise.all([
    proposals.list({ limit: 500 }).catch(() => []),
    handoffs.list({ limit: 500 }).catch(() => []),
  ]);
  const per = {};
  for (const a of agents.AGENTS) {
    per[a.id] = {
      id: a.id, title: a.title,
      proposals: 0, executed: 0, escalated: 0, blocked: 0, denied: 0, failed: 0, allowed: 0, approved: 0,
      verified: 0, verification_failed: 0,
      handoffs_sent: 0, handoffs_received: 0, handoffs_resolved: 0,
    };
  }
  for (const p of props) {
    const m = p.agent_id && per[p.agent_id];
    if (!m) continue;
    m.proposals += 1;
    if (m[p.status] !== undefined) m[p.status] += 1;
    if (p.execution && p.execution.verified === true) m.verified += 1;
    if (p.execution && p.execution.verified === false) m.verification_failed += 1;
  }
  for (const h of hos) {
    if (per[h.from_agent]) per[h.from_agent].handoffs_sent += 1;
    if (per[h.to_agent]) {
      per[h.to_agent].handoffs_received += 1;
      if (h.status === "resolved") per[h.to_agent].handoffs_resolved += 1;
    }
  }
  return agents.AGENTS.map((a) => {
    const m = per[a.id];
    return {
      ...m,
      execution_rate: rate(m.executed, m.proposals),
      escalation_rate: rate(m.escalated, m.proposals),
      block_rate: rate(m.blocked + m.denied, m.proposals),
      verification_rate: rate(m.verified, m.verified + m.verification_failed),
    };
  });
}

/** Council-level throughput from the durable ops_runs ledger (recent window). */
async function council(windowSize = 20) {
  const runs = await store.find("ops_runs", {}).catch(() => []);
  runs.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const recent = runs.slice(0, Math.max(1, windowSize));
  const totals = { executed: 0, blocked: 0, escalated: 0, failed: 0, skipped: 0 };
  let halted = 0;
  for (const r of recent) {
    const o = r.outcomes || {};
    for (const k of Object.keys(totals)) totals[k] += Number(o[k] || 0);
    if (r.halted) halted += 1;
  }
  const last = runs[0] || null;
  return {
    total_runs: runs.length,
    recent_window: recent.length,
    recent_outcomes: totals,
    recent_halted: halted,
    last_run: last ? {
      id: last.id, trigger: last.trigger, status: last.status,
      autonomy_mode: last.autonomy_mode || null, halted: !!last.halted,
      coordination: !!last.coordination, proposals: last.proposals || 0,
      started_at: last.started_at, finished_at: last.finished_at,
    } : null,
  };
}

/** The full Executive Command performance report (read-only, deterministic). */
async function report() {
  const autonomy = require("./autonomy");
  const [state, ho, agentMetrics, councilMetrics, propSummary] = await Promise.all([
    autonomy.current().catch(() => ({ mode: autonomy.DEFAULT_MODE, label: autonomy.LABELS[autonomy.DEFAULT_MODE], paused_agents: [], policy: autonomy.policy(autonomy.DEFAULT_MODE), updated_by: null, updated_at: null })),
    handoffs.summary().catch(() => ({ total: 0, by_status: {} })),
    perAgent(),
    council(),
    proposals.summary().catch(() => ({ total: 0, by_status: {}, awaiting_operator: 0 })),
  ]);
  return {
    generated_at: store.nowISO(),
    autonomy: {
      mode: state.mode, label: state.label, paused_agents: state.paused_agents,
      policy: state.policy, updated_by: state.updated_by, updated_at: state.updated_at,
    },
    agents: agentMetrics,
    council: councilMetrics,
    handoffs: { total: ho.total || 0, by_status: ho.by_status || {} },
    proposals: propSummary,
  };
}

module.exports = { perAgent, council, report, rate };

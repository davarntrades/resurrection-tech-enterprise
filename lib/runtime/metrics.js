/* ============================================================================
 * Runtime Governance — metrics + aggregation (powers the dashboard & reports).
 *
 * Pure aggregation over recorded decisions: ALLOW/ESCALATE/BLOCK counters,
 * engine-latency stats, rule frequency, Ω-domain frequency, and time-bucketed
 * trends. Also CSV/JSON export of the underlying evidence.
 * ============================================================================ */
"use strict";
const store = require("./store");

const pct = (n, d) => (d ? +((n / d) * 100).toFixed(1) : 0);

// Aggregate decisions for an org/environment over an optional time window.
// The heavy lifting is done store-side (SQL group-by on Supabase, bounded scan
// on the dev file store) — see store.aggregate. This function only SHAPES the
// normalised aggregate into the public summary contract (unchanged output).
async function summary({ org_id, environment_id, since, until } = {}) {
  const a = await store.aggregate({ org_id, environment_id, since, until });
  const total = a.total || 0;
  const vc = a.verdict_counts || {};
  const ev = a.engine_verdict_counts || {};
  const topN = (rows) => (rows || []).map((r) => ({ key: r.key, count: r.count, pct: pct(r.count, total) }));
  return {
    window: { since: since || null, until: until || null },
    total,
    verdicts: {
      ALLOW: vc.ALLOW || 0, ESCALATE: vc.ESCALATE || 0, BLOCK: vc.BLOCK || 0, ENGINE_UNAVAILABLE: vc.ENGINE_UNAVAILABLE || 0,
      allow_pct: pct(vc.ALLOW || 0, total), escalate_pct: pct(vc.ESCALATE || 0, total), block_pct: pct(vc.BLOCK || 0, total),
    },
    engine_verdicts: { ALLOW: ev.ALLOW || 0, ESCALATE: ev.ESCALATE || 0, BLOCK: ev.BLOCK || 0, ENGINE_UNAVAILABLE: ev.ENGINE_UNAVAILABLE || 0 },
    would_block: ev.BLOCK || 0,               // shadow-mode "would have blocked" count
    enforced: a.enforced || 0, human_review: a.human_review || 0,
    latency: {
      engine_compute_ms: a.compute || { mean: null, p50: null, p95: null, p99: null, max: null },
      round_trip_ms: a.roundtrip || { mean: null, p50: null, p95: null, max: null },
    },
    rule_frequency: topN(a.rules),
    omega_frequency: topN(a.omega),
    by_environment_kind: a.by_environment_kind || {},
  };
}

// Time-bucketed trend series (for dashboard charts). bucket = hour|day|week.
async function trends(opts) {
  const { org_id, environment_id, since, until, bucket = "day" } = opts || {};
  return store.aggregateTrends({ org_id, environment_id, since, until, bucket });
}

// Export the evidence rows as JSON or CSV (metadata columns only).
async function exportDecisions({ org_id, environment_id, since, until, format = "json", limit = 100000 } = {}) {
  const rows = await store.queryDecisions({ org_id, environment_id, since, until, limit });
  if (format !== "csv") return { contentType: "application/json", body: JSON.stringify(rows, null, 2) };
  // Four timing columns, exported separately. `engine_compute_ms` is the whole
  // service handler despite its name (it is chain-bound and cannot be renamed);
  // `decision_time_ms` is the governed decision and `engine_time_ms` the Ω
  // compute alone. Exporting only the first, as this did, left an auditor
  // unable to tell governance cost from transport cost.
  const cols = ["created_at", "id", "environment_kind", "mode", "enforced", "engine_verdict", "verdict", "omega_domain", "rule", "decision_time_ms", "engine_time_ms", "engine_compute_ms", "round_trip_ms", "steps", "trajectory_hash", "label"];
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(Array.isArray(r[c]) ? r[c].join("|") : r[c])).join(","));
  return { contentType: "text/csv", body: lines.join("\n") };
}

module.exports = { summary, trends, exportDecisions };

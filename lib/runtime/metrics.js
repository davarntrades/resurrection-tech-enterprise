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
function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

// Aggregate decisions for an org/environment over an optional time window.
async function summary({ org_id, environment_id, since, until } = {}) {
  const rows = await store.queryDecisions({ org_id, environment_id, since, until, limit: 1000000 });
  const counts = { ALLOW: 0, ESCALATE: 0, BLOCK: 0, ENGINE_UNAVAILABLE: 0 };
  const engineVerdicts = { ALLOW: 0, ESCALATE: 0, BLOCK: 0, ENGINE_UNAVAILABLE: 0 };
  const rules = {}, omega = {}, byEnvKind = {};
  const compute = [], roundtrip = [];
  let enforced = 0, humanReview = 0;
  for (const r of rows) {
    counts[r.verdict] = (counts[r.verdict] || 0) + 1;
    engineVerdicts[r.engine_verdict] = (engineVerdicts[r.engine_verdict] || 0) + 1;
    if (r.rule) rules[r.rule] = (rules[r.rule] || 0) + 1;
    if (r.omega_domain) omega[r.omega_domain] = (omega[r.omega_domain] || 0) + 1;
    if (r.environment_kind) byEnvKind[r.environment_kind] = (byEnvKind[r.environment_kind] || 0) + 1;
    if (typeof r.engine_compute_ms === "number") compute.push(r.engine_compute_ms);
    if (typeof r.round_trip_ms === "number") roundtrip.push(r.round_trip_ms);
    if (r.enforced) enforced++;
    if (r.requires_human_review) humanReview++;
  }
  compute.sort((a, b) => a - b); roundtrip.sort((a, b) => a - b);
  const total = rows.length;
  const mean = (a) => (a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(3) : null);
  const topN = (obj, n = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v, pct: pct(v, total) }));

  return {
    window: { since: since || null, until: until || null },
    total,
    verdicts: {
      ALLOW: counts.ALLOW, ESCALATE: counts.ESCALATE, BLOCK: counts.BLOCK, ENGINE_UNAVAILABLE: counts.ENGINE_UNAVAILABLE,
      allow_pct: pct(counts.ALLOW, total), escalate_pct: pct(counts.ESCALATE, total), block_pct: pct(counts.BLOCK, total),
    },
    engine_verdicts: engineVerdicts,          // what the engine said, pre-mode (shadow vs enforce)
    would_block: engineVerdicts.BLOCK,        // shadow-mode "would have blocked" count
    enforced, human_review: humanReview,
    latency: {
      engine_compute_ms: { mean: mean(compute), p50: percentile(compute, 50), p95: percentile(compute, 95), p99: percentile(compute, 99), max: compute[compute.length - 1] ?? null },
      round_trip_ms: { mean: mean(roundtrip), p50: percentile(roundtrip, 50), p95: percentile(roundtrip, 95), max: roundtrip[roundtrip.length - 1] ?? null },
    },
    rule_frequency: topN(rules),
    omega_frequency: topN(omega),
    by_environment_kind: byEnvKind,
  };
}

// Time-bucketed trend series (for dashboard charts). bucket = hour|day|week.
async function trends({ org_id, environment_id, since, until, bucket = "day" } = {}) {
  const rows = await store.queryDecisions({ org_id, environment_id, since, until, limit: 1000000 });
  const keyOf = (iso) => {
    const d = new Date(iso);
    if (bucket === "hour") return iso.slice(0, 13) + ":00";
    if (bucket === "week") { const t = new Date(d); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t.toISOString().slice(0, 10); }
    return iso.slice(0, 10); // day
  };
  const buckets = {};
  for (const r of rows) {
    const k = keyOf(r.created_at);
    const b = buckets[k] || (buckets[k] = { bucket: k, ALLOW: 0, ESCALATE: 0, BLOCK: 0, total: 0, compute: [] });
    b[r.verdict] = (b[r.verdict] || 0) + 1; b.total++;
    if (typeof r.engine_compute_ms === "number") b.compute.push(r.engine_compute_ms);
  }
  return Object.values(buckets).sort((a, b) => (a.bucket < b.bucket ? -1 : 1)).map((b) => ({
    bucket: b.bucket, ALLOW: b.ALLOW, ESCALATE: b.ESCALATE, BLOCK: b.BLOCK, total: b.total,
    avg_engine_compute_ms: b.compute.length ? +(b.compute.reduce((s, x) => s + x, 0) / b.compute.length).toFixed(3) : null,
  }));
}

// Export the evidence rows as JSON or CSV (metadata columns only).
async function exportDecisions({ org_id, environment_id, since, until, format = "json", limit = 100000 } = {}) {
  const rows = await store.queryDecisions({ org_id, environment_id, since, until, limit });
  if (format !== "csv") return { contentType: "application/json", body: JSON.stringify(rows, null, 2) };
  const cols = ["created_at", "id", "environment_kind", "mode", "enforced", "engine_verdict", "verdict", "omega_domain", "rule", "engine_compute_ms", "round_trip_ms", "steps", "trajectory_hash", "label"];
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(Array.isArray(r[c]) ? r[c].join("|") : r[c])).join(","));
  return { contentType: "text/csv", body: lines.join("\n") };
}

module.exports = { summary, trends, exportDecisions };

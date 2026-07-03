/* ============================================================================
 * Runtime Governance — continuous reporting.
 *
 * Generates period rollups (daily / weekly / monthly / quarterly) from recorded
 * decisions and persists them as report rows. Each report is a governance-
 * evidence artefact: governed-action volume, ALLOW/ESCALATE/BLOCK split,
 * would-have-blocked count (shadow), latency, top rules + Ω domains, and a
 * plain-language executive line. The monthly/quarterly rollups are the board-
 * level "governance evidence" cadence.
 * ============================================================================ */
"use strict";
const store = require("./store");
const metrics = require("./metrics");

const PERIODS = ["daily", "weekly", "monthly", "quarterly"];

function windowFor(period, ref = new Date()) {
  const end = new Date(ref);
  const start = new Date(ref);
  if (period === "daily") start.setUTCDate(start.getUTCDate() - 1);
  else if (period === "weekly") start.setUTCDate(start.getUTCDate() - 7);
  else if (period === "monthly") start.setUTCMonth(start.getUTCMonth() - 1);
  else if (period === "quarterly") start.setUTCMonth(start.getUTCMonth() - 3);
  else throw new Error(`invalid period: ${period}`);
  return { since: start.toISOString(), until: end.toISOString() };
}

function executiveLine(period, s) {
  const v = s.verdicts;
  const blocked = s.engine_verdicts.BLOCK || 0;
  const tone = period === "monthly" || period === "quarterly" ? "executive" : "operational";
  return `Over the ${period} window, Runtime Governance evaluated ${s.total.toLocaleString()} agent trajector${s.total === 1 ? "y" : "ies"} — `
    + `ALLOW ${v.ALLOW} (${v.allow_pct}%), ESCALATE ${v.ESCALATE} (${v.escalate_pct}%), BLOCK ${v.BLOCK} (${v.block_pct}%). `
    + (s.enforced ? `${blocked} catastrophic action${blocked === 1 ? "" : "s"} were intercepted before execution. ` : `${s.would_block} action${s.would_block === 1 ? "" : "s"} would have been blocked (shadow mode). `)
    + (s.latency.engine_compute_ms.mean != null ? `Mean engine decision time ${s.latency.engine_compute_ms.mean}ms.` : "")
    + (tone === "executive" ? " Deterministic, reproducible verdicts across the period." : "");
}

// Build (and persist) a report for one org/environment + period.
async function generate({ org_id, environment_id, period, ref, persist = true }) {
  if (!PERIODS.includes(period)) throw new Error(`invalid period: ${period}`);
  const w = windowFor(period, ref ? new Date(ref) : new Date());
  const s = await metrics.summary({ org_id, environment_id, since: w.since, until: w.until });
  const report = {
    org_id, environment_id: environment_id || null, period,
    window: w, generated_at: store.nowISO(),
    headline: executiveLine(period, s),
    totals: s.verdicts, engine_verdicts: s.engine_verdicts, would_block: s.would_block,
    enforced: s.enforced, human_review: s.human_review,
    latency: s.latency, top_rules: s.rule_frequency.slice(0, 5), top_omega: s.omega_frequency.slice(0, 5),
    trajectories: s.total,
  };
  if (persist) { const rec = await store.insert("reports", report); return rec; }
  return report;
}

async function listReports({ org_id, environment_id, period } = {}) {
  const where = { org_id };
  if (environment_id) where.environment_id = environment_id;
  let rows = await store.find("reports", where);
  if (period) rows = rows.filter((r) => r.period === period);
  return rows.sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1));
}

// Render a report as Markdown (board-ready; the delivery kit can turn this into
// a branded PDF using the same Chromium pipeline as the audit).
function toMarkdown(r) {
  const L = [];
  L.push(`# Runtime Governance — ${r.period[0].toUpperCase() + r.period.slice(1)} Governance Evidence`, "");
  L.push(`_Window ${r.window.since.slice(0, 10)} → ${r.window.until.slice(0, 10)} · generated ${r.generated_at.slice(0, 19).replace("T", " ")}_`, "");
  L.push(`> ${r.headline}`, "");
  L.push(`| Metric | Value |`, `|---|---|`);
  L.push(`| Trajectories governed | ${r.trajectories} |`);
  L.push(`| ALLOW / ESCALATE / BLOCK | ${r.totals.ALLOW} / ${r.totals.ESCALATE} / ${r.totals.BLOCK} |`);
  L.push(`| Would-have-blocked (shadow) | ${r.would_block} |`);
  L.push(`| Enforced decisions | ${r.enforced} |`);
  L.push(`| Human-review (ESCALATE) | ${r.human_review} |`);
  L.push(`| Mean engine compute | ${r.latency.engine_compute_ms.mean != null ? r.latency.engine_compute_ms.mean + " ms" : "—"} |`);
  L.push(`| p95 engine compute | ${r.latency.engine_compute_ms.p95 != null ? r.latency.engine_compute_ms.p95 + " ms" : "—"} |`, "");
  if (r.top_rules.length) { L.push(`## Top Ω rules fired`, "", `| Rule | Count | % |`, `|---|---|---|`); for (const x of r.top_rules) L.push(`| ${x.key} | ${x.count} | ${x.pct}% |`); L.push(""); }
  if (r.top_omega.length) { L.push(`## Ω-domain frequency`, "", `| Domain | Count | % |`, `|---|---|---|`); for (const x of r.top_omega) L.push(`| ${x.key} | ${x.count} | ${x.pct}% |`); L.push(""); }
  L.push(`---`, `*Generated by Resurrection Tech™ Runtime Governance. Runtime evidence is recorded from the live engine — never fabricated.*`);
  return L.join("\n");
}

module.exports = { PERIODS, windowFor, generate, listReports, toMarkdown };

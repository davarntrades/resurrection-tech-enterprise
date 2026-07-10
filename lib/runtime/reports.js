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

// L6 — scheduled reporting. Generate a period report for EVERY active org (one
// per production environment). Called by the cron route / CLI on a schedule.
// Returns a summary of what was generated so the cron run is observable.
async function generateAllDue({ period, ref } = {}) {
  if (!PERIODS.includes(period)) throw new Error(`invalid period: ${period}`);
  const orgs = await store.find("orgs", {});
  const out = [];
  for (const org of orgs) {
    if (org.status && org.status !== "active") continue;
    try {
      const r = await generate({ org_id: org.id, period, ref });
      out.push({ org_id: org.id, period, report_id: r.id, trajectories: r.trajectories });
    } catch (e) { out.push({ org_id: org.id, period, error: (e && e.message) || String(e) }); }
  }
  return { period, generated: out.length, reports: out };
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

async function getReport(id) { return store.findOne("reports", { id }); }

// Derive an executive + technical summary from a stored report — the content the
// dashboard renders in the expandable report card.
function summarize(r) {
  const t = r.totals || {}; const ev = r.engine_verdicts || {};
  const total = r.trajectories || 0;
  const blocked = ev.BLOCK || t.BLOCK || 0;
  const wouldBlock = r.would_block || 0;
  const escalate = t.ESCALATE || 0;
  const blockRate = total ? blocked / total : 0;
  const risk = (blockRate > 0.2 || (total && wouldBlock > total * 0.2)) ? "High"
    : (blocked > 0 || wouldBlock > 0) ? "Medium" : "Low";
  const posture = r.enforced
    ? "Enforcing — unsafe actions are blocked pre-execution."
    : "Observing (shadow) — would-be blocks are recorded but not enforced.";
  const findings = [];
  if (blocked) findings.push(`${blocked} catastrophic action${blocked > 1 ? "s" : ""} blocked pre-execution`);
  if (wouldBlock) findings.push(`${wouldBlock} would-be block${wouldBlock > 1 ? "s" : ""} recorded in shadow`);
  if (escalate) findings.push(`${escalate} trajector${escalate > 1 ? "ies" : "y"} escalated to human review`);
  if ((r.top_omega || []).length) findings.push(`Most-triggered Ω domain: ${r.top_omega[0].key}`);
  if (!findings.length) findings.push("No unsafe trajectory was permitted; governance operated cleanly.");
  const business_impact = blocked
    ? `${blocked} catastrophic action${blocked > 1 ? "s" : ""} prevented while governance was active.`
    : wouldBlock
      ? `${wouldBlock} action${wouldBlock > 1 ? "s" : ""} would have been blocked — enforcement would prevent them in production.`
      : "No high-risk actions occurred in this period.";
  const actions = [];
  if (!r.enforced && wouldBlock) actions.push("Enable enforcement to block the would-be-blocked actions in production.");
  if (escalate) actions.push("Review escalated trajectories with the customer’s security team.");
  if (risk === "High") actions.push("Prioritise remediation of the top-triggering Ω rules.");
  if (!actions.length) actions.push("Maintain current posture; continue the monthly governance-evidence cadence.");
  return {
    executive: { posture, risk, key_findings: findings, business_impact, recommended_actions: actions },
    technical: {
      rules: r.top_rules || [], omega: r.top_omega || [],
      verdicts: t, engine_verdicts: ev,
      latency: r.latency || {}, decisions: total, would_block: wouldBlock,
      enforced: !!r.enforced, human_review: r.human_review || 0,
      window: r.window || null,
      evidence_ref: `${total} decision${total === 1 ? "" : "s"} · ${r.period} window ${r.window ? r.window.since.slice(0, 10) + " → " + r.window.until.slice(0, 10) : ""}`,
    },
  };
}

// Minimal self-contained branded HTML (no Chromium) for download / secure share.
function toHtml(r) {
  const s = summarize(r);
  const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join("");
  const freq = (rows) => (rows || []).map((x) => `<tr><td>${esc(x.key)}</td><td>${x.count}</td><td>${x.pct}%</td></tr>`).join("");
  return `<!doctype html><meta charset="utf-8"><title>Runtime Governance — ${esc(r.period)} report</title>
<style>body{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#12151a;max-width:820px;margin:40px auto;padding:0 24px}
h1{font-size:24px}h2{font-size:16px;margin-top:28px;border-top:1px solid #e5e8ec;padding-top:18px}
.risk{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}
.risk.High{background:#fdecec;color:#c0392b}.risk.Medium{background:#fef6e7;color:#b9770e}.risk.Low{background:#eafaf1;color:#1e8449}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #eee;padding:6px 8px;text-align:left}
.muted{color:#6b7480;font-size:13px}</style>
<h1>Runtime Governance — ${esc(r.period[0].toUpperCase() + r.period.slice(1))} Governance Evidence</h1>
<p class="muted">Window ${esc((r.window && r.window.since || "").slice(0, 10))} → ${esc((r.window && r.window.until || "").slice(0, 10))} · generated ${esc((r.generated_at || "").slice(0, 19).replace("T", " "))}</p>
<p><b>${esc(r.headline || "")}</b></p>
<h2>Executive summary</h2>
<p><b>Overall posture:</b> ${esc(s.executive.posture)}</p>
<p><b>Risk level:</b> <span class="risk ${s.executive.risk}">${s.executive.risk}</span></p>
<p><b>Key findings:</b></p><ul>${li(s.executive.key_findings)}</ul>
<p><b>Business impact:</b> ${esc(s.executive.business_impact)}</p>
<p><b>Recommended actions:</b></p><ul>${li(s.executive.recommended_actions)}</ul>
<h2>Technical summary</h2>
<table><tr><th>Metric</th><th colspan="2">Value</th></tr>
<tr><td>Trajectories governed</td><td colspan="2">${r.trajectories}</td></tr>
<tr><td>ALLOW / ESCALATE / BLOCK</td><td colspan="2">${(r.totals || {}).ALLOW || 0} / ${(r.totals || {}).ESCALATE || 0} / ${(r.totals || {}).BLOCK || 0}</td></tr>
<tr><td>Would-have-blocked (shadow)</td><td colspan="2">${r.would_block}</td></tr>
<tr><td>Mean / p95 engine compute</td><td colspan="2">${((r.latency || {}).engine_compute_ms || {}).mean ?? "—"} / ${((r.latency || {}).engine_compute_ms || {}).p95 ?? "—"} ms</td></tr></table>
${(r.top_rules || []).length ? `<h2>Top Ω rules fired</h2><table><tr><th>Rule</th><th>Count</th><th>%</th></tr>${freq(r.top_rules)}</table>` : ""}
${(r.top_omega || []).length ? `<h2>Ω-domain frequency</h2><table><tr><th>Domain</th><th>Count</th><th>%</th></tr>${freq(r.top_omega)}</table>` : ""}
<p class="muted" style="margin-top:28px">Generated by Resurrection Tech™ Runtime Governance. Runtime evidence is recorded from the live engine — never fabricated.</p>`;
}

module.exports = { PERIODS, windowFor, generate, generateAllDue, listReports, getReport, summarize, toMarkdown, toHtml };

/* ===================================================================== * Runtime Governance — continuous reporting.
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
const { FONT_FACE_CSS } = require("../reportFonts.cjs");
const metrics = require("./metrics");
const recommendations = require("./recommendations");
const connectorAudit = require("./connector-audit");

const PERIODS = ["daily", "weekly", "monthly", "quarterly"];

// The evidence register is the complete audit data; the rendered document only
// shows the first REGISTER_DISPLAY rows. The persisted cap is generous and, when
// it bites, says so explicitly rather than silently shortening the record.
//
// The cap keeps the most RECENT records, not the oldest. Keeping the oldest made
// the document's own disclosure line untrue: it said "the 25 most recent of N"
// while rendering records N−cap+1 … N−cap+25 — in a busy month, activity from
// weeks earlier presented as the latest. A register that shortens must shorten
// at the end an auditor is not reading.
const REGISTER_CAP = 1000;
const REGISTER_DISPLAY = 25;
// Integrity findings are the exceptions section — the part of the pack that must
// never shorten in silence. Capped for document length, but the cap announces
// itself (see connectorMarkdown / connectorHtml).
const FINDINGS_DISPLAY = 50;

// The stored register stays chronological — that is what an audit register is.
// The DOCUMENT shows the most recent rows, because a monthly report is read for
// what just happened. Showing the oldest 25 of 99 buries the month's newest
// activity, which is exactly the evidence a reader came for.
const displayRows = (register) => (register || []).slice(-REGISTER_DISPLAY).reverse();

// One wording, rendered by both the Markdown and the HTML/PDF path, so the two
// documents can never disagree about what the reader is looking at. Returns null
// when the register fits and there is nothing to disclose.
function registerNote(ca) {
  const total = ca.register_total || 0;
  if (total <= REGISTER_DISPLAY) return null;
  const shown = Math.min(REGISTER_DISPLAY, (ca.register || []).length);
  return ca.register_truncated
    // The exported data is capped too — say so, and say which end was kept.
    ? `Showing the ${shown} most recent of ${total} records, newest first. The exported audit data for this window retains the ${REGISTER_CAP} most recent records; ${total - REGISTER_CAP} earlier record${total - REGISTER_CAP === 1 ? " is" : "s are"} not included and must be retrieved from the evidence store.`
    : `Showing the ${shown} most recent of ${total} records, newest first. Complete identifiers are preserved in the exported audit data.`;
}

// Same contract for the exceptions section: never shorten it in silence.
function findingsNote(findings) {
  const total = (findings || []).length;
  return total > FINDINGS_DISPLAY
    ? `Showing ${FINDINGS_DISPLAY} of ${total} integrity findings. The remaining ${total - FINDINGS_DISPLAY} are present in the exported audit data.`
    : null;
}

/**
 * The reporting window for a period.
 *
 * `monthly` is a CALENDAR month — [1st 00:00 UTC, 1st of next month 00:00 UTC).
 * It used to be a rolling month ending at the instant of generation, which meant
 * two reports generated 40 days apart left a 10-day hole no report covered, and
 * two generated 20 days apart counted 10 days twice. Monthly evidence is relied
 * on as a complete record of a named month, so the window has to be a property
 * of the month rather than of when somebody pressed the button.
 *
 * Half-open, matching the projection's own [since, until) boundary, so a record
 * on a boundary belongs to exactly one month.
 *
 * The other periods stay rolling and are unchanged: "the last 24 hours" and
 * "the last 7 days" are operational questions where relative-to-now is what is
 * being asked. Quarterly has the same latent gap as monthly did and is left
 * alone deliberately — it is a separate change with its own blast radius.
 */
function windowFor(period, ref = new Date()) {
  const at = new Date(ref);
  if (period === "monthly") {
    return {
      since: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString(),
      until: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString(),
    };
  }
  const end = new Date(ref);
  const start = new Date(ref);
  if (period === "daily") start.setUTCDate(start.getUTCDate() - 1);
  else if (period === "weekly") start.setUTCDate(start.getUTCDate() - 7);
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

// Governed connector activity for a report window, from the normalized audit
// projection. Never throws: monthly evidence is a standing customer commitment,
// and a projection fault must degrade to a stated gap, not lose the whole
// report. The gap is recorded in the artefact rather than hidden.
async function connectorActivityFor({ org_id, environment_id, window: w }) {
  try {
    const s = await connectorAudit.summary({
      org_id, environment_id: environment_id || null, since: w.since, until: w.until,
    });
    const total = s.register.length;
    return {
      ...s,
      register: s.register.slice(-REGISTER_CAP),
      register_total: total,
      register_truncated: total > REGISTER_CAP,
      available: true, unavailable_reason: null,
    };
  } catch (e) {
    return {
      window: w, scope: { org_id, environment_id: environment_id || null },
      totals: null, connectors: [], models: [], providers: [],
      register: [], register_total: 0, register_truncated: false, findings: [],
      available: false, unavailable_reason: (e && e.message) || String(e),
    };
  }
}

// Build (and persist) a report for one org/environment + period.
async function generate({ org_id, environment_id, period, ref, persist = true }) {
  if (!PERIODS.includes(period)) throw new Error(`invalid period: ${period}`);
  const w = windowFor(period, ref ? new Date(ref) : new Date());
  const s = await metrics.summary({ org_id, environment_id, since: w.since, until: w.until });
  // Snapshot the customer's open governance recommendations at report time so the
  // delivered artefact shows the outstanding remediation items (managed service).
  const openRecs = await recommendations.list({ org_id, openOnly: true }).catch(() => []);
  // Governed Integration Gateway / connector activity for the SAME window and
  // the same org+environment scope. Additive: a deployment with no connector
  // evidence (or a store mid-migration) reports zeros, and the rest of the
  // report is byte-identical to before.
  const connector_activity = await connectorActivityFor({ org_id, environment_id, window: w });
  const report = {
    org_id, environment_id: environment_id || null, period,
    window: w, generated_at: store.nowISO(),
    connector_activity,
    headline: executiveLine(period, s),
    totals: s.verdicts, engine_verdicts: s.engine_verdicts, would_block: s.would_block,
    enforced: s.enforced, human_review: s.human_review,
    latency: s.latency, top_rules: s.rule_frequency.slice(0, 5), top_omega: s.omega_frequency.slice(0, 5),
    trajectories: s.total,
    recommendations: openRecs.slice(0, 20).map((r) => ({ title: r.title, detail: r.detail, severity: r.severity, status: r.status })),
  };
  if (persist) return persistReport(report);
  return report;
}

// A deployment can legitimately be ahead of its migrations. If rg_reports has
// no connector_activity column yet, persist the report WITHOUT the section
// rather than losing the month's evidence entirely — the same additive-migration
// tolerance the read surfaces use. The returned report still carries the
// section, so the rendered HTML/PDF/JSON for THIS run is complete; only the
// stored copy omits it, and says so.
const MISSING_COLUMN = /(could not find the '?connector_activity'? column|PGRST204|42703)/i;
async function persistReport(report) {
  try { return await store.insert("reports", report); }
  catch (e) {
    if (!MISSING_COLUMN.test(String((e && e.message) || e))) throw e;
    require("./log").warn("reports_connector_activity_column_missing", {
      table: "rg_reports", hint: "apply supabase/connector_audit_projection.sql",
    });
    const { connector_activity, ...withoutSection } = report;
    const rec = await store.insert("reports", withoutSection);
    return { ...rec, connector_activity, connector_activity_persisted: false };
  }
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
  const STATUS_LABEL = { open: "Open", acknowledged: "Acknowledged", in_progress: "In Progress", resolved: "Resolved" };
  if ((r.recommendations || []).length) {
    L.push(`## Open recommendations`, "", `| Severity | Status | Recommendation |`, `|---|---|---|`);
    for (const x of r.recommendations) L.push(`| ${x.severity} | ${STATUS_LABEL[x.status] || x.status} | ${x.title}${x.detail ? " — " + x.detail.replace(/\n+/g, " ") : ""} |`);
    L.push("");
  }
  for (const line of connectorMarkdown(r.connector_activity)) L.push(line);
  L.push(`---`, `*Generated by Resurrection Tech™ Runtime Governance. Runtime evidence is recorded from the live engine — never fabricated.*`);
  return L.join("\n");
}

const shortHash = (h) => (h ? `${String(h).slice(0, 16)}…` : "—");

// Additive Markdown for governed connector activity. Returns [] when the report
// predates the projection, so historical reports render exactly as they did.
function connectorMarkdown(ca) {
  if (!ca) return [];
  const L = [];
  L.push(`## Governed connector activity`, "");
  if (!ca.available) {
    L.push(`> Connector evidence could not be projected for this window: ${ca.unavailable_reason}. No connector activity is claimed.`, "");
    return L;
  }
  const t = ca.totals || {};
  L.push(`| Metric | Value |`, `|---|---|`);
  L.push(`| Governed connector actions | ${t.governed_actions || 0} |`);
  L.push(`| Permitted / Blocked / Escalated | ${t.permitted || 0} / ${t.blocked || 0} / ${t.escalated || 0} |`);
  L.push(`| Approved / Rejected | ${t.approved || 0} / ${t.rejected || 0} |`);
  L.push(`| Failed closed | ${t.failed_closed || 0} |`);
  L.push(`| Successful controlled executions | ${t.successful_executions || 0} |`);
  L.push(`| Provider invocations | ${t.provider_invocations || 0} |`);
  L.push(`| Evidence completeness | ${t.evidence_completeness_pct != null ? t.evidence_completeness_pct + "%" : "—"} |`);
  L.push(`| Connector coverage | ${t.connector_coverage || 0} |`);
  L.push(`| Model / provider coverage | ${t.model_coverage || 0} / ${(ca.providers || []).length} |`, "");
  if ((ca.connectors || []).length) {
    L.push(`### Connector activity`, "", `| Connector | Type | Provider | Requests | Allow / Block / Escalate | Approvals | Provider calls | Failed closed | Evidence |`, `|---|---|---|---|---|---|---|---|---|`);
    for (const c of ca.connectors) {
      L.push(`| ${c.connector_name || c.connector_id || "—"} | ${c.normalized_connector}${c.connector_type && c.normalized_connector === "other" ? ` (${c.connector_type})` : ""} | ${c.provider || "—"} | ${c.governed_requests} | ${c.allow} / ${c.block} / ${c.escalate} | ${c.approvals} | ${c.provider_calls} | ${c.failed_closed} | ${c.evidence_count} |`);
    }
    L.push("");
  }
  if ((ca.register || []).length) {
    L.push(`### Evidence register`, "");
    const note = registerNote(ca);
    if (note) L.push(`_${note}_`, "");
    L.push(`| Evidence ID | Timestamp | Canonical action | Proposal | Decision | Connector / provider / model | Status | Provider calls | Request hash | Response hash |`, `|---|---|---|---|---|---|---|---|---|---|`);
    for (const row of displayRows(ca.register)) {
      L.push(`| ${row.evidence_id} | ${(row.executed_at || "").slice(0, 19).replace("T", " ")} | ${row.canonical_action_id || "—"} | ${row.proposal_id || "—"} | ${row.governance_decision || "—"} | ${row.normalized_connector} / ${row.provider || "—"} / ${row.model || "—"} | ${row.execution_outcome} | ${row.provider_invocation_count} | ${shortHash(row.request_hash)} | ${shortHash(row.response_hash)} |`);
    }
    L.push("");
  }
  if ((ca.findings || []).length) {
    L.push(`### Integrity findings and exceptions`, "", `| Severity | Finding | Detail |`, `|---|---|---|`);
    for (const f of ca.findings.slice(0, FINDINGS_DISPLAY)) L.push(`| ${f.severity} | ${f.kind} | ${f.detail} |`);
    const fnote = findingsNote(ca.findings);
    if (fnote) L.push("", `_${fnote}_`);
    L.push("");
  } else if ((ca.register || []).length) {
    L.push(`### Integrity findings and exceptions`, "", `No integrity exceptions were detected: every governed connector execution in this window is attributable to a canonical action, a proposal and a connector in scope.`, "");
  }
  return L;
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

// Additive HTML for governed connector activity, in the document's existing
// editorial shell. Returns "" for a report without the section, so previously
// generated reports re-render unchanged.
function connectorHtml(ca, esc) {
  if (!ca) return "";
  const H = [`<hr class="hair" /><h2>Governed connector activity</h2>`];
  if (!ca.available) {
    return `${H[0]}<p>Connector evidence could not be projected for this window: ${esc(ca.unavailable_reason || "unknown")}. No connector activity is claimed for this period.</p>`;
  }
  const t = ca.totals || {};
  H.push(`<p>Connector executions reach this report through the same chain as every other governed action — canonical action, proposal, Runtime Governance decision, controlled execution, immutable evidence.</p>`);
  H.push(`<table class="metric"><tr><th>Metric</th><th colspan="2">Value</th></tr>`
    + `<tr><td>Governed connector actions</td><td colspan="2">${t.governed_actions || 0}</td></tr>`
    + `<tr><td>Permitted / Blocked / Escalated</td><td colspan="2">${t.permitted || 0} / ${t.blocked || 0} / ${t.escalated || 0}</td></tr>`
    + `<tr><td>Approved / Rejected</td><td colspan="2">${t.approved || 0} / ${t.rejected || 0}</td></tr>`
    + `<tr><td>Failed closed</td><td colspan="2">${t.failed_closed || 0}</td></tr>`
    + `<tr><td>Successful controlled executions</td><td colspan="2">${t.successful_executions || 0}</td></tr>`
    + `<tr><td>Provider invocations</td><td colspan="2">${t.provider_invocations || 0}</td></tr>`
    + `<tr><td>Evidence completeness</td><td colspan="2">${t.evidence_completeness_pct != null ? esc(t.evidence_completeness_pct) + "%" : "—"}</td></tr>`
    + `<tr><td>Connector / model coverage</td><td colspan="2">${t.connector_coverage || 0} / ${t.model_coverage || 0}</td></tr></table>`);
  if ((ca.connectors || []).length) {
    H.push(`<h2>Connector activity</h2><table><tr><th>Connector</th><th>Type</th><th>Provider</th><th>Requests</th><th>A / B / E</th><th>Approvals</th><th>Provider calls</th><th>Failed closed</th><th>Evidence</th></tr>`
      + ca.connectors.map((c) => `<tr><td>${esc(c.connector_name || c.connector_id || "—")}</td><td>${esc(c.normalized_connector)}${c.normalized_connector === "other" && c.connector_type ? ` (${esc(c.connector_type)})` : ""}</td><td>${esc(c.provider || "—")}</td><td>${c.governed_requests}</td><td>${c.allow} / ${c.block} / ${c.escalate}</td><td>${c.approvals}</td><td>${c.provider_calls}</td><td>${c.failed_closed}</td><td>${c.evidence_count}</td></tr>`).join("")
      + `</table>`);
  }
  if ((ca.register || []).length) {
    H.push(`<h2>Evidence register</h2>`);
    const note = registerNote(ca);
    if (note) H.push(`<p>${esc(note)}</p>`);
    H.push(`<table><tr><th>Evidence ID</th><th>Timestamp</th><th>Canonical action</th><th>Proposal</th><th>Decision</th><th>Connector / provider / model</th><th>Status</th><th>Calls</th><th>Request hash</th></tr>`
      + displayRows(ca.register).map((row) => `<tr><td>${esc(row.evidence_id)}</td><td>${esc((row.executed_at || "").slice(0, 19).replace("T", " "))}</td><td>${esc(row.canonical_action_id || "—")}</td><td>${esc(row.proposal_id || "—")}</td><td>${esc(row.governance_decision || "—")}</td><td>${esc(row.normalized_connector)} / ${esc(row.provider || "—")} / ${esc(row.model || "—")}</td><td>${esc(row.execution_outcome)}</td><td>${row.provider_invocation_count}</td><td>${esc(shortHash(row.request_hash))}</td></tr>`).join("")
      + `</table>`);
  }
  if ((ca.findings || []).length) {
    H.push(`<h2>Integrity findings and exceptions</h2><table><tr><th>Severity</th><th>Finding</th><th>Detail</th></tr>`
      + ca.findings.slice(0, FINDINGS_DISPLAY).map((f) => `<tr><td>${esc(f.severity)}</td><td>${esc(f.kind)}</td><td>${esc(f.detail)}</td></tr>`).join("")
      + `</table>`
      + (findingsNote(ca.findings) ? `<p>${esc(findingsNote(ca.findings))}</p>` : ""));
  } else if ((ca.register || []).length) {
    H.push(`<h2>Integrity findings and exceptions</h2><p>No integrity exceptions were detected: every governed connector execution in this window is attributable to a canonical action, a proposal and a connector in scope.</p>`);
  }
  return H.join("");
}

// Concise monthly evidence in the same editorial shell as customer-facing
// reports. This remains operational telemetry, not the 48-Hour Audit.
function toHtml(r) {
  const s = summarize(r);
  const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join("");
  const freq = (rows) => (rows || []).map((x) => `<tr><td>${esc(x.key)}</td><td>${x.count}</td><td>${x.pct}%</td></tr>`).join("");
  const title = `${esc(r.period[0].toUpperCase() + r.period.slice(1))} Runtime Governance — Evidence Report`;
  const totals = r.totals || {};
  const engineBlocked = (r.engine_verdicts || {}).BLOCK || totals.BLOCK || 0;
  const enforcementValue = r.enforced ? `${engineBlocked} blocked` : `${r.would_block || 0} would block`;
  const enforcementCopy = r.enforced ? "Unsafe actions intercepted before execution." : "Would-be blocks recorded in shadow mode.";
  const meanCompute = (((r.latency || {}).engine_compute_ms || {}).mean);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
${FONT_FACE_CSS}
@page{size:A4;margin:20mm 18mm}*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:"TeX Gyre Pagella",Georgia,serif;color:#14181d;font-size:11pt;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.eyebrow,h2,table,.risk,.sub,.foot{font-family:"TeX Gyre Heros",Arial,sans-serif}
.eyebrow{font-size:8.5pt;letter-spacing:.22em;text-transform:uppercase;color:#8a6d1f}
h1{font-size:22pt;line-height:1.15;margin:6px 0 4px;font-weight:600;letter-spacing:-.01em}
.sub{font-size:9pt;color:#6b7480;letter-spacing:.04em}.rule{border:0;border-top:1px solid #14181d;margin:14px 0 18px}.hair{border:0;border-top:1px solid #d8dde3;margin:18px 0}
h2{font-size:10pt;letter-spacing:.12em;text-transform:uppercase;margin:20px 0 8px}p{margin:0 0 10px}ul{margin:0 0 10px;padding-left:18px}li{margin:3px 0}
.summary{margin:22px 0 24px;break-inside:avoid}.summary-kicker{font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:8.5pt;letter-spacing:.2em;text-transform:uppercase;color:#7a7f86}
.summary-title{font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:16pt;line-height:1.2;letter-spacing:-.01em;text-transform:none;margin:5px 0 13px}
.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.summary-card{min-height:92px;padding:13px 15px;background:#f5f5f4;border:1px solid #dededc;border-radius:2px;break-inside:avoid}.summary-card.lead{border-left:3px solid #14181d}
.card-label{display:block;font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:8.5pt;letter-spacing:.12em;text-transform:uppercase;color:#7a7f86}.card-value{display:block;font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:18pt;line-height:1.15;font-weight:600;margin-top:7px}.card-copy{display:block;color:#6b6f74;font-size:9.5pt;line-height:1.3;margin-top:5px}
.risk{display:inline-block;font-size:8.5pt;letter-spacing:.08em;text-transform:uppercase;padding:2px 9px;border-radius:2px;border:1px solid currentColor}
.risk.High{color:#b3261e}.risk.Medium{color:#9a6b00}.risk.Low{color:#1e7a46}
table{border-collapse:collapse;width:100%;font-size:9.5pt}td,th{border-bottom:1px solid #e6e9ee;padding:7px 0;text-align:left}th{color:#6b7480;font-weight:500;letter-spacing:.04em}
.metric th{width:58%}.foot{font-size:8pt;color:#8a929c;letter-spacing:.08em;margin-top:26px;padding-top:12px;border-top:1px solid #d8dde3}
@media screen{body{max-width:900px;margin:32px auto;padding:40px 48px}}
@media screen and (max-width:600px){body{width:100%;margin:0;padding:24px 18px 40px;overflow-wrap:anywhere}h1{font-size:20pt}table{table-layout:fixed}td,th{overflow-wrap:anywhere}.summary-card{min-height:104px;padding:12px}.card-value{font-size:15pt}}
</style></head><body>
<div class="eyebrow">Resurrection Tech&trade; &middot; Confidential</div>
<h1>${title}</h1>
<div class="sub">Operational governance evidence &middot; ${esc((r.window && r.window.since || "").slice(0, 10))} &rarr; ${esc((r.window && r.window.until || "").slice(0, 10))} &middot; generated ${esc((r.generated_at || "").slice(0, 10))}</div>
<hr class="rule" />
<p style="font-size:12pt">${esc(r.headline || "")}</p>
<section class="summary">
<div class="summary-kicker">Monthly operating summary</div><h2 class="summary-title">What happened during this governance window?</h2>
<div class="summary-grid">
<div class="summary-card lead"><span class="card-label">Operating mode</span><span class="card-value">${r.enforced ? "Enforcing" : "Shadow"}</span><span class="card-copy">${enforcementCopy}</span></div>
<div class="summary-card"><span class="card-label">Trajectories governed</span><span class="card-value">${r.trajectories || 0}</span><span class="card-copy">Recorded runtime decisions in this reporting window.</span></div>
<div class="summary-card"><span class="card-label">ALLOW / ESCALATE / BLOCK</span><span class="card-value">${totals.ALLOW || 0} / ${totals.ESCALATE || 0} / ${totals.BLOCK || 0}</span><span class="card-copy">The period's governed outcome mix.</span></div>
<div class="summary-card"><span class="card-label">Enforcement effect</span><span class="card-value">${enforcementValue}</span><span class="card-copy">${enforcementCopy}</span></div>
<div class="summary-card"><span class="card-label">Human review</span><span class="card-value">${r.human_review || 0}</span><span class="card-copy">Trajectories escalated for an authorised decision.</span></div>
<div class="summary-card"><span class="card-label">Mean decision time</span><span class="card-value">${meanCompute != null ? `${meanCompute} ms` : "Not measured"}</span><span class="card-copy">Mean engine compute time across recorded decisions.</span></div>
</div></section>
<h2>Executive summary &middot; Overall posture</h2>
<p>${esc(s.executive.posture)}</p>
<p><b>Risk level:</b> <span class="risk ${s.executive.risk}">${s.executive.risk}</span></p>
<h2>Key findings</h2><ul>${li(s.executive.key_findings)}</ul>
<h2>Business impact</h2><p>${esc(s.executive.business_impact)}</p>
<h2>Recommended actions</h2><ul>${li(s.executive.recommended_actions)}</ul>
<hr class="hair" />
<h2>Evidence at a glance</h2>
<table class="metric"><tr><th>Metric</th><th colspan="2">Value</th></tr>
<tr><td>Trajectories governed</td><td colspan="2">${r.trajectories}</td></tr>
<tr><td>ALLOW / ESCALATE / BLOCK</td><td colspan="2">${(r.totals || {}).ALLOW || 0} / ${(r.totals || {}).ESCALATE || 0} / ${(r.totals || {}).BLOCK || 0}</td></tr>
<tr><td>Would-have-blocked (shadow)</td><td colspan="2">${r.would_block}</td></tr>
<tr><td>Mean / p95 engine compute</td><td colspan="2">${((r.latency || {}).engine_compute_ms || {}).mean ?? "—"} / ${((r.latency || {}).engine_compute_ms || {}).p95 ?? "—"} ms</td></tr></table>
${(r.top_rules || []).length ? `<h2>Top Ω rules fired</h2><table><tr><th>Rule</th><th>Count</th><th>%</th></tr>${freq(r.top_rules)}</table>` : ""}
${(r.top_omega || []).length ? `<h2>Ω-domain frequency</h2><table><tr><th>Domain</th><th>Count</th><th>%</th></tr>${freq(r.top_omega)}</table>` : ""}
${(r.recommendations || []).length ? `<h2>Open recommendations</h2><table><tr><th>Severity</th><th>Status</th><th>Recommendation</th></tr>${(r.recommendations || []).map((x) => `<tr><td>${esc(x.severity)}</td><td>${esc(({ open: "Open", acknowledged: "Acknowledged", in_progress: "In Progress", resolved: "Resolved" })[x.status] || x.status)}</td><td>${esc(x.title)}${x.detail ? " — " + esc(x.detail) : ""}</td></tr>`).join("")}</table>` : ""}
${connectorHtml(r.connector_activity, esc)}
<div class="foot">Patent GB2600765.8 &middot; Morrison Runtime Governance&trade; &middot; Monthly operational evidence from the live engine — never fabricated.</div>
</body></html>`;
}

// registerNote/findingsNote are exported so the FULL AUDIT renders the same
// disclosure wording as the monthly pack. Two documents that describe the same
// truncation in different words is the defect F-06 was about, one level up.
module.exports = { PERIODS, REGISTER_CAP, REGISTER_DISPLAY, FINDINGS_DISPLAY, registerNote, findingsNote, windowFor, generate, generateAllDue, listReports, getReport, summarize, toMarkdown, toHtml, connectorActivityFor, connectorMarkdown, connectorHtml };

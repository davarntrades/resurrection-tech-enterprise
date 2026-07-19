/* ============================================================================
 * Operations Agent — executive briefing (the "Morning." surface).
 *
 * Aggregates the platform state into one structured briefing: counts + a
 * short list of human-readable lines. Consumed by the Operations Dashboard
 * and by external clients (OpenClaw, Slack, Teams, …) via /api/ops/briefing —
 * clients are just renderers of this one payload, so no client is ever
 * special-cased in the core. Read-only; never throws.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const proposals = require("./proposals");
const evidence = require("./evidence");
const integrations = require("./integrations");
const agent = require("./agent");

async function briefing() {
  const generated_at = rt.store.nowISO();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [orgs, reports, alerts, props, ev, probes, run] = await Promise.all([
    rt.store.find("orgs", {}).catch(() => []),
    rt.store.find("reports", {}).catch(() => []),
    rt.store.find("alerts", {}).catch(() => []),
    proposals.summary().catch(() => ({ by_status: {}, awaiting_operator: 0 })),
    evidence.summary().catch(() => ({ by_verdict: {}, blocked_24h: 0 })),
    integrations.probeAll().catch(() => ({ integrations: [] })),
    agent.lastRun().catch(() => null),
  ]);

  const newCustomers = orgs.filter((o) => String(o.created_at) >= weekAgo).length;
  const reports24h = reports.filter((r) => String(r.created_at) >= dayAgo).length;
  const criticalAlerts = alerts.filter((a) => a.severity === "critical" && String(a.created_at) >= dayAgo).length;
  const unhealthy = probes.integrations.filter((i) => !["healthy", "unconfigured"].includes(i.status));

  const counts = {
    customers: orgs.length,
    new_customers_7d: newCustomers,
    reports_completed_24h: reports24h,
    critical_alerts_24h: criticalAlerts,
    governance_violations_24h: ev.blocked_24h || 0,
    proposals_awaiting_approval: props.awaiting_operator || 0,
    integrations_degraded: unhealthy.length,
    last_agent_run: run ? { at: run.started_at, status: run.status, trigger: run.trigger } : null,
  };

  // Human-readable lines, most important first (the OpenClaw "Morning" reply).
  const lines = [];
  if (reports24h) lines.push(`${reports24h} enterprise report${reports24h === 1 ? "" : "s"} completed.`);
  if (newCustomers) lines.push(`${newCustomers} new customer${newCustomers === 1 ? "" : "s"} this week.`);
  for (const it of probes.integrations) {
    if (it.status === "healthy") lines.push(`${it.name === "railway" ? "Railway deployment" : it.name} healthy.`);
    else if (it.status !== "unconfigured") lines.push(`${it.name} ${it.status} — attention needed.`);
  }
  if (ev.blocked_24h) lines.push(`${ev.blocked_24h} Runtime Governance violation${ev.blocked_24h === 1 ? "" : "s"} blocked.`);
  if (props.awaiting_operator) lines.push(`${props.awaiting_operator} action${props.awaiting_operator === 1 ? "" : "s"} awaiting your approval.`);
  if (criticalAlerts) lines.push(`${criticalAlerts} critical alert${criticalAlerts === 1 ? "" : "s"} in the last 24h.`);
  if (!lines.length) lines.push("All quiet. No items need attention.");

  return { generated_at, counts, lines, text: lines.join("\n") };
}

module.exports = { briefing };

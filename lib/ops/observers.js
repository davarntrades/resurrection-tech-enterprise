/* ============================================================================
 * Operations Agent — observation layer (the "Observe" step).
 *
 * Assembles a structured snapshot of platform state from the EXISTING
 * lib/runtime modules + integration probes: customer onboarding/lifecycle,
 * stalled journeys, failed runtime evaluations, engine verdict mix, report
 * cadence, alerts, deployments. Read-only — observers never mutate anything.
 *
 * Output: { observed_at, observations: [{kind, severity, org_id?, summary,
 * data}] } — the reasoning layer consumes this, never raw store rows.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const integrations = require("./integrations");
const gmail = require("./gmail");
const evidence = require("./evidence");

// Ω rules whose BLOCK is a SECURITY signal, not routine authorisation friction:
// an attempt to destroy evidence, exfiltrate credentials, self-raise autonomy,
// or make an internal-only action reach outside the platform. Every one was
// refused by Runtime Governance — the refusal itself is the threat evidence.
const SECURITY_REFUSAL_RULES = new Set([
  "ops_evidence_destruction",
  "ops_credential_sharing",
  "ops_unauthorized_autonomy_change",
  "ops_internal_action_external_reach",
]);
const SECURITY_WINDOW_DAYS = () => {
  const n = Number(process.env.OPS_SECURITY_WINDOW_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 7;
};

const STALL_DAYS = () => {
  const n = Number(process.env.OPS_STALL_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 7;
};

function obs(kind, severity, summary, data = {}, org_id = null) {
  return { kind, severity, org_id, summary, data };
}

async function observe() {
  const observed_at = rt.store.nowISO();
  const observations = [];
  const daysAgoISO = (d) => new Date(Date.now() - d * 86400000).toISOString();

  // ── Customers, onboarding + stalled journeys ──────────────────────────────
  const orgs = await rt.store.find("orgs", {}).catch(() => []);
  const weekAgo = daysAgoISO(7);
  const newOrgs = orgs.filter((o) => String(o.created_at) >= weekAgo);
  if (newOrgs.length) {
    observations.push(obs("customers.new", "info",
      `${newOrgs.length} new customer${newOrgs.length === 1 ? "" : "s"} in the last 7 days`,
      { orgs: newOrgs.map((o) => ({ id: o.id, name: o.name })) }));
  }

  for (const org of orgs) {
    // Lifecycle-derived next operator action + stall detection.
    const lc = await rt.lifecycle.compute(org).catch(() => null);
    const last = await rt.store.queryDecisions({ org_id: org.id, limit: 1 }).catch(() => []);
    const lastEval = last[0] ? String(last[0].created_at || last[0].ts || "") : null;
    const stalled = lastEval ? lastEval < daysAgoISO(STALL_DAYS()) : String(org.created_at) < daysAgoISO(STALL_DAYS());
    if (stalled) {
      observations.push(obs("customers.stalled", "warning",
        `${org.name || org.id}: no runtime evaluations for over ${STALL_DAYS()} days`,
        { last_evaluation: lastEval, next_action: lc && lc.next ? lc.next : null }, org.id));
    }

    // Failed / blocked runtime evaluations in the last 24h.
    const m = await rt.metrics.summary({ org_id: org.id, since: daysAgoISO(1) }).catch(() => null);
    if (m && m.total > 0) {
      const v = m.verdicts || {};
      if ((v.ENGINE_UNAVAILABLE || 0) > 0) {
        observations.push(obs("runtime.engine_unavailable", "critical",
          `${org.name || org.id}: ${v.ENGINE_UNAVAILABLE} evaluation(s) could not reach the governance engine in 24h`,
          { counts: v }, org.id));
      }
      if ((v.BLOCK || 0) > 0) {
        observations.push(obs("runtime.blocked", "warning",
          `${org.name || org.id}: ${v.BLOCK} BLOCK verdict(s) in 24h (${v.block_pct || 0}% of ${m.total})`,
          { counts: v, total: m.total }, org.id));
      }
    }
  }

  // ── Reports cadence ───────────────────────────────────────────────────────
  const reports = await rt.store.find("reports", {}).catch(() => []);
  const recentReports = reports.filter((r) => String(r.created_at) >= daysAgoISO(1));
  if (recentReports.length) {
    observations.push(obs("reports.completed", "info",
      `${recentReports.length} governance report(s) generated in the last 24h`,
      { count: recentReports.length }));
  }

  // ── Operational alerts (existing alerting layer) ──────────────────────────
  const alerts = await rt.store.find("alerts", {}).catch(() => []);
  const openAlerts = alerts.filter((a) => String(a.created_at) >= daysAgoISO(1));
  const critical = openAlerts.filter((a) => a.severity === "critical");
  if (critical.length) {
    observations.push(obs("alerts.critical", "critical",
      `${critical.length} critical alert(s) in the last 24h`, { kinds: critical.map((a) => a.kind) }));
  }

  // ── Deployments + external integrations ───────────────────────────────────
  const probes = await integrations.probeAll();
  for (const it of probes.integrations) {
    if (it.status === "unconfigured") continue;
    const sev = it.status === "healthy" ? "info" : it.status === "degraded" ? "warning" : "critical";
    observations.push(obs(`integration.${it.name}`, sev, `${it.name}: ${it.status}`, it));
  }

  // ── Store durability (evidence integrity) ─────────────────────────────────
  if (!rt.store.durable()) {
    observations.push(obs("store.non_durable", "warning",
      "runtime store is non-durable (file store) — evidence at risk; configure Supabase", {}));
  }

  // ── Security: governed refusals (blocked abuse attempts) ──────────────────
  // Every security-relevant action the platform BLOCKED is recorded as evidence;
  // scanning it turns "the attempt was governed" into an actionable threat
  // signal. Read-only — this only surfaces what governance already refused.
  try {
    const blocked = await evidence.search({ verdict: "block", since: daysAgoISO(SECURITY_WINDOW_DAYS()), limit: 200 });
    const threats = blocked.filter((e) => e.rule && SECURITY_REFUSAL_RULES.has(e.rule));
    if (threats.length) {
      // One rollup observation (count + rule mix) + one per distinct attempt so
      // the Security agent can open an incident per refusal without losing detail.
      const ruleCounts = {};
      for (const t of threats) ruleCounts[t.rule] = (ruleCounts[t.rule] || 0) + 1;
      observations.push(obs("security.governed_refusals", "critical",
        `${threats.length} governed refusal(s) of security-sensitive actions in the last ${SECURITY_WINDOW_DAYS()}d`,
        { count: threats.length, by_rule: ruleCounts }));
      for (const t of threats.slice(0, 25)) {
        observations.push(obs("security.governed_refusal", "critical",
          `Blocked ${t.action_id} (${t.rule})${t.agent_id ? ` from ${t.agent_id}` : ""} — Runtime Governance refused it`,
          { action_id: t.action_id, rule: t.rule, agent_id: t.agent_id, evidence_id: t.id, reason: t.reason }, t.org_id));
      }
    }
  } catch { /* fail-soft — security scan never blocks the observation cycle */ }

  // ── Email (read-only Gmail) — refresh inbox, then observe awaiting-reply +
  // prospect inbound. Email is untrusted DATA: it only ever produces
  // observations here; it never drives a privileged action. Fail-soft.
  try {
    if (await gmail.connected()) {
      await gmail.poll({ actor: "observer" }).catch(() => {});
      const em = await gmail.summary({ days: 7 });
      if (em && em.available) {
        for (const a of em.awaiting_reply || []) {
          observations.push(obs("customers.email_awaiting_reply", "warning",
            `${a.from_email} emailed “${String(a.subject || "").slice(0, 80)}” — no reply or engagement note since`,
            { subject: a.subject, from_email: a.from_email, received_at: a.received_at, thread_url: a.thread_url }, a.org_id));
        }
        if (em.inbound_prospect > 0) {
          observations.push(obs("prospect.email_inbound", "info",
            `${em.inbound_prospect} inbound prospect email${em.inbound_prospect === 1 ? "" : "s"} this week`, { count: em.inbound_prospect }));
        }
      }
    }
  } catch { /* fail-soft — email never blocks the observation cycle */ }

  return { observed_at, observations };
}

module.exports = { observe };

/* ============================================================================
 * Guardian OS — Executive Homepage (v0).
 *
 * The unified executive surface over the whole platform: "sitting beside the
 * CEO." It answers seven questions, each GROUNDED in real records (never an
 * invented fact) and each actionable item deep-linked into the EXISTING governed
 * flow — nothing here executes anything:
 *
 *   1. What is happening?              live enterprise state + last council cycle
 *   2. What needs attention?          escalations · incidents · security · unverified
 *   3. What should we approve today?  the escalated-proposal queue (→ Approvals)
 *   4. What is our biggest opportunity?  deterministic pick from the twin
 *   5. What is our biggest risk?         deterministic pick from the twin
 *   6. What happens if we do nothing?    deterministic consequence projection
 *   7. Enterprise health                 governed dimensions (from the twin)
 *
 * Read-only + fail-closed inherited: planning output is a RECOMMENDATION until a
 * governed proposal is approved; if the engine is down nothing executes, and the
 * homepage still renders read-only state so the operator never goes blind.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const twin = require("./twin");
const proposals = require("./proposals");
const incidents = require("./incidents");
const evidence = require("./evidence");
const risk = require("./risk");
const architecture = require("./architecture");
const partners = require("./partners");
const policies = require("./policies");

const POLICY_GAP_RULES = new Set([
  "ops_evidence_destruction", "ops_credential_sharing",
  "ops_unauthorized_autonomy_change", "ops_internal_action_external_reach",
  "ops_unauthorized_policy_activation",
]);

const DAY = 86400000;
const ageDays = (iso) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : 0);
const opsHref = (view, org) => `/admin/operations?view=${view}${org ? `&org=${encodeURIComponent(org)}` : ""}`;

/** The deterministic "if we do nothing" consequence projection — every item
 *  references a real record, so the operator can trace the claim. */
function consequences({ t, escalated, openIncidents, reviewsDue, nowISO }) {
  const out = [];
  // Live customers gone quiet → renewal/churn risk.
  for (const c of t.customers.filter((c) => c.live && c.stalled)) {
    out.push({ area: "commercial", subject: c.name, org_id: c.org_id,
      if_ignored: `${c.name} is a live customer that has gone quiet — renewal risk compounds until re-engaged`,
      horizon: "weeks", ref: opsHref("customers", c.org_id) });
  }
  // At-risk early-stage customers → deals decay.
  for (const c of t.customers.filter((c) => !c.live && c.health_band === "at_risk")) {
    out.push({ area: "commercial", subject: c.name, org_id: c.org_id,
      if_ignored: `${c.name} is at-risk pre-pilot — the opportunity decays without a next step (${c.next_recommendation || "re-engage"})`,
      horizon: "weeks", ref: opsHref("customers", c.org_id) });
  }
  // Reviews due/overdue → compliance + engagement slip.
  for (const r of reviewsDue) {
    const c = t.customers.find((x) => x.org_id === r.org_id);
    out.push({ area: "compliance", subject: c ? c.name : r.org_id, org_id: r.org_id,
      if_ignored: `review was due ${r.next_review_date} — the engagement cadence and compliance posture slip until it happens`,
      horizon: "now", ref: opsHref("customers", r.org_id) });
  }
  // Escalated proposals aging → governed work stalls until you approve/deny.
  for (const p of escalated) {
    out.push({ area: "governance", subject: p.action_id, org_id: p.org_id,
      if_ignored: `a governed action has waited ${ageDays(p.created_at)}d for your sign-off — the work it represents does not happen until approved`,
      horizon: "now", ref: opsHref("approvals", p.org_id) });
  }
  // Open incidents aging → unresolved operational/security risk.
  for (const i of openIncidents) {
    out.push({ area: i.kind && String(i.kind).startsWith("security") ? "security" : "operational", subject: i.kind, org_id: i.org_id,
      if_ignored: `incident open ${ageDays(i.opened_at || i.created_at)}d (${i.summary || i.kind}) — the risk it flags stays live until resolved`,
      horizon: "now", ref: opsHref("blocked", i.org_id) });
  }
  // Active governed refusals → an attempted abuse the platform blocked but no one has reviewed.
  if (t.enterprise.security.governed_refusals_7d > 0) {
    out.push({ area: "security", subject: "governed refusals", org_id: null,
      if_ignored: `${t.enterprise.security.governed_refusals_7d} security-sensitive action(s) were refused by governance this week — unreviewed, the underlying attempt goes unexamined`,
      horizon: "now", ref: opsHref("blocked", null) });
  }
  return out;
}

function biggestOpportunity(customers) {
  const cand = customers.map((c) => ({
    org_id: c.org_id, name: c.name, live: c.live,
    // Pre-pilot: closeness to converting. Live: expansion value.
    severity: c.live ? ({ high: 80, medium: 55, developing: 40, low: 20 }[c.business_value] || 30) : c.pilot_readiness,
    basis: c.live ? `live customer, ${c.business_value} business value — expansion/renewal` : `pilot readiness ${c.pilot_readiness}% — closest to converting`,
    ref: opsHref("customers", c.org_id),
  }));
  cand.sort((a, b) => b.severity - a.severity || String(a.name).localeCompare(String(b.name)));
  return cand[0] || null;
}

function biggestRisk({ customers, enterprise, openIncidents }) {
  const cand = [];
  for (const c of customers.filter((c) => c.health_band === "at_risk")) {
    cand.push({ area: "customer", subject: c.name, org_id: c.org_id, severity: 100 - c.health,
      summary: `${c.name}: health ${c.health} (${c.risk_band} runtime risk)`, ref: opsHref("customers", c.org_id) });
  }
  for (const i of openIncidents.filter((i) => i.severity === "critical")) {
    cand.push({ area: "operational", subject: i.kind, org_id: i.org_id, severity: 92,
      summary: `critical incident: ${i.summary || i.kind}`, ref: opsHref("blocked", i.org_id) });
  }
  if (enterprise.security.governed_refusals_7d > 0) {
    cand.push({ area: "security", subject: "governed refusals", org_id: null, severity: 70 + Math.min(25, enterprise.security.governed_refusals_7d * 5),
      summary: `${enterprise.security.governed_refusals_7d} security-sensitive action(s) refused by governance this week`, ref: opsHref("blocked", null) });
  }
  cand.sort((a, b) => b.severity - a.severity || String(a.subject).localeCompare(String(b.subject)));
  return cand[0] || null;
}

/** The additional executive questions the Guardian OS departments answer — each
 *  grounded in real records, each deep-linked into a governed surface. */
async function executiveQuestions({ t, escalated, openIncidents }) {
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
  const [trends, arch, partnerAttention, policyDrafts, blocked] = await Promise.all([
    risk.trends({ windowDays: 1 }).catch(() => ({ since_yesterday: [], health_deltas: [], metrics: [] })),
    architecture.coverage().catch(() => ({ coverage_pct: 100, gaps: 0, gap_customers: [] })),
    partners.needingAttention().catch(() => []),
    policies.list({ status: "draft", limit: 20 }).catch(() => []),
    evidence.search({ verdict: "block", since: weekAgo, limit: 300 }).catch(() => []),
  ]);

  // What policy to create next: rules refused repeatedly this week.
  const ruleCounts = {};
  for (const e of blocked) if (e.rule && POLICY_GAP_RULES.has(e.rule)) ruleCounts[e.rule] = (ruleCounts[e.rule] || 0) + 1;
  const policy_gaps = Object.entries(ruleCounts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
    .map(([rule, count]) => ({ rule, count, suggestion: `draft a policy reinforcing ${rule}` }));

  // Customers drifting to risk: at-risk in the twin, plus recent health declines.
  const nameOf = (id) => (t.customers.find((c) => c.org_id === id) || {}).name || id;
  const drifting = t.customers.filter((c) => c.health_band === "at_risk" || c.risk_band === "high")
    .map((c) => ({ org_id: c.org_id, name: c.name, health: c.health, risk_band: c.risk_band, ref: opsHref("customers", c.org_id) }));
  for (const d of (trends.health_deltas || []).filter((h) => h.delta <= -5)) {
    if (!drifting.some((x) => x.org_id === d.org_id)) drifting.push({ org_id: d.org_id, name: nameOf(d.org_id), health: d.current, delta: d.delta, ref: opsHref("customers", d.org_id) });
  }

  // Where governance slows execution: the approval backlog + its oldest item.
  const oldest = escalated.reduce((m, p) => Math.max(m, ageDays(p.created_at)), 0);

  return {
    what_changed_overnight: trends.since_yesterday || [],
    incidents_need_attention: openIncidents.map((i) => ({ id: i.id, severity: i.severity, summary: i.summary || i.kind, org_id: i.org_id, age_days: ageDays(i.opened_at || i.created_at), ref: opsHref("blocked", i.org_id) })),
    customers_drifting_to_risk: drifting,
    governance_friction: { awaiting_approval: escalated.length, oldest_wait_days: oldest, note: escalated.length ? `${escalated.length} governed action(s) waiting on operator sign-off (oldest ${oldest}d) — this is where execution is gated on you` : "no governed work is blocked on approval", ref: opsHref("approvals", null) },
    partner_needs_attention: partnerAttention.map((p) => ({ name: p.name, kind: p.kind, reason: p.reason, health: p.health })),
    policy_to_create_next: policy_gaps,
    policy_drafts_pending: policyDrafts.map((d) => ({ id: d.id, title: d.title, kind: d.kind, created_by: d.created_by })),
    architecture_gaps: { coverage_pct: arch.coverage_pct, gaps: arch.gaps, customers: (arch.gap_customers || []).map((c) => ({ org_id: c.org_id, name: c.name, lifecycle_stage: c.lifecycle_stage, ref: opsHref("customers", c.org_id) })) },
  };
}

/** The Executive Homepage payload. */
async function homepage() {
  const t = await twin.build();
  const [escalated, openIncidents, reviewsDue, lastRuns] = await Promise.all([
    proposals.list({ status: "escalated", limit: 100 }).catch(() => []),
    incidents.list({ status: "open", limit: 100 }).catch(() => []),
    rt.engagement.dueForReview().catch(() => []),
    rt.store.find("ops_runs", {}).then((r) => r.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).slice(0, 1)).catch(() => []),
  ]);
  const last = lastRuns[0] || null;
  const executive_questions = await executiveQuestions({ t, escalated, openIncidents });

  const needs_attention = [];
  for (const p of escalated) needs_attention.push({ kind: "approval", severity: "warning",
    summary: `${p.action_id} awaiting sign-off${p.org_id ? "" : " (enterprise)"} — ${ageDays(p.created_at)}d`, ref: opsHref("approvals", p.org_id),
    why: (p.reasoning && p.reasoning.reason) || (p.decision && p.decision.reason) || null });
  for (const i of openIncidents) needs_attention.push({ kind: "incident", severity: i.severity === "critical" ? "critical" : "warning",
    summary: `${i.summary || i.kind} (open ${ageDays(i.opened_at || i.created_at)}d)`, ref: opsHref("blocked", i.org_id), why: `incident ${i.id}` });
  if (t.enterprise.security.governed_refusals_7d > 0) needs_attention.push({ kind: "security", severity: "critical",
    summary: `${t.enterprise.security.governed_refusals_7d} governed refusal(s) of security-sensitive actions this week`, ref: opsHref("blocked", null), why: "Security & Threat Agent" });
  if (t.enterprise.unverified_executions > 0) needs_attention.push({ kind: "verification", severity: "warning",
    summary: `${t.enterprise.unverified_executions} executed action(s) failed post-execution verification`, ref: opsHref("evidence", null), why: "verification spine" });

  return {
    generated_at: t.generated_at,
    kernel: "runtime_governance",
    what_is_happening: {
      customers: t.enterprise.customers, live_customers: t.enterprise.live_customers,
      departments: t.enterprise.departments, autonomy: t.enterprise.autonomy,
      proposals_in_flight: t.enterprise.proposals.in_flight,
      last_cycle: last ? { at: last.started_at, trigger: last.trigger, status: last.status, autonomy_mode: last.autonomy_mode || null, halted: !!last.halted, proposals: last.proposals || 0 } : null,
    },
    needs_attention,
    what_to_approve: escalated.map((p) => ({ id: p.id, action_id: p.action_id, org_id: p.org_id, risk: p.risk,
      reason: (p.reasoning && p.reasoning.reason) || (p.decision && p.decision.reason) || null, ref: opsHref("approvals", p.org_id) })),
    biggest_opportunity: biggestOpportunity(t.customers),
    biggest_risk: biggestRisk({ customers: t.customers, enterprise: t.enterprise, openIncidents }),
    if_we_do_nothing: consequences({ t, escalated, openIncidents, reviewsDue, nowISO: t.generated_at }),
    enterprise_health: t.enterprise.health,
    executive_questions,
    departments: t.departments,
  };
}

module.exports = { homepage, consequences, biggestOpportunity, biggestRisk };

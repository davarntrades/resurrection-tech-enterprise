/* ============================================================================
 * Operations Agent — grounded executive briefing (the "Morning." surface).
 *
 * Produces the operational briefing the Control Room renders and external
 * clients (OpenClaw, Slack, …) consume. EVERY statement is grounded: each
 * briefing item carries { sourceType, sourceIds, count, timeWindow,
 * evidenceUrl } so the operator can click through from the sentence to the
 * exact records behind it. Nothing is fabricated —
 *   · a source with no records produces an honest empty-state message;
 *   · an unconfigured source says so (available:false + reason);
 *   · counts come from lib/ops/sources.js record sets, never literals.
 *
 * Payload (superset of v1 — `lines`/`counts`/`text` remain for existing
 * clients and the OpenClaw contract):
 *   { generated_at, greeting, mode, items[], recommended_actions[],
 *     counts, systems, lines[], text }
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const sources = require("./sources");
const systemsMod = require("./systems");
const proposals = require("./proposals");
const evidence = require("./evidence");
const agent = require("./agent");
const agents = require("./agents");
const handoffsMod = require("./handoffs");
const incidentsMod = require("./incidents");
const intelligence = require("./intelligence");
const workflow = require("./workflow");

const DAY = 86400000;
const dayAgo = () => new Date(Date.now() - DAY).toISOString();
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// ── Greeting: time-of-day in the operator's timezone + configured name ──────
function greeting() {
  const tz = process.env.OPS_TIMEZONE || "Europe/London";
  let hour;
  try { hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date())); }
  catch { hour = new Date().getUTCHours(); }
  const salutation = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = process.env.RUNTIME_OPERATOR_NAME || process.env.OPS_OPERATOR_NAME || null;
  return {
    salutation, name, timezone: tz,
    text: name ? `${salutation}, ${name}.` : `${salutation}.`,
    name_source: name ? "RUNTIME_OPERATOR_NAME" : "not configured (set RUNTIME_OPERATOR_NAME)",
  };
}

// One grounded briefing item.
function item(id, { message, severity = "info", sourceType, sourceIds = [], count = null, timeWindow = null, evidenceUrl = null, available = true, reason = null, records = null }) {
  return { id, message, severity, sourceType, sourceIds, count, timeWindow, evidenceUrl, available, reason, records };
}

const plural = (n, s, p) => (n === 1 ? s : p || `${s}s`);

async function briefing() {
  const generated_at = rt.store.nowISO();
  const [src, board, propSummary, escalated, blockedRows, evSummary, lastRun] = await Promise.all([
    sources.gather(),
    systemsMod.statusBoard(),
    proposals.summary().catch(() => ({ by_status: {}, awaiting_operator: 0 })),
    proposals.list({ status: "escalated", limit: 50 }).catch(() => []),
    evidence.search({ verdict: "block", since: dayAgo(), limit: 50 }).catch(() => []),
    evidence.summary({}).catch(() => ({ by_verdict: {}, blocked_24h: 0 })),
    agent.lastRun().catch(() => null),
  ]);

  const items = [];

  // ── System health (engine + deployments) ──────────────────────────────────
  const SYS_LABEL = { runtime_governance: "Runtime Governance", railway: "Railway", vercel: "Vercel", supabase: "Supabase" };
  for (const sys of board.systems) {
    if (!SYS_LABEL[sys.component]) continue;
    if (sys.status === "not_configured") {
      items.push(item(`health.${sys.component}`, {
        message: sys.component === "supabase"
          ? "Supabase not configured — running on the non-durable file store."
          : `${SYS_LABEL[sys.component]} monitoring not configured.`,
        severity: "info", sourceType: "system_status", sourceIds: [sys.component],
        available: false, reason: sys.detail, evidenceUrl: "/admin/operations?view=systems",
      }));
    } else {
      items.push(item(`health.${sys.component}`, {
        message: `${SYS_LABEL[sys.component]} ${sys.status === "healthy" ? "healthy" : sys.status}.`,
        severity: sys.status === "healthy" ? "ok" : sys.status === "degraded" ? "warning" : "critical",
        sourceType: "system_status", sourceIds: [sys.component],
        evidenceUrl: "/admin/operations?view=systems", records: [{ component: sys.component, status: sys.status, detail: sys.detail }],
      }));
    }
  }

  // ── Customer activity ─────────────────────────────────────────────────────
  const orgs = src.new_orgs;
  items.push(item("customers.new", {
    message: orgs.count ? `${orgs.count} new ${plural(orgs.count, "customer")} this week.` : "No new customers this week.",
    severity: orgs.count ? "ok" : "info", sourceType: orgs.sourceType, sourceIds: orgs.sourceIds,
    count: orgs.count, timeWindow: orgs.timeWindow, evidenceUrl: "/admin/runtime", records: orgs.records,
  }));

  // ── Questionnaires / audits / assessments (sales schema — honest gating) ──
  const aq = src.audit_requests;
  items.push(item("audits.requests", aq.available ? {
    message: aq.count ? `${aq.count} new audit ${plural(aq.count, "request")}${aq.pending ? ` (${aq.pending} pending review)` : ""}.` : "No new customer questionnaires.",
    severity: aq.pending ? "warning" : "info", sourceType: aq.sourceType, sourceIds: aq.sourceIds,
    count: aq.count, timeWindow: aq.timeWindow, evidenceUrl: "/admin/leads", records: aq.records,
  } : {
    message: "Questionnaire data unavailable — Supabase not configured.",
    severity: "info", sourceType: aq.sourceType, available: false, reason: aq.reason,
    timeWindow: aq.timeWindow, evidenceUrl: "/admin/operations?view=systems",
  }));

  const asm = src.assessments;
  items.push(item("assessments.completed", asm.available ? {
    message: asm.count ? `${asm.count} runtime ${plural(asm.count, "assessment")} completed.` : "No runtime assessments completed this week.",
    severity: asm.count ? "ok" : "info", sourceType: asm.sourceType, sourceIds: asm.sourceIds,
    count: asm.count, timeWindow: asm.timeWindow, evidenceUrl: "/admin/leads", records: asm.records,
  } : {
    message: "Assessment data unavailable — Supabase not configured.",
    severity: "info", sourceType: asm.sourceType, available: false, reason: asm.reason,
    timeWindow: asm.timeWindow, evidenceUrl: "/admin/operations?view=systems",
  }));

  // ── Reports ───────────────────────────────────────────────────────────────
  const rep = src.recent_reports;
  items.push(item("reports.recent", {
    message: rep.count ? `${rep.count} enterprise ${plural(rep.count, "report")} generated this week.` : "No enterprise reports generated this week.",
    severity: "info", sourceType: rep.sourceType, sourceIds: rep.sourceIds,
    count: rep.count, timeWindow: rep.timeWindow, evidenceUrl: "/admin/runtime", records: rep.records,
  }));

  // ── Approvals / deployments awaiting approval ─────────────────────────────
  const deployWaiting = escalated.filter((p) => p.action_id === "deploy_runtime");
  const otherWaiting = escalated.filter((p) => p.action_id !== "deploy_runtime");
  if (deployWaiting.length) {
    items.push(item("approvals.deployments", {
      message: `${deployWaiting.length} ${plural(deployWaiting.length, "deployment")} awaiting approval.`,
      severity: "warning", sourceType: "ops_proposal", sourceIds: deployWaiting.map((p) => p.id),
      count: deployWaiting.length, evidenceUrl: "/admin/operations?view=approvals",
    }));
  }
  items.push(item("approvals.pending", {
    message: escalated.length ? `${escalated.length} ${plural(escalated.length, "action")} awaiting your approval.` : "No actions awaiting approval.",
    severity: escalated.length ? "warning" : "info", sourceType: "ops_proposal",
    sourceIds: escalated.map((p) => p.id), count: escalated.length,
    evidenceUrl: "/admin/operations?view=approvals",
    records: escalated.slice(0, 10).map((p) => ({ id: p.id, action_id: p.action_id, org_id: p.org_id, risk: p.risk })),
  }));

  // ── Blocked actions (last 24h, from write-once evidence) ──────────────────
  const blockedByAction = {};
  for (const b of blockedRows) blockedByAction[b.action_id] = (blockedByAction[b.action_id] || 0) + 1;
  items.push(item("governance.blocked", {
    message: blockedRows.length
      ? (blockedRows.length === 1
        ? `1 ${blockedRows[0].action_id.replace(/_/g, " ")} blocked by policy.`
        : `${blockedRows.length} actions blocked by Runtime Governance in the last 24h.`)
      : "No policy violations in the last 24h.",
    severity: blockedRows.length ? "critical" : "ok", sourceType: "ops_evidence",
    sourceIds: blockedRows.map((b) => b.id), count: blockedRows.length,
    timeWindow: { from: dayAgo(), to: generated_at },
    evidenceUrl: "/admin/operations?view=blocked",
    records: blockedRows.slice(0, 10).map((b) => ({ id: b.id, action_id: b.action_id, policy: b.policy, rule: b.rule, org_id: b.org_id, created_at: b.created_at })),
  }));

  // ── Prospect / follow-up activity (generic — operator CRM notes) ──────────
  const fu = src.follow_ups;
  const noteSnippets = (fu.records || []).slice(0, 2).map((n) => `${n.org_name}: “${String(n.text).slice(0, 60)}${String(n.text).length > 60 ? "…" : ""}”`);
  items.push(item("followups.notes", {
    message: fu.count
      ? `${fu.count} follow-up ${plural(fu.count, "update")} recorded${noteSnippets.length ? ` — ${noteSnippets.join("; ")}` : ""}.`
      : "No follow-up activity recorded this week.",
    severity: fu.count ? "ok" : "info", sourceType: fu.sourceType, sourceIds: fu.sourceIds,
    count: fu.count, timeWindow: fu.timeWindow, evidenceUrl: "/admin/runtime", records: fu.records,
  }));
  const em = fu.email || { available: false };
  if (em.available) {
    const awaiting = (em.awaiting_reply || []).length;
    items.push(item("email.inbound", {
      message: `${em.inbound_customer} customer email${em.inbound_customer === 1 ? "" : "s"} this week${awaiting ? ` (${awaiting} awaiting reply)` : ""}${em.inbound_prospect ? `; ${em.inbound_prospect} prospect` : ""}.`,
      severity: awaiting ? "warning" : "ok", sourceType: "email", sourceIds: em.source_ids || [],
      count: em.inbound_customer, evidenceUrl: "/admin/operations?view=systems",
      records: (em.awaiting_reply || []).slice(0, 10),
    }));
  } else {
    items.push(item("followups.email", {
      message: em.reason || "Email activity unavailable — Gmail integration not configured.",
      severity: "info", sourceType: "email", available: false, reason: em.note || null,
      evidenceUrl: "/admin/operations?view=systems",
    }));
  }

  // ── Pilot readiness + stalled journeys ────────────────────────────────────
  const pr = src.pilot_ready;
  items.push(item("pilots.ready", {
    message: pr.count ? `${pr.count} ${plural(pr.count, "organisation")} ready for pilot: ${pr.records.map((r) => r.name).join(", ")}.` : "No organisations currently meet the pilot-readiness rule.",
    severity: pr.count ? "ok" : "info", sourceType: pr.sourceType, sourceIds: pr.sourceIds,
    count: pr.count, evidenceUrl: "/admin/runtime", records: pr.records, reason: pr.rule,
  }));
  const st = src.stalled;
  if (st.count) {
    items.push(item("customers.stalled", {
      message: `${st.count} ${plural(st.count, "customer journey")} stalled (${st.rule}).`,
      severity: "warning", sourceType: st.sourceType, sourceIds: st.sourceIds,
      count: st.count, evidenceUrl: "/admin/runtime", records: st.records,
    }));
  }

  // ── Recommended actions (ordered; recommendations only — never executed) ──
  const recommended_actions = [];
  let prio = 1;
  for (const p of [...escalated].sort((a, b) => (a.risk === "critical" ? -1 : 1))) {
    recommended_actions.push({
      priority: prio++,
      title: `Approve or deny: ${p.action_id.replace(/_/g, " ")}`,
      org_id: p.org_id, org: p.org_id, severity: p.risk === "critical" ? "critical" : "warning",
      reason: p.reasoning?.reason || p.decision?.reason || "escalated by Runtime Governance for operator sign-off",
      confidence: p.reasoning?.confidence ?? null,
      proposed_action: { kind: "decide_proposal", proposal_id: p.id, action_id: p.action_id },
      governance_status: "escalated", evidence_url: `/admin/operations?view=approvals&proposal=${p.id}`,
    });
  }
  if (blockedRows.length) {
    recommended_actions.push({
      priority: prio++,
      title: `Review ${blockedRows.length} blocked ${plural(blockedRows.length, "action")}`,
      org_id: null, org: "platform", severity: "critical",
      reason: `Runtime Governance blocked: ${Object.entries(blockedByAction).map(([a, n]) => `${a} ×${n}`).join(", ")}`,
      confidence: null,
      proposed_action: { kind: "review_blocked" },
      governance_status: "blocked", evidence_url: "/admin/operations?view=blocked",
    });
  }
  for (const r of pr.records || []) {
    recommended_actions.push({
      priority: prio++,
      title: `Promote ${r.name} to pilot`,
      org_id: r.id, org: r.name, severity: "info",
      reason: `meets pilot-readiness rule (${pr.rule}); currently at stage “${r.stage_label || r.stage}”`,
      confidence: null,
      proposed_action: { kind: "propose", action_id: "promote_to_pilot", params: { org_id: r.id } },
      governance_status: "not_yet_proposed", evidence_url: "/admin/runtime",
    });
  }
  for (const n of (fu.records || []).slice(0, 3)) {
    recommended_actions.push({
      priority: prio++,
      title: `Follow up with ${n.org_name}`,
      org_id: n.org_id, org: n.org_name, severity: "info",
      reason: `recent engagement note (${n.at}): “${String(n.text).slice(0, 80)}”`,
      confidence: null,
      proposed_action: { kind: "open_customer", org_id: n.org_id },
      governance_status: "n/a", evidence_url: "/admin/runtime",
    });
  }
  for (const a of ((fu.email && fu.email.awaiting_reply) || []).slice(0, 5)) {
    recommended_actions.push({
      priority: prio++,
      title: `Reply to ${a.from_email}`,
      org_id: a.org_id, org: a.org_id, severity: "warning",
      reason: `customer email awaiting reply: “${String(a.subject || "").slice(0, 80)}” (${a.received_at})`,
      confidence: null,
      // Operator action only — open the Gmail thread. The agent never sends mail.
      proposed_action: { kind: "open_link", href: a.thread_url || "/admin/operations?view=systems" },
      governance_status: "n/a", evidence_url: "/admin/operations?view=systems",
    });
  }
  for (const d of (fu.due_reviews || []).slice(0, 3)) {
    recommended_actions.push({
      priority: prio++,
      title: `Review due for ${d.org_name}`,
      org_id: d.org_id, org: d.org_name, severity: "warning",
      reason: `next review date ${d.next_review_date} has passed (stage: ${d.stage})`,
      confidence: null,
      proposed_action: { kind: "open_customer", org_id: d.org_id },
      governance_status: "n/a", evidence_url: "/admin/runtime",
    });
  }
  for (const s of (st.records || []).slice(0, 3)) {
    recommended_actions.push({
      priority: prio++,
      title: `Re-engage ${s.name}`,
      org_id: s.id, org: s.name, severity: "warning",
      reason: `journey stalled — last runtime evaluation: ${s.last_evaluation || "never"}`,
      confidence: null,
      proposed_action: { kind: "propose", action_id: "create_recommendation", params: { org_id: s.id, title: "Customer journey stalled — re-engage", severity: "medium" } },
      governance_status: "not_yet_proposed", evidence_url: "/admin/runtime",
    });
  }
  if (aq.available && aq.pending) {
    recommended_actions.push({
      priority: prio++,
      title: `Review ${aq.pending} pending audit ${plural(aq.pending, "request")}`,
      org_id: null, org: "sales pipeline", severity: "info",
      reason: `audit requests in status new/reviewing (${aq.timeWindow.from.slice(0, 10)} →)`,
      confidence: null,
      proposed_action: { kind: "open_link", href: "/admin/leads" },
      governance_status: "n/a", evidence_url: "/admin/leads",
    });
  }

  // ── Operational counts (each drill-down-able) ─────────────────────────────
  const failedProps = propSummary.by_status?.failed ?? 0;
  const counts = {
    new_organisations: { value: orgs.count, href: "/admin/runtime", sourceType: orgs.sourceType },
    completed_questionnaires: { value: aq.available ? aq.count : null, href: "/admin/leads", sourceType: "audit_request", unavailable: !aq.available },
    pending_audits: { value: aq.available ? aq.pending : null, href: "/admin/leads", sourceType: "audit_request", unavailable: !aq.available },
    completed_assessments: { value: asm.available ? asm.count : null, href: "/admin/leads", sourceType: asm.sourceType, unavailable: !asm.available },
    pilot_ready: { value: pr.count, href: "/admin/runtime", sourceType: pr.sourceType },
    pending_approvals: { value: escalated.length, href: "/admin/operations?view=approvals", sourceType: "ops_proposal" },
    blocked_actions_24h: { value: blockedRows.length, href: "/admin/operations?view=blocked", sourceType: "ops_evidence" },
    escalated_actions: { value: propSummary.by_status?.escalated ?? 0, href: "/admin/operations?view=approvals", sourceType: "ops_proposal" },
    failed_executions: { value: failedProps, href: "/admin/operations?view=proposals&status=failed", sourceType: "ops_proposal" },
    reports_to_review_7d: { value: rep.count, href: "/admin/runtime", sourceType: rep.sourceType },
    deployments_awaiting_approval: { value: deployWaiting.length, href: "/admin/operations?view=approvals", sourceType: "ops_proposal" },
    stalled_journeys: { value: st.count, href: "/admin/runtime", sourceType: st.sourceType },
  };

  // ── Coordination Spine (Pillar 5): blocked/escalated handoffs → work items ─
  // Added before impact ranking so they are prioritised alongside everything
  // else. A handoff is a coordination record; the work item routes the operator
  // to the linked governed proposal (approve) or the timeline (unblock).
  // Open incidents (Phase 2) → operator work items, ranked with everything else.
  const openIncidents = await incidentsMod.list({ status: "open", limit: 20 }).catch(() => []);
  for (const inc of openIncidents) {
    recommended_actions.push({
      priority: recommended_actions.length + 1,
      title: `Resolve incident: ${String(inc.kind || "incident").replace(/_/g, " ")}`,
      org_id: inc.org_id, org: inc.org_id, severity: inc.severity === "critical" ? "critical" : "warning",
      reason: inc.summary || `${inc.kind} incident (opened by ${inc.opened_by})`, confidence: null,
      proposed_action: { kind: "resolve_incident", incident_id: inc.id },
      governance_status: "incident", evidence_url: "/admin/operations?view=systems",
    });
  }

  const coordination = { summary: await handoffsMod.summary().catch(() => null), blocked_work: await handoffsMod.blockedWork({ limit: 20 }).catch(() => []) };
  for (const h of coordination.blocked_work) {
    recommended_actions.push({
      priority: recommended_actions.length + 1,
      title: `${h.status === "blocked" ? "Unblock" : "Approve"} handoff: ${String(h.proposed_action?.action_id || "action").replace(/_/g, " ")} (${h.from_agent} → ${h.to_agent})`,
      org_id: h.org_id, org: h.org_id, severity: h.status === "blocked" ? "critical" : "warning",
      reason: h.reason || `${h.from_agent} handed work to ${h.to_agent}`, confidence: null,
      proposed_action: h.proposal_id ? { kind: "decide_proposal", proposal_id: h.proposal_id, action_id: h.proposed_action?.action_id } : { kind: "open_handoffs", handoff_id: h.id },
      governance_status: h.status, evidence_url: `/admin/operations?view=handoffs${h.org_id ? `&org=${h.org_id}` : ""}`,
    });
  }

  // ── Executive OS: rank recommended actions by business impact (Pillar 1) ──
  // Impact is deterministic and explainable:
  //   impact = 40·severity + 30·healthUrgency + 20·businessValue + 10·staleness
  // Org-linked actions borrow the customer's health/value from the intelligence
  // layer (Pillar 2); platform-level actions use neutral defaults.
  const profiles = await intelligence.list().catch(() => []);
  const byOrg = Object.fromEntries(profiles.map((p) => [p.org_id, p]));
  const sevW = { critical: 1, warning: 0.6, info: 0.3 };
  for (const r of recommended_actions) {
    const p = r.org_id ? byOrg[r.org_id] : null;
    const severity = sevW[r.severity] ?? 0.3;
    const healthUrgency = p ? (100 - p.scores.health.score) / 100 : 0.5;
    const value = p ? p.business_value.weight : 0.6;
    const staleness = (p && p.stalled) || r.governance_status === "blocked" || /overdue|stalled/i.test(r.reason || "") ? 1 : 0.3;
    r.impact = clamp(40 * severity + 30 * healthUrgency + 20 * value + 10 * staleness);
    r.impact_inputs = { severity: r.severity, health: p ? p.scores.health.score : null, business_value: p ? p.business_value.band : null, stale: staleness === 1 };
  }
  recommended_actions.sort((a, b) => b.impact - a.impact);
  recommended_actions.forEach((r, i) => { r.priority = i + 1; });

  // Single top priority + deterministic confidence (how clearly #1 leads #2).
  let top_priority = null;
  if (recommended_actions.length) {
    const i1 = recommended_actions[0].impact;
    const i2 = recommended_actions[1] ? recommended_actions[1].impact : 0;
    const margin = i1 > 0 ? (i1 - i2) / i1 : 0;
    const confidence = recommended_actions.length === 1
      ? 0.9
      : Math.max(0.5, Math.min(0.99, Number((0.55 + 0.45 * margin).toFixed(2))));
    const t = recommended_actions[0];
    const topOrgName = (t.org_id && byOrg[t.org_id]) ? byOrg[t.org_id].name : (t.org && !/^org_/.test(String(t.org)) ? t.org : null);
    top_priority = {
      title: t.title, org: topOrgName, org_id: t.org_id, reason: t.reason,
      impact: t.impact, confidence,
      confidence_basis: `margin over next action ${(margin * 100).toFixed(0)}% (impact ${i1} vs ${i2})`,
      governance_status: t.governance_status, evidence_url: t.evidence_url,
    };
  }

  // Lifecycle progress surfaced naturally (Pillar 3) — built from the profiles
  // already computed (each carries its derived lifecycle stage). No extra pass.
  const lifecycle_by_stage = Object.fromEntries(workflow.STAGE_KEYS.map((k) => [k, 0]));
  const lifecycle_next_actions = [];
  for (const p of profiles) {
    lifecycle_by_stage[p.lifecycle_stage] = (lifecycle_by_stage[p.lifecycle_stage] || 0) + 1;
    const na = workflow.nextAction(p.lifecycle_stage);
    if (na.action_id) lifecycle_next_actions.push({ org_id: p.org_id, name: p.name, from: na.from, to: na.to, action_id: na.action_id, requires_approval: na.requires_approval });
  }
  const lifecycle = { by_stage: lifecycle_by_stage, next_actions: lifecycle_next_actions };

  // Multi-Agent Core (Pillar 4): per-specialist workload + each agent's next
  // governed step. The council shares this briefing's governance/evidence spine.
  const multi_agent = await agents.summary().catch(() => null);

  // Compact customer intelligence for the exec view (most-at-risk first).
  const customer_intelligence = profiles.map((p) => ({
    org_id: p.org_id, name: p.name, stage: p.stage_label,
    lifecycle_stage: p.lifecycle_stage, lifecycle_label: p.lifecycle_label,
    health: p.scores.health.score, health_band: p.scores.health.band,
    pilot_readiness: p.scores.pilot_readiness.score, pilot_band: p.scores.pilot_readiness.band,
    runtime_risk: p.scores.runtime_risk.score, risk_band: p.scores.runtime_risk.band,
    engagement: p.scores.engagement.score,
    integration: p.integration_status.status, business_value: p.business_value.band,
    stalled: p.stalled, next_recommendation: p.next_recommendation.title,
  }));

  // ── Back-compat surface (v1 clients + OpenClaw text contract) ─────────────
  const lines = items.filter((i) => i.severity !== "info" || i.count).map((i) => i.message);
  if (!lines.length) lines.push("All quiet. No items need attention.");
  const g = greeting();
  const priorityLine = top_priority
    ? `Recommended priority: ${top_priority.org ? `${top_priority.org} — ` : ""}${top_priority.title} (confidence ${Math.round(top_priority.confidence * 100)}%)`
    : null;
  const text = [g.text, "", ...lines,
    "", recommended_actions.length ? "Recommended actions:" : "No immediate actions require your attention.",
    ...recommended_actions.slice(0, 6).map((r) => `${r.priority}. ${r.title}`),
    ...(priorityLine ? ["", priorityLine] : [])].join("\n").trim();

  return {
    generated_at,
    greeting: g,
    mode: board.mode,
    items,
    recommended_actions,
    top_priority,
    customer_intelligence,
    lifecycle,
    multi_agent,
    coordination,
    incidents: { open: openIncidents, summary: await incidentsMod.summary().catch(() => null) },
    counts,
    systems: board.systems,
    last_run: lastRun ? { at: lastRun.started_at, status: lastRun.status, trigger: lastRun.trigger, reasoning_source: lastRun.reasoning_source } : null,
    lines, text,
  };
}

module.exports = { briefing, greeting };

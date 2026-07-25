/* ============================================================================
 * Guardian OS — Executive Workspaces (Phase 4).
 *
 * ONE enterprise. ONE digital twin. ONE runtime governance engine. MANY
 * executive perspectives. A workspace is NOT a parallel system and NOT a copy
 * of the data — it is a role-specific LENS over the exact same governed source
 * of truth every other workspace reads.
 *
 * The whole module is a pure PROJECTION: `context(org_id)` fetches the shared
 * primitives ONCE (the same command payload, health score, evidence, drift,
 * policies, recommendations, performance and estate that the Control Room
 * already serves), and each role projector slices + frames that one context for
 * its executive. No new tables, no new state, nothing to drift out of sync.
 *
 * Extensibility is data-only: add a { id, title, purpose, project } entry to
 * ROLES and a new workspace exists — the Runtime Governance kernel is untouched.
 *
 * Honesty: a metric with no real source is surfaced as an explicit
 * `available:false` note with the reason (same discipline as briefing sources)
 * — Guardian OS never fabricates a number it cannot ground.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const provisioning = require("./provisioning");
const managed = require("./managed");
const entities = require("./entities");
const entgraph = require("./entgraph");
const govpolicy = require("./govpolicy");
const evidence = require("./evidence");
const incidents = require("./incidents");
const proposals = require("./proposals");
const performance = require("./performance");
const risk = require("./risk");

// ── Shared context — the ONE source of truth every workspace reads ───────────
async function context(org_id) {
  const [org, cmd, health, history, drift, queue, packs, evSum, blocked, recentEv, incs, props, active, twin, perf, trends, brief, recs] = await Promise.all([
    rt.store.findOne("orgs", { id: org_id }).catch(() => null),
    provisioning.command(org_id).catch(() => null),
    managed.health(org_id).catch(() => null),
    managed.healthHistory(org_id, { limit: 30 }).catch(() => []),
    managed.detectDrift(org_id).catch(() => ({ available: false, open: [] })),
    managed.queue(org_id).catch(() => ({ items: [], count: 0, by_type: {} })),
    managed.listPacks(org_id).catch(() => []),
    evidence.summary({ org_id }).catch(() => ({ total: 0, by_verdict: {}, blocked_24h: 0 })),
    evidence.search({ org_id, verdict: "block", limit: 50 }).catch(() => []),
    evidence.search({ org_id, limit: 60 }).catch(() => []),
    incidents.list({ status: "open", org_id, limit: 50 }).catch(() => []),
    proposals.list({ org_id, limit: 200 }).catch(() => []),
    govpolicy.active({}).catch(() => []),
    entgraph.build(org_id).catch(() => null),
    performance.report().catch(() => null),
    risk.trends({ windowDays: 7 }).catch(() => null),
    managed.briefingFor(org_id, { period: "weekly" }).catch(() => null),
    rt.recommendations.list({ org_id, openOnly: true }).catch(() => []),
  ]);
  const all = await entities.forOrg(org_id).catch(() => []);
  const byKind = {};
  for (const e of all) (byKind[e.kind] = byKind[e.kind] || []).push(e);
  const scopedPolicies = active.filter((p) => p.scope === org_id);
  const escalated = props.filter((p) => p.status === "escalated");
  return {
    org_id, name: org ? org.name : (cmd ? cmd.name : org_id), org,
    cmd, health, history, drift, queue, packs, evSum, blocked, recentEv,
    incidents: incs, proposals: props, escalated, scopedPolicies, entities: byKind, twin, perf, trends, brief, recs,
  };
}

// ── Section builders — the SHARED presentation vocabulary (lib/ops/sections) ─
// Industry Intelligence Packs build their dashboards with these same builders,
// so one Control Room renderer draws every Guardian OS surface.
const S = require("./sections");
const { stat, note } = S;
const scoreSec = (key, title, health, keys) => S.score(key, title, health ? { score: health.overall, band: health.band } : null, health ? keys.map((k) => ({ key: k, label: LABEL[k] || k, ...health.scores[k] })) : []);
const listSec = S.list;
const timelineSec = S.timeline;
const num = (v) => (v == null ? 0 : v);
const kc = (ctx, kind) => (ctx.entities[kind] || []).length;
const LABEL = {
  governance_maturity: "Governance maturity", policy_coverage: "Policy coverage", runtime_health: "Runtime health",
  approval_responsiveness: "Approval responsiveness", evidence_completeness: "Evidence completeness", drift_score: "Drift", overall: "Overall confidence",
};
const sev = S.severity;
const driftOpen = (ctx) => (ctx.drift && ctx.drift.open) || [];
const recTitles = (ctx, match) => ctx.recs.filter((r) => match.test(r.title)).map((r) => ({ title: r.title, meta: r.detail, severity: r.severity }));

// ── The roles. Each `project(ctx)` returns sections, all sliced from `ctx`. ──
const ROLES = [
  {
    id: "ceo", title: "CEO", label: "Chief Executive", purpose: "A strategic view of the enterprise — understood in under two minutes.",
    project(ctx) {
      const h = ctx.health; const risks = ctx.cmd ? ctx.cmd.risks : { open_incidents: 0, risk_zones: [] };
      const critical = driftOpen(ctx).filter((d) => d.severity === "critical");
      return [
        stat("state", "State of the business", [
          { label: "Governance confidence", value: h ? `${h.overall} · ${h.band}` : "—", hint: h ? `trend ${h.trend.direction}` : null },
          { label: "Enterprise health", value: ctx.cmd && ctx.cmd.health ? `${ctx.cmd.health.score} · ${ctx.cmd.health.band}` : "—" },
          { label: "AI systems live", value: ctx.cmd ? ctx.cmd.ai_systems.systems : 0 },
          { label: "Governed policies", value: ctx.scopedPolicies.length },
        ]),
        scoreSec("govscore", "Company-wide governance score", h, ["overall", "governance_maturity", "policy_coverage", "runtime_health", "drift_score"]),
        listSec("risks", "High-priority risks", [
          ...critical.map((d) => ({ title: d.subject, meta: d.detail, severity: "critical" })),
          ...(risks.incidents || []).map((i) => ({ title: i.summary, meta: "open incident", severity: sev(i.severity) })),
        ], "No high-priority risks — the enterprise is governed and quiet."),
        listSec("approvals", "Critical approvals", ctx.escalated.map((p) => ({ title: p.action_id, meta: (p.reasoning && p.reasoning.reason) || null, severity: p.risk === "critical" ? "critical" : "warning" })), "No approvals awaiting sign-off."),
        note("revenue", "Revenue at risk", "Connect a revenue/CRM source to quantify revenue at risk in currency. Exposure today is shown qualitatively via risk zones + critical incidents."),
        stat("exposure", "Exposure (qualitative)", [
          { label: "Open incidents", value: num(risks.open_incidents) },
          { label: "Critical drift", value: critical.length },
          { label: "Risk zones", value: (risks.risk_zones || []).join(", ") || "—" },
        ]),
        timelineSec("trend", "Governance trend", ctx.history.map((s) => ({ title: `${s.overall} · ${s.band}`, meta: s.captured_at })), "No trend history yet — it accrues as monitoring runs."),
        listSec("xdept", "Cross-department intelligence", (ctx.cmd ? ctx.cmd.departments : []).map((d) => ({ title: d.replace(/_/g, " "), meta: "governed department" })), "No departments deployed."),
        ...(ctx.brief ? [listSec("briefing", "Executive briefing — what changed", (ctx.brief.what_changed || []).map((c) => ({ title: c })), "Nothing changed this period.")] : []),
      ];
    },
  },
  {
    id: "cto", title: "CTO", label: "Chief Technology", purpose: "Technical governance — the runtime, the estate and its topology.",
    project(ctx) {
      const runtime = ctx.twin && ctx.twin.facets ? ctx.twin.facets.runtime : null;
      const techIncidents = ctx.incidents.filter((i) => /latency|runtime|model|deploy|system|api/i.test(`${i.kind} ${i.summary || ""}`));
      return [
        scoreSec("runtime", "Runtime health", ctx.health, ["runtime_health", "policy_coverage", "drift_score"]),
        stat("estate", "AI estate", [
          { label: "AI systems", value: kc(ctx, "ai_system") },
          { label: "Agents", value: kc(ctx, "agent") },
          { label: "Models", value: kc(ctx, "model") },
          { label: "APIs", value: kc(ctx, "api") },
          { label: "MCP servers", value: kc(ctx, "mcp_server") },
          { label: "Tools", value: kc(ctx, "tool") },
        ]),
        listSec("systems", "AI systems", (ctx.entities.ai_system || []).map((s) => ({ title: s.name, meta: `${(s.refs || []).length} mapped dependencies` })), "No AI systems."),
        stat("infra", "Infrastructure", (ctx.entities.environment || []).map((e) => ({ label: e.name, value: "environment" }))),
        listSec("alerts", "Technical alerts", techIncidents.map((i) => ({ title: i.summary || i.kind, meta: i.kind, severity: sev(i.severity) })), "No technical alerts."),
        listSec("policies", "Runtime policies", ctx.scopedPolicies.map((p) => ({ title: p.name, meta: `${p.domain} · v${p.version} · active` })), "No active runtime policies."),
        stat("topology", "System topology", [
          { label: "Runtime nodes", value: runtime ? runtime.nodes.length : 0 },
          { label: "Runtime edges", value: runtime ? runtime.edges.length : 0 },
          { label: "Dependency edges", value: ctx.twin && ctx.twin.counts ? ctx.twin.counts.dependency.edges : 0 },
        ]),
        ...(ctx.perf ? [stat("perf", "Performance metrics", [
          { label: "Council runs", value: ctx.perf.council.total_runs },
          { label: "Executed (recent)", value: ctx.perf.council.recent_outcomes ? ctx.perf.council.recent_outcomes.executed : 0 },
          { label: "Awaiting operator", value: num(ctx.perf.proposals && ctx.perf.proposals.awaiting_operator) },
        ])] : []),
      ];
    },
  },
  {
    id: "ciso", title: "CISO", label: "Chief Information Security", purpose: "Security governance — threats, escalations, blocks and evidence.",
    project(ctx) {
      const secRefusals = ctx.blocked.filter((b) => b.rule);
      const priv = driftOpen(ctx).filter((d) => d.kind === "permission_change" || d.kind === "unexpected_autonomy");
      const boundary = driftOpen(ctx).filter((d) => d.kind === "trust_boundary_violation" || d.kind === "removed_control");
      return [
        stat("threat", "Threat intelligence", [
          { label: "Blocked (24h)", value: num(ctx.evSum.blocked_24h) },
          { label: "Blocked (total)", value: num(ctx.evSum.by_verdict ? ctx.evSum.by_verdict.block : 0) },
          { label: "Escalations", value: ctx.escalated.length },
          { label: "Open incidents", value: ctx.incidents.length },
        ]),
        listSec("priv", "Privilege escalations", [
          ...priv.map((d) => ({ title: d.subject, meta: d.detail, severity: "critical" })),
          ...ctx.escalated.filter((p) => p.risk === "critical").map((p) => ({ title: p.action_id, meta: "critical action escalated", severity: "critical" })),
        ], "No privilege escalations."),
        listSec("blocked", "Blocked actions", ctx.blocked.slice(0, 12).map((b) => ({ title: b.action_id, meta: b.reason, severity: "critical" })), "Nothing blocked — deny-by-default holding clean."),
        listSec("violations", "Policy violations", secRefusals.slice(0, 12).map((b) => ({ title: b.rule, meta: `${b.action_id}: ${b.reason}`, severity: "critical" })), "No policy violations."),
        listSec("boundary", "Trust-boundary changes", boundary.map((d) => ({ title: d.subject, meta: d.detail, severity: "critical" })), "No trust-boundary changes since baseline."),
        listSec("attacks", "Runtime attacks (governed refusals)", secRefusals.slice(0, 10).map((b) => ({ title: b.rule, meta: b.reason, severity: "critical" })), "No runtime attacks refused this window."),
        timelineSec("incidents", "Incident timeline", ctx.incidents.map((i) => ({ title: i.summary || i.kind, meta: `${i.severity} · ${i.created_at}` })), "No incidents."),
        listSec("recs", "Security recommendations", recTitles(ctx, /policy|approval|isolate|privileged|monitoring|governance/i), "No open security recommendations."),
        listSec("exports", "Evidence exports", ctx.packs.map((p) => ({ title: `Evidence pack ${p.period}`, meta: `signed ${String(p.hash).slice(0, 16)}…` })), "No evidence packs generated yet."),
      ];
    },
  },
  {
    id: "risk", title: "Risk", label: "Chief Risk Officer", purpose: "Enterprise risk governance — exposure, concentration, trend and the live risk register.",
    project(ctx) {
      const zones = ctx.entities.risk_zone || [];
      const critical = ctx.entities.critical_system || [];
      const assets = ctx.entities.protected_asset || [];
      const open = driftOpen(ctx);
      const criticalDrift = open.filter((d) => d.severity === "critical");
      const privileged = (ctx.entities.tool || []).filter((t) => t.attrs && t.attrs.privileged);
      const systems = (ctx.entities.ai_system || []).length || 1;
      const worsening = ctx.trends && ctx.trends.metrics ? ctx.trends.metrics.filter((m) => m.worsening && m.delta !== 0) : [];
      return [
        scoreSec("posture", "Risk posture", ctx.health, ["overall", "drift_score", "runtime_health", "policy_coverage"]),
        stat("exposure", "Enterprise exposure", [
          { label: "Risk zones", value: zones.length },
          { label: "Critical systems", value: critical.length },
          { label: "Protected assets", value: assets.length },
          { label: "Privileged capabilities", value: privileged.length },
          { label: "Concentration", value: `${Math.round((privileged.length / systems) * 10) / 10}/system`, hint: "privileged capability per AI system" },
        ]),
        listSec("register", "Risk register — open governance drift", open.map((d) => ({ title: d.subject, meta: d.detail, severity: sev(d.severity) })), "No open drift — the enterprise matches its governed baseline."),
        listSec("top", "Top risks requiring a decision", [
          ...criticalDrift.map((d) => ({ title: d.subject, meta: d.detail, severity: "critical" })),
          ...ctx.incidents.filter((i) => i.severity === "critical").map((i) => ({ title: i.summary || i.kind, meta: "critical incident", severity: "critical" })),
          ...ctx.escalated.filter((p) => p.risk === "critical").map((p) => ({ title: p.action_id, meta: "critical action awaiting approval", severity: "critical" })),
        ], "No critical risks outstanding."),
        listSec("zones", "Risk zones", zones.map((z) => ({ title: z.name, meta: "declared risk zone" })), "No risk zones declared."),
        listSec("trend", "Risk trend — what worsened this period", worsening.map((m) => ({ title: m.name.replace(/_/g, " "), meta: `${m.direction} ${m.delta > 0 ? "+" : ""}${m.delta} vs prior period`, severity: "warning" })), "Nothing worsened this period."),
        timelineSec("history", "Governance confidence over time", ctx.history.map((s) => ({ title: `${s.overall} · ${s.band}`, meta: s.captured_at })), "No history yet — it accrues as monitoring runs."),
        listSec("mitigations", "Recommended mitigations", recTitles(ctx, /policy|approval|isolate|privileged|monitoring|archive|governance/i), "No open mitigations."),
      ];
    },
  },
  {
    id: "compliance", title: "Compliance", label: "Chief Compliance", purpose: "Regulatory governance — posture, evidence and audit readiness.",
    project(ctx) {
      const reqs = ctx.entities.compliance_requirement || [];
      const auditReady = ctx.packs.length > 0 && ctx.health && ctx.health.scores.evidence_completeness.score >= 60;
      return [
        scoreSec("posture", "Compliance posture", ctx.health, ["governance_maturity", "policy_coverage", "evidence_completeness", "overall"]),
        stat("readiness", "Audit readiness", [
          { label: "Status", value: auditReady ? "ready" : "building evidence" },
          { label: "Evidence records", value: num(ctx.evSum.total) },
          { label: "Evidence packs", value: ctx.packs.length },
          { label: "Active policies", value: ctx.scopedPolicies.length },
        ]),
        listSec("regmap", "Regulatory mappings", reqs.map((r) => ({ title: r.name, meta: `${ctx.scopedPolicies.length} active policies enforcing controls` })), "No compliance requirements declared."),
        stat("maturity", "Governance maturity", ctx.health ? [
          { label: "Maturity", value: ctx.health.scores.governance_maturity.score },
          { label: "Policy coverage", value: ctx.health.scores.policy_coverage.score },
          { label: "Evidence completeness", value: ctx.health.scores.evidence_completeness.score },
        ] : []),
        listSec("packs", "Evidence packs", ctx.packs.map((p) => ({ title: `${p.period} — signed ${String(p.hash).slice(0, 16)}…`, meta: p.created_at })), "No evidence packs generated yet."),
        ...(ctx.brief ? [listSec("report", "Monthly compliance report — what changed", (ctx.brief.what_changed || []).map((c) => ({ title: c })), "Nothing changed this period.")] : []),
      ];
    },
  },
  {
    id: "coo", title: "Operations", label: "Chief Operating", purpose: "Operational governance — departments, approvals and automation.",
    project(ctx) {
      const opsDrift = driftOpen(ctx).filter((d) => d.kind === "removed_control" || d.kind === "disabled_policy");
      const agents = ctx.perf ? ctx.perf.agents : [];
      const aging = ctx.escalated.filter((p) => !(p.operator && p.operator.at));
      return [
        listSec("depts", "Department health", (ctx.cmd ? ctx.cmd.departments : []).map((d) => {
          const a = agents.find((x) => x.id === d || x.id === d.replace(/_/g, ""));
          return { title: d.replace(/_/g, " "), meta: a ? `${a.executed} executed · ${a.escalated} escalated` : "governed" };
        }), "No departments deployed."),
        stat("automation", "Automation effectiveness", ctx.perf ? [
          { label: "Autonomy mode", value: ctx.perf.autonomy.label },
          { label: "Council runs", value: ctx.perf.council.total_runs },
          { label: "Executed (recent)", value: ctx.perf.council.recent_outcomes ? ctx.perf.council.recent_outcomes.executed : 0 },
          { label: "Handoffs", value: num(ctx.perf.handoffs && ctx.perf.handoffs.total) },
        ] : []),
        listSec("bottlenecks", "Workflow bottlenecks", aging.map((p) => ({ title: p.action_id, meta: "awaiting operator decision", severity: "warning" })), "No bottlenecks — approvals are flowing."),
        listSec("approvals", "Pending approvals", ctx.escalated.map((p) => ({ title: p.action_id, meta: (p.reasoning && p.reasoning.reason) || null, severity: p.risk === "critical" ? "critical" : "warning" })), "No pending approvals."),
        listSec("opsdrift", "Operational drift", opsDrift.map((d) => ({ title: d.subject, meta: d.detail, severity: sev(d.severity) })), "No operational drift since baseline."),
        stat("efficiency", "Process efficiency", ctx.perf ? [
          { label: "Awaiting operator", value: num(ctx.perf.proposals && ctx.perf.proposals.awaiting_operator) },
          { label: "Total proposals", value: num(ctx.perf.proposals && ctx.perf.proposals.total) },
        ] : []),
        listSec("recs", "Department recommendations", recTitles(ctx, /workflow|approval|monitoring|archive|department|isolate/i), "No open operational recommendations."),
      ];
    },
  },
  {
    id: "cfo", title: "Finance", label: "Chief Financial", purpose: "Financial governance — footprint, governed value and optimisation.",
    project(ctx) {
      const vendors = [...(ctx.entities.integration || []), ...(ctx.entities.mcp_server || []), ...(ctx.entities.api || [])];
      const prevented = num(ctx.evSum.by_verdict ? ctx.evSum.by_verdict.block : 0);
      const optimisation = recTitles(ctx, /archive unused|unused tool|coverage/i);
      return [
        note("spend", "AI spend & budget forecasts", "Connect a billing/usage source (model-provider billing, cloud cost export) to populate AI spend, cost exposure in currency, and budget forecasts. The estate footprint below is what Guardian OS can ground today."),
        stat("footprint", "AI estate footprint", [
          { label: "AI systems", value: kc(ctx, "ai_system") },
          { label: "Agents", value: kc(ctx, "agent") },
          { label: "Models", value: kc(ctx, "model") },
          { label: "Vendors / integrations", value: vendors.length },
        ]),
        stat("vendors", "Vendor utilisation", vendors.length ? vendors.map((v) => ({ label: v.name, value: v.kind.replace(/_/g, " ") })) : [{ label: "No external vendors mapped", value: "—" }]),
        stat("roi", "Governance ROI (derived)", [
          { label: "Governed blocks — incidents prevented", value: prevented, hint: "derived from evidence: privileged/unsafe actions the kernel blocked" },
          { label: "Active policies protecting assets", value: ctx.scopedPolicies.length },
          { label: "Open exposure (incidents)", value: ctx.incidents.length },
        ]),
        listSec("optimisation", "Cost optimisation opportunities", optimisation.length ? optimisation : [{ title: "No optimisation opportunities detected", meta: "unused tools and coverage gaps surface here" }], "No optimisation opportunities."),
      ];
    },
  },
  {
    id: "legal", title: "Legal", label: "Legal & Governance", purpose: "Legal evidence — decisions, versions, chains and attestations.",
    project(ctx) {
      const decided = ctx.proposals.filter((p) => p.operator && p.operator.at);
      const policyVersions = ctx.scopedPolicies.map((p) => ({ title: `${p.name} v${p.version}`, meta: `${p.status} · activated ${p.activated_at || "—"}` }));
      return [
        timelineSec("decisions", "Decision history", ctx.recentEv.slice(0, 20).map((e) => ({ title: `${e.action_id} — ${e.verdict}`, meta: `${e.reason || ""} · ${e.created_at}` })), "No decisions recorded yet."),
        listSec("versions", "Policy versions", policyVersions, "No policies."),
        listSec("chain", "Approval chain", decided.map((p) => ({ title: p.action_id, meta: `${p.status} by ${(p.operator && p.operator.by) || "operator"} · ${(p.operator && p.operator.at) || ""}` })), "No operator-decided approvals yet."),
        timelineSec("evidence", "Evidence timeline", ctx.recentEv.slice(0, 20).map((e) => ({ title: e.action_id, meta: `${e.verdict} · ${e.created_at}` })), "No evidence yet."),
        listSec("signed", "Signed reports", ctx.packs.map((p) => ({ title: `Evidence pack ${p.period}`, meta: `signed ${String(p.hash).slice(0, 24)}…` })), "No signed reports yet."),
        listSec("attestations", "Governance attestations", ctx.packs.map((p) => ({ title: `Attestation ${p.period}`, meta: `content hash ${String(p.hash).slice(0, 24)}… · litigation-ready export` })), "No attestations yet."),
      ];
    },
  },
];
const ROLE_MAP = Object.fromEntries(ROLES.map((r) => [r.id, r]));

/** The list of executive perspectives (metadata only) — for the navigation. */
function roles() { return ROLES.map((r) => ({ id: r.id, title: r.title, label: r.label, purpose: r.purpose })); }

/**
 * Perspectives available to ONE enterprise: the seven executive roles plus a
 * lens for every installed Industry Intelligence Pack (Phase 5). A pack lens is
 * still the same twin — it just frames it with domain intelligence.
 */
async function rolesFor(org_id) {
  const base = roles();
  if (!org_id) return base;
  try {
    const packs = await require("./industry").installed(org_id);
    const reg = require("./packs");
    for (const row of packs) {
      const p = reg.get(row.pack_id);
      if (p) base.push({ id: `industry:${p.id}`, title: p.industry, label: p.title, purpose: p.purpose, industry_pack: p.id, version: p.version });
    }
  } catch { /* packs are optional — the executive lenses never depend on them */ }
  return base;
}

/** Build ONE executive workspace: the same context, framed for one role. */
async function workspace(role, org_id) {
  // Industry Pack lens — the SAME shared context, projected by the pack.
  if (String(role || "").startsWith("industry:")) {
    const pack_id = String(role).slice("industry:".length);
    const reg = require("./packs");
    const p = reg.get(pack_id);
    if (!p) return null;
    if (!org_id) return { role, title: p.industry, purpose: p.purpose, org_id: null, sections: [], error: "no enterprise" };
    const ictx = await context(org_id);
    const view = await require("./industry").dashboard(org_id, pack_id, { ctx: ictx });
    return {
      role, title: p.industry, label: p.title, purpose: p.purpose, industry_pack: p.id, version: p.version,
      org_id, name: ictx.name, generated_at: rt.store.nowISO(),
      header: {
        governance: ictx.health ? { score: ictx.health.overall, band: ictx.health.band, trend: ictx.health.trend.direction } : null,
        queue: ictx.queue.count, drift_open: driftOpen(ictx).length,
      },
      metrics: view ? view.metrics : [],
      sections: view ? view.sections : [],
    };
  }
  const r = ROLE_MAP[role];
  if (!r) return null;
  if (!org_id) return { role: r.id, title: r.title, purpose: r.purpose, org_id: null, sections: [], error: "no enterprise" };
  const ctx = await context(org_id);
  return {
    role: r.id, title: r.title, label: r.label, purpose: r.purpose,
    org_id, name: ctx.name, generated_at: rt.store.nowISO(),
    header: {
      governance: ctx.health ? { score: ctx.health.overall, band: ctx.health.band, trend: ctx.health.trend.direction } : null,
      queue: ctx.queue.count, drift_open: driftOpen(ctx).length,
    },
    sections: r.project(ctx),
  };
}

module.exports = { ROLES, roles, rolesFor, context, workspace };

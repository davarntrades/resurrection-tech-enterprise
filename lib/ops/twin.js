/* ============================================================================
 * Guardian OS — Digital Enterprise Twin (v0).
 *
 * A DERIVED, READ-ONLY projection of the organisation — the live enterprise
 * model that Guardian OS coordinates over. It is assembled on demand from the
 * SAME authoritative records the rest of the platform already owns:
 *
 *   orgs · engagements/lifecycle · customer intelligence · proposals · evidence
 *   · incidents · handoffs (chain of responsibility) · agents (departments) ·
 *   autonomy · reviews-due · council runs.
 *
 * It is NEVER a second source of truth. It only reads + composes; it holds no
 * mutable state of its own, so there is nothing to drift and nothing to tamper
 * with (the same discipline as the Evidence Graph). Per-customer PROVENANCE and
 * decision lineage live in the Evidence Graph — the Twin links INTO it via
 * entity()/replay(), never duplicating it:
 *
 *   Twin  = breadth (every entity + relationship across the org, live)
 *   Graph = depth  (one customer's provenance + replayable decision timeline)
 *
 * Departments are the existing governed specialists (lib/ops/agents) — no new
 * trust, no new authority: a department is a charter + lifecycle ownership, and
 * every action it takes still flows proposal → Ω governor → approval →
 * execution → evidence.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const agents = require("./agents");
const intelligence = require("./intelligence");
const proposals = require("./proposals");
const incidents = require("./incidents");
const handoffs = require("./handoffs");
const evidence = require("./evidence");
const autonomy = require("./autonomy");
const workflow = require("./workflow");
const graph = require("./graph");

const DAY = 86400000;
const ageDays = (iso) => (iso ? (Date.now() - Date.parse(iso)) / DAY : Infinity);
const band = (score) => (score >= 75 ? "ok" : score >= 50 ? "watch" : "at_risk");

// Security-relevant governed refusals — the same rule set the Security & Threat
// Agent watches (blocked evidence-destruction / credential / self-escalation /
// internal-reach attempts). Read from evidence; never recomputed authority.
const SECURITY_REFUSAL_RULES = new Set([
  "ops_evidence_destruction", "ops_credential_sharing",
  "ops_unauthorized_autonomy_change", "ops_internal_action_external_reach",
]);

const LIVE_STAGES = new Set(["pilot", "deployment", "runtime_monitoring", "renewal"]);

/** The enterprise health rollup across governed dimensions — every band is
 *  deterministic from real counts, so nothing is asserted "as fact" without a
 *  record behind it. */
function healthDimensions({ customers, openIncidents, unverified, refusals7d, propSummary }) {
  const live = customers.filter((c) => LIVE_STAGES.has(c.lifecycle_stage));
  const stalledLive = live.filter((c) => c.stalled).length;
  const atRiskCustomers = customers.filter((c) => c.health_band === "at_risk").length;
  const avgHealth = customers.length ? Math.round(customers.reduce((s, c) => s + c.health, 0) / customers.length) : 100;

  const by = propSummary.by_status || {};
  const govDenom = (by.executed || 0) + (by.blocked || 0) + (by.escalated || 0) + (by.denied || 0);
  const govScore = govDenom ? Math.round((100 * (by.executed || 0)) / govDenom) : 100;

  const commercialScore = live.length ? Math.round(100 * (1 - stalledLive / live.length)) : 100;
  const securityScore = refusals7d === 0 ? 100 : refusals7d <= 2 ? 60 : 30;
  const operationalScore = openIncidents === 0 && unverified === 0 ? 100 : openIncidents + unverified <= 2 ? 65 : 35;

  const dim = (dimension, score, detail) => ({ dimension, band: band(score), score, detail });
  return [
    dim("customer", avgHealth, `${atRiskCustomers} of ${customers.length} customers at risk`),
    dim("commercial", commercialScore, `${stalledLive} of ${live.length} live customers stalled`),
    dim("security", securityScore, `${refusals7d} governed refusal(s) of security-sensitive actions (7d)`),
    dim("operational", operationalScore, `${openIncidents} open incident(s), ${unverified} unverified execution(s)`),
    dim("governance", govScore, `${by.escalated || 0} awaiting approval, ${by.blocked || 0} blocked`),
  ];
}

/** Build the full enterprise twin (derived, read-only). */
async function build() {
  const generated_at = store.nowISO();
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();

  const [profiles, roster, perf, incidentSummary, openIncidents, handoffSummary, propSummary, autonomySt, blockedEvidence] = await Promise.all([
    intelligence.list().catch(() => []),
    agents.roster().catch(() => ({ agents: [], stage_owner: {} })),
    require("./performance").perAgent().catch(() => []),
    incidents.summary().catch(() => ({ total: 0, open: 0 })),
    incidents.list({ status: "open", limit: 200 }).catch(() => []),
    handoffs.summary().catch(() => ({ total: 0, by_status: {} })),
    proposals.summary().catch(() => ({ by_status: {} })),
    autonomy.current().catch(() => null),
    evidence.search({ verdict: "block", since: weekAgo, limit: 300 }).catch(() => []),
  ]);

  // ── Customer entities (projected from intelligence — no recomputation) ────
  const customers = profiles.map((p) => ({
    org_id: p.org_id, name: p.name,
    stage: p.stage, lifecycle_stage: p.lifecycle_stage, lifecycle_label: p.lifecycle_label,
    health: p.scores.health.score, health_band: p.scores.health.band,
    runtime_risk: p.scores.runtime_risk.score, risk_band: p.scores.runtime_risk.band,
    pilot_readiness: p.scores.pilot_readiness.score,
    business_value: p.business_value.band, integration: p.integration_status.status,
    stalled: p.stalled, next_review_date: p.next_review_date,
    next_recommendation: p.next_recommendation ? p.next_recommendation.title : null,
    live: LIVE_STAGES.has(p.lifecycle_stage),
  }));
  const byId = Object.fromEntries(customers.map((c) => [c.org_id, c]));

  // ── Department entities (the existing governed specialists) ───────────────
  const perfById = Object.fromEntries((perf || []).map((m) => [m.id, m]));
  const departments = roster.agents.map((a) => {
    const m = perfById[a.id] || {};
    const paused = autonomySt && autonomySt.paused_agents ? autonomySt.paused_agents.includes(a.id) : false;
    // A department's live load = customers whose current lifecycle stage it owns.
    const owned = customers.filter((c) => a.charter.stages.includes(c.lifecycle_stage));
    return {
      id: a.id, title: a.title, mandate: a.mandate,
      owns_stages: a.charter.stages, cross_cutting: a.charter.stages.length === 0,
      customers_owned: owned.length,
      proposals: m.proposals || 0, executed: m.executed || 0, escalated: m.escalated || 0,
      awaiting_approval: m.escalated || 0, paused,
      health: band(m.proposals ? Math.round((100 * (m.executed || 0)) / m.proposals) : 100),
    };
  });

  // ── Relationships (chain of responsibility — visible, never mutated) ──────
  const relationships = [];
  for (const [stage, dept] of Object.entries(roster.stage_owner || {})) {
    relationships.push({ from: dept, to: `stage:${stage}`, kind: "owns_stage" });
  }
  for (const c of customers) {
    const owner = (roster.stage_owner || {})[c.lifecycle_stage] || null;
    if (owner) relationships.push({ from: owner, to: c.org_id, kind: "responsible_for" });
    // Every customer depends on the governance kernel — the one universal edge.
    relationships.push({ from: c.org_id, to: "runtime_governance", kind: "governed_by" });
  }

  // ── Enterprise rollup ─────────────────────────────────────────────────────
  const refusals7d = (blockedEvidence || []).filter((e) => e.rule && SECURITY_REFUSAL_RULES.has(e.rule)).length;
  const unverified = (await proposals.list({ limit: 300 }).catch(() => []))
    .filter((p) => p.execution && p.execution.verified === false).length;
  const by = propSummary.by_status || {};

  const enterprise = {
    customers: customers.length,
    live_customers: customers.filter((c) => c.live).length,
    departments: departments.length,
    open_incidents: openIncidents.length,
    proposals: { in_flight: (by.escalated || 0) + (by.proposed || 0) + (by.allowed || 0), awaiting_approval: by.escalated || 0, executed: by.executed || 0, blocked: by.blocked || 0 },
    handoffs: handoffSummary.by_status || {},
    autonomy: autonomySt ? { mode: autonomySt.mode, label: autonomySt.label, halted: !!autonomySt.policy.halted, paused_agents: autonomySt.paused_agents } : null,
    security: { governed_refusals_7d: refusals7d },
    unverified_executions: unverified,
    health: healthDimensions({ customers, openIncidents: openIncidents.length, unverified, refusals7d, propSummary }),
  };

  return { generated_at, enterprise, departments, customers, relationships, kernel: "runtime_governance" };
}

/** One customer's twin slice, linked INTO the Evidence Graph for provenance +
 *  replay (the Twin never re-derives lineage — it points at the graph). */
async function entity(org_id) {
  if (!org_id) return null;
  const t = await build();
  const c = t.customers.find((x) => x.org_id === org_id) || null;
  if (!c) return null;
  const [g, chain] = await Promise.all([
    graph.build(org_id).catch(() => null),
    handoffs.timeline({ org_id, limit: 20 }).catch(() => []),
  ]);
  const responsibilities = t.relationships.filter((r) => r.to === org_id || r.from === org_id);
  return {
    customer: c, responsibilities,
    provenance: g ? { nodes: g.nodes.length, contradictions: g.contradictions.length, provenance: g.provenance } : null,
    responsibility_chain: chain,
    graph_ref: `/api/ops/graph?org_id=${encodeURIComponent(org_id)}`,
  };
}

/** Replay a customer through time — delegated to the Evidence Graph (the single
 *  replay authority; the Twin does not keep its own history). */
const replay = (org_id) => graph.replay(org_id);

module.exports = { build, entity, replay, healthDimensions, LIVE_STAGES };

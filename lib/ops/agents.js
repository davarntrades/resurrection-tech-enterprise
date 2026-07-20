/* ============================================================================
 * Operations Agent — Multi-Agent Core (Pillar 4).
 *
 * Splits the single Operations Agent into a COUNCIL of five specialists —
 * Sales, Deployment, Customer Success, Compliance, Finance — that share ONE
 * governance + evidence + proposal + state-machine spine. The specialists add
 * division of labour and attribution; they add NO new trust. Concretely:
 *
 *   1. AGENTS DON'T OWN WORKFLOWS. Each agent takes responsibility for a slice
 *      of the governed lifecycle (Pillar 3): a set of stages whose next
 *      governed transition it may advance, plus a charter of catalog actions it
 *      may propose. An agent never invents a transition — it advances the
 *      SAME state machine every other agent shares. workflow.nextAction(stage)
 *      is the single source of truth for "what comes next"; an agent acts only
 *      when that next step is inside its charter.
 *
 *   2. CHARTER = A SECOND DENY-BY-DEFAULT LAYER, BEFORE THE ENGINE. An agent
 *      can only PROPOSE actions in its charter (agentPropose refuses anything
 *      else at the agent boundary). Every surviving proposal STILL passes
 *      Runtime Governance via the shared governor — so a mis-scoped or hostile
 *      recommendation is contained twice (agent charter, then Ω engine). No
 *      agent gets elevated trust: a high-risk action a specialist is chartered
 *      for still escalates for human approval, exactly as before.
 *
 *   3. ONE SPINE. Every specialist proposal flows through proposals.propose →
 *      governor.evaluate → evidence.record, tagged with agent_id, so evidence
 *      and audit show WHICH agent proposed WHAT and how the engine ruled.
 *
 * council() is a read-only assessment (what each specialist would do now).
 * dispatch() runs the governed multi-agent cycle. Both are DETERMINISTIC — the
 * specialists reason from records and the lifecycle, not from an LLM.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const actions = require("./actions");
const proposals = require("./proposals");
const workflow = require("./workflow");
const observers = require("./observers");
const events = require("./events");

const DAY = 86400000;
const ageDays = (iso) => (iso ? (Date.now() - Date.parse(iso)) / DAY : Infinity);
const MIN_CONFIDENCE = () => {
  const n = Number(process.env.OPS_MIN_CONFIDENCE);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.6;
};

// Pre-pilot vs live lifecycle stages (used to route re-engagement duties to the
// right specialist — Sales before pilot, Customer Success after).
const PRE_PILOT = new Set(["lead", "questionnaire", "assessment", "executive_report"]);
const LIVE = new Set(["pilot", "deployment", "runtime_monitoring", "renewal"]);

/* Each agent:
 *   id / title / mandate  — identity + human-readable charter
 *   stages   — lifecycle stages whose next governed transition this agent owns
 *   actions  — catalog action ids this agent is chartered to propose
 *   observation_kinds — observation prefixes this agent reacts to
 *   duties(ctx, self) — deterministic, observation-driven recommendations
 *                       (beyond the lifecycle transitions handled generically)
 */
const AGENTS = [
  {
    id: "sales",
    title: "Sales Agent",
    mandate: "Convert and qualify. Advance leads through questionnaire, assessment and executive report to a proposed pilot, and re-engage stalled early-stage accounts.",
    stages: ["lead", "questionnaire", "assessment", "executive_report"],
    actions: ["record_questionnaire", "complete_assessment", "generate_report", "promote_to_pilot", "create_recommendation"],
    observation_kinds: ["customers.new", "customers.stalled"],
    duties(ctx, self) {
      const recs = [];
      for (const o of ctx.orgStates) {
        if (!PRE_PILOT.has(o.stage)) continue;
        if (o.stalled) recs.push(rec(self, "create_recommendation", o.org_id, 0.8,
          `${o.name}: early-stage journey stalled (${o.last_evaluation ? `last activity ${Math.round(ageDays(o.last_evaluation))}d ago` : "no runtime activity"}) — re-engage`,
          { org_id: o.org_id, title: "Lead stalled — re-engage", severity: "medium" }, "observation:customers.stalled"));
      }
      return recs;
    },
  },
  {
    id: "deployment",
    title: "Deployment Agent",
    mandate: "Stand up pilots and production. Advance pilots to deployment and activate runtime monitoring, and guard engine/integration availability. Rollout is proposed, never auto-run.",
    stages: ["pilot", "deployment"],
    actions: ["deploy_runtime", "activate_monitoring", "raise_alert"],
    observation_kinds: ["runtime.engine_unavailable", "integration"],
    duties(ctx, self) {
      const recs = [];
      for (const ob of ctx.snapshot.observations) {
        if (ob.kind === "runtime.engine_unavailable" || (ob.kind.startsWith("integration.") && ob.severity === "critical")) {
          recs.push(rec(self, "raise_alert", ob.org_id || null, 0.95,
            `Availability signal: ${ob.summary}`,
            { org_id: ob.org_id || null, kind: ob.kind.replace(/\./g, "_"), severity: "critical", message: ob.summary }, `observation:${ob.kind}`));
        }
      }
      return recs;
    },
  },
  {
    id: "customer_success",
    title: "Customer Success Agent",
    mandate: "Keep live customers healthy and expanding. Propose renewals/expansions for monitored customers, re-engage stalled live accounts, and flag elevated block volume.",
    stages: ["runtime_monitoring", "renewal"],
    actions: ["initiate_renewal", "create_recommendation", "notify_operator"],
    observation_kinds: ["customers.stalled", "runtime.blocked"],
    duties(ctx, self) {
      const recs = [];
      for (const o of ctx.orgStates) {
        if (!LIVE.has(o.stage)) continue;
        if (o.stalled) recs.push(rec(self, "create_recommendation", o.org_id, 0.8,
          `${o.name}: live customer went quiet — re-engage before renewal risk`,
          { org_id: o.org_id, title: "Live customer stalled — re-engage", severity: "medium" }, "observation:customers.stalled"));
      }
      for (const ob of ctx.snapshot.observations) {
        if (ob.kind === "runtime.blocked" && ob.data && ob.data.counts && (ob.data.counts.BLOCK || 0) >= 5) {
          recs.push(rec(self, "notify_operator", ob.org_id || null, 0.85,
            `Elevated BLOCK volume: ${ob.summary} — operator should review the customer's decision log`,
            { org_id: ob.org_id || null, message: ob.summary }, "observation:runtime.blocked"));
        }
      }
      return recs;
    },
  },
  {
    id: "compliance",
    title: "Compliance Agent",
    mandate: "Guard evidence integrity and governance posture across every customer. Raise alerts on durability and verdict anomalies and escalate confidential report delivery. Never mutates customer state.",
    stages: [], // cross-cutting — owns no lifecycle transition
    actions: ["raise_alert", "notify_operator", "send_confidential_report"],
    observation_kinds: ["store.non_durable", "alerts.critical"],
    duties(ctx, self) {
      const recs = [];
      for (const ob of ctx.snapshot.observations) {
        if (ob.kind === "store.non_durable") {
          recs.push(rec(self, "raise_alert", null, 0.9,
            "Evidence durability risk: platform is on the non-durable file store",
            { org_id: null, kind: "evidence_durability_risk", severity: "warning", message: ob.summary }, "observation:store.non_durable"));
        } else if (ob.kind === "alerts.critical") {
          recs.push(rec(self, "raise_alert", null, 0.9,
            `Critical alert activity: ${ob.summary}`,
            { org_id: null, kind: "compliance_review", severity: "critical", message: ob.summary }, "observation:alerts.critical"));
        }
      }
      return recs;
    },
  },
  {
    id: "finance",
    title: "Finance Agent",
    mandate: "Own reporting cadence and commercial value. Keep governance evidence reports current for live customers so renewal and expansion rest on fresh, governed evidence.",
    stages: [], // cross-cutting — owns no lifecycle transition
    actions: ["generate_report", "notify_operator"],
    observation_kinds: ["reports.completed"],
    duties(ctx, self) {
      const recs = [];
      for (const o of ctx.orgStates) {
        // Live customers (billable) with no recent governed evidence report.
        if (!LIVE.has(o.stage)) continue;
        if (!o.has_recent_report) recs.push(rec(self, "generate_report", o.org_id, 0.75,
          `${o.name}: no governance evidence report in the last 7 days — refresh for renewal readiness`,
          { org_id: o.org_id, period: "weekly" }, "cadence:reporting"));
      }
      return recs;
    },
  },
];

const BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
const ORDER = AGENTS.map((a) => a.id);
// Which agent owns advancing OUT of each lifecycle stage (for attribution).
const STAGE_OWNER = {};
for (const a of AGENTS) for (const s of a.stages) STAGE_OWNER[s] = a.id;

const get = (id) => BY_ID[id] || null;
const authorized = (agent_id, action_id) => { const a = get(agent_id); return !!a && a.actions.includes(action_id); };
// Deterministic attribution for a generalist recommendation: the first agent in
// council order chartered for the action owns it. Null → no specialist owns it.
const ownerOfAction = (action_id) => { const a = AGENTS.find((x) => x.actions.includes(action_id)); return a ? a.id : null; };

// A uniform recommendation object (deterministic; carries its provenance).
function rec(self, decision, org_id, confidence, reason, params, basis) {
  return { agent_id: self.id, agent_title: self.title, decision, org_id: org_id || null, confidence, reason, params: params || {}, basis, lifecycle: false };
}

// ── Shared context: orgs + their derived lifecycle state + observations ──────
async function context() {
  const [orgs, snapshot] = await Promise.all([
    store.find("orgs", {}).catch(() => []),
    observers.observe().catch(() => ({ observations: [] })),
  ]);
  const orgStates = [];
  for (const o of orgs) {
    const st = await workflow.state(o.id).catch(() => null);
    if (!st) continue;
    const decisions = await store.queryDecisions({ org_id: o.id, limit: 1 }).catch(() => []);
    const lastEval = decisions[0] ? (decisions[0].created_at || decisions[0].ts) : null;
    const reports = await store.find("reports", { org_id: o.id }).catch(() => []);
    orgStates.push({
      org_id: o.id, name: o.name || o.id, stage: st.current_stage, next_action: st.next_action,
      last_evaluation: lastEval,
      stalled: lastEval ? ageDays(lastEval) > (Number(process.env.OPS_STALL_DAYS) > 0 ? Number(process.env.OPS_STALL_DAYS) : 7) : ageDays(o.created_at) > 7,
      has_recent_report: (reports || []).some((r) => ageDays(r.created_at) <= 7),
    });
  }
  return { orgs, orgStates, snapshot };
}

/**
 * Everything one agent would propose right now:
 *   • lifecycle transitions for orgs sitting in the stages it owns, but ONLY
 *     when the machine's next governed action is inside the agent's charter
 *     (the agent advances the shared state machine — it never invents one);
 *   • its observation-driven domain duties.
 * Charter is then re-enforced (defence in depth) — anything outside the
 * charter is dropped, not proposed.
 */
function assessAgent(agent, ctx) {
  const recs = [];
  for (const o of ctx.orgStates) {
    if (!agent.stages.includes(o.stage)) continue;
    const na = o.next_action;
    if (na && na.action_id && agent.actions.includes(na.action_id)) {
      recs.push({
        agent_id: agent.id, agent_title: agent.title, decision: na.action_id, org_id: o.org_id,
        confidence: na.requires_approval ? 0.75 : 0.9,
        reason: `${o.name}: advance governed lifecycle ${na.from} → ${na.to}${na.requires_approval ? " (requires operator approval)" : " (auto after engine PERMIT)"}`,
        params: { org_id: o.org_id }, basis: "lifecycle_transition", lifecycle: true,
        requires_approval: na.requires_approval, from: na.from, to: na.to,
      });
    }
  }
  for (const d of agent.duties(ctx, agent)) recs.push(d);
  // Charter enforcement: an agent may only ever act within its mandate.
  return recs.filter((r) => agent.actions.includes(r.decision));
}

/** Read-only: what every specialist would propose now (no side effects). */
async function council(ctx) {
  ctx = ctx || (await context());
  const by_agent = {};
  const recommendations = [];
  for (const agent of AGENTS) {
    const recs = assessAgent(agent, ctx);
    by_agent[agent.id] = recs;
    for (const r of recs) recommendations.push(r);
  }
  return { assessed_at: store.nowISO(), recommendations, by_agent };
}

/** Propose one action AS an agent. Charter is enforced BEFORE the engine — an
 *  action outside the agent's mandate is refused at the agent boundary and
 *  never reaches governance. Chartered actions go through the shared spine. */
async function agentPropose(agent_id, { action_id, params = {}, org_id = null, source = null, reasoning = null }) {
  const agent = get(agent_id);
  if (!agent) return { ok: false, error: `unknown agent ${JSON.stringify(agent_id)}` };
  if (!agent.actions.includes(action_id)) {
    await events.emit("agent.charter_blocked", { agent_id, action_id }, { org_id });
    return { ok: false, charter_blocked: true, agent_id, action_id,
      reason: `${agent.title} is not chartered to propose ${action_id} — refused at the agent boundary (deny-by-default)` };
  }
  const p = await proposals.propose({
    action_id, params, org_id, agent_id,
    source: source || `agent:${agent_id}`,
    reasoning: reasoning || { decision: action_id, confidence: 1, reason: `${agent.title} proposal`, source: `agent:${agent_id}` },
  });
  return { ok: true, proposal: p };
}

const tally = (o, status) => { o[status] = (o[status] || 0) + 1; };

/**
 * Run the governed multi-agent cycle. Each specialist assesses its slice and
 * proposes through the SHARED spine (lifecycle transitions via workflow.advance,
 * domain duties via agentPropose), every proposal tagged with its agent_id.
 * Records an ops_runs row (mode: council) with per-agent outcomes. Never throws.
 */
async function dispatch({ trigger = "manual" } = {}) {
  const run = await store.insert("ops_runs", {
    trigger, mode: "council", status: "running", started_at: store.nowISO(),
    observations: 0, recommendations: 0, proposals: 0,
    outcomes: { executed: 0, blocked: 0, escalated: 0, failed: 0, skipped: 0 },
    reasoning_source: "multi_agent_council", per_agent: null, finished_at: null, error: null,
  });
  await events.emit("council.started", { run_id: run.id, trigger });
  try {
    const ctx = await context();
    const per_agent = {};
    const produced = [];
    let recCount = 0;
    const outcomes = { executed: 0, blocked: 0, escalated: 0, failed: 0, skipped: 0 };

    for (const agent of AGENTS) {
      const recs = assessAgent(agent, ctx);
      recCount += recs.length;
      const a = { proposed: 0, executed: 0, escalated: 0, blocked: 0, failed: 0, skipped: 0 };
      for (const r of recs) {
        if (r.confidence < MIN_CONFIDENCE()) { a.skipped += 1; outcomes.skipped += 1; continue; }
        let p = null, status = null;
        if (r.lifecycle) {
          // Advance the shared state machine (idempotent; logs the transition).
          const adv = await workflow.advance(r.org_id, { actor: agent.id, source: "council", agent_id: agent.id });
          if (adv.status === "in_progress" || adv.advanced === false && !adv.proposal) { a.skipped += 1; outcomes.skipped += 1; continue; }
          p = adv.proposal; status = adv.status;
        } else {
          if (await proposals.similarOpen(r.decision, r.org_id).catch(() => false)) { a.skipped += 1; outcomes.skipped += 1; continue; }
          const res = await agentPropose(agent.id, { action_id: r.decision, params: r.params, org_id: r.org_id,
            source: `council:${trigger}`, reasoning: { decision: r.decision, confidence: r.confidence, reason: r.reason, source: `agent:${agent.id}` } });
          if (!res.ok) { a.skipped += 1; outcomes.skipped += 1; continue; }
          p = res.proposal; status = p.status;
        }
        if (p) {
          a.proposed += 1;
          tally(a, status); tally(outcomes, status);
          produced.push({ id: p.id, agent_id: agent.id, action_id: p.action_id, status, basis: r.basis, org_id: r.org_id });
        }
      }
      per_agent[agent.id] = a;
    }

    await store.update("ops_runs", run.id, {
      status: "completed", finished_at: store.nowISO(),
      observations: ctx.snapshot.observations.length, recommendations: recCount,
      proposals: produced.length, outcomes, per_agent,
    });
    await events.emit("council.completed", { run_id: run.id, per_agent, proposals: produced });
    rt.log.info("ops_council", { run_id: run.id, trigger, proposals: produced.length, ...outcomes });
    return { run_id: run.id, mode: "council", trigger, observations: ctx.snapshot.observations.length, recommendations: recCount, per_agent, outcomes, proposals: produced };
  } catch (e) {
    await store.update("ops_runs", run.id, { status: "failed", finished_at: store.nowISO(), error: e.message || String(e) });
    await events.emit("council.failed", { run_id: run.id, error: e.message });
    rt.log.error("ops_council_failed", { run_id: run.id, error: e.message });
    return { run_id: run.id, mode: "council", trigger, error: e.message };
  }
}

// ── Live per-agent workload (proposals by status) + recent attributed work ───
async function workload() {
  const props = await proposals.list({ limit: 500 }).catch(() => []);
  const per = {};
  for (const id of ORDER) per[id] = { total: 0, proposed: 0, escalated: 0, executed: 0, blocked: 0, denied: 0, failed: 0, allowed: 0, approved: 0 };
  for (const p of props) {
    if (p.agent_id && per[p.agent_id]) { per[p.agent_id].total += 1; if (per[p.agent_id][p.status] !== undefined) per[p.agent_id][p.status] += 1; }
  }
  return per;
}

async function recentFor(agent_id, limit = 10) {
  const props = await proposals.list({ limit: 500 }).catch(() => []);
  return props.filter((p) => p.agent_id === agent_id).slice(0, limit).map((p) => ({
    id: p.id, action_id: p.action_id, org_id: p.org_id, status: p.status, risk: p.risk,
    created_at: p.created_at, verdict: p.decision ? p.decision.verdict : null,
    reason: (p.reasoning && p.reasoning.reason) || (p.decision && p.decision.reason) || null,
  }));
}

/** Full roster for the API/UI: charter + live workload + recent attributed work. */
async function roster() {
  const [wl] = await Promise.all([workload()]);
  const agents = [];
  for (const a of AGENTS) {
    agents.push({
      id: a.id, title: a.title, mandate: a.mandate,
      charter: {
        stages: a.stages,
        actions: a.actions.map((id) => { const c = actions.get(id); return { id, title: c ? c.title : id, risk: c ? c.risk : null, auto: c ? actions.autoExecutable(c) : false, refuse: c ? !!c.refuse : false }; }),
        observation_kinds: a.observation_kinds,
      },
      workload: wl[a.id],
      recent: await recentFor(a.id, 8),
    });
  }
  return { agents, stage_owner: STAGE_OWNER, generated_at: store.nowISO() };
}

/** Compact summary for the briefing (per-agent pending work + next actions). */
async function summary() {
  const [wl, c] = await Promise.all([workload(), council()]);
  const agents = AGENTS.map((a) => ({
    id: a.id, title: a.title,
    pending: wl[a.id].escalated, executed: wl[a.id].executed, total: wl[a.id].total,
    proposed_now: (c.by_agent[a.id] || []).length,
    next: (c.by_agent[a.id] || []).slice(0, 1).map((r) => ({ action_id: r.decision, org_id: r.org_id, requires_approval: !!r.requires_approval, reason: r.reason }))[0] || null,
  }));
  return { total_agents: AGENTS.length, agents, generated_at: store.nowISO() };
}

module.exports = {
  AGENTS, ORDER, STAGE_OWNER,
  get, authorized, ownerOfAction, council, dispatch, agentPropose, assessAgent, context,
  workload, recentFor, roster, summary,
};

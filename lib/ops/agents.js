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
const handoffs = require("./handoffs");
const opsEvidence = require("./evidence");
const autonomy = require("./autonomy");

// Pillar 5: the coordination INGEST phase (agents draining inbound handoffs
// through the shared governor) is gated so 4.0 direct execution is preserved
// byte-for-byte until coordination is proven. Handoff RECORDS are always
// emitted (pure coordination facts) regardless of this flag.
const COORDINATION = () => /^(1|true|on|yes)$/i.test(String(process.env.OPS_COORDINATION || ""));

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
    mandate: "Keep live customers healthy and expanding. Propose renewals/expansions for monitored customers, re-engage stalled live accounts, flag elevated block volume, and surface customer emails awaiting a reply.",
    stages: ["runtime_monitoring", "renewal"],
    actions: ["initiate_renewal", "create_recommendation", "notify_operator", "refresh_customer_intelligence", "schedule_internal_review"],
    observation_kinds: ["customers.stalled", "runtime.blocked", "customers.email_awaiting_reply"],
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
        } else if (ob.kind === "customers.email_awaiting_reply") {
          // Read-only email → an operator work item ONLY (never an auto-reply).
          recs.push(rec(self, "notify_operator", ob.org_id || null, 0.75,
            `Customer email awaiting reply: ${ob.summary}`,
            { org_id: ob.org_id || null, message: ob.summary }, "observation:customers.email_awaiting_reply"));
        }
      }
      return recs;
    },
  },
  {
    id: "compliance",
    title: "Compliance Agent",
    mandate: "Guard evidence integrity and governance posture across every customer. Raise alerts on durability and verdict anomalies, open incidents, and escalate confidential report delivery. Never mutates customer state.",
    stages: [], // cross-cutting — owns no lifecycle transition
    actions: ["raise_alert", "notify_operator", "send_confidential_report", "open_incident"],
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
  {
    // ── Expanded Agent Council (5.0 Phase 5) — Security & Threat ──────────────
    id: "security",
    title: "Security & Threat Agent",
    mandate: "Guard the platform's security posture across every customer. Turn governed refusals — blocked evidence-destruction, credential-exposure, self-escalation and internal-reach attempts — plus abnormal block volume into alerts and incidents. Escalates and records; never mutates customer state and never executes a privileged action. The council's own watchdog.",
    stages: [], // cross-cutting — owns no lifecycle transition
    actions: ["raise_alert", "open_incident", "notify_operator"],
    observation_kinds: ["security.governed_refusal", "security.governed_refusals", "runtime.blocked"],
    duties(ctx, self) {
      const recs = [];
      for (const ob of ctx.snapshot.observations) {
        if (ob.kind === "security.governed_refusal") {
          // A specific blocked attempt → an incident (per-attempt, org-scoped).
          recs.push(rec(self, "open_incident", ob.org_id || null, 0.92,
            `Security: ${ob.summary}`,
            { severity: "critical", kind: "security_governed_refusal", summary: ob.summary, org_id: ob.org_id || null, source_ref: (ob.data && ob.data.evidence_id) || null }, "observation:security.governed_refusal"));
        } else if (ob.kind === "security.governed_refusals") {
          // The rollup → a posture alert carrying the count + rule mix.
          recs.push(rec(self, "raise_alert", null, 0.95,
            `Security posture: ${ob.summary}`,
            { org_id: null, kind: "security_governed_refusals", severity: "critical", message: ob.summary, meta: ob.data || {} }, "observation:security.governed_refusals"));
        } else if (ob.kind === "runtime.blocked" && ob.data && ob.data.counts && (ob.data.counts.BLOCK || 0) >= 10) {
          // Elevated BLOCK volume is a probing/abuse signal (higher bar than the
          // Customer Success health threshold; a distinct, security-framed alert).
          recs.push(rec(self, "raise_alert", ob.org_id || null, 0.85,
            `Security: elevated BLOCK volume (possible probing) — ${ob.summary}`,
            { org_id: ob.org_id || null, kind: "security_block_spike", severity: "critical", message: ob.summary }, "observation:runtime.blocked"));
        }
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
// Who owned the org one lifecycle stage earlier (who handed this org over). Used
// to attribute the FROM side of a transition handoff. 'lifecycle' at the origin.
function predecessorOwner(stage) {
  const keys = workflow.STAGE_KEYS;
  const i = keys.indexOf(stage);
  if (i <= 0) return "lifecycle";
  return STAGE_OWNER[keys[i - 1]] || "lifecycle";
}

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
async function agentPropose(agent_id, { action_id, params = {}, org_id = null, source = null, reasoning = null, hold = false }) {
  const agent = get(agent_id);
  if (!agent) return { ok: false, error: `unknown agent ${JSON.stringify(agent_id)}` };
  if (!agent.actions.includes(action_id)) {
    await events.emit("agent.charter_blocked", { agent_id, action_id }, { org_id });
    return { ok: false, charter_blocked: true, agent_id, action_id,
      reason: `${agent.title} is not chartered to propose ${action_id} — refused at the agent boundary (deny-by-default)` };
  }
  const p = await proposals.propose({
    action_id, params, org_id, agent_id, hold,
    source: source || `agent:${agent_id}`,
    reasoning: reasoning || { decision: action_id, confidence: 1, reason: `${agent.title} proposal`, source: `agent:${agent_id}` },
  });
  return { ok: true, proposal: p };
}

const tally = (o, status) => { o[status] = (o[status] || 0) + 1; };
const orgStateOf = (ctx, org_id) => ctx.orgStates.find((o) => o.org_id === org_id) || null;

// Lifecycle-advance actions must ONLY ever run through workflow.advance (which
// guarantees stage order) — never the duty path, so a handoff can't jump the
// state machine. These map an action back to the stage it advances OUT of.
const LIFECYCLE_ACTIONS = new Set(workflow.STAGES.map((s) => s.advance).filter(Boolean));
const stageForAction = (a) => (workflow.STAGES.find((s) => s.advance === a) || {}).key || null;
const stageOrder = (k) => Math.max(0, workflow.STAGE_KEYS.indexOf(k));

// Map a governed proposal outcome onto the handoff status machine. A fail-closed
// engine BLOCK does NOT terminate the handoff — it stays open and is retried
// (bounded), so no coordination work is lost while governance is unreachable.
async function applyProposalToHandoff(h, p, transition_id) {
  if (!p) return h;
  const patch = { proposal_id: p.id };
  if (transition_id) patch.transition_id = transition_id;
  if (p.status === "executed") return handoffs.setStatus(h.id, { ...patch, status: "resolved", resolved_at: store.nowISO() });
  if (p.status === "escalated") return handoffs.setStatus(h.id, { ...patch, status: "escalated" });
  if (p.status === "blocked" && p.decision && p.decision.policy === "fail_closed_engine_unavailable") {
    await handoffs.setStatus(h.id, patch); return handoffs.bumpAttempt(h.id); // keep open, bounded retry
  }
  return handoffs.setStatus(h.id, { ...patch, status: "blocked" }); // BLOCK / failed → work item
}

// Build the supporting-evidence refs for a handoff (recent governance evidence
// for the org — the linked proposal adds its own evidence once proposed).
async function evidenceRefsFor(org_id) {
  if (!org_id) return [];
  const rows = await opsEvidence.search({ org_id, limit: 2 }).catch(() => []);
  return rows.map((e) => ({ type: "evidence", ref: e.id, detail: `${e.action_id} → ${e.verdict}` }));
}

/** ROUTE: turn each agent's assessment into typed handoff records (idempotent).
 *  A lifecycle step's FROM side is the agent that owned the previous stage (the
 *  baton pass); a duty is a self-task. Pure records — no proposing here. */
async function routeHandoffs(agent, recs, ctx, trigger) {
  const created = [];
  for (const r of recs) {
    if (r.confidence < MIN_CONFIDENCE()) continue;
    const from_agent = r.lifecycle ? predecessorOwner(r.from) : agent.id;
    const res = await handoffs.create({
      org_id: r.org_id, from_agent, to_agent: agent.id,
      kind: r.lifecycle ? "transition" : "task", reason: r.reason,
      evidence_refs: await evidenceRefsFor(r.org_id),
      proposed_action: { action_id: r.decision, params: r.params || {} },
      created_by: `council:${trigger}`,
    });
    if (res.created) created.push(res.handoff);
  }
  return created;
}

/** INGEST one inbound handoff through the SHARED governor. Charter is enforced
 *  at the agent boundary first; lifecycle actions advance the state machine
 *  (which stays authoritative — it can't be forced out of order); duty actions
 *  go through agentPropose. Never invents authority. */
async function ingestOne(agent, h, ctx) {
  if (h.proposal_id) return handoffs.get(h.id); // already proposed — reconcile handles status
  const action_id = h.proposed_action && h.proposed_action.action_id;
  if (!action_id) return handoffs.setStatus(h.id, { status: "resolved", resolved_at: store.nowISO() });
  if (!agent.actions.includes(action_id)) {
    await events.emit("handoff.charter_blocked", { handoff_id: h.id, to_agent: agent.id, action_id }, { org_id: h.org_id });
    return handoffs.setStatus(h.id, { status: "blocked" }); // misrouted → visible work item
  }
  const os = orgStateOf(ctx, h.org_id);
  if (LIFECYCLE_ACTIONS.has(action_id)) {
    // A lifecycle transition — only ever via workflow.advance (order-guaranteed).
    if (os && os.next_action && os.next_action.action_id === action_id) {
      const adv = await workflow.advance(h.org_id, { actor: agent.id, source: "handoff", agent_id: agent.id });
      if (!adv.proposal) {
        if (adv.status === "in_progress") return handoffs.setStatus(h.id, { status: "accepted", accepted_at: store.nowISO() });
        return handoffs.setStatus(h.id, { status: "resolved", resolved_at: store.nowISO() });
      }
      return applyProposalToHandoff(h, adv.proposal, adv.transition_id);
    }
    // Not the org's current governed step. Behind → already done (resolved);
    // ahead → refused as out-of-order (the state machine stays authoritative;
    // a handoff can never make the lifecycle skip a stage).
    const behind = os ? stageOrder(stageForAction(action_id)) < stageOrder(os.stage) : false;
    if (behind) return handoffs.setStatus(h.id, { status: "resolved", resolved_at: store.nowISO() });
    await events.emit("handoff.out_of_order", { handoff_id: h.id, action_id, at_stage: os && os.stage }, { org_id: h.org_id });
    return handoffs.setStatus(h.id, { status: "blocked" });
  }
  // Non-lifecycle duty action → governed via agentPropose (shared spine).
  if (await proposals.similarOpen(action_id, h.org_id).catch(() => false)) return handoffs.setStatus(h.id, { status: "accepted", accepted_at: store.nowISO() });
  const res = await agentPropose(agent.id, { action_id, params: h.proposed_action.params || {}, org_id: h.org_id,
    source: `handoff:${h.id}`, reasoning: { decision: action_id, confidence: 1, reason: h.reason, source: `agent:${agent.id}` } });
  if (!res.ok) return handoffs.setStatus(h.id, { status: "blocked" });
  return applyProposalToHandoff(h, res.proposal, null);
}

/** RECONCILE open handoffs at cycle start: sync each already-proposed handoff's
 *  status from its linked proposal — an operator approval or denial between
 *  cycles is reflected here (escalated → resolved / blocked). Handoffs without a
 *  proposal yet are left for INGEST to charter-check, propose, or block; they
 *  are never swept away here (that would hide misrouted or pending work). */
async function reconcile(ctx) {
  const rows = await handoffs.list({ limit: 500 }).catch(() => []);
  for (const h of rows) {
    if (!handoffs.OPEN_STATUSES.includes(h.status) || !h.proposal_id) continue;
    const p = await proposals.get(h.proposal_id).catch(() => null);
    if (p) await applyProposalToHandoff(h, p, h.transition_id);
  }
}

/**
 * Run the governed multi-agent cycle (Pillar 4) with the coordination spine
 * (Pillar 5). Phases: OBSERVE → RECONCILE → ROUTE (emit typed handoffs) →
 * PROPOSE (INGEST inbound handoffs through the shared governor when
 * OPS_COORDINATION is on; otherwise the 4.0 direct path) → RECORD (durable
 * ops_runs row with per-agent + handoff counters). Never throws.
 */
async function dispatch({ trigger = "manual" } = {}) {
  // Executive Command (Phase 4): the autonomy MODE gates the autonomous council
  // path (operator-initiated actions are unaffected — they never run here).
  //   emergency_pause → the council halts; nothing proposed or executed
  //   observe         → assess + route handoffs, but propose nothing
  //   recommend       → propose, but HOLD every proposal for operator sign-off
  //   execute_low_risk→ today's behaviour (default) — direct governed execution
  //   governed_autonomy→ execute + coordination ingest (drain handoffs)
  // Per-agent pauses skip an individual specialist while the rest run.
  const auto = await autonomy.current().catch(() => ({ mode: autonomy.DEFAULT_MODE, paused_agents: [], policy: autonomy.policy(autonomy.DEFAULT_MODE) }));
  const pol = auto.policy;

  const run = await store.insert("ops_runs", {
    trigger, mode: "council", status: "running", started_at: store.nowISO(),
    observations: 0, recommendations: 0, proposals: 0,
    outcomes: { executed: 0, blocked: 0, escalated: 0, failed: 0, skipped: 0 },
    reasoning_source: "multi_agent_council", per_agent: null,
    handoffs: { created: 0, resolved: 0, escalated: 0, blocked: 0 },
    coordination: COORDINATION(), autonomy_mode: auto.mode, paused_agents: auto.paused_agents,
    finished_at: null, error: null,
  });
  await events.emit("council.started", { run_id: run.id, trigger, autonomy_mode: auto.mode });

  // EMERGENCY PAUSE: halt immediately — no observation, no proposal, no execution.
  if (pol.halted) {
    await store.update("ops_runs", run.id, {
      status: "completed", finished_at: store.nowISO(), halted: true,
      observations: 0, recommendations: 0, proposals: 0,
      outcomes: { executed: 0, blocked: 0, escalated: 0, failed: 0, skipped: 0 },
      per_agent: {}, handoffs: { created: 0, resolved: 0, escalated: 0, blocked: 0 },
    });
    await events.emit("council.halted", { run_id: run.id, autonomy_mode: auto.mode });
    rt.log.warn("ops_council_halted", { run_id: run.id, trigger, autonomy_mode: auto.mode });
    return { run_id: run.id, mode: "council", trigger, halted: true, autonomy_mode: auto.mode,
      observations: 0, recommendations: 0, per_agent: {}, outcomes: { executed: 0, blocked: 0, escalated: 0, failed: 0, skipped: 0 },
      handoffs: { created: 0, resolved: 0, escalated: 0, blocked: 0 }, proposals: [] };
  }
  try {
    const ctx = await context();
    const per_agent = {};
    const produced = [];
    let recCount = 0, handoffsCreated = 0;
    const outcomes = { executed: 0, blocked: 0, escalated: 0, failed: 0, skipped: 0 };
    // Coordination ingest runs when the mode permits it AND it is not a hold
    // mode. In the default execute_low_risk mode this is exactly COORDINATION()
    // (today's behaviour); governed_autonomy additionally enables it.
    const coordinating = pol.proposes && !pol.holds && (COORDINATION() || pol.coordinates);

    // RECONCILE: sync existing handoffs with reality (approvals, org movement).
    await reconcile(ctx).catch((e) => rt.log.warn("ops_reconcile_failed", { error: e.message }));

    for (const agent of AGENTS) {
      const paused = auto.paused_agents.includes(agent.id);
      const recs = assessAgent(agent, ctx);
      recCount += recs.length;
      // ROUTE: emit typed handoff records for this agent's work (always — records
      // are pure coordination facts, emitted even when the agent may not act).
      const created = await routeHandoffs(agent, recs, ctx, trigger);
      handoffsCreated += created.length;
      const a = { proposed: 0, executed: 0, escalated: 0, blocked: 0, failed: 0, skipped: 0, paused };

      // A paused agent, or observe/emergency modes: plan + record, take no action.
      if (paused || !pol.proposes) {
        a.skipped += recs.length; outcomes.skipped += recs.length;
        per_agent[agent.id] = a;
        continue;
      }

      if (coordinating) {
        // INGEST: drain this agent's inbound queue through the shared governor.
        const inbox = await handoffs.inbox(agent.id);
        for (const raw of inbox) {
          const h = await handoffs.shape(raw);
          const updated = await ingestOne(agent, h, ctx);
          if (updated && updated.proposal_id && updated.status !== "accepted") {
            a.proposed += 1;
            const st = updated.status === "resolved" ? "executed" : updated.status === "escalated" ? "escalated" : "blocked";
            tally(a, st); tally(outcomes, st);
            produced.push({ id: updated.proposal_id, agent_id: agent.id, action_id: h.proposed_action && h.proposed_action.action_id, status: st, handoff_id: h.id, org_id: h.org_id });
          } else { a.skipped += 1; outcomes.skipped += 1; }
        }
      } else {
        // 4.0 direct path (unchanged execution semantics in execute_low_risk;
        // in recommend mode every proposal is HELD for operator sign-off).
        for (const r of recs) {
          if (r.confidence < MIN_CONFIDENCE()) { a.skipped += 1; outcomes.skipped += 1; continue; }
          let p = null, status = null;
          if (r.lifecycle) {
            const adv = await workflow.advance(r.org_id, { actor: agent.id, source: "council", agent_id: agent.id, hold: pol.holds });
            if (adv.status === "in_progress" || (adv.advanced === false && !adv.proposal)) { a.skipped += 1; outcomes.skipped += 1; continue; }
            p = adv.proposal; status = adv.status;
          } else {
            if (await proposals.similarOpen(r.decision, r.org_id).catch(() => false)) { a.skipped += 1; outcomes.skipped += 1; continue; }
            const res = await agentPropose(agent.id, { action_id: r.decision, params: r.params, org_id: r.org_id, hold: pol.holds,
              source: `council:${trigger}`, reasoning: { decision: r.decision, confidence: r.confidence, reason: r.reason, source: `agent:${agent.id}` } });
            if (!res.ok) { a.skipped += 1; outcomes.skipped += 1; continue; }
            p = res.proposal; status = p.status;
          }
          if (p) { a.proposed += 1; tally(a, status); tally(outcomes, status);
            produced.push({ id: p.id, agent_id: agent.id, action_id: p.action_id, status, basis: r.basis, org_id: r.org_id }); }
        }
      }
      per_agent[agent.id] = a;
    }

    const hoSummary = await handoffs.summary().catch(() => ({ by_status: {} }));
    const handoffCounts = { created: handoffsCreated, resolved: hoSummary.by_status.resolved || 0, escalated: hoSummary.by_status.escalated || 0, blocked: hoSummary.by_status.blocked || 0 };
    await store.update("ops_runs", run.id, {
      status: "completed", finished_at: store.nowISO(),
      observations: ctx.snapshot.observations.length, recommendations: recCount,
      proposals: produced.length, outcomes, per_agent, handoffs: handoffCounts,
    });
    await events.emit("council.completed", { run_id: run.id, per_agent, proposals: produced, handoffs: handoffCounts });
    rt.log.info("ops_council", { run_id: run.id, trigger, coordinating, autonomy_mode: auto.mode, proposals: produced.length, handoffs_created: handoffsCreated, ...outcomes });
    return { run_id: run.id, mode: "council", trigger, coordinating, autonomy_mode: auto.mode, observations: ctx.snapshot.observations.length, recommendations: recCount, per_agent, outcomes, handoffs: handoffCounts, proposals: produced };
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

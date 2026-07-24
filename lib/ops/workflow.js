/* ============================================================================
 * Operations Agent — Governed Lifecycle State Machine (Pillar 3).
 *
 * The platform backbone: every organisation moves through one canonical,
 * governed lifecycle. Agents (Pillar 4) never invent or own workflows — they
 * operate WITHIN this machine, taking responsibility for individual
 * transitions. The machine itself owns two things:
 *
 *   1. WHERE an org is — derived DETERMINISTICALLY from real records (never
 *      asserted). stageOf() reads engagement stage + reports + environments +
 *      runtime decisions and returns the current stage with the exact signal
 *      that placed it there. Same records → same stage, always (replayable).
 *
 *   2. HOW it advances — every forward transition is a GOVERNED PROPOSAL. The
 *      machine maps the next stage to a catalog action and routes it through
 *      the existing governor → proposals → evidence spine. Privileged
 *      transitions (pilot, deployment, renewal) escalate for human approval;
 *      non-privileged ones auto-execute only after an engine PERMIT. Nothing
 *      privileged is ever executed autonomously; the engine stays the
 *      authority. Each transition appends an immutable ops_transitions row
 *      linked to its proposal, so transition + approval history is fully
 *      auditable and replayable.
 *
 * Canonical lifecycle:
 *   lead → questionnaire → assessment → executive_report → pilot →
 *   deployment → runtime_monitoring → renewal
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const actions = require("./actions");
const proposals = require("./proposals");
const evidence = require("./evidence");

const DAY = 86400000;
const ageDays = (iso) => (iso ? (Date.now() - Date.parse(iso)) / DAY : Infinity);

// Canonical stages, ordered. `advance` names the catalog action that moves an
// org OUT of this stage toward the next; null = terminal / customer-driven.
const STAGES = [
  { key: "lead", label: "Lead", advance: "record_questionnaire" },
  { key: "questionnaire", label: "Questionnaire", advance: "complete_assessment" },
  { key: "assessment", label: "Assessment", advance: "generate_report" },
  { key: "executive_report", label: "Executive Report", advance: "promote_to_pilot" },
  { key: "pilot", label: "Pilot", advance: "deploy_runtime" },
  { key: "deployment", label: "Deployment", advance: "activate_monitoring" },
  { key: "runtime_monitoring", label: "Runtime Monitoring", advance: "initiate_renewal" },
  { key: "renewal", label: "Renewal / Expansion", advance: null },
];
const STAGE_KEYS = STAGES.map((s) => s.key);
const stageMeta = (key) => STAGES.find((s) => s.key === key) || STAGES[0];
const stageOrder = (key) => Math.max(0, STAGE_KEYS.indexOf(key));

// Engagement ladder (operator CRM) → the backbone signal for derivation.
const ENG_LADDER = ["prospect", "audit", "enterprise_assessment", "limited_pilot", "enterprise_integration", "managed_service"];
const engIdx = (s) => Math.max(0, ENG_LADDER.indexOf(String(s)));

// ── Gather the deterministic signals for one org (never throws) ─────────────
async function signals(org_id) {
  const [eng, envs, decisions, reports] = await Promise.all([
    rt.engagement.get(org_id).catch(() => ({ stage: "prospect" })),
    rt.admin.listEnvironments(org_id).catch(() => []),
    rt.store.queryDecisions({ org_id, limit: 50 }).catch(() => []),
    rt.store.find("reports", { org_id }).catch(() => []),
  ]);
  const idx = engIdx(eng.stage);
  const hasDecisions90 = (decisions || []).some((d) => ageDays(d.created_at || d.ts) <= 90);
  const enforceEnv = (envs || []).some((e) => e.mode === "enforce" && (e.status || "active") === "active");
  return { eng, idx, hasReport: (reports || []).length > 0, hasDecisions90, enforceEnv, reports, envs };
}

/** Current stage, derived deterministically. Returns { stage, reason }. The
 *  reason names the exact signal(s) — nothing is asserted. */
function derive(sig) {
  if (sig.idx >= 5) return { stage: "renewal", reason: "engagement stage = managed_service" };
  if (sig.idx >= 4 && sig.hasDecisions90) return { stage: "runtime_monitoring", reason: "enterprise_integration + governed runtime evaluations in last 90d" };
  if (sig.idx >= 4) return { stage: "deployment", reason: "engagement stage = enterprise_integration" };
  if (sig.idx >= 3) return { stage: "pilot", reason: "engagement stage = limited_pilot" };
  if (sig.idx >= 2 && sig.hasReport) return { stage: "executive_report", reason: "enterprise_assessment + a generated report exists" };
  if (sig.idx >= 2) return { stage: "assessment", reason: "engagement stage = enterprise_assessment" };
  if (sig.idx >= 1) return { stage: "questionnaire", reason: "engagement stage = 48-hour audit" };
  return { stage: "lead", reason: "no qualifying signal yet (default)" };
}

/** Derive the lifecycle stage from ALREADY-GATHERED records (no queries) — lets
 *  intelligence.js surface the stage without re-fetching. Accepts the shape
 *  intelligence.gather() produces: { eng, envs, decisions, reports }. */
function deriveFrom({ eng = { stage: "prospect" }, envs = [], decisions = [], reports = [] } = {}) {
  const sig = {
    eng, idx: engIdx(eng.stage),
    hasReport: (reports || []).length > 0,
    hasDecisions90: (decisions || []).some((d) => ageDays(d.created_at || d.ts) <= 90),
    enforceEnv: (envs || []).some((e) => e.mode === "enforce" && (e.status || "active") === "active"),
  };
  const d = derive(sig);
  return { stage: d.stage, label: stageMeta(d.stage).label, reason: d.reason, order: stageOrder(d.stage) };
}

/** Whether advancing OUT of `stage` needs operator approval. Derived from the
 *  catalog risk (high/critical escalate even on PERMIT) — mirrors the governor. */
function transitionNeedsApproval(stage) {
  const meta = stageMeta(stage);
  if (!meta.advance) return false;
  const action = actions.get(meta.advance);
  return !!action && !actions.autoExecutable(action);
}

/** The next governed action to move an org forward. Read-only descriptor. */
function nextAction(stage) {
  const meta = stageMeta(stage);
  if (!meta.advance) {
    return { kind: "terminal", from: stage, to: null, action_id: null, requires_approval: false, title: "Renewal / expansion — continue managing" };
  }
  const action = actions.get(meta.advance);
  const to = STAGE_KEYS[stageOrder(stage) + 1];
  const requires_approval = transitionNeedsApproval(stage);
  const kind = stage === "lead" ? "awaiting_or_record" : "governed_transition";
  return {
    kind, from: stage, to, action_id: meta.advance, risk: action ? action.risk : null,
    requires_approval,
    title: action ? action.title : meta.advance,
    governance: requires_approval ? "requires operator approval before execution" : "auto-executes only after a Runtime Governance PERMIT",
  };
}

// ── Transition log (append-only; live status resolved from the proposal) ────
async function recordTransition({ org_id, from, to, action_id, proposal_id, initiated_by }) {
  return rt.store.insert("ops_transitions", { org_id, from_stage: from, to_stage: to, action_id, proposal_id: proposal_id || null, initiated_by: initiated_by || "operations_agent" });
}

/**
 * Advance an org one governed step. Proposes the stage's action through the
 * governor (which enforces the engine verdict + approval policy), appends an
 * immutable transition row linked to the proposal, and returns the outcome.
 * NEVER executes a privileged action autonomously — the proposal path decides.
 */
async function advance(org_id, { actor = "operations_agent", source = "lifecycle", agent_id = null, hold = false } = {}) {
  const org = await rt.store.findOne("orgs", { id: org_id }).catch(() => null);
  if (!org) throw new Error("organisation not found");
  const sig = await signals(org_id);
  const current = derive(sig).stage;
  const na = nextAction(current);
  if (!na.action_id) return { advanced: false, reason: "already at the terminal stage", from: current, to: null };

  // Idempotency: don't re-propose a transition that is already open (awaiting
  // approval) or recently executed (awaiting its evidence to land) — a repeated
  // advance is a no-op, not a duplicate governed action.
  if (await proposals.similarOpen(na.action_id, org_id).catch(() => false)) {
    return { advanced: false, status: "in_progress", from: current, to: na.to, requires_approval: na.requires_approval,
      note: "transition already proposed or recently executed — awaiting its approval or effect" };
  }

  const p = await proposals.propose({
    action_id: na.action_id,
    params: { org_id },
    org_id,
    source: `${source}:${actor}`,
    agent_id: agent_id || null,
    hold,
    reasoning: { decision: na.action_id, confidence: 1, reason: `Lifecycle transition ${current} → ${na.to}`, source: "lifecycle_state_machine" },
  });
  const transition = await recordTransition({ org_id, from: current, to: na.to, action_id: na.action_id, proposal_id: p.id, initiated_by: `${source}:${actor}` });

  return {
    advanced: p.status === "executed",
    status: p.status,                 // executed | escalated | blocked | failed
    from: current, to: na.to,
    requires_approval: na.requires_approval,
    proposal: p, transition_id: transition.id,
    note: p.status === "escalated" ? "transition proposed — awaiting operator approval (governed)" :
      p.status === "blocked" ? "transition blocked by Runtime Governance" :
      p.status === "executed" ? "transition executed after engine PERMIT" : "transition proposal failed",
  };
}

// ── Read model: full state for a customer page ──────────────────────────────
async function state(org_id) {
  const sig = await signals(org_id);
  const d = derive(sig);
  const order = stageOrder(d.stage);
  const stages = STAGES.map((s, i) => ({
    key: s.key, label: s.label, order: i,
    status: i < order ? "completed" : i === order ? "current" : "upcoming",
  }));
  return {
    org_id,
    current_stage: d.stage,
    current_label: stageMeta(d.stage).label,
    derivation: d.reason,
    completed: STAGE_KEYS.slice(0, order),
    stages,
    next_action: nextAction(d.stage),
    signals: { engagement_stage: sig.eng.stage, has_report: sig.hasReport, runtime_activity_90d: sig.hasDecisions90, enforce_environment: sig.enforceEnv },
  };
}

/** Transition + approval history for an org (governed transitions), newest
 *  first. Live status + approval come from the linked proposal — the log stays
 *  immutable while the proposal carries the current governance outcome. */
async function history(org_id) {
  const rows = await rt.store.find("ops_transitions", { org_id }).catch(() => []);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const out = [];
  for (const t of rows) {
    const p = t.proposal_id ? await proposals.get(t.proposal_id).catch(() => null) : null;
    out.push({
      id: t.id, from: t.from_stage, to: t.to_stage, action_id: t.action_id,
      at: t.created_at, initiated_by: t.initiated_by,
      status: p ? p.status : "unknown",
      governance: p && p.decision ? { verdict: p.decision.verdict, policy: p.decision.policy, rule: p.decision.rule } : null,
      approval: p && p.operator ? { actor: p.operator.actor, action: p.operator.action, at: p.operator.at, note: p.operator.note } : null,
      evidence_id: p ? p.evidence_id : null,
    });
  }
  return out;
}

/** Just the approval events (operator sign-offs) across an org's transitions. */
async function approvals(org_id) {
  return (await history(org_id)).filter((h) => h.approval).map((h) => ({ ...h.approval, transition: `${h.from} → ${h.to}`, action_id: h.action_id, outcome: h.status }));
}

/** Platform-wide lifecycle summary for the briefing/dashboard. */
async function summary() {
  const orgs = await rt.store.find("orgs", {}).catch(() => []);
  const by_stage = Object.fromEntries(STAGE_KEYS.map((k) => [k, 0]));
  const pending_transitions = [];
  const next_actions = [];
  for (const org of orgs) {
    const st = await state(org.id);
    by_stage[st.current_stage] = (by_stage[st.current_stage] || 0) + 1;
    if (st.next_action.action_id) next_actions.push({ org_id: org.id, name: org.name, from: st.current_stage, to: st.next_action.to, action_id: st.next_action.action_id, requires_approval: st.next_action.requires_approval });
  }
  // Governed transitions already proposed and awaiting approval (escalated).
  const escalated = await proposals.list({ status: "escalated", limit: 100 }).catch(() => []);
  for (const p of escalated) pending_transitions.push({ proposal_id: p.id, org_id: p.org_id, action_id: p.action_id, risk: p.risk });
  return { total: orgs.length, by_stage, next_actions, pending_transitions };
}

module.exports = { STAGES, STAGE_KEYS, derive, deriveFrom, signals, nextAction, transitionNeedsApproval, advance, state, history, approvals, summary };

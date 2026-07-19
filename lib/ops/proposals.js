/* ============================================================================
 * Operations Agent — proposed-action lifecycle.
 *
 * A proposal is the unit of agent autonomy: the agent may only PROPOSE; the
 * governor decides; executors run only on allow. Lifecycle:
 *
 *   proposed → allowed → executed | failed
 *            → blocked                    (terminal)
 *            → escalated → approved → executed | failed   (operator sign-off)
 *                        → denied                          (terminal)
 *
 * Status transitions happen only through this module; operator decisions
 * carry the operator identity and are re-evaluated by the governor with the
 * catalog's authorisation flags before anything executes.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const actions = require("./actions");
const governor = require("./governor");
const evidence = require("./evidence");
const events = require("./events");

const STATUSES = ["proposed", "allowed", "blocked", "escalated", "approved", "denied", "executed", "failed"];
const OPEN_STATUSES = ["proposed", "escalated", "approved", "allowed"];

function shape(p) {
  if (!p) return null;
  return {
    id: p.id, created_at: p.created_at, updated_at: p.updated_at || p.created_at,
    action_id: p.action_id, org_id: p.org_id || null, environment_id: p.environment_id || null,
    params: p.params || {}, status: p.status, risk: p.risk || null,
    source: p.source || "operations_agent",
    reasoning: p.reasoning || null,     // {decision, confidence, reason} from the LLM
    decision: p.decision || null,       // governor decision record
    execution: p.execution || null,     // {executed, result?, error?}
    operator: p.operator || null,       // {actor, at, note} on approve/deny
    evidence_id: p.evidence_id || null,
  };
}

async function get(id) { return shape(await store.findOne("ops_proposals", { id })); }

async function list({ status, org_id, limit = 100 } = {}) {
  const where = {};
  if (status) where.status = status;
  if (org_id) where.org_id = org_id;
  const rows = await store.find("ops_proposals", where);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, Math.max(1, Math.min(500, limit))).map(shape);
}

/** True if a similar open proposal already exists (dedupe within a window). */
async function similarOpen(action_id, org_id, windowMs = 86400000) {
  const rows = await store.find("ops_proposals", { action_id });
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  return rows.some((p) =>
    (p.org_id || null) === (org_id || null) &&
    OPEN_STATUSES.concat("executed").includes(p.status) &&
    String(p.created_at) >= cutoff);
}

async function setStatus(id, patch) {
  await store.update("ops_proposals", id, { ...patch, updated_at: store.nowISO() });
  return get(id);
}

// Execute an allowed proposal via its catalog executor. Returns the execution record.
async function execute(proposal) {
  const action = actions.get(proposal.action_id);
  if (!action || action.refuse || typeof action.execute !== "function") {
    return { executed: false, error: "no executor registered for this action" };
  }
  try {
    const result = await action.execute(proposal.params || {});
    return { executed: true, result };
  } catch (e) {
    return { executed: false, error: e.message || String(e) };
  }
}

/**
 * The full governed path for one agent proposal:
 * create → governor.evaluate → (execute on allow) → evidence → events.
 */
async function propose({ action_id, params = {}, org_id = null, environment_id = null, source = "operations_agent", reasoning = null }) {
  const action = actions.get(action_id);
  const row = await store.insert("ops_proposals", {
    action_id, org_id, environment_id, params, status: "proposed",
    risk: action ? action.risk : null, source, reasoning: reasoning || null,
    decision: null, execution: null, operator: null, evidence_id: null,
    updated_at: store.nowISO(),
  });
  await events.emit("proposal.created", { proposal_id: row.id, action_id, org_id }, { org_id });

  const decision = await governor.evaluate({ action_id, params });
  let status = decision.verdict === "allow" ? "allowed" : decision.verdict === "block" ? "blocked" : "escalated";
  let execution = null;

  if (status === "allowed") {
    execution = await execute({ action_id, params });
    status = execution.executed ? "executed" : "failed";
    await events.emit(`execution.${status}`, { proposal_id: row.id, action_id, execution }, { org_id });
  } else {
    await events.emit(`proposal.${status}`, { proposal_id: row.id, action_id, reason: decision.reason }, { org_id });
  }

  const ev = await evidence.record({
    action_id, proposal_id: row.id, org_id, environment_id,
    policy: decision.policy, risk: decision.risk, verdict: decision.verdict,
    reason: decision.reason, rule: decision.rule, omega_domain: decision.omega_domain,
    trajectory_hash: decision.trajectory_hash, execution,
  });

  return setStatus(row.id, { status, decision, execution, evidence_id: ev ? ev.id : null });
}

/** Operator approves an escalated proposal → re-evaluate WITH approval flags → execute on allow. */
async function approve(id, { actor, note = null }) {
  const p = await get(id);
  if (!p) throw new Error("proposal not found");
  if (!["escalated", "proposed"].includes(p.status)) throw new Error(`proposal is ${p.status}; only escalated proposals can be approved`);
  const approval = { actor: actor || "operator" };

  const decision = await governor.evaluate({ action_id: p.action_id, params: p.params, approval });
  let status, execution = null;
  if (decision.verdict === "allow") {
    execution = await execute(p);
    status = execution.executed ? "executed" : "failed";
  } else {
    // The engine still refuses even with operator flags (refuse-class action,
    // or engine unavailable) — approval does NOT override the engine.
    status = "blocked";
  }

  const ev = await evidence.record({
    action_id: p.action_id, proposal_id: p.id, org_id: p.org_id, environment_id: p.environment_id,
    actor: approval.actor, policy: decision.policy, risk: decision.risk,
    verdict: decision.verdict, reason: decision.reason, rule: decision.rule,
    omega_domain: decision.omega_domain, trajectory_hash: decision.trajectory_hash, execution,
  });
  await rt.adminaudit.record({ action: "ops_approve_proposal", actor: approval.actor, via: "ops", target: p.org_id, meta: { proposal_id: p.id, outcome: status } });
  await events.emit(`proposal.approved`, { proposal_id: p.id, outcome: status, actor: approval.actor }, { org_id: p.org_id });

  return setStatus(id, { status, decision, execution, operator: { ...approval, at: store.nowISO(), note, action: "approve" }, evidence_id: ev ? ev.id : null });
}

/** Operator denies an escalated proposal. Terminal; recorded as evidence. */
async function deny(id, { actor, note = null }) {
  const p = await get(id);
  if (!p) throw new Error("proposal not found");
  if (!["escalated", "proposed"].includes(p.status)) throw new Error(`proposal is ${p.status}; only escalated proposals can be denied`);
  const ev = await evidence.record({
    action_id: p.action_id, proposal_id: p.id, org_id: p.org_id, environment_id: p.environment_id,
    actor: actor || "operator", policy: "operator_denied", risk: p.risk,
    verdict: "block", reason: note || "denied by operator",
  });
  await rt.adminaudit.record({ action: "ops_deny_proposal", actor: actor || "operator", via: "ops", target: p.org_id, meta: { proposal_id: p.id } });
  await events.emit("proposal.denied", { proposal_id: p.id, actor }, { org_id: p.org_id });
  return setStatus(id, { status: "denied", operator: { actor: actor || "operator", at: store.nowISO(), note, action: "deny" }, evidence_id: ev ? ev.id : null });
}

async function summary() {
  const rows = await store.find("ops_proposals", {});
  const by = {};
  for (const s of STATUSES) by[s] = 0;
  for (const r of rows) if (by[r.status] !== undefined) by[r.status] += 1;
  return { total: rows.length, by_status: by, awaiting_operator: by.escalated };
}

module.exports = { STATUSES, OPEN_STATUSES, propose, approve, deny, get, list, summary, similarOpen, shape };

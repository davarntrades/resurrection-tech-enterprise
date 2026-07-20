/* ============================================================================
 * Operations Agent — Agent Coordination Spine (Pillar 5).
 *
 * A HANDOFF is a typed, durable, auditable record of one agent passing work to
 * another. It is a COORDINATION record, never an authority:
 *
 *   · It routes work between departments and records the baton pass.
 *   · It NEVER changes customer state. State changes only ever happen through
 *     the linked governed proposal (proposals → governor → evidence) — the same
 *     trust path as before. The handoff just names the action a receiving agent
 *     should PROPOSE, and links to the proposal once it does.
 *
 * This ledger triples as:
 *   · the inter-agent handoff log (chain of responsibility, replayable),
 *   · the durable per-agent TASK QUEUE (open inbound handoffs = an agent's
 *     work), and
 *   · the BLOCKED-WORK list (status escalated/blocked = visible work items).
 *
 * Every handoff carries: originating agent · receiving agent · organisation ·
 * reason · supporting evidence · proposed action · risk classification. Its
 * governance verdict + approval status are resolved live from the linked
 * proposal, so the row itself stays a stable coordination fact.
 *
 * Status machine:
 *   open ──picked up──▶ accepted ──proposed via governor──▶ resolved
 *                                        │ (high-risk)     ▶ escalated ─approve─▶ resolved
 *                                        │ (BLOCK/refuse)  ▶ blocked   (work item)
 *                                        │ (not chartered) ▶ blocked   (misrouted work item)
 *                                        └ (engine down)   ▶ open (attempts++, bounded retry)
 *   any open handoff superseded by a newer identical intent ▶ superseded
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const actions = require("./actions");
const proposals = require("./proposals");
const events = require("./events");

const WINDOW_MS = 86400000; // 24h — matches proposals.similarOpen dedupe window
const MAX_ATTEMPTS = () => {
  const n = Number(process.env.OPS_HANDOFF_MAX_ATTEMPTS);
  return Number.isFinite(n) && n > 0 ? n : 5;
};
const OPEN_STATUSES = ["open", "accepted", "escalated"];
const STATUSES = ["open", "accepted", "escalated", "blocked", "resolved", "superseded"];

/** Shape a row for the API/UI, resolving the live governance verdict + approval
 *  from the linked proposal (the handoff row itself never stores authority). */
async function shape(h) {
  if (!h) return null;
  let governance = null, approval = null, proposal_status = null;
  if (h.proposal_id) {
    const p = await proposals.get(h.proposal_id).catch(() => null);
    if (p) {
      proposal_status = p.status;
      governance = p.decision ? { verdict: p.decision.verdict, policy: p.decision.policy, rule: p.decision.rule } : null;
      approval = p.operator ? { actor: p.operator.actor, action: p.operator.action, at: p.operator.at, note: p.operator.note } : null;
    }
  }
  return {
    id: h.id, org_id: h.org_id || null,
    from_agent: h.from_agent, to_agent: h.to_agent, kind: h.kind || "task",
    reason: h.reason || "", evidence_refs: h.evidence_refs || [],
    proposed_action: h.proposed_action || null, risk: h.risk || null,
    status: h.status, proposal_id: h.proposal_id || null, transition_id: h.transition_id || null,
    proposal_status, governance, approval,
    attempts: h.attempts || 0, created_by: h.created_by || null,
    accepted_at: h.accepted_at || null, resolved_at: h.resolved_at || null,
    created_at: h.created_at, updated_at: h.updated_at || h.created_at,
  };
}

/** A matching open handoff already in flight? Keys on (from,to,org,action). */
async function similarOpen(from_agent, to_agent, org_id, action_id) {
  const rows = await store.find("ops_handoffs", { to_agent }).catch(() => []);
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
  return rows.find((h) =>
    h.from_agent === from_agent &&
    (h.org_id || null) === (org_id || null) &&
    ((h.proposed_action && h.proposed_action.action_id) || null) === (action_id || null) &&
    OPEN_STATUSES.includes(h.status) &&
    String(h.created_at) >= cutoff) || null;
}

/**
 * Create (or idempotently reuse) a handoff. Returns { handoff, created }.
 * Re-emitting an identical in-flight intent is a no-op (idempotent) — it
 * returns the existing open handoff rather than a duplicate.
 */
async function create({ org_id = null, from_agent, to_agent, kind = "task", reason = "", evidence_refs = [], proposed_action = null, created_by = "operations_agent" }) {
  const action_id = proposed_action && proposed_action.action_id;
  const existing = await similarOpen(from_agent, to_agent, org_id, action_id);
  if (existing) return { handoff: await shape(existing), created: false };
  const action = action_id ? actions.get(action_id) : null;
  const row = await store.insert("ops_handoffs", {
    org_id, from_agent, to_agent, kind, reason,
    evidence_refs: evidence_refs || [], proposed_action: proposed_action || null,
    risk: action ? action.risk : null, status: "open",
    proposal_id: null, transition_id: null, attempts: 0,
    created_by, accepted_at: null, resolved_at: null, updated_at: store.nowISO(),
  });
  await events.emit("handoff.created", { handoff_id: row.id, from_agent, to_agent, action_id }, { org_id });
  return { handoff: await shape(row), created: true };
}

async function get(id) { return shape(await store.findOne("ops_handoffs", { id })); }

async function setStatus(id, patch) {
  await store.update("ops_handoffs", id, { ...patch, updated_at: store.nowISO() });
  return get(id);
}

/** Bump the fail-closed retry counter and keep the handoff open (bounded). */
async function bumpAttempt(id) {
  const raw = await store.findOne("ops_handoffs", { id });
  const attempts = (raw ? raw.attempts || 0 : 0) + 1;
  const exhausted = attempts >= MAX_ATTEMPTS();
  return setStatus(id, { attempts, status: exhausted ? "blocked" : "open", ...(exhausted ? { resolved_at: null } : {}) });
}

/** List with filters: org_id, to_agent, status, since. Newest first, shaped. */
async function list({ org_id, to_agent, status, since, limit = 200 } = {}) {
  const where = {};
  if (org_id) where.org_id = org_id;
  if (to_agent) where.to_agent = to_agent;
  if (status) where.status = status;
  let rows = await store.find("ops_handoffs", where).catch(() => []);
  if (since) rows = rows.filter((r) => String(r.created_at) >= since);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  rows = rows.slice(0, Math.max(1, Math.min(1000, limit)));
  return Promise.all(rows.map(shape));
}

/** An agent's durable task queue: its OPEN inbound handoffs (oldest first, so
 *  work is drained in the order it arrived). */
async function inbox(to_agent) {
  const rows = await store.find("ops_handoffs", { to_agent }).catch(() => []);
  return rows.filter((h) => h.status === "open").sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

/** Full handoff timeline for one org (the chain of responsibility). */
async function timeline(org_id) { return list({ org_id, limit: 500 }); }

/** Blocked / escalated handoffs across the platform — the operator work list. */
async function blockedWork({ limit = 100 } = {}) {
  const rows = await store.find("ops_handoffs", {}).catch(() => []);
  const items = rows.filter((h) => h.status === "blocked" || h.status === "escalated");
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return Promise.all(items.slice(0, limit).map(shape));
}

/** Platform summary for the briefing / dashboard. */
async function summary() {
  const rows = await store.find("ops_handoffs", {}).catch(() => []);
  const by_status = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const by_agent = {};
  for (const h of rows) {
    if (by_status[h.status] !== undefined) by_status[h.status] += 1;
    if (h.to_agent) { by_agent[h.to_agent] = by_agent[h.to_agent] || { open: 0, total: 0 }; by_agent[h.to_agent].total += 1; if (h.status === "open") by_agent[h.to_agent].open += 1; }
  }
  return { total: rows.length, by_status, by_agent, awaiting_operator: by_status.escalated, blocked: by_status.blocked };
}

module.exports = { create, get, setStatus, bumpAttempt, similarOpen, list, inbox, timeline, blockedWork, summary, shape, OPEN_STATUSES, STATUSES };

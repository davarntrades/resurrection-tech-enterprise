/* ============================================================================
 * Operations Agent — evidence generation (every decision leaves a record).
 *
 * One append-style row per governance decision on an agent proposal:
 * timestamp · actor · agent · policy · risk · reason · verdict · execution
 * result · customer/org — searchable from the Control Room and surfaced next
 * to the customer's existing Evidence Hub material. Rows are write-once: the
 * module exposes no update/delete, and the engine's ops_evidence_destruction
 * rule blocks the agent from ever proposing their removal.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;

function shape(r) {
  if (!r) return null;
  return {
    id: r.id,
    created_at: r.created_at,
    actor: r.actor || "operations_agent",
    agent: r.agent || "resurrection-tech-ops-agent",
    agent_id: r.agent_id || null,       // Pillar 4: attributing specialist agent (sales/cs/…)
    action_id: r.action_id,
    proposal_id: r.proposal_id || null,
    org_id: r.org_id || null,
    environment_id: r.environment_id || null,
    policy: r.policy || null,
    risk: r.risk || null,
    verdict: r.verdict,
    reason: r.reason || "",
    rule: r.rule || null,
    omega_domain: r.omega_domain || null,
    trajectory_hash: r.trajectory_hash || null,
    execution: r.execution || null, // { executed, result?, error? }
  };
}

/** Record one decision (and, when present, its execution outcome). */
async function record({
  action_id, proposal_id = null, org_id = null, environment_id = null,
  actor = "operations_agent", agent = "resurrection-tech-ops-agent", agent_id = null,
  policy, risk, verdict, reason, rule = null, omega_domain = null,
  trajectory_hash = null, execution = null,
}) {
  const row = await store.insert("ops_evidence", {
    actor, agent, agent_id: agent_id || null, action_id, proposal_id, org_id, environment_id,
    policy: policy || null, risk: risk || null, verdict, reason: String(reason || "").slice(0, 4000),
    rule, omega_domain, trajectory_hash, execution: execution || null,
  });
  rt.log.info("ops_evidence", { id: row.id, action_id, verdict, org_id });
  return shape(row);
}

/** Search evidence. Filters: org_id, verdict, action_id, agent_id, since (ISO). */
async function search({ org_id, verdict, action_id, agent_id, since, limit = 100 } = {}) {
  const where = {};
  if (org_id) where.org_id = org_id;
  if (verdict) where.verdict = verdict;
  if (action_id) where.action_id = action_id;
  if (agent_id) where.agent_id = agent_id;
  let rows = await store.find("ops_evidence", where);
  if (since) rows = rows.filter((r) => String(r.created_at) >= since);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, Math.max(1, Math.min(1000, limit))).map(shape);
}

/** Counts for the dashboard: total + per-verdict + last 24h blocked. */
async function summary({ org_id } = {}) {
  const rows = await store.find("ops_evidence", org_id ? { org_id } : {});
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const by = { allow: 0, block: 0, escalate: 0 };
  let blocked24h = 0, executed = 0;
  for (const r of rows) {
    if (by[r.verdict] !== undefined) by[r.verdict] += 1;
    if (r.verdict === "block" && String(r.created_at) >= dayAgo) blocked24h += 1;
    if (r.execution && r.execution.executed) executed += 1;
  }
  return { total: rows.length, by_verdict: by, blocked_24h: blocked24h, executed };
}

module.exports = { record, search, summary, shape };

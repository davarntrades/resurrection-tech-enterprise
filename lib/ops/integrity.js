/* ============================================================================
 * Operations Agent — Coordination Integrity verifier (read-only).
 *
 * The observation aid for validating the Coordination Spine (Pillar 5) in
 * production before flipping OPS_COORDINATION on. It reconciles every handoff
 * against its linked governed proposal, that proposal's evidence + governance
 * verdict, and the admin audit trail — turning "do the handoff chains, audit
 * records and responsibility timelines behave exactly as expected?" into a
 * single green/red result with named anomalies.
 *
 * READ-ONLY by construction: it inspects records, proposes nothing, executes
 * nothing, mutates nothing. Every invariant it checks is one the spine already
 * guarantees; the verifier just proves it on live data.
 *
 * Invariants (per handoff, resolved from real records):
 *   linkage        a handoff with a proposal_id → that proposal exists
 *   verdict        a linked proposal → carries a governance verdict
 *   evidence       a linked proposal → has a write-once evidence row
 *   status         handoff status agrees with the proposal (resolved↔executed,
 *                  escalated↔escalated, blocked↔blocked/failed/denied)
 *   attribution    the receiving agent is the one who proposed (agent_id)
 *   audit          an operator-approved handoff has a matching ops_approve_proposal
 *                  admin-audit record
 *   no_ghost_exec  a blocked handoff never has an executed proposal
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const handoffs = require("./handoffs");
const proposals = require("./proposals");

const DAY = 86400000;

function anomaly(list, type, h, detail) {
  list.push({ type, handoff_id: h.id, org_id: h.org_id || null, from_agent: h.from_agent, to_agent: h.to_agent, action_id: h.proposed_action && h.proposed_action.action_id, detail });
}

/**
 * Reconcile the coordination spine against the governance + evidence + audit
 * records. Returns a green/red report. `sinceDays` bounds the window (default 7).
 */
async function check({ sinceDays = 7, limit = 500 } = {}) {
  const since = new Date(Date.now() - sinceDays * DAY).toISOString();
  const generated_at = store.nowISO();

  const [rows, auditRows, runRows] = await Promise.all([
    handoffs.list({ since, limit }).catch(() => []),
    rt.adminaudit.list({ limit: 1000 }).catch(() => []),
    store.find("ops_runs", {}).catch(() => []),
  ]);

  // Index approvals from the admin audit trail by proposal_id.
  const approvedProposals = new Set();
  for (const a of auditRows) {
    if (a.action === "ops_approve_proposal" && a.meta && a.meta.proposal_id) approvedProposals.add(String(a.meta.proposal_id));
  }

  const anomalies = [];
  const by_status = {};
  let approvalsSeen = 0, approvalsAudited = 0, linked = 0;

  for (const h of rows) {
    by_status[h.status] = (by_status[h.status] || 0) + 1;

    if (h.proposal_id) {
      linked += 1;
      const p = await proposals.get(h.proposal_id).catch(() => null);
      if (!p) { anomaly(anomalies, "orphan_proposal_link", h, `proposal ${h.proposal_id} not found`); continue; }

      // verdict + evidence must accompany any governed proposal
      if (!p.decision || !p.decision.verdict) anomaly(anomalies, "missing_verdict", h, "linked proposal has no governance verdict");
      if (!p.evidence_id) anomaly(anomalies, "missing_evidence", h, "linked proposal has no evidence row");

      // status consistency handoff ↔ proposal
      const expect = h.status === "resolved" ? ["executed"] : h.status === "escalated" ? ["escalated"] : h.status === "blocked" ? ["blocked", "failed", "denied"] : null;
      if (expect && !expect.includes(p.status)) anomaly(anomalies, "status_drift", h, `handoff ${h.status} but proposal ${p.status}`);

      // a blocked handoff must never have an executed proposal
      if (h.status === "blocked" && p.status === "executed") anomaly(anomalies, "ghost_execution", h, "blocked handoff has an executed proposal");

      // the receiving agent is the one who proposed
      if (p.agent_id && h.to_agent && p.agent_id !== h.to_agent) anomaly(anomalies, "attribution_mismatch", h, `receiver ${h.to_agent} but proposal attributed to ${p.agent_id}`);
    }

    // operator approvals must be on the audit trail
    if (h.approval && h.approval.actor) {
      approvalsSeen += 1;
      if (h.proposal_id && approvedProposals.has(String(h.proposal_id))) approvalsAudited += 1;
      else anomaly(anomalies, "approval_not_audited", h, `approved by ${h.approval.actor} but no ops_approve_proposal audit record`);
    }
  }

  // Council-cycle records: recent runs completed and carrying handoff counters.
  const councilRuns = runRows.filter((r) => r.mode === "council" && String(r.started_at) >= since);
  councilRuns.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const failedRuns = councilRuns.filter((r) => r.status === "failed").length;

  return {
    generated_at, window_days: sinceDays,
    ok: anomalies.length === 0,
    handoffs_checked: rows.length,
    linked_to_proposal: linked,
    by_status,
    council_cycles: {
      recent: councilRuns.length, failed: failedRuns,
      last_at: councilRuns[0] ? councilRuns[0].started_at : null,
      last_coordinating: councilRuns[0] ? !!councilRuns[0].coordination : null,
    },
    audit: { approvals_seen: approvalsSeen, approvals_audited: approvalsAudited },
    invariants: ["linkage", "verdict", "evidence", "status", "attribution", "audit", "no_ghost_exec"],
    anomalies,
  };
}

module.exports = { check };

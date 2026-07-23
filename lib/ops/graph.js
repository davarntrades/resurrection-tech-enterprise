/* ============================================================================
 * Operations Agent — Enterprise Memory / Evidence Graph (Pillar 7, Phase 3).
 *
 * A shared organisational memory that every agent can QUERY but none can
 * silently rewrite — because it is a DERIVED, read-only projection over the
 * existing authoritative records, not a new mutable store. There is nothing to
 * drift and nothing to tamper with: build(org) reassembles the graph on demand
 * from orgs · contacts · reports · proposals · governance verdicts · approvals ·
 * executions · evidence · lifecycle transitions · handoffs · incidents ·
 * intelligence snapshots · inbound emails · runtime decisions.
 *
 * Every node carries a PROVENANCE class, so nothing enters a briefing "as fact"
 * without support:
 *   observed_fact             something that happened (verdicts, decisions,
 *                             emails, created records) — links to its evidence
 *   deterministic_derivation  computed by a disclosed formula (lifecycle stage,
 *                             scores) — links to the facts it was derived from
 *   model_interpretation      an LLM reasoning output
 *   recommendation            a proposed-but-not-decided action
 *   approved_decision         an operator approval / denial
 *
 * Guarantees: source records stay authoritative; every derived node links back
 * to evidence; contradictions are SURFACED (never silently resolved); decisions
 * are replayable; the graph is org-scoped and never crosses a tenant boundary.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const opsEvidence = require("./evidence");
const proposalsMod = require("./proposals");
const incidentsMod = require("./incidents");
const workflow = require("./workflow");
const intelligence = require("./intelligence");

// Provenance taxonomy (the five classes).
const P = { OBSERVED: "observed_fact", DERIVED: "deterministic_derivation", MODEL: "model_interpretation", REC: "recommendation", DECISION: "approved_decision" };

// Map a briefing/source sourceType → provenance class (so statements can be
// labelled and an "observed_fact without support" can be refused).
function provenanceForSourceType(t) {
  switch (String(t || "")) {
    case "ops_proposal": return P.REC;
    case "system_status": case "ops_evidence": case "organisation": case "report":
    case "runtime_decision": case "email": case "audit_request": case "runtime_assessment": case "lead": return P.OBSERVED;
    case "engagement": case "engagement_note": return P.DERIVED;
    default: return P.OBSERVED;
  }
}

const node = (type, id, provenance, label, at, source_ref, extra) => ({ id: `${type}:${id}`, type, provenance, label: String(label || "").slice(0, 200), at: at || null, source_ref: source_ref || `${type}:${id}`, ...(extra || {}) });
const edge = (from, to, kind) => ({ from, to, kind });

/** Gather one org's authoritative records (org-scoped — never other tenants). */
async function gather(org_id) {
  const [org, eng, reports, decisions, evidence, proposals, transitions, handoffs, incidents, snapshots, emails] = await Promise.all([
    store.findOne("orgs", { id: org_id }).catch(() => null),
    rt.engagement.get(org_id).catch(() => null),
    store.find("reports", { org_id }).catch(() => []),
    store.queryDecisions({ org_id, limit: 100 }).catch(() => []),
    opsEvidence.search({ org_id, limit: 200 }).catch(() => []),
    proposalsMod.list({ org_id, limit: 200 }).catch(() => []),
    store.find("ops_transitions", { org_id }).catch(() => []),
    store.find("ops_handoffs", { org_id }).catch(() => []),
    incidentsMod.list({ org_id, limit: 100 }).catch(() => []),
    store.find("ops_intel_snapshots", { org_id }).catch(() => []),
    store.find("ops_email_events", { org_id }).catch(() => []),
  ]);
  return { org, eng, reports, decisions, evidence, proposals, transitions, handoffs, incidents, snapshots, emails };
}

/**
 * Build the org's evidence graph: { org_id, nodes[], edges[], provenance{},
 * contradictions[], generated_at }. Read-only; deterministic.
 */
async function build(org_id) {
  if (!org_id) throw new Error("org_id required (the memory graph is tenant-scoped)");
  const g = await gather(org_id);
  if (!g.org) return null;
  const nodes = [];
  const edges = [];
  const add = (n) => { nodes.push(n); return n.id; };
  const root = add(node("org", org_id, P.OBSERVED, g.org.name || org_id, g.org.created_at));

  // Contacts (observed).
  for (const c of (g.eng && g.eng.contacts) || []) {
    const id = add(node("contact", c.id, P.OBSERVED, c.name || c.email || "contact", null, `contact:${c.id}`));
    edges.push(edge(root, id, "has_contact"));
  }
  // Reports (observed).
  for (const r of g.reports) { const id = add(node("report", r.id, P.OBSERVED, `${r.period || "report"} report`, r.created_at)); edges.push(edge(root, id, "produced")); }

  // Lifecycle stage (deterministic derivation — links to the signals it used).
  const st = await workflow.state(org_id).catch(() => null);
  if (st) {
    const lc = add(node("lifecycle", org_id, P.DERIVED, `stage: ${st.current_label}`, null, `lifecycle:${org_id}`, { derivation: st.derivation }));
    edges.push(edge(root, lc, "is_at"));
    // Link the derivation to the facts behind it.
    for (const r of g.reports.slice(0, 3)) edges.push(edge(lc, `report:${r.id}`, "derived_from"));
  }

  // Evidence (observed) — the write-once governance record.
  for (const e of g.evidence) add(node("evidence", e.id, P.OBSERVED, `${e.action_id} → ${e.verdict}`, e.created_at, `evidence:${e.id}`));

  // Proposals expand into: proposal(rec) → reasoning → verdict → approval → execution → evidence.
  for (const p of g.proposals) {
    const pid = add(node("proposal", p.id, P.REC, `${p.action_id}${p.agent_id ? ` · ${p.agent_id}` : ""}`, p.created_at, `proposal:${p.id}`, { status: p.status, agent_id: p.agent_id || null }));
    edges.push(edge(root, pid, "proposed"));
    if (p.reasoning) {
      const cls = p.reasoning.source === "llm" ? P.MODEL : P.DERIVED;
      const rid = add(node("reasoning", p.id, cls, p.reasoning.reason || p.reasoning.source || "reasoning", p.created_at, `proposal:${p.id}#reasoning`));
      edges.push(edge(pid, rid, "reasoned_by"));
    }
    if (p.decision && p.decision.verdict) {
      const vid = add(node("verdict", p.id, P.OBSERVED, `Ω ${p.decision.verdict}${p.decision.rule ? ` (${p.decision.rule})` : ""}`, p.created_at, `proposal:${p.id}#verdict`));
      edges.push(edge(pid, vid, "governed_by"));
    }
    if (p.operator && p.operator.actor) {
      const aid = add(node("approval", p.id, P.DECISION, `${p.operator.action || "approve"} by ${p.operator.actor}`, p.operator.at, `proposal:${p.id}#operator`));
      edges.push(edge(pid, aid, "decided_by"));
    }
    if (p.execution && p.execution.executed) {
      const unver = p.execution.verified === false;
      const xid = add(node("execution", p.id, P.OBSERVED, `executed${unver ? " (unverified)" : p.execution.verified === true ? " (verified)" : ""}`, p.updated_at || p.created_at, `proposal:${p.id}#execution`, { verified: p.execution.verified }));
      edges.push(edge(pid, xid, "executed_as"));
    }
    if (p.evidence_id) edges.push(edge(pid, `evidence:${p.evidence_id}`, "recorded_in"));
  }

  // Transitions (observed) → their proposal.
  for (const t of g.transitions) { const id = add(node("transition", t.id, P.OBSERVED, `${t.from_stage} → ${t.to_stage}`, t.created_at)); edges.push(edge(root, id, "transitioned")); if (t.proposal_id) edges.push(edge(id, `proposal:${t.proposal_id}`, "via")); }
  // Handoffs (deterministic routing) → their proposal.
  for (const h of g.handoffs) { const id = add(node("handoff", h.id, P.DERIVED, `${h.from_agent} → ${h.to_agent}: ${(h.proposed_action && h.proposed_action.action_id) || "—"}`, h.created_at, `handoff:${h.id}`, { status: h.status })); edges.push(edge(root, id, "coordinated")); if (h.proposal_id) edges.push(edge(id, `proposal:${h.proposal_id}`, "via")); }
  // Incidents (observed).
  for (const i of g.incidents) { const id = add(node("incident", i.id, P.OBSERVED, `${i.kind} (${i.severity})`, i.created_at, `incident:${i.id}`, { status: i.status })); edges.push(edge(root, id, "raised")); if (i.source_ref) edges.push(edge(id, `proposal:${i.source_ref}`, "from")); }
  // Intelligence snapshots (deterministic derivation).
  for (const s of g.snapshots) { const id = add(node("snapshot", s.id, P.DERIVED, `health ${s.health} (${s.health_band || "?"})`, s.taken_at || s.created_at)); edges.push(edge(root, id, "scored")); }
  // Inbound emails (observed).
  for (const e of g.emails) { const id = add(node("email", e.id, P.OBSERVED, `${e.from_email}: ${String(e.subject || "").slice(0, 60)}`, e.received_at || e.created_at)); edges.push(edge(root, id, "received")); }

  const provenance = {};
  for (const k of Object.values(P)) provenance[k] = 0;
  for (const n of nodes) provenance[n.provenance] = (provenance[n.provenance] || 0) + 1;

  const contradictions = await findContradictions(org_id, g);
  return { org_id, org_name: g.org.name || org_id, generated_at: store.nowISO(), nodes, edges, provenance, contradictions, counts: countByType(nodes) };
}

function countByType(nodes) { const c = {}; for (const n of nodes) c[n.type] = (c[n.type] || 0) + 1; return c; }

/** Deterministic contradiction surfacing — flagged, never silently resolved. */
async function findContradictions(org_id, g) {
  const out = [];
  // 1. Executed but unverified (the fact of execution vs the intent to verify).
  for (const p of g.proposals) {
    if (p.execution && p.execution.executed && p.execution.verified === false) {
      out.push({ type: "executed_but_unverified", detail: `${p.action_id} executed but its verifier could not confirm the effect`, nodes: [`proposal:${p.id}`, `execution:${p.id}`], severity: "warning" });
    }
  }
  // 2. Resolved handoff whose linked proposal never executed.
  for (const h of g.handoffs) {
    if (h.status === "resolved" && h.proposal_id) {
      const p = g.proposals.find((x) => x.id === h.proposal_id);
      if (p && p.status !== "executed") out.push({ type: "resolved_handoff_without_execution", detail: `handoff ${h.from_agent}→${h.to_agent} is resolved but its proposal is ${p.status}`, nodes: [`handoff:${h.id}`, `proposal:${h.proposal_id}`], severity: "warning" });
    }
  }
  // 3. Stale memory: latest snapshot health vs a fresh derivation diverge > 20.
  if (g.snapshots.length) {
    const latest = g.snapshots.slice().sort((a, b) => String(b.taken_at || b.created_at).localeCompare(String(a.taken_at || a.created_at)))[0];
    const fresh = await intelligence.detail(org_id).catch(() => null);
    if (fresh && typeof latest.health === "number" && Math.abs(fresh.scores.health.score - latest.health) > 20) {
      out.push({ type: "stale_intelligence_snapshot", detail: `snapshot health ${latest.health} diverges from current ${fresh.scores.health.score} (>20)`, nodes: [`snapshot:${latest.id}`, `lifecycle:${org_id}`], severity: "info" });
    }
  }
  return out;
}

/** Trace a node back to its records: provenance + source + connected nodes +
 *  the path to the nearest evidence node (the "open any recommendation and
 *  trace it to records/agent/verdict/outcome" surface). */
async function trace(org_id, node_id) {
  const graph = await build(org_id);
  if (!graph) return null;
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  const target = byId[node_id];
  if (!target) return { org_id, node: null, error: "node not found in this org's graph" };
  const related = [];
  for (const e of graph.edges) {
    if (e.from === node_id && byId[e.to]) related.push({ direction: "out", kind: e.kind, node: byId[e.to] });
    if (e.to === node_id && byId[e.from]) related.push({ direction: "in", kind: e.kind, node: byId[e.from] });
  }
  // BFS to the nearest evidence node.
  const adj = {}; for (const e of graph.edges) { (adj[e.from] = adj[e.from] || []).push(e.to); (adj[e.to] = adj[e.to] || []).push(e.from); }
  const seen = new Set([node_id]); let frontier = [[node_id]]; let evidencePath = null;
  while (frontier.length && !evidencePath) {
    const next = [];
    for (const path of frontier) {
      const cur = path[path.length - 1];
      if (byId[cur] && byId[cur].type === "evidence" && cur !== node_id) { evidencePath = path.map((id) => byId[id]); break; }
      for (const nb of adj[cur] || []) if (!seen.has(nb)) { seen.add(nb); next.push(path.concat(nb)); }
    }
    frontier = next;
  }
  return { org_id, node: target, provenance: target.provenance, source_ref: target.source_ref, related, to_evidence: evidencePath || (target.type === "evidence" ? [target] : []) };
}

/** Replay the org's governed decision timeline (immutable, ordered). */
async function replay(org_id) {
  const g = await gather(org_id);
  const items = [];
  for (const e of g.evidence) items.push({ at: e.created_at, kind: "governance_decision", action: e.action_id, verdict: e.verdict, actor: e.actor, agent: e.agent_id || null, detail: e.reason, ref: `evidence:${e.id}` });
  for (const t of g.transitions) items.push({ at: t.created_at, kind: "lifecycle_transition", action: t.action_id, detail: `${t.from_stage} → ${t.to_stage}`, actor: t.initiated_by, ref: `transition:${t.id}` });
  for (const p of g.proposals) if (p.operator && p.operator.actor) items.push({ at: p.operator.at, kind: "operator_decision", action: p.action_id, detail: p.operator.action, actor: p.operator.actor, ref: `proposal:${p.id}` });
  return items.filter((i) => i.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** Compact per-org summary for the picker / briefing. */
async function summary(org_id) {
  const graph = await build(org_id);
  if (!graph) return null;
  return { org_id, org_name: graph.org_name, node_count: graph.nodes.length, provenance: graph.provenance, contradictions: graph.contradictions.length, counts: graph.counts };
}

module.exports = { build, trace, replay, summary, provenanceForSourceType, PROVENANCE: P };

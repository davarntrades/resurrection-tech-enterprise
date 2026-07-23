/* ============================================================================
 * Operations Agent — incident ledger (Phase 2, Governed Action Execution).
 *
 * A durable operator work item raised when something needs attention. Two
 * sources, one ledger:
 *   1. the open_incident governed executor (an agent or operator opens one
 *      through the proposal → governance → evidence path), and
 *   2. the POST-EXECUTION VERIFICATION safeguard — when a governed action
 *      executes but its verifier cannot confirm the effect, the platform opens
 *      an incident DIRECTLY (a system safeguard, not an agent action, so there
 *      is no proposal recursion). Pillar 6/8: "failed verification must generate
 *      an incident or operator work item."
 *
 * Incidents are internal records only — no external reach. Read/resolve are
 * operator surfaces; the ledger is append-then-resolve (never deleted).
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const events = require("./events");

const SEVERITIES = ["info", "warning", "critical"];

function shape(i) {
  if (!i) return null;
  return {
    id: i.id, severity: i.severity || "warning", kind: i.kind || "ops_incident",
    summary: i.summary || "", org_id: i.org_id || null, source_ref: i.source_ref || null,
    status: i.status || "open", opened_by: i.opened_by || "operations_agent",
    resolved_by: i.resolved_by || null, resolved_at: i.resolved_at || null, note: i.note || null,
    created_at: i.created_at, updated_at: i.updated_at || i.created_at,
  };
}

/** Open an incident. Deterministic; never throws in the caller's path. */
async function open({ severity = "warning", kind = "ops_incident", summary = "", org_id = null, source_ref = null, opened_by = "operations_agent" } = {}) {
  const sev = SEVERITIES.includes(severity) ? severity : "warning";
  const row = await store.insert("ops_incidents", {
    severity: sev, kind, summary: String(summary).slice(0, 2000), org_id, source_ref,
    status: "open", opened_by, resolved_by: null, resolved_at: null, note: null, updated_at: store.nowISO(),
  });
  await events.emit("incident.opened", { incident_id: row.id, kind, severity: sev, org_id }, { org_id });
  rt.log.info("ops_incident_opened", { id: row.id, kind, severity: sev, org_id });
  return shape(row);
}

async function get(id) { return shape(await store.findOne("ops_incidents", { id })); }

async function list({ status, org_id, limit = 100 } = {}) {
  const where = {};
  if (status) where.status = status;
  if (org_id) where.org_id = org_id;
  const rows = await store.find("ops_incidents", where).catch(() => []);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, Math.max(1, Math.min(500, limit))).map(shape);
}

/** Operator resolves an incident. Terminal; recorded with actor + note. */
async function resolve(id, { actor = "operator", note = null } = {}) {
  const i = await get(id);
  if (!i) throw new Error("incident not found");
  await store.update("ops_incidents", id, { status: "resolved", resolved_by: actor, resolved_at: store.nowISO(), note, updated_at: store.nowISO() });
  await rt.adminaudit.record({ action: "ops_incident_resolved", actor, via: "ops", target: i.org_id, meta: { incident_id: id } });
  await events.emit("incident.resolved", { incident_id: id, actor }, { org_id: i.org_id });
  return get(id);
}

async function summary() {
  const rows = await store.find("ops_incidents", {}).catch(() => []);
  const by_severity = { info: 0, warning: 0, critical: 0 };
  let open_count = 0;
  for (const r of rows) { if (r.status === "open") { open_count += 1; if (by_severity[r.severity] !== undefined) by_severity[r.severity] += 1; } }
  return { total: rows.length, open: open_count, by_severity };
}

module.exports = { open, get, list, resolve, summary, shape, SEVERITIES };

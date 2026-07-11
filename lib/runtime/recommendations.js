/* ============================================================================
 * Runtime Governance — Recommendations Tracker (managed service).
 *
 * Structured, per-customer governance recommendations that the operator raises
 * and tracks through a lifecycle, and that the customer sees (read-only) in
 * their Evidence Hub and in delivered reports. Not a customer surface to edit —
 * status transitions are operator-only; customers only view them.
 *
 * Lifecycle:  open → acknowledged → in_progress → resolved
 * Severity:   low · medium · high · critical
 *
 * Pure data (store-backed). No customer login. Reuses the shared store.
 * ============================================================================ */
"use strict";
const store = require("./store");

const STATUSES = ["open", "acknowledged", "in_progress", "resolved"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const OPEN_STATES = ["open", "acknowledged", "in_progress"]; // "still needs attention"

const norm = (v, allowed, fallback) => (allowed.includes(String(v)) ? String(v) : fallback);
const clean = (s, max = 4000) => String(s == null ? "" : s).trim().slice(0, max);

function shape(r) {
  if (!r) return null;
  return {
    id: r.id,
    org_id: r.org_id,
    environment_id: r.environment_id || null,
    title: r.title || "",
    detail: r.detail || "",
    severity: norm(r.severity, SEVERITIES, "medium"),
    status: norm(r.status, STATUSES, "open"),
    source: r.source || null,          // e.g. an audit pack reference
    created_at: r.created_at || null,
    updated_at: r.updated_at || null,
    resolved_at: r.resolved_at || null,
  };
}

// Create a recommendation for a customer (operator action).
async function create({ org_id, title, detail = "", severity = "medium", environment_id = null, source = null }) {
  if (!org_id) throw new Error("org_id is required");
  const t = clean(title, 300);
  if (!t) throw new Error("title is required");
  const row = await store.insert("recommendations", {
    org_id,
    environment_id: environment_id || null,
    title: t,
    detail: clean(detail),
    severity: norm(severity, SEVERITIES, "medium"),
    status: "open",
    source: source ? clean(source, 200) : null,
    updated_at: store.nowISO(),
    resolved_at: null,
  });
  return shape(row);
}

async function get(id) {
  return shape(await store.findOne("recommendations", { id }).catch(() => null));
}

// List a customer's recommendations, newest first. Optionally filter by status
// or by the open (needs-attention) set.
async function list({ org_id, status = null, openOnly = false } = {}) {
  if (!org_id) return [];
  let rows = await store.find("recommendations", { org_id }).catch(() => []);
  rows = rows.map(shape);
  if (status) rows = rows.filter((r) => r.status === status);
  if (openOnly) rows = rows.filter((r) => OPEN_STATES.includes(r.status));
  const sev = (r) => SEVERITIES.indexOf(r.severity);
  return rows.sort((a, b) =>
    // open items first, then by severity (critical→low), then newest.
    (OPEN_STATES.includes(b.status) ? 1 : 0) - (OPEN_STATES.includes(a.status) ? 1 : 0) ||
    sev(b) - sev(a) ||
    String(b.created_at).localeCompare(String(a.created_at)));
}

// Update mutable fields (operator action). Status transitions stamp resolved_at.
async function update(id, patch = {}) {
  const cur = await store.findOne("recommendations", { id }).catch(() => null);
  if (!cur) throw new Error("recommendation not found");
  const next = { updated_at: store.nowISO() };
  if (patch.title != null) next.title = clean(patch.title, 300);
  if (patch.detail != null) next.detail = clean(patch.detail);
  if (patch.severity != null) next.severity = norm(patch.severity, SEVERITIES, cur.severity || "medium");
  if (patch.source != null) next.source = clean(patch.source, 200);
  if (patch.status != null) {
    next.status = norm(patch.status, STATUSES, cur.status || "open");
    next.resolved_at = next.status === "resolved" ? store.nowISO() : null;
  }
  await store.update("recommendations", id, next);
  return get(id);
}

async function setStatus(id, status) {
  return update(id, { status });
}

// Counts by status + open total (for badges / report snapshots).
async function summary(org_id) {
  const rows = await list({ org_id });
  const by = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of rows) by[r.status] = (by[r.status] || 0) + 1;
  const open = rows.filter((r) => OPEN_STATES.includes(r.status)).length;
  return { total: rows.length, open, by };
}

module.exports = { STATUSES, SEVERITIES, OPEN_STATES, create, get, list, update, setStatus, summary };

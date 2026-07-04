/* ============================================================================
 * Runtime Governance — operator action audit (admin dashboard, Phase 1).
 *
 * Records who did what in the control room (onboarded, enforced, rotated a key).
 * Writes durably to the store when the rg_admin_audit table exists, and NEVER
 * lets an audit-write failure break the operator action — on any store error it
 * degrades to a loud structured log event. Always emits a structured event too,
 * so actions are visible in the observability ring buffer regardless.
 * ============================================================================ */
"use strict";
const store = require("./store");
const log = require("./log");

// Record an admin action. Fire-and-safe: returns the row or null, never throws.
// Takes a single object (destructured inside) so consumers can pass any fields.
async function record(input) {
  const { action, actor = "unknown", via = null, target = null, meta = null } = input || {};
  const entry = { action, actor, via, target: target || null, meta: meta || null, created_at: store.nowISO() };
  log.info("admin_action", { action, actor, via, target });
  try {
    return await store.insert("admin_audit", entry);
  } catch (e) {
    // Missing table / store outage must not block the operator — log loudly instead.
    log.warn("admin_audit_write_failed", { action, actor, error: (e && e.message) || String(e) });
    return null;
  }
}

// List recent admin actions (newest first). Graceful [] on any store error.
async function list({ limit = 100 } = {}) {
  try {
    const rows = await store.find("admin_audit");
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit);
  } catch { return []; }
}

module.exports = { record, list };

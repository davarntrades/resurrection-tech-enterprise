/* ============================================================================
 * Runtime Governance — CUSTOMER notifications (managed service).
 *
 * Opt-in, per-org, customer-facing notifications — completely separate from the
 * operator OPS alerts in ./alerts.js (engine down, evidence gaps, block spikes).
 * This layer only stores per-org preferences + recipients and decides whether a
 * given customer event should be delivered; the actual send is done in TS
 * (lib/customerNotify.ts → lib/email.ts) so it can reuse the Resend infra.
 *
 * Events: new_evidence · executive_report · weekly_summary · significant_event.
 * Disabled by default (opt-in). No customer login — delivery is by email only.
 * ============================================================================ */
"use strict";
const store = require("./store");

const EVENTS = ["new_evidence", "executive_report", "weekly_summary", "significant_event"];
const allEvents = () => Object.fromEntries(EVENTS.map((e) => [e, true]));
const cleanEmails = (arr) =>
  [...new Set((arr || []).map((s) => String(s).trim().toLowerCase()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))];

// Current preferences for an org (defaults = disabled / opt-in).
async function getPrefs(org_id) {
  const row = await store.findOne("notify_prefs", { org_id }).catch(() => null);
  if (!row) return { org_id, enabled: false, recipients: [], events: allEvents(), last_weekly_at: null, configured: false };
  return {
    org_id,
    enabled: !!row.enabled,
    recipients: Array.isArray(row.recipients) ? row.recipients : [],
    events: { ...allEvents(), ...(row.events || {}) },
    last_weekly_at: row.last_weekly_at || null,
    configured: true,
  };
}

// Upsert preferences. Only provided fields change.
async function setPrefs(org_id, patch = {}) {
  if (!org_id) throw new Error("org_id required");
  const cur = await store.findOne("notify_prefs", { org_id }).catch(() => null);
  const recipients = patch.recipients != null ? cleanEmails(patch.recipients) : (cur?.recipients || []);
  const events = { ...allEvents(), ...(cur?.events || {}), ...(patch.events || {}) };
  const enabled = patch.enabled != null ? !!patch.enabled : !!cur?.enabled;
  if (cur) await store.update("notify_prefs", cur.id, { enabled, recipients, events, updated_at: store.nowISO() });
  else await store.insert("notify_prefs", { org_id, enabled, recipients, events, last_weekly_at: null });
  return getPrefs(org_id);
}

// Should this customer event be delivered for this org?
async function shouldNotify(org_id, event) {
  const p = await getPrefs(org_id);
  return p.enabled && p.recipients.length > 0 && p.events[event] !== false;
}

async function markWeekly(org_id) {
  const cur = await store.findOne("notify_prefs", { org_id }).catch(() => null);
  if (cur) await store.update("notify_prefs", cur.id, { last_weekly_at: store.nowISO() });
}

// Orgs opted in to the weekly summary (for the cron sweep).
async function optedInForWeekly() {
  const rows = await store.find("notify_prefs", {}).catch(() => []);
  return rows.filter((r) => r.enabled && (r.events?.weekly_summary !== false) && (r.recipients || []).length > 0).map((r) => r.org_id);
}

module.exports = { EVENTS, getPrefs, setPrefs, shouldNotify, markWeekly, optedInForWeekly };

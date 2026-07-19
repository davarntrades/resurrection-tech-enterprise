/* ============================================================================
 * Operations Agent — event system.
 *
 * Durable event log (ops_events) + in-process pub/sub so agent cycles can be
 * event-driven as well as scheduled. External systems (GitHub webhooks, deploy
 * hooks, Control Room actions) POST events via /api/ops/events; internal
 * modules emit as they work. Subscribers are fire-and-safe — a failing handler
 * never breaks the emitting path.
 *
 * Event naming: dot-namespaced kinds —
 *   observation.*  proposal.*  execution.*  integration.*  client.*  cycle.*
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;

const _subs = new Map(); // kind-prefix → [handler]

/** Subscribe to events whose kind starts with `prefix` ("" = all). */
function subscribe(prefix, handler) {
  const list = _subs.get(prefix) || [];
  list.push(handler);
  _subs.set(prefix, list);
  return () => {
    const cur = _subs.get(prefix) || [];
    const i = cur.indexOf(handler);
    if (i >= 0) cur.splice(i, 1);
  };
}

/** Emit an event: persist + notify subscribers. Never throws. */
async function emit(kind, payload = {}, { org_id = null, source = "operations_agent" } = {}) {
  let row = null;
  try {
    row = await store.insert("ops_events", { kind, org_id, source, payload: payload || {} });
  } catch (e) {
    rt.log.warn("ops_event_persist_failed", { kind, error: e.message });
  }
  for (const [prefix, handlers] of _subs) {
    if (!kind.startsWith(prefix)) continue;
    for (const h of handlers) {
      try { await h({ kind, org_id, source, payload }); }
      catch (e) { rt.log.warn("ops_event_handler_failed", { kind, error: e.message }); }
    }
  }
  return row;
}

/** Recent events, newest first. Filters: kind prefix, org_id, since. */
async function list({ kind, org_id, since, limit = 100 } = {}) {
  let rows = await store.find("ops_events", org_id ? { org_id } : {});
  if (kind) rows = rows.filter((r) => String(r.kind || "").startsWith(kind));
  if (since) rows = rows.filter((r) => String(r.created_at) >= since);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, Math.max(1, Math.min(1000, limit)));
}

module.exports = { emit, subscribe, list };

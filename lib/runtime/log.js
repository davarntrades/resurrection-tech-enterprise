/* ============================================================================
 * Runtime Governance — structured logging + observability (L1).
 *
 * One JSON object per line to stdout (the same convention as the engine's
 * `governance.metrics` logger), so any log aggregator (Datadog, CloudWatch,
 * Loki, Vercel) ingests it directly. Also keeps a bounded in-memory ring of the
 * most-recent events so the platform can expose "what just happened" for health
 * checks and so tests can assert on emitted events without scraping stdout.
 *
 * Never logs raw customer arguments — only the same metadata the decision row
 * already carries (verdict, Ω domain, rule, hash, latency, ids).
 * ============================================================================ */
"use strict";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[(process.env.RUNTIME_LOG_LEVEL || "info").toLowerCase()] || 20;
const SILENT = /^(1|true|yes)$/i.test(String(process.env.RUNTIME_LOG_SILENT || ""));
const RING_MAX = Number(process.env.RUNTIME_LOG_RING || 500);

const ring = [];
const counters = Object.create(null);

function emit(level, event, fields) {
  const rec = { ts: new Date().toISOString(), level, event, ...(fields || {}) };
  counters[event] = (counters[event] || 0) + 1;
  ring.push(rec);
  if (ring.length > RING_MAX) ring.shift();
  if (!SILENT && (LEVELS[level] || 0) >= MIN) {
    try { process.stdout.write(JSON.stringify(rec) + "\n"); } catch { /* never throw from logging */ }
  }
  return rec;
}

module.exports = {
  debug: (event, fields) => emit("debug", event, fields),
  info: (event, fields) => emit("info", event, fields),
  warn: (event, fields) => emit("warn", event, fields),
  error: (event, fields) => emit("error", event, fields),
  // Observability surface (for /health-style introspection + tests):
  recent: (n = 50) => ring.slice(-n),
  counters: () => ({ ...counters }),
  _reset: () => { ring.length = 0; for (const k of Object.keys(counters)) delete counters[k]; },
};

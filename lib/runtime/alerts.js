/* ============================================================================
 * Runtime Governance — operational alerting (Phase 3).
 *
 * Raises alerts on the operator-critical signals:
 *   • engine_unreachable   — governance can't evaluate (fail-closed in enforce)
 *   • record_failure       — a decision could not be persisted (evidence gap)
 *   • block_spike          — an unusual number of BLOCK verdicts in a window
 *   • store_non_durable    — running on the ephemeral file store
 *
 * raise() persists to rg_alerts (graceful — degrades to a log event if the table
 * is absent) and dispatches to any configured channel (webhook + email), with an
 * in-process cooldown so a tight failure loop can't spam. evaluate()/sweep() read
 * current conditions; the cron sweeps, the dashboard shows live status. Never
 * throws — alerting must not break the governance path. Engine untouched.
 *
 * Config (all optional):
 *   RUNTIME_ALERT_BLOCK_SPIKE   BLOCK count in the window that trips (default 10)
 *   RUNTIME_ALERT_WINDOW_MIN    lookback window minutes (default 60)
 *   RUNTIME_ALERT_COOLDOWN_MIN  per-kind+scope suppression minutes (default 5)
 *   RUNTIME_ALERT_WEBHOOK       POST target for each alert (Slack-compatible text)
 *   RESEND_API_KEY + RUNTIME_ALERT_EMAIL_TO + RUNTIME_ALERT_EMAIL_FROM   email
 * ============================================================================ */
"use strict";
const store = require("./store");
const engine = require("./engine");
const metrics = require("./metrics");
const log = require("./log");

const SEVERITY = { engine_unreachable: "critical", record_failure: "critical", block_spike: "warning", store_non_durable: "warning" };
const num = (env, def) => { const n = Number(process.env[env]); return Number.isFinite(n) && n > 0 ? n : def; };

// In-process suppression so a repeating condition doesn't flood channels.
const _lastRaised = new Map();
function suppressed(kind, scope) {
  const cooldownMs = num("RUNTIME_ALERT_COOLDOWN_MIN", 5) * 60000;
  const k = `${kind}:${scope || "-"}`, now = Date.now();
  if (now - (_lastRaised.get(k) || 0) < cooldownMs) return true;
  _lastRaised.set(k, now);
  return false;
}

// Persist + dispatch one alert. Fire-and-safe: never throws.
async function raise({ org_id = null, environment_id = null, kind, message, severity, meta = null } = {}) {
  severity = severity || SEVERITY[kind] || "warning";
  if (suppressed(kind, environment_id || org_id)) return null;
  const alert = { kind, severity, org_id, environment_id, message: message || kind, meta: meta || null, created_at: store.nowISO() };
  (severity === "critical" ? log.error : log.warn)("alert", { kind, severity, org_id, environment_id, message: alert.message });
  try { await store.insert("alerts", alert); } catch (e) { log.warn("alert_persist_failed", { kind, error: (e && e.message) || String(e) }); }
  await dispatch(alert).catch(() => { /* delivery is best-effort */ });
  return alert;
}

async function dispatch(alert) {
  const line = `[${String(alert.severity).toUpperCase()}] Runtime Governance — ${alert.kind}: ${alert.message}`;
  const hook = process.env.RUNTIME_ALERT_WEBHOOK;
  if (hook) {
    try { await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: line, alert }) }); }
    catch (e) { log.warn("alert_webhook_failed", { error: (e && e.message) || String(e) }); }
  }
  const to = process.env.RUNTIME_ALERT_EMAIL_TO, key = process.env.RESEND_API_KEY, from = process.env.RUNTIME_ALERT_EMAIL_FROM;
  if (to && key && from) {
    try {
      const { Resend } = require("resend");
      await new Resend(key).emails.send({
        from, to: to.split(",").map((s) => s.trim()).filter(Boolean),
        subject: `[${alert.severity}] Runtime Governance alert: ${alert.kind}`,
        text: `${alert.message}\n\norg: ${alert.org_id || "-"}\nenv: ${alert.environment_id || "-"}\nat: ${alert.created_at}`,
      });
    } catch (e) { log.warn("alert_email_failed", { error: (e && e.message) || String(e) }); }
  }
}

// Current live conditions. Global signals (engine, store) plus, when an env is
// given, the BLOCK-spike check for that env. Read-only — does not dispatch.
async function evaluate({ org_id, environment_id, windowMin } = {}) {
  const conditions = [];
  const eng = await engine.health();
  if (!eng.ok) conditions.push({ kind: "engine_unreachable", severity: "critical", message: `Engine unreachable: ${eng.error || "HTTP " + eng.status}` });
  if (!store.durable()) conditions.push({ kind: "store_non_durable", severity: "warning", message: "Store is non-durable (ephemeral file store) — configure Supabase so evidence persists." });

  if (environment_id || org_id) {
    windowMin = windowMin || num("RUNTIME_ALERT_WINDOW_MIN", 60);
    const since = new Date(Date.now() - windowMin * 60000).toISOString();
    const s = await metrics.summary({ org_id, environment_id, since });
    const blocks = (s.verdicts && s.verdicts.BLOCK) || 0;
    const threshold = num("RUNTIME_ALERT_BLOCK_SPIKE", 10);
    if (blocks >= threshold) conditions.push({ kind: "block_spike", severity: "warning", org_id, environment_id, message: `${blocks} BLOCK verdicts in the last ${windowMin}m (threshold ${threshold}).`, meta: { blocks, windowMin, threshold } });
  }
  return conditions;
}

// Sweep every active org/environment and raise whatever is currently firing.
async function sweep() {
  const raised = [];
  const globals = await evaluate({});                       // engine + store, once
  for (const c of globals) { if (await raise(c)) raised.push(c.kind); }
  const orgs = await store.find("orgs", {});
  for (const org of orgs) {
    if (org.status && org.status !== "active") continue;
    const envs = await store.find("environments", { org_id: org.id });
    for (const env of envs) {
      const conds = await evaluate({ org_id: org.id, environment_id: env.id });
      for (const c of conds) { if (c.kind === "block_spike" && await raise({ ...c, org_id: org.id, environment_id: env.id })) raised.push(c.kind); }
    }
  }
  return { raised: raised.length, kinds: raised };
}

async function list(opts) {
  const { org_id, limit = 100 } = opts || {};
  try {
    const rows = await store.find("alerts", org_id ? { org_id } : {});
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit);
  } catch { return []; }
}

module.exports = { raise, dispatch, evaluate, sweep, list, SEVERITY };

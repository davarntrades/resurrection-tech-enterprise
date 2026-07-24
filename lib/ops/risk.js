/* ============================================================================
 * Guardian OS — Runtime Risk Intelligence (derived, read-only).
 *
 * Instead of waiting for incidents, GuardianOS detects TRENDS. This module
 * compares the current window against the prior window over the authoritative
 * records the platform already owns (proposals, evidence/refusals, incidents,
 * intelligence snapshots) and answers "here's what changed since yesterday."
 * Pure projection — deterministic, no new state. The Runtime Risk Intelligence
 * department reacts to these trends with governed alerts.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const proposals = require("./proposals");
const evidence = require("./evidence");
const incidents = require("./incidents");

const DAY = 86400000;

const SECURITY_REFUSAL_RULES = new Set([
  "ops_evidence_destruction", "ops_credential_sharing",
  "ops_unauthorized_autonomy_change", "ops_internal_action_external_reach",
  "ops_unauthorized_policy_activation",
]);

// A single trend: value now vs the prior equal window, with a signed delta and
// a coarse direction. `worse_up` marks metrics where an increase is bad.
function trend(name, cur, prev, worse_up = true) {
  const delta = cur - prev;
  const direction = delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const worsening = worse_up ? delta > 0 : delta < 0;
  return { name, current: cur, prior: prev, delta, direction, worsening };
}

const between = (iso, lo, hi) => String(iso) >= lo && (!hi || String(iso) < hi);
const avgLatencyMs = (rows) => {
  const ls = rows.filter((p) => p.operator && p.operator.at && p.created_at).map((p) => Date.parse(p.operator.at) - Date.parse(p.created_at));
  return ls.length ? Math.round(ls.reduce((a, b) => a + b, 0) / ls.length) : 0;
};

/** Trend report over the two most-recent equal windows (default: last 24h vs the
 *  24h before it). Every metric traces to real records. */
async function trends({ windowDays = 1 } = {}) {
  const now = Date.now();
  const curLo = new Date(now - windowDays * DAY).toISOString();
  const prevLo = new Date(now - 2 * windowDays * DAY).toISOString();

  const [props, blocked, incRows, snaps] = await Promise.all([
    proposals.list({ limit: 1000 }).catch(() => []),
    evidence.search({ verdict: "block", since: prevLo, limit: 1000 }).catch(() => []),
    incidents.list({ limit: 500 }).catch(() => []),
    store.find("ops_intel_snapshots", {}).catch(() => []),
  ]);

  const inCur = (iso) => between(iso, curLo, null);
  const inPrev = (iso) => between(iso, prevLo, curLo);

  const escCur = props.filter((p) => p.status === "escalated" && inCur(p.created_at)).length;
  const escPrev = props.filter((p) => p.status === "escalated" && inPrev(p.created_at)).length;
  const exeCur = props.filter((p) => inCur(p.created_at) && p.status === "executed").length;
  const exePrev = props.filter((p) => inPrev(p.created_at) && p.status === "executed").length;
  const refCur = blocked.filter((e) => e.rule && SECURITY_REFUSAL_RULES.has(e.rule) && inCur(e.created_at)).length;
  const refPrev = blocked.filter((e) => e.rule && SECURITY_REFUSAL_RULES.has(e.rule) && inPrev(e.created_at)).length;
  const blkCur = blocked.filter((e) => inCur(e.created_at)).length;
  const blkPrev = blocked.filter((e) => inPrev(e.created_at)).length;
  const incCur = incRows.filter((i) => inCur(i.opened_at || i.created_at)).length;
  const incPrev = incRows.filter((i) => inPrev(i.opened_at || i.created_at)).length;
  const latCur = Math.round(avgLatencyMs(props.filter((p) => p.operator && inCur(p.operator.at))) / 60000);
  const latPrev = Math.round(avgLatencyMs(props.filter((p) => p.operator && inPrev(p.operator.at))) / 60000);

  const metrics = [
    trend("approval_backlog", escCur, escPrev, true),
    trend("governed_refusals", refCur, refPrev, true),
    trend("policy_violations", blkCur, blkPrev, true),
    trend("incidents_opened", incCur, incPrev, true),
    trend("approval_latency_min", latCur, latPrev, true),
    trend("executions", exeCur, exePrev, false),
  ];

  // Customer health deltas from intelligence snapshots (latest vs prior per org).
  const byOrg = {};
  for (const s of snaps) (byOrg[s.org_id] = byOrg[s.org_id] || []).push(s);
  const health_deltas = [];
  for (const [org_id, list] of Object.entries(byOrg)) {
    if (list.length < 2) continue;
    list.sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at)));
    const d = (list[0].health || 0) - (list[1].health || 0);
    if (d !== 0) health_deltas.push({ org_id, delta: d, current: list[0].health, prior: list[1].health });
  }
  health_deltas.sort((a, b) => a.delta - b.delta); // worst decline first

  // Human "what changed" lines — only the material, worsening movements.
  const LABEL = {
    approval_backlog: "approval backlog", governed_refusals: "governed security refusals",
    policy_violations: "blocked (policy violations)", incidents_opened: "incidents opened",
    approval_latency_min: "approval latency (min)", executions: "governed executions",
  };
  const since = metrics.filter((m) => m.worsening && m.delta !== 0)
    .map((m) => `${LABEL[m.name]} ${m.direction} ${m.delta > 0 ? "+" : ""}${m.delta} vs prior period`);
  for (const h of health_deltas.filter((h) => h.delta <= -5).slice(0, 3)) {
    since.push(`customer health fell ${h.delta} (to ${h.current}) — drifting toward risk`);
  }

  return { window_days: windowDays, generated_at: store.nowISO(), metrics, health_deltas, since_yesterday: since };
}

module.exports = { trends, trend };

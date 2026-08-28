/* ============================================================================
 * Runtime Governance — operator overview aggregation (executive dashboard).
 *
 * Platform-wide KPIs + per-customer summary badges, assembled from the existing
 * store/metrics/reports/deliverables/alerts layers. Read-only. Engine untouched.
 * ============================================================================ */
"use strict";
const store = require("./store");
const metrics = require("./metrics");
const engine = require("./engine");
const lifecycle = require("./lifecycle");

const maxAt = (rows, ...fields) => {
  let best = null;
  for (const r of rows) for (const f of fields) { const v = r[f]; if (v && (!best || String(v) > best)) best = String(v); }
  return best;
};

// Platform-wide totals for the operator overview tab.
async function platform({ include_engine_health = true } = {}) {
  // Start every independent read together. The old sequence performed the org,
  // environment, metric, evidence and engine reads one after another, making a
  // cold Control Room pay the sum of all remote latencies.
  const orgsPromise = store.find("orgs", {});
  const summaryPromise = metrics.summary({});
  const packsPromise = store.find("audit_packs", {}).catch(() => []);
  const reportsPromise = store.find("reports", {}).catch(() => []);
  const alertsPromise = store.find("alerts", {}).catch(() => []);
  const lastPromise = store.queryDecisions({ limit: 1 }).catch(() => []);
  const enginePromise = include_engine_health ? engine.health() : Promise.resolve(null);
  const orgs = await orgsPromise;
  // Keep each query tenant-scoped so PostgREST's per-request row ceiling cannot
  // silently truncate a large platform-wide environment list.
  const environmentsPromise = Promise.all(orgs.map((org) => store.find("environments", { org_id: org.id })));
  const [environmentGroups, s, packs, reps, al, last, eng] = await Promise.all([
    environmentsPromise,
    summaryPromise,
    packsPromise,
    reportsPromise,
    alertsPromise,
    lastPromise,
    enginePromise,
  ]);
  const envs = environmentGroups.flat();
  const dayAgo = Date.now() - 86400000;

  // Audit evidence is DELIBERATELY separate from live runtime telemetry: the
  // audit pipeline (delivery-kit → publish) writes audit_packs + deliverables
  // only, never rg_decisions. So we surface the latest pack's own run-summary
  // stats here rather than merging its replayed trajectories into the live
  // evaluation counts (which would double-count / pollute production telemetry).
  const latestPack = packs
    .filter((p) => p && p.summary && p.summary.metrics)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  let audit_evidence = null;
  if (latestPack) {
    const m = latestPack.summary.metrics || {};
    const rp = latestPack.summary.replay || {};
    const trajectories = Number(m.total || 0);
    const replayChecked = Number(rp.checked || 0);
    audit_evidence = {
      pack_id: latestPack.id,
      name: latestPack.name || null,
      generated_at: latestPack.created_at || null,
      trajectories,
      evaluations_incl_replay: trajectories + replayChecked,
      allow: Number(m.allow || 0),
      blocked: Number(m.block || 0),
      escalated: Number(m.escalate || 0),
      replay: replayChecked ? `${Number(rp.deterministic || 0)}/${replayChecked}` : null,
      replay_deterministic: replayChecked > 0 && Number(rp.deterministic || 0) === replayChecked,
      source: (m.source === "engine" ? "live-engine" : m.source) || null,
    };
  }

  return {
    last_activity: last.length ? last[0].created_at : null,
    audit_evidence,
    customers: orgs.length,
    environments: envs.length,
    production_active: envs.filter((e) => e.kind === "production" && (e.status || "active") === "active").length,
    shadow: envs.filter((e) => e.mode === "shadow").length,
    enforce: envs.filter((e) => e.mode === "enforce").length,
    evaluations: s.total || 0,
    blocked: (s.engine_verdicts && s.engine_verdicts.BLOCK) || (s.verdicts && s.verdicts.BLOCK) || 0,
    avg_latency_ms: s.latency && s.latency.engine_compute_ms ? s.latency.engine_compute_ms.mean : null,
    reports: reps.length,
    audit_packs: packs.length,
    active_alerts: al.filter((a) => Date.parse(a.created_at) > dayAgo).length,
    engine_reachable: eng ? eng.ok : null,
    engine_commit: eng && eng.ok && eng.json ? eng.json.engine_commit : null,
  };
}

// Summary badges for one customer (org). `envs` may be passed to avoid a re-query.
async function customerBadges(org, envs) {
  envs = envs || await store.find("environments", { org_id: org.id });
  const [s, reps, packs, al, decs] = await Promise.all([
    metrics.summary({ org_id: org.id }),
    store.find("reports", { org_id: org.id }).catch(() => []),
    store.find("audit_packs", { org_id: org.id }).catch(() => []),
    store.find("alerts", { org_id: org.id }).catch(() => []),
    store.queryDecisions({ org_id: org.id, limit: 1 }),
  ]);
  const modes = [...new Set(envs.map((e) => e.mode))];
  const enterprise_ready = envs.some((e) => e.kind === "production" && e.mode === "enforce") || packs.length > 0;
  // 7-day daily decision-volume series for a per-customer sparkline.
  const spark = (await metrics.trends({ org_id: org.id, since: new Date(Date.now() - 7 * 86400000).toISOString(), bucket: "day" }).catch(() => [])).map((t) => t.total || 0);
  return {
    modes,
    enterprise_ready,
    spark,
    evaluations: s.total || 0,
    blocked: (s.engine_verdicts && s.engine_verdicts.BLOCK) || 0,
    escalated: (s.engine_verdicts && s.engine_verdicts.ESCALATE) || 0,
    engine_unavailable: (s.engine_verdicts && s.engine_verdicts.ENGINE_UNAVAILABLE) || 0,
    last_report: maxAt(reps, "generated_at", "created_at"),
    last_audit_pack: maxAt(packs, "created_at"),
    last_alert: maxAt(al, "created_at"),
    last_activity: decs.length ? decs[0].created_at : null,
    runtime_version: decs.length ? decs[0].engine_commit || null : null,
  };
}

// Every customer with environments + badges (the Customers + Overview tabs).
async function customers() {
  // Archived customers are hidden from the active list (restored via the
  // archive controls). See lib/runtime/customeradmin.js.
  const orgs = (await store.find("orgs", {})).filter((o) => o.status !== "archived");
  // Organisations are independent. Running these serially made total latency
  // grow roughly linearly with the customer count.
  const out = await Promise.all(orgs.map(async (org) => {
    const envs = await store.find("environments", { org_id: org.id });
    const badges = await customerBadges(org, envs);
    const lc = await lifecycle.compute(org, envs, badges).catch(() => null);
    return { ...org, environments: envs, badges, lifecycle: lc };
  }));
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

module.exports = { platform, customerBadges, customers };

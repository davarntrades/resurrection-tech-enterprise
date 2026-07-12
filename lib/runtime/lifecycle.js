/* ============================================================================
 * Runtime Governance — customer lifecycle (operator guidance).
 *
 * Derives a customer's managed-service lifecycle ENTIRELY from live data — no
 * hard-coded workflow. Each stage is a boolean computed from real signals
 * (environments, ingest keys, evaluations, engine verdicts, reports, audit
 * packs, Evidence Hub, secure shares, recommendations, notification prefs,
 * engagement). The "Next operator action" is always the first incomplete stage,
 * so the Control Room tells the operator exactly what to do next.
 *
 * Read-only. Reuses existing modules; the engine is never touched.
 * ============================================================================ */
"use strict";
const store = require("./store");
const admin = require("./admin");
const hub = require("./hub");
const recommendations = require("./recommendations");
const notify = require("./notify");
const engagement = require("./engagement");

// Signals not already carried on `badges` (overview.customerBadges supplies
// evaluations / blocked / escalated / engine_unavailable / last_report /
// last_audit_pack). Everything here is live store state.
async function gather(org) {
  const [keys, hubRow, shares, recs, prefs, eng] = await Promise.all([
    admin.listApiKeys(org.id).catch(() => []),
    hub.hubForOrg(org.id).catch(() => null),
    store.find("shares", { org_id: org.id }).catch(() => []),
    recommendations.summary(org.id).catch(() => ({ total: 0, open: 0 })),
    notify.getPrefs(org.id).catch(() => ({ enabled: false, recipients: [] })),
    engagement.get(org.id).catch(() => ({ configured: false })),
  ]);
  const activeShares = (shares || []).filter((s) => !s.revoked && (!s.expires_at || Date.parse(s.expires_at) > Date.now()));
  return {
    ingest_keys: (keys || []).filter((k) => k.role === "ingest" && (k.status || "active") === "active").length,
    hub: hubRow ? { token: hubRow.token, accessed: hubRow.accessed || 0 } : null,
    shares: activeShares.length,
    recommendations_open: recs.open || 0,
    recommendations_total: recs.total || 0,
    alerts: !!(prefs.enabled && (prefs.recipients || []).length > 0),
    alert_recipients: (prefs.recipients || []).length,
    engagement: !!(eng.configured && (eng.next_review_date || (eng.contacts || []).length > 0 || (eng.notes || []).length > 0)),
    next_review_date: eng.next_review_date || null,
  };
}

// Map the first incomplete stage → a concrete operator action.
function actionFor(stage, ctx) {
  if (!stage) {
    return ctx.sig.next_review_date
      ? { key: "maintain", label: `Maintain — next review ${ctx.sig.next_review_date}`, detail: "All lifecycle stages complete." }
      : { key: "maintain", label: "Maintain engagement", detail: "All lifecycle stages complete." };
  }
  const risk = ctx.blocked + ctx.escalated;
  switch (stage.key) {
    case "onboarded":
      return !ctx.hasEnv
        ? { key: "provision", label: "Provision a production environment", detail: "This customer has no environment yet." }
        : { key: "credentials", label: "Copy / send ingest credentials", detail: "No active ingest key — the customer cannot send telemetry yet." };
    case "telemetry":
      return { key: "await_telemetry", label: "Send credentials & wait for first telemetry", detail: "Ingest key issued; no events received yet." };
    case "governance":
      return { key: "engine", label: "Check engine connectivity", detail: `Telemetry arriving but ${ctx.engineUnavail} event(s) reached an unavailable engine.` };
    case "evidence":
      return risk > 0
        ? { key: "review_risk", label: `Review ${risk} BLOCK/ESCALATE, then generate a report`, detail: `${ctx.blocked} blocked · ${ctx.escalated} escalated recorded.` }
        : { key: "generate_report", label: "Generate the first governance report", detail: "Telemetry is flowing — produce evidence." };
    case "audit":
      return { key: "generate_pack", label: "Generate an audit pack", detail: "Publish a customer-ready evidence pack." };
    case "hub":
      return { key: "publish_hub", label: "Publish the Evidence Hub link", detail: "Give the customer one durable, secure evidence link." };
    case "alerts":
      return { key: "configure_alerts", label: "Configure customer alerts", detail: "Opt the customer in to evidence / report notifications." };
    case "engagement":
      return { key: "schedule_review", label: "Schedule the first governance review", detail: "Set a next review date and customer contacts." };
    default:
      return { key: "review", label: "Review customer", detail: "" };
  }
}

// Pure derivation: (org, envs, badges, gathered signals) → lifecycle.
function derive(org, envs, badges, sig) {
  const b = badges || {};
  const evals = b.evaluations || 0;
  const engineUnavail = b.engine_unavailable || 0;
  const blocked = b.blocked || 0;
  const escalated = b.escalated || 0;
  const hasReports = !!b.last_report;
  const hasPacks = !!b.last_audit_pack;
  const hasEnv = (envs || []).length > 0;

  const stages = [
    { key: "onboarded",  label: "Onboarded",          done: hasEnv && sig.ingest_keys > 0 },
    { key: "telemetry",  label: "Telemetry active",   done: evals > 0 },
    { key: "governance", label: "Governance active",  done: (evals - engineUnavail) > 0 },
    { key: "evidence",   label: "Evidence available", done: hasReports },
    { key: "audit",      label: "Audit available",    done: hasPacks },
    { key: "hub",        label: "Evidence Hub ready",  done: !!sig.hub },
    { key: "alerts",     label: "Alerts configured",  done: sig.alerts },
    { key: "engagement", label: "Engagement active",  done: sig.engagement },
  ];

  const firstIncomplete = stages.find((s) => !s.done) || null;
  const lastDone = [...stages].reverse().find((s) => s.done) || null;
  const done_count = stages.filter((s) => s.done).length;

  const next_action = actionFor(firstIncomplete, { org, envs, badges: b, sig, blocked, escalated, hasEnv, evals, engineUnavail });
  const state = evals === 0
    ? (stages[0].done ? "Waiting for first telemetry" : "Onboarding")
    : (lastDone ? lastDone.label : "Onboarded");

  return {
    state,
    pre_telemetry: evals === 0,
    done_count,
    total_stages: stages.length,
    stages,
    next_action,
    signals: {
      evaluations: evals, blocked, escalated,
      reports: hasReports, audit_packs: hasPacks,
      hub_ready: !!sig.hub, hub_accessed: sig.hub ? sig.hub.accessed : 0,
      secure_shares: sig.shares,
      recommendations_open: sig.recommendations_open, recommendations_total: sig.recommendations_total,
      alerts: sig.alerts, alert_recipients: sig.alert_recipients,
      engagement: sig.engagement, next_review_date: sig.next_review_date,
      ingest_keys: sig.ingest_keys,
    },
  };
}

// Compute a customer's lifecycle from live data. `badges` should come from
// overview.customerBadges (reused to avoid re-querying decisions/metrics).
async function compute(org, envs, badges) {
  const sig = await gather(org);
  return derive(org, envs, badges || {}, sig);
}

module.exports = { compute, derive, gather, actionFor };

/* ============================================================================
 * Operations Agent — Customer Intelligence (Pillar 2, deterministic).
 *
 * Turns every organisation into a living operational object with explainable
 * scores computed ONLY from real records — no LLM, no fabrication. Each score
 * is 0..100, banded, and carries the exact component contributions + a formula
 * string, so the Control Room can show WHY a number is what it is (same
 * philosophy as the disclosed pilot-readiness rule in sources.js).
 *
 * Scores:
 *   engagement        stage ladder + contacts + review cadence + note recency
 *   pilot_readiness   stage + governance material + activity + integration
 *   runtime_risk      block/escalate/engine-unavailable mix (higher = riskier)
 *   health            composite of the above minus stall penalty
 *
 * Plus: integration status, last meeting, a deterministic next recommendation,
 * a coarse business-value band (for Pillar-1 impact ranking), and a merged
 * evidence timeline. Read-only; reuses lib/runtime + lib/ops modules.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const opsEvidence = require("./evidence");
const workflow = require("./workflow");

const DAY = 86400000;
const nowISO = () => new Date().toISOString();
const daysAgoISO = (d) => new Date(Date.now() - d * DAY).toISOString();
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const ageDays = (iso) => (iso ? (Date.now() - Date.parse(iso)) / DAY : Infinity);
const stallDays = () => (Number(process.env.OPS_STALL_DAYS) > 0 ? Number(process.env.OPS_STALL_DAYS) : 7);

const STAGE_LADDER = ["prospect", "audit", "enterprise_assessment", "limited_pilot", "enterprise_integration", "managed_service"];
const stageIdx = (s) => Math.max(0, STAGE_LADDER.indexOf(String(s)));

// A score is built by accumulating labelled components → { score, band, inputs, formula }.
function scored(components, bands, formula) {
  const inputs = components.filter(Boolean);
  const total = clamp(inputs.reduce((n, c) => n + c.points, 0));
  const band = bands.find((b) => total >= b.min)?.label ?? bands[bands.length - 1].label;
  return { score: total, band, inputs, formula };
}
const comp = (label, points, detail) => (points || points === 0 ? { label, points: Math.round(points), detail: detail || null } : null);

// ── Gather the per-org record set (never throws) ────────────────────────────
async function gather(org_id) {
  const [eng, envs, keys, m30, decisions, reports, packs, ev] = await Promise.all([
    rt.engagement.get(org_id).catch(() => null),
    rt.admin.listEnvironments(org_id).catch(() => []),
    rt.admin.listApiKeys(org_id).catch(() => []),
    rt.metrics.summary({ org_id, since: daysAgoISO(30) }).catch(() => null),
    rt.store.queryDecisions({ org_id, limit: 200 }).catch(() => []),
    rt.store.find("reports", { org_id }).catch(() => []),
    rt.store.find("audit_packs", { org_id }).catch(() => []),
    opsEvidence.search({ org_id, limit: 200 }).catch(() => []),
  ]);
  return { eng: eng || {}, envs: envs || [], keys: keys || [], m30, decisions: decisions || [], reports: reports || [], packs: packs || [], ev: ev || [] };
}

// ── Engagement score ────────────────────────────────────────────────────────
function engagementScore(g) {
  const e = g.eng;
  const idx = stageIdx(e.stage);
  const contacts = (e.contacts || []).length;
  const noteAge = Math.min(...(e.notes || []).map((n) => ageDays(n.at)), Infinity);
  const reviewOverdue = e.next_review_date ? Date.parse(e.next_review_date) < Date.now() : null;
  return scored([
    comp("engagement stage", (idx / (STAGE_LADDER.length - 1)) * 40, e.stage_label || e.stage || "prospect"),
    comp("named contacts", contacts ? 10 : 0, `${contacts} contact(s)`),
    comp("review cadence", reviewOverdue === true ? 0 : reviewOverdue === false ? 15 : 5, e.next_review_date ? `next review ${e.next_review_date}` : "no review scheduled"),
    comp("note recency", noteAge <= 14 ? 20 : noteAge <= 30 ? 12 : noteAge <= 60 ? 6 : 0, Number.isFinite(noteAge) ? `last note ${Math.round(noteAge)}d ago` : "no notes"),
    comp("engagement record", e.configured ? 15 : 0, e.configured ? "configured" : "not started"),
  ], [{ min: 70, label: "strong" }, { min: 40, label: "developing" }, { min: 0, label: "weak" }],
  "40·stageLadder + 10·hasContacts + reviewCadence(0/5/15) + noteRecency(0/6/12/20) + 15·configured");
}

// ── Pilot readiness score ───────────────────────────────────────────────────
function pilotReadinessScore(g, assessmentCompleted) {
  const idx = stageIdx(g.eng.stage);
  const hasMaterial = g.packs.length > 0 || g.reports.length > 0;
  const recentActivity = g.decisions.some((d) => ageDays(d.created_at || d.ts) <= 30);
  const ingest = (g.keys || []).filter((k) => k.role === "ingest" && (k.status || "active") === "active").length;
  return scored([
    comp("engagement stage", (Math.min(idx, 3) / 3) * 35, g.eng.stage_label || g.eng.stage),
    comp("governance material", hasMaterial ? 25 : 0, `${g.packs.length} pack(s) · ${g.reports.length} report(s)`),
    assessmentCompleted === null ? null : comp("assessment completed", assessmentCompleted ? 15 : 0, assessmentCompleted ? "yes" : "no"),
    comp("recent runtime activity", recentActivity ? 15 : 0, recentActivity ? "evaluations in last 30d" : "none in 30d"),
    comp("ingest integration", ingest ? 10 : 0, `${ingest} active ingest key(s)`),
  ], [{ min: 70, label: "ready" }, { min: 40, label: "emerging" }, { min: 0, label: "not_ready" }],
  "35·min(stage,pilot)/3 + 25·hasMaterial + 15·assessment + 15·recentActivity + 10·ingestKey");
}

// ── Runtime risk score (higher = riskier) ───────────────────────────────────
function runtimeRiskScore(g) {
  const m = g.m30;
  if (!m || !m.total) {
    return { score: 0, band: "insufficient_data", inputs: [comp("no runtime activity", 0, "no evaluations in 30d")], formula: "no data → neutral (band: insufficient_data)" };
  }
  const v = m.verdicts || {};
  const enforceBlocks = g.envs.some((e) => e.mode === "enforce") && (v.BLOCK || 0) > 0;
  const r = scored([
    comp("block rate", (v.block_pct || 0) / 100 * 40, `${v.BLOCK || 0}/${m.total} blocked (${v.block_pct || 0}%)`),
    comp("escalation rate", (v.escalate_pct || 0) / 100 * 20, `${v.ESCALATE || 0} escalated (${v.escalate_pct || 0}%)`),
    comp("engine availability", (v.ENGINE_UNAVAILABLE || 0) > 0 ? 25 : 0, `${v.ENGINE_UNAVAILABLE || 0} engine-unavailable`),
    comp("enforced blocks", enforceBlocks ? 15 : 0, enforceBlocks ? "blocks in enforce mode" : "n/a"),
  ], [{ min: 60, label: "high" }, { min: 25, label: "elevated" }, { min: 0, label: "low" }],
  "40·blockRate + 20·escalateRate + 25·engineUnavailable + 15·enforcedBlocks");
  return r;
}

// ── Composite health ────────────────────────────────────────────────────────
function healthScore(engagement, readiness, risk, stalled) {
  const base = 0.5 * engagement.score + 0.3 * readiness.score + 0.2 * (100 - risk.score);
  const penalty = stalled ? 15 : 0;
  const total = clamp(base - penalty);
  const band = total >= 70 ? "healthy" : total >= 45 ? "watch" : "at_risk";
  return {
    score: total, band,
    inputs: [
      comp("engagement", 0.5 * engagement.score, `0.5 × ${engagement.score}`),
      comp("pilot readiness", 0.3 * readiness.score, `0.3 × ${readiness.score}`),
      comp("inverse risk", 0.2 * (100 - risk.score), `0.2 × (100 − ${risk.score})`),
      stalled ? comp("stall penalty", -penalty, `no evaluation > ${stallDays()}d`) : null,
    ].filter(Boolean),
    formula: "0.5·engagement + 0.3·pilotReadiness + 0.2·(100−risk) − stallPenalty(15)",
  };
}

// ── Integration status ──────────────────────────────────────────────────────
function integrationStatus(g) {
  const active = g.envs.filter((e) => (e.status || "active") === "active");
  const enforce = active.some((e) => e.mode === "enforce");
  const ingest = (g.keys || []).filter((k) => k.role === "ingest" && (k.status || "active") === "active").length;
  const status = !active.length ? "not_started" : enforce ? "enforcing" : ingest ? "connected" : "shadow";
  return { status, environments: active.length, enforce, ingest_keys: ingest };
}

// ── Coarse business value band (for Pillar-1 impact ranking) ────────────────
function businessValue(g) {
  const idx = stageIdx(g.eng.stage);
  if (idx >= 4) return { band: "high", weight: 1.0, reason: "enterprise integration / managed service" };
  if (idx >= 3) return { band: "high", weight: 0.9, reason: "in pilot" };
  if (idx >= 2) return { band: "medium", weight: 0.6, reason: "enterprise assessment" };
  return { band: "emerging", weight: 0.35, reason: "early pipeline" };
}

// ── Deterministic next recommendation ───────────────────────────────────────
function nextRecommendation(g, readiness, stalled, healthBand) {
  const idx = stageIdx(g.eng.stage);
  const reviewOverdue = g.eng.next_review_date && Date.parse(g.eng.next_review_date) < Date.now();
  if (stalled) return { action: "re_engage", title: "Re-engage — journey stalled", proposal: { action_id: "create_recommendation", params: { org_id: g.eng.org_id, title: "Customer journey stalled — re-engage", severity: "medium" } } };
  if (readiness.band === "ready" && idx < 3) return { action: "promote_to_pilot", title: "Ready for pilot — propose promotion", proposal: { action_id: "promote_to_pilot", params: { org_id: g.eng.org_id } } };
  if (reviewOverdue) return { action: "schedule_review", title: "Review overdue — schedule", proposal: null };
  if (idx >= 2 && !g.reports.length) return { action: "generate_report", title: "Generate governance report", proposal: { action_id: "generate_report", params: { org_id: g.eng.org_id, period: "weekly" } } };
  // Health-aware default — never label an at-risk / watch customer "healthy".
  if (healthBand === "at_risk") {
    const early = idx <= 1;
    return { action: "engage", title: early ? "Early pipeline — start engagement" : "At risk — build engagement",
      proposal: { action_id: "create_recommendation", params: { org_id: g.eng.org_id, title: "Low health score — increase engagement", severity: "medium" } } };
  }
  if (healthBand === "watch") return { action: "monitor", title: "Watch — keep engagement warm", proposal: null };
  return { action: "monitor", title: "Healthy — continue monitoring", proposal: null };
}

// ── Evidence timeline (merged, newest first) ────────────────────────────────
function timeline(g, org_id, limit = 50) {
  const items = [];
  for (const e of g.ev) items.push({ at: e.created_at, kind: "governance_decision", detail: `${e.action_id} → ${e.verdict}${e.rule ? ` (${e.rule})` : ""}`, ref: e.id });
  for (const r of g.reports) items.push({ at: r.created_at, kind: "report", detail: `${r.period || "report"} generated`, ref: r.id });
  for (const p of g.packs) items.push({ at: p.created_at, kind: "audit_pack", detail: "audit pack published", ref: p.id });
  for (const n of g.eng.notes || []) items.push({ at: n.at, kind: "note", detail: n.text, ref: n.id });
  for (const d of g.decisions.slice(0, 40)) items.push({ at: d.created_at || d.ts, kind: "runtime_decision", detail: `${d.verdict}${d.rule ? ` · ${d.rule}` : ""}`, ref: d.trajectory_hash });
  return items.filter((i) => i.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

// Sales-schema assessment completion is Supabase-gated; null when unavailable
// so pilot readiness neither credits nor penalises for a missing source.
async function assessmentCompleted(org_id, orgName) {
  try {
    const sources = require("./sources");
    const db = sources.salesDb && sources.salesDb();
    if (!db) return null;
    const { data } = await db.from("assessments").select("reference").ilike("company", `%${orgName || ""}%`).limit(1);
    return Array.isArray(data) ? data.length > 0 : null;
  } catch { return null; }
}

/** Full intelligence profile for one org. `withTimeline` adds the merged timeline. */
async function profile(org, { withTimeline = false } = {}) {
  const org_id = org.id || org.org_id;
  const g = await gather(org_id);
  g.eng.org_id = g.eng.org_id || org_id;
  const lastEval = g.decisions[0] ? (g.decisions[0].created_at || g.decisions[0].ts) : null;
  const stalled = lastEval ? ageDays(lastEval) > stallDays() : ageDays(org.created_at) > stallDays();

  const engagement = engagementScore(g);
  const asmDone = await assessmentCompleted(org_id, org.name);
  const readiness = pilotReadinessScore(g, asmDone);
  const risk = runtimeRiskScore(g);
  const health = healthScore(engagement, readiness, risk, stalled);
  const integration = integrationStatus(g);
  const value = businessValue(g);
  const next = nextRecommendation(g, readiness, stalled, health.band);
  const lastNote = (g.eng.notes || [])[0] || null;
  const lifecycle = workflow.deriveFrom(g); // no extra queries — reuses gathered records

  return {
    org_id, name: org.name || org_id, plan: org.plan || null, created_at: org.created_at,
    stage: g.eng.stage || "prospect", stage_label: g.eng.stage_label || "Prospect",
    lifecycle_stage: lifecycle.stage, lifecycle_label: lifecycle.label,
    scores: { health, engagement, pilot_readiness: readiness, runtime_risk: risk },
    integration_status: integration,
    business_value: value,
    last_meeting: g.eng.last_review_date || (lastNote ? lastNote.at : null),
    next_review_date: g.eng.next_review_date || null,
    last_evaluation: lastEval,
    stalled,
    next_recommendation: next,
    counts: { reports: g.reports.length, audit_packs: g.packs.length, decisions_200: g.decisions.length, governance_decisions: g.ev.length, contacts: (g.eng.contacts || []).length },
    ...(withTimeline ? { timeline: timeline(g, org_id) } : {}),
    generated_at: nowISO(),
  };
}

/** Intelligence for every org (no timelines — lighter). Sorted by health asc
 *  (most-at-risk first) so the operator sees who needs attention. */
async function list() {
  const orgs = await rt.store.find("orgs", {}).catch(() => []);
  const profiles = [];
  for (const org of orgs) profiles.push(await profile(org));
  profiles.sort((a, b) => a.scores.health.score - b.scores.health.score);
  return profiles;
}

/** One org with full timeline. */
async function detail(org_id) {
  const org = await rt.store.findOne("orgs", { id: org_id }).catch(() => null);
  if (!org) return null;
  return profile(org, { withTimeline: true });
}

module.exports = { profile, list, detail, timeline, STAGE_LADDER,
  // exported for tests / reuse
  engagementScore, pilotReadinessScore, runtimeRiskScore, healthScore, businessValue };

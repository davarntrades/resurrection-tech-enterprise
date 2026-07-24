/* ============================================================================
 * Guardian OS — Managed Governance (Phase 3).
 *
 * Provisioning stands an enterprise up (lib/ops/provisioning). Managed
 * Governance KEEPS it governed: an autonomous governance department that
 * continuously watches a provisioned enterprise and recommends action BEFORE
 * risk becomes an incident. The operator should never have to ask "is my
 * customer's AI safe today?" — Guardian OS already knows.
 *
 *   captureBaseline  the governed baseline a live enterprise is compared against
 *   monitor          one continuous pass: drift + health + recommendations
 *   detectDrift      today's enterprise vs its baseline → Governance Drift events
 *   health           the live governance health score (7 sub-scores + trend)
 *   recommend        governed improvement proposals, each already evidence-backed
 *   queue            the operator queue — only what genuinely needs a human
 *   briefingFor      daily / weekly / monthly executive governance briefing
 *   evidencePack     a customer-ready, content-signed evidence package
 *   overview         posture across every provisioned enterprise
 *
 * PRINCIPLES (never violated):
 *   · Observation only. Monitoring/drift/health/packs are READ-ONLY projections
 *     over records the platform already owns. Nothing here mutates the estate.
 *   · The agent proposes; the operator disposes. Every recommendation is a
 *     governed proposal (create_recommendation) — inert until an operator acts.
 *     Guardian OS never executes a privileged action to "fix" drift itself.
 *   · Deny-by-default & fail-closed are untouched — no kernel change, additive
 *     tables only. A missing baseline or a read error degrades to "unknown",
 *     never to "safe".
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const entities = require("./entities");
const entgraph = require("./entgraph");
const govpolicy = require("./govpolicy");
const proposals = require("./proposals");
const incidents = require("./incidents");
const evidence = require("./evidence");
const intelligence = require("./intelligence");
const risk = require("./risk");
const autonomy = require("./autonomy");
const events = require("./events");

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const band = (n) => (n >= 80 ? "strong" : n >= 60 ? "developing" : n >= 40 ? "watch" : "weak");
const DRIFT_SEV_WEIGHT = { critical: 20, warning: 8, info: 3 };

// ── The governed baseline ────────────────────────────────────────────────────
/** Fingerprint the current governed state so live drift can be measured. */
async function snapshotOf(org_id) {
  const [all, active, deps, twin] = await Promise.all([
    entities.forOrg(org_id),
    govpolicy.active({}).catch(() => []),
    store.find("enterprise_departments", { org_id }).catch(() => []),
    entgraph.build(org_id).catch(() => null),
  ]);
  const of = (kind) => all.filter((e) => e.kind === kind);
  const scoped = active.filter((p) => p.scope === org_id);
  const envs = of("environment").map((e) => e.name);
  const boundaryEnvNames = new Set();
  for (const b of all.filter((e) => e.kind === "trust_boundary")) for (const r of b.refs || []) {
    const t = all.find((e) => e.id === r);
    if (t && t.kind === "environment") boundaryEnvNames.add(t.name);
  }
  const auto = await autonomy.current().catch(() => null);
  return {
    ai_systems: of("ai_system").map((e) => e.name),
    mcp_servers: of("mcp_server").map((e) => e.name),
    tools: of("tool").map((e) => ({ name: e.name, privileged: !!(e.attrs && e.attrs.privileged) })),
    controls: [...of("protected_asset"), ...of("critical_system"), ...of("trust_boundary"), ...of("risk_zone")].map((e) => `${e.kind}:${e.name}`),
    policies: scoped.map((p) => p.name),
    departments: deps.filter((d) => d.enabled).map((d) => d.department),
    environments: envs,
    boundary_envs: [...boundaryEnvNames],
    autonomy_mode: auto ? auto.mode : null,
    autonomy_level: auto ? autonomy.level(auto.mode) : 0,
    twin_counts: twin ? twin.counts : null,
  };
}

async function captureBaseline(org_id, { actor = "operator" } = {}) {
  if (!org_id) return null;
  const prior = await baseline(org_id);
  const snapshot = await snapshotOf(org_id);
  const row = await store.insert("governance_baselines", {
    org_id, version: (prior ? prior.version : 0) + 1, snapshot, captured_by: actor,
  });
  await rt.adminaudit.record({ action: "governance_baseline_captured", actor, via: "ops", target: org_id, meta: { version: row.version } }).catch(() => {});
  await events.emit("governance.baseline_captured", { org_id, version: row.version }, { org_id });
  return { id: row.id, org_id, version: row.version, snapshot, created_at: row.created_at };
}

async function baseline(org_id) {
  const rows = await store.find("governance_baselines", { org_id }).catch(() => []);
  rows.sort((a, b) => (b.version || 0) - (a.version || 0) || String(b.created_at).localeCompare(String(a.created_at)));
  return rows[0] || null;
}

// ── Governance drift ─────────────────────────────────────────────────────────
function diffDrift(base, live) {
  const out = [];
  const add = (kind, subject, detail, severity) => out.push({ kind, subject, detail, severity, fingerprint: `${kind}:${subject}` });
  const baseSys = new Set(base.ai_systems || []);
  const baseMcp = new Set(base.mcp_servers || []);
  const baseTool = new Map((base.tools || []).map((t) => [t.name, t]));
  const baseControls = new Set(base.controls || []);
  const basePolicies = new Set(base.policies || []);
  const baseDepts = new Set(base.departments || []);
  const boundaryEnvs = new Set(base.boundary_envs || []);

  for (const s of live.ai_systems || []) if (!baseSys.has(s)) add("new_ai_system", s, `AI system "${s}" appeared after the governed baseline`, "warning");
  for (const m of live.mcp_servers || []) if (!baseMcp.has(m)) add("new_mcp_server", m, `MCP server "${m}" was added outside provisioning`, "warning");
  for (const t of live.tools || []) {
    const b = baseTool.get(t.name);
    if (!b) add("new_tool", t.name, `Tool "${t.name}" appeared after the baseline${t.privileged ? " and is privileged" : ""}`, t.privileged ? "critical" : "warning");
    else if (t.privileged && !b.privileged) add("permission_change", t.name, `Tool "${t.name}" was elevated to privileged`, "critical");
  }
  for (const c of base.controls || []) if (!new Set(live.controls || []).has(c)) add("removed_control", c, `Control "${c}" present at baseline is now missing`, "critical");
  for (const p of base.policies || []) if (!new Set(live.policies || []).has(p)) add("disabled_policy", p, `Governance policy "${p}" is no longer active`, "critical");
  for (const d of base.departments || []) if (!new Set(live.departments || []).has(d)) add("removed_control", `department:${d}`, `Governance department "${d}" was disabled`, "warning");
  if ((live.autonomy_level || 0) > (base.autonomy_level || 0)) add("unexpected_autonomy", live.autonomy_mode || "raised", `Autonomy raised to "${live.autonomy_mode}" above the governed baseline "${base.autonomy_mode}"`, "critical");
  // Trust-boundary violation: a new AI system running in an environment no
  // declared trust boundary covers (only meaningful once boundaries exist).
  if (boundaryEnvs.size) for (const s of live.ai_systems || []) {
    if (baseSys.has(s)) continue;
    const env = (live.system_envs && live.system_envs[s]) || null;
    if (env && !boundaryEnvs.has(env)) add("trust_boundary_violation", s, `AI system "${s}" runs in "${env}", outside any declared trust boundary`, "critical");
  }
  return out;
}

/** Compare live enterprise vs its baseline; persist NEW drift as evidence. */
async function detectDrift(org_id, { actor = "guardian_os" } = {}) {
  if (!org_id) return { available: false, reason: "no org", open: [], detected: [] };
  const base = await baseline(org_id);
  if (!base) return { available: false, reason: "no governed baseline captured yet", open: [], detected: [] };

  const live = await snapshotOf(org_id);
  // map ai_system → environment for the boundary check
  const all = await entities.forOrg(org_id);
  const byId = Object.fromEntries(all.map((e) => [e.id, e]));
  live.system_envs = {};
  for (const s of all.filter((e) => e.kind === "ai_system")) {
    const env = (s.refs || []).map((r) => byId[r]).find((e) => e && e.kind === "environment");
    if (env) live.system_envs[s.name] = env.name;
  }

  const found = diffDrift(base.snapshot || {}, live);
  const existing = await store.find("governance_drift", { org_id }).catch(() => []);
  const openFp = new Set(existing.filter((d) => d.status !== "resolved").map((d) => d.fingerprint));
  const detected = [];
  for (const d of found) {
    if (openFp.has(d.fingerprint)) continue; // already tracked
    const ev = await evidence.record({
      action_id: "governance_drift", org_id, actor,
      policy: "managed_governance", risk: d.severity === "critical" ? "high" : "medium",
      verdict: "escalate", reason: d.detail, rule: d.kind,
    }).catch(() => null);
    const row = await store.insert("governance_drift", {
      org_id, kind: d.kind, subject: d.subject, detail: d.detail, severity: d.severity,
      status: "open", fingerprint: d.fingerprint, evidence_id: ev ? ev.id : null,
      detected_at: store.nowISO(), updated_at: store.nowISO(),
    });
    await events.emit("governance.drift_detected", { org_id, kind: d.kind, subject: d.subject, severity: d.severity }, { org_id });
    detected.push(shapeDrift(row));
  }
  const open = (await store.find("governance_drift", { org_id })).filter((d) => d.status !== "resolved").map(shapeDrift);
  return { available: true, baseline_version: base.version, detected, open, score: driftScore(open) };
}

function driftScore(open) {
  const penalty = open.reduce((n, d) => n + (DRIFT_SEV_WEIGHT[d.severity] || 3), 0);
  return clamp(100 - penalty);
}
function shapeDrift(d) {
  return { id: d.id, org_id: d.org_id, kind: d.kind, subject: d.subject, detail: d.detail, severity: d.severity, status: d.status, evidence_id: d.evidence_id || null, detected_at: d.detected_at || d.created_at };
}
async function ackDrift(id, { actor = "operator", status = "acknowledged" } = {}) {
  await store.update("governance_drift", id, { status, updated_at: store.nowISO() });
  await rt.adminaudit.record({ action: "governance_drift_reviewed", actor, via: "ops", target: id, meta: { status } }).catch(() => {});
  return shapeDrift(await store.findOne("governance_drift", { id }));
}

// ── Governance health score (7 sub-scores + trend) ───────────────────────────
async function health(org_id, { persist = false } = {}) {
  if (!org_id) return null;
  const [all, active, deps, detail, openInc, driftRows, prov, evSum, trend] = await Promise.all([
    entities.forOrg(org_id),
    govpolicy.active({}).catch(() => []),
    store.find("enterprise_departments", { org_id }).catch(() => []),
    intelligence.detail(org_id).catch(() => null),
    incidents.list({ status: "open", org_id, limit: 100 }).catch(() => []),
    store.find("governance_drift", { org_id }).catch(() => []),
    store.findOne("provisioning", { org_id }).catch(() => null),
    evidence.summary({ org_id }).catch(() => ({ total: 0, executed: 0 })),
    risk.trends({ windowDays: 7 }).catch(() => null),
  ]);
  const scoped = active.filter((p) => p.scope === org_id);
  const privileged = all.filter((e) => e.kind === "tool" && e.attrs && e.attrs.privileged);
  const openDrift = driftRows.filter((d) => d.status !== "resolved").map(shapeDrift);
  const enabledDeps = deps.filter((d) => d.enabled).length;

  // 1. Governance maturity — is the enterprise installed & staffed & governed.
  const maturity = clamp(
    (prov && prov.status === "complete" ? 40 : 0) +
    Math.min(30, enabledDeps * 4) +
    Math.min(30, scoped.length * 4));
  // 2. Policy coverage — every privileged tool should be governed by a policy.
  const coverage = privileged.length === 0 ? (scoped.length ? 100 : 70)
    : clamp((scoped.length / Math.max(privileged.length, 1)) * 100);
  // 3. Runtime health — inverse of measured runtime risk.
  const runtime = detail && detail.scores && detail.scores.runtime_risk
    ? clamp(100 - detail.scores.runtime_risk.score) : (openInc.length ? clamp(100 - openInc.length * 15) : 85);
  // 4. Approval responsiveness — how promptly escalations that NEED a human are
  // dispositioned. Only pending escalations count against it (auto-executed
  // low-risk work is not an approval backlog); a clean queue reads as fully
  // responsive rather than penalising a brand-new enterprise with no track record.
  const escalated = await proposals.list({ status: "escalated", org_id, limit: 200 }).catch(() => []);
  const responsiveness = clamp(100 - escalated.length * 15);
  // 5. Evidence completeness — is activity leaving an evidence trail.
  const completeness = evSum.total === 0 ? (prov ? 60 : 40) : clamp(60 + Math.min(40, evSum.total));
  // 6. Drift score.
  const drift = driftScore(openDrift);
  // 7. Overall governance confidence — weighted composite.
  const parts = [
    ["governance_maturity", maturity, 0.18],
    ["policy_coverage", coverage, 0.18],
    ["runtime_health", runtime, 0.18],
    ["approval_responsiveness", clamp(responsiveness), 0.12],
    ["evidence_completeness", completeness, 0.10],
    ["drift_score", drift, 0.24],
  ];
  const overall = clamp(parts.reduce((n, [, v, w]) => n + v * w, 0));
  const scores = Object.fromEntries(parts.map(([k, v]) => [k, { score: clamp(v), band: band(clamp(v)) }]));
  scores.overall = { score: overall, band: band(overall) };

  // Trend vs the last persisted snapshot.
  const priorSnap = (await store.find("governance_health", { org_id }).catch(() => [])).sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at)))[0];
  const delta = priorSnap && priorSnap.overall != null ? overall - priorSnap.overall : 0;
  const result = { org_id, overall, band: band(overall), scores, drift_open: openDrift.length, trend: { delta, direction: delta === 0 ? "flat" : delta > 0 ? "up" : "down", prior: priorSnap ? priorSnap.overall : null }, risk_trends: trend && trend.since_yesterday ? (trend.since_yesterday[0] || null) : null, generated_at: store.nowISO() };
  if (persist) {
    await store.insert("governance_health", { org_id, overall, band: result.band, scores, captured_at: store.nowISO() });
  }
  return result;
}

async function healthHistory(org_id, { limit = 30 } = {}) {
  const rows = await store.find("governance_health", { org_id }).catch(() => []);
  rows.sort((a, b) => String(a.captured_at).localeCompare(String(b.captured_at)));
  return rows.slice(-limit).map((r) => ({ overall: r.overall, band: r.band, captured_at: r.captured_at }));
}

// ── Recommendations engine (each already evidence-backed) ────────────────────
async function deriveRecommendations(org_id) {
  const [all, active, h, driftRes] = await Promise.all([
    entities.forOrg(org_id),
    govpolicy.active({}).catch(() => []),
    health(org_id),
    detectDrift(org_id).catch(() => ({ open: [] })),
  ]);
  const scoped = active.filter((p) => p.scope === org_id);
  const policyTools = new Set();
  for (const p of scoped) for (const t of ((p.spec && p.spec.match && p.spec.match.tools) || [])) policyTools.add(t);
  const recs = [];
  const rec = (title, detail, severity, evidence) => recs.push({ title, detail, severity, evidence });

  // Drift-driven recommendations.
  for (const d of driftRes.open || []) {
    if (d.kind === "disabled_policy") rec(`Re-activate governance policy: ${d.subject}`, d.detail, "critical", { drift_id: d.id, evidence_id: d.evidence_id });
    else if (d.kind === "new_tool" || d.kind === "permission_change") rec(`Create a runtime policy for tool: ${d.subject}`, `${d.detail} — govern it before it is used unsupervised.`, "critical", { drift_id: d.id, evidence_id: d.evidence_id });
    else if (d.kind === "unexpected_autonomy") rec(`Review autonomy raise: ${d.subject}`, d.detail, "critical", { drift_id: d.id, evidence_id: d.evidence_id });
    else if (d.kind === "trust_boundary_violation") rec(`Isolate ${d.subject} — outside declared trust boundary`, d.detail, "critical", { drift_id: d.id, evidence_id: d.evidence_id });
    else if (d.kind === "new_ai_system" || d.kind === "new_mcp_server") rec(`Bring ${d.subject} under governance`, d.detail, "warning", { drift_id: d.id, evidence_id: d.evidence_id });
  }
  // Privileged tools without a governing policy.
  for (const t of all.filter((e) => e.kind === "tool" && e.attrs && e.attrs.privileged)) {
    if (!policyTools.has(t.name)) rec(`Require human approval for privileged tool: ${t.name}`, `Privileged tool "${t.name}" has no active runtime policy governing it.`, "critical", { entity_id: t.id });
  }
  // Unused tools (declared but referenced by no agent) → archive.
  const referenced = new Set(all.flatMap((e) => e.refs || []));
  for (const t of all.filter((e) => e.kind === "tool")) if (!referenced.has(t.id)) rec(`Archive unused tool: ${t.name}`, `Tool "${t.name}" is not referenced by any agent — reduce attack surface.`, "info", { entity_id: t.id });
  // Score-driven recommendations.
  if (h && h.scores.approval_responsiveness.score < 60) rec("Tighten the approval workflow", "Approval responsiveness is low — escalations are accumulating without disposition. Consider requiring faster human sign-off or narrowing what auto-executes.", "warning", { score: h.scores.approval_responsiveness.score });
  if (h && h.scores.policy_coverage.score < 60) rec("Increase policy coverage", "Policy coverage is below target — some privileged capability is ungoverned. Add runtime policies for the uncovered tools.", "warning", { score: h.scores.policy_coverage.score });
  if (h && h.scores.runtime_health.score < 50) rec("Increase monitoring frequency for at-risk runtime", "Runtime health is degraded — raise monitoring cadence and review recent blocked/escalated activity.", "warning", { score: h.scores.runtime_health.score });
  return recs;
}

/** Turn derived recommendations into GOVERNED proposals (inert until approved).
 *  Dedupes against open recommendations so a daily pass doesn't pile up. */
async function recommend(org_id, { actor = "guardian_os", apply = true } = {}) {
  const derived = await deriveRecommendations(org_id);
  if (!apply) return { proposed: 0, recommendations: derived };
  const openRecs = await rt.recommendations.list({ org_id, openOnly: true }).catch(() => []);
  const openTitles = new Set(openRecs.map((r) => r.title));
  const proposed = [];
  for (const r of derived) {
    if (openTitles.has(r.title)) continue;
    const p = await proposals.propose({
      action_id: "create_recommendation",
      params: { org_id, title: r.title, detail: r.detail, severity: r.severity, source: "managed_governance" },
      org_id, source: "managed_governance",
      reasoning: { reason: r.detail, evidence: r.evidence },
    }).catch(() => null);
    if (p) proposed.push({ title: r.title, severity: r.severity, status: p.status });
  }
  return { proposed: proposed.length, recommendations: proposed, derived: derived.length };
}

// ── The operator queue — only what genuinely needs a human ───────────────────
async function queue(org_id) {
  if (!org_id) return { items: [], count: 0 };
  const [escalated, openInc, driftRows, openRecs] = await Promise.all([
    proposals.list({ status: "escalated", org_id, limit: 50 }).catch(() => []),
    incidents.list({ status: "open", org_id, limit: 50 }).catch(() => []),
    store.find("governance_drift", { org_id }).catch(() => []),
    rt.recommendations.list({ org_id, openOnly: true }).catch(() => []),
  ]);
  const items = [];
  for (const p of escalated) items.push({ type: "approval", severity: p.risk === "critical" ? "critical" : "warning", title: `Approve: ${p.action_id}`, detail: (p.reasoning && p.reasoning.reason) || null, ref: `/admin/operations?view=approvals`, id: p.id });
  for (const d of driftRows.filter((x) => x.status === "open")) items.push({ type: "drift", severity: d.severity, title: `Review drift: ${d.subject}`, detail: d.detail, ref: `/admin/operations?view=governance&org=${org_id}`, id: d.id });
  for (const i of openInc) items.push({ type: "incident", severity: i.severity === "critical" ? "critical" : "warning", title: `Investigate: ${i.summary || i.kind}`, detail: null, ref: `/admin/operations?view=blocked`, id: i.id });
  for (const r of openRecs) items.push({ type: "recommendation", severity: r.severity === "critical" ? "critical" : "info", title: `Accept: ${r.title}`, detail: r.detail, ref: `/admin/operations?view=governance&org=${org_id}`, id: r.id });
  const rank = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
  return { items, count: items.length, by_type: items.reduce((m, i) => ((m[i.type] = (m[i.type] || 0) + 1), m), {}) };
}

// ── One continuous monitoring pass ───────────────────────────────────────────
async function monitor(org_id, { actor = "guardian_os", recommend: doRecommend = true } = {}) {
  if (!org_id) return { ok: false, error: "no org" };
  // Ensure a baseline exists (first monitor after provisioning captures one).
  let base = await baseline(org_id);
  if (!base) base = await captureBaseline(org_id, { actor });
  const drift = await detectDrift(org_id, { actor });
  const h = await health(org_id, { persist: true });
  const rec = doRecommend ? await recommend(org_id, { actor }) : { proposed: 0 };
  const q = await queue(org_id);
  await rt.adminaudit.record({ action: "governance_monitored", actor, via: "ops", target: org_id, meta: { drift: drift.detected.length, health: h ? h.overall : null, recommended: rec.proposed } }).catch(() => {});
  await events.emit("governance.monitored", { org_id, drift_detected: drift.detected.length, health: h ? h.overall : null, recommended: rec.proposed }, { org_id });
  return { ok: true, org_id, generated_at: store.nowISO(), drift: { detected: drift.detected.length, open: drift.open.length, score: drift.score }, health: h ? { overall: h.overall, band: h.band, trend: h.trend } : null, recommended: rec.proposed, queue: q.count };
}

/** Monitor every provisioned enterprise (the cron entrypoint). */
async function monitorAll({ actor = "guardian_os_cron" } = {}) {
  const runs = await store.find("provisioning", {}).catch(() => []);
  const orgs = [...new Set(runs.filter((r) => r.status === "complete" && r.org_id).map((r) => r.org_id))];
  const results = [];
  for (const org_id of orgs) results.push(await monitor(org_id, { actor }).catch((e) => ({ ok: false, org_id, error: e.message })));
  return { orgs: orgs.length, results };
}

// ── Executive briefings (daily / weekly / monthly) ───────────────────────────
const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30 };
async function briefingFor(org_id, { period = "daily" } = {}) {
  if (!org_id) return null;
  const days = PERIOD_DAYS[period] || 1;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [org, h, driftRows, ev, escalated, trends] = await Promise.all([
    store.findOne("orgs", { id: org_id }).catch(() => null),
    health(org_id),
    store.find("governance_drift", { org_id }).catch(() => []),
    evidence.search({ org_id, since, limit: 500 }).catch(() => []),
    proposals.list({ status: "escalated", org_id, limit: 50 }).catch(() => []),
    risk.trends({ windowDays: days }).catch(() => null),
  ]);
  const newDrift = driftRows.filter((d) => String(d.detected_at || d.created_at) >= since).map(shapeDrift);
  const blocked = ev.filter((e) => e.verdict === "block");
  const triggered = ev.filter((e) => e.verdict !== "allow");
  return {
    org_id, name: org ? org.name : org_id, period, generated_at: store.nowISO(), window_since: since,
    health: h ? { overall: h.overall, band: h.band, trend: h.trend } : null,
    what_changed: newDrift.map((d) => `${d.kind.replace(/_/g, " ")}: ${d.subject}`).slice(0, 10),
    risks_increased: trends && trends.metrics ? trends.metrics.filter((m) => m.worsening && m.delta !== 0).map((m) => `${m.name.replace(/_/g, " ")} ${m.direction} (${m.delta > 0 ? "+" : ""}${m.delta})`).slice(0, 6) : [],
    policies_triggered: triggered.length,
    what_was_blocked: blocked.slice(0, 8).map((b) => ({ action: b.action_id, reason: b.reason })),
    approve_next: escalated.slice(0, 8).map((p) => ({ action: p.action_id, reason: (p.reasoning && p.reasoning.reason) || null })),
    emerging_trends: trends && trends.since_yesterday ? trends.since_yesterday.slice(0, 3) : [],
    counts: { new_drift: newDrift.length, blocked: blocked.length, triggered: triggered.length, awaiting_approval: escalated.length },
  };
}

// ── Monthly evidence pack (customer-ready, content-signed) ───────────────────
async function evidencePack(org_id, { period = null, actor = "operator", persist = true } = {}) {
  if (!org_id) return null;
  const per = period || new Date().toISOString().slice(0, 7); // YYYY-MM
  const [org, h, driftRows, evSum, blocked, deps, active, entSum, brief, hist] = await Promise.all([
    store.findOne("orgs", { id: org_id }).catch(() => null),
    health(org_id),
    store.find("governance_drift", { org_id }).catch(() => []),
    evidence.summary({ org_id }).catch(() => ({ total: 0, by_verdict: {}, blocked_24h: 0 })),
    evidence.search({ org_id, verdict: "block", limit: 100 }).catch(() => []),
    store.find("enterprise_departments", { org_id }).catch(() => []),
    govpolicy.active({}).catch(() => []),
    entities.summary(org_id).catch(() => null),
    briefingFor(org_id, { period: "monthly" }).catch(() => null),
    healthHistory(org_id, { limit: 12 }).catch(() => []),
  ]);
  const scoped = active.filter((p) => p.scope === org_id);
  const openDrift = driftRows.filter((d) => d.status !== "resolved").map(shapeDrift);
  const payload = {
    enterprise: org ? org.name : org_id, org_id, period: per, generated_at: store.nowISO(), generated_by: actor,
    governance_posture: h ? { overall: h.overall, band: h.band, scores: h.scores } : null,
    runtime_activity: evSum,
    policies_enforced: { active: scoped.length, names: scoped.map((p) => p.name) },
    blocked_actions: blocked.map((b) => ({ action: b.action_id, reason: b.reason, at: b.created_at })),
    executive_summary: brief ? { what_changed: brief.what_changed, risks_increased: brief.risks_increased, approve_next: brief.approve_next } : null,
    audit_trail: (await rt.adminaudit.list({ limit: 50 }).catch(() => [])).filter((a) => a.target === org_id).slice(0, 50),
    compliance_evidence: { departments: deps.filter((d) => d.enabled).map((d) => d.department), estate: entSum, fail_closed: true },
    risk_trend: { drift_open: openDrift.length, drift_score: driftScore(openDrift), health_history: hist },
    recommendations: (await rt.recommendations.list({ org_id, openOnly: true }).catch(() => [])).map((r) => ({ title: r.title, severity: r.severity })),
  };
  const hash = store.sha256(JSON.stringify(payload));
  let id = null;
  if (persist) {
    const row = await store.insert("evidence_packs", { org_id, period: per, payload, hash, created_by: actor });
    id = row.id;
    await rt.adminaudit.record({ action: "evidence_pack_generated", actor, via: "ops", target: org_id, meta: { period: per, hash } }).catch(() => {});
    await events.emit("governance.evidence_pack", { org_id, period: per, hash }, { org_id });
  }
  return { id, hash, ...payload };
}

async function listPacks(org_id, { limit = 24 } = {}) {
  const rows = await store.find("evidence_packs", { org_id }).catch(() => []);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, limit).map((r) => ({ id: r.id, period: r.period, hash: r.hash, created_by: r.created_by, created_at: r.created_at }));
}

// ── Posture across every provisioned enterprise (the department landing) ─────
async function overview() {
  const runs = await store.find("provisioning", {}).catch(() => []);
  const orgs = [...new Set(runs.filter((r) => r.status === "complete" && r.org_id).map((r) => r.org_id))];
  const enterprises = [];
  let queued = 0, driftOpen = 0;
  for (const org_id of orgs) {
    const [h, q, base] = await Promise.all([health(org_id), queue(org_id), baseline(org_id)]);
    queued += q.count;
    const dOpen = h ? h.drift_open : 0; driftOpen += dOpen;
    const run = runs.find((r) => r.org_id === org_id);
    enterprises.push({ org_id, name: run ? run.name : org_id, health: h ? { overall: h.overall, band: h.band, trend: h.trend.direction } : null, drift_open: dOpen, queue: q.count, baseline_version: base ? base.version : null });
  }
  enterprises.sort((a, b) => (a.health ? a.health.overall : 101) - (b.health ? b.health.overall : 101));
  return { generated_at: store.nowISO(), enterprises: enterprises.length, watching: enterprises.length, queue_total: queued, drift_open_total: driftOpen, list: enterprises };
}

module.exports = {
  captureBaseline, baseline, snapshotOf,
  detectDrift, ackDrift, driftScore,
  health, healthHistory,
  deriveRecommendations, recommend,
  queue, monitor, monitorAll,
  briefingFor, evidencePack, listPacks, overview,
};

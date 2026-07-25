/* ============================================================================
 * Guardian OS — the Sovereign Intelligence Pack projector (Phase 7).
 *
 * THE ARCHITECTURAL POINT OF THIS FILE: the seven Sovereign Intelligence Packs
 * contain NO CODE. Not "no runtime code" as a policy that reviewers have to
 * police — literally none. Each pack is a JavaScript object of arrays and
 * strings and nothing else. The metrics, dashboards and recommendations every
 * sovereign pack renders are produced HERE, by platform code, from that data.
 *
 * Three things follow, and they are the reasons it is built this way:
 *
 *   1. A sovereign pack cannot introduce executable behaviour into a national
 *      deployment, because there is no field in which behaviour could hide. The
 *      guarantee is structural, not a review convention.
 *
 *   2. A sovereign pack survives a signed bundle round-trip WITHOUT LOSS. An
 *      Industry Pack's bespoke projections are code, so they cannot travel on
 *      media and a bundle-installed one falls back to generic rendering
 *      (lib/sovereign/packs.js). A sovereign pack is data end to end, so the
 *      copy that arrives on a USB stick in an air-gapped facility renders
 *      identically to the copy in this image. `projections: "sovereign"` is
 *      always full fidelity.
 *
 *   3. Every sovereign pack renders through ONE projector, so a new sovereign
 *      domain is a data file — reviewable by a domain authority who does not
 *      read JavaScript.
 *
 * HONESTY. Every figure below is computed from the ONE shared enterprise
 * context (lib/ops/workspaces.js `context()`) that every other Guardian OS
 * surface reads. A readiness measure whose source is not instrumented in this
 * estate is rendered as an explicit `available:false` note carrying the reason
 * — never as a plausible-looking number. Sovereign buyers are the last people
 * who should be shown a fabricated metric.
 *
 * Presentation uses the shared section vocabulary (lib/ops/sections), so the
 * Control Room renderer that draws Executive Workspaces and Industry Packs
 * draws these too, with no sovereign-specific renderer anywhere.
 * ========================================================================== */
"use strict";
const S = require("../../sections");
const sovereignty = require("../../sovereignty");

// ── The grounded-source grammar ─────────────────────────────────────────────
/**
 * A readiness measure names its source with a short string. The grammar is
 * CLOSED: the projector resolves exactly these forms and nothing else, so a
 * pack cannot name a source into existence. Anything unrecognised — or
 * recognised but not instrumented in this estate — becomes an honest note.
 *
 *   health:<score>          a governance-health sub-score (0-100, banded)
 *   pack:policies_enforcing this pack's Ω policies currently active
 *   pack:blocked            actions this pack's policies actually refused
 *   context:<name>          a count from the shared enterprise context
 *   estate:<kind>           entities of one kind in the governed estate
 *   estate:<kind>~<pattern> entities of one kind whose name matches a pattern
 */
const HEALTH_SCORES = ["overall", "governance_maturity", "policy_coverage", "runtime_health", "approval_responsiveness", "evidence_completeness", "drift_score"];

const CONTEXT_COUNTS = {
  open_incidents: (ctx) => (ctx.incidents || []).length,
  escalations: (ctx) => (ctx.escalated || []).length,
  approvals_pending: (ctx) => (ctx.escalated || []).length,
  departments: (ctx) => (ctx.cmd ? (ctx.cmd.departments || []).length : 0),
  active_policies: (ctx) => (ctx.scopedPolicies || []).length,
  evidence_packs: (ctx) => (ctx.packs || []).length,
  evidence_records: (ctx) => (ctx.evSum ? ctx.evSum.total || 0 : 0),
  blocked_total: (ctx) => (ctx.blocked || []).length,
  open_drift: (ctx) => (ctx.drift && ctx.drift.open ? ctx.drift.open.length : 0),
  critical_drift: (ctx) => ((ctx.drift && ctx.drift.open) || []).filter((d) => d.severity === "critical").length,
};

/** Compile a pattern carried as DATA. A bad pattern is inert, never a crash. */
function matcher(pattern) {
  try { return new RegExp(String(pattern), "i"); } catch { return null; }
}

/** Entities of one kind, optionally filtered by a name pattern. */
function estate(ctx, kind, pattern) {
  const rows = (ctx.entities && ctx.entities[kind]) || [];
  if (!pattern) return rows;
  const re = matcher(pattern);
  return re ? rows.filter((e) => re.test(e.name || "")) : [];
}

/** This pack's Ω policies that are actually active in the enterprise. */
const enforcing = (pack, ctx) => {
  const names = new Set((pack.policies || []).map((p) => p.name));
  return (ctx.scopedPolicies || []).filter((p) => names.has(p.name));
};

/** Actions refused by THIS pack's policies (attributed by rule name). */
const refusals = (pack, ctx) => {
  const names = new Set((pack.policies || []).map((p) => p.name));
  return (ctx.blocked || []).filter((e) => e.rule && names.has(e.rule));
};

/**
 * Resolve one readiness measure against the context.
 * Returns { grounded, value, band, reason } — `grounded:false` carries the
 * reason a real source is missing, which the caller renders as a note.
 */
function resolve(source, pack, ctx) {
  const s = String(source || "");
  const health = ctx.health;

  if (s.startsWith("health:")) {
    const key = s.slice("health:".length);
    if (!HEALTH_SCORES.includes(key)) return { grounded: false, reason: `"${key}" is not a governance-health measure this platform computes` };
    if (!health) return { grounded: false, reason: "governance health has not been computed for this enterprise yet — it accrues as managed monitoring runs" };
    if (key === "overall") return { grounded: true, value: health.overall, band: health.band };
    const sub = health.scores[key];
    if (!sub) return { grounded: false, reason: `governance health does not carry a "${key}" sub-score in this release` };
    return { grounded: true, value: sub.score, band: sub.band };
  }

  if (s === "pack:policies_enforcing") return { grounded: true, value: enforcing(pack, ctx).length, of: (pack.policies || []).length };
  if (s === "pack:blocked") return { grounded: true, value: refusals(pack, ctx).length };

  if (s.startsWith("context:")) {
    const key = s.slice("context:".length);
    const fn = CONTEXT_COUNTS[key];
    if (!fn) return { grounded: false, reason: `"${key}" is not a measure the shared enterprise context carries` };
    return { grounded: true, value: fn(ctx) };
  }

  if (s.startsWith("estate:")) {
    const [kind, pattern] = s.slice("estate:".length).split("~");
    return { grounded: true, value: estate(ctx, kind, pattern).length };
  }

  return { grounded: false, reason: `no source is connected for "${s}" in this deployment` };
}

// ── Executive metrics ───────────────────────────────────────────────────────
/**
 * The pack's headline measures. Sovereign packs lead with OPERATIONAL READINESS
 * rather than compliance posture — a national operator's first question is
 * whether the mission is governed and ready, not whether the paperwork is
 * filed. Ungrounded measures are surfaced with an em-dash and no band, never a
 * substituted figure.
 */
function metrics(pack, ctx) {
  const sov = pack.sovereign || {};
  const out = [];
  for (const r of (sov.readiness || []).slice(0, 4)) {
    const v = resolve(r.source, pack, ctx);
    out.push({
      key: r.key, label: r.label,
      value: v.grounded ? v.value : "—",
      band: v.grounded ? v.band || null : null,
      available: v.grounded,
      hint: v.grounded ? r.detail || null : v.reason,
    });
  }
  out.push({ key: "policies", label: "Ω policies enforcing", value: enforcing(pack, ctx).length, hint: `${(pack.policies || []).length} contributed by this pack` });
  out.push({ key: "refusals", label: "Actions refused by this pack", value: refusals(pack, ctx).length, hint: "governed refusals attributed to this pack's policies" });
  return out;
}

// ── Dashboard ───────────────────────────────────────────────────────────────

/** A stage list rendered as one readable chain: `Plan → Authorise → Execute`. */
const chain = (stages) => (stages || []).map((x) => (typeof x === "string" ? x : x.name)).join(" → ");

/** The sovereign posture header: what this pack requires, and what it got. */
function postureSection(pack, ctx) {
  const sov = pack.sovereign || {};
  let assessment = null;
  try { assessment = sovereignty.assessPack(pack); } catch { assessment = null; }
  const cls = (() => { try { return sovereignty.classification(sov.classification); } catch { return null; } })();
  return S.stat("sovereign", "Sovereign posture", [
    { label: "Classification required", value: cls ? cls.title : sov.classification || "—", hint: cls ? cls.summary : null },
    { label: "Deployment", value: assessment ? assessment.profile_title : "—", hint: assessment ? (assessment.ok ? "this deployment satisfies the pack's handling bar" : assessment.reasons.join(" ")) : null },
    { label: "Admissible here", value: assessment ? (assessment.ok ? "yes" : "NO") : "—" },
    { label: "Mission domain", value: sov.mission_domain || "—", hint: sov.mission || null },
    { label: "Ω policies enforcing", value: enforcing(pack, ctx).length, hint: `of ${(pack.policies || []).length} contributed` },
    { label: "Actions refused", value: refusals(pack, ctx).length },
  ]);
}

/** Readiness — the grounded measures as figures, the rest as honest notes. */
function readinessSections(pack, ctx) {
  const rows = (pack.sovereign || {}).readiness || [];
  if (!rows.length) return [];
  const grounded = [];
  const missing = [];
  for (const r of rows) {
    const v = resolve(r.source, pack, ctx);
    if (v.grounded) grounded.push({ label: r.label, value: v.of !== undefined ? `${v.value}/${v.of}` : v.value, hint: r.detail || null });
    else missing.push({ label: r.label, reason: v.reason });
  }
  const out = [];
  if (grounded.length) out.push(S.stat("readiness", "Operational readiness", grounded));
  for (const m of missing) out.push(S.note(`readiness_${m.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, m.label, m.reason));
  return out;
}

/**
 * Digital Twin projections. A sovereign pack does NOT build a second twin — it
 * declares which parts of the one governed twin carry mission meaning, and the
 * projector counts what is actually there. A projection over an entity kind the
 * estate has not mapped reports zero, plainly.
 */
function twinSection(pack, ctx) {
  const rows = (pack.sovereign || {}).twin_projections || [];
  return S.list("twin", "Digital Twin projections", rows.map((t) => {
    const n = (t.entity_kinds || []).reduce((sum, k) => {
      const [kind, pattern] = String(k).split("~");
      return sum + estate(ctx, kind, pattern).length;
    }, 0);
    return { title: t.title, meta: `${n} mapped · ${t.reads || (t.entity_kinds || []).join(", ")}`, severity: n === 0 ? "warning" : "info" };
  }), "This pack declares no twin projections.");
}

/**
 * The pack's full sovereign dashboard. Sections appear in the order a national
 * operator reads them: posture, authority, mission, readiness, enforcement,
 * then the evidence and reporting that has to survive an inquiry.
 */
function dashboard(pack, ctx) {
  const sov = pack.sovereign || {};
  const active = enforcing(pack, ctx);
  const activeNames = new Set(active.map((p) => p.name));
  const blocked = refusals(pack, ctx);
  const h = ctx.health;

  return [
    postureSection(pack, ctx),

    S.score("confidence", "Governance confidence", h ? { score: h.overall, band: h.band } : null,
      h ? ["policy_coverage", "runtime_health", "evidence_completeness", "drift_score"].map((k) => ({ key: k, label: k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), ...h.scores[k] })) : []),

    S.list("authority", "Authority chains", (sov.authority_chains || []).map((a) => ({
      title: a.title,
      meta: `${a.authority}${(a.delegates_to || []).length ? ` → ${(a.delegates_to || []).join(" → ")}` : ""} · authorises: ${(a.authorises || []).join(", ") || "—"}`,
    })), "This pack declares no authority chains."),

    S.list("workflows", "Mission workflows", (sov.workflows || []).map((w) => ({
      title: w.title, meta: `${chain(w.stages)}${w.evidence ? ` · evidence: ${w.evidence}` : ""}`,
    })), "This pack declares no mission workflows."),

    S.list("capabilities", "Governed capabilities", (sov.capabilities || []).map((c) => {
      const govern = (c.governed_by || []).filter((n) => activeNames.has(n));
      return {
        title: c.title,
        meta: `${c.detail || ""}${(c.governed_by || []).length ? ` · governed by ${govern.length}/${(c.governed_by || []).length} active Ω policies` : " · no governing policy declared"}`,
        severity: (c.governed_by || []).length && govern.length === 0 ? "critical" : "info",
      };
    }), "This pack declares no governed capabilities."),

    ...readinessSections(pack, ctx),

    S.list("policies", "Ω policies contributed", (pack.policies || []).map((p) => ({
      title: p.name,
      meta: `${p.domain} · ${activeNames.has(p.name) ? "enforcing" : "not active"}${p.spec && p.spec.severity ? ` · ${p.spec.severity}` : ""}`,
      severity: activeNames.has(p.name) ? "info" : "warning",
    })), "This pack contributes no Ω policies."),

    S.list("refusals", "Governed refusals attributed to this pack", blocked.slice(0, 12).map((b) => ({
      title: b.rule, meta: `${b.action_id}: ${b.reason}`, severity: "critical",
    })), "Nothing refused by this pack's policies in this window."),

    twinSection(pack, ctx),

    S.list("risk", "Risk models", (sov.risk_models || []).map((r) => ({
      title: r.title, meta: `factors: ${(r.factors || []).join(", ")}${r.escalates_when ? ` · escalates when ${r.escalates_when}` : ""}`,
    })), "This pack declares no risk models."),

    S.list("regmap", "Regulation → control → evidence", (pack.evidence_mappings || []).map((m) => ({
      title: `${m.regulation} — ${m.control}`, meta: m.evidence,
    })), "This pack declares no evidence mappings."),

    S.list("incidents", "Incident workflows", (pack.incident_workflows || []).map((w) => ({
      title: (w.kind || w.name || "").replace(/_/g, " "), meta: chain(w.steps), severity: S.severity(w.severity),
    })), "This pack declares no incident workflows."),

    S.list("briefings", "Executive briefings", (sov.briefings || []).map((b) => ({
      title: b.title, meta: `${b.audience}${(b.sections || []).length ? ` · ${(b.sections || []).join(" · ")}` : ""}`,
    })), "This pack declares no executive briefings."),

    S.list("reports", "Reports", (sov.reports || []).map((r) => ({
      title: r.title, meta: `${r.audience} · ${r.cadence}${(r.contents || []).length ? ` · ${(r.contents || []).join(", ")}` : ""}`,
    })), "This pack declares no reports."),

    S.list("packs", "Signed evidence packs", (ctx.packs || []).map((p) => ({
      title: `Evidence pack ${p.period}`, meta: `content hash ${String(p.hash).slice(0, 16)}… · retained for inquiry`,
    })), "No evidence packs generated for this enterprise yet."),
  ];
}

// ── Recommendations ─────────────────────────────────────────────────────────
/**
 * Candidates fed into Managed Governance, so a sovereign pack's findings travel
 * the SAME proposal → Ω → approval → execution → evidence path as everything
 * else. A pack cannot act; it can only propose, and the engine still governs
 * whatever the proposal turns into.
 */
function recommendations(pack, ctx) {
  const sov = pack.sovereign || {};
  const out = [];
  const activeNames = new Set(enforcing(pack, ctx).map((p) => p.name));

  // 1. Sovereignty drift — the deployment no longer meets the pack's handling
  //    bar. This can happen after install if a profile is changed, and it is the
  //    single most serious finding a sovereign pack can make.
  try {
    const a = sovereignty.assessPack(pack);
    if (!a.ok) {
      out.push({
        title: `${pack.title} is installed on a deployment below its classification`,
        detail: `${pack.title} requires a ${a.classification_title} deployment; this deployment is ${a.profile_title}. ${a.reasons.join(" ")} Move the enterprise to one of: ${a.eligible_profiles.join(", ")}, or remove the pack.`,
        severity: "critical",
      });
    }
  } catch { /* an unassessable pack is caught at install; monitoring never breaks on it */ }

  // 2. Contributed policies that are not enforcing — the estate's posture does
  //    not match what the pack claims to govern.
  const inactive = (pack.policies || []).map((p) => p.name).filter((n) => !activeNames.has(n));
  if (inactive.length) {
    out.push({
      title: `${pack.title}: ${inactive.length} contributed ${inactive.length === 1 ? "policy is" : "policies are"} not enforcing`,
      detail: `Installed but inactive: ${inactive.join(", ")}. Re-activate them, or remove the pack so the estate's governance posture reflects reality.`,
      severity: "critical",
    });
  }

  // 3. A declared governed capability with no active policy behind it — the
  //    pack says this capability is governed and, right now, it is not.
  for (const c of sov.capabilities || []) {
    const declared = c.governed_by || [];
    if (declared.length && !declared.some((n) => activeNames.has(n))) {
      out.push({
        title: `Governed capability unprotected: ${c.title}`,
        detail: `${pack.title} declares "${c.title}" as a governed capability enforced by ${declared.join(", ")}, and none of those policies is active in this enterprise.`,
        severity: "critical",
      });
    }
  }

  // 4. Mission-relevant estate with nothing governing it. A twin projection
  //    that matches real tools tells us the capability EXISTS here; if no
  //    contributed policy names those tools, the pack knows about a live
  //    capability it is not constraining.
  const covered = new Set();
  for (const p of ctx.scopedPolicies || []) for (const t of ((p.spec && p.spec.match && p.spec.match.tools) || [])) covered.add(t);
  for (const t of sov.twin_projections || []) {
    for (const k of t.entity_kinds || []) {
      const [kind, pattern] = String(k).split("~");
      if (kind !== "tool" || !pattern) continue;
      for (const tool of estate(ctx, kind, pattern)) {
        if (!covered.has(tool.name)) {
          out.push({
            title: `Mission capability ungoverned: ${tool.name}`,
            detail: `"${tool.name}" is in scope of ${pack.title}'s "${t.title}" projection and no active Ω policy names it. Add an authority or approval control before this capability is exercised autonomously.`,
            severity: "critical",
          });
        }
      }
    }
  }

  // 5. An authority chain with no approver mapped in the estate — the chain is
  //    declared on paper and cannot be executed by anyone.
  const approvers = (ctx.entities && ctx.entities.approver) || [];
  if (!approvers.length && (sov.authority_chains || []).length) {
    out.push({
      title: `${pack.title}: no approving authority is mapped in the estate`,
      detail: `${(sov.authority_chains || []).length} authority chain(s) are declared, and the enterprise has no approver mapped. Every escalation this pack produces will have nowhere to go — map the responsible authorities in enterprise provisioning.`,
      severity: "warning",
    });
  }

  return out;
}

module.exports = {
  HEALTH_SCORES, CONTEXT_COUNTS,
  resolve, enforcing, refusals, estate, matcher,
  metrics, dashboard, recommendations,
};

/* ============================================================================
 * Operations Agent — briefing data sources (read-only, grounded).
 *
 * Every number the briefing shows comes from a specific record set returned
 * here, each carrying provenance: { sourceType, sourceIds, count, timeWindow }.
 * Nothing is fabricated: a source that has no backing configuration reports
 * { available: false, reason } and the UI says so.
 *
 * Two record families:
 *   • Runtime platform records (rg_* via lib/runtime store): orgs, reports,
 *     audit packs, decisions, engagements, alerts — always available (file
 *     store fallback in dev).
 *   • Sales/CRM records (public.audit_requests / assessments / leads via
 *     Supabase): questionnaires, audits, leads — available only when Supabase
 *     is configured; reported honestly otherwise.
 *
 * The generic prospect/follow-up source is the operator CRM (engagement
 * records): recent notes + contacts + due reviews. No prospect names are
 * hard-coded anywhere; email integration is reported as not configured until
 * a Gmail bridge exists (manual engagement notes fill the gap).
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const gmail = require("./gmail");

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString();
const daysAgo = (d) => iso(Date.now() - d * DAY);
const winDays = (d) => ({ from: daysAgo(d), to: iso(Date.now()) });

// ── Sales-schema client (public.* tables — separate from the rg_ store) ─────
let _sb = null, _sbTried = false;
function salesDb() {
  if (_sbTried) return _sb;
  _sbTried = true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return (_sb = null);
  try {
    const { createClient } = require("@supabase/supabase-js");
    _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch { _sb = null; }
  return _sb;
}
const SALES_UNAVAILABLE = {
  available: false,
  reason: "Supabase not configured (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
};

async function salesRows(table, sinceCol, since) {
  const sb = salesDb();
  if (!sb) return null;
  const { data, error } = await sb.from(table).select("*").gte(sinceCol, since).order(sinceCol, { ascending: false }).limit(200);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

// ── Runtime-platform sources (always available) ─────────────────────────────

/** New organisations in the window. */
async function newOrgs({ days = 7 } = {}) {
  const orgs = await rt.store.find("orgs", {}).catch(() => []);
  const timeWindow = winDays(days);
  const rows = orgs.filter((o) => String(o.created_at) >= timeWindow.from);
  return {
    available: true, sourceType: "organisation", count: rows.length, timeWindow,
    sourceIds: rows.map((o) => o.id),
    records: rows.map((o) => ({ id: o.id, name: o.name, plan: o.plan, created_at: o.created_at })),
  };
}

/** Reports generated in the window (the "reports to review" queue). */
async function recentReports({ days = 7 } = {}) {
  const reports = await rt.store.find("reports", {}).catch(() => []);
  const timeWindow = winDays(days);
  const rows = reports.filter((r) => String(r.created_at) >= timeWindow.from);
  return {
    available: true, sourceType: "report", count: rows.length, timeWindow,
    sourceIds: rows.map((r) => r.id),
    records: rows.map((r) => ({ id: r.id, org_id: r.org_id, period: r.period, created_at: r.created_at })),
  };
}

/** Runtime evaluation activity (decisions) in the window. */
async function runtimeActivity({ days = 1 } = {}) {
  const timeWindow = winDays(days);
  const m = await rt.metrics.summary({ since: timeWindow.from }).catch(() => null);
  return {
    available: !!m, sourceType: "runtime_decision", timeWindow,
    count: m ? m.total : 0,
    verdicts: m ? m.verdicts : null,
    sourceIds: [], // high-volume — drill down via /api/runtime/decisions
  };
}

/** Pilot-ready organisations, derived (not asserted): engagement stage is
 *  audit/enterprise_assessment AND the org has produced governance material
 *  (an audit pack or a report). The rule is visible in the payload. */
async function pilotReady() {
  const orgs = await rt.store.find("orgs", {}).catch(() => []);
  const packs = await rt.store.find("audit_packs", {}).catch(() => []);
  const reports = await rt.store.find("reports", {}).catch(() => []);
  const out = [];
  for (const org of orgs) {
    const eng = await rt.engagement.get(org.id).catch(() => null);
    if (!eng || !["audit", "enterprise_assessment"].includes(eng.stage)) continue;
    const material = packs.some((p) => p.org_id === org.id) || reports.some((r) => r.org_id === org.id);
    if (material) out.push({ id: org.id, name: org.name, stage: eng.stage, stage_label: eng.stage_label });
  }
  return {
    available: true, sourceType: "engagement", count: out.length,
    rule: "stage in [audit, enterprise_assessment] AND has audit pack or report",
    sourceIds: out.map((o) => o.id), records: out,
  };
}

/** Stalled customer journeys: no runtime evaluations for OPS_STALL_DAYS. */
async function stalledJourneys() {
  const stallDays = Number(process.env.OPS_STALL_DAYS) > 0 ? Number(process.env.OPS_STALL_DAYS) : 7;
  const orgs = await rt.store.find("orgs", {}).catch(() => []);
  const cutoff = daysAgo(stallDays);
  const out = [];
  for (const org of orgs) {
    const last = await rt.store.queryDecisions({ org_id: org.id, limit: 1 }).catch(() => []);
    const lastEval = last[0] ? String(last[0].created_at || last[0].ts || "") : null;
    const stalled = lastEval ? lastEval < cutoff : String(org.created_at) < cutoff;
    if (stalled) out.push({ id: org.id, name: org.name, last_evaluation: lastEval });
  }
  return {
    available: true, sourceType: "organisation", count: out.length,
    rule: `no runtime evaluations for ${stallDays} days`,
    sourceIds: out.map((o) => o.id), records: out,
  };
}

/** Generic prospect / follow-up source: the operator CRM (engagement records).
 *  Recent notes are the manual follow-up channel until email integration
 *  exists. No prospect names are hard-coded — whatever the operator records
 *  (e.g. "Quantm replied") surfaces here with full provenance. */
async function followUps({ days = 7 } = {}) {
  const orgs = await rt.store.find("orgs", {}).catch(() => []);
  const timeWindow = winDays(days);
  const notes = [];
  const dueReviews = [];
  const today = iso(Date.now()).slice(0, 10);
  for (const org of orgs) {
    const eng = await rt.engagement.get(org.id).catch(() => null);
    if (!eng) continue;
    for (const n of eng.notes || []) {
      if (String(n.at) >= timeWindow.from) {
        notes.push({ note_id: n.id, org_id: org.id, org_name: org.name, at: n.at, text: n.text });
      }
    }
    if (eng.next_review_date && eng.next_review_date <= today) {
      dueReviews.push({ org_id: org.id, org_name: org.name, next_review_date: eng.next_review_date, stage: eng.stage });
    }
  }
  notes.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  // Email is a real source once the read-only Gmail integration is connected;
  // honest not-configured otherwise (manual notes still fill the gap).
  const email = await gmail.summary({ days }).catch(() => ({ available: false, reason: "Email activity unavailable — Gmail integration not configured." }));
  if (!email.available && !email.note) email.note = "Manual engagement notes contribute to the briefing until Gmail is connected.";
  return {
    available: true, sourceType: "engagement_note", count: notes.length, timeWindow,
    sourceIds: notes.map((n) => `${n.org_id}:${n.note_id}`),
    records: notes.slice(0, 20),
    due_reviews: dueReviews,
    email,
  };
}

// ── Sales/CRM sources (Supabase-gated, honest when absent) ──────────────────

/** New audit requests (48-hour audit intake questionnaires). */
async function auditRequests({ days = 7 } = {}) {
  const timeWindow = winDays(days);
  try {
    const rows = await salesRows("audit_requests", "created_at", timeWindow.from);
    if (rows === null) return { ...SALES_UNAVAILABLE, sourceType: "audit_request", timeWindow, count: 0, sourceIds: [] };
    const pending = rows.filter((r) => ["new", "reviewing"].includes(r.status));
    return {
      available: true, sourceType: "audit_request", count: rows.length, timeWindow,
      pending: pending.length,
      sourceIds: rows.map((r) => r.reference || r.id),
      records: rows.slice(0, 20).map((r) => ({ reference: r.reference, company: r.company_name, status: r.status, created_at: r.created_at })),
    };
  } catch (e) {
    return { available: false, reason: `audit_requests query failed: ${e.message}`, sourceType: "audit_request", timeWindow, count: 0, sourceIds: [] };
  }
}

/** Completed enterprise assessment questionnaires. */
async function assessments({ days = 7 } = {}) {
  const timeWindow = winDays(days);
  try {
    const rows = await salesRows("assessments", "submitted_at", timeWindow.from);
    if (rows === null) return { ...SALES_UNAVAILABLE, sourceType: "runtime_assessment", timeWindow, count: 0, sourceIds: [] };
    return {
      available: true, sourceType: "runtime_assessment", count: rows.length, timeWindow,
      sourceIds: rows.map((r) => r.reference || r.id),
      records: rows.slice(0, 20).map((r) => ({ reference: r.reference, company: r.company, status: r.status, pathway: r.recommended_pathway, submitted_at: r.submitted_at })),
    };
  } catch (e) {
    return { available: false, reason: `assessments query failed: ${e.message}`, sourceType: "runtime_assessment", timeWindow, count: 0, sourceIds: [] };
  }
}

/** New leads (contact/enquiry forms). */
async function leads({ days = 7 } = {}) {
  const timeWindow = winDays(days);
  try {
    const rows = await salesRows("leads", "created_at", timeWindow.from);
    if (rows === null) return { ...SALES_UNAVAILABLE, sourceType: "lead", timeWindow, count: 0, sourceIds: [] };
    const uncontacted = rows.filter((r) => r.status === "new");
    return {
      available: true, sourceType: "lead", count: rows.length, timeWindow,
      uncontacted: uncontacted.length,
      sourceIds: rows.map((r) => r.reference || r.id),
      records: rows.slice(0, 20).map((r) => ({ reference: r.reference, name: r.name, organisation: r.organisation, status: r.status, created_at: r.created_at })),
    };
  } catch (e) {
    return { available: false, reason: `leads query failed: ${e.message}`, sourceType: "lead", timeWindow, count: 0, sourceIds: [] };
  }
}

/** Everything the briefing needs, gathered in parallel. Never throws. */
async function gather() {
  const [orgs, reports, activity, pilots, stalled, follow, audits, assess, leadRows] = await Promise.all([
    newOrgs(), recentReports(), runtimeActivity(), pilotReady(), stalledJourneys(),
    followUps(), auditRequests(), assessments(), leads(),
  ]);
  return {
    gathered_at: iso(Date.now()),
    new_orgs: orgs, recent_reports: reports, runtime_activity: activity,
    pilot_ready: pilots, stalled: stalled, follow_ups: follow,
    audit_requests: audits, assessments: assess, leads: leadRows,
  };
}

module.exports = {
  gather, newOrgs, recentReports, runtimeActivity, pilotReady, stalledJourneys,
  followUps, auditRequests, assessments, leads, salesDb,
};

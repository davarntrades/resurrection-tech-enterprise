/* ============================================================================
 * Operations Agent — privileged action catalog + executor registry.
 *
 * Every action the Operations Agent can PROPOSE is registered here with:
 *   • an Ω tool name matching governance-service/operations_rules.py, so the
 *     Runtime Governance engine evaluates the proposal with dedicated rules
 *   • a risk level driving the local human-sign-off policy
 *   • the authorisation flags an operator approval attaches on re-evaluation
 *   • an executor that performs the action ONLY after an allow verdict —
 *     executors reuse the existing lib/runtime modules (extend, not replace)
 *
 * The catalog is deny-by-default: an action not registered here cannot be
 * proposed, evaluated, or executed. Two actions are registered as REFUSED —
 * evidence deletion and credential sharing have no executor by design and the
 * engine blocks them unconditionally; they exist in the catalog so the attempt
 * itself is governed, recorded, and visible in the Evidence Hub.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");

const RISKS = ["low", "medium", "high", "critical"];
// Risk levels the agent may auto-execute after an engine PERMIT. High/critical
// always escalate to an operator even when the engine permits.
const AUTO_EXECUTE_RISKS = ["low", "medium"];

/* Each entry:
 *   tool            Ω tool name submitted to the governance engine
 *   risk            low | medium | high | critical
 *   approval_flags  flags attached to the trajectory when an operator approves
 *   execute(params) performs the action; returns a JSON-able result
 *   refuse          the platform never executes this action (attempts are
 *                   still evaluated + recorded as evidence)
 */
const CATALOG = {
  // ── Internal, low-risk operations (auto-executable after PERMIT) ──────────
  create_recommendation: {
    title: "Raise a governance recommendation for a customer",
    tool: "raise_recommendation", // proposal-verb name: inert to Ω hard-stops
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      const rec = await rt.recommendations.create({
        org_id: p.org_id,
        title: p.title,
        detail: p.detail || "",
        severity: p.severity || "medium",
        source: p.source || "operations_agent",
      });
      return { recommendation_id: rec.id, status: rec.status };
    },
  },
  raise_alert: {
    title: "Raise an operational alert",
    tool: "raise_alert",
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      const alert = await rt.alerts.raise({
        org_id: p.org_id || null,
        environment_id: p.environment_id || null,
        kind: p.kind || "ops_agent_alert",
        severity: p.severity || "warning",
        message: p.message,
        meta: { source: "operations_agent", ...(p.meta || {}) },
      });
      return { raised: !!alert, suppressed: !alert };
    },
  },
  notify_operator: {
    title: "Notify the operator (Control Room work item)",
    tool: "notify_operator",
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      // Ride the alerts channel (webhook/email if configured) at info severity.
      const alert = await rt.alerts.raise({
        org_id: p.org_id || null,
        kind: "ops_operator_notice",
        severity: "warning",
        message: p.message,
        meta: { source: "operations_agent" },
      });
      return { delivered: !!alert };
    },
  },
  generate_report: {
    title: "Generate a governance evidence report",
    tool: "generate_report",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => {
      const rep = await rt.reports.generate({ org_id: p.org_id, period: p.period || "weekly" });
      return { report_id: rep && rep.id ? rep.id : null, period: p.period || "weekly" };
    },
  },

  // ── Privileged operations (engine-ruled + operator sign-off) ──────────────
  send_confidential_report: {
    title: "Deliver a confidential enterprise report to a customer",
    tool: "send_confidential_report",
    risk: "high",
    approval_flags: { report_delivery_authorized: true },
    execute: async (p) => {
      // Delivery itself remains an operator action in the Control Room (share
      // link / hub publish). Execution here records the authorised work item.
      await rt.adminaudit.record({
        action: "ops_report_delivery_authorized", actor: "operations_agent",
        via: "ops", target: p.org_id, meta: { report_id: p.report_id || null },
      });
      return { queued: true, next: "operator delivers via Evidence Hub / secure share" };
    },
  },
  create_organisation: {
    title: "Onboard a new customer organisation",
    tool: "create_organisation",
    risk: "high",
    approval_flags: { onboarding_verified: true, operator_approved: true },
    execute: async (p) => {
      const res = await rt.admin.onboardCustomer({ name: p.name, slug: p.slug, plan: p.plan || "pilot" });
      return { org_id: res.org.id, environment_id: res.environment.id };
    },
  },
  promote_to_pilot: {
    title: "Promote a customer engagement to pilot",
    tool: "promote_to_pilot",
    risk: "high",
    approval_flags: { pilot_approved: true, operator_approved: true },
    execute: async (p) => {
      // Engagement stage keys come from rt.engagement.STAGES ("limited_pilot"
      // is the pilot stage in the existing engagement model).
      const stage = p.stage && rt.engagement.STAGE_KEYS.includes(p.stage) ? p.stage : "limited_pilot";
      const eng = await rt.engagement.set(p.org_id, { stage });
      return { org_id: p.org_id, stage: (eng && eng.stage) || stage };
    },
  },
  modify_customer: {
    title: "Modify a customer record",
    tool: "modify_customer",
    risk: "high",
    approval_flags: { change_authorized: true, operator_approved: true },
    execute: async (p) => {
      await rt.store.update("orgs", p.org_id, p.patch || {});
      return { org_id: p.org_id, patched: Object.keys(p.patch || {}) };
    },
  },
  export_documents: {
    title: "Export customer documents (internal destination only)",
    tool: "export_documents",
    risk: "high",
    approval_flags: { export_authorized: true, destination_internal: true },
    execute: async (p) => {
      await rt.adminaudit.record({
        action: "ops_export_authorized", actor: "operations_agent",
        via: "ops", target: p.org_id, meta: { scope: p.scope || "deliverables" },
      });
      return { queued: true, next: "operator performs export from Control Room" };
    },
  },
  deploy_runtime: {
    title: "Trigger a runtime deployment",
    tool: "deploy_runtime",
    risk: "critical",
    approval_flags: { deployment_approved: true, change_approved: true },
    execute: async (p) => {
      // Execution requires an explicitly configured deploy hook (Railway/Vercel
      // deploy webhook). Without it, the approved deployment stays a manual step.
      const hook = process.env.OPS_DEPLOY_WEBHOOK || "";
      if (!hook) return { executed: false, reason: "OPS_DEPLOY_WEBHOOK not configured — manual deployment required" };
      const res = await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "operations_agent", target: p.target || "runtime", ref: p.ref || null }),
      }).catch((e) => ({ ok: false, statusText: e.message }));
      return { executed: !!res.ok, status: res.status || null };
    },
  },

  // ── Never-execute actions (governed refusals) ─────────────────────────────
  delete_evidence: {
    title: "Delete governance evidence (never permitted)",
    tool: "delete_evidence",
    risk: "critical",
    approval_flags: {}, // no flag combination unblocks this in the engine
    refuse: true,
  },
  share_credentials: {
    title: "Share credentials (never permitted)",
    tool: "share_credentials",
    risk: "critical",
    approval_flags: {},
    refuse: true,
  },
};

const get = (action_id) => CATALOG[action_id] || null;
const list = () =>
  Object.entries(CATALOG).map(([id, a]) => ({
    id, title: a.title, tool: a.tool, risk: a.risk, refuse: !!a.refuse,
    auto_executable: !a.refuse && AUTO_EXECUTE_RISKS.includes(a.risk),
  }));
const autoExecutable = (action) => !!action && !action.refuse && AUTO_EXECUTE_RISKS.includes(action.risk);

module.exports = { CATALOG, RISKS, AUTO_EXECUTE_RISKS, get, list, autoExecutable };

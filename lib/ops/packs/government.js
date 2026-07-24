/* Guardian OS — Government Intelligence Pack.
 * Department governance, procurement oversight and citizen-service AI
 * governance for the public sector. Declarative only. */
"use strict";
const S = require("../sections");

const CITIZEN = /citizen|benefit|claim|permit|licence|license|tax|welfare|case|applicant/i;
const PROCURE = /procure|purchase|contract|tender|award|supplier|vendor/i;

module.exports = {
  id: "government",
  version: "1.0.0",
  industry: "Government & public sector",
  title: "Government Intelligence Pack",
  purpose: "Department governance, procurement oversight and citizen-service AI governance for public sector bodies.",
  match: ["government", "public sector", "council", "agency", "municipal", "federal", "ministry", "civic"],
  regulations: ["EU AI Act — public services", "GDPR Art.22 (automated decisions)", "FOI / transparency", "Public procurement rules", "NIST AI RMF", "Algorithmic transparency standard"],

  policies: [
    { name: "gov_citizen_decision_requires_human", domain: "compliance",
      spec: { match: { tools: ["decide_claim", "approve_benefit", "deny_application", "issue_permit", "close_case"] },
        conditions: { unauthorized_unless: ["caseworker_approved", "operator_approved"] }, severity: "critical" } },
    { name: "gov_procurement_requires_authority", domain: "enterprise",
      spec: { match: { tools: ["award_contract", "issue_purchase_order", "select_supplier"] },
        conditions: { unauthorized_unless: ["procurement_approved", "operator_approved"] }, severity: "critical" } },
    { name: "gov_block_citizen_data_export", domain: "data_privacy",
      spec: { match: { tools: ["export_documents", "share_record", "bulk_export"] },
        conditions: { flag_true_blocks: ["destination_external", "contains_citizen_data"] }, severity: "critical" } },
  ],

  templates: [
    { name: "gov_appeal_rights", description: "Require a recorded human review before any adverse citizen decision.", domain: "compliance",
      spec: { match: { tools: ["<decision_tool>"] }, conditions: { unauthorized_unless: ["human_review_recorded"] }, severity: "critical" } },
  ],

  evidence_mappings: [
    { regulation: "GDPR Art.22", control: "No solely automated adverse decisions", evidence: "Citizen decisions escalate to a caseworker; the approval chain proves human involvement." },
    { regulation: "EU AI Act — public services", control: "High-risk oversight", evidence: "Runtime policies + evidence ledger show oversight of every automated decision." },
    { regulation: "Public procurement rules", control: "Award integrity", evidence: "Contract awards require procurement authority; attempts and approvals are retained." },
    { regulation: "Algorithmic transparency", control: "Published decision logic", evidence: "Policy specs are declarative + versioned — the decision rules are inspectable." },
  ],

  incident_workflows: [
    { kind: "automated_adverse_decision", severity: "critical", steps: ["Identify affected citizens", "Verify human review occurred", "Notify the department SRO", "Remediate + record appeal rights", "Publish transparency record"] },
  ],

  metrics(ctx) {
    const citizenTools = (ctx.entities.tool || []).filter((t) => CITIZEN.test(t.name));
    const procureTools = (ctx.entities.tool || []).filter((t) => PROCURE.test(t.name));
    const h = ctx.health;
    return [
      { key: "oversight", label: "Public oversight posture", value: h ? h.scores.policy_coverage.score : "—", band: h ? h.scores.policy_coverage.band : null },
      { key: "citizen_systems", label: "Citizen-service AI tools", value: citizenTools.length },
      { key: "procurement_systems", label: "Procurement AI tools", value: procureTools.length },
      { key: "departments", label: "Departments governed", value: (ctx.cmd ? ctx.cmd.departments.length : 0) },
      { key: "transparency", label: "Evidence completeness", value: h ? h.scores.evidence_completeness.score : "—", band: h ? h.scores.evidence_completeness.band : null },
    ];
  },

  dashboard(ctx, pack) {
    const citizenTools = (ctx.entities.tool || []).filter((t) => CITIZEN.test(t.name));
    const procureTools = (ctx.entities.tool || []).filter((t) => PROCURE.test(t.name));
    const govPolicies = ctx.scopedPolicies.filter((p) => p.name.startsWith("gov_"));
    return [
      S.stat("oversight", "Executive oversight", [
        { label: "Departments governed", value: ctx.cmd ? ctx.cmd.departments.length : 0 },
        { label: "Citizen-service tools", value: citizenTools.length },
        { label: "Procurement tools", value: procureTools.length },
        { label: "Government policies live", value: govPolicies.length },
      ]),
      S.list("departments", "Department governance", (ctx.cmd ? ctx.cmd.departments : []).map((d) => ({ title: d.replace(/_/g, " "), meta: "governed department" })), "No departments deployed."),
      S.list("citizen", "Citizen service AI governance", citizenTools.map((t) => ({ title: t.name, meta: "caseworker approval required (GDPR Art.22)" })), "No citizen-service tools in the estate."),
      S.list("procurement", "Procurement oversight", procureTools.map((t) => ({ title: t.name, meta: "procurement authority required" })), "No procurement tools in the estate."),
      S.list("policies", "Policy library", govPolicies.map((p) => ({ title: p.name, meta: `${p.domain} · v${p.version} · active` })), "Install the pack to activate public-sector policies."),
      S.list("regmap", "Regulatory mappings", pack.evidence_mappings.map((m) => ({ title: `${m.regulation} — ${m.control}`, meta: m.evidence }))),
      S.list("packs", "Government evidence packs", ctx.packs.map((p) => ({ title: `Evidence pack ${p.period}`, meta: `signed ${String(p.hash).slice(0, 16)}… · public-sector reporting` })), "No evidence packs generated yet."),
    ];
  },

  recommendations(ctx) {
    const out = [];
    const policyTools = new Set();
    for (const p of ctx.scopedPolicies) for (const t of ((p.spec && p.spec.match && p.spec.match.tools) || [])) policyTools.add(t);
    for (const t of (ctx.entities.tool || [])) {
      if (CITIZEN.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Require human review for citizen-decision tool: ${t.name}`, detail: `"${t.name}" can affect a citizen with no governing policy — GDPR Art.22 prohibits solely automated adverse decisions.`, severity: "critical" });
      if (PROCURE.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Add procurement authority control to: ${t.name}`, detail: `Procurement tool "${t.name}" has no active runtime policy requiring authorised sign-off.`, severity: "warning" });
    }
    return out;
  },
};

/* Guardian OS — Insurance Intelligence Pack.
 * Claims governance, underwriting AI governance, fraud detection and
 * regulatory reporting. Declarative only. */
"use strict";
const S = require("../sections");

const CLAIMS = /claim|settle|payout|adjust|loss|indemnit/i;
const UNDERWRITING = /underwrit|quote|price_policy|rate|risk_score|bind/i;
const FRAUD = /fraud|siu|suspicious|anomal/i;

module.exports = {
  id: "insurance",
  version: "1.0.0",
  industry: "Insurance",
  title: "Insurance Intelligence Pack",
  purpose: "Claims governance, underwriting AI oversight, fraud detection and regulatory reporting for insurers.",
  match: ["insur", "underwrit", "claims", "actuar", "reinsur", "broker"],
  regulations: ["Solvency II", "FCA ICOBS", "GDPR Art.22", "EU AI Act — high-risk (insurance pricing)", "NAIC Model Bulletin", "Fair pricing / non-discrimination"],

  policies: [
    { name: "ins_claim_decision_requires_adjuster", domain: "finance",
      spec: { match: { tools: ["settle_claim", "deny_claim", "approve_payout", "adjust_reserve"] },
        conditions: { unauthorized_unless: ["adjuster_approved", "operator_approved"] }, severity: "critical" } },
    { name: "ins_large_settlement_threshold", domain: "finance",
      spec: { match: { tools: ["settle_claim", "approve_payout"] },
        conditions: { threshold: { field: "amount", op: ">", value: 25000 } }, severity: "critical" } },
    { name: "ins_underwriting_requires_review", domain: "compliance",
      spec: { match: { tools: ["bind_policy", "set_premium", "decline_risk"] },
        conditions: { unauthorized_unless: ["underwriter_approved"] }, severity: "critical" } },
  ],

  templates: [
    { name: "ins_fair_pricing_guard", description: "Block pricing actions flagged as using a protected attribute.", domain: "compliance",
      spec: { match: { tools: ["<pricing_tool>"] }, conditions: { flag_true_blocks: ["uses_protected_attribute"] }, severity: "critical" } },
  ],

  evidence_mappings: [
    { regulation: "GDPR Art.22", control: "Automated claim/underwriting decisions", evidence: "Adverse decisions escalate to a human; the approval chain proves involvement." },
    { regulation: "EU AI Act — high-risk", control: "Insurance pricing oversight", evidence: "Pricing tools are governed at runtime; every decision leaves evidence." },
    { regulation: "Solvency II", control: "Governance + risk management", evidence: "Governance health, drift and signed evidence packs form the periodic record." },
    { regulation: "Fair pricing", control: "Non-discrimination", evidence: "Protected-attribute pricing can be blocked fail-closed via policy template." },
  ],

  incident_workflows: [
    { kind: "improper_claim_denial", severity: "critical", steps: ["Identify affected policyholders", "Verify human adjuster review", "Notify compliance + complaints", "Remediate and record redress", "Attach evidence to the regulatory pack"] },
  ],

  metrics(ctx) {
    const claimTools = (ctx.entities.tool || []).filter((t) => CLAIMS.test(t.name));
    const uwTools = (ctx.entities.tool || []).filter((t) => UNDERWRITING.test(t.name));
    const fraudBlocks = ctx.blocked.filter((b) => FRAUD.test(`${b.action_id} ${b.reason || ""}`)).length;
    const h = ctx.health;
    return [
      { key: "claims_governance", label: "Claims tools governed", value: claimTools.length },
      { key: "underwriting_governance", label: "Underwriting tools governed", value: uwTools.length },
      { key: "fraud_prevention", label: "Fraud refusals", value: fraudBlocks },
      { key: "risk_monitoring", label: "Runtime health", value: h ? h.scores.runtime_health.score : "—", band: h ? h.scores.runtime_health.band : null },
      { key: "regulatory_readiness", label: "Evidence completeness", value: h ? h.scores.evidence_completeness.score : "—", band: h ? h.scores.evidence_completeness.band : null },
    ];
  },

  dashboard(ctx, pack) {
    const claimTools = (ctx.entities.tool || []).filter((t) => CLAIMS.test(t.name));
    const uwTools = (ctx.entities.tool || []).filter((t) => UNDERWRITING.test(t.name));
    const insPolicies = ctx.scopedPolicies.filter((p) => p.name.startsWith("ins_"));
    return [
      S.stat("posture", "Insurance governance posture", [
        { label: "Claims tools", value: claimTools.length },
        { label: "Underwriting tools", value: uwTools.length },
        { label: "Insurance policies live", value: insPolicies.length },
        { label: "Open incidents", value: ctx.incidents.length },
      ]),
      S.list("claims", "Claims governance", claimTools.map((t) => ({ title: t.name, meta: "adjuster approval + settlement threshold" })), "No claims tools in the estate."),
      S.list("underwriting", "Underwriting AI governance", uwTools.map((t) => ({ title: t.name, meta: "underwriter review required" })), "No underwriting tools in the estate."),
      S.list("fraud", "Fraud detection refusals", ctx.blocked.filter((b) => FRAUD.test(`${b.action_id} ${b.reason || ""}`)).slice(0, 10).map((b) => ({ title: b.action_id, meta: b.reason, severity: "critical" })), "No fraud-related refusals this window."),
      S.list("risk", "Risk monitoring", ((ctx.drift && ctx.drift.open) || []).map((d) => ({ title: d.subject, meta: d.detail, severity: S.severity(d.severity) })), "No governance drift since baseline."),
      S.list("policies", "Insurance policies enforced", insPolicies.map((p) => ({ title: p.name, meta: `${p.domain} · v${p.version} · active` })), "Install the pack to activate insurance policies."),
      S.list("regmap", "Regulatory mappings", pack.evidence_mappings.map((m) => ({ title: `${m.regulation} — ${m.control}`, meta: m.evidence }))),
      S.list("packs", "Regulatory evidence exports", ctx.packs.map((p) => ({ title: `Evidence pack ${p.period}`, meta: `signed ${String(p.hash).slice(0, 16)}… · Solvency II aligned` })), "No evidence packs generated yet."),
    ];
  },

  recommendations(ctx) {
    const out = [];
    const policyTools = new Set();
    for (const p of ctx.scopedPolicies) for (const t of ((p.spec && p.spec.match && p.spec.match.tools) || [])) policyTools.add(t);
    for (const t of (ctx.entities.tool || [])) {
      if (CLAIMS.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Require adjuster approval for claims tool: ${t.name}`, detail: `Claims tool "${t.name}" can affect a policyholder outcome with no governing policy (GDPR Art.22).`, severity: "critical" });
      if (UNDERWRITING.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Add underwriter review to: ${t.name}`, detail: `Underwriting tool "${t.name}" is ungoverned — EU AI Act treats insurance pricing as high-risk.`, severity: "critical" });
    }
    return out;
  },
};

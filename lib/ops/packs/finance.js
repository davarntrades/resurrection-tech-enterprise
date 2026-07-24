/* Guardian OS — Finance Intelligence Pack.
 *
 * Payment, trading, fraud and model-risk governance for financial enterprises.
 * Declarative only — projections over the ONE shared enterprise context. */
"use strict";
const S = require("../sections");

const PAYMENT = /wire|payment|transfer|settle|disburse|payout|remit/i;
const TRADING = /trade|trading|order|execute_order|position|hedge|market/i;
const FRAUD = /fraud|aml|kyc|sanction|screen|suspicious/i;

module.exports = {
  id: "finance",
  version: "1.0.0",
  industry: "Financial services",
  title: "Finance Intelligence Pack",
  purpose: "Payment, trading, fraud and model-risk governance for financial enterprises.",
  match: ["financ", "bank", "payment", "fintech", "trading", "capital", "wealth", "treasury", "lending"],
  regulations: ["FCA SYSC", "PSD2 / SCA", "AML / KYC", "PCI-DSS", "SR 11-7 model risk", "MiFID II", "DORA", "EU AI Act — high-risk"],

  policies: [
    { name: "fin_payment_requires_approval", domain: "finance",
      spec: { match: { tools: ["wire_transfer", "send_payment", "disburse_funds", "initiate_payout"] },
        conditions: { unauthorized_unless: ["operator_approved", "payment_approved"] }, severity: "critical" } },
    { name: "fin_large_value_threshold", domain: "banking",
      spec: { match: { tools: ["wire_transfer", "send_payment", "disburse_funds"] },
        conditions: { threshold: { field: "amount", op: ">", value: 10000 } }, severity: "critical" } },
    { name: "fin_trading_autonomy_limit", domain: "finance",
      spec: { match: { tools: ["execute_order", "place_trade", "rebalance_portfolio", "close_position"] },
        conditions: { unauthorized_unless: ["desk_approved", "operator_approved"] }, severity: "critical" } },
    { name: "fin_block_sanctions_bypass", domain: "fraud",
      spec: { match: { tools: ["override_screening", "bypass_kyc", "clear_alert"] },
        conditions: { flag_true_blocks: ["screening_bypassed"] }, severity: "critical" } },
  ],

  templates: [
    { name: "fin_desk_limit", description: "Cap a trading desk's autonomous notional exposure.", domain: "finance",
      spec: { match: { tools: ["<trading_tool>"] }, conditions: { threshold: { field: "notional", op: ">", value: 100000 } }, severity: "critical" } },
    { name: "fin_dual_control_payment", description: "Require dual control on a named payment rail.", domain: "banking",
      spec: { match: { tools: ["<payment_tool>"] }, conditions: { unauthorized_unless: ["maker_approved", "checker_approved"] }, severity: "critical" } },
  ],

  evidence_mappings: [
    { regulation: "SR 11-7", control: "Model risk management", evidence: "Every model-driven action carries a governed verdict + reason; the model estate and its policies are versioned." },
    { regulation: "FCA SYSC 8", control: "Operational controls", evidence: "Privileged financial tools require approval at runtime; refusals are retained as evidence." },
    { regulation: "AML / KYC", control: "Screening integrity", evidence: "Screening-bypass attempts are blocked fail-closed and recorded." },
    { regulation: "PSD2 / SCA", control: "Strong authorisation of payments", evidence: "Payments above threshold escalate to a human approver; the approval chain is retained." },
    { regulation: "DORA", control: "ICT risk + evidence", evidence: "Content-signed evidence packs provide the periodic operational-resilience record." },
  ],

  incident_workflows: [
    { kind: "unauthorised_payment_attempt", severity: "critical", steps: ["Confirm the runtime block held", "Trace originating agent + trajectory", "Notify Financial Crime + the payments desk", "Tighten the payment policy / lower the threshold", "Attach evidence to the regulatory pack"] },
    { kind: "model_risk_breach", severity: "warning", steps: ["Identify the model + its governed actions", "Assess drift against the governed baseline", "Escalate to Model Risk Committee", "Recalibrate or restrict the model's tools"] },
  ],

  metrics(ctx) {
    const payTools = (ctx.entities.tool || []).filter((t) => PAYMENT.test(t.name));
    const tradeTools = (ctx.entities.tool || []).filter((t) => TRADING.test(t.name));
    const blocked = ctx.blocked.length;
    const fraudBlocks = ctx.blocked.filter((b) => FRAUD.test(`${b.action_id} ${b.reason || ""} ${b.rule || ""}`)).length;
    const h = ctx.health;
    const exposure = payTools.length + tradeTools.length;
    // Risk concentration: share of privileged capability sitting in one system.
    const systems = (ctx.entities.ai_system || []).length || 1;
    const concentration = S.clamp((exposure / Math.max(systems, 1)) * 25);
    return [
      { key: "ai_financial_exposure", label: "AI financial exposure", value: exposure, hint: "payment + trading tools reachable by agents" },
      { key: "governance_roi", label: "Governance ROI — blocked exposures", value: blocked, hint: "privileged/unsafe financial actions the kernel refused" },
      { key: "fraud_prevention", label: "Fraud prevention refusals", value: fraudBlocks },
      { key: "approval_latency", label: "Approval responsiveness", value: h ? h.scores.approval_responsiveness.score : "—", band: h ? h.scores.approval_responsiveness.band : null },
      { key: "risk_concentration", label: "Risk concentration", value: concentration, band: S.band(100 - concentration), hint: "privileged financial capability per AI system" },
    ];
  },

  dashboard(ctx, pack) {
    const payTools = (ctx.entities.tool || []).filter((t) => PAYMENT.test(t.name));
    const tradeTools = (ctx.entities.tool || []).filter((t) => TRADING.test(t.name));
    const finPolicies = ctx.scopedPolicies.filter((p) => p.name.startsWith("fin_"));
    const payBlocks = ctx.blocked.filter((b) => PAYMENT.test(`${b.action_id} ${b.reason || ""}`));
    const models = ctx.entities.model || [];
    return [
      S.stat("exposure", "AI financial exposure", [
        { label: "Payment tools", value: payTools.length },
        { label: "Trading tools", value: tradeTools.length },
        { label: "Models in scope", value: models.length },
        { label: "Finance policies live", value: finPolicies.length },
      ]),
      S.list("payments", "Payment governance", payTools.map((t) => ({ title: t.name, meta: t.attrs && t.attrs.privileged ? "privileged — approval required" : "governed" })), "No payment tools in the estate."),
      S.list("trading", "Trading governance", tradeTools.map((t) => ({ title: t.name, meta: "desk approval required" })), "No trading tools in the estate."),
      S.list("blocked", "Blocked financial actions", payBlocks.slice(0, 10).map((b) => ({ title: b.action_id, meta: b.reason, severity: "critical" })), "No blocked financial actions this window."),
      S.list("modelrisk", "Model risk oversight", models.map((m) => ({ title: m.name, meta: "governed by runtime policy + evidence trail" })), "No models registered in the estate."),
      S.list("policies", "Financial policies enforced", finPolicies.map((p) => ({ title: p.name, meta: `${p.domain} · v${p.version} · active` })), "Install the pack to activate financial policies."),
      S.list("regmap", "Regulatory mappings", pack.evidence_mappings.map((m) => ({ title: `${m.regulation} — ${m.control}`, meta: m.evidence }))),
      S.list("packs", "Financial evidence packs", ctx.packs.map((p) => ({ title: `Evidence pack ${p.period}`, meta: `signed ${String(p.hash).slice(0, 16)}… · SR 11-7 / DORA aligned` })), "No evidence packs generated yet."),
      S.note("spend", "AI cost exposure in currency", "Connect a billing/usage source to express exposure and governance ROI in currency. Counts above are grounded in the real estate + evidence ledger."),
    ];
  },

  recommendations(ctx) {
    const out = [];
    const policyTools = new Set();
    for (const p of ctx.scopedPolicies) for (const t of ((p.spec && p.spec.match && p.spec.match.tools) || [])) policyTools.add(t);
    for (const t of (ctx.entities.tool || [])) {
      if (PAYMENT.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Require dual approval for payment tool: ${t.name}`, detail: `Payment tool "${t.name}" is reachable by an agent with no active runtime policy governing it (PSD2/SCA, FCA SYSC 8).`, severity: "critical" });
      if (TRADING.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Apply a desk limit to trading tool: ${t.name}`, detail: `Trading tool "${t.name}" has no governing policy — autonomous execution is ungoverned.`, severity: "critical" });
    }
    if (ctx.health && ctx.health.scores.approval_responsiveness.score < 60) out.push({ title: "Reduce payment approval latency", detail: "Approval responsiveness is low — financial escalations are queuing, which delays legitimate payments and weakens the control.", severity: "warning" });
    return out;
  },
};

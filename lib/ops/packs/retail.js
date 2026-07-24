/* Guardian OS — Retail Intelligence Pack.
 * Customer AI governance, pricing governance, inventory and supply-chain
 * intelligence for commerce enterprises. Declarative only. */
"use strict";
const S = require("../sections");

const PRICING = /price|pricing|discount|promo|markdown|repric/i;
const CUSTOMER = /customer|shopper|recommend|personalis|personaliz|loyalty|segment|churn/i;
const INVENTORY = /inventory|stock|reorder|replenish|fulfil|fulfill|warehouse|supply/i;

module.exports = {
  id: "retail",
  version: "1.0.0",
  industry: "Retail & commerce",
  title: "Retail Intelligence Pack",
  purpose: "Customer AI governance, pricing governance and supply-chain intelligence for commerce enterprises.",
  match: ["retail", "commerce", "ecommerce", "shop", "store", "consumer", "merchand", "supply chain", "logistics"],
  regulations: ["GDPR / ePrivacy", "Consumer protection (unfair pricing)", "PCI-DSS", "Digital Services Act", "Price transparency rules"],

  policies: [
    { name: "ret_pricing_change_requires_approval", domain: "enterprise",
      spec: { match: { tools: ["set_price", "apply_discount", "reprice_catalog", "launch_promotion"] },
        conditions: { unauthorized_unless: ["merchandising_approved", "operator_approved"] }, severity: "critical" } },
    { name: "ret_discount_depth_limit", domain: "enterprise",
      spec: { match: { tools: ["apply_discount", "launch_promotion"] },
        conditions: { threshold: { field: "discount_pct", op: ">", value: 40 } }, severity: "critical" } },
    { name: "ret_block_customer_data_export", domain: "data_privacy",
      spec: { match: { tools: ["export_customers", "share_segment", "bulk_export"] },
        conditions: { flag_true_blocks: ["destination_external"] }, severity: "critical" } },
  ],

  templates: [
    { name: "ret_personalisation_guard", description: "Block personalisation that uses a protected or sensitive attribute.", domain: "data_privacy",
      spec: { match: { tools: ["<personalisation_tool>"] }, conditions: { flag_true_blocks: ["uses_sensitive_attribute"] }, severity: "critical" } },
  ],

  evidence_mappings: [
    { regulation: "GDPR / ePrivacy", control: "Customer data minimisation", evidence: "External customer-data export is blocked fail-closed; attempts are evidence." },
    { regulation: "Consumer protection", control: "Fair + transparent pricing", evidence: "Pricing actions require approval and discount depth is capped at runtime." },
    { regulation: "Digital Services Act", control: "Recommender transparency", evidence: "Personalisation tools are governed and their policy specs are inspectable." },
  ],

  incident_workflows: [
    { kind: "pricing_error", severity: "critical", steps: ["Freeze the pricing agent", "Identify affected SKUs + orders", "Assess consumer-protection exposure", "Corrective policy (depth cap / approval)", "Record remediation evidence"] },
  ],

  metrics(ctx) {
    const priceTools = (ctx.entities.tool || []).filter((t) => PRICING.test(t.name));
    const custTools = (ctx.entities.tool || []).filter((t) => CUSTOMER.test(t.name));
    const invTools = (ctx.entities.tool || []).filter((t) => INVENTORY.test(t.name));
    const h = ctx.health;
    return [
      { key: "pricing_governance", label: "Pricing tools governed", value: priceTools.length },
      { key: "customer_ai", label: "Customer AI tools", value: custTools.length },
      { key: "supply_chain", label: "Inventory / supply tools", value: invTools.length },
      { key: "commerce_health", label: "Runtime health", value: h ? h.scores.runtime_health.score : "—", band: h ? h.scores.runtime_health.band : null },
      { key: "data_protection", label: "Policy coverage", value: h ? h.scores.policy_coverage.score : "—", band: h ? h.scores.policy_coverage.band : null },
    ];
  },

  dashboard(ctx, pack) {
    const priceTools = (ctx.entities.tool || []).filter((t) => PRICING.test(t.name));
    const custTools = (ctx.entities.tool || []).filter((t) => CUSTOMER.test(t.name));
    const invTools = (ctx.entities.tool || []).filter((t) => INVENTORY.test(t.name));
    const retPolicies = ctx.scopedPolicies.filter((p) => p.name.startsWith("ret_"));
    return [
      S.stat("commerce", "Executive commerce view", [
        { label: "Pricing tools", value: priceTools.length },
        { label: "Customer AI tools", value: custTools.length },
        { label: "Inventory tools", value: invTools.length },
        { label: "Retail policies live", value: retPolicies.length },
      ]),
      S.list("pricing", "Pricing governance", priceTools.map((t) => ({ title: t.name, meta: "merchandising approval + discount cap" })), "No pricing tools in the estate."),
      S.list("customer", "Customer AI governance", custTools.map((t) => ({ title: t.name, meta: "customer-data boundary enforced" })), "No customer AI tools in the estate."),
      S.list("inventory", "Inventory + supply chain intelligence", invTools.map((t) => ({ title: t.name, meta: "governed operational tool" })), "No inventory/supply tools in the estate."),
      S.list("policies", "Retail policies enforced", retPolicies.map((p) => ({ title: p.name, meta: `${p.domain} · v${p.version} · active` })), "Install the pack to activate retail policies."),
      S.list("regmap", "Regulatory mappings", pack.evidence_mappings.map((m) => ({ title: `${m.regulation} — ${m.control}`, meta: m.evidence }))),
      S.note("revenue", "Commercial performance (revenue, margin, conversion)", "Connect a commerce/analytics source to show revenue, margin and conversion alongside governance. Everything above is grounded in the governed estate."),
    ];
  },

  recommendations(ctx) {
    const out = [];
    const policyTools = new Set();
    for (const p of ctx.scopedPolicies) for (const t of ((p.spec && p.spec.match && p.spec.match.tools) || [])) policyTools.add(t);
    for (const t of (ctx.entities.tool || [])) {
      if (PRICING.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Govern autonomous pricing tool: ${t.name}`, detail: `Pricing tool "${t.name}" can change customer-facing prices with no approval or discount cap — consumer-protection exposure.`, severity: "critical" });
      if (CUSTOMER.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Add a customer-data boundary to: ${t.name}`, detail: `Customer AI tool "${t.name}" is ungoverned — personal data handling should be policy-bounded (GDPR).`, severity: "warning" });
    }
    return out;
  },
};

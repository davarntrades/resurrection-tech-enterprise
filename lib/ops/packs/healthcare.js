/* Guardian OS — Healthcare Intelligence Pack.
 *
 * Clinical AI governance, patient-safety monitoring and regulatory evidence.
 * Declarative only: Ω policy specs (deny-only), templates, evidence mappings,
 * incident workflows, and projections over the ONE shared enterprise context.
 * No platform functionality is duplicated and the kernel is never modified. */
"use strict";
const S = require("../sections");

const CLINICAL = /clinical|patient|diagnos|triage|prescri|medic|ehr|emr|treatment|care/i;

module.exports = {
  id: "healthcare",
  version: "1.0.0",
  industry: "Healthcare",
  title: "Healthcare Intelligence Pack",
  purpose: "Clinical AI governance, patient-safety monitoring and regulatory evidence for healthcare enterprises.",
  match: ["health", "healthcare", "hospital", "clinical", "medical", "patient", "care", "life science", "pharma"],
  regulations: ["HIPAA", "GDPR (special category)", "FDA SaMD", "EU AI Act — high-risk", "NHS DSPT", "ISO 13485"],

  // Deny-only Ω policies — installed through the dynamic policy engine.
  policies: [
    { name: "hc_clinical_action_requires_clinician", domain: "healthcare",
      spec: { match: { tools: ["prescribe_medication", "order_treatment", "update_care_plan", "discharge_patient", "triage_patient"] },
        conditions: { unauthorized_unless: ["clinician_approved", "operator_approved"] }, severity: "critical" } },
    { name: "hc_block_phi_external_disclosure", domain: "data_privacy",
      spec: { match: { tools: ["export_documents", "share_record", "send_patient_record", "bulk_export"] },
        conditions: { flag_true_blocks: ["destination_external", "contains_phi"] }, severity: "critical" } },
    { name: "hc_diagnostic_autonomy_limit", domain: "healthcare",
      spec: { match: { tools: ["issue_diagnosis", "autonomous_diagnosis"] },
        conditions: { unauthorized_unless: ["clinician_reviewed"] }, severity: "critical" } },
  ],

  templates: [
    { name: "hc_restrict_high_risk_model", description: "Require clinician sign-off for a named high-risk clinical model.",
      domain: "healthcare", spec: { match: { tools: ["<clinical_tool>"] }, conditions: { unauthorized_unless: ["clinician_approved"] }, severity: "critical" } },
    { name: "hc_minimum_necessary_phi", description: "Block bulk PHI reads that exceed the minimum-necessary standard.",
      domain: "data_privacy", spec: { match: { tools: ["bulk_read_records"] }, conditions: { threshold: { field: "record_count", op: ">", value: 50 } }, severity: "critical" } },
  ],

  evidence_mappings: [
    { regulation: "HIPAA §164.312(b)", control: "Audit controls", evidence: "Every governed action is recorded in the evidence ledger with verdict, rule and trajectory hash." },
    { regulation: "HIPAA §164.308(a)(4)", control: "Information access management", evidence: "Privileged clinical tools require clinician approval — enforced at runtime, refusals are evidence." },
    { regulation: "EU AI Act Art.14", control: "Human oversight of high-risk AI", evidence: "Clinical actions escalate to a human approver; the approval chain is retained." },
    { regulation: "GDPR Art.9", control: "Special-category data", evidence: "External PHI disclosure is blocked fail-closed; blocked attempts are logged." },
    { regulation: "FDA SaMD", control: "Change control", evidence: "Policy versions + governance baseline drift show every change to the clinical estate." },
  ],

  incident_workflows: [
    { kind: "patient_safety_signal", severity: "critical", steps: ["Open incident + notify clinical safety officer", "Pause the implicated clinical agent", "Assemble evidence timeline for the affected records", "Clinical review + corrective policy", "Regulator-ready evidence export"] },
    { kind: "phi_disclosure_attempt", severity: "critical", steps: ["Confirm the runtime block held", "Trace the originating agent + trajectory", "Assess reportability (HIPAA breach rule)", "Tighten the export policy", "Attach evidence to the compliance pack"] },
  ],

  // ── Executive metrics — derived from the SHARED context, never re-queried ──
  metrics(ctx) {
    const clinical = (ctx.entities.agent || []).filter((a) => CLINICAL.test(a.name));
    const highRisk = (ctx.entities.tool || []).filter((t) => (t.attrs && t.attrs.privileged) || CLINICAL.test(t.name));
    const criticalInc = ctx.incidents.filter((i) => i.severity === "critical");
    const h = ctx.health;
    const safety = h ? S.clamp(h.scores.policy_coverage.score * 0.5 + h.scores.runtime_health.score * 0.3 + h.scores.drift_score.score * 0.2) : null;
    return [
      { key: "clinical_ai_health", label: "Clinical AI health", value: h ? h.scores.runtime_health.score : "—", band: h ? h.scores.runtime_health.band : null },
      { key: "safety_posture", label: "Safety posture", value: safety == null ? "—" : safety, band: safety == null ? null : S.band(safety) },
      { key: "high_risk_systems", label: "High-risk systems", value: highRisk.length, hint: "privileged or clinical tools" },
      { key: "critical_incidents", label: "Critical incidents", value: criticalInc.length },
      { key: "governance_maturity", label: "Governance maturity", value: h ? h.scores.governance_maturity.score : "—", band: h ? h.scores.governance_maturity.band : null },
      { key: "clinical_agents", label: "Clinical AI agents", value: clinical.length },
    ];
  },

  // ── Specialised dashboard — same section vocabulary as every other surface ─
  dashboard(ctx, pack) {
    const clinical = (ctx.entities.agent || []).filter((a) => CLINICAL.test(a.name));
    const highRisk = (ctx.entities.tool || []).filter((t) => (t.attrs && t.attrs.privileged) || CLINICAL.test(t.name));
    const phiBlocks = ctx.blocked.filter((b) => /export|share|record|phi|disclos/i.test(`${b.action_id} ${b.reason || ""}`));
    const hcPolicies = ctx.scopedPolicies.filter((p) => p.name.startsWith("hc_"));
    return [
      S.stat("clinical", "Clinical AI governance", [
        { label: "Clinical agents", value: clinical.length },
        { label: "High-risk systems", value: highRisk.length },
        { label: "Healthcare policies live", value: hcPolicies.length },
        { label: "Open incidents", value: ctx.incidents.length },
      ]),
      S.list("systems", "Clinical AI systems under governance", clinical.map((a) => ({ title: a.name, meta: `${(a.refs || []).length} mapped dependencies` })), "No clinical AI agents detected in the estate."),
      S.list("safety", "Patient safety monitoring", ctx.incidents.map((i) => ({ title: i.summary || i.kind, meta: `${i.severity} · ${i.created_at}`, severity: S.severity(i.severity) })), "No patient-safety signals open."),
      S.list("phi", "PHI disclosure attempts (blocked)", phiBlocks.slice(0, 10).map((b) => ({ title: b.action_id, meta: b.reason, severity: "critical" })), "No PHI disclosure attempts — the export boundary is holding."),
      S.list("policies", "Healthcare policies enforced", hcPolicies.map((p) => ({ title: p.name, meta: `${p.domain} · v${p.version} · active` })), "Install the pack to activate healthcare policies."),
      S.list("regmap", "Regulatory mappings", pack.evidence_mappings.map((m) => ({ title: `${m.regulation} — ${m.control}`, meta: m.evidence }))),
      S.list("workflows", "Healthcare incident workflows", pack.incident_workflows.map((w) => ({ title: w.kind.replace(/_/g, " "), meta: w.steps.join(" → "), severity: w.severity }))),
      S.list("exports", "Healthcare evidence exports", ctx.packs.map((p) => ({ title: `Evidence pack ${p.period}`, meta: `signed ${String(p.hash).slice(0, 16)}… · HIPAA/EU AI Act aligned` })), "No evidence packs generated yet."),
    ];
  },

  // ── Recommendations — flow through the SAME governed proposal path ────────
  recommendations(ctx) {
    const out = [];
    const policyTools = new Set();
    for (const p of ctx.scopedPolicies) for (const t of ((p.spec && p.spec.match && p.spec.match.tools) || [])) policyTools.add(t);
    for (const t of (ctx.entities.tool || [])) {
      if (CLINICAL.test(t.name) && !policyTools.has(t.name)) {
        out.push({ title: `Require clinician approval for clinical tool: ${t.name}`, detail: `Clinical tool "${t.name}" has no active runtime policy requiring clinician sign-off (EU AI Act Art.14 human oversight).`, severity: "critical" });
      }
    }
    if (ctx.incidents.some((i) => i.severity === "critical")) {
      out.push({ title: "Convene clinical safety review for open critical incidents", detail: "One or more critical incidents are open on a clinically-governed estate — run the patient-safety workflow and attach the evidence timeline.", severity: "critical" });
    }
    if (ctx.packs.length === 0) {
      out.push({ title: "Generate the first HIPAA-aligned evidence pack", detail: "No signed evidence pack exists yet — regulators expect a periodic, content-signed governance record.", severity: "warning" });
    }
    return out;
  },
};

/* Guardian OS — Cybersecurity Intelligence Pack.
 *
 * Threat intelligence, runtime-attack monitoring and privileged-action
 * governance for security operations. Declarative only. */
"use strict";
const S = require("../sections");

// The engine's security-relevant refusal rules (already governed by the kernel).
const ATTACK_RULES = new Set([
  "ops_evidence_destruction", "ops_credential_sharing", "ops_unauthorized_autonomy_change",
  "ops_internal_action_external_reach", "ops_unauthorized_policy_activation",
]);
const PRIVILEGED = /deploy|delete|drop|escalate|grant|revoke|credential|secret|key|token|admin|sudo|exfiltrat/i;

module.exports = {
  id: "cybersecurity",
  version: "1.0.0",
  industry: "Cybersecurity",
  title: "Cybersecurity Intelligence Pack",
  purpose: "Threat intelligence, runtime-attack monitoring and privileged-action governance for security operations.",
  match: ["security", "cyber", "soc", "mssp", "threat", "infosec", "detection"],
  regulations: ["ISO 27001", "SOC 2", "NIST CSF", "NIS2", "CIS Controls", "MITRE ATT&CK"],

  policies: [
    { name: "sec_privileged_action_requires_approval", domain: "cybersecurity",
      spec: { match: { tools: ["grant_access", "revoke_access", "rotate_credential", "escalate_privilege", "disable_control"] },
        conditions: { unauthorized_unless: ["security_approved", "operator_approved"] }, severity: "critical" } },
    { name: "sec_block_credential_exfiltration", domain: "cybersecurity",
      spec: { match: { tools: ["read_secret", "export_credentials", "dump_environment", "exfiltrate_data"] },
        conditions: { flag_true_blocks: ["destination_external"] }, severity: "critical" } },
    { name: "sec_block_control_disablement", domain: "cybersecurity",
      spec: { match: { tools: ["disable_logging", "disable_monitoring", "delete_audit_log", "suppress_alert"] },
        conditions: {}, severity: "critical" } },
  ],

  templates: [
    { name: "sec_break_glass", description: "Allow an emergency action only under an explicit break-glass approval.", domain: "cybersecurity",
      spec: { match: { tools: ["<emergency_tool>"] }, conditions: { unauthorized_unless: ["break_glass_approved", "operator_approved"] }, severity: "critical" } },
    { name: "sec_egress_limit", description: "Block bulk egress above a record threshold.", domain: "cybersecurity",
      spec: { match: { tools: ["<egress_tool>"] }, conditions: { threshold: { field: "record_count", op: ">", value: 1000 } }, severity: "critical" } },
  ],

  evidence_mappings: [
    { regulation: "ISO 27001 A.9", control: "Access control", evidence: "Privileged access changes require security approval at runtime; every attempt is evidence." },
    { regulation: "SOC 2 CC7", control: "Detection + monitoring", evidence: "Control-disablement attempts (logging/monitoring) are blocked fail-closed and recorded." },
    { regulation: "NIST CSF PR.AC", control: "Identity + access management", evidence: "The trust architecture (IdPs, approvers, operators) is modelled and drift-monitored." },
    { regulation: "NIS2 Art.21", control: "Incident handling", evidence: "Incident timeline + evidence packs give the reportable record." },
    { regulation: "MITRE ATT&CK T1070", control: "Indicator removal defence", evidence: "Evidence destruction is refused by the kernel and the refusal itself is retained." },
  ],

  incident_workflows: [
    { kind: "runtime_attack_attempt", severity: "critical", steps: ["Confirm the governed refusal held", "Attribute the agent + trajectory hash", "Correlate with the evidence graph", "Contain: pause the agent / tighten the policy", "Export the attack evidence timeline"] },
    { kind: "privilege_escalation", severity: "critical", steps: ["Verify the escalation was blocked or approved", "Review the approval chain", "Check the governed baseline for permission drift", "Re-affirm least privilege"] },
  ],

  metrics(ctx) {
    const attacks = ctx.blocked.filter((b) => b.rule && ATTACK_RULES.has(b.rule));
    const violations = ctx.blocked.length;
    const openInc = ctx.incidents.length;
    const h = ctx.health;
    const secHealth = h ? S.clamp(h.scores.runtime_health.score * 0.4 + h.scores.policy_coverage.score * 0.3 + h.scores.drift_score.score * 0.3) : null;
    // Threat level rises with refused attacks, open incidents and critical drift.
    const criticalDrift = ((ctx.drift && ctx.drift.open) || []).filter((d) => d.severity === "critical").length;
    const threat = S.clamp(attacks.length * 20 + openInc * 10 + criticalDrift * 15);
    const level = threat >= 70 ? "severe" : threat >= 40 ? "elevated" : threat >= 15 ? "guarded" : "low";
    return [
      { key: "security_health", label: "Security health", value: secHealth == null ? "—" : secHealth, band: secHealth == null ? null : S.band(secHealth) },
      { key: "threat_level", label: "Threat level", value: level, hint: `index ${threat}`, band: threat >= 40 ? "weak" : threat >= 15 ? "watch" : "strong" },
      { key: "active_incidents", label: "Active incidents", value: openInc },
      { key: "runtime_attacks", label: "Runtime attack attempts", value: attacks.length, hint: "governed refusals on security rules" },
      { key: "policy_violations", label: "Policy violations", value: violations },
    ];
  },

  dashboard(ctx, pack) {
    const attacks = ctx.blocked.filter((b) => b.rule && ATTACK_RULES.has(b.rule));
    const privTools = (ctx.entities.tool || []).filter((t) => PRIVILEGED.test(t.name) || (t.attrs && t.attrs.privileged));
    const secPolicies = ctx.scopedPolicies.filter((p) => p.name.startsWith("sec_"));
    const boundaryDrift = ((ctx.drift && ctx.drift.open) || []).filter((d) => d.kind === "trust_boundary_violation" || d.kind === "permission_change" || d.kind === "removed_control");
    return [
      S.stat("posture", "Security posture", [
        { label: "Runtime attacks refused", value: attacks.length },
        { label: "Blocked actions", value: ctx.blocked.length },
        { label: "Privileged tools", value: privTools.length },
        { label: "Active incidents", value: ctx.incidents.length },
        { label: "Security policies live", value: secPolicies.length },
      ]),
      S.list("attacks", "Runtime attack monitoring", attacks.slice(0, 12).map((b) => ({ title: b.rule, meta: `${b.action_id}: ${b.reason}`, severity: "critical" })), "No runtime attacks refused this window."),
      S.list("privileged", "Privileged action governance", privTools.map((t) => ({ title: t.name, meta: t.attrs && t.attrs.privileged ? "privileged — approval required" : "sensitive capability" })), "No privileged tools in the estate."),
      S.list("boundary", "Trust boundary + permission changes", boundaryDrift.map((d) => ({ title: d.subject, meta: d.detail, severity: S.severity(d.severity) })), "No boundary or permission drift since baseline."),
      S.timeline("incidents", "Incident management", ctx.incidents.map((i) => ({ title: i.summary || i.kind, meta: `${i.severity} · ${i.created_at}` })), "No open incidents."),
      S.timeline("evidence", "Evidence timeline", ctx.recentEv.slice(0, 15).map((e) => ({ title: `${e.action_id} — ${e.verdict}`, meta: `${e.reason || ""} · ${e.created_at}` })), "No evidence yet."),
      S.list("policies", "Security policies enforced", secPolicies.map((p) => ({ title: p.name, meta: `${p.domain} · v${p.version} · active` })), "Install the pack to activate security policies."),
      S.list("workflows", "Runtime attack response", pack.incident_workflows.map((w) => ({ title: w.kind.replace(/_/g, " "), meta: w.steps.join(" → "), severity: w.severity }))),
      S.list("regmap", "Control mappings", pack.evidence_mappings.map((m) => ({ title: `${m.regulation} — ${m.control}`, meta: m.evidence }))),
    ];
  },

  recommendations(ctx) {
    const out = [];
    const policyTools = new Set();
    for (const p of ctx.scopedPolicies) for (const t of ((p.spec && p.spec.match && p.spec.match.tools) || [])) policyTools.add(t);
    for (const t of (ctx.entities.tool || [])) {
      if (PRIVILEGED.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Govern privileged capability: ${t.name}`, detail: `Tool "${t.name}" exposes privileged capability with no active runtime policy (ISO 27001 A.9 least privilege).`, severity: "critical" });
    }
    const attacks = ctx.blocked.filter((b) => b.rule && ATTACK_RULES.has(b.rule));
    if (attacks.length > 0) out.push({ title: `Investigate ${attacks.length} refused runtime attack attempt(s)`, detail: "The kernel refused security-rule violations. Attribute the originating agent, correlate with the evidence graph and contain.", severity: "critical" });
    if (((ctx.drift && ctx.drift.open) || []).some((d) => d.kind === "removed_control")) out.push({ title: "Restore removed security control", detail: "A control present at the governed baseline is now missing — restore it or record an accepted risk.", severity: "critical" });
    return out;
  },
};

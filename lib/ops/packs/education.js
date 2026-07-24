/* Guardian OS — Education Intelligence Pack.
 * Educational AI governance, student-data governance and institutional
 * oversight. Declarative only. */
"use strict";
const S = require("../sections");

const STUDENT = /student|pupil|learner|enrol|enroll|admission|grade|assess|exam|transcript/i;
const ACADEMIC = /tutor|teach|curriculum|course|lesson|proctor|plagiar/i;

module.exports = {
  id: "education",
  version: "1.0.0",
  industry: "Education",
  title: "Education Intelligence Pack",
  purpose: "Educational AI governance, student-data protection and institutional oversight for education providers.",
  match: ["educat", "school", "university", "college", "academ", "learning", "student", "campus"],
  regulations: ["FERPA", "GDPR (children's data)", "COPPA", "EU AI Act — education (high-risk)", "Safeguarding duties", "Accessibility (WCAG)"],

  policies: [
    { name: "edu_academic_decision_requires_educator", domain: "compliance",
      spec: { match: { tools: ["assign_grade", "decide_admission", "flag_misconduct", "exclude_student"] },
        conditions: { unauthorized_unless: ["educator_approved", "operator_approved"] }, severity: "critical" } },
    { name: "edu_block_student_data_export", domain: "data_privacy",
      spec: { match: { tools: ["export_students", "share_records", "bulk_export"] },
        conditions: { flag_true_blocks: ["destination_external", "contains_student_data"] }, severity: "critical" } },
    { name: "edu_proctoring_requires_consent", domain: "data_privacy",
      spec: { match: { tools: ["start_proctoring", "analyse_behaviour", "record_session"] },
        conditions: { unauthorized_unless: ["consent_recorded"] }, severity: "critical" } },
  ],

  templates: [
    { name: "edu_minor_data_guard", description: "Block processing flagged as involving a minor's data without safeguarding approval.", domain: "data_privacy",
      spec: { match: { tools: ["<student_tool>"] }, conditions: { unauthorized_unless: ["safeguarding_approved"] }, severity: "critical" } },
  ],

  evidence_mappings: [
    { regulation: "FERPA", control: "Education record disclosure", evidence: "External student-record export is blocked fail-closed; attempts are retained as evidence." },
    { regulation: "EU AI Act — education", control: "High-risk oversight of assessment", evidence: "Grading/admission decisions escalate to an educator; the approval chain is retained." },
    { regulation: "GDPR (children)", control: "Lawful basis + consent", evidence: "Proctoring/behaviour analysis requires recorded consent at runtime." },
    { regulation: "Safeguarding", control: "Duty of care", evidence: "Incident workflows + evidence timeline document institutional response." },
  ],

  incident_workflows: [
    { kind: "student_data_disclosure", severity: "critical", steps: ["Confirm the runtime block held", "Identify affected students", "Notify the DPO + safeguarding lead", "Assess FERPA/GDPR reportability", "Tighten the export policy + record evidence"] },
  ],

  metrics(ctx) {
    const studentTools = (ctx.entities.tool || []).filter((t) => STUDENT.test(t.name));
    const academicTools = (ctx.entities.tool || []).filter((t) => ACADEMIC.test(t.name));
    const h = ctx.health;
    return [
      { key: "student_data_governance", label: "Student-data tools governed", value: studentTools.length },
      { key: "academic_ai", label: "Academic AI tools", value: academicTools.length },
      { key: "oversight", label: "Institutional oversight", value: h ? h.scores.policy_coverage.score : "—", band: h ? h.scores.policy_coverage.band : null },
      { key: "compliance_readiness", label: "Evidence completeness", value: h ? h.scores.evidence_completeness.score : "—", band: h ? h.scores.evidence_completeness.band : null },
      { key: "incidents", label: "Open incidents", value: ctx.incidents.length },
    ];
  },

  dashboard(ctx, pack) {
    const studentTools = (ctx.entities.tool || []).filter((t) => STUDENT.test(t.name));
    const academicTools = (ctx.entities.tool || []).filter((t) => ACADEMIC.test(t.name));
    const eduPolicies = ctx.scopedPolicies.filter((p) => p.name.startsWith("edu_"));
    const dataBlocks = ctx.blocked.filter((b) => /student|record|export|share/i.test(`${b.action_id} ${b.reason || ""}`));
    return [
      S.stat("oversight", "Institutional oversight", [
        { label: "Student-data tools", value: studentTools.length },
        { label: "Academic AI tools", value: academicTools.length },
        { label: "Education policies live", value: eduPolicies.length },
        { label: "Open incidents", value: ctx.incidents.length },
      ]),
      S.list("academic", "Academic AI monitoring", academicTools.map((t) => ({ title: t.name, meta: "educator oversight required" })), "No academic AI tools in the estate."),
      S.list("studentdata", "Student data governance", studentTools.map((t) => ({ title: t.name, meta: "student-data boundary enforced (FERPA)" })), "No student-data tools in the estate."),
      S.list("blocked", "Blocked student-data disclosures", dataBlocks.slice(0, 10).map((b) => ({ title: b.action_id, meta: b.reason, severity: "critical" })), "No student-data disclosure attempts."),
      S.list("policies", "Education policy templates enforced", eduPolicies.map((p) => ({ title: p.name, meta: `${p.domain} · v${p.version} · active` })), "Install the pack to activate education policies."),
      S.list("regmap", "Compliance mappings", pack.evidence_mappings.map((m) => ({ title: `${m.regulation} — ${m.control}`, meta: m.evidence }))),
      S.list("packs", "Compliance reporting", ctx.packs.map((p) => ({ title: `Evidence pack ${p.period}`, meta: `signed ${String(p.hash).slice(0, 16)}… · FERPA/GDPR aligned` })), "No evidence packs generated yet."),
    ];
  },

  recommendations(ctx) {
    const out = [];
    const policyTools = new Set();
    for (const p of ctx.scopedPolicies) for (const t of ((p.spec && p.spec.match && p.spec.match.tools) || [])) policyTools.add(t);
    for (const t of (ctx.entities.tool || [])) {
      if (STUDENT.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Protect student data in tool: ${t.name}`, detail: `"${t.name}" touches student records with no governing policy (FERPA / GDPR children's data).`, severity: "critical" });
      if (ACADEMIC.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Require educator oversight for: ${t.name}`, detail: `Academic AI tool "${t.name}" is ungoverned — the EU AI Act treats educational assessment as high-risk.`, severity: "critical" });
    }
    return out;
  },
};

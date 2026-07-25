/* Guardian OS — Public Sector Intelligence Pack (Sovereign).
 *
 * Departmental governance, procurement governance, citizen service workflows,
 * policy implementation tracking, executive accountability and evidence for
 * national and departmental government. DATA ONLY.
 *
 * Distinct from the Government Industry Pack: that pack governs a public-sector
 * body on any deployment profile. This one governs a DEPARTMENT OF STATE whose
 * data residency, supply chain and accountability obligations require the
 * platform itself to be sovereign.
 */
"use strict";

module.exports = {
  id: "public-sector",
  version: "1.0.0",
  industry: "Public sector (sovereign)",
  title: "Public Sector Pack",
  purpose:
    "Departmental governance, procurement governance, citizen service workflows, policy implementation tracking and executive accountability for government departments operating AI under sovereign data and supply-chain obligations.",
  match: ["department of state", "central government", "ministry", "sovereign public sector", "national government", "devolved administration"],
  regulations: [
    "Automated decision-making and appeal rights",
    "Public law duties — fairness, reasonableness, equality",
    "Algorithmic transparency reporting standard",
    "Public procurement regulations",
    "Public records and retention duties",
    "Freedom of information and transparency obligations",
    "Data protection — public authority obligations",
    "Accounting officer / public accounts accountability",
  ],

  policies: [
    {
      name: "ps_adverse_citizen_decision_requires_human",
      domain: "compliance",
      spec: {
        match: { tools: ["decide_case", "refuse_application", "withdraw_benefit", "impose_penalty", "close_claim", "revoke_licence"] },
        conditions: { unauthorized_unless: ["caseworker_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "ps_procurement_award_requires_authority",
      domain: "enterprise",
      spec: {
        match: { tools: ["award_contract", "issue_purchase_order", "select_supplier", "extend_contract", "vary_contract"] },
        conditions: { unauthorized_unless: ["procurement_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "ps_block_citizen_data_export",
      domain: "data_privacy",
      spec: {
        match: { tools: ["export_records", "share_dataset", "transfer_to_supplier", "bulk_export", "send_file"] },
        conditions: { flag_true_blocks: ["destination_external", "contains_citizen_data", "crosses_jurisdiction"] },
        severity: "critical",
      },
    },
    {
      name: "ps_policy_implementation_requires_sponsor",
      domain: "enterprise",
      spec: {
        match: { tools: ["change_eligibility_rule", "update_decision_criteria", "publish_guidance", "activate_scheme"] },
        conditions: { unauthorized_unless: ["policy_sponsor_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "ps_payment_requires_accounting_authority",
      domain: "finance",
      spec: {
        match: { tools: ["authorise_payment", "release_grant", "issue_refund", "make_award_payment"] },
        conditions: { unauthorized_unless: ["accounting_officer_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "ps_record_retention_enforced",
      domain: "compliance",
      spec: {
        match: { tools: ["delete_record", "purge_dataset", "archive_case", "anonymise_record"] },
        conditions: { flag_true_blocks: ["within_retention_period", "subject_to_inquiry_hold"] },
        severity: "critical",
      },
    },
  ],

  templates: [
    {
      name: "ps_appeal_rights_gate",
      description: "Require a recorded human review, with appeal rights issued, before any adverse citizen decision.",
      domain: "compliance",
      spec: { match: { tools: ["<decision_tool>"] }, conditions: { unauthorized_unless: ["human_review_recorded", "appeal_rights_issued"] }, severity: "critical" },
    },
    {
      name: "ps_equality_impact_gate",
      description: "Refuse a scheme change that has no recorded equality impact assessment.",
      domain: "compliance",
      spec: { match: { tools: ["<scheme_tool>"] }, conditions: { flag_true_blocks: ["equality_assessment_missing"] }, severity: "critical" },
    },
  ],

  evidence_mappings: [
    { regulation: "Automated decision-making and appeal rights", control: "No solely automated adverse decision", evidence: "Adverse citizen decisions escalate to a caseworker; the approval record proves human involvement before the decision took effect." },
    { regulation: "Public law duties", control: "Reasoned, reviewable decisions", evidence: "The decision criteria are declarative and versioned, and each decision carries the policy version that produced it." },
    { regulation: "Algorithmic transparency reporting standard", control: "Published decision logic", evidence: "Policy specifications are inspectable data, not opaque model behaviour — they can be published without disclosing case material." },
    { regulation: "Public procurement regulations", control: "Award integrity", evidence: "Contract award, extension and variation require procurement authority; attempts and approvals are retained for audit." },
    { regulation: "Public records and retention duties", control: "Records are not destroyed prematurely", evidence: "Deletion and anonymisation are refused inside a retention period or an inquiry hold, with the refusal itself retained." },
    { regulation: "Accounting officer accountability", control: "Payments carry named authority", evidence: "Grant, refund and award payments require accounting authority; the record supports a public accounts examination." },
    { regulation: "Freedom of information", control: "Answerable record", evidence: "The governed decision record can answer an information request without reconstructing events from system logs." },
  ],

  incident_workflows: [
    { kind: "automated_adverse_decision", severity: "critical", steps: ["Identify affected citizens", "Confirm whether human review occurred", "Notify the Senior Responsible Owner", "Remediate the decisions and reissue appeal rights", "Publish a transparency record", "Retain the evidence for the accounting officer"] },
    { kind: "citizen_data_disclosure", severity: "critical", steps: ["Establish the dataset, recipient and jurisdiction", "Contain further transfer", "Notify the Data Protection Officer and the regulator if reportable", "Assess harm to affected people", "Record the outcome"] },
    { kind: "procurement_irregularity", severity: "critical", steps: ["Suspend the award or variation", "Establish the authority position", "Notify the procurement authority and internal audit", "Assess the value at risk", "Report through the accountability chain"] },
    { kind: "premature_record_destruction", severity: "critical", steps: ["Establish what was deleted and under what hold", "Attempt recovery", "Notify the departmental records officer", "Report to the inquiry or oversight body", "Restore the retention control"] },
  ],

  sovereign: {
    classification: "official_sensitive",
    mission_domain: "Government and public administration",
    mission: "Govern AI acting on citizens, public money and policy implementation inside a sovereign departmental boundary.",

    authority_chains: [
      { id: "sro", title: "Senior Responsible Owner", authority: "Senior Responsible Owner", delegates_to: ["Service Owner", "Operations Lead"], authorises: ["activate_scheme", "change_eligibility_rule"], evidence: "Named ownership of every scheme and criteria change." },
      { id: "caseworker_authority", title: "Casework authority", authority: "Caseworking Team Leader", delegates_to: ["Senior Caseworker"], authorises: ["decide_case", "refuse_application", "impose_penalty"], evidence: "Human decision-maker recorded against every adverse citizen decision." },
      { id: "procurement_authority", title: "Procurement authority", authority: "Commercial Director", delegates_to: ["Category Manager", "Contract Manager"], authorises: ["award_contract", "extend_contract", "vary_contract"], evidence: "Award decisions attributable to a named commercial authority." },
      { id: "accounting_officer", title: "Accounting officer", authority: "Accounting Officer", delegates_to: ["Finance Director", "Budget Holder"], authorises: ["authorise_payment", "release_grant", "issue_refund"], evidence: "Payment authority retained for public accounts examination." },
      { id: "policy_sponsor", title: "Policy sponsor", authority: "Policy Director", delegates_to: ["Policy Lead"], authorises: ["publish_guidance", "update_decision_criteria"], evidence: "Policy intent tied to the implemented rule that carries it." },
      { id: "dpo", title: "Data protection authority", authority: "Data Protection Officer", delegates_to: ["Information Asset Owner"], authorises: ["share_dataset", "transfer_to_supplier"], evidence: "Lawful basis recorded with every disclosure of citizen data." },
    ],

    workflows: [
      { id: "citizen_decision", title: "Citizen decision", purpose: "Ensure no adverse decision affects a person without a human decision-maker.", stages: [{ name: "Case assessed", actor: "AI system", gate: "recommendation only — never a decision" }, { name: "Caseworker review", actor: "Senior Caseworker", gate: "human review recorded" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "human-approval condition evaluated" }, { name: "Decision or refusal", actor: "Governed capability", gate: "outcome retained either way" }, { name: "Appeal rights", actor: "Service", gate: "rights issued with the decision" }], evidence: "Named human decision-maker and appeal-rights record for every adverse outcome." },
      { id: "procurement", title: "Procurement governance", purpose: "Keep award decisions attributable and defensible.", stages: [{ name: "Requirement", actor: "Service Owner", gate: "need and value stated" }, { name: "Competition", actor: "Category Manager", gate: "process followed" }, { name: "Award authority", actor: "Commercial Director", gate: "award authorised" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "authority condition evaluated" }, { name: "Award or refusal", actor: "Governed capability", gate: "attributable outcome" }], evidence: "Award, extension and variation each carry a named authority." },
      { id: "policy_implementation", title: "Policy implementation tracking", purpose: "Connect a policy intent to the rule that implements it and the outcomes it produced.", stages: [{ name: "Policy stated", actor: "Policy Director", gate: "intent and success measures defined" }, { name: "Rule implemented", actor: "Service Owner", gate: "decision criteria expressed declaratively" }, { name: "Sponsor approval", actor: "Policy Director", gate: "implementation matches intent" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "sponsor condition evaluated" }, { name: "Outcome tracking", actor: "Guardian OS", gate: "decisions attributed to the policy version" }], evidence: "Every citizen decision traceable to the policy version that produced it." },
      { id: "accountability_review", title: "Executive accountability review", purpose: "Give the accounting officer a defensible position.", stages: [{ name: "Period closed", actor: "Guardian OS", gate: "decision record sealed" }, { name: "Evidence pack", actor: "Guardian OS", gate: "content-signed pack produced" }, { name: "Internal audit", actor: "Head of Internal Audit", gate: "findings recorded" }, { name: "Accounting officer sign-off", actor: "Accounting Officer", gate: "position accepted" }], evidence: "Signed evidence pack supporting a public accounts examination." },
    ],

    capabilities: [
      { id: "citizen_decisions", title: "Citizen-affecting decisions", detail: "Case decisions, refusals, penalties and revocations", governed_by: ["ps_adverse_citizen_decision_requires_human"] },
      { id: "procurement", title: "Procurement actions", detail: "Award, extension and variation of contracts", governed_by: ["ps_procurement_award_requires_authority"] },
      { id: "public_money", title: "Public money movement", detail: "Grants, refunds and award payments", governed_by: ["ps_payment_requires_accounting_authority"] },
      { id: "policy_rules", title: "Policy rule change", detail: "Eligibility criteria, guidance and scheme activation", governed_by: ["ps_policy_implementation_requires_sponsor"] },
      { id: "citizen_data", title: "Citizen data disclosure", detail: "Dataset sharing, supplier transfer and bulk export", governed_by: ["ps_block_citizen_data_export"] },
      { id: "records", title: "Record retention", detail: "Deletion, purge, archive and anonymisation", governed_by: ["ps_record_retention_enforced"] },
    ],

    readiness: [
      { key: "coverage", label: "Citizen-affecting capability governed", source: "health:policy_coverage" },
      { key: "policies_enforcing", label: "Departmental policies enforcing", source: "pack:policies_enforcing" },
      { key: "refusals", label: "Actions refused before affecting a citizen", source: "pack:blocked" },
      { key: "evidence", label: "Evidence completeness", detail: "Whether the record would satisfy audit or an information request today.", source: "health:evidence_completeness" },
      { key: "departments", label: "Departments governed", source: "context:departments" },
      { key: "held_decisions", label: "Decisions held for human review", source: "context:approvals_pending" },
      { key: "evidence_packs", label: "Signed evidence packs retained", source: "context:evidence_packs" },
      { key: "open_incidents", label: "Open incidents", source: "context:open_incidents" },
      { key: "appeal_volume", label: "Appeals and overturn rate", detail: "Appeals received and decisions overturned, from the casework system.", source: "casework:appeals" },
      { key: "service_outcomes", label: "Citizen service outcomes", detail: "Time to decision and outcome distribution, from the service management system.", source: "service:outcomes" },
    ],

    risk_models: [
      { id: "automated_decision", title: "Automated decision exposure", factors: ["citizen-decision capability present", "human-approval policy active", "caseworker approvers mapped"], escalates_when: "a citizen-affecting capability can decide with no human approval condition" },
      { id: "procurement_integrity", title: "Procurement integrity", factors: ["award capability present", "authority policy active", "value concentration in one supplier"], escalates_when: "an award capability can execute without commercial authority" },
      { id: "data_residency", title: "Citizen data residency", factors: ["export capability present", "jurisdiction flags instrumented", "supplier transfer paths"], escalates_when: "citizen data can cross a jurisdiction with no active control" },
      { id: "records_integrity", title: "Records integrity", factors: ["deletion capability present", "retention flags instrumented", "inquiry holds"], escalates_when: "records can be destroyed inside a retention period or inquiry hold" },
    ],

    twin_projections: [
      { id: "citizen_capabilities", title: "Citizen-affecting capabilities", entity_kinds: ["tool~decide|refuse|withdraw|penalty|claim|licence|applicant|benefit"], reads: "capability that can affect a person's entitlement or status" },
      { id: "procurement_capabilities", title: "Procurement capabilities", entity_kinds: ["tool~award|contract|supplier|purchase|tender|vary"], reads: "capability that can commit the department contractually" },
      { id: "payment_capabilities", title: "Public money capabilities", entity_kinds: ["tool~payment|grant|refund|disburse"], reads: "capability that can move public money" },
      { id: "citizen_data_paths", title: "Citizen data paths", entity_kinds: ["tool~export|share|transfer|dataset|bulk"], reads: "capability that can disclose citizen data" },
      { id: "departments", title: "Departmental structure", entity_kinds: ["business_unit", "approver", "operator"], reads: "the departmental units and authorities the chains rely on" },
      { id: "obligations", title: "Statutory obligations", entity_kinds: ["compliance_requirement", "protected_asset"], reads: "declared obligations and protected information assets" },
    ],

    briefings: [
      { id: "permanent_secretary", title: "Departmental accountability briefing", audience: "Permanent Secretary / Accounting Officer", sections: ["Citizen decisions made and held", "Procurement and payment authority position", "Policy implementation status", "Open incidents and reportable events", "Evidence position for audit"] },
      { id: "sro_brief", title: "Senior Responsible Owner briefing", audience: "Senior Responsible Owner", sections: ["Service governance coverage", "Held decisions and bottlenecks", "Policy version in force", "Recommendations"] },
      { id: "transparency_brief", title: "Algorithmic transparency briefing", audience: "Transparency and FOI team", sections: ["Decision rules in force", "Publishable policy specifications", "Human review position", "Appeal and overturn context"] },
    ],

    reports: [
      { id: "accountability_pack", title: "Accountability evidence pack", audience: "Internal audit and public accounts", cadence: "quarterly", contents: ["Signed decision record", "Procurement and payment authority", "Refusals with reasons", "Policy versions in force"] },
      { id: "transparency_record", title: "Algorithmic transparency record", audience: "Public", cadence: "annually", contents: ["Decision rules published as data", "Human review model", "Oversight arrangements"] },
      { id: "policy_outcomes", title: "Policy implementation report", audience: "Policy Director", cadence: "monthly", contents: ["Decisions attributed to policy version", "Criteria changes and sponsor approval", "Service governance coverage"] },
    ],
  },
};

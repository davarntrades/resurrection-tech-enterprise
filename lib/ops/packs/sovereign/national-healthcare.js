/* Guardian OS — National Healthcare Intelligence Pack (Sovereign).
 *
 * Healthcare governance, patient data protection, clinical AI oversight, trust
 * relationships, operational dashboards and healthcare executive reporting for
 * national health systems. DATA ONLY.
 *
 * Distinct from the Healthcare Industry Pack: that pack governs a single
 * provider on any deployment profile. This one governs a NATIONAL HEALTH SYSTEM
 * — many trusts and boards under one accountability structure, with population
 * data whose residency and sovereignty obligations are non-negotiable.
 */
"use strict";

module.exports = {
  id: "national-healthcare",
  version: "1.0.0",
  industry: "National healthcare",
  title: "National Healthcare Pack",
  purpose:
    "Clinical AI oversight, patient data protection and cross-trust governance for national health systems — one governed platform across many trusts, boards and care settings.",
  match: ["national health", "health system", "nhs", "health board", "ministry of health", "national healthcare", "population health"],
  regulations: [
    "Patient confidentiality and the common law duty of confidence",
    "Data protection — special category health data",
    "Medical device regulation — software as a medical device",
    "Clinical safety standards for health IT",
    "National data opt-out and secondary use controls",
    "Professional regulation and clinical accountability",
    "Research ethics and information governance approval",
  ],

  policies: [
    {
      name: "nh_clinical_decision_requires_clinician",
      domain: "healthcare",
      spec: {
        match: { tools: ["issue_diagnosis", "prescribe_medication", "change_care_plan", "triage_patient", "discharge_patient", "order_intervention"] },
        conditions: { unauthorized_unless: ["clinician_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "nh_block_patient_data_egress",
      domain: "data_privacy",
      spec: {
        match: { tools: ["export_records", "share_dataset", "transfer_to_partner", "bulk_extract", "send_file"] },
        conditions: { flag_true_blocks: ["destination_external", "contains_patient_identifiable_data", "crosses_jurisdiction", "national_opt_out_applies"] },
        severity: "critical",
      },
    },
    {
      name: "nh_secondary_use_requires_ig_approval",
      domain: "compliance",
      spec: {
        match: { tools: ["build_cohort", "run_population_analysis", "link_datasets", "extract_for_research"] },
        conditions: { unauthorized_unless: ["information_governance_approved", "caldicott_guardian_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "nh_clinical_model_change_requires_safety_officer",
      domain: "healthcare",
      spec: {
        match: { tools: ["deploy_clinical_model", "update_clinical_rules", "change_triage_threshold", "release_algorithm"] },
        conditions: { unauthorized_unless: ["clinical_safety_officer_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "nh_cross_trust_access_enforced",
      domain: "data_privacy",
      spec: {
        match: { tools: ["read_patient_record", "query_care_record", "retrieve_history"] },
        conditions: { flag_true_blocks: ["no_legitimate_relationship", "outside_care_setting"] },
        severity: "critical",
      },
    },
    {
      name: "nh_safeguarding_action_requires_authority",
      domain: "healthcare",
      spec: {
        match: { tools: ["raise_safeguarding_flag", "restrict_access_to_record", "escalate_to_authority", "share_with_third_party"] },
        conditions: { unauthorized_unless: ["safeguarding_lead_approved", "operator_approved"] },
        severity: "critical",
      },
    },
  ],

  templates: [
    {
      name: "nh_legitimate_relationship_gate",
      description: "Refuse access to a patient record where no legitimate care relationship exists.",
      domain: "data_privacy",
      spec: { match: { tools: ["<record_tool>"] }, conditions: { flag_true_blocks: ["no_legitimate_relationship"] }, severity: "critical" },
    },
    {
      name: "nh_clinical_safety_gate",
      description: "Require clinical safety officer approval before a change reaches patient-facing care.",
      domain: "healthcare",
      spec: { match: { tools: ["<clinical_tool>"] }, conditions: { unauthorized_unless: ["clinical_safety_officer_approved"] }, severity: "critical" },
    },
  ],

  evidence_mappings: [
    { regulation: "Professional regulation and clinical accountability", control: "A clinician stands behind every clinical decision", evidence: "Diagnosis, prescribing, triage and discharge cannot execute autonomously; the responsible clinician is retained with the decision." },
    { regulation: "Patient confidentiality", control: "Access requires a legitimate relationship", evidence: "Record access is evaluated against relationship and care-setting flags before retrieval; refusals name the record and reason." },
    { regulation: "Data protection — special category data", control: "Patient data does not leave the sovereign boundary", evidence: "Every export, share and transfer is evaluated against identifiability, jurisdiction and opt-out flags at execution." },
    { regulation: "National data opt-out and secondary use", control: "Secondary use is an approved act", evidence: "Cohort building and population analysis require information governance and Caldicott approval, retained per extract." },
    { regulation: "Medical device regulation — SaMD", control: "Change control over clinical algorithms", evidence: "Clinical model deployment and threshold changes require the clinical safety officer and are tied to the safety case." },
    { regulation: "Clinical safety standards for health IT", control: "Hazard control is demonstrable", evidence: "The governed decision record shows which clinical actions were refused, by which control, and why." },
    { regulation: "Research ethics and IG approval", control: "Research access is governed and attributable", evidence: "Research extracts carry the approval that permitted them and the datasets they linked." },
  ],

  incident_workflows: [
    { kind: "unsafe_clinical_recommendation", severity: "critical", steps: ["Identify affected patients", "Confirm whether the action executed or was refused", "Notify the clinical safety officer and responsible clinician", "Assess patient harm", "Suspend the capability pending review", "Report under clinical safety and incident duties"] },
    { kind: "patient_data_breach", severity: "critical", steps: ["Establish records, recipient and jurisdiction", "Contain further disclosure", "Notify the Caldicott Guardian and Data Protection Officer", "Assess harm and notify affected patients if required", "Report to the regulator if reportable", "Retain the governed record"] },
    { kind: "inappropriate_record_access", severity: "critical", steps: ["Identify records accessed and by whom", "Confirm the legitimate relationship position", "Notify the Caldicott Guardian", "Refer to professional regulation if warranted", "Review the access model"] },
    { kind: "clinical_model_drift", severity: "warning", steps: ["Compare the running model to the approved baseline", "Establish the clinical impact", "Notify the clinical safety officer", "Re-approve or roll back", "Update the safety case"] },
  ],

  sovereign: {
    classification: "official_sensitive",
    mission_domain: "National healthcare",
    mission: "Govern clinical AI and population health data across a national health system without moving patient data outside the sovereign boundary.",

    authority_chains: [
      { id: "clinical_authority", title: "Clinical authority", authority: "Responsible Clinician", delegates_to: ["Consultant", "Senior Clinical Decision Maker"], authorises: ["issue_diagnosis", "prescribe_medication", "change_care_plan", "discharge_patient"], evidence: "Named clinician retained against every clinical decision, executed or refused." },
      { id: "caldicott", title: "Caldicott Guardian", authority: "Caldicott Guardian", delegates_to: ["Deputy Caldicott Guardian"], authorises: ["build_cohort", "link_datasets", "share_with_third_party"], evidence: "Confidentiality decision recorded with every use of identifiable data." },
      { id: "clinical_safety", title: "Clinical safety authority", authority: "Clinical Safety Officer", delegates_to: ["Deputy Clinical Safety Officer"], authorises: ["deploy_clinical_model", "change_triage_threshold", "release_algorithm"], evidence: "Clinical safety case reference retained with every algorithm change." },
      { id: "information_governance", title: "Information governance", authority: "Information Governance Lead", delegates_to: ["Data Protection Officer"], authorises: ["extract_for_research", "run_population_analysis", "transfer_to_partner"], evidence: "Lawful basis and approval reference for every secondary use." },
      { id: "safeguarding", title: "Safeguarding authority", authority: "Safeguarding Lead", delegates_to: ["Named Nurse / Named Doctor"], authorises: ["raise_safeguarding_flag", "restrict_access_to_record", "escalate_to_authority"], evidence: "Safeguarding decisions attributable and retained under restricted access." },
      { id: "trust_board", title: "Trust and board accountability", authority: "Chief Executive (Trust / Board)", delegates_to: ["Chief Medical Officer", "Chief Nursing Officer"], authorises: ["accept_clinical_ai_risk"], evidence: "Board acceptance of residual clinical AI risk, per trust." },
    ],

    workflows: [
      { id: "clinical_decision", title: "Clinical decision", purpose: "Ensure a clinician stands behind every clinical action.", stages: [{ name: "Assessment", actor: "Clinical AI system", gate: "recommendation only — never a clinical decision" }, { name: "Clinical review", actor: "Responsible Clinician", gate: "clinical judgement recorded" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "clinician-approval condition evaluated" }, { name: "Action or refusal", actor: "Governed capability", gate: "outcome retained either way" }, { name: "Care record", actor: "Clinical system", gate: "decision and rationale recorded" }], evidence: "Responsible clinician named on every clinical decision." },
      { id: "secondary_use", title: "Secondary use of patient data", purpose: "Govern population and research use without moving data out of the boundary.", stages: [{ name: "Purpose stated", actor: "Requesting analyst", gate: "purpose, cohort and lawful basis stated" }, { name: "IG review", actor: "Information Governance Lead", gate: "approval granted" }, { name: "Caldicott review", actor: "Caldicott Guardian", gate: "confidentiality position accepted" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "approval and opt-out conditions evaluated" }, { name: "Extract or refusal", actor: "Governed capability", gate: "attributable outcome" }], evidence: "Approval chain retained with the datasets linked." },
      { id: "clinical_algorithm_change", title: "Clinical algorithm change", purpose: "Admit a change to a clinical model under safety authority.", stages: [{ name: "Change proposed", actor: "Clinical informatics", gate: "clinical impact described" }, { name: "Hazard assessment", actor: "Clinical Safety Officer", gate: "hazards identified and controlled" }, { name: "Safety approval", actor: "Clinical Safety Officer", gate: "change approved against the safety case" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "safety-officer condition evaluated" }, { name: "Deployment", actor: "Guardian OS", gate: "baseline updated, drift measured" }], evidence: "Safety case reference retained with the deployed configuration." },
      { id: "cross_trust_care", title: "Cross-trust care access", purpose: "Let care cross organisational boundaries without weakening confidentiality.", stages: [{ name: "Access requested", actor: "Clinician or system", gate: "care relationship asserted" }, { name: "Relationship check", actor: "Runtime Governance kernel", gate: "legitimate relationship and care setting evaluated" }, { name: "Access or refusal", actor: "Governed capability", gate: "outcome retained either way" }, { name: "Audit", actor: "Guardian OS", gate: "access attributable across trusts" }], evidence: "Every cross-trust access attributable, including refusals." },
    ],

    capabilities: [
      { id: "clinical_actions", title: "Clinical decisions", detail: "Diagnosis, prescribing, triage, care planning and discharge", governed_by: ["nh_clinical_decision_requires_clinician"] },
      { id: "record_access", title: "Patient record access", detail: "Reading and querying care records across settings", governed_by: ["nh_cross_trust_access_enforced"] },
      { id: "data_egress", title: "Patient data egress", detail: "Export, sharing and partner transfer of patient data", governed_by: ["nh_block_patient_data_egress"] },
      { id: "secondary_use", title: "Secondary use and research", detail: "Cohort building, linkage and population analysis", governed_by: ["nh_secondary_use_requires_ig_approval"] },
      { id: "clinical_models", title: "Clinical algorithm change", detail: "Model deployment, rule and threshold change", governed_by: ["nh_clinical_model_change_requires_safety_officer"] },
      { id: "safeguarding", title: "Safeguarding actions", detail: "Flags, access restriction and third-party escalation", governed_by: ["nh_safeguarding_action_requires_authority"] },
    ],

    readiness: [
      { key: "coverage", label: "Clinical capability governed", source: "health:policy_coverage" },
      { key: "policies_enforcing", label: "Clinical governance policies enforcing", source: "pack:policies_enforcing" },
      { key: "refusals", label: "Clinical actions refused before execution", source: "pack:blocked" },
      { key: "evidence", label: "Evidence completeness", source: "health:evidence_completeness" },
      { key: "trusts", label: "Trusts and boards governed", source: "estate:business_unit" },
      { key: "clinical_systems", label: "Clinical AI systems in the estate", source: "estate:ai_system" },
      { key: "held_decisions", label: "Decisions held for clinical review", source: "context:approvals_pending" },
      { key: "open_incidents", label: "Open clinical governance incidents", source: "context:open_incidents" },
      { key: "clinical_outcomes", label: "Clinical outcome measures", detail: "Outcome and harm measures for AI-assisted pathways, from the clinical audit system.", source: "clinical:outcomes" },
      { key: "opt_out_position", label: "National opt-out honoured", detail: "Proportion of extracts honouring the national data opt-out, from the extract service.", source: "clinical:opt_out" },
    ],

    risk_models: [
      { id: "clinical_autonomy", title: "Clinical autonomy exposure", factors: ["clinical capability present", "clinician-approval policy active", "clinician approvers mapped"], escalates_when: "a clinical capability can act with no clinician approval condition" },
      { id: "confidentiality", title: "Patient confidentiality exposure", factors: ["record access capability", "relationship flags instrumented", "cross-trust access paths"], escalates_when: "records are reachable with no legitimate-relationship control" },
      { id: "data_residency", title: "Patient data residency", factors: ["export capability present", "jurisdiction flags", "partner transfer paths"], escalates_when: "identifiable patient data can leave the sovereign boundary" },
      { id: "algorithm_safety", title: "Clinical algorithm safety", factors: ["model change capability", "safety officer policy active", "drift from approved baseline"], escalates_when: "a clinical model can change without clinical safety approval" },
    ],

    twin_projections: [
      { id: "clinical_capabilities", title: "Clinical capabilities", entity_kinds: ["tool~diagnos|prescri|triage|care_plan|discharge|interven|clinical"], reads: "capability that can affect a patient's care" },
      { id: "record_paths", title: "Patient record access paths", entity_kinds: ["tool~record|patient|care_record|history|retrieve"], reads: "capability that can read patient information" },
      { id: "data_egress_paths", title: "Patient data egress paths", entity_kinds: ["tool~export|share|transfer|extract|bulk"], reads: "capability that can move patient data" },
      { id: "research_paths", title: "Secondary use and research paths", entity_kinds: ["tool~cohort|population|link|research|analys"], reads: "capability that can build cohorts or link datasets" },
      { id: "trust_structure", title: "Trust and board structure", entity_kinds: ["business_unit", "approver", "operator"], reads: "the organisational structure the authority chains depend on" },
      { id: "protected_information", title: "Protected information assets", entity_kinds: ["protected_asset", "compliance_requirement", "trust_boundary"], reads: "declared patient data assets, obligations and boundaries" },
    ],

    briefings: [
      { id: "chief_medical", title: "Chief Medical Officer briefing", audience: "Chief Medical Officer", sections: ["Clinical decisions made and held", "Clinical actions refused and why", "Algorithm change position", "Open clinical governance incidents", "Cross-trust access position"] },
      { id: "caldicott_brief", title: "Caldicott and information governance briefing", audience: "Caldicott Guardian", sections: ["Identifiable data use", "Secondary use approvals", "Access refusals", "Egress attempts and outcomes"] },
      { id: "board_brief", title: "Board assurance briefing", audience: "Trust / Board Chief Executive", sections: ["Governance coverage across the trust", "Residual clinical AI risk", "Evidence position", "Recommendations"] },
    ],

    reports: [
      { id: "clinical_governance_pack", title: "Clinical governance evidence pack", audience: "Board and regulator", cadence: "monthly", contents: ["Signed clinical decision record", "Clinician attribution", "Refusals with reasons", "Algorithm versions in force"] },
      { id: "ig_report", title: "Information governance report", audience: "Caldicott Guardian and DPO", cadence: "monthly", contents: ["Secondary use approvals", "Egress attempts", "Access refusals", "Opt-out position"] },
      { id: "safety_report", title: "Clinical safety report", audience: "Clinical Safety Officer", cadence: "quarterly", contents: ["Algorithm changes and approvals", "Drift from approved baseline", "Hazard control evidence"] },
    ],
  },
};

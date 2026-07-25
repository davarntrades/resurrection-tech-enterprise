/* Guardian OS — National Security Intelligence Pack (Sovereign).
 *
 * Classified governance, authority chains and mission approval for national
 * security organisations. DATA ONLY — projections come from the shared platform
 * projector (./projections.js) and the Runtime Governance kernel is unchanged.
 */
"use strict";

module.exports = {
  id: "national-security",
  version: "1.0.0",
  industry: "National security",
  title: "National Security Pack",
  purpose:
    "Classified governance, authority chains, mission approval and secure evidence for national security organisations operating AI inside a sovereign boundary.",
  match: ["national security", "intelligence agency", "security service", "classified", "sovereign intelligence"],
  regulations: [
    "National classification and handling policy",
    "Security vetting and need-to-know",
    "Cross-domain transfer authority",
    "Ministerial / statutory oversight",
    "Independent oversight and inspection",
    "NIST AI RMF — high-consequence systems",
    "EU AI Act — national security carve-out with domestic equivalent controls",
  ],

  // Deny-only Ω policies, in the kernel's existing domain vocabulary.
  policies: [
    {
      name: "ns_mission_action_requires_authority",
      domain: "enterprise",
      spec: {
        match: { tools: ["execute_mission_task", "task_collection", "initiate_operation", "authorise_activity", "commit_capability"] },
        conditions: { unauthorized_unless: ["mission_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "ns_block_classified_egress",
      domain: "data_privacy",
      spec: {
        match: { tools: ["export_document", "share_record", "send_message", "upload_file", "bulk_export", "publish"] },
        conditions: { flag_true_blocks: ["destination_external", "contains_classified_material", "crosses_security_domain"] },
        severity: "critical",
      },
    },
    {
      name: "ns_cross_domain_transfer_requires_authority",
      domain: "compliance",
      spec: {
        match: { tools: ["transfer_between_domains", "downgrade_classification", "release_to_partner", "declassify"] },
        conditions: { unauthorized_unless: ["cross_domain_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "ns_need_to_know_enforced_on_retrieval",
      domain: "data_privacy",
      spec: {
        match: { tools: ["query_holdings", "retrieve_record", "search_index", "read_case_file"] },
        conditions: { flag_true_blocks: ["subject_outside_need_to_know", "compartment_not_briefed"] },
        severity: "critical",
      },
    },
    {
      name: "ns_no_autonomous_targeting_of_persons",
      domain: "compliance",
      spec: {
        match: { tools: ["select_subject", "nominate_target", "assess_person", "recommend_intervention"] },
        conditions: { unauthorized_unless: ["legal_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "ns_model_change_requires_accreditation",
      domain: "cybersecurity",
      spec: {
        match: { tools: ["deploy_model", "update_weights", "change_system_configuration", "install_capability"] },
        conditions: { unauthorized_unless: ["accreditation_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
  ],

  templates: [
    {
      name: "ns_compartment_control",
      description: "Restrict a capability to personnel briefed into a named compartment.",
      domain: "data_privacy",
      spec: { match: { tools: ["<capability_tool>"] }, conditions: { flag_true_blocks: ["compartment_not_briefed"] }, severity: "critical" },
    },
    {
      name: "ns_two_person_authority",
      description: "Require two independent authorities before a consequential action executes.",
      domain: "enterprise",
      spec: { match: { tools: ["<consequential_tool>"] }, conditions: { unauthorized_unless: ["first_authority_approved", "second_authority_approved"] }, severity: "critical" },
    },
  ],

  evidence_mappings: [
    { regulation: "National classification and handling policy", control: "No classified material crosses a security domain without authority", evidence: "Every export, transfer and downgrade attempt is evaluated at execution; refusals and approvals are retained with the authority that granted them." },
    { regulation: "Security vetting and need-to-know", control: "Retrieval is constrained to briefed personnel", evidence: "Need-to-know and compartment flags are evaluated before retrieval; each refusal names the subject, the holding and the reason." },
    { regulation: "Ministerial / statutory oversight", control: "Consequential activity carries a named human authority", evidence: "Mission actions escalate to the authority chain; the approval record proves who authorised what, when, and on what reasoning." },
    { regulation: "Independent oversight and inspection", control: "Inspectable decision record", evidence: "Signed evidence packs reproduce the full decision trail — including actions that were refused — without requiring access to the underlying holdings." },
    { regulation: "Cross-domain transfer authority", control: "Declassification and release are authorised acts", evidence: "Declassify and release-to-partner actions require cross-domain authority and are recorded as discrete, attributable decisions." },
    { regulation: "NIST AI RMF — high-consequence systems", control: "Human oversight of consequential inference", evidence: "Subject nomination and intervention recommendation cannot execute autonomously; the legal authority approval is part of the retained record." },
  ],

  incident_workflows: [
    {
      kind: "classified_spill",
      severity: "critical",
      steps: ["Contain the receiving system", "Establish what material crossed which domain", "Notify the security controller and accreditation authority", "Preserve the governed decision record", "Remediate and re-accredit the affected capability", "Report to the oversight body"],
    },
    {
      kind: "unauthorised_autonomous_action",
      severity: "critical",
      steps: ["Suspend the capability", "Identify the missing authority in the chain", "Establish whether the action executed or was refused", "Brief the responsible authority", "Restore governance before the capability is returned to service"],
    },
    {
      kind: "need_to_know_breach",
      severity: "critical",
      steps: ["Identify the holdings retrieved and by whom", "Confirm compartment briefing status", "Notify the security controller", "Review the access model", "Record the outcome for inspection"],
    },
    {
      kind: "accreditation_drift",
      severity: "warning",
      steps: ["Compare the running configuration to the accredited baseline", "Establish what changed and under whose authority", "Re-accredit or roll back", "Record the decision"],
    },
  ],

  sovereign: {
    classification: "secret",
    mission_domain: "National security",
    mission: "Govern AI acting on national security holdings, capabilities and decisions inside a sovereign boundary.",

    authority_chains: [
      { id: "mission_authority", title: "Mission authority", authority: "Mission Authorising Officer", delegates_to: ["Operations Controller", "Duty Authority"], authorises: ["execute_mission_task", "task_collection", "initiate_operation"], evidence: "Named approval retained against every mission action, including refusals." },
      { id: "legal_authority", title: "Legal authority", authority: "Legal Adviser", delegates_to: ["Deputy Legal Adviser"], authorises: ["select_subject", "nominate_target", "recommend_intervention"], evidence: "Legal authorisation recorded before any action affecting a person." },
      { id: "cross_domain_authority", title: "Cross-domain and release authority", authority: "Security Controller", delegates_to: ["Cross-Domain Release Officer"], authorises: ["transfer_between_domains", "downgrade_classification", "release_to_partner", "declassify"], evidence: "Each transfer or downgrade attributed to a named releasing authority." },
      { id: "accreditation_authority", title: "Accreditation authority", authority: "Senior Information Risk Owner", delegates_to: ["Accreditor", "Technical Design Authority"], authorises: ["deploy_model", "update_weights", "change_system_configuration"], evidence: "Configuration changes tied to the accreditation decision that permitted them." },
      { id: "oversight", title: "Independent oversight", authority: "Oversight Body / Commissioner", delegates_to: ["Inspector"], authorises: ["inspect_decision_record"], evidence: "Signed evidence packs produced without granting access to underlying holdings." },
    ],

    workflows: [
      { id: "mission_approval", title: "Mission approval", purpose: "Take a proposed mission action from intent to governed execution.", stages: [{ name: "Intent recorded", actor: "Requesting officer", gate: "purpose and legal basis stated" }, { name: "Legal review", actor: "Legal Adviser", gate: "legal authority granted" }, { name: "Mission authority", actor: "Mission Authorising Officer", gate: "mission authority granted" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "Ω policies evaluated before execution" }, { name: "Execution or refusal", actor: "Governed capability", gate: "outcome retained either way" }, { name: "Record", actor: "Evidence ledger", gate: "decision trail sealed" }], evidence: "Approval chain + runtime verdict retained as one record." },
      { id: "cross_domain_release", title: "Cross-domain release", purpose: "Move material between security domains under named authority.", stages: [{ name: "Release request", actor: "Requesting officer", gate: "material and destination identified" }, { name: "Classification review", actor: "Security Controller", gate: "handling caveats confirmed" }, { name: "Release authority", actor: "Cross-Domain Release Officer", gate: "release authorised" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "egress and domain-crossing flags evaluated" }, { name: "Transfer or refusal", actor: "Governed capability", gate: "attributable outcome" }], evidence: "Named releasing authority against every transfer." },
      { id: "capability_accreditation", title: "Capability accreditation", purpose: "Admit a new or changed AI capability into the accredited estate.", stages: [{ name: "Change proposed", actor: "Technical Design Authority", gate: "change described against baseline" }, { name: "Risk assessment", actor: "Senior Information Risk Owner", gate: "residual risk accepted" }, { name: "Accreditation", actor: "Accreditor", gate: "accreditation granted" }, { name: "Governed deployment", actor: "Runtime Governance kernel", gate: "deployment policy evaluated" }, { name: "Baseline update", actor: "Guardian OS", gate: "drift measured against the new baseline" }], evidence: "Accreditation decision retained alongside the configuration it admitted." },
      { id: "oversight_inspection", title: "Oversight inspection", purpose: "Answer an inspection without exposing underlying holdings.", stages: [{ name: "Inspection scoped", actor: "Oversight Body", gate: "period and questions defined" }, { name: "Evidence pack generated", actor: "Guardian OS", gate: "content-signed pack produced locally" }, { name: "Integrity verified", actor: "Inspector", gate: "content hash checked" }, { name: "Findings recorded", actor: "Oversight Body", gate: "findings retained" }], evidence: "Signed evidence pack, reproducible and independently verifiable." },
    ],

    capabilities: [
      { id: "mission_execution", title: "Mission task execution", detail: "AI-initiated mission activity", governed_by: ["ns_mission_action_requires_authority"] },
      { id: "holdings_retrieval", title: "Retrieval from classified holdings", detail: "Query and retrieval across compartmented material", governed_by: ["ns_need_to_know_enforced_on_retrieval"] },
      { id: "cross_domain", title: "Cross-domain transfer and declassification", detail: "Movement of material between security domains", governed_by: ["ns_cross_domain_transfer_requires_authority", "ns_block_classified_egress"] },
      { id: "person_affecting", title: "Person-affecting assessment", detail: "Subject selection, nomination and intervention recommendation", governed_by: ["ns_no_autonomous_targeting_of_persons"] },
      { id: "capability_change", title: "Capability and model change", detail: "Deployment, weight updates and configuration change", governed_by: ["ns_model_change_requires_accreditation"] },
    ],

    readiness: [
      { key: "authority_coverage", label: "Authority coverage", detail: "Share of governed capability covered by an active authority policy.", source: "health:policy_coverage" },
      { key: "policies_enforcing", label: "Mission policies enforcing", detail: "This pack's Ω policies currently active in the kernel.", source: "pack:policies_enforcing" },
      { key: "refusals", label: "Actions refused under authority control", detail: "Attempts this pack's policies stopped before execution.", source: "pack:blocked" },
      { key: "evidence", label: "Evidence completeness", detail: "Whether the decision record would satisfy an inspection today.", source: "health:evidence_completeness" },
      { key: "open_incidents", label: "Open security incidents", source: "context:open_incidents" },
      { key: "escalations", label: "Decisions awaiting authority", detail: "Actions held at the authority chain, not executed.", source: "context:approvals_pending" },
      { key: "critical_drift", label: "Critical drift from accredited baseline", source: "context:critical_drift" },
      { key: "cleared_personnel", label: "Cleared personnel coverage", detail: "Proportion of operators holding current clearance for the compartments they can reach.", source: "vetting:clearance_currency" },
      { key: "compartment_coverage", label: "Compartment briefing currency", detail: "Whether briefing records are current for every reachable compartment.", source: "vetting:compartment_briefings" },
    ],

    risk_models: [
      { id: "spill", title: "Classified spill exposure", factors: ["external destinations reachable", "cross-domain capability present", "classified-material flags instrumented", "egress policy active"], escalates_when: "a cross-domain capability exists with no active egress control" },
      { id: "authority_gap", title: "Authority gap", factors: ["mission capability present", "authority policy active", "approver mapped in the estate"], escalates_when: "a mission capability can execute with no named authority behind it" },
      { id: "accreditation_drift", title: "Accreditation drift", factors: ["configuration change events", "drift against governed baseline", "accreditation policy active"], escalates_when: "the running configuration diverges from the accredited baseline" },
      { id: "concentration", title: "Capability concentration", factors: ["privileged capabilities per system", "single-authority dependencies"], escalates_when: "one authority is the sole gate on multiple critical capabilities" },
    ],

    twin_projections: [
      { id: "mission_capabilities", title: "Mission capabilities", entity_kinds: ["tool~mission|operation|collection|task|deploy|commit"], reads: "tools whose names indicate mission execution" },
      { id: "classified_holdings", title: "Classified holdings and retrieval", entity_kinds: ["tool~query|retrieve|search|holding|case_file|index"], reads: "retrieval capability over holdings" },
      { id: "cross_domain_paths", title: "Cross-domain and release paths", entity_kinds: ["tool~transfer|release|declassif|downgrade|export|publish"], reads: "capability that can move material out of a domain" },
      { id: "security_boundaries", title: "Security boundaries", entity_kinds: ["trust_boundary", "risk_zone", "protected_asset"], reads: "declared boundaries, zones and protected assets" },
      { id: "authorities", title: "Mapped authorities", entity_kinds: ["approver", "operator"], reads: "the people the authority chains depend on" },
      { id: "accredited_systems", title: "Accredited AI systems", entity_kinds: ["ai_system", "model", "agent"], reads: "the estate under accreditation" },
    ],

    briefings: [
      { id: "authority_brief", title: "National security executive briefing", audience: "Mission Authorising Officer / Director", sections: ["Governed refusals this period", "Decisions awaiting authority", "Drift from the accredited baseline", "Open security incidents", "Evidence position for oversight"] },
      { id: "siro_brief", title: "SIRO information-risk briefing", audience: "Senior Information Risk Owner", sections: ["Accreditation drift", "Cross-domain activity", "Capability concentration", "Residual risk accepted"] },
      { id: "oversight_brief", title: "Oversight readiness briefing", audience: "Oversight Body / Commissioner", sections: ["Decision record completeness", "Refusals and their reasons", "Authority attribution", "Evidence pack integrity"] },
    ],

    reports: [
      { id: "oversight_pack", title: "Oversight evidence pack", audience: "Independent oversight", cadence: "monthly", contents: ["Signed decision record", "Authority attribution", "Refusals with reasons", "Policy versions in force"] },
      { id: "accreditation_report", title: "Accreditation position report", audience: "Accreditation authority", cadence: "quarterly", contents: ["Baseline comparison", "Configuration changes and their authority", "Residual risk"] },
      { id: "mission_assurance", title: "Mission assurance report", audience: "Operations Controller", cadence: "weekly", contents: ["Governed mission actions", "Held decisions", "Capability availability", "Incidents"] },
    ],
  },
};

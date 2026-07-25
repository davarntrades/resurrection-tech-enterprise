/* Guardian OS — Cyber Operations Intelligence Pack (Sovereign).
 *
 * Governance for national cyber defence and authorised cyber operations:
 * operational authority, deconfliction, attribution discipline, vulnerability
 * handling and national incident coordination. DATA ONLY.
 *
 * Distinct from the Cybersecurity Industry Pack: that pack governs an
 * enterprise security function. This one governs a NATIONAL CYBER AUTHORITY —
 * where an action can affect infrastructure outside the organisation, and every
 * such action must be held behind a named legal and operational authority.
 *
 * Every policy in this pack is a CONSTRAINT. The pack adds no capability; it
 * exists to ensure that consequential cyber activity cannot be taken by an AI
 * system on its own initiative.
 */
"use strict";

module.exports = {
  id: "cyber-operations",
  version: "1.0.0",
  industry: "National cyber operations",
  title: "Cyber Operations Pack",
  purpose:
    "Operational authority, deconfliction, attribution discipline and vulnerability handling for national cyber defence organisations — ensuring no consequential cyber action is taken autonomously.",
  match: ["cyber command", "national cyber", "cyber defence", "cyber defense", "cert", "csirt", "cyber operations"],
  regulations: [
    "Statutory authorisation for cyber activity",
    "Law of armed conflict and proportionality in cyberspace",
    "Coordinated vulnerability disclosure policy",
    "National incident management framework",
    "Interagency and allied deconfliction arrangements",
    "Evidence handling and admissibility standards",
    "Data protection in incident response",
  ],

  policies: [
    {
      name: "cy_no_autonomous_active_response",
      domain: "cybersecurity",
      spec: {
        match: { tools: ["execute_active_response", "disrupt_infrastructure", "take_down_asset", "seize_domain", "counter_operation"] },
        conditions: { unauthorized_unless: ["operational_authority_approved", "legal_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "cy_deconfliction_required",
      domain: "cybersecurity",
      spec: {
        match: { tools: ["execute_active_response", "engage_infrastructure", "begin_operation", "access_remote_system"] },
        conditions: { flag_true_blocks: ["deconfliction_unresolved", "partner_operation_in_progress", "target_out_of_scope"] },
        severity: "critical",
      },
    },
    {
      name: "cy_containment_outside_estate_requires_authority",
      domain: "cybersecurity",
      spec: {
        match: { tools: ["isolate_host", "block_network_range", "revoke_certificate", "sinkhole_domain", "disable_account"] },
        conditions: { unauthorized_unless: ["operational_authority_approved", "affected_party_notified", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "cy_attribution_requires_review",
      domain: "compliance",
      spec: {
        match: { tools: ["publish_attribution", "name_actor", "issue_public_advisory", "brief_media"] },
        conditions: { unauthorized_unless: ["attribution_board_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "cy_vulnerability_disclosure_governed",
      domain: "compliance",
      spec: {
        match: { tools: ["disclose_vulnerability", "release_exploit_detail", "notify_vendor", "publish_advisory"] },
        conditions: { unauthorized_unless: ["disclosure_board_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "cy_block_incident_data_egress",
      domain: "data_privacy",
      spec: {
        match: { tools: ["share_incident_data", "export_victim_data", "send_to_partner", "upload_sample"] },
        conditions: { flag_true_blocks: ["destination_external", "contains_victim_identifiable_data", "contains_sensitive_source"] },
        severity: "critical",
      },
    },
    {
      name: "cy_evidence_integrity_preserved",
      domain: "compliance",
      spec: {
        match: { tools: ["modify_evidence", "delete_artefact", "reimage_host", "clear_logs"] },
        conditions: { flag_true_blocks: ["evidence_under_preservation_order", "investigation_active"] },
        severity: "critical",
      },
    },
  ],

  templates: [
    {
      name: "cy_scope_boundary_gate",
      description: "Refuse any action against infrastructure outside the authorised operational scope.",
      domain: "cybersecurity",
      spec: { match: { tools: ["<operational_tool>"] }, conditions: { flag_true_blocks: ["target_out_of_scope"] }, severity: "critical" },
    },
    {
      name: "cy_proportionality_gate",
      description: "Require legal authority where an action's effect could extend beyond the intended target.",
      domain: "compliance",
      spec: { match: { tools: ["<effect_tool>"] }, conditions: { unauthorized_unless: ["legal_authority_approved", "proportionality_assessed"] }, severity: "critical" },
    },
  ],

  evidence_mappings: [
    { regulation: "Statutory authorisation for cyber activity", control: "No consequential action without statutory authority", evidence: "Active response and counter-operation require both operational and legal authority; every attempt is evaluated before execution and retained with its verdict." },
    { regulation: "Law of armed conflict and proportionality", control: "Proportionality assessed before effect", evidence: "Legal authority approval is a pre-execution condition; the record shows the assessment that preceded the decision." },
    { regulation: "Interagency and allied deconfliction", control: "No action into a live partner operation", evidence: "Deconfliction and scope flags are evaluated at execution; refusals name the unresolved condition." },
    { regulation: "Coordinated vulnerability disclosure", control: "Disclosure is a board decision", evidence: "Vulnerability disclosure and advisory publication require disclosure board approval, retained per decision." },
    { regulation: "National incident management framework", control: "Containment outside the estate is authorised and notified", evidence: "Actions affecting third-party infrastructure require operational authority and affected-party notification before they execute." },
    { regulation: "Evidence handling and admissibility", control: "Evidence is not altered during response", evidence: "Modification, deletion and reimaging are refused while a preservation order or active investigation applies." },
    { regulation: "Data protection in incident response", control: "Victim data does not leave the boundary", evidence: "Sharing and sample upload are evaluated against victim-identifiability and source-sensitivity flags." },
  ],

  incident_workflows: [
    { kind: "unauthorised_operational_action", severity: "critical", steps: ["Confirm whether the action executed or was refused", "Suspend the capability", "Establish which authority was missing", "Notify the operational and legal authority", "Assess third-party impact", "Preserve the governed decision record", "Restore governance before return to service"] },
    { kind: "deconfliction_failure", severity: "critical", steps: ["Halt the operation", "Contact the partner deconfliction cell", "Establish overlap and impact", "Re-run deconfliction", "Record the outcome"] },
    { kind: "premature_attribution", severity: "critical", steps: ["Withdraw or hold the statement", "Convene the attribution board", "Reassess the evidential basis", "Notify partners and affected parties", "Record the decision"] },
    { kind: "victim_data_disclosure", severity: "critical", steps: ["Establish data, recipient and sensitivity", "Contain further disclosure", "Notify the victim and the data protection authority if reportable", "Assess source exposure", "Record the outcome"] },
    { kind: "evidence_spoliation", severity: "critical", steps: ["Halt remediation on the affected host", "Establish what was altered and under whose action", "Notify the investigating authority", "Attempt recovery from preserved copies", "Report to the prosecuting authority"] },
  ],

  sovereign: {
    classification: "secret",
    mission_domain: "National cyber operations",
    mission: "Govern AI in national cyber defence so that no consequential action against infrastructure is taken without named legal and operational authority.",

    authority_chains: [
      { id: "operational_authority", title: "Operational authority", authority: "Head of Cyber Operations", delegates_to: ["Operations Director", "Duty Operations Officer"], authorises: ["execute_active_response", "begin_operation", "isolate_host", "block_network_range"], evidence: "Named operational approval retained against every consequential action." },
      { id: "legal_authority", title: "Legal authority", authority: "Legal Adviser", delegates_to: ["Deputy Legal Adviser"], authorises: ["execute_active_response", "counter_operation", "disrupt_infrastructure"], evidence: "Statutory basis and proportionality assessment recorded before execution." },
      { id: "attribution_board", title: "Attribution board", authority: "Attribution Board", delegates_to: ["Chief Analyst"], authorises: ["publish_attribution", "name_actor", "issue_public_advisory"], evidence: "Evidential threshold and board decision retained per attribution." },
      { id: "disclosure_board", title: "Vulnerability disclosure board", authority: "Disclosure Board", delegates_to: ["Vulnerability Coordinator"], authorises: ["disclose_vulnerability", "notify_vendor", "publish_advisory"], evidence: "Equities decision recorded for every vulnerability handled." },
      { id: "deconfliction_cell", title: "Deconfliction authority", authority: "Deconfliction Cell", delegates_to: ["Partner Liaison"], authorises: ["clear_for_action"], evidence: "Deconfliction clearance retained with the operation it permitted." },
      { id: "investigating_authority", title: "Investigating authority", authority: "Lead Investigator", delegates_to: ["Digital Forensics Lead"], authorises: ["release_preservation_order"], evidence: "Preservation orders and their release attributable to a named investigator." },
    ],

    workflows: [
      { id: "operation_authorisation", title: "Operation authorisation", purpose: "Hold every consequential cyber action behind legal and operational authority.", stages: [{ name: "Proposal", actor: "Analyst or AI system", gate: "proposal only — never execution" }, { name: "Scope and deconfliction", actor: "Deconfliction Cell", gate: "target in scope, no partner overlap" }, { name: "Legal review", actor: "Legal Adviser", gate: "statutory basis and proportionality confirmed" }, { name: "Operational authority", actor: "Head of Cyber Operations", gate: "operation authorised" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "authority and scope conditions evaluated" }, { name: "Execution or refusal", actor: "Governed capability", gate: "outcome retained either way" }], evidence: "Legal basis, deconfliction clearance and operational approval as one pre-execution record." },
      { id: "incident_containment", title: "Incident containment", purpose: "Contain an incident affecting third parties without acting unilaterally.", stages: [{ name: "Incident declared", actor: "Duty Operations Officer", gate: "scope and affected parties identified" }, { name: "Affected party notification", actor: "Partner Liaison", gate: "party notified where required" }, { name: "Operational authority", actor: "Operations Director", gate: "containment authorised" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "authority and notification conditions evaluated" }, { name: "Containment or refusal", actor: "Governed capability", gate: "attributable outcome" }], evidence: "Notification and authority retained with every containment action." },
      { id: "vulnerability_equities", title: "Vulnerability equities", purpose: "Decide disclosure through a board, not through an operator's initiative.", stages: [{ name: "Vulnerability logged", actor: "Vulnerability Coordinator", gate: "impact and exposure assessed" }, { name: "Equities review", actor: "Disclosure Board", gate: "defensive and operational equities weighed" }, { name: "Decision", actor: "Disclosure Board", gate: "disclose / withhold / delay recorded" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "board-approval condition evaluated" }, { name: "Disclosure or refusal", actor: "Governed capability", gate: "outcome retained" }], evidence: "Equities decision retained for every vulnerability, disclosed or not." },
      { id: "attribution", title: "Attribution", purpose: "Keep public attribution behind an evidential threshold and a board decision.", stages: [{ name: "Analytic assessment", actor: "Chief Analyst", gate: "confidence and basis stated" }, { name: "Board review", actor: "Attribution Board", gate: "evidential threshold met" }, { name: "Policy clearance", actor: "Policy and legal", gate: "consequences accepted" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "board-approval condition evaluated" }, { name: "Publication or refusal", actor: "Governed capability", gate: "attributable outcome" }], evidence: "Evidential basis and board decision retained with every published attribution." },
    ],

    capabilities: [
      { id: "active_response", title: "Active response and counter-operations", detail: "Any action that affects infrastructure outside the estate", governed_by: ["cy_no_autonomous_active_response", "cy_deconfliction_required"] },
      { id: "containment", title: "Containment actions", detail: "Isolation, blocking, revocation, sinkholing and account disablement", governed_by: ["cy_containment_outside_estate_requires_authority"] },
      { id: "attribution", title: "Public attribution", detail: "Naming actors, public advisories and media briefing", governed_by: ["cy_attribution_requires_review"] },
      { id: "disclosure", title: "Vulnerability disclosure", detail: "Vendor notification, advisories and technical detail release", governed_by: ["cy_vulnerability_disclosure_governed"] },
      { id: "incident_data", title: "Incident data handling", detail: "Sharing incident data, victim data and samples", governed_by: ["cy_block_incident_data_egress"] },
      { id: "evidence", title: "Evidence handling", detail: "Artefact modification, deletion, reimaging and log clearing", governed_by: ["cy_evidence_integrity_preserved"] },
    ],

    readiness: [
      { key: "coverage", label: "Operational capability governed", source: "health:policy_coverage" },
      { key: "policies_enforcing", label: "Operational policies enforcing", source: "pack:policies_enforcing" },
      { key: "refusals", label: "Actions refused at the authority gate", source: "pack:blocked" },
      { key: "runtime", label: "Runtime health", source: "health:runtime_health" },
      { key: "held_decisions", label: "Operations held for authority", source: "context:approvals_pending" },
      { key: "open_incidents", label: "Open incidents", source: "context:open_incidents" },
      { key: "blocked_total", label: "Total governed refusals in the estate", source: "context:blocked_total" },
      { key: "critical_drift", label: "Critical drift from governed baseline", source: "context:critical_drift" },
      { key: "mean_time_to_contain", label: "Mean time to contain", detail: "Measured containment time from the incident management system.", source: "incident:mttc" },
      { key: "partner_deconfliction", label: "Partner deconfliction currency", detail: "Currency of deconfliction arrangements with partner organisations.", source: "partner:deconfliction" },
    ],

    risk_models: [
      { id: "unauthorised_effect", title: "Unauthorised effect", factors: ["active response capability present", "operational authority policy active", "legal authority policy active", "approvers mapped"], escalates_when: "an action affecting external infrastructure can execute without both authorities" },
      { id: "deconfliction_risk", title: "Deconfliction risk", factors: ["operational capability present", "deconfliction flags instrumented", "partner arrangements current"], escalates_when: "an operation can begin with deconfliction unresolved" },
      { id: "attribution_risk", title: "Attribution risk", factors: ["publication capability present", "board approval policy active", "evidential threshold defined"], escalates_when: "an attribution can be published without board approval" },
      { id: "evidence_risk", title: "Evidential risk", factors: ["remediation capability present", "preservation flags instrumented", "active investigations"], escalates_when: "evidence can be altered while an investigation is active" },
    ],

    twin_projections: [
      { id: "operational_capabilities", title: "Operational capabilities", entity_kinds: ["tool~active_response|disrupt|take_down|seize|counter|operation"], reads: "capability that can affect infrastructure outside the estate" },
      { id: "containment_capabilities", title: "Containment capabilities", entity_kinds: ["tool~isolate|block|revoke|sinkhole|disable"], reads: "capability that can contain, including third-party impact" },
      { id: "disclosure_capabilities", title: "Disclosure and attribution capabilities", entity_kinds: ["tool~disclos|advisory|attribut|publish|brief"], reads: "capability that can make a public statement" },
      { id: "evidence_capabilities", title: "Evidence-affecting capabilities", entity_kinds: ["tool~evidence|artefact|reimage|clear_logs|delete"], reads: "capability that can alter evidential material" },
      { id: "operational_estate", title: "Operational estate", entity_kinds: ["ai_system", "agent", "mcp_server", "api"], reads: "the systems and agents operating in the cyber mission" },
      { id: "authorities", title: "Operational authorities", entity_kinds: ["approver", "operator", "trust_boundary"], reads: "the authorities and boundaries the chains depend on" },
    ],

    briefings: [
      { id: "head_of_ops", title: "Head of Cyber Operations briefing", audience: "Head of Cyber Operations", sections: ["Operations authorised and held", "Actions refused and the missing authority", "Deconfliction position", "Open incidents", "Capability governance coverage"] },
      { id: "legal_brief", title: "Legal authority briefing", audience: "Legal Adviser", sections: ["Consequential actions and their statutory basis", "Proportionality assessments", "Third-party impact", "Evidence retained for review"] },
      { id: "national_brief", title: "National cyber executive briefing", audience: "National Cyber Director", sections: ["National incident position", "Attribution decisions", "Vulnerability equities outcomes", "Partner and allied coordination"] },
    ],

    reports: [
      { id: "operations_evidence", title: "Operations evidence pack", audience: "Oversight and inquiry", cadence: "monthly", contents: ["Signed decision record", "Authority attribution", "Refusals with reasons", "Deconfliction clearances"] },
      { id: "equities_report", title: "Vulnerability equities report", audience: "Disclosure Board", cadence: "quarterly", contents: ["Vulnerabilities handled", "Decisions and rationale", "Disclosure timelines"] },
      { id: "incident_report", title: "National incident report", audience: "National Cyber Director", cadence: "per incident", contents: ["Timeline and containment actions", "Authority and notification record", "Victim data handling", "Evidence preservation position"] },
    ],
  },
};

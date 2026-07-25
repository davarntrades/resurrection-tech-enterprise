/* Guardian OS — Defence Operations Intelligence Pack (Sovereign).
 *
 * Governed autonomous operations, mission planning, command structure, asset
 * relationships and deployment readiness for defence organisations. DATA ONLY.
 */
"use strict";

module.exports = {
  id: "defence-operations",
  version: "1.0.0",
  industry: "Defence operations",
  title: "Defence Operations Pack",
  purpose:
    "Governed autonomous operations, mission planning, command authority and deployment readiness for defence organisations running AI inside an operational command structure.",
  match: ["defence", "defense", "armed forces", "military", "joint command", "naval", "air force", "army"],
  regulations: [
    "Rules of engagement and targeting directive",
    "Law of armed conflict / international humanitarian law",
    "Meaningful human control over the use of force",
    "NATO / allied interoperability standards",
    "Defence security and accreditation policy",
    "Export control and technology release",
    "Airworthiness / seaworthiness and safety case",
  ],

  policies: [
    {
      name: "def_no_autonomous_force",
      domain: "compliance",
      spec: {
        match: { tools: ["engage_target", "release_effect", "authorise_strike", "commit_weapon", "apply_effect"] },
        conditions: { unauthorized_unless: ["command_authority_approved", "legal_adviser_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "def_mission_plan_requires_command_approval",
      domain: "enterprise",
      spec: {
        match: { tools: ["publish_mission_plan", "task_asset", "retask_platform", "issue_fragmentary_order", "commit_force"] },
        conditions: { unauthorized_unless: ["command_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "def_autonomous_platform_requires_supervision",
      domain: "enterprise",
      spec: {
        match: { tools: ["launch_platform", "set_autonomy_level", "hand_off_control", "extend_mission_envelope"] },
        conditions: { unauthorized_unless: ["supervisory_operator_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "def_block_operational_data_release",
      domain: "data_privacy",
      spec: {
        match: { tools: ["share_picture", "export_track_data", "send_message", "publish", "sync_to_partner"] },
        conditions: { flag_true_blocks: ["destination_external", "contains_operational_material", "recipient_not_cleared"] },
        severity: "critical",
      },
    },
    {
      name: "def_deconfliction_required_before_tasking",
      domain: "enterprise",
      spec: {
        match: { tools: ["task_asset", "assign_route", "allocate_airspace", "schedule_sortie"] },
        conditions: { flag_true_blocks: ["deconfliction_unresolved", "airspace_conflict"] },
        severity: "critical",
      },
    },
    {
      name: "def_capability_change_requires_safety_case",
      domain: "cybersecurity",
      spec: {
        match: { tools: ["deploy_model", "update_platform_software", "change_autonomy_configuration"] },
        conditions: { unauthorized_unless: ["safety_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
  ],

  templates: [
    {
      name: "def_rules_of_engagement_gate",
      description: "Bind a capability to the current rules of engagement before it may act.",
      domain: "compliance",
      spec: { match: { tools: ["<effect_tool>"] }, conditions: { unauthorized_unless: ["roe_confirmed", "command_authority_approved"] }, severity: "critical" },
    },
    {
      name: "def_autonomy_envelope",
      description: "Refuse an action that would take a platform outside its authorised autonomy envelope.",
      domain: "enterprise",
      spec: { match: { tools: ["<platform_tool>"] }, conditions: { flag_true_blocks: ["outside_authorised_envelope"] }, severity: "critical" },
    },
  ],

  evidence_mappings: [
    { regulation: "Meaningful human control over the use of force", control: "No autonomous application of force", evidence: "Effect-releasing capability cannot execute without command authority and legal adviser approval; every attempt is retained with its verdict." },
    { regulation: "Law of armed conflict / IHL", control: "Legal review before consequential action", evidence: "The legal authority approval is part of the pre-execution record, not a post-hoc annotation." },
    { regulation: "Rules of engagement and targeting directive", control: "Actions bound to current ROE", evidence: "ROE confirmation is an evaluated pre-condition; refusals record which condition was unmet." },
    { regulation: "Defence security and accreditation policy", control: "Operational data does not leave the cleared boundary", evidence: "Every share, export and partner sync is evaluated against destination and clearance flags before it executes." },
    { regulation: "Airworthiness / safety case", control: "Capability change under safety authority", evidence: "Platform software and autonomy configuration changes require safety authority approval and are tied to the safety case." },
    { regulation: "NATO / allied interoperability", control: "Attributable release to partners", evidence: "Partner release is a discrete authorised act with a named releasing authority retained in the evidence pack." },
  ],

  incident_workflows: [
    { kind: "unauthorised_effect_attempt", severity: "critical", steps: ["Confirm the effect was refused, not applied", "Isolate the requesting capability", "Notify command authority and legal adviser", "Establish which authority was missing", "Preserve the governed decision record", "Restore governance before return to service"] },
    { kind: "autonomy_envelope_breach", severity: "critical", steps: ["Recover or constrain the platform", "Establish the commanded versus authorised envelope", "Notify the supervisory operator and safety authority", "Review the autonomy configuration", "Re-establish the safety case"] },
    { kind: "deconfliction_failure", severity: "critical", steps: ["Halt affected tasking", "Re-run deconfliction", "Notify the operations controller", "Establish whether tasking executed", "Record the outcome"] },
    { kind: "operational_data_release", severity: "critical", steps: ["Identify material and recipient", "Confirm clearance position", "Notify the security authority", "Assess operational impact", "Report through the chain of command"] },
  ],

  sovereign: {
    classification: "secret",
    mission_domain: "Defence operations",
    mission: "Govern autonomous and AI-assisted defence operations within a command structure that retains human authority over force.",

    authority_chains: [
      { id: "command_authority", title: "Command authority", authority: "Commanding Officer", delegates_to: ["Operations Officer", "Duty Watch Officer"], authorises: ["publish_mission_plan", "task_asset", "commit_force", "engage_target"], evidence: "Named command approval retained against every tasking and effect decision." },
      { id: "legal_authority", title: "Legal authority", authority: "Legal Adviser (LEGAD)", delegates_to: ["Deputy LEGAD"], authorises: ["engage_target", "release_effect", "authorise_strike"], evidence: "Legal review recorded before any effect decision reaches execution." },
      { id: "supervisory_operator", title: "Supervisory operator", authority: "Platform Supervisor", delegates_to: ["Mission Operator"], authorises: ["launch_platform", "set_autonomy_level", "hand_off_control"], evidence: "Human supervision attributed to every autonomy transition." },
      { id: "safety_authority", title: "Safety and airworthiness authority", authority: "Safety Authority", delegates_to: ["Design Organisation", "Release-to-Service Authority"], authorises: ["deploy_model", "update_platform_software", "change_autonomy_configuration"], evidence: "Capability changes tied to the safety case that permitted them." },
      { id: "release_authority", title: "Partner release authority", authority: "Security Authority", delegates_to: ["Release Officer"], authorises: ["sync_to_partner", "share_picture", "export_track_data"], evidence: "Named releasing authority for every partner disclosure." },
    ],

    workflows: [
      { id: "mission_planning", title: "Mission planning", purpose: "Take a mission from concept to governed tasking.", stages: [{ name: "Concept", actor: "Planning staff", gate: "objective and constraints stated" }, { name: "Deconfliction", actor: "Operations Officer", gate: "airspace and route conflicts resolved" }, { name: "Legal review", actor: "LEGAD", gate: "ROE and IHL position confirmed" }, { name: "Command approval", actor: "Commanding Officer", gate: "mission plan authorised" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "Ω policies evaluated before tasking" }, { name: "Tasking or refusal", actor: "Governed capability", gate: "outcome retained either way" }], evidence: "Plan, deconfliction, legal position and command approval retained as one record." },
      { id: "effect_authorisation", title: "Effect authorisation", purpose: "Hold every effect decision behind human command authority.", stages: [{ name: "Effect proposed", actor: "Mission system", gate: "proposal only — never execution" }, { name: "ROE check", actor: "LEGAD", gate: "current ROE confirmed" }, { name: "Command authority", actor: "Commanding Officer", gate: "effect authorised" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "authority conditions evaluated" }, { name: "Execution or refusal", actor: "Governed capability", gate: "attributable outcome" }], evidence: "Pre-execution legal and command record for every effect decision." },
      { id: "autonomy_handover", title: "Autonomy handover", purpose: "Change a platform's autonomy level under named supervision.", stages: [{ name: "Handover requested", actor: "Mission Operator", gate: "envelope and duration stated" }, { name: "Envelope check", actor: "Platform Supervisor", gate: "within authorised envelope" }, { name: "Supervisory approval", actor: "Platform Supervisor", gate: "handover authorised" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "supervision condition evaluated" }, { name: "Transition recorded", actor: "Evidence ledger", gate: "autonomy state change retained" }], evidence: "Every autonomy transition attributed to a named supervisor." },
      { id: "readiness_review", title: "Deployment readiness review", purpose: "Establish whether a capability is governed and ready to deploy.", stages: [{ name: "Capability declared", actor: "Force generation", gate: "capability and assets identified" }, { name: "Governance check", actor: "Guardian OS", gate: "policies active for every declared capability" }, { name: "Safety position", actor: "Safety Authority", gate: "release to service current" }, { name: "Readiness decision", actor: "Commanding Officer", gate: "deploy / hold" }], evidence: "Readiness decision retained with the governance position that informed it." },
    ],

    capabilities: [
      { id: "effects", title: "Effect release", detail: "Any capability that applies an effect", governed_by: ["def_no_autonomous_force"] },
      { id: "tasking", title: "Asset tasking and mission planning", detail: "Publishing plans, tasking and retasking assets", governed_by: ["def_mission_plan_requires_command_approval", "def_deconfliction_required_before_tasking"] },
      { id: "autonomy", title: "Platform autonomy management", detail: "Launch, autonomy level and control handover", governed_by: ["def_autonomous_platform_requires_supervision"] },
      { id: "picture_sharing", title: "Operational picture sharing", detail: "Track data, common picture and partner sync", governed_by: ["def_block_operational_data_release"] },
      { id: "platform_change", title: "Platform and model change", detail: "Software, model and autonomy configuration change", governed_by: ["def_capability_change_requires_safety_case"] },
    ],

    readiness: [
      { key: "governed_capability", label: "Capability under active governance", detail: "Share of declared capability covered by an active Ω policy.", source: "health:policy_coverage" },
      { key: "policies_enforcing", label: "Operational policies enforcing", source: "pack:policies_enforcing" },
      { key: "refusals", label: "Actions refused at the authority gate", source: "pack:blocked" },
      { key: "runtime", label: "Runtime health", detail: "Whether the governing kernel is healthy across the estate.", source: "health:runtime_health" },
      { key: "platforms", label: "Governed platforms and agents", source: "estate:agent" },
      { key: "systems", label: "Mission systems in the estate", source: "estate:ai_system" },
      { key: "held_decisions", label: "Decisions held at command authority", source: "context:approvals_pending" },
      { key: "open_incidents", label: "Open operational incidents", source: "context:open_incidents" },
      { key: "sortie_readiness", label: "Sortie generation rate", detail: "Available sorties against planned, from the force-generation system.", source: "force:sortie_generation" },
      { key: "logistics", label: "Sustainment position", detail: "Sustainment and spares position for governed platforms.", source: "logistics:sustainment" },
    ],

    risk_models: [
      { id: "force_authority", title: "Authority over force", factors: ["effect capability present", "authority policy active", "legal adviser mapped", "command approver mapped"], escalates_when: "an effect capability exists without both command and legal authority active" },
      { id: "autonomy_risk", title: "Autonomy risk", factors: ["autonomy configuration changes", "supervision policy active", "envelope breaches"], escalates_when: "autonomy level can change without a named supervisor" },
      { id: "deconfliction", title: "Deconfliction exposure", factors: ["tasking capability present", "deconfliction flags instrumented", "airspace conflicts"], escalates_when: "tasking can execute with deconfliction unresolved" },
      { id: "disclosure", title: "Operational disclosure", factors: ["partner sync capability", "clearance flags instrumented", "external destinations"], escalates_when: "picture sharing can reach an uncleared recipient" },
    ],

    twin_projections: [
      { id: "effect_capabilities", title: "Effect-releasing capabilities", entity_kinds: ["tool~engage|strike|effect|weapon|commit"], reads: "capability that can apply an effect" },
      { id: "tasking_capabilities", title: "Tasking and planning capabilities", entity_kinds: ["tool~task|retask|mission_plan|order|sortie|allocate"], reads: "capability that can commit assets" },
      { id: "autonomy_controls", title: "Autonomy controls", entity_kinds: ["tool~autonomy|launch|hand_off|envelope"], reads: "capability that changes platform autonomy" },
      { id: "platforms", title: "Platforms and mission systems", entity_kinds: ["agent", "ai_system", "model"], reads: "the governed operational estate" },
      { id: "command_structure", title: "Command structure", entity_kinds: ["approver", "operator", "business_unit"], reads: "the command relationships authority chains depend on" },
      { id: "operational_boundaries", title: "Operational boundaries", entity_kinds: ["trust_boundary", "risk_zone", "critical_system"], reads: "declared operational and trust boundaries" },
    ],

    briefings: [
      { id: "command_brief", title: "Command governance briefing", audience: "Commanding Officer", sections: ["Effect decisions held and authorised", "Capability under active governance", "Autonomy transitions this period", "Open operational incidents", "Deployment readiness position"] },
      { id: "legad_brief", title: "Legal adviser briefing", audience: "LEGAD", sections: ["Effect decisions and their legal position", "ROE-gated refusals", "Person-affecting actions", "Evidence retained for review"] },
      { id: "safety_brief", title: "Safety authority briefing", audience: "Safety Authority", sections: ["Platform and model changes", "Autonomy configuration drift", "Release-to-service position"] },
    ],

    reports: [
      { id: "operations_evidence", title: "Operations evidence pack", audience: "Command and inquiry", cadence: "monthly", contents: ["Effect decisions with authority attribution", "Refusals and reasons", "Autonomy transitions", "Policy versions in force"] },
      { id: "readiness_report", title: "Deployment readiness report", audience: "Force generation", cadence: "weekly", contents: ["Governed capability coverage", "Held decisions", "Platform governance status", "Open incidents"] },
      { id: "autonomy_assurance", title: "Autonomy assurance report", audience: "Safety Authority", cadence: "quarterly", contents: ["Autonomy envelope adherence", "Configuration changes and authority", "Supervision attribution"] },
    ],
  },
};

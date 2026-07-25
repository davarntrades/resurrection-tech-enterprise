/* Guardian OS — Critical Infrastructure Intelligence Pack (Sovereign).
 *
 * Energy, utilities, telecoms, transport and water. Infrastructure dependency
 * graphs, operational risk, resilience metrics, incident workflows and executive
 * reporting for national infrastructure operators. DATA ONLY.
 */
"use strict";

module.exports = {
  id: "critical-infrastructure",
  version: "1.0.0",
  industry: "Critical national infrastructure",
  title: "Critical Infrastructure Pack",
  purpose:
    "Operational resilience governance for energy, utilities, telecoms, transport and water operators — dependency intelligence, operational risk, resilience metrics and incident workflows on one governed platform.",
  match: ["critical infrastructure", "energy", "utility", "utilities", "telecom", "transport", "rail", "water", "grid", "national infrastructure", "cni"],
  regulations: [
    "NIS2 / network and information systems regulations",
    "Operator of essential services obligations",
    "Sector safety case and licence conditions",
    "IEC 62443 — industrial automation and control security",
    "Operational resilience regulation and impact tolerances",
    "Emergency planning and civil contingency duties",
    "Environmental and public-safety consent regimes",
  ],

  policies: [
    {
      name: "ci_no_autonomous_control_action",
      domain: "enterprise",
      spec: {
        match: { tools: ["issue_setpoint", "open_breaker", "close_valve", "change_control_state", "dispatch_asset", "trip_protection"] },
        conditions: { unauthorized_unless: ["control_room_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "ci_block_safety_system_interference",
      domain: "cybersecurity",
      spec: {
        match: { tools: ["modify_safety_system", "override_interlock", "suppress_alarm", "disable_protection"] },
        conditions: { unauthorized_unless: ["safety_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "ci_ot_boundary_enforced",
      domain: "cybersecurity",
      spec: {
        match: { tools: ["write_to_plc", "push_configuration", "remote_access_ot", "deploy_to_scada"] },
        conditions: { flag_true_blocks: ["crosses_ot_boundary", "unmanaged_remote_session"] },
        severity: "critical",
      },
    },
    {
      name: "ci_load_shedding_requires_authority",
      domain: "enterprise",
      spec: {
        match: { tools: ["shed_load", "curtail_supply", "isolate_segment", "restrict_service"] },
        conditions: { unauthorized_unless: ["network_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "ci_maintenance_change_requires_window",
      domain: "enterprise",
      spec: {
        match: { tools: ["apply_change", "restart_asset", "update_firmware", "switch_configuration"] },
        conditions: { flag_true_blocks: ["outside_change_window", "affects_single_point_of_failure"] },
        severity: "critical",
      },
    },
    {
      name: "ci_block_operational_data_export",
      domain: "data_privacy",
      spec: {
        match: { tools: ["export_telemetry", "share_network_model", "publish_topology", "send_file"] },
        conditions: { flag_true_blocks: ["destination_external", "contains_network_topology", "contains_customer_data"] },
        severity: "critical",
      },
    },
  ],

  templates: [
    {
      name: "ci_impact_tolerance_gate",
      description: "Refuse an action that would breach a declared impact tolerance for an essential service.",
      domain: "enterprise",
      spec: { match: { tools: ["<service_affecting_tool>"] }, conditions: { flag_true_blocks: ["breaches_impact_tolerance"] }, severity: "critical" },
    },
    {
      name: "ci_single_point_of_failure_guard",
      description: "Require engineering authority before acting on an asset with no redundancy.",
      domain: "enterprise",
      spec: { match: { tools: ["<asset_tool>"] }, conditions: { unauthorized_unless: ["engineering_authority_approved"] }, severity: "critical" },
    },
  ],

  evidence_mappings: [
    { regulation: "NIS2 / essential services obligations", control: "Human authority over control actions", evidence: "Every control-state change requires control room approval; attempts and approvals are retained with the asset affected." },
    { regulation: "IEC 62443", control: "IT/OT boundary integrity", evidence: "Writes into control systems are evaluated against boundary-crossing flags before execution; refusals name the boundary." },
    { regulation: "Sector safety case and licence conditions", control: "Safety systems are not interfered with", evidence: "Interlock overrides, alarm suppression and protection changes require safety authority and are individually attributable." },
    { regulation: "Operational resilience and impact tolerances", control: "Service-affecting actions are governed", evidence: "Load shedding, curtailment and isolation require network authority; the decision record supports impact-tolerance reporting." },
    { regulation: "Emergency planning and civil contingency", control: "Reconstructable incident record", evidence: "Signed evidence packs reproduce the full decision trail for an incident, including actions the platform refused." },
    { regulation: "Environmental and public-safety consent", control: "Change under controlled conditions", evidence: "Changes outside an approved window, or affecting a single point of failure, are refused before execution." },
  ],

  incident_workflows: [
    { kind: "loss_of_essential_service", severity: "critical", steps: ["Establish affected service and customers", "Confirm which control actions executed and which were refused", "Notify the control room and network authority", "Assess against impact tolerance", "Restore service", "Report to the sector regulator", "Retain the governed decision record"] },
    { kind: "ot_boundary_violation", severity: "critical", steps: ["Isolate the crossing path", "Establish what was written to which control system", "Notify the OT security authority", "Verify safety system integrity", "Restore the boundary before resuming"] },
    { kind: "safety_system_interference", severity: "critical", steps: ["Restore protection and interlocks", "Establish authority for the change", "Notify the safety authority", "Re-validate the safety case", "Record the outcome"] },
    { kind: "cascading_dependency_failure", severity: "critical", steps: ["Map the dependency path from the twin", "Identify downstream essential services", "Notify affected operators", "Contain the cascade", "Review the dependency model"] },
  ],

  sovereign: {
    classification: "official_sensitive",
    mission_domain: "Critical national infrastructure",
    mission: "Govern AI acting on the control, resilience and continuity of essential services across energy, utilities, telecoms, transport and water.",

    authority_chains: [
      { id: "control_room", title: "Control room authority", authority: "Control Room Manager", delegates_to: ["Shift Supervisor", "Duty Controller"], authorises: ["issue_setpoint", "change_control_state", "dispatch_asset"], evidence: "Named controller against every control action, executed or refused." },
      { id: "safety_authority", title: "Safety authority", authority: "Safety Authority", delegates_to: ["Process Safety Engineer"], authorises: ["modify_safety_system", "override_interlock", "disable_protection"], evidence: "Safety case reference retained with every protection change." },
      { id: "network_authority", title: "Network authority", authority: "Network Operations Director", delegates_to: ["Network Controller"], authorises: ["shed_load", "curtail_supply", "isolate_segment"], evidence: "Service-affecting decisions attributed and assessed against impact tolerance." },
      { id: "engineering_authority", title: "Engineering authority", authority: "Chief Engineer", delegates_to: ["Asset Engineer"], authorises: ["update_firmware", "apply_change", "restart_asset"], evidence: "Change window and redundancy position recorded with the approval." },
      { id: "ot_security", title: "OT security authority", authority: "OT Security Lead", delegates_to: ["Control Systems Security Engineer"], authorises: ["remote_access_ot", "deploy_to_scada", "write_to_plc"], evidence: "Every boundary crossing attributed to a named session and authority." },
    ],

    workflows: [
      { id: "control_action", title: "Governed control action", purpose: "Hold every control-state change behind control room authority.", stages: [{ name: "Action proposed", actor: "Optimisation or AI system", gate: "proposal only — never direct actuation" }, { name: "Impact assessment", actor: "Network Controller", gate: "service impact and tolerance assessed" }, { name: "Control room approval", actor: "Shift Supervisor", gate: "action authorised" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "authority and boundary conditions evaluated" }, { name: "Execution or refusal", actor: "Governed capability", gate: "outcome retained either way" }], evidence: "Controller attribution on every control action." },
      { id: "change_control", title: "Operational change control", purpose: "Admit a change to a live asset without creating a resilience gap.", stages: [{ name: "Change raised", actor: "Asset Engineer", gate: "asset, window and redundancy stated" }, { name: "Redundancy check", actor: "Guardian OS twin", gate: "single point of failure identified" }, { name: "Engineering approval", actor: "Chief Engineer", gate: "change authorised for a window" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "window and redundancy flags evaluated" }, { name: "Change applied or refused", actor: "Governed capability", gate: "attributable outcome" }], evidence: "Change window and redundancy position retained with the decision." },
      { id: "resilience_review", title: "Operational resilience review", purpose: "Establish whether essential services remain inside impact tolerance.", stages: [{ name: "Services declared", actor: "Resilience lead", gate: "essential services and tolerances stated" }, { name: "Dependency mapping", actor: "Guardian OS twin", gate: "dependency paths derived from the estate" }, { name: "Governance position", actor: "Guardian OS", gate: "policy coverage of service-affecting capability" }, { name: "Board decision", actor: "Executive", gate: "tolerances accepted or investment directed" }], evidence: "Resilience position retained with the dependency evidence behind it." },
      { id: "incident_response", title: "Incident response", purpose: "Run an incident with a reconstructable decision record.", stages: [{ name: "Detection", actor: "Control room", gate: "incident declared" }, { name: "Containment", actor: "Duty Controller", gate: "affected segment isolated under authority" }, { name: "Regulatory assessment", actor: "Compliance", gate: "reportability determined" }, { name: "Restoration", actor: "Operations", gate: "service restored" }, { name: "Evidence", actor: "Guardian OS", gate: "signed incident record produced" }], evidence: "Signed evidence pack covering the whole incident, refusals included." },
    ],

    capabilities: [
      { id: "control_actions", title: "Control-state actions", detail: "Setpoints, breakers, valves, dispatch and protection", governed_by: ["ci_no_autonomous_control_action"] },
      { id: "safety_systems", title: "Safety system interaction", detail: "Interlocks, alarms and protection systems", governed_by: ["ci_block_safety_system_interference"] },
      { id: "ot_writes", title: "OT boundary crossing", detail: "Writes and deployments into control systems", governed_by: ["ci_ot_boundary_enforced"] },
      { id: "service_curtailment", title: "Service curtailment", detail: "Load shedding, curtailment and segment isolation", governed_by: ["ci_load_shedding_requires_authority"] },
      { id: "asset_change", title: "Asset change", detail: "Firmware, configuration and restart of live assets", governed_by: ["ci_maintenance_change_requires_window"] },
      { id: "topology_disclosure", title: "Topology and telemetry disclosure", detail: "Network model, topology and customer telemetry", governed_by: ["ci_block_operational_data_export"] },
    ],

    readiness: [
      { key: "coverage", label: "Service-affecting capability governed", detail: "Share of control capability under an active Ω policy.", source: "health:policy_coverage" },
      { key: "policies_enforcing", label: "Resilience policies enforcing", source: "pack:policies_enforcing" },
      { key: "refusals", label: "Control actions refused", source: "pack:blocked" },
      { key: "critical_systems", label: "Critical systems mapped", source: "estate:critical_system" },
      { key: "protected_assets", label: "Protected assets mapped", source: "estate:protected_asset" },
      { key: "boundaries", label: "Trust boundaries declared", source: "estate:trust_boundary" },
      { key: "runtime", label: "Runtime health", source: "health:runtime_health" },
      { key: "open_incidents", label: "Open operational incidents", source: "context:open_incidents" },
      { key: "drift", label: "Open drift from governed baseline", source: "context:open_drift" },
      { key: "impact_tolerance", label: "Impact tolerance headroom", detail: "Remaining headroom against declared impact tolerances per essential service.", source: "resilience:impact_tolerance" },
      { key: "restoration_time", label: "Measured restoration time", detail: "Observed time to restore essential services in exercise or incident.", source: "resilience:restoration_time" },
    ],

    risk_models: [
      { id: "dependency_cascade", title: "Dependency cascade", factors: ["mapped dependencies between systems", "critical systems without redundancy", "shared upstream services"], escalates_when: "an essential service depends on a single unredundant asset" },
      { id: "ot_exposure", title: "OT exposure", factors: ["OT-writing capability present", "boundary flags instrumented", "unmanaged remote sessions"], escalates_when: "an AI capability can write into a control system with no boundary control active" },
      { id: "safety_integrity", title: "Safety system integrity", factors: ["interlock override capability", "alarm suppression capability", "safety authority policy active"], escalates_when: "protection can be altered without safety authority" },
      { id: "resilience_gap", title: "Resilience gap", factors: ["essential services declared", "impact tolerances instrumented", "policy coverage of service-affecting capability"], escalates_when: "a service-affecting capability sits outside every active policy" },
    ],

    twin_projections: [
      { id: "control_capabilities", title: "Control capabilities", entity_kinds: ["tool~setpoint|breaker|valve|dispatch|control_state|trip"], reads: "capability that changes plant or network state" },
      { id: "safety_capabilities", title: "Safety system capabilities", entity_kinds: ["tool~safety|interlock|alarm|protection"], reads: "capability that touches protective systems" },
      { id: "ot_paths", title: "IT/OT crossing paths", entity_kinds: ["tool~plc|scada|ot|firmware|remote_access"], reads: "capability that crosses into operational technology" },
      { id: "dependency_graph", title: "Infrastructure dependency graph", entity_kinds: ["ai_system", "api", "integration", "environment"], reads: "the systems and integrations whose refs form the dependency graph" },
      { id: "essential_services", title: "Essential services and assets", entity_kinds: ["critical_system", "protected_asset", "risk_zone"], reads: "declared essential services, assets and zones" },
      { id: "operating_authorities", title: "Operating authorities", entity_kinds: ["approver", "operator"], reads: "control room and engineering authorities" },
    ],

    briefings: [
      { id: "exec_resilience", title: "Executive resilience briefing", audience: "Chief Executive / Board", sections: ["Essential services and their governance position", "Control actions refused this period", "Dependency concentration", "Open incidents and regulatory exposure", "Resilience investment recommendations"] },
      { id: "control_room_brief", title: "Control room governance briefing", audience: "Control Room Manager", sections: ["Actions held for authority", "Refusals and reasons", "Change window adherence", "Asset governance status"] },
      { id: "regulator_brief", title: "Regulatory position briefing", audience: "Regulatory affairs", sections: ["Impact tolerance position", "Reportable incidents", "Evidence completeness", "Policy versions in force"] },
    ],

    reports: [
      { id: "resilience_report", title: "Operational resilience report", audience: "Board and regulator", cadence: "quarterly", contents: ["Essential services and tolerances", "Dependency mapping", "Governed refusals", "Incident record"] },
      { id: "incident_evidence", title: "Incident evidence pack", audience: "Regulator and inquiry", cadence: "per incident", contents: ["Signed decision record", "Control actions and authority", "Refusals with reasons", "Restoration timeline"] },
      { id: "ot_assurance", title: "OT governance assurance", audience: "OT Security Lead", cadence: "monthly", contents: ["Boundary crossings", "Remote session attribution", "Firmware and configuration change"] },
    ],
  },
};

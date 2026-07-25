/* Guardian OS — Research & Development Intelligence Pack (Sovereign).
 *
 * Governance for sovereign research: export control, dual-use assessment,
 * research integrity, collaboration and intellectual property protection in
 * national laboratories, research agencies and defence science organisations.
 * DATA ONLY.
 */
"use strict";

module.exports = {
  id: "research-development",
  version: "1.0.0",
  industry: "Sovereign research & development",
  title: "Research & Development Pack",
  purpose:
    "Research integrity, export control, dual-use assessment and intellectual property protection for national laboratories, research agencies and defence science organisations running AI on sensitive research.",
  match: ["research agency", "national laboratory", "defence science", "research and development", "sovereign research", "r&d", "science and technology"],
  regulations: [
    "Export control and technology transfer regimes",
    "Dual-use and proliferation controls",
    "Research security and trusted research guidance",
    "Intellectual property and invention disclosure",
    "Research ethics and human participant protection",
    "Research integrity and reproducibility standards",
    "International collaboration and technology release policy",
  ],

  policies: [
    {
      name: "rd_export_controlled_transfer_requires_authority",
      domain: "compliance",
      spec: {
        match: { tools: ["share_with_collaborator", "publish_result", "transfer_technology", "export_dataset", "release_design"] },
        conditions: { unauthorized_unless: ["export_control_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "rd_block_controlled_technology_egress",
      domain: "data_privacy",
      spec: {
        match: { tools: ["send_file", "upload_to_repository", "sync_to_cloud", "share_notebook", "push_model_weights"] },
        conditions: { flag_true_blocks: ["destination_external", "contains_controlled_technology", "recipient_foreign_national", "crosses_jurisdiction"] },
        severity: "critical",
      },
    },
    {
      name: "rd_dual_use_assessment_required",
      domain: "compliance",
      spec: {
        match: { tools: ["start_research_programme", "commission_experiment", "scale_synthesis", "request_compute_allocation"] },
        conditions: { unauthorized_unless: ["dual_use_assessment_recorded", "research_authority_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "rd_publication_requires_review",
      domain: "compliance",
      spec: {
        match: { tools: ["submit_for_publication", "present_externally", "release_preprint", "publish_code"] },
        conditions: { unauthorized_unless: ["publication_review_approved", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "rd_human_participant_research_requires_ethics",
      domain: "compliance",
      spec: {
        match: { tools: ["recruit_participant", "collect_participant_data", "run_human_study", "link_participant_records"] },
        conditions: { unauthorized_unless: ["ethics_approval_recorded", "operator_approved"] },
        severity: "critical",
      },
    },
    {
      name: "rd_research_data_integrity",
      domain: "compliance",
      spec: {
        match: { tools: ["modify_dataset", "delete_experiment_record", "alter_result", "overwrite_raw_data"] },
        conditions: { flag_true_blocks: ["record_under_integrity_hold", "raw_data_immutable"] },
        severity: "critical",
      },
    },
  ],

  templates: [
    {
      name: "rd_trusted_research_gate",
      description: "Require research security review before a collaboration with a listed entity proceeds.",
      domain: "compliance",
      spec: { match: { tools: ["<collaboration_tool>"] }, conditions: { unauthorized_unless: ["research_security_approved"] }, severity: "critical" },
    },
    {
      name: "rd_compute_threshold_gate",
      description: "Escalate a compute allocation above an agreed threshold for research authority review.",
      domain: "compliance",
      spec: { match: { tools: ["<compute_tool>"] }, conditions: { threshold: { field: "compute_hours", op: ">", value: 10000 } }, severity: "critical" },
    },
  ],

  evidence_mappings: [
    { regulation: "Export control and technology transfer", control: "Controlled technology does not transfer without licence authority", evidence: "Sharing, publication and transfer are evaluated at execution against control status and recipient; refusals name the control." },
    { regulation: "Dual-use and proliferation controls", control: "Dual-use assessment precedes consequential research", evidence: "Programme initiation, scaled synthesis and large compute allocation require a recorded dual-use assessment before they can proceed." },
    { regulation: "Research security and trusted research", control: "Collaborations are reviewed, not assumed", evidence: "Collaborator sharing requires named export-control authority; the record shows who authorised each disclosure." },
    { regulation: "Research ethics and human participants", control: "No participant research without ethics approval", evidence: "Recruitment, collection and linkage are refused without a recorded ethics approval reference." },
    { regulation: "Research integrity and reproducibility", control: "Raw data and results are not silently altered", evidence: "Modification of raw data or results under an integrity hold is refused, and the refusal is itself retained." },
    { regulation: "Intellectual property and invention disclosure", control: "Disclosure is a governed act", evidence: "Publication and external presentation require review approval, so first disclosure is always attributable." },
  ],

  incident_workflows: [
    { kind: "controlled_technology_disclosure", severity: "critical", steps: ["Establish what was disclosed, to whom and in which jurisdiction", "Contain further transfer", "Notify the export control authority and legal", "Assess licence position and reportability", "Report to the regulator", "Retain the governed record"] },
    { kind: "dual_use_concern", severity: "critical", steps: ["Suspend the activity", "Convene the dual-use review", "Assess proliferation potential", "Decide continue / constrain / stop", "Record the decision and its reasoning"] },
    { kind: "research_integrity_breach", severity: "critical", steps: ["Preserve raw data and the decision record", "Establish what was altered and by whom", "Notify the research integrity officer", "Assess affected publications", "Correct or retract as required"] },
    { kind: "unapproved_participant_research", severity: "critical", steps: ["Stop collection immediately", "Identify affected participants", "Notify the ethics committee", "Assess whether data must be destroyed", "Record the outcome"] },
  ],

  sovereign: {
    classification: "official_sensitive",
    mission_domain: "Sovereign research and development",
    mission: "Govern AI acting on sensitive research so that discovery accelerates without exporting sovereign capability or bypassing ethics.",

    authority_chains: [
      { id: "export_control", title: "Export control authority", authority: "Export Control Officer", delegates_to: ["Licensing Officer"], authorises: ["transfer_technology", "share_with_collaborator", "export_dataset", "release_design"], evidence: "Licence position and named authority for every controlled disclosure." },
      { id: "research_authority", title: "Research authority", authority: "Director of Research", delegates_to: ["Programme Director", "Principal Investigator"], authorises: ["start_research_programme", "commission_experiment", "request_compute_allocation"], evidence: "Programme authorisation retained with the dual-use assessment behind it." },
      { id: "ethics", title: "Research ethics authority", authority: "Research Ethics Committee", delegates_to: ["Ethics Chair"], authorises: ["recruit_participant", "run_human_study", "link_participant_records"], evidence: "Ethics approval reference retained against every participant activity." },
      { id: "publication_review", title: "Publication review authority", authority: "Publication Review Board", delegates_to: ["Security Reviewer", "IP Counsel"], authorises: ["submit_for_publication", "release_preprint", "publish_code"], evidence: "Review decision retained with the disclosure it permitted." },
      { id: "research_security", title: "Research security authority", authority: "Research Security Lead", delegates_to: ["Trusted Research Adviser"], authorises: ["approve_collaboration"], evidence: "Collaboration risk assessment retained per partner." },
      { id: "integrity", title: "Research integrity authority", authority: "Research Integrity Officer", delegates_to: ["Data Steward"], authorises: ["release_integrity_hold"], evidence: "Integrity holds and their release attributable to a named officer." },
    ],

    workflows: [
      { id: "programme_initiation", title: "Programme initiation", purpose: "Start research with dual-use risk assessed rather than discovered later.", stages: [{ name: "Proposal", actor: "Principal Investigator", gate: "objective, methods and materials stated" }, { name: "Dual-use assessment", actor: "Research Security Lead", gate: "proliferation and misuse potential assessed" }, { name: "Research authority", actor: "Director of Research", gate: "programme authorised" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "assessment and authority conditions evaluated" }, { name: "Programme starts or is refused", actor: "Governed capability", gate: "outcome retained either way" }], evidence: "Dual-use assessment retained with the authorisation it supported." },
      { id: "collaboration_disclosure", title: "Collaboration and disclosure", purpose: "Share with partners without exporting controlled capability.", stages: [{ name: "Disclosure proposed", actor: "Researcher", gate: "material, partner and jurisdiction stated" }, { name: "Control classification", actor: "Export Control Officer", gate: "control status determined" }, { name: "Security review", actor: "Research Security Lead", gate: "partner risk assessed" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "control and recipient flags evaluated" }, { name: "Disclosure or refusal", actor: "Governed capability", gate: "attributable outcome" }], evidence: "Licence position and partner assessment retained per disclosure." },
      { id: "publication", title: "Publication and first disclosure", purpose: "Protect sovereign capability and IP without stopping science.", stages: [{ name: "Draft submitted", actor: "Researcher", gate: "intended venue and content stated" }, { name: "Security review", actor: "Security Reviewer", gate: "no controlled content" }, { name: "IP review", actor: "IP Counsel", gate: "invention disclosure position settled" }, { name: "Board approval", actor: "Publication Review Board", gate: "publication approved" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "review condition evaluated" }], evidence: "Review decision retained as the record of first disclosure." },
      { id: "integrity_hold", title: "Research integrity hold", purpose: "Keep raw data and results defensible under challenge.", stages: [{ name: "Hold applied", actor: "Research Integrity Officer", gate: "records placed under hold" }, { name: "Runtime evaluation", actor: "Runtime Governance kernel", gate: "modification refused while held" }, { name: "Investigation", actor: "Integrity panel", gate: "findings recorded" }, { name: "Hold released", actor: "Research Integrity Officer", gate: "release attributable" }], evidence: "Every attempted modification under hold retained, including refusals." },
    ],

    capabilities: [
      { id: "technology_transfer", title: "Technology transfer and collaboration", detail: "Sharing designs, datasets and technology with partners", governed_by: ["rd_export_controlled_transfer_requires_authority", "rd_block_controlled_technology_egress"] },
      { id: "programme_initiation", title: "Programme initiation and scaling", detail: "Starting programmes, commissioning experiments and allocating compute", governed_by: ["rd_dual_use_assessment_required"] },
      { id: "publication", title: "Publication and external presentation", detail: "Papers, preprints, code and conference disclosure", governed_by: ["rd_publication_requires_review"] },
      { id: "human_research", title: "Human participant research", detail: "Recruitment, collection and record linkage", governed_by: ["rd_human_participant_research_requires_ethics"] },
      { id: "data_integrity", title: "Research data integrity", detail: "Modification of raw data, records and results", governed_by: ["rd_research_data_integrity"] },
    ],

    readiness: [
      { key: "coverage", label: "Research capability governed", source: "health:policy_coverage" },
      { key: "policies_enforcing", label: "Research governance policies enforcing", source: "pack:policies_enforcing" },
      { key: "refusals", label: "Disclosures refused before transfer", source: "pack:blocked" },
      { key: "evidence", label: "Evidence completeness", source: "health:evidence_completeness" },
      { key: "research_systems", label: "Research AI systems governed", source: "estate:ai_system" },
      { key: "collaborations", label: "External integrations mapped", source: "estate:integration" },
      { key: "held_decisions", label: "Disclosures held for review", source: "context:approvals_pending" },
      { key: "open_incidents", label: "Open research governance incidents", source: "context:open_incidents" },
      { key: "licence_position", label: "Export licence position", detail: "Current licences and their coverage of active collaborations, from the licensing system.", source: "export:licences" },
      { key: "programme_portfolio", label: "Programme dual-use position", detail: "Active programmes by dual-use assessment outcome, from the research management system.", source: "research:portfolio" },
    ],

    risk_models: [
      { id: "export_exposure", title: "Export control exposure", factors: ["transfer capability present", "control-status flags instrumented", "foreign national recipients", "external destinations"], escalates_when: "controlled technology can be disclosed with no active licence authority control" },
      { id: "dual_use", title: "Dual-use risk", factors: ["programme initiation capability", "assessment policy active", "scaled synthesis or large compute capability"], escalates_when: "a programme can start or scale with no recorded dual-use assessment" },
      { id: "integrity_risk", title: "Research integrity risk", factors: ["data modification capability", "integrity holds instrumented", "raw data immutability"], escalates_when: "raw data or results can be altered with no integrity control" },
      { id: "ip_leakage", title: "Intellectual property leakage", factors: ["publication capability", "repository sync paths", "review policy active"], escalates_when: "first disclosure can occur without review" },
    ],

    twin_projections: [
      { id: "transfer_paths", title: "Technology transfer paths", entity_kinds: ["tool~transfer|share|collaborat|export|release|design"], reads: "capability that can move technology out of the organisation" },
      { id: "publication_paths", title: "Publication and repository paths", entity_kinds: ["tool~publish|preprint|repository|present|upload"], reads: "capability that can effect first disclosure" },
      { id: "programme_controls", title: "Programme and compute controls", entity_kinds: ["tool~programme|experiment|synthesis|compute|allocat"], reads: "capability that can start or scale research" },
      { id: "participant_paths", title: "Human participant paths", entity_kinds: ["tool~participant|recruit|study|consent"], reads: "capability touching human participants" },
      { id: "research_estate", title: "Research estate", entity_kinds: ["ai_system", "model", "agent", "environment"], reads: "the research systems and environments under governance" },
      { id: "research_authorities", title: "Research authorities", entity_kinds: ["approver", "operator", "compliance_requirement"], reads: "review boards, officers and the obligations they enforce" },
    ],

    briefings: [
      { id: "director_brief", title: "Director of Research briefing", audience: "Director of Research", sections: ["Programmes authorised and held", "Dual-use assessments outstanding", "Disclosures refused", "Open integrity matters", "Compute and capability position"] },
      { id: "export_brief", title: "Export control briefing", audience: "Export Control Officer", sections: ["Controlled disclosures attempted", "Refusals by control status", "Partner and jurisdiction exposure", "Licence coverage gaps"] },
      { id: "integrity_brief", title: "Research integrity briefing", audience: "Research Integrity Officer", sections: ["Records under hold", "Modification attempts refused", "Affected publications", "Investigation status"] },
    ],

    reports: [
      { id: "research_security_report", title: "Research security report", audience: "Executive and sponsor", cadence: "quarterly", contents: ["Collaboration risk position", "Controlled disclosures and authority", "Refusals with reasons", "Dual-use assessment coverage"] },
      { id: "export_evidence", title: "Export control evidence pack", audience: "Regulator and internal audit", cadence: "per audit", contents: ["Signed disclosure record", "Licence attribution", "Recipient and jurisdiction", "Policy versions in force"] },
      { id: "integrity_report", title: "Research integrity report", audience: "Research Integrity Officer", cadence: "monthly", contents: ["Integrity holds applied and released", "Refused modifications", "Raw data immutability position"] },
    ],
  },
};

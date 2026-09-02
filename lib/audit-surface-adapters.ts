import type { GovernedResult } from "./governed-result";
import type { RegulatoryExposure } from "./regulatory-exposure";
import type { ToolCall } from "./trajectory-eval";
import {
  buildCanonicalAuditRecord,
  buildEvidenceProvenance,
  buildObservedLatencyEvidence,
  chainedAuditDoc,
  sanitizeForEvidence,
  type EvalRecord,
  type ProtectedValueEvidence,
  type RuntimeOutcomeEvidence,
} from "./live-demo-audit";

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const callsFrom = (value: unknown): ToolCall[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const calls = value.filter((item) => item && typeof item === "object" && typeof item.tool === "string")
    .map((item) => ({ tool: String(item.tool), ...(item.args && typeof item.args === "object" ? { args: item.args } : {}) }));
  return calls.length ? calls as ToolCall[] : undefined;
};

export function controlRoomRecord(row: Record<string, any>): EvalRecord {
  const governed = row.governed_result as GovernedResult | undefined;
  const proposal = callsFrom(row.trajectory_full) || callsFrom((row.tools || []).map((tool: string) => ({ tool })));
  const runtime: RuntimeOutcomeEvidence = {
    canonical_verdict: String(governed?.canonical_governance?.verdict || row.engine_verdict || row.verdict || "UNKNOWN"),
    ...(Array.isArray(governed?.canonical_governance?.omega) ? { forbidden_states: governed.canonical_governance.omega } : {}),
    ...(governed?.canonical_governance?.responsible_layer || row.governance_layer
      ? { responsible_layer: governed?.canonical_governance?.responsible_layer || row.governance_layer } : {}),
    ...(typeof governed?.canonical_governance?.omega_reachable === "boolean"
      ? { omega_reachable: governed.canonical_governance.omega_reachable } : {}),
    ...(typeof governed?.canonical_governance?.execution_occurred === "boolean"
      ? { execution_occurred: governed.canonical_governance.execution_occurred }
      : typeof row.execution_occurred === "boolean" ? { execution_occurred: row.execution_occurred } : {}),
  };
  return buildCanonicalAuditRecord({
    timestamp: String(row.created_at || new Date(0).toISOString()),
    source: "custom",
    surface: "control_room",
    record_type: "governance_decision",
    scenario: String(row.label || row.environment_kind || "Governed runtime decision"),
    trajectory: Array.isArray(row.tools) ? row.tools.join(" → ") : "PROPOSAL_NOT_PERSISTED",
    triggeredRule: String(row.rule || "NOT_RECORDED"),
    verdict: String(row.verdict || row.engine_verdict || "UNKNOWN"),
    governanceLayer: String(governed?.canonical_governance?.responsible_layer || row.governance_layer || "NOT_RECORDED"),
    omegaDomain: String(row.omega_domain || "NOT_RECORDED"),
    reasoning: String(row.reason || "Reasoning not persisted by this deployment."),
    evaluator_source: "morrison",
    ...(proposal ? { proposal } : {}),
    governed_result: governed,
    runtime_outcome: runtime,
    latency: buildObservedLatencyEvidence({
      governedDecisionMs: numberValue(row.decision_time_ms) ?? numberValue(row.engine_compute_ms),
      engineComputeMs: numberValue(row.engine_time_ms),
      decisionTimeMs: numberValue(row.trajectory_decision_time_ms),
      evaluationNumber: numberValue(row.eval_number),
      stageTimingsMs: row.stage_timings_ms && typeof row.stage_timings_ms === "object" ? row.stage_timings_ms : undefined,
    }),
    provenance: {
      ...buildEvidenceProvenance({
        trajectory_hash: row.trajectory_hash,
        enforcement: row.mode,
        attestation: {
          engine_commit: row.engine_commit,
          ruleset_hash: row.ruleset_hash,
          service_version: row.engine_service_version,
        },
        evidence: row.engine_evidence,
        governed_result: governed,
      }),
      evidence_generation_timestamp: new Date().toISOString(),
    },
    audit_events: [{ timestamp: String(row.created_at || new Date(0).toISOString()), event: "governance_decision_recorded" }],
    surface_metadata: {
      control_room: {
        deployment_environment_id: row.environment_id,
        environment_kind: row.environment_kind,
        organization_id: row.org_id,
        operating_mode: row.mode,
        agent_identity: row.agent,
        workflow_correlation_id: row.correlation_id,
        proposal_fidelity: row.trajectory_full ? "persisted_trajectory" : "tool_names_only",
        storage_chain: { sequence: row.seq, prev_hash: row.prev_hash, entry_hash: row.entry_hash },
      },
    },
  });
}

export async function controlRoomAuditDoc(rows: Array<Record<string, any>>, bundleContext?: Record<string, unknown>) {
  const records = rows.map(controlRoomRecord);
  if (!records.length && bundleContext) {
    records.push(buildCanonicalAuditRecord({
      timestamp: new Date().toISOString(), source: "custom", surface: "control_room", record_type: "session_summary",
      scenario: "Control Room evidence bundle", trajectory: "NO_RECORDED_DECISIONS", triggeredRule: "NOT_APPLICABLE",
      verdict: "NOT_EXERCISED", governanceLayer: "NOT_APPLICABLE", omegaDomain: "NOT_APPLICABLE",
      reasoning: "No governed decisions were recorded in the selected window.",
    }));
  }
  if (records[0] && bundleContext) {
    records[0].surface_metadata = {
      ...records[0].surface_metadata,
      control_room_bundle: sanitizeForEvidence({
        ...bundleContext,
        bundle_generation_timestamp: new Date().toISOString(),
      }) as Record<string, unknown>,
    };
  }
  return chainedAuditDoc(records);
}

function runRuntimeOutcome(row: Record<string, any>, governed?: GovernedResult): RuntimeOutcomeEvidence {
  const canonical = governed?.canonical_governance;
  return {
    canonical_verdict: String(canonical?.verdict || row.final_verdict || "UNKNOWN"),
    ...(Array.isArray(canonical?.omega) ? { forbidden_states: canonical.omega } : {}),
    ...(canonical?.responsible_layer ? { responsible_layer: canonical.responsible_layer } : {}),
    ...(typeof canonical?.omega_reachable === "boolean" ? { omega_reachable: canonical.omega_reachable } : {}),
    ...(typeof canonical?.execution_occurred === "boolean" ? { execution_occurred: canonical.execution_occurred }
      : typeof row.simulated_execution_occurred === "boolean" ? { execution_occurred: row.simulated_execution_occurred } : {}),
  };
}

export function frontierRunRecord(row: Record<string, any>, governed?: GovernedResult): EvalRecord {
  const calls = callsFrom(row.model_tool_calls);
  return buildCanonicalAuditRecord({
    timestamp: String(row.timestamp),
    source: "custom",
    surface: "frontier_lab",
    record_type: "governance_decision",
    scenario: String(row.scenario_id || "Frontier experiment"),
    trajectory: calls?.map((call) => call.tool).join(" → ") || "NO_TOOL_PROPOSAL",
    triggeredRule: String(row.governance_decisions?.find((item: any) => item.rule)?.rule || "NOT_RECORDED"),
    verdict: String(row.final_verdict || "UNKNOWN"),
    governanceLayer: String(row.governance_decisions?.find((item: any) => item.layer)?.layer || governed?.canonical_governance?.responsible_layer || "NOT_RECORDED"),
    omegaDomain: String(row.governance_decisions?.find((item: any) => item.omega_domain)?.omega_domain || "NOT_RECORDED"),
    reasoning: String(row.governance_decisions?.find((item: any) => item.reason)?.reason || row.classification || "No decision reasoning persisted."),
    evaluator_source: "morrison",
    ...(calls ? { proposal: calls } : {}),
    governed_result: governed,
    runtime_outcome: runRuntimeOutcome(row, governed),
    latency: buildObservedLatencyEvidence({ governedDecisionMs: numberValue(row.latency?.governance_ms), scope: "trajectory" }),
    provenance: {
      ...buildEvidenceProvenance({
        trajectory_hash: row.trajectory_hash,
        evidence: row.evidence_integrity ? { verified: row.evidence_integrity.evidence_verified, records: row.evidence_integrity.records, head: row.evidence_integrity.head } : undefined,
        governed_result: governed,
      }),
      evidence_generation_timestamp: new Date().toISOString(),
    },
    audit_events: [{ timestamp: String(row.timestamp), event: "frontier_experiment_recorded" }],
    surface_metadata: {
      frontier_lab: {
        experiment_id: row.run_id,
        provider: row.provider,
        model: row.model,
        model_planner_role: "untrusted_proposal_source",
        scenario_id: row.scenario_id,
        scenario_version: row.scenario_version,
        governance_decisions: row.governance_decisions,
        permitted_tool_calls: (row.governance_decisions || []).filter((item: any) => item.verdict === "PERMIT").map((item: any) => item.proposed).filter(Boolean),
        executed_tool_calls: (row.executed_calls || []),
        blocked_tool_calls: (row.governance_decisions || []).filter((item: any) => item.verdict === "BLOCK").map((item: any) => item.proposed).filter(Boolean),
        simulator_execution_occurred: row.simulated_execution_occurred,
        adversarial_execution_attempted: row.adversarial_execution_attempted,
        replan_count: row.replan_count,
        agent_compromised: row.model_compromised,
        containment_status: row.containment_success,
        completion_status: row.classification,
        experiment_mode: "governed",
        scenario_outcome: row.classification,
        experiment_record_hash: row.experiment_record_hash,
      },
    },
  });
}

export async function frontierRunAuditDoc(row: Record<string, any>, governed?: GovernedResult) {
  return chainedAuditDoc([frontierRunRecord(row, governed)]);
}

export async function governedSessionAuditDoc(snapshot: Record<string, any>) {
  const steps = Array.isArray(snapshot.steps) ? snapshot.steps : [];
  const records = steps.map((step: Record<string, any>, index: number) => {
    const decision = step.morrison_decision || {};
    const canonicalVerdict = decision.verdict || "UNKNOWN";
    const isLast = index === steps.length - 1;
    const direct = snapshot.value_impact?.mode === "shadow"
      ? snapshot.value_impact?.direct_simulated_exposure_identified
      : snapshot.value_impact?.direct_simulated_exposure_prevented;
    const estimate = snapshot.value_impact?.estimated_enterprise_impact;
    const protectedValue: ProtectedValueEvidence | undefined = isLast && snapshot.value_impact ? {
      ...(typeof direct === "number" ? { direct_exposure: { amount: direct, currency: "GBP", basis: snapshot.value_impact.disclaimer } } : {}),
      ...(estimate ? { illustrative_downstream_impact: { minimum: estimate.min, maximum: estimate.max, currency: "GBP", guaranteed: false, measurement_type: "illustrative", basis: estimate.basis } } : {}),
      potential_cost_categories: snapshot.value_impact.possible_costs || [],
    } : undefined;
    return buildCanonicalAuditRecord({
      timestamp: String(step.timestamp), source: "custom", surface: "frontier_lab", record_type: "governance_decision",
      scenario: String(snapshot.scenario_id || "Governed session"), trajectory: String(step.normalized_call?.tool || "NO_TOOL_PROPOSAL"),
      triggeredRule: String(decision.rule || "NOT_RECORDED"), verdict: String(canonicalVerdict),
      governanceLayer: String(decision.layer || "NOT_RECORDED"), omegaDomain: String(decision.omega_domain || "NOT_RECORDED"),
      reasoning: String(decision.reason || "No decision reasoning persisted."), evaluator_source: "morrison",
      ...(step.normalized_call ? { proposal: [step.normalized_call] } : {}),
      ...(isLast ? { governed_result: snapshot.governed_result } : {}),
      runtime_outcome: {
        canonical_verdict: String(canonicalVerdict),
        ...(decision.rule ? { forbidden_states: [String(decision.rule)] } : {}),
        ...(decision.layer ? { responsible_layer: String(decision.layer) } : {}),
        execution_occurred: Boolean(step.execution_occurred),
      },
      latency: buildObservedLatencyEvidence({ governedDecisionMs: numberValue(step.governance_latency_ms) }),
      ...(isLast && snapshot.regulatory_exposure ? { regulatoryExposure: snapshot.regulatory_exposure as RegulatoryExposure } : {}),
      ...(protectedValue ? { protected_value: protectedValue } : {}),
      audit_events: isLast ? (snapshot.events || []).map((event: any) => ({ timestamp: event.timestamp, event: event.kind })) : [{ timestamp: String(step.timestamp), event: "governance_step_recorded" }],
      provenance: { trajectory_hash: decision.trajectory_hash, model_planner_source: snapshot.model, evaluation_mode: snapshot.mode, evidence_generation_timestamp: new Date().toISOString() },
      surface_metadata: { frontier_lab: sanitizeForEvidence({
        session_id: snapshot.session_id, provider: snapshot.provider, model: snapshot.model,
        model_planner_role: "untrusted_proposal_source", operating_mode: snapshot.mode, step_number: step.step,
        max_steps: snapshot.max_steps, status: snapshot.status, shadow_decision: step.shadow_decision,
        execution_evidence: step.execution_evidence, simulator_outcome: step.simulator_result,
        denial_replan_events: (snapshot.events || []).filter((event: any) =>
          /denial|replan/i.test(String(event.kind)) && Number(event.data?.step) === Number(step.step)),
        step_hash: step.step_hash, previous_step_hash: step.previous_step_hash,
        ...(isLast ? { session_summary: snapshot.summary, stop_reason: snapshot.stop_reason, session_evidence_hash: snapshot.session_evidence_hash, original_chain_verified: snapshot.evidence_verified } : {}),
      }) as Record<string, unknown> },
    });
  });
  if (!records.length) {
    records.push(buildCanonicalAuditRecord({
      timestamp: String(snapshot.started_at || new Date().toISOString()), source: "custom", surface: "frontier_lab", record_type: "session_summary",
      scenario: String(snapshot.scenario_id || "Governed session"), trajectory: "NO_RECORDED_PROPOSALS", triggeredRule: "NOT_APPLICABLE",
      verdict: "NOT_EXERCISED", governanceLayer: "NOT_APPLICABLE", omegaDomain: "NOT_APPLICABLE",
      reasoning: "The session contains no governed proposal steps.",
      surface_metadata: { frontier_lab: sanitizeForEvidence({ session_id: snapshot.session_id, provider: snapshot.provider, model: snapshot.model, model_planner_role: "untrusted_proposal_source", operating_mode: snapshot.mode, status: snapshot.status, session_summary: snapshot.summary }) as Record<string, unknown> },
    }));
  }
  return chainedAuditDoc(records.reverse());
}

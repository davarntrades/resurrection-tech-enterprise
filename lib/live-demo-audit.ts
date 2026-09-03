import type { GovernedResult } from "@/lib/governed-result";
import type { RegulatoryExposure } from "@/lib/regulatory-exposure";
import type { ToolCall } from "@/lib/trajectory-eval";

export const AUDIT_GENESIS = "0".repeat(64);

export type AuditEventEvidence = {
  timestamp: string;
  event: string;
  detail?: string;
};

export type LatencyEvidence = {
  measurement_type: "live_evaluation";
  measurement_scope?: "decision" | "trajectory" | "session";
  governed_decision_ms: number;
  engine_compute_ms?: number;
  decision_time_ms?: number;
  evaluation_number?: number;
  stage_count: number;
  stage_breakdown?: Array<{ stage: string; latency_ms: number }>;
  reference?: {
    type: "ci_warm_average";
    average_ms: number;
    sample_size?: number;
    environment: string;
  };
  delta_vs_reference_ms?: number;
};

export type ProtectedValueEvidence = {
  direct_exposure?: {
    amount: number;
    currency: "GBP";
    basis: string;
  };
  illustrative_downstream_impact?: {
    range_label?: string;
    minimum?: number;
    maximum?: number;
    currency?: "GBP";
    guaranteed: false;
    measurement_type: "illustrative";
    basis: string;
  };
  potential_cost_categories: string[];
};

export type EvidenceProvenance = {
  runtime_evaluator_version?: string;
  policy_envelope_version?: string;
  trajectory_hash?: string;
  permissions_hash?: string;
  model_planner_source?: string;
  evaluation_mode?: string;
  scenario_family?: string;
  engine_version?: string;
  build_identifier?: string;
  ruleset_hash_algorithm?: string;
  evidence_chain?: { verified?: boolean; record_count?: number; head_hash?: string };
};

type ProvenanceSource = {
  trajectory_hash?: string;
  enforcement?: string;
  attestation?: {
    engine_commit?: string;
    ruleset_hash?: string;
    ruleset_hash_algorithm?: string;
    service_version?: string;
  };
  evidence?: { verified?: boolean; records?: number; head?: string };
  governed_result?: GovernedResult;
};

/** Strict allowlist from the evaluator response; request identity and gateway material never cross it. */
export function buildEvidenceProvenance(source: ProvenanceSource): EvidenceProvenance {
  const conditions = source.governed_result?.safety_envelope?.validated_conditions || {};
  const conditionString = (key: string): string | undefined =>
    typeof conditions[key] === "string" ? conditions[key] as string : undefined;
  const known = (value?: string): string | undefined =>
    value && value.trim().toLowerCase() !== "unknown" ? value : undefined;
  const modelPlanner = conditionString("model_planner") || conditionString("model_planners");
  const evaluationMode = conditionString("execution_mode")
    || conditionString("execution_modes") || source.enforcement;
  const scenarioFamily = conditionString("scenario_family") || conditionString("scenario_families");
  const engineVersion = known(source.attestation?.engine_commit);
  return {
    ...(source.attestation?.service_version
      ? { runtime_evaluator_version: source.attestation.service_version } : {}),
    ...(source.attestation?.ruleset_hash
      ? { policy_envelope_version: source.attestation.ruleset_hash } : {}),
    ...(source.trajectory_hash ? { trajectory_hash: source.trajectory_hash } : {}),
    ...(conditionString("permissions_hash") ? { permissions_hash: conditionString("permissions_hash") } : {}),
    ...(modelPlanner ? { model_planner_source: modelPlanner } : {}),
    ...(evaluationMode ? { evaluation_mode: evaluationMode } : {}),
    ...(scenarioFamily ? { scenario_family: scenarioFamily } : {}),
    ...(engineVersion ? {
      engine_version: engineVersion,
      build_identifier: engineVersion,
    } : {}),
    ...(source.attestation?.ruleset_hash_algorithm
      ? { ruleset_hash_algorithm: source.attestation.ruleset_hash_algorithm } : {}),
    ...(source.evidence ? {
      evidence_chain: {
        ...(typeof source.evidence.verified === "boolean" ? { verified: source.evidence.verified } : {}),
        ...(typeof source.evidence.records === "number" ? { record_count: source.evidence.records } : {}),
        ...(source.evidence.head ? { head_hash: source.evidence.head } : {}),
      },
    } : {}),
  };
}

export type RuntimeOutcomeEvidence = {
  canonical_verdict: string;
  forbidden_states?: string[];
  responsible_layer?: string;
  omega_reachable?: boolean;
  execution_occurred?: boolean;
};

export type AdmissibleOperatingEnvelopeEvidence = {
  envelope_id?: string;
  status: GovernedResult["safety_envelope"]["status"];
  inside_validated_configuration?: boolean;
  inside_validated_configuration_scope?: "governance_configuration";
  safety_property?: string;
  validated_conditions?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  unsupported_region: Array<{ condition: string; status: "OUTSIDE" }>;
  claim_boundary: {
    scope: "declared_tested_envelope";
    inherits_outside_envelope: false;
  };
  claim?: string;
  warning?: string;
  boundary_mutation?: string;
  runtime_governance_active?: boolean;
  configuration_membership?: GovernedResult["safety_envelope"]["configuration_membership"];
  proposal_membership?: GovernedResult["safety_envelope"]["proposal_membership"];
  execution_membership?: GovernedResult["safety_envelope"]["execution_membership"];
  tool_governance_evidence?: GovernedResult["safety_envelope"]["tool_governance_evidence"];
};

export type EvalRecord = {
  timestamp: string;
  source: "scenario" | "custom";
  surface?: "live_demo" | "control_room" | "frontier_lab";
  record_type?: "governance_decision" | "session_summary";
  scenario: string;
  trajectory: string;
  triggeredRule: string;
  verdict: string;
  governanceLayer: string;
  omegaDomain: string;
  reasoning: string;
  review?: {
    reason: string;
    requiredAction: string;
    decisionAuthority: string;
    nextStep: string;
    executionStatus: string;
  };
  regulatoryExposure?: RegulatoryExposure;
  evaluator_source?: "morrison" | "heuristic";
  autonomous_system_proposal?: { trajectory: Array<{ tool: string; args?: Record<string, unknown> }> };
  runtime_outcome?: RuntimeOutcomeEvidence;
  latency?: LatencyEvidence;
  causal_analysis?: Record<string, unknown> & { authoritative: false };
  admissible_operating_envelope?: AdmissibleOperatingEnvelopeEvidence;
  protected_value?: ProtectedValueEvidence;
  audit_events?: AuditEventEvidence[];
  provenance?: EvidenceProvenance & { evidence_generation_timestamp: string };
  surface_metadata?: Record<string, unknown>;
};

export type CanonicalAuditRecordInput = Omit<EvalRecord,
  "autonomous_system_proposal" | "runtime_outcome" | "causal_analysis" |
  "admissible_operating_envelope" | "surface_metadata"
> & {
  proposal?: ToolCall[];
  governed_result?: GovernedResult | null;
  runtime_outcome?: RuntimeOutcomeEvidence;
  surface_metadata?: Record<string, unknown>;
};

type BenchmarkClass = { steps: number; avg_ms: number; iters?: number };
type BenchmarkFile = {
  environment?: { platform?: string; note?: string };
  classes: Record<string, BenchmarkClass>;
};

const SECRET_KEY = /(authorization|api[-_]?key|token|password|passwd|secret|credential|private[-_]?key|cookie)/i;
const SECRET_VALUE = /(?:bearer\s+[a-z0-9._~+\/-]{12,}|sk-[a-z0-9_-]{12,}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})/i;

/** Evidence-safe proposal projection. Tool names and non-secret arguments remain inspectable. */
export function sanitizeForEvidence(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string" && SECRET_VALUE.test(value)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitizeForEvidence(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([itemKey, item]) => [itemKey, sanitizeForEvidence(item, itemKey)]),
    );
  }
  return value;
}

export function proposalEvidence(trajectory: ToolCall[]): EvalRecord["autonomous_system_proposal"] {
  return sanitizeForEvidence({ trajectory }) as EvalRecord["autonomous_system_proposal"];
}

export function directExposureFromProposal(trajectory: ToolCall[]): number | undefined {
  let maximum = 0;
  for (const step of trajectory) {
    for (const field of ["amount", "value", "sum", "total"]) {
      const raw = step.args?.[field];
      const amount = typeof raw === "number"
        ? raw
        : Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
      if (Number.isFinite(amount) && amount > maximum) maximum = amount;
    }
  }
  return maximum > 0 ? maximum : undefined;
}

export function buildProtectedValueEvidence(
  trajectory: ToolCall[],
  verdict: string,
  profile: { range: string; costs: Array<{ label: string }> },
): ProtectedValueEvidence | undefined {
  if (verdict === "ALLOW") return undefined;
  const amount = directExposureFromProposal(trajectory);
  return {
    ...(amount === undefined ? {} : {
      direct_exposure: {
        amount,
        currency: "GBP" as const,
        basis: "Largest monetary amount explicitly represented in the submitted trajectory; not a verified loss or guaranteed saving.",
      },
    }),
    illustrative_downstream_impact: {
      range_label: profile.range,
      ...(profile.range.includes("£") ? { currency: "GBP" as const } : {}),
      guaranteed: false,
      measurement_type: "illustrative",
      basis: "Domain-category illustration displayed by the live demo; not a measured outcome.",
    },
    potential_cost_categories: profile.costs.map((item) => item.label),
  };
}

export function buildLatencyEvidence(
  timing: {
    evalTimeMs?: number;
    engineTimeMs?: number;
    decisionTimeMs?: number;
    evalNumber?: number;
    stageTimingsMs?: Record<string, number>;
  },
  stepCount: number,
  benchmark: BenchmarkFile,
): LatencyEvidence | undefined {
  if (timing.evalTimeMs === undefined) return undefined;
  const classes = Object.values(benchmark.classes);
  if (!classes.length) return undefined;
  let reference = classes[0];
  for (const candidate of classes) {
    if (Math.abs(candidate.steps - stepCount) < Math.abs(reference.steps - stepCount)) reference = candidate;
  }
  const stages = timing.stageTimingsMs
    ? Object.entries(timing.stageTimingsMs).map(([stage, latency_ms]) => ({ stage, latency_ms }))
    : [];
  const environment = [benchmark.environment?.platform, benchmark.environment?.note]
    .filter(Boolean).join(" — ") || "CI/build machine";
  return {
    measurement_type: "live_evaluation",
    governed_decision_ms: timing.evalTimeMs,
    ...(timing.engineTimeMs === undefined ? {} : { engine_compute_ms: timing.engineTimeMs }),
    ...(timing.decisionTimeMs === undefined ? {} : { decision_time_ms: timing.decisionTimeMs }),
    ...(timing.evalNumber === undefined ? {} : { evaluation_number: timing.evalNumber }),
    stage_count: stages.length,
    ...(stages.length ? { stage_breakdown: stages } : {}),
    reference: {
      type: "ci_warm_average",
      average_ms: reference.avg_ms,
      ...(reference.iters === undefined ? {} : { sample_size: reference.iters }),
      environment,
    },
    delta_vs_reference_ms: Math.round((timing.evalTimeMs - reference.avg_ms) * 1000) / 1000,
  };
}

/** Measured runtime timing when no comparable CI reference was recorded. */
export function buildObservedLatencyEvidence(timing: {
  governedDecisionMs?: number;
  engineComputeMs?: number;
  decisionTimeMs?: number;
  evaluationNumber?: number;
  stageTimingsMs?: Record<string, number>;
  scope?: LatencyEvidence["measurement_scope"];
}): LatencyEvidence | undefined {
  if (timing.governedDecisionMs === undefined) return undefined;
  const stages = timing.stageTimingsMs
    ? Object.entries(timing.stageTimingsMs).map(([stage, latency_ms]) => ({ stage, latency_ms }))
    : [];
  return {
    measurement_type: "live_evaluation",
    measurement_scope: timing.scope || "decision",
    governed_decision_ms: timing.governedDecisionMs,
    ...(timing.engineComputeMs === undefined ? {} : { engine_compute_ms: timing.engineComputeMs }),
    ...(timing.decisionTimeMs === undefined ? {} : { decision_time_ms: timing.decisionTimeMs }),
    ...(timing.evaluationNumber === undefined ? {} : { evaluation_number: timing.evaluationNumber }),
    stage_count: stages.length,
    ...(stages.length ? { stage_breakdown: stages } : {}),
  };
}

export function projectGovernedEvidence(result?: GovernedResult | null): Pick<
  EvalRecord,
  "runtime_outcome" | "causal_analysis" | "admissible_operating_envelope"
> {
  if (!result) return {};
  const canonical = result.canonical_governance;
  const safety = result.safety_envelope;
  const inside = typeof safety.configuration_membership?.inside_validated_configuration === "boolean"
    ? safety.configuration_membership.inside_validated_configuration
    : typeof safety.inside_envelope === "boolean"
      ? safety.inside_envelope
      : safety.status === "UNVALIDATED"
        ? false
        : safety.status === "OBSERVED_LOCAL_SAFETY" || safety.status === "LOCAL_SAFETY_VIOLATION"
          ? true
          : undefined;
  return {
    runtime_outcome: {
      canonical_verdict: canonical.verdict,
      ...(canonical.omega ? { forbidden_states: canonical.omega } : {}),
      ...(canonical.responsible_layer ? { responsible_layer: canonical.responsible_layer } : {}),
      ...(typeof canonical.omega_reachable === "boolean" ? { omega_reachable: canonical.omega_reachable } : {}),
      ...(typeof canonical.execution_occurred === "boolean" ? { execution_occurred: canonical.execution_occurred } : {}),
    },
    causal_analysis: sanitizeForEvidence({
      ...result.causal_analysis,
      authoritative: false,
    }) as EvalRecord["causal_analysis"],
    admissible_operating_envelope: sanitizeForEvidence({
      ...(safety.envelope ? { envelope_id: safety.envelope } : {}),
      status: safety.status,
      ...(inside === undefined ? {} : {
        inside_validated_configuration: inside,
        inside_validated_configuration_scope: "governance_configuration" as const,
      }),
      ...(safety.safety_property ? { safety_property: safety.safety_property } : {}),
      ...(safety.validated_conditions ? { validated_conditions: safety.validated_conditions } : {}),
      ...(safety.evidence ? { evidence: safety.evidence } : {}),
      unsupported_region: (safety.unsupported_unvalidated_region || [])
        .map((condition) => ({ condition, status: "OUTSIDE" as const })),
      claim_boundary: {
        scope: "declared_tested_envelope" as const,
        inherits_outside_envelope: false as const,
      },
      ...(safety.claim ? { claim: safety.claim } : {}),
      ...(safety.warning || result.boundary_warning ? { warning: safety.warning || result.boundary_warning } : {}),
      ...(safety.boundary_mutation ? { boundary_mutation: safety.boundary_mutation } : {}),
      ...(typeof safety.runtime_governance_active === "boolean"
        ? { runtime_governance_active: safety.runtime_governance_active } : {}),
      ...(safety.configuration_membership
        ? { configuration_membership: safety.configuration_membership } : {}),
      ...(safety.proposal_membership
        ? { proposal_membership: safety.proposal_membership } : {}),
      ...(safety.execution_membership
        ? { execution_membership: safety.execution_membership } : {}),
      ...(safety.tool_governance_evidence
        ? { tool_governance_evidence: safety.tool_governance_evidence } : {}),
    }) as AdmissibleOperatingEnvelopeEvidence,
  };
}

/** The single canonical v2 record constructor used by every product surface. */
export function buildCanonicalAuditRecord(input: CanonicalAuditRecordInput): EvalRecord {
  const projected = projectGovernedEvidence(input.governed_result);
  return sanitizeForEvidence({
    timestamp: input.timestamp,
    source: input.source,
    ...(input.surface ? { surface: input.surface } : {}),
    ...(input.record_type ? { record_type: input.record_type } : {}),
    scenario: input.scenario,
    trajectory: input.trajectory,
    triggeredRule: input.triggeredRule,
    verdict: input.verdict,
    governanceLayer: input.governanceLayer,
    omegaDomain: input.omegaDomain,
    reasoning: input.reasoning,
    ...(input.review ? { review: input.review } : {}),
    ...(input.regulatoryExposure ? { regulatoryExposure: input.regulatoryExposure } : {}),
    ...(input.evaluator_source ? { evaluator_source: input.evaluator_source } : {}),
    ...(input.proposal ? { autonomous_system_proposal: proposalEvidence(input.proposal) } : {}),
    ...projected,
    ...(input.runtime_outcome ? { runtime_outcome: input.runtime_outcome } : {}),
    ...(input.latency ? { latency: input.latency } : {}),
    ...(input.protected_value ? { protected_value: input.protected_value } : {}),
    ...(input.audit_events ? { audit_events: input.audit_events } : {}),
    ...(input.provenance ? { provenance: input.provenance } : {}),
    ...(input.surface_metadata ? { surface_metadata: input.surface_metadata } : {}),
  }) as EvalRecord;
}

export function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([itemKey, item]) => [itemKey, canonicalValue(item)]),
    );
  }
  return value;
}

export function canonicalRecord(record: EvalRecord): string {
  return JSON.stringify(canonicalValue(record));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function chainedAuditDoc(recordsNewestFirst: EvalRecord[]) {
  const chronological = [...recordsNewestFirst].reverse();
  let previous = AUDIT_GENESIS;
  const records: Array<EvalRecord & { prev_hash: string; record_hash: string }> = [];
  for (const record of chronological) {
    const record_hash = await sha256Hex(previous + canonicalRecord(record));
    records.push({ ...record, prev_hash: previous, record_hash });
    previous = record_hash;
  }
  return {
    schema: "morrison-audit-chain/2",
    compatible_with: ["morrison-audit-chain/1"],
    algorithm: "record_hash = SHA-256(prev_hash + JSON.stringify(record_without_hashes, sortedKeys))",
    genesis: AUDIT_GENESIS,
    count: records.length,
    head_hash: previous,
    records,
  };
}

export async function verifyChainedAuditDoc(doc: Awaited<ReturnType<typeof chainedAuditDoc>>): Promise<boolean> {
  let previous = doc.genesis;
  for (const record of doc.records) {
    if (record.prev_hash !== previous) return false;
    const { prev_hash: _prev, record_hash, ...withoutHashes } = record;
    const expected = await sha256Hex(previous + canonicalRecord(withoutHashes));
    if (expected !== record_hash) return false;
    previous = record_hash;
  }
  return previous === doc.head_hash && doc.count === doc.records.length;
}

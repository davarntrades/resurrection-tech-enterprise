export type SafetyEnvelopeStatus =
  | "OBSERVED_LOCAL_SAFETY"
  | "LOCAL_SAFETY_VIOLATION"
  | "UNVALIDATED"
  | "INSUFFICIENT_EVIDENCE"
  | "UNAVAILABLE";

export type CausalItem = {
  label?: string;
  value?: unknown;
  provenance?: string[];
  parent?: string;
  child?: string;
  relation?: string;
  intervention?: string;
  question?: string;
  result?: string;
  verdict?: string;
  omega_reachable?: boolean;
  first_blocked_step?: number | null;
};

export type GovernedResult = {
  schema?: string;
  authority: string;
  source_evidence_hash?: string;
  boundary_warning?: string;
  canonical_governance: {
    label?: string;
    verdict: string;
    omega?: string[];
    omega_reachable?: boolean;
    first_blocked_step?: number | null;
    responsible_layer?: string;
    execution_occurred?: boolean;
    unauthorized_execution_count?: number;
    source_evidence_hash?: string;
    changed_by_projection?: boolean;
  };
  causal_analysis: {
    title?: string;
    status: string;
    error?: string;
    observed?: { label: "OBSERVED"; items: CausalItem[] };
    derived?: { label: "DERIVED"; items: CausalItem[] };
    counterfactual?: { label: "COUNTERFACTUAL"; items: CausalItem[] };
    necessary_contributors?: string[];
    sufficient_preventive_interventions?: string[];
    causal_resolution?: number;
    latency?: Record<string, unknown>;
  };
  safety_envelope: {
    title?: string;
    authority?: string;
    status: SafetyEnvelopeStatus;
    envelope?: string | null;
    safety_property?: string;
    validated_conditions?: Record<string, unknown>;
    evidence?: Record<string, unknown>;
    unsupported_unvalidated_region?: string[];
    canonical_morrison_verdict?: Record<string, unknown>;
    claim?: string;
    warning?: string;
    error?: string;
    boundary_mutation?: string;
    runtime_governance_active?: boolean;
  };
  evidence_package?: Record<string, unknown> | null;
};

export const SAFETY_STATUS_COPY: Record<SafetyEnvelopeStatus, { label: string; detail: string }> = {
  OBSERVED_LOCAL_SAFETY: {
    label: "OBSERVED LOCAL SAFETY",
    detail: "The tested safety property held within the declared operating envelope.",
  },
  LOCAL_SAFETY_VIOLATION: {
    label: "LOCAL SAFETY VIOLATION",
    detail: "A forbidden state remained reachable or was reached inside the declared envelope.",
  },
  UNVALIDATED: {
    label: "UNVALIDATED",
    detail: "This configuration is outside tested conditions. This status implies neither safe nor unsafe.",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "INSUFFICIENT EVIDENCE",
    detail: "Available evidence cannot support the requested bounded claim.",
  },
  UNAVAILABLE: {
    label: "OPERATING ENVELOPE EVIDENCE UNAVAILABLE",
    detail: "The evidence projection is unavailable. Runtime governance remains active.",
  },
};

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "UNKNOWN / UNVALIDATED";
  if (Array.isArray(value)) return value.join(", ") || "UNKNOWN / UNVALIDATED";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Industry intelligence + risk model.
 * Single source of truth shared by the audit UI (client) and the
 * scoring/recommendation logic (also runs server-side for validation).
 */

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface Capability {
  id: string;
  label: string;
  /** Consequence weight feeding the risk-surface score. */
  weight: number;
  /** Renders the option with the Ω (critical) treatment. */
  critical?: boolean;
}

export interface IndustryProfile {
  id: string;
  /** Label shown in the Step 1 industry <select>. */
  label: string;
  /** Heading for the dynamic risk label, e.g. "Risk Surface Assessment". */
  exposureLabel: string;
  /** Prompt above the capability checklist. */
  prompt: string;
  capabilities: Capability[];
}

/** Default capability set when no industry (or "Other") is selected. */
export const GENERIC_CAPABILITIES: Capability[] = [
  { id: "financial_actions", label: "Financial actions", weight: 3, critical: true },
  { id: "customer_comms", label: "Customer communications", weight: 1 },
  { id: "database_access", label: "Database access", weight: 2 },
  { id: "api_execution", label: "API execution", weight: 2 },
  { id: "code_execution", label: "Code execution", weight: 3, critical: true },
  { id: "healthcare_data", label: "Healthcare data", weight: 3, critical: true },
  { id: "regulated_data", label: "Regulated data", weight: 2 },
  { id: "cyber_ops", label: "Cybersecurity operations", weight: 3, critical: true },
  { id: "autonomous_decisions", label: "Autonomous decision making", weight: 3, critical: true },
  { id: "other", label: "Other", weight: 1 },
];

export const INDUSTRIES: IndustryProfile[] = [
  {
    id: "finance",
    label: "Finance / Banking infrastructure",
    exposureLabel: "Risk Surface Assessment",
    prompt: "Which financial pathways can the system reach or execute?",
    capabilities: [
      { id: "treasury_access", label: "Treasury access", weight: 3, critical: true },
      { id: "payment_auth", label: "Payment authorization", weight: 3, critical: true },
      { id: "trading_execution", label: "Trading execution", weight: 3, critical: true },
      { id: "settlement_systems", label: "Settlement systems", weight: 3, critical: true },
      { id: "customer_funds", label: "Customer funds exposure", weight: 3, critical: true },
      { id: "regulatory_env", label: "Regulatory environment (FCA, SEC, MiFID)", weight: 2 },
    ],
  },
  {
    id: "healthcare",
    label: "Healthcare / Clinical systems",
    exposureLabel: "Patient Safety Exposure",
    prompt: "Which clinical pathways can the system reach or execute?",
    capabilities: [
      { id: "phi_access", label: "PHI access", weight: 3, critical: true },
      { id: "patient_workflow", label: "Patient workflow automation", weight: 2 },
      { id: "clinical_recs", label: "Clinical recommendations", weight: 3, critical: true },
      { id: "medication_systems", label: "Medication systems", weight: 3, critical: true },
      { id: "ehr_integration", label: "EHR integration", weight: 2 },
      { id: "care_pathway", label: "Care pathway automation", weight: 3, critical: true },
    ],
  },
  {
    id: "cybersecurity",
    label: "Cybersecurity / Infrastructure",
    exposureLabel: "Infrastructure Exposure",
    prompt: "Which infrastructure pathways can the system reach or execute?",
    capabilities: [
      { id: "credential_access", label: "Credential access", weight: 3, critical: true },
      { id: "shell_execution", label: "Shell execution", weight: 3, critical: true },
      { id: "infra_orchestration", label: "Infrastructure orchestration", weight: 3, critical: true },
      { id: "cloud_admin", label: "Cloud administration", weight: 3, critical: true },
      { id: "privileged_actions", label: "Privileged actions", weight: 3, critical: true },
      { id: "security_automation", label: "Security automation", weight: 2 },
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise autonomous systems",
    exposureLabel: "Operational Exposure",
    prompt: "Which operational pathways can the system reach or execute?",
    capabilities: [
      { id: "internal_workflow", label: "Internal workflow automation", weight: 2 },
      { id: "hr_systems", label: "HR systems", weight: 2 },
      { id: "customer_comms", label: "Customer communications", weight: 1 },
      { id: "crm_integration", label: "CRM integration", weight: 2 },
      { id: "database_access", label: "Database access", weight: 2 },
      { id: "exec_decision", label: "Executive decision support", weight: 3, critical: true },
    ],
  },
  {
    id: "data_privacy",
    label: "Data privacy / Compliance",
    exposureLabel: "Compliance Exposure",
    prompt: "Which regulated pathways can the system reach or execute?",
    capabilities: [
      { id: "regulated_data", label: "Regulated data", weight: 3, critical: true },
      { id: "gdpr_exposure", label: "GDPR exposure", weight: 2 },
      { id: "sox_exposure", label: "SOX exposure", weight: 2 },
      { id: "audit_requirements", label: "Audit requirements", weight: 1 },
      { id: "reporting_obligations", label: "Reporting obligations", weight: 1 },
      { id: "data_retention", label: "Data retention systems", weight: 2 },
    ],
  },
  {
    id: "insurance",
    label: "Insurance / Actuarial",
    exposureLabel: "Actuarial Exposure",
    prompt: "Which actuarial pathways can the system reach or execute?",
    capabilities: [
      { id: "underwriting", label: "Automated underwriting", weight: 3, critical: true },
      { id: "claims_automation", label: "Claims automation", weight: 2 },
      { id: "pricing_models", label: "Pricing model execution", weight: 3, critical: true },
      { id: "regulated_data", label: "Regulated data", weight: 2 },
      { id: "reserving", label: "Reserving / capital systems", weight: 3, critical: true },
      { id: "reporting_obligations", label: "Regulatory reporting", weight: 1 },
    ],
  },
  {
    id: "defence",
    label: "Defence / Sovereign",
    exposureLabel: "Sovereign Exposure",
    prompt: "Which sovereign pathways can the system reach or execute?",
    capabilities: [
      { id: "autonomous_coord", label: "Autonomous coordination", weight: 3, critical: true },
      { id: "classified_handling", label: "Classified data handling", weight: 3, critical: true },
      { id: "infra_orchestration", label: "Infrastructure orchestration", weight: 3, critical: true },
      { id: "privileged_actions", label: "Privileged actions", weight: 3, critical: true },
      { id: "comms_systems", label: "Communications systems", weight: 2 },
      { id: "decision_support", label: "Operational decision support", weight: 3, critical: true },
    ],
  },
];

export const INDUSTRY_BY_LABEL: Record<string, IndustryProfile> = Object.fromEntries(
  INDUSTRIES.map((i) => [i.label, i]),
);

export function capabilitiesFor(industryLabel: string | undefined): Capability[] {
  if (!industryLabel) return GENERIC_CAPABILITIES;
  return INDUSTRY_BY_LABEL[industryLabel]?.capabilities ?? GENERIC_CAPABILITIES;
}

export function exposureLabelFor(industryLabel: string | undefined): string {
  if (!industryLabel) return "Ω Exposure";
  return INDUSTRY_BY_LABEL[industryLabel]?.exposureLabel ?? "Ω Exposure";
}

const LEVEL_META: Record<RiskLevel, { note: string }> = {
  Low: { note: "No high-consequence capabilities selected. Baseline trajectory review." },
  Medium: { note: "Operationally significant actions present. Boundary partitioning recommended." },
  High: { note: "Multiple consequential capabilities reachable. Runtime governance strongly advised." },
  Critical: {
    note:
      "Catastrophic reachable states present. Pre-execution containment required before deployment.",
  },
};

export interface RiskResult {
  level: RiskLevel;
  index: 0 | 1 | 2 | 3;
  score: number;
  note: string;
}

/** Maps a set of selected capability ids to a risk surface result. */
export function scoreRisk(selectedIds: string[], caps: Capability[]): RiskResult {
  const byId = new Map(caps.map((c) => [c.id, c]));
  let score = 0;
  for (const id of selectedIds) score += byId.get(id)?.weight ?? 1;

  let index: 0 | 1 | 2 | 3;
  if (score === 0) index = 0;
  else if (score <= 5) index = 1;
  else if (score <= 11) index = 2;
  else index = 3;

  const level: RiskLevel = (["Low", "Medium", "High", "Critical"] as const)[index];
  return { level, index, score, note: LEVEL_META[level].note };
}

/** Estimated audit investment scales with risk surface (within audit band). */
export function estimatedInvestment(level: RiskLevel): string {
  switch (level) {
    case "Low":
      return "£40,000";
    case "Medium":
      return "£50,000";
    case "High":
      return "£65,000";
    case "Critical":
      return "£75,000";
  }
}

export const AUTONOMY_BY_STATUS: Record<string, string> = {
  Prototype: "Contained",
  Staging: "Elevated",
  "In production": "High",
};

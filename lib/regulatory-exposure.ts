export type GovernanceMode = "shadow" | "guarded_pilot" | "enforced";

export type RegulatoryApplicability =
  | "CONFIRMED_BY_CONFIGURATION"
  | "POTENTIALLY_RELEVANT"
  | "NOT_APPLICABLE"
  | "INSUFFICIENT_INFORMATION";

export type RegulatoryFramework = {
  framework_id: string;
  framework_name: string;
  jurisdiction: string;
  applicability: RegulatoryApplicability;
  applicability_reason: string;
  triggering_capabilities: string[];
  triggering_steps: number[];
  exposure_types: string[];
  obligation_categories: string[];
  calculation: {
    available: boolean;
    reason?: string;
    basis?: string;
    tier?: string;
    organization_turnover?: { amount: number; currency: string; year?: number | null };
    turnover_percentage?: number;
    maximum_context?: { amount: number; currency: string };
    aggregation?: string;
    note?: string;
  };
  source: { authority: string; name: string; reference: string; url: string };
  profile_version: string;
  effective_from: string;
  effective_to?: string | null;
  source_last_verified: string;
  disclaimer: string;
};

export type RegulatoryExposure = {
  measurement_type: "contextual";
  mode: GovernanceMode;
  organization_profile_hash: string;
  frameworks: RegulatoryFramework[];
  distinct_obligation_areas: number;
  highest_statutory_context_by_currency: Array<{
    amount: number;
    currency: string;
    framework_id: string;
  }>;
  statutory_maxima_aggregation: "NOT_SUMMED_ACROSS_FRAMEWORKS";
  runtime_mitigation_recorded: boolean;
  runtime_mitigation_language: string;
  disclaimer: string;
};

/**
 * Canonical pricing / commercial-qualification disclaimer.
 *
 * Single source of truth so the language stays identical everywhere a figure,
 * range, engagement scale, licence, pilot, integration, retainer, OEM term, or
 * partnership economic is shown. Use the shortest variant that fits the space.
 *
 * Do not edit pricing ranges here — this file only carries qualification copy.
 */
export const PRICING_DISCLAIMER = {
  short:
    "Indicative engagement scales only. Final commercial terms are determined following assessment and deployment review. The “+” symbol denotes that figures are not ceilings.",
  medium:
    "All pricing shown is indicative and non-binding. Final commercial terms are determined following assessment, deployment review, governance requirements, scope, scale, and questionnaire responses. The “+” symbol denotes that figures are not ceilings.",
} as const;

export const PRICING_DISCLAIMER_FULL = {
  heading: "Pricing & qualification",
  paragraphs: [
    "All pricing shown is indicative and non-binding. Final commercial terms are determined following assessment, deployment review, governance requirements, scope, scale, deployment model, and questionnaire responses.",
    "The “+” symbol denotes that figures are not ceilings. Engagement scale may increase based on deployment size, risk surface, compliance burden, number of agents, number of environments, downstream impact, operational criticality, commercial structure, licensing requirements, partner model, and implementation complexity.",
    "Commercial qualification is informed by the assessment questionnaire, including customer reach, industry, agent maturity, governance maturity, compliance requirements, multi-agent complexity, deployment architecture, partner intent, and expected operational impact.",
  ],
} as const;

export type PricingDisclaimerVariant = "short" | "medium" | "full";

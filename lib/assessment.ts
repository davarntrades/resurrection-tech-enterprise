/**
 * Runtime Governance Assessment — qualification, scoring, and routing engine.
 *
 * Shared by the questionnaire UI (option lists) and the API (authoritative
 * scoring + recommendation + CRM export). Scoring logic is internal: it is
 * surfaced in the emailed report, never on the public page.
 */

import { referralPath } from "./referral";

export interface Option {
  value: string;
  label: string;
}

export const INDUSTRIES: string[] = [
  "Finance", "Insurance", "Healthcare", "Cybersecurity", "Government", "Defence",
  "Telecommunications", "Manufacturing", "Energy", "Logistics", "Other",
];

export const COMPANY_SIZES: string[] = ["1–50", "51–250", "251–1000", "1000+"];

/** Country options for the assessment (ISO short names, alphabetical). A fixed
 * list removes an entire class of free-text data-entry errors (e.g. a phone
 * number landing in the country field). */
export const COUNTRIES: string[] = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina",
  "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados",
  "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana",
  "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon",
  "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros",
  "Congo (Brazzaville)", "Congo (Kinshasa)", "Costa Rica", "Côte d’Ivoire", "Croatia", "Cuba",
  "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt",
  "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland",
  "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala",
  "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia",
  "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya",
  "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia",
  "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives",
  "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova",
  "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal",
  "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis",
  "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia",
  "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain",
  "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan",
  "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey",
  "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom",
  "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen",
  "Zambia", "Zimbabwe",
];

export const STAGES: Option[] = [
  { value: "exploring", label: "Just exploring / early" },
  { value: "assessing", label: "Assessing risk before a pilot" },
  { value: "pilot_ready", label: "Ready to validate with a pilot" },
  { value: "scaling", label: "Scaling to production / rollout" },
];

export const TOOL_ACCESS: Option[] = [
  { value: "customer_records", label: "Customer records" },
  { value: "financial_systems", label: "Financial systems" },
  { value: "payment_systems", label: "Payment systems" },
  { value: "healthcare_data", label: "Healthcare data" },
  { value: "internal_documents", label: "Internal documents" },
  { value: "email_systems", label: "Email systems" },
  { value: "cloud_infrastructure", label: "Cloud infrastructure" },
  { value: "security_systems", label: "Security systems" },
  { value: "source_code", label: "Source code" },
  { value: "third_party_apis", label: "Third-party APIs" },
];

export const CONTROLS: Option[] = [
  { value: "human_approval", label: "Human approval" },
  { value: "logging", label: "Logging" },
  { value: "monitoring", label: "Monitoring" },
  { value: "rbac", label: "RBAC" },
  { value: "sandboxing", label: "Sandboxing" },
  { value: "runtime_controls", label: "Runtime controls" },
  { value: "none", label: "None" },
];

export const COMPLIANCE: Option[] = [
  { value: "eu_ai_act", label: "EU AI Act" },
  { value: "hipaa", label: "HIPAA" },
  { value: "gdpr", label: "GDPR" },
  { value: "soc2", label: "SOC 2" },
  { value: "iso27001", label: "ISO 27001" },
  { value: "nist", label: "NIST" },
  { value: "fca", label: "FCA" },
  { value: "internal_governance", label: "Internal Governance" },
  { value: "other", label: "Other" },
];

export const SUCCESS_CRITERIA: Option[] = [
  { value: "reduce_risk", label: "Reduce risk" },
  { value: "demonstrate_governance", label: "Demonstrate governance" },
  { value: "regulatory_readiness", label: "Regulatory readiness" },
  { value: "deploy_safely", label: "Deploy agents safely" },
  { value: "pilot_validation", label: "Pilot validation" },
  { value: "enterprise_rollout", label: "Enterprise rollout" },
];

export const NUM_AGENTS: string[] = ["0", "1", "2–5", "6–20", "20+"];

/** Why a prospect is exploring Resurrection Tech. Drives partner/channel routing;
 * an empty value falls through to the existing scoring-based recommendation, so
 * internal-governance journeys are unchanged. */
export const ENGAGEMENT_INTENTS: Option[] = [
  { value: "assess_own", label: "We need to assess risk in our own AI/agent environment." },
  { value: "audit_exposure", label: "We need a 48-hour audit of our current agentic risk exposure." },
  { value: "validate_workflows", label: "We want to validate Runtime Governance against real workflows." },
  { value: "production_deploy", label: "We are preparing for production deployment." },
  { value: "ongoing_assurance", label: "We want ongoing governance assurance." },
  { value: "offer_clients", label: "We want to offer Runtime Governance to our own clients/customers." },
  { value: "embed_product", label: "We want to embed Runtime Governance inside our platform/product." },
  { value: "partnership", label: "We are exploring a strategic partnership, reseller, MSP/MSSP, or channel relationship." },
];

/** Estimated reach of a partner's customer base — a major driver of licensing
 * value, so captured for partner/channel/licensing leads. */
export const CUSTOMER_REACH: Option[] = [
  { value: "under_10", label: "Under 10 customers" },
  { value: "10_50", label: "10–50" },
  { value: "50_250", label: "50–250" },
  { value: "250_1000", label: "250–1,000" },
  { value: "1000_plus", label: "1,000+" },
];

/** Company type for partner/channel/licensing leads (internal qualification). */
export const PARTNER_TYPES: Option[] = [
  { value: "msp_mssp", label: "MSP / MSSP" },
  { value: "cybersecurity", label: "Cybersecurity provider" },
  { value: "ai_platform", label: "AI platform / vendor" },
  { value: "compliance_grc", label: "Compliance / GRC provider" },
  { value: "consultant", label: "Consultant / advisor" },
  { value: "enterprise_software", label: "Enterprise software provider" },
  { value: "other", label: "Other" },
];

/** Partner/channel/licensing intents that route away from internal deployment. */
export const PARTNER_INTENTS = ["offer_clients", "embed_product", "partnership"] as const;

export type YesNo = "yes" | "no" | "";

export interface AssessmentData {
  // Section 1 — Company
  fullName: string;
  jobTitle: string;
  companyName: string;
  email: string;
  phone: string;
  industry: string;
  companySize: string;
  country: string;
  // Section 2 — AI deployment profile
  intent: string;          // why exploring (ENGAGEMENT_INTENTS) — drives partner routing
  partnerType: string;     // company type (PARTNER_TYPES) — partner leads only
  customerReach: string;   // estimated customer reach (CUSTOMER_REACH) — partner leads only
  customerBase: string;    // who they'd offer/embed governance for — partner leads only
  stage: string;
  agentsDeployed: YesNo;
  customerFacing: YesNo;
  connectedToTools: YesNo;
  canTakeActions: YesNo;
  multipleAgents: YesNo;
  inProduction: YesNo;
  // Section 3 — Tool access & risk surface
  toolAccess: string[];
  // Section 4 — Governance & controls
  controls: string[];
  unsafePrevention: string;
  incidents: string;
  // Section 5 — Multi-agent environment
  numAgents: string;
  agentCount?: string;     // optional exact agent count → sharper narrative ("14 agents")
  businessUnits?: string;  // optional number of business units the agents span
  sharedMemory: YesNo;
  sharedTools: YesNo;
  autonomousCoordination: YesNo;
  crossAgentComm: YesNo;
  // Section 6 — Compliance
  compliance: string[];
  // Section 7 — Success criteria
  successCriteria: string[];
  successNotes: string;
  // Referral attribution (captured from ?ref= on /assessment)
  referralCode: string;
  referralSource: string;
}

export interface Scores {
  maturity: number;     // governance maturity 0–100 (higher = more mature)
  complexity: number;   // deployment complexity 0–100
  exposure: number;     // Ω exposure 0–100 (higher = more risk)
  exposureBand: Band;
  maturityBand: Band;
}

export type Band = "Low" | "Moderate" | "High" | "Critical";

export type PathwayId =
  | "workshop" | "audit" | "enterprise_assessment" | "pilot" | "integration"
  | "managed_partner" | "embedded_licensing" | "distribution_partner";

/** Partner / channel / licensing pathways — flagged separately in reporting. */
export const PARTNER_PATHWAYS: PathwayId[] = ["managed_partner", "embedded_licensing", "distribution_partner"];
export const isPartnerPathway = (id: PathwayId): boolean => PARTNER_PATHWAYS.includes(id);

export interface Pathway {
  id: PathwayId;
  title: string;
  tagline: string;
  ctaLabel: string;
  ctaHref: string;
  eyebrow?: string;          // overrides the default "Recommended engagement pathway"
  secondaryLabel?: string;   // overrides the default "Book a call"
}

export interface Recommendation extends Pathway {
  why: string[];
  summary?: string; // personalised "Based on your responses…" narrative
}

export const PATHWAYS: Record<PathwayId, Pathway> = {
  workshop: {
    id: "workshop",
    title: "Paid Discovery Workshop™",
    tagline: "Structured scoping before an audit, pilot, or integration.",
    ctaLabel: "Book Discovery Workshop",
    ctaHref: "/book#workshop",
  },
  audit: {
    id: "audit",
    title: "48-Hour Runtime Governance Audit",
    tagline: "A catastrophic-trajectory exposure assessment of your live agent.",
    ctaLabel: "Request the Audit",
    ctaHref: "/request-audit",
  },
  enterprise_assessment: {
    id: "enterprise_assessment",
    title: "Enterprise Runtime Governance Assessment™",
    tagline: "Multi-agent, cross-system governance review with board-ready executive evidence.",
    ctaLabel: "Explore the Enterprise Assessment",
    ctaHref: "/enterprise-runtime-governance-assessment",
  },
  pilot: {
    id: "pilot",
    title: "Limited Pilot",
    tagline: "Validate Runtime Governance against your real trajectories.",
    ctaLabel: "Explore the Pilot",
    ctaHref: "/pilot",
  },
  integration: {
    id: "integration",
    title: "Enterprise Integration",
    tagline: "Deploy Runtime Governance into production.",
    ctaLabel: "Discuss Integration",
    ctaHref: "/contact",
  },
  managed_partner: {
    id: "managed_partner",
    title: "Managed Governance Partner™",
    tagline: "Package Runtime Governance into your cybersecurity, compliance, AI assurance, or managed service offering.",
    ctaLabel: "Discuss Partnership",
    ctaHref: "/contact",
    eyebrow: "Partner / channel evaluation",
  },
  embedded_licensing: {
    id: "embedded_licensing",
    title: "Embedded Runtime Governance Licensing™",
    tagline: "Embed pre-execution Runtime Governance into your platform, product, or customer-facing AI infrastructure.",
    ctaLabel: "Discuss Licensing",
    ctaHref: "/contact",
    eyebrow: "Licensing evaluation",
  },
  distribution_partner: {
    id: "distribution_partner",
    title: "Strategic Alliance Partner™",
    tagline: "Qualified enterprise introductions and strategic market access.",
    ctaLabel: "Discuss Partnership",
    ctaHref: "/contact",
    eyebrow: "Partner / channel evaluation",
  },
};

const yes = (v: YesNo | string) => v === "yes";
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const band = (n: number): Band => (n >= 75 ? "Critical" : n >= 55 ? "High" : n >= 30 ? "Moderate" : "Low");

export function labelsFor(list: Option[], values: string[]): string[] {
  return values.map((v) => list.find((o) => o.value === v)?.label ?? v);
}

const SENSITIVE = ["customer_records", "financial_systems", "payment_systems", "healthcare_data", "security_systems", "source_code"];
const EXTERNAL = ["third_party_apis", "email_systems", "cloud_infrastructure"];
const REGULATED_INDUSTRY = ["Finance", "Insurance", "Healthcare", "Government", "Defence"];
const HARD_COMPLIANCE = ["eu_ai_act", "hipaa", "gdpr", "soc2", "iso27001", "nist", "fca"];

const CONTROL_WEIGHT: Record<string, number> = {
  human_approval: 18, rbac: 16, runtime_controls: 22, monitoring: 14, logging: 10, sandboxing: 14,
};

const TOOL_WEIGHT: Record<string, number> = {
  payment_systems: 14, healthcare_data: 14, financial_systems: 12, security_systems: 12,
  customer_records: 10, source_code: 10, cloud_infrastructure: 10, third_party_apis: 8,
  email_systems: 8, internal_documents: 6,
};

// ── Personalised recommendation narrative ──────────────────────────────────
// Builds a natural-language summary that reflects the respondent's own answers,
// ending in the recommended pathway — e.g. "Based on your responses, your
// environment runs 14 autonomous agents across 3 business units, already in
// production with shared tool execution. We recommend the Enterprise Runtime
// Governance Assessment™." Works for every pathway class. Never fabricates:
// each clause appears only when the underlying answer is present.
const intToken = (v: string | undefined): number | null => {
  const n = parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const joinClauses = (items: string[]): string => {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
};
function agentScalePhrase(d: AssessmentData): string {
  const autonomous = yes(d.canTakeActions) ? "autonomous " : "";
  const exact = intToken(d.agentCount);
  if (exact) return `${exact} ${autonomous}${exact === 1 ? "agent" : "agents"}`;
  switch (d.numAgents) {
    case "20+": return `more than 20 ${autonomous}agents`;
    case "6–20": return `between 6 and 20 ${autonomous}agents`;
    case "2–5": return `a small fleet of ${autonomous}agents`;
    case "1": return `a single ${autonomous}agent`;
    default: return yes(d.agentsDeployed) || yes(d.multipleAgents) ? `${autonomous}agents`.trim() : "";
  }
}
function sensitivePhrase(d: AssessmentData): string {
  const names = (d.toolAccess ?? []).filter((t) => SENSITIVE.includes(t))
    .map((t) => TOOL_ACCESS.find((o) => o.value === t)?.label.toLowerCase() ?? t);
  if (!names.length) return "";
  if (names.length === 1) return `access to ${names[0]}`;
  if (names.length === 2) return `access to ${names[0]} and ${names[1]}`;
  return `access to ${names[0]}, ${names[1]}, and other sensitive systems`;
}
export function narrative(d: AssessmentData, _s: Scores, rec: Pathway): string {
  // Partner / channel / licensing framing
  if (isPartnerPathway(rec.id)) {
    const ptype = PARTNER_TYPES.find((o) => o.value === d.partnerType)?.label.toLowerCase();
    const reach = CUSTOMER_REACH.find((o) => o.value === d.customerReach)?.label;
    const who = ptype ? ` as ${/^[aeiou]/.test(ptype) ? "an" : "a"} ${ptype}` : "";
    const reachClause = reach ? `, serving ${reach.toLowerCase()}` : "";
    const motion = d.intent === "embed_product"
      ? "embed Runtime Governance inside your own product or platform"
      : "bring Runtime Governance to your own customers";
    return `Based on your responses, you're looking to ${motion}${who}${reachClause}. We recommend the ${rec.title}.`;
  }

  // Internal deployment framing
  const industry = d.industry && d.industry !== "Other" ? `${d.industry.toLowerCase()} ` : "";
  const scale = agentScalePhrase(d);
  const units = intToken(d.businessUnits);
  const unitsClause = units && units > 1 ? ` across ${units} business units` : "";
  const lead = scale
    ? `your ${industry}environment runs ${scale}${unitsClause}`
    : yes(d.agentsDeployed)
      ? `your ${industry}environment runs autonomous agents${unitsClause}`
      : `you're preparing to deploy autonomous agents in your ${industry}environment`;

  const prod = yes(d.inProduction) ? ", already in production" : yes(d.agentsDeployed) ? ", not yet in production" : "";

  const features: string[] = [];
  if (yes(d.sharedTools)) features.push("shared tool execution");
  if (yes(d.autonomousCoordination)) features.push("autonomous multi-agent coordination");
  if (yes(d.crossAgentComm)) features.push("cross-agent communication");
  if (yes(d.sharedMemory)) features.push("shared memory");
  if (yes(d.customerFacing)) features.push("customer-facing operation");
  const sens = sensitivePhrase(d);
  if (sens) features.push(sens);
  const withClause = features.length ? ` with ${joinClauses(features)}` : "";

  const regulated = REGULATED_INDUSTRY.includes(d.industry) ||
    (d.compliance ?? []).some((c) => HARD_COMPLIANCE.includes(c));
  const regClause = regulated ? " Operating in a regulated context, reachable Ω exposure must be measured and evidenced." : "";

  return `Based on your responses, ${lead}${prod}${withClause}.${regClause} We recommend the ${rec.title}.`;
}
const withNarrative = (d: AssessmentData, s: Scores, rec: Recommendation): Recommendation =>
  ({ ...rec, summary: narrative(d, s, rec) });

export function score(d: AssessmentData): Scores {
  const tools = d.toolAccess ?? [];
  const controls = d.controls ?? [];

  // ── Governance maturity ──
  let maturity = 0;
  if (controls.includes("none") || controls.length === 0) {
    maturity = 5;
  } else {
    for (const c of controls) maturity += CONTROL_WEIGHT[c] ?? 0;
  }
  maturity = clamp(maturity);

  // ── Deployment complexity ──
  let complexity = 0;
  if (yes(d.inProduction)) complexity += 20;
  if (yes(d.customerFacing)) complexity += 12;
  if (yes(d.canTakeActions)) complexity += 14;
  if (yes(d.connectedToTools)) complexity += 10;
  if (yes(d.multipleAgents)) complexity += 14;
  if (yes(d.autonomousCoordination)) complexity += 12;
  if (yes(d.crossAgentComm)) complexity += 8;
  if (yes(d.sharedMemory)) complexity += 6;
  if (yes(d.sharedTools)) complexity += 6;
  complexity += { "0": 0, "1": 0, "2–5": 6, "6–20": 12, "20+": 18 }[d.numAgents] ?? 0;
  complexity += Math.min(20, tools.length * 2);
  complexity = clamp(complexity);

  // ── Ω exposure (mitigated by maturity) ──
  let exposure = 0;
  for (const t of tools) exposure += TOOL_WEIGHT[t] ?? 0;
  if (yes(d.canTakeActions)) exposure += 14;
  if (yes(d.inProduction)) exposure += 12;
  if (yes(d.customerFacing)) exposure += 8;
  if (yes(d.multipleAgents)) exposure += 6;
  if (yes(d.autonomousCoordination)) exposure += 8;
  const regulated = REGULATED_INDUSTRY.includes(d.industry) ||
    (d.compliance ?? []).some((c) => HARD_COMPLIANCE.includes(c));
  if (regulated) exposure += 10;
  exposure -= Math.round(maturity * 0.35); // existing controls reduce reachable exposure
  exposure = clamp(exposure);

  return { maturity, complexity, exposure, exposureBand: band(exposure), maturityBand: band(maturity) };
}

export function recommend(d: AssessmentData, s: Scores): Recommendation {
  // ── Partner / channel / licensing routing ──
  // These intents describe a partnership, channel, or embedded-governance
  // motion rather than a single internal deployment, so they short-circuit the
  // scoring logic below. An empty/other intent falls through unchanged, keeping
  // Workshop / Audit / Pilot / Integration routing exactly as before.
  if (d.intent === "offer_clients") {
    return withNarrative(d, s, { ...PATHWAYS.managed_partner, why: [
      "You indicated that you may want to offer Runtime Governance to your own clients or customers.",
      "This is a partnership, channel, or embedded-governance opportunity rather than a single internal deployment.",
      "The next step is to understand your customer base, existing service model, deployment capabilities, and partnership structure.",
    ] });
  }
  if (d.intent === "embed_product") {
    return withNarrative(d, s, { ...PATHWAYS.embedded_licensing, why: [
      "You indicated interest in embedding Runtime Governance into an existing product or platform.",
      "This may require licensing, technical integration, usage boundaries, support terms, and deployment architecture review.",
      "The next step is a licensing and technical-fit discussion.",
    ] });
  }
  if (d.intent === "partnership") {
    // Managed-service / security / compliance firms fit the Managed Governance
    // Partner motion; everyone else fits the Strategic Alliance motion.
    const managed = ["msp_mssp", "cybersecurity", "compliance_grc"].includes(d.partnerType);
    if (managed) {
      return withNarrative(d, s, { ...PATHWAYS.managed_partner, why: [
        "You indicated you are exploring a managed-service, MSP/MSSP, security, or compliance channel relationship.",
        "Your profile fits packaging Runtime Governance into your existing security, compliance, or assurance services.",
        "The next step is to understand your customer base, service model, deployment capabilities, and partnership structure.",
      ] });
    }
    return withNarrative(d, s, { ...PATHWAYS.distribution_partner, why: [
      "You indicated you are exploring a strategic partnership, reseller, or channel relationship.",
      "This is a market-access and qualified-introduction motion rather than a single internal deployment.",
      "The next step is to align on target accounts, deal structure, and partnership terms.",
    ] });
  }

  const tools = d.toolAccess ?? [];
  const success = d.successCriteria ?? [];
  const production = yes(d.inProduction);
  const actionsTools = yes(d.connectedToTools) || yes(d.canTakeActions);
  const sensitive = tools.some((t) => SENSITIVE.includes(t));
  const regulated = REGULATED_INDUSTRY.includes(d.industry) ||
    (d.compliance ?? []).some((c) => HARD_COMPLIANCE.includes(c));
  const complexMulti = yes(d.multipleAgents) || ["6–20", "20+"].includes(d.numAgents) || yes(d.autonomousCoordination);

  const why: string[] = [];
  let id: PathwayId;

  if (d.stage === "scaling" || success.includes("enterprise_rollout")) {
    id = "integration";
    why.push("You indicated you are scaling to production / enterprise rollout.");
    if (production) why.push("Agents are already in production.");
    why.push("Integration embeds Runtime Governance at the tool-dispatch boundary across your stack.");
  } else if (d.stage === "pilot_ready" || success.includes("pilot_validation")) {
    id = "pilot";
    why.push("You are ready to validate Runtime Governance with a scoped pilot.");
    if (sensitive) why.push("Sensitive tool access makes a bounded, observable pilot the right next step.");
    why.push("The pilot runs governance against your real trajectories with attested verdicts.");
  } else if ((production && actionsTools && sensitive && regulated) || s.exposure >= 70) {
    // High-complexity / multi-agent / cross-system estates outgrow the fixed,
    // single-environment 48-hour Audit — route them to the Enterprise Assessment.
    const enterpriseScale =
      complexMulti || s.complexity >= 70 || ["6–20", "20+"].includes(d.numAgents) ||
      yes(d.crossAgentComm) || d.companySize === "1000+";
    if (enterpriseScale) {
      id = "enterprise_assessment";
      if (complexMulti) why.push("You operate a multi-agent environment, so exposure must be mapped across agents and the systems they touch — not a single environment.");
      if (production) why.push("Agents are in production with tool access and the ability to take actions.");
      if (sensitive) why.push("Agents can reach sensitive systems (e.g. customer, financial, payment, health, or security data).");
      if (regulated) why.push("You operate in a regulated context, so exposure must be measured and evidenced for the board.");
      why.push("The Enterprise Runtime Governance Assessment maps reachable Ω across the estate and delivers board-ready evidence, a governance roadmap, and an integration blueprint.");
    } else {
      id = "audit";
      if (production) why.push("Agents are in production with tool access and the ability to take actions.");
      if (sensitive) why.push("Agents can reach sensitive systems (e.g. customer, financial, payment, health, or security data).");
      if (regulated) why.push("You operate in a regulated context, so exposure must be measured and evidenced.");
      if (s.exposure >= 70) why.push(`Ω exposure is ${s.exposureBand.toLowerCase()} — a 48-hour audit quantifies it fast.`);
    }
  } else {
    id = "workshop";
    why.push("You are early in the journey, so structured scoping comes before a full audit, pilot, or integration.");
    if (!production) why.push("No production deployment yet — the workshop maps architecture, tools, and data flows.");
    if (complexMulti) why.push("A multi-agent setup benefits from architecture scoping before deployment.");
    why.push("The workshop is optional — if your answers already give us enough, we can move straight to an Audit, Pilot, or Integration discussion.");
  }

  return withNarrative(d, s, { ...PATHWAYS[id], why });
}

/** Plaintext, CRM-paste-friendly export (Notion / HubSpot / Salesforce / Airtable). */
export function crmSummary(
  d: AssessmentData, s: Scores, rec: Recommendation, reference: string, ts: string,
): string {
  const L = (k: string, v: string) => `${k}: ${v || "—"}`;
  const yn = (v: YesNo) => (v === "yes" ? "Yes" : v === "no" ? "No" : "—");
  const list = (vals: string[], opts: Option[]) => (vals?.length ? labelsFor(opts, vals).join(", ") : "—");
  const one = (val: string, opts: Option[]) => opts.find((o) => o.value === val)?.label ?? (val || "—");
  const partner = isPartnerPathway(rec.id);
  const partnerBlock = partner
    ? [
        `*** PARTNERSHIP / CHANNEL / LICENSING CANDIDATE ***`,
        L("Engagement reason", one(d.intent, ENGAGEMENT_INTENTS)),
        L("Company type", one(d.partnerType, PARTNER_TYPES)),
        L("Estimated customer reach", one(d.customerReach, CUSTOMER_REACH)),
        L("Customer base", d.customerBase),
        ``,
      ]
    : [];
  return [
    `RESURRECTION TECH — RUNTIME GOVERNANCE ASSESSMENT`,
    `Reference: ${reference}`,
    `Submitted: ${ts}`,
    ``,
    ...partnerBlock,
    `— RECOMMENDED PATHWAY —`,
    L("Recommendation", rec.title),
    L("Summary", rec.summary ?? ""),
    L("Rationale", rec.why.join(" ")),
    ``,
    `— ENGAGEMENT INTENT —`,
    L("Why exploring", one(d.intent, ENGAGEMENT_INTENTS)),
    ``,
    `— REFERRAL ATTRIBUTION —`,
    L("Referral source", d.referralSource || "Direct / Unknown"),
    L("Referral code", d.referralCode || "—"),
    L("Referral link", d.referralCode ? referralPath(d.referralCode) : "—"),
    ``,
    `— INTERNAL SCORES (do not share) —`,
    L("Governance Maturity", `${s.maturity}/100 (${s.maturityBand})`),
    L("Deployment Complexity", `${s.complexity}/100`),
    L("Ω Exposure", `${s.exposure}/100 (${s.exposureBand})`),
    ``,
    `— COMPANY —`,
    L("Full name", d.fullName),
    L("Job title", d.jobTitle),
    L("Company", d.companyName),
    L("Email", d.email),
    L("Phone", d.phone),
    L("Industry", d.industry),
    L("Company size", d.companySize),
    L("Country", d.country),
    ``,
    `— AI DEPLOYMENT PROFILE —`,
    L("Stage", STAGES.find((x) => x.value === d.stage)?.label ?? d.stage),
    L("Agents deployed", yn(d.agentsDeployed)),
    L("Customer-facing", yn(d.customerFacing)),
    L("Connected to tools", yn(d.connectedToTools)),
    L("Can take actions", yn(d.canTakeActions)),
    L("Multiple agents", yn(d.multipleAgents)),
    L("In production", yn(d.inProduction)),
    ``,
    `— TOOL ACCESS / RISK SURFACE —`,
    L("Tool access", list(d.toolAccess, TOOL_ACCESS)),
    ``,
    `— GOVERNANCE & CONTROLS —`,
    L("Controls", list(d.controls, CONTROLS)),
    L("How unsafe actions are prevented", d.unsafePrevention),
    L("Incidents / near misses", d.incidents),
    ``,
    `— MULTI-AGENT ENVIRONMENT —`,
    L("Number of agents", d.numAgents),
    L("Shared memory", yn(d.sharedMemory)),
    L("Shared tools", yn(d.sharedTools)),
    L("Autonomous coordination", yn(d.autonomousCoordination)),
    L("Cross-agent communication", yn(d.crossAgentComm)),
    ``,
    `— COMPLIANCE —`,
    L("Requirements", list(d.compliance, COMPLIANCE)),
    ``,
    `— SUCCESS CRITERIA —`,
    L("Goals", list(d.successCriteria, SUCCESS_CRITERIA)),
    L("Notes", d.successNotes),
  ].join("\n");
}

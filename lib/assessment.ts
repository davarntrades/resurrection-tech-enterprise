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

/* ── Organisation footprint ── */
export const REGIONS: Option[] = [
  { value: "uk", label: "United Kingdom" },
  { value: "eu", label: "European Union" },
  { value: "north_america", label: "North America" },
  { value: "middle_east", label: "Middle East" },
  { value: "asia_pacific", label: "Asia-Pacific" },
  { value: "africa", label: "Africa" },
  { value: "latam", label: "Latin America" },
  { value: "global", label: "Global" },
];

/* ── AI programme maturity — current vs target (never a single ambiguous ladder) ── */
export const AI_MATURITY: Option[] = [
  { value: "exploring", label: "Exploring AI — no systems built yet" },
  { value: "prototypes", label: "Building prototypes" },
  { value: "pilots", label: "Running pilots" },
  { value: "production", label: "Production deployment" },
  { value: "enterprise_wide", label: "Enterprise-wide deployment" },
];
export const AI_MATURITY_TARGET: Option[] = [
  ...AI_MATURITY.filter((o) => o.value !== "exploring"),
  { value: "unsure", label: "Not yet decided" },
];

/* ── Runtime risk — current production reality vs future scale ── */
export const CUSTOMERS_CURRENT: Option[] = [
  { value: "none", label: "None" },
  { value: "1_10", label: "1–10" },
  { value: "11_100", label: "11–100" },
  { value: "101_1000", label: "101–1,000" },
  { value: "1000_plus", label: "1,000+" },
];
export const CUSTOMERS_FUTURE: Option[] = [
  { value: "under_100", label: "Under 100" },
  { value: "100_1k", label: "100–1,000" },
  { value: "1k_10k", label: "1,000–10,000" },
  { value: "10k_100k", label: "10,000–100,000" },
  { value: "100k_plus", label: "100,000+" },
];
export const REVENUE_EXPOSURE: Option[] = [
  { value: "none", label: "None yet" },
  { value: "under_100k", label: "Under £100K" },
  { value: "100k_1m", label: "£100K–£1M" },
  { value: "1m_10m", label: "£1M–£10M" },
  { value: "10m_plus", label: "£10M+" },
];
export const REVENUE_EXPOSURE_FUTURE: Option[] = [
  ...REVENUE_EXPOSURE.filter((o) => o.value !== "none"),
  { value: "unsure", label: "Not yet known" },
];
export const EXECUTION_PERMISSIONS: Option[] = [
  { value: "read_only", label: "Read-only access" },
  { value: "execute_with_approval", label: "Execute with human approval" },
  { value: "execute_autonomously", label: "Execute autonomously" },
  { value: "write_production", label: "Write to production systems" },
  { value: "financial_execution", label: "Move money / financial execution" },
  { value: "external_comms", label: "Send external communications" },
];

/* ── Technical architecture ── */
export const DEPLOYMENT_MODELS: Option[] = [
  { value: "hosted_saas", label: "Hosted / SaaS" },
  { value: "self_hosted", label: "Self-hosted" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on_prem", label: "On-prem" },
  { value: "embedded", label: "Embedded in our product" },
];
export const CLOUD_PROVIDERS: Option[] = [
  { value: "aws", label: "AWS" },
  { value: "azure", label: "Azure" },
  { value: "gcp", label: "Google Cloud" },
  { value: "sovereign_private", label: "Sovereign / private cloud" },
  { value: "none_on_prem", label: "None — on-prem only" },
  { value: "other", label: "Other" },
];
export const MODEL_STACK: Option[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "open_weight", label: "Open-weight (Llama / Mistral / etc.)" },
  { value: "custom_fine_tuned", label: "Custom / fine-tuned models" },
  { value: "internal_models", label: "Internal models" },
];
export const AGENT_STACK: Option[] = [
  { value: "langchain_langgraph", label: "LangChain / LangGraph" },
  { value: "openai_agents", label: "OpenAI Agents" },
  { value: "mcp", label: "MCP" },
  { value: "autogen_crewai", label: "AutoGen / CrewAI" },
  { value: "custom_orchestration", label: "Custom orchestration" },
  { value: "no_framework", label: "No framework yet" },
];
export const PROTECTED_ENVIRONMENTS: Option[] = [
  { value: "1", label: "1" },
  { value: "2_3", label: "2–3" },
  { value: "4_10", label: "4–10" },
  { value: "10_plus", label: "10+" },
  { value: "unsure", label: "Not sure yet" },
];
export const AGENTS_EXPECTED: Option[] = [
  { value: "same", label: "About the same" },
  { value: "2x", label: "Roughly double" },
  { value: "5x", label: "5× or more" },
  { value: "org_wide", label: "Organisation-wide rollout" },
  { value: "unsure", label: "Not yet known" },
];

/* ── Governance operations (beyond technical controls) ── */
export const GOVERNANCE_OPS: Option[] = [
  { value: "approval_workflows", label: "Documented approval workflows" },
  { value: "runtime_monitoring", label: "Runtime monitoring in production" },
  { value: "evidence_generation", label: "Governance evidence generation" },
  { value: "audit_ready_reporting", label: "Audit-ready reporting" },
  { value: "incident_management", label: "AI incident management" },
  { value: "executive_oversight", label: "Executive-level oversight" },
  { value: "none", label: "None of these yet" },
];
export const GOVERNANCE_TARGETS: Option[] = [
  { value: "monitor_only", label: "Runtime monitoring (observe-only)" },
  { value: "enforced_runtime", label: "Enforced runtime governance" },
  { value: "audit_ready_evidence", label: "Audit-ready evidence generation" },
  { value: "org_wide_program", label: "Organisation-wide governance programme" },
  { value: "unsure", label: "Not yet decided" },
];

/* ── Compliance & oversight ── */
export const EVIDENCE_REQUIREMENTS: Option[] = [
  { value: "board_reporting", label: "Board reporting" },
  { value: "regulator_submissions", label: "Regulator submissions" },
  { value: "internal_audit", label: "Internal audit" },
  { value: "customer_assurance", label: "Customer assurance" },
  { value: "insurance_actuarial", label: "Insurance / actuarial evidence" },
  { value: "none_yet", label: "None yet" },
];
export const EXEC_OVERSIGHT: Option[] = [
  { value: "board_committee", label: "Board or risk committee" },
  { value: "named_executive", label: "A named executive owner" },
  { value: "cio_ciso", label: "CIO / CISO function" },
  { value: "external_advisors", label: "External advisors" },
  { value: "no_clear_owner", label: "No clear owner yet" },
];
export const EXEC_NEED: Option[] = [
  { value: "have_internal", label: "No — we have this covered internally" },
  { value: "need_advisory", label: "Yes — ongoing executive advisory support" },
  { value: "need_fractional_exec", label: "Yes — a part-time executive AI leader (fractional CAIO)" },
  { value: "unsure", label: "Not sure yet" },
];

/* ── Commercial ── */
export const TIMELINES: Option[] = [
  { value: "immediate", label: "Immediately" },
  { value: "this_quarter", label: "This quarter" },
  { value: "six_months", label: "Within 6 months" },
  { value: "exploring", label: "No timeline — exploring" },
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
  { value: "executive_leadership", label: "We need executive-level AI governance leadership (advisory / fractional CAIO)." },
  { value: "frontier_program", label: "We are a frontier lab, foundation-model provider, AI infrastructure platform, or sovereign AI programme." },
];

/** Partner customer base TODAY — current commercial reality, never ambition. */
export const CUSTOMER_REACH: Option[] = [
  { value: "under_10", label: "Under 10 customers" },
  { value: "10_50", label: "10–50" },
  { value: "50_250", label: "50–250" },
  { value: "250_1000", label: "250–1,000" },
  { value: "1000_plus", label: "1,000+" },
];

/** Partner reach IF THE PARTNERSHIP SUCCEEDS — the future-scale half of the split. */
export const CUSTOMER_REACH_POTENTIAL: Option[] = [
  { value: "under_50", label: "Under 50" },
  { value: "50_500", label: "50–500" },
  { value: "500_5000", label: "500–5,000" },
  { value: "5000_plus", label: "5,000+" },
  { value: "unsure", label: "Not yet known" },
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
  // Stage 1 — Organisation
  fullName: string;
  jobTitle: string;
  companyName: string;
  email: string;
  phone: string;
  industry: string;
  companySize: string;
  country: string;
  operatingRegions: string[];   // where the organisation operates (REGIONS)
  deploymentRegions: string[];  // where AI systems run or will run (REGIONS)
  // Stage 2 — AI programme (current vs target, never one ambiguous ladder)
  aiMaturityCurrent: string;    // AI_MATURITY — where the programme is today
  aiMaturityTarget: string;     // AI_MATURITY_TARGET — 12–18 month target
  agentsDeployed: YesNo;
  customerFacing: YesNo;
  connectedToTools: YesNo;
  canTakeActions: YesNo;
  multipleAgents: YesNo;
  inProduction: YesNo;
  // Stage 3 — Runtime risk
  toolAccess: string[];
  executionPermissions: string[]; // EXECUTION_PERMISSIONS — what agents may do
  criticalSystems: YesNo;         // agents touch business-critical systems
  downstreamAutomation: YesNo;    // agent outputs trigger further automation
  customersCurrent: string;       // CUSTOMERS_CURRENT — production reality today
  customersFuture: string;        // CUSTOMERS_FUTURE — if the programme succeeds
  revenueExposureCurrent: string; // REVENUE_EXPOSURE — value at risk today
  revenueExposureFuture: string;  // REVENUE_EXPOSURE_FUTURE — at target scale
  // Stage 4 — Technical architecture
  deploymentModel: string[];      // DEPLOYMENT_MODELS
  cloudProviders: string[];       // CLOUD_PROVIDERS
  modelStack: string[];           // MODEL_STACK
  agentStack: string[];           // AGENT_STACK
  protectedEnvironments: string;  // PROTECTED_ENVIRONMENTS — environments to govern
  numAgents: string;              // agents in production TODAY
  agentsExpected: string;         // AGENTS_EXPECTED — 12–18 month expectation
  agentCount?: string;            // optional exact agent count → sharper narrative
  businessUnits?: string;         // optional number of business units the agents span
  sharedMemory: YesNo;
  sharedTools: YesNo;
  autonomousCoordination: YesNo;
  crossAgentComm: YesNo;
  // Stage 5 — Governance (current controls + operations + target state)
  controls: string[];
  governanceOps: string[];        // GOVERNANCE_OPS — operational governance capabilities
  governanceTarget: string;       // GOVERNANCE_TARGETS — 12-month target state
  unsafePrevention: string;
  incidents: string;
  // Stage 6 — Compliance & oversight
  compliance: string[];
  evidenceRequirements: string[]; // EVIDENCE_REQUIREMENTS — who consumes evidence
  execOversight: string;          // EXEC_OVERSIGHT — who owns AI risk today
  execNeed: string;               // EXEC_NEED — executive leadership requirement
  // Stage 7 — Commercial qualification
  intent: string;                 // ENGAGEMENT_INTENTS — drives routing
  partnerType: string;            // PARTNER_TYPES — partner leads only
  customerReach: string;          // CUSTOMER_REACH — partner customers TODAY
  customerReachPotential: string; // CUSTOMER_REACH_POTENTIAL — if partnership succeeds
  customerBase: string;           // who they'd offer/embed governance for — partner leads only
  stage: string;                  // STAGES — engagement readiness
  timeline: string;               // TIMELINES — how soon they need governance
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
  | "discovery" | "workshop" | "audit" | "enterprise_assessment" | "pilot" | "integration"
  | "annual_license" | "advisory_retainer"
  | "executive_partnership" | "fractional_caio" | "frontier_partnership"
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
  band?: string;    // indicative engagement scale from the Enterprise Pathways ladder
}

/** Indicative engagement scales — mirrors the public Enterprise Pathways ladder.
 * Partner pathways intentionally carry no figure (partnership-review based). */
export const PATHWAY_BANDS: Record<PathwayId, string> = {
  discovery: "No charge",
  workshop: "£5K–£50K+",
  audit: "£40K–£75K",
  enterprise_assessment: "£100K–£250K+",
  pilot: "£250K–£750K+",
  integration: "Commercial review following deployment assessment",
  annual_license: "£75K–£500K+ / yr",
  advisory_retainer: "£35K–£100K+ / mo",
  executive_partnership: "£150K–£500K+ / yr",
  fractional_caio: "£250K–£1M+ / yr",
  frontier_partnership: "Commercial review · minimum annual commitment",
  managed_partner: "Determined during partnership review",
  embedded_licensing: "Determined during partnership review",
  distribution_partner: "Commission on realised revenue · no fee to join",
};

export const PATHWAYS: Record<PathwayId, Pathway> = {
  discovery: {
    id: "discovery",
    title: "Free Discovery / Questionnaire Review",
    tagline: "Establish fit and high-level risk context — no charge.",
    ctaLabel: "Book a discovery call",
    ctaHref: "/book",
  },
  annual_license: {
    id: "annual_license",
    title: "Annual Runtime Governance™ License",
    tagline: "Ongoing runtime governance — monitoring, updates, support, and revalidation.",
    ctaLabel: "Discuss the Annual License",
    ctaHref: "/contact",
  },
  advisory_retainer: {
    id: "advisory_retainer",
    title: "Advisory Retainer™",
    tagline: "Ongoing governance evolution, validation, and oversight.",
    ctaLabel: "Discuss the Retainer",
    ctaHref: "/contact",
  },
  executive_partnership: {
    id: "executive_partnership",
    title: "Executive Governance Partnership™",
    tagline: "Executive-level governance leadership beyond operational support.",
    ctaLabel: "Discuss Executive Partnership",
    ctaHref: "/contact",
    eyebrow: "Executive advisory evaluation",
  },
  fractional_caio: {
    id: "fractional_caio",
    title: "Fractional Chief AI Officer (CAIO) / Executive AI Governance Lead™",
    tagline: "Part-time executive AI leadership — strategy, deployment governance, and board risk oversight.",
    ctaLabel: "Discuss Fractional CAIO",
    ctaHref: "/contact",
    eyebrow: "Executive advisory evaluation",
  },
  frontier_partnership: {
    id: "frontier_partnership",
    title: "Frontier AI Strategic Partnership™",
    tagline: "Strategic governance for frontier, foundation-model, infrastructure, and sovereign AI programmes.",
    ctaLabel: "Discuss Strategic Partnership",
    ctaHref: "/contact",
    eyebrow: "Strategic programme evaluation",
  },
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
    const pot = CUSTOMER_REACH_POTENTIAL.find((o) => o.value === d.customerReachPotential);
    const who = ptype ? ` as ${/^[aeiou]/.test(ptype) ? "an" : "a"} ${ptype}` : "";
    const potClause = pot && pot.value !== "unsure" ? ` and potential reach of ${pot.label.toLowerCase()}` : "";
    const reachClause = reach ? `, serving ${reach.toLowerCase()} today${potClause}` : "";
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
  ({ ...rec, summary: narrative(d, s, rec), band: PATHWAY_BANDS[rec.id] });

const GOVOPS_WEIGHT: Record<string, number> = {
  approval_workflows: 8, runtime_monitoring: 10, evidence_generation: 10,
  audit_ready_reporting: 10, incident_management: 8, executive_oversight: 8,
};

const PERMISSION_WEIGHT: Record<string, number> = {
  execute_autonomously: 10, financial_execution: 12, write_production: 8, external_comms: 4,
};

export function score(d: AssessmentData): Scores {
  const tools = d.toolAccess ?? [];
  const controls = d.controls ?? [];
  const govOps = (d.governanceOps ?? []).filter((g) => g !== "none");

  // ── Governance maturity (technical controls + operational governance) ──
  let maturity = 0;
  if ((controls.includes("none") || controls.length === 0) && govOps.length === 0) {
    maturity = 5;
  } else {
    for (const c of controls) maturity += CONTROL_WEIGHT[c] ?? 0;
    for (const g of govOps) maturity += GOVOPS_WEIGHT[g] ?? 0;
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
  complexity += { "1": 0, "2_3": 4, "4_10": 8, "10_plus": 12 }[d.protectedEnvironments] ?? 0;
  complexity += Math.min(8, Math.max(0, (d.deploymentModel ?? []).length - 1) * 4);
  if (["5x", "org_wide"].includes(d.agentsExpected)) complexity += 4;
  if (d.aiMaturityCurrent === "enterprise_wide") complexity += 8;
  complexity = clamp(complexity);

  // ── Ω exposure (mitigated by maturity) ──
  let exposure = 0;
  for (const t of tools) exposure += TOOL_WEIGHT[t] ?? 0;
  for (const p of d.executionPermissions ?? []) exposure += PERMISSION_WEIGHT[p] ?? 0;
  if (yes(d.canTakeActions)) exposure += 14;
  if (yes(d.inProduction)) exposure += 12;
  if (yes(d.customerFacing)) exposure += 8;
  if (yes(d.multipleAgents)) exposure += 6;
  if (yes(d.autonomousCoordination)) exposure += 8;
  if (yes(d.criticalSystems)) exposure += 8;
  if (yes(d.downstreamAutomation)) exposure += 6;
  exposure += { none: 0, "1_10": 2, "11_100": 4, "101_1000": 6, "1000_plus": 8 }[d.customersCurrent] ?? 0;
  exposure += { none: 0, under_100k: 2, "100k_1m": 4, "1m_10m": 6, "10m_plus": 10 }[d.revenueExposureCurrent] ?? 0;
  const regulated = REGULATED_INDUSTRY.includes(d.industry) ||
    (d.compliance ?? []).some((c) => HARD_COMPLIANCE.includes(c));
  if (regulated) exposure += 10;
  exposure -= Math.round(maturity * 0.35); // existing controls reduce reachable exposure
  exposure = clamp(exposure);

  return { maturity, complexity, exposure, exposureBand: band(exposure), maturityBand: band(maturity) };
}

export function recommend(d: AssessmentData, s: Scores): Recommendation {
  // ── Frontier / sovereign programme routing ──
  if (d.intent === "frontier_program") {
    return withNarrative(d, s, { ...PATHWAYS.frontier_partnership, why: [
      "You identified as a frontier lab, foundation-model provider, AI infrastructure platform, or sovereign AI programme.",
      "Strategic programmes of this kind need model-release governance, safety-operations integration, and runtime deployment controls — not a single-environment engagement.",
      "The next step is a strategic scoping conversation under commercial review.",
    ] });
  }

  // ── Executive advisory routing ──
  if (d.intent === "executive_leadership") {
    if (d.execNeed === "need_fractional_exec") {
      return withNarrative(d, s, { ...PATHWAYS.fractional_caio, why: [
        "You need part-time executive AI leadership rather than a one-time engagement.",
        "A Fractional CAIO provides AI strategy, deployment governance, board risk reviews, and governance programme leadership without a full-time appointment.",
        d.execOversight === "no_clear_owner"
          ? "You told us AI risk currently has no clear executive owner — this pathway establishes one."
          : "This complements your existing oversight with dedicated executive AI governance capacity.",
      ] });
    }
    return withNarrative(d, s, { ...PATHWAYS.executive_partnership, why: [
      "You need executive-level governance leadership beyond operational support.",
      "The Executive Governance Partnership provides ongoing executive engagement — board reviews, governance direction, and regulatory posture.",
      "If a part-time executive AI leader is the better fit, the same conversation can scope a Fractional CAIO engagement.",
    ] });
  }

  // ── Ongoing assurance routing ──
  // Production estates fit the Annual License; pre-production or advisory-led
  // estates fit the Advisory Retainer.
  if (d.intent === "ongoing_assurance") {
    if (yes(d.inProduction) || d.aiMaturityCurrent === "production" || d.aiMaturityCurrent === "enterprise_wide") {
      return withNarrative(d, s, { ...PATHWAYS.annual_license, why: [
        "You asked for ongoing governance assurance and agents are already in production.",
        "The Annual Runtime Governance™ License sustains production governance — monitoring, updates, support, and revalidation.",
        "Renewal-grade evidence is generated continuously, with monthly executive reporting.",
      ] });
    }
    return withNarrative(d, s, { ...PATHWAYS.advisory_retainer, why: [
      "You asked for ongoing governance assurance ahead of a full production deployment.",
      "The Advisory Retainer provides continuous governance evolution, validation, and oversight while your programme matures.",
      "When production begins, the retainer transitions naturally into the Annual Runtime Governance™ License.",
    ] });
  }

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
      yes(d.crossAgentComm) || d.companySize === "1000+" ||
      ["4_10", "10_plus"].includes(d.protectedEnvironments) ||
      d.aiMaturityCurrent === "enterprise_wide" ||
      (d.operatingRegions ?? []).length >= 3;
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
  } else if (
    // Truly exploratory: no agents built, no committed timeline, nothing in
    // production — free discovery establishes fit before any paid engagement.
    (d.aiMaturityCurrent === "exploring" || (!d.aiMaturityCurrent && d.stage === "exploring")) &&
    !yes(d.agentsDeployed) && !production &&
    (d.timeline === "exploring" || !d.timeline)
  ) {
    id = "discovery";
    why.push("You are at the exploration stage — no agents deployed and no committed timeline yet.");
    why.push("A free discovery call establishes fit and high-level risk context before any paid engagement.");
    why.push("When you begin building, the Paid Discovery Workshop or 48-Hour Audit is the natural next rung.");
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
        L("Customers served today", one(d.customerReach, CUSTOMER_REACH)),
        L("Potential reach if partnership succeeds", one(d.customerReachPotential, CUSTOMER_REACH_POTENTIAL)),
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
    L("Indicative engagement scale", rec.band ?? PATHWAY_BANDS[rec.id]),
    L("Summary", rec.summary ?? ""),
    L("Rationale", rec.why.join(" ")),
    ``,
    `— COMMERCIAL QUALIFICATION —`,
    L("Why exploring", one(d.intent, ENGAGEMENT_INTENTS)),
    L("Engagement readiness", STAGES.find((x) => x.value === d.stage)?.label ?? d.stage),
    L("Timeline", one(d.timeline, TIMELINES)),
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
    L("Operating regions", list(d.operatingRegions, REGIONS)),
    L("AI deployment regions", list(d.deploymentRegions, REGIONS)),
    ``,
    `— AI PROGRAMME (CURRENT vs TARGET) —`,
    L("Maturity today", one(d.aiMaturityCurrent, AI_MATURITY)),
    L("Maturity target (12–18 mo)", one(d.aiMaturityTarget, AI_MATURITY_TARGET)),
    L("Agents deployed", yn(d.agentsDeployed)),
    L("Customer-facing", yn(d.customerFacing)),
    L("Connected to tools", yn(d.connectedToTools)),
    L("Can take actions", yn(d.canTakeActions)),
    L("Multiple agents", yn(d.multipleAgents)),
    L("In production", yn(d.inProduction)),
    ``,
    `— RUNTIME RISK —`,
    L("Tool access", list(d.toolAccess, TOOL_ACCESS)),
    L("Execution permissions", list(d.executionPermissions, EXECUTION_PERMISSIONS)),
    L("Business-critical systems", yn(d.criticalSystems)),
    L("Downstream automation", yn(d.downstreamAutomation)),
    L("End customers today", one(d.customersCurrent, CUSTOMERS_CURRENT)),
    L("End customers at target scale", one(d.customersFuture, CUSTOMERS_FUTURE)),
    L("Revenue exposure today", one(d.revenueExposureCurrent, REVENUE_EXPOSURE)),
    L("Revenue exposure at target scale", one(d.revenueExposureFuture, REVENUE_EXPOSURE_FUTURE)),
    ``,
    `— TECHNICAL ARCHITECTURE —`,
    L("Deployment model", list(d.deploymentModel, DEPLOYMENT_MODELS)),
    L("Cloud providers", list(d.cloudProviders, CLOUD_PROVIDERS)),
    L("Model stack", list(d.modelStack, MODEL_STACK)),
    L("Agent stack", list(d.agentStack, AGENT_STACK)),
    L("Protected environments", one(d.protectedEnvironments, PROTECTED_ENVIRONMENTS)),
    L("Agents in production today", d.numAgents),
    L("Expected agents (12–18 mo)", one(d.agentsExpected, AGENTS_EXPECTED)),
    L("Shared memory", yn(d.sharedMemory)),
    L("Shared tools", yn(d.sharedTools)),
    L("Autonomous coordination", yn(d.autonomousCoordination)),
    L("Cross-agent communication", yn(d.crossAgentComm)),
    ``,
    `— GOVERNANCE (CURRENT vs TARGET) —`,
    L("Technical controls", list(d.controls, CONTROLS)),
    L("Governance operations", list(d.governanceOps, GOVERNANCE_OPS)),
    L("Governance target (12 mo)", one(d.governanceTarget, GOVERNANCE_TARGETS)),
    L("How unsafe actions are prevented", d.unsafePrevention),
    L("Incidents / near misses", d.incidents),
    ``,
    `— COMPLIANCE & OVERSIGHT —`,
    L("Requirements", list(d.compliance, COMPLIANCE)),
    L("Evidence consumers", list(d.evidenceRequirements, EVIDENCE_REQUIREMENTS)),
    L("AI risk owner today", one(d.execOversight, EXEC_OVERSIGHT)),
    L("Executive leadership need", one(d.execNeed, EXEC_NEED)),
    ``,
    `— SUCCESS CRITERIA —`,
    L("Goals", list(d.successCriteria, SUCCESS_CRITERIA)),
    L("Notes", d.successNotes),
  ].join("\n");
}

/**
 * Runtime Governance Assessment — qualification, scoring, and routing engine.
 *
 * Shared by the questionnaire UI (option lists) and the API (authoritative
 * scoring + recommendation + CRM export). Scoring logic is internal: it is
 * surfaced in the emailed report, never on the public page.
 */

export interface Option {
  value: string;
  label: string;
}

export const INDUSTRIES: string[] = [
  "Finance", "Insurance", "Healthcare", "Cybersecurity", "Government", "Defence",
  "Telecommunications", "Manufacturing", "Energy", "Logistics", "Other",
];

export const COMPANY_SIZES: string[] = ["1–50", "51–250", "251–1000", "1000+"];

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
  sharedMemory: YesNo;
  sharedTools: YesNo;
  autonomousCoordination: YesNo;
  crossAgentComm: YesNo;
  // Section 6 — Compliance
  compliance: string[];
  // Section 7 — Success criteria
  successCriteria: string[];
  successNotes: string;
}

export interface Scores {
  maturity: number;     // governance maturity 0–100 (higher = more mature)
  complexity: number;   // deployment complexity 0–100
  exposure: number;     // Ω exposure 0–100 (higher = more risk)
  exposureBand: Band;
  maturityBand: Band;
}

export type Band = "Low" | "Moderate" | "High" | "Critical";

export type PathwayId = "workshop" | "audit" | "pilot" | "integration";

export interface Pathway {
  id: PathwayId;
  title: string;
  tagline: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface Recommendation extends Pathway {
  why: string[];
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
    id = "audit";
    if (production) why.push("Agents are in production with tool access and the ability to take actions.");
    if (sensitive) why.push("Agents can reach sensitive systems (e.g. customer, financial, payment, health, or security data).");
    if (regulated) why.push("You operate in a regulated context, so exposure must be measured and evidenced.");
    if (s.exposure >= 70) why.push(`Ω exposure is ${s.exposureBand.toLowerCase()} — a 48-hour audit quantifies it fast.`);
  } else {
    id = "workshop";
    why.push("You are early in the journey, so structured scoping comes before a full audit, pilot, or integration.");
    if (!production) why.push("No production deployment yet — the workshop maps architecture, tools, and data flows.");
    if (complexMulti) why.push("A multi-agent setup benefits from architecture scoping before deployment.");
    why.push("The workshop is optional — if your answers already give us enough, we can move straight to an Audit, Pilot, or Integration discussion.");
  }

  return { ...PATHWAYS[id], why };
}

/** Plaintext, CRM-paste-friendly export (Notion / HubSpot / Salesforce / Airtable). */
export function crmSummary(
  d: AssessmentData, s: Scores, rec: Recommendation, reference: string, ts: string,
): string {
  const L = (k: string, v: string) => `${k}: ${v || "—"}`;
  const yn = (v: YesNo) => (v === "yes" ? "Yes" : v === "no" ? "No" : "—");
  const list = (vals: string[], opts: Option[]) => (vals?.length ? labelsFor(opts, vals).join(", ") : "—");
  return [
    `RESURRECTION TECH — RUNTIME GOVERNANCE ASSESSMENT`,
    `Reference: ${reference}`,
    `Submitted: ${ts}`,
    ``,
    `— RECOMMENDED PATHWAY —`,
    L("Recommendation", rec.title),
    L("Rationale", rec.why.join(" ")),
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

/**
 * Executive report presentation layer for the Runtime Governance Assessment.
 *
 * Pure derivations over the engine's outputs (AssessmentData, Scores,
 * Recommendation) — key findings, strengths, gaps, decision drivers,
 * confidence, expected outcome, and the engagement timeline. Nothing here
 * scores, routes, or recommends: the engine in ./assessment is the single
 * source of truth and is consumed read-only.
 */

import {
  AI_MATURITY, AI_MATURITY_TARGET, STAGES, TOOL_ACCESS, CUSTOMERS_CURRENT, CUSTOMERS_FUTURE,
  CUSTOMER_REACH, CUSTOMER_REACH_POTENTIAL, ENGAGEMENT_INTENTS, GOVERNANCE_TARGETS,
  PARTNER_TYPES, isPartnerPathway,
  type AssessmentData, type Scores, type Recommendation, type PathwayId, type Option, type YesNo,
} from "./assessment";

export type Confidence = "High" | "Moderate" | "Preliminary";

/** Device-local storage for the generated executive report (/assessment/report). */
export const REPORT_STORAGE_KEY = "rt-assessment-report-v1";

export interface StoredReport {
  data: AssessmentData;
  recommendation: Recommendation;
  reference: string;
  submittedAt: string; // ISO timestamp
}

export type Priority = "Critical" | "High" | "Medium";

export interface GapItem {
  priority: Priority;
  sev: "high" | "med";   // retained for existing dot colouring
  title: string;         // short executive headline
  detail: string;        // the "so what" explanation
}

export interface HeatMap {
  hh: string[];  // high impact · high likelihood  (critical / red)
  hl: string[];  // high impact · low likelihood   (elevated / orange)
  lh: string[];  // low impact  · high likelihood  (watch / amber)
  ll: string[];  // low impact  · low likelihood   (contained / green)
}

export interface ReportInsights {
  confidence: Confidence;
  confidenceNote: string;
  maturityLabel: string;      // AI programme maturity (current), human label
  stageLabel: string;         // engagement readiness, human label
  findings: string[];         // Key Findings — most important observations
  strengths: string[];        // Current Strengths — what is already positive
  gaps: string[];             // Current Gaps — plain text (retained for email)
  priorityGaps: GapItem[];    // Current Gaps — priority-ranked for the report
  drivers: string[];          // which answers contributed most to the recommendation
  exposureDrivers: string[];  // the factors behind the Ω exposure score
  businessImpact: string;     // the "so what" of the recommendation
  heatMap: HeatMap;           // capability risk matrix
  verdict: { headline: string; body: string }; // executive verdict
  outcome: string;            // expected business outcome of the recommended pathway
  timeline: string[];         // engagement stages, adapted to the pathway
}

const yes = (v: YesNo | string) => v === "yes";
const one = (opts: Option[], val: string) => opts.find((o) => o.value === val)?.label ?? "";

const SENSITIVE = ["customer_records", "financial_systems", "payment_systems", "healthcare_data", "security_systems", "source_code"];
const REGULATED_INDUSTRY = ["Finance", "Insurance", "Healthcare", "Government", "Defence"];
const HARD_COMPLIANCE = ["eu_ai_act", "hipaa", "gdpr", "soc2", "iso27001", "nist", "fca"];

const PRIORITY_RANK: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2 };

/** Shared, read-only view of the assessment signals the derivations rely on. */
function signals(d: AssessmentData) {
  const tools = d.toolAccess ?? [];
  const perms = d.executionPermissions ?? [];
  const controls = d.controls ?? [];
  const govOps = (d.governanceOps ?? []).filter((g) => g !== "none");
  return {
    tools, perms, controls, govOps,
    production: yes(d.inProduction),
    regulated: REGULATED_INDUSTRY.includes(d.industry) || (d.compliance ?? []).some((c) => HARD_COMPLIANCE.includes(c)),
    sensitive: tools.filter((t) => SENSITIVE.includes(t)),
    autonomous: perms.includes("execute_autonomously") || yes(d.canTakeActions),
    financial: perms.includes("financial_execution") || tools.includes("payment_systems"),
    multiAgent: yes(d.multipleAgents) || ["6–20", "20+"].includes(d.numAgents),
    hasRuntime: controls.includes("runtime_controls"),
    hasApproval: controls.includes("human_approval"),
    hasMonitoring: controls.includes("monitoring") || govOps.includes("runtime_monitoring"),
  };
}

/**
 * Single source of truth for gaps — consumed by both the report (priority
 * cards) and the email (plain strings). Rule order preserved from the
 * original derivation; only presentation metadata (priority, title) is added.
 */
function buildGaps(d: AssessmentData, s: Scores): GapItem[] {
  const g = signals(d);
  const items: GapItem[] = [];
  if ((g.autonomous || g.financial) && !g.hasRuntime) {
    items.push({
      priority: "Critical", sev: "high", title: "Runtime enforcement layer missing",
      detail: `Agents can ${g.financial ? "execute financial actions" : "act autonomously"} but no runtime enforcement layer exists — a single misaligned trajectory currently executes unchallenged.`,
    });
  }
  if (g.production && !g.hasMonitoring) {
    items.push({
      priority: "Critical", sev: "high", title: "No runtime monitoring in production",
      detail: "Production agents run without runtime monitoring — unsafe behaviour would be discovered from consequences, not from telemetry.",
    });
  }
  if ((d.evidenceRequirements ?? []).some((e) => ["board_reporting", "regulator_submissions", "internal_audit"].includes(e)) && !g.govOps.includes("evidence_generation") && !g.govOps.includes("audit_ready_reporting")) {
    items.push({
      priority: "High", sev: "high", title: "Governance evidence not generated",
      detail: "Board, regulator, or audit stakeholders expect governance evidence that is not currently being generated — the reporting obligation exists before the capability does.",
    });
  }
  if (g.multiAgent && !g.hasRuntime) {
    items.push({
      priority: "High", sev: "med", title: "Ungoverned multi-agent interactions",
      detail: "Multiple agents interact without trajectory-level governance — individually safe agents can combine into an unsafe system that event-level controls cannot see.",
    });
  }
  if (d.execOversight === "no_clear_owner") {
    items.push({
      priority: "High", sev: "med", title: "No executive owner for AI risk",
      detail: "No clear executive owner for AI risk — when an incident occurs, accountability will be assigned during the crisis instead of before it.",
    });
  }
  if (g.production && !g.govOps.includes("incident_management")) {
    items.push({
      priority: "Medium", sev: "med", title: "Incident response incomplete",
      detail: "No AI incident management process for a production estate — response would be improvised at the moment it most needs to be rehearsed.",
    });
  }
  if (g.regulated && s.maturity < 30) {
    items.push({
      priority: "Medium", sev: "med", title: "Regulatory maturity gap",
      detail: "A regulated environment with low governance maturity — the gap between obligation and capability is itself a reportable risk.",
    });
  }
  // Order by urgency (stable within a priority), cap at 5.
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, z) => PRIORITY_RANK[a.it.priority] - PRIORITY_RANK[z.it.priority] || a.i - z.i)
    .map(({ it }) => it)
    .slice(0, 5);
}

/** The factors behind the Ω exposure score — described, never re-summed. */
function exposureDrivers(d: AssessmentData): string[] {
  const g = signals(d);
  const out: string[] = [];
  if (g.financial) out.push("Financial execution permissions");
  if (g.autonomous) out.push("Autonomous execution");
  if (g.production) out.push("Production deployment");
  if (yes(d.criticalSystems)) out.push("Business-critical systems");
  if (g.sensitive.some((t) => ["customer_records", "healthcare_data"].includes(t))) out.push("Customer / regulated data access");
  if (g.multiAgent || yes(d.autonomousCoordination)) out.push("Multi-agent coordination");
  if (yes(d.downstreamAutomation)) out.push("Downstream automation chains");
  if (yes(d.customerFacing)) out.push("Customer-facing operation");
  if (g.perms.includes("write_production")) out.push("Production write access");
  if (g.perms.includes("external_comms")) out.push("External communications");
  if (g.regulated) out.push("Regulated environment");
  if (d.customersCurrent && d.customersCurrent !== "none") out.push("Active end-customer exposure");
  return out.slice(0, 8);
}

/** The "so what" of the recommendation, in board language. */
function businessImpact(d: AssessmentData, s: Scores, rec: Recommendation): string {
  const g = signals(d);
  if (isPartnerPathway(rec.id)) {
    return "Governed AI is becoming a procurement requirement, not a differentiator. Bringing Runtime Governance to your customers positions your organisation ahead of that shift — and exposes it if a partner or competitor moves first.";
  }
  const capability = g.financial ? "execute financial actions"
    : g.sensitive.length ? "move regulated or customer data beyond its intended boundary"
    : g.autonomous ? "take autonomous actions across connected systems"
    : "act on production systems";
  const scope = g.production ? "autonomous production agents" : "the agents you are preparing to deploy";
  const gate = g.hasRuntime ? "" : " before existing governance processes have an opportunity to intervene";
  const lead = g.production
    ? `Without a runtime governance layer, ${scope} may ${capability}${gate}.`
    : `Deploying without runtime governance would let ${scope} ${capability}${gate} once live.`;
  const stakes = g.regulated
    ? " In a regulated environment, a single such event is simultaneously a financial loss and a reportable-compliance exposure."
    : s.exposureBand === "Critical" || s.exposureBand === "High"
      ? " At the current exposure level, the question is not whether such a trajectory is reachable, but when it is first attempted."
      : "";
  return lead + stakes;
}

/**
 * Capability risk matrix — a visual communication aid, not a calculation.
 * Impact reflects what a capability can reach; likelihood reflects whether a
 * mitigating control is present. Positions are heuristic by design.
 */
function riskHeatMap(d: AssessmentData): HeatMap {
  const g = signals(d);
  const m: HeatMap = { hh: [], hl: [], lh: [], ll: [] };
  const place = (label: string, highImpact: boolean, highLikelihood: boolean) => {
    (highImpact ? (highLikelihood ? m.hh : m.hl) : (highLikelihood ? m.lh : m.ll)).push(label);
  };
  // High-impact capabilities — likelihood rises when the relevant control is absent.
  if (g.financial) place("Payment / financial execution", true, !(g.hasApproval || g.hasRuntime));
  if (g.autonomous) place("Autonomous tool execution", true, !(g.hasRuntime || g.hasApproval));
  if (g.sensitive.some((t) => ["customer_records", "healthcare_data", "financial_systems", "security_systems"].includes(t)))
    place("Regulated / customer data access", true, !g.hasMonitoring);
  if (g.production) place("Production deployment", true, !g.hasMonitoring);
  if (yes(d.downstreamAutomation)) place("Downstream automation", true, !g.hasRuntime);
  if (g.multiAgent || yes(d.autonomousCoordination)) place("Multi-agent coordination", true, yes(d.autonomousCoordination) && !g.hasRuntime);
  // Lower-impact surfaces.
  if (yes(d.sharedMemory)) place("Shared memory / context", false, !g.hasRuntime);
  if (yes(d.crossAgentComm)) place("Cross-agent communication", false, false);
  if (g.controls.includes("logging")) place("Logging (control in place)", false, false);
  if (g.hasMonitoring) place("Monitoring (control in place)", false, false);
  return m;
}

/** Concise executive verdict — one paragraph, situationally composed. */
function executiveVerdict(d: AssessmentData, s: Scores, rec: Recommendation): { headline: string; body: string } {
  const g = signals(d);
  if (isPartnerPathway(rec.id)) {
    return {
      headline: "The opportunity is to lead the shift to governed AI, not follow it.",
      body: `Your organisation is positioned to bring Runtime Governance to its market. The strategic question is no longer whether agentic AI needs governance, but who supplies it to your customers first. Our recommendation is to formalise the ${rec.title} while that position is still open.`,
    };
  }
  const posture = g.production
    ? "Your organisation has progressed beyond experimentation — autonomous AI is already acting on production systems."
    : yes(d.agentsDeployed)
      ? "Your organisation has moved past prototyping — agents are built and deployment is the next step."
      : "Your organisation is early in its AI journey, with the advantage of building governance in from the start.";
  const challenge = g.production
    ? "The remaining challenge is no longer whether AI should be deployed, but whether production autonomy can be governed safely at enterprise scale."
    : "The decisive question is whether governance is established before autonomy expands, or retrofitted after an incident forces it.";
  const close = `At ${s.exposureBand.toLowerCase()} Ω exposure and ${s.maturityBand.toLowerCase()} governance maturity, our recommendation is to establish Runtime Governance through the ${rec.title} before deployment expands further.`;
  return { headline: challenge, body: `${posture} ${close}` };
}

/* ── Expected business outcome per pathway ─────────────────────────────── */
const OUTCOMES: Record<PathwayId, string> = {
  discovery: "A clear view of whether runtime governance fits your programme, and the right entry point when you are ready to build — at no cost and no commitment.",
  workshop: "A scoped risk summary, preliminary Ω exposure analysis, and a concrete commercial proposal — so your first paid engagement is precisely targeted rather than exploratory.",
  audit: "A quantified, evidenced map of the catastrophic states currently reachable in your environment — the evidence base for board sign-off on your governance programme.",
  enterprise_assessment: "Board-ready evidence of reachable Ω exposure across your multi-agent estate, plus a governance roadmap and integration blueprint your executive and technical stakeholders align on together.",
  pilot: "Verified proof, from your own workflows and environment, that unsafe trajectories are intercepted pre-execution — the validation evidence that unlocks production deployment.",
  integration: "Runtime governance enforced in production across your stack — unsafe actions blocked before execution, with audit-ready evidence generated continuously.",
  annual_license: "Sustained production governance: continuous monitoring, revalidation as models and threats evolve, and monthly executive evidence that protection is holding.",
  advisory_retainer: "A governance programme that matures ahead of your deployment curve, with continuous expert oversight and executive visibility as systems and regulation evolve.",
  executive_partnership: "Executive-grade governance leadership — board risk reviews, programme direction, and regulatory posture — without building that capability internally first.",
  fractional_caio: "A named executive AI leader owning strategy, deployment governance, and board accountability — at a fraction of a full-time appointment.",
  frontier_partnership: "A strategic governance programme matched to frontier-scale risk: model-release governance, safety-operations integration, and runtime deployment controls under a multi-year partnership.",
  managed_partner: "Runtime Governance packaged into your service portfolio — a differentiated, recurring governance offering for your customer base with a repeatable delivery model.",
  embedded_licensing: "Pre-execution governance embedded natively in your product — a competitive safety differentiator your customers inherit automatically.",
  distribution_partner: "A commission-backed route for qualified introductions — market-access economics with no delivery obligation.",
};

/* ── Engagement timeline per pathway ───────────────────────────────────── */
const TIMELINES_BY_PATHWAY: Record<PathwayId, string[]> = {
  discovery: ["Discovery call", "Questionnaire review", "Fit & risk context", "Recommended pathway"],
  workshop: ["Discovery", "Workshop sessions", "Risk summary & Ω analysis", "Commercial proposal", "Audit or Pilot"],
  audit: ["Scoping", "48-hour audit", "Exposure report", "Executive review", "Pilot or Integration"],
  enterprise_assessment: ["Discovery", "Architecture review", "Cross-system Ω mapping", "Executive & technical workshops", "Roadmap & integration blueprint"],
  pilot: ["Scoping", "Shadow-mode deployment", "Evidence gathering (30–60 days)", "Executive review", "Enterprise Integration"],
  integration: ["Deployment assessment", "Integration plan", "Production deployment", "Enforcement enabled", "Annual License"],
  annual_license: ["Deployment review", "License activation", "Continuous monitoring", "Monthly reporting", "Annual revalidation"],
  advisory_retainer: ["Kick-off", "Governance baseline", "Monthly advisory cadence", "Quarterly executive review"],
  executive_partnership: ["Alignment call", "Scope & decision rights", "Engagement start", "Board-level cadence"],
  fractional_caio: ["Alignment call", "Mandate & decision rights", "Engagement start", "Executive & board cadence"],
  frontier_partnership: ["Strategic alignment", "Commercial review", "Programme design", "Multi-year partnership"],
  managed_partner: ["Partnership discovery", "Commercial review", "Partner onboarding", "First customer engagements"],
  embedded_licensing: ["Partnership discovery", "Technical & licensing review", "Integration", "Embedded launch"],
  distribution_partner: ["Partnership discovery", "Terms & deal registration", "Qualified introductions", "Commission on realised revenue"],
};

/** Engagement timeline for a pathway — for surfaces without full scores (e.g. emails). */
export const timelineFor = (id: PathwayId): string[] => TIMELINES_BY_PATHWAY[id];

/* ── Confidence — driven by answer completeness, presentation-only ─────── */
function deriveConfidence(d: AssessmentData): { confidence: Confidence; note: string } {
  const signals: boolean[] = [
    !!d.aiMaturityCurrent,
    d.inProduction !== "",
    (d.toolAccess ?? []).length > 0 || (d.executionPermissions ?? []).length > 0,
    (d.controls ?? []).length > 0 || (d.governanceOps ?? []).length > 0,
    (d.compliance ?? []).length > 0 || (d.evidenceRequirements ?? []).length > 0,
    !!d.intent,
    !!d.stage || !!d.timeline,
    !!d.numAgents || d.agentsDeployed !== "",
    (d.deploymentModel ?? []).length > 0 || !!d.protectedEnvironments,
  ];
  const answered = signals.filter(Boolean).length;
  const ratio = answered / signals.length;
  if (ratio >= 0.75) return {
    confidence: "High",
    note: "Based on a substantially complete qualification across organisation, risk, architecture, governance, and commercial intent.",
  };
  if (ratio >= 0.4) return {
    confidence: "Moderate",
    note: "Based on a partially complete qualification — the recommendation is directionally reliable and will sharpen with a discovery conversation.",
  };
  return {
    confidence: "Preliminary",
    note: "Based on limited responses — treat this as a starting hypothesis to validate in a discovery conversation.",
  };
}

/* ── The main derivation ───────────────────────────────────────────────── */
export function deriveInsights(d: AssessmentData, s: Scores, rec: Recommendation): ReportInsights {
  const tools = d.toolAccess ?? [];
  const perms = d.executionPermissions ?? [];
  const controls = d.controls ?? [];
  const govOps = (d.governanceOps ?? []).filter((g) => g !== "none");
  const production = yes(d.inProduction);
  const regulated = REGULATED_INDUSTRY.includes(d.industry) ||
    (d.compliance ?? []).some((c) => HARD_COMPLIANCE.includes(c));
  const sensitive = tools.filter((t) => SENSITIVE.includes(t));
  const autonomous = perms.includes("execute_autonomously") || yes(d.canTakeActions);
  const financial = perms.includes("financial_execution");
  const multiAgent = yes(d.multipleAgents) || ["6–20", "20+"].includes(d.numAgents);
  const noControls = controls.length === 0 || controls.includes("none");
  const hasRuntime = controls.includes("runtime_controls");
  const partner = isPartnerPathway(rec.id);

  const { confidence, note: confidenceNote } = deriveConfidence(d);

  /* Key Findings — ordered by executive importance, capped at 6 */
  const findings: string[] = [];
  if (production) {
    const scale = d.numAgents && d.numAgents !== "0" ? ` with ${d.numAgents} agents` : "";
    findings.push(`AI agents are live in production${scale}${yes(d.customerFacing) ? ", operating customer-facing" : ""} — governance is a present-tense requirement, not a future one.`);
  } else if (yes(d.agentsDeployed)) {
    findings.push("Agents are built but not yet in production — the most cost-effective window to embed governance is before go-live.");
  } else if (d.aiMaturityCurrent) {
    findings.push(`The programme is at the ${one(AI_MATURITY, d.aiMaturityCurrent).toLowerCase().replace(/ — .*/, "")} stage — no production AI deployment yet.`);
  }
  {
    const source = financial ? "agents are permitted to move money"
      : sensitive.length ? `agents can reach ${sensitive.slice(0, 2).map((t) => one(TOOL_ACCESS, t).toLowerCase()).join(" and ")}`
      : autonomous ? "agents can act without a human in the loop"
      : "";
    findings.push(`Reachable Ω exposure is ${s.exposureBand.toLowerCase()} (${s.exposure}/100)${source ? ` — driven primarily by the fact that ${source}` : ""}.`);
  }
  if (noControls && govOps.length === 0) {
    findings.push("No runtime controls or governance operations are in place today — every deployed capability currently runs unguarded.");
  } else {
    findings.push(`Governance maturity is ${s.maturityBand.toLowerCase()} (${s.maturity}/100), built on ${[controls.filter((c) => c !== "none").length && `${controls.filter((c) => c !== "none").length} technical controls`, govOps.length && `${govOps.length} governance operations`].filter(Boolean).join(" and ")}.`);
  }
  if (d.aiMaturityCurrent && d.aiMaturityTarget && d.aiMaturityTarget !== "unsure" && d.aiMaturityTarget !== d.aiMaturityCurrent) {
    findings.push(`The stated trajectory is from ${one(AI_MATURITY, d.aiMaturityCurrent).toLowerCase().replace(/ — .*/, "")} today to ${one(AI_MATURITY_TARGET, d.aiMaturityTarget).toLowerCase()} within 12–18 months — governance scope should be sized for the target, not the present.`);
  }
  if (partner && d.customerReach) {
    const pot = d.customerReachPotential && d.customerReachPotential !== "unsure"
      ? `, with potential reach of ${one(CUSTOMER_REACH_POTENTIAL, d.customerReachPotential).toLowerCase()} if the partnership succeeds` : "";
    findings.push(`The objective is a partnership motion rather than internal deployment — serving ${one(CUSTOMER_REACH, d.customerReach).toLowerCase()} today${pot}.`);
  } else if (d.customersCurrent && d.customersCurrent !== "none") {
    const fut = d.customersFuture ? ` today, with a potential future scale of ${one(CUSTOMERS_FUTURE, d.customersFuture).toLowerCase()} end customers` : "";
    findings.push(`AI systems in scope currently serve ${one(CUSTOMERS_CURRENT, d.customersCurrent).toLowerCase()} active end customers${fut} — customer impact is a live consideration in every governance decision.`);
  }
  if (regulated) {
    findings.push(`The environment is regulated (${[d.industry !== "Other" ? d.industry : "", ...(d.compliance ?? []).filter((c) => HARD_COMPLIANCE.includes(c)).slice(0, 3).map((c) => c.toUpperCase().replace("_", " "))].filter(Boolean).slice(0, 3).join(", ")}) — governance evidence must be demonstrable, not just present.`);
  }
  if (d.intent === "executive_leadership" || d.execNeed === "need_fractional_exec" || d.execNeed === "need_advisory") {
    findings.push("Executive-level governance leadership was explicitly identified as a requirement.");
  }

  /* Current Strengths — only genuine positives, capped at 5 */
  const strengths: string[] = [];
  if (hasRuntime) strengths.push("Runtime controls already exist — the enforcement mindset is in place, and Runtime Governance strengthens rather than introduces it.");
  if (controls.includes("human_approval")) strengths.push("Human approval gates already govern sensitive actions — a strong foundation for graduated autonomy.");
  if (controls.includes("monitoring") || govOps.includes("runtime_monitoring")) strengths.push("Monitoring is already in place, giving governance an observability baseline to build on.");
  if (govOps.includes("evidence_generation") || govOps.includes("audit_ready_reporting")) strengths.push("Governance evidence is already generated — audit and regulator conversations start from strength.");
  if (govOps.includes("incident_management")) strengths.push("AI incident management exists — failures have an owner and a process.");
  if (["board_committee", "named_executive", "cio_ciso"].includes(d.execOversight)) strengths.push("AI risk has a clear executive owner — decision rights for governance are already established.");
  if (!autonomous && perms.length > 0) strengths.push("No agent currently executes without human oversight — autonomy is being expanded deliberately, not by default.");
  if (d.governanceTarget && d.governanceTarget !== "unsure") strengths.push(`A defined governance target (${one(GOVERNANCE_TARGETS, d.governanceTarget).toLowerCase()}) shows governance is planned, not reactive.`);
  if (strengths.length === 0) {
    strengths.push(production
      ? "The organisation is engaging with runtime governance while systems are live — closing the gap early rather than after an incident."
      : "The organisation is engaging with runtime governance before production — the cheapest and safest point to build it in.");
  }

  /* Current Gaps — priority-ranked, tied to specific answers (shared builder) */
  const priorityGaps = buildGaps(d, s);

  /* Decision drivers — which answers contributed most */
  const drivers: string[] = [];
  if (d.intent) drivers.push(`Stated objective: “${one(ENGAGEMENT_INTENTS, d.intent)}”`);
  if (partner && d.partnerType) drivers.push(`Organisation type: ${one(PARTNER_TYPES, d.partnerType)}`);
  if (partner && d.customerReach) drivers.push(`Customer base today: ${one(CUSTOMER_REACH, d.customerReach)}`);
  if (!partner) {
    if (d.stage) drivers.push(`Engagement readiness: ${one(STAGES, d.stage)}`);
    if (production) drivers.push("Agents already in production");
    if (financial) drivers.push("Agents permitted to execute financial actions");
    else if (sensitive.length) drivers.push(`Access to ${sensitive.slice(0, 2).map((t) => one(TOOL_ACCESS, t).toLowerCase()).join(" and ")}`);
    if (regulated) drivers.push("Regulated industry / compliance obligations");
    if (multiAgent) drivers.push("Multi-agent environment");
    if (d.execNeed === "need_fractional_exec" || d.execNeed === "need_advisory") drivers.push("Executive leadership requirement");
  }

  return {
    confidence,
    confidenceNote,
    maturityLabel: d.aiMaturityCurrent ? one(AI_MATURITY, d.aiMaturityCurrent).replace(/ — .*/, "") : "Not stated",
    stageLabel: d.stage ? one(STAGES, d.stage) : "Not stated",
    findings: findings.slice(0, 6),
    strengths: strengths.slice(0, 5),
    gaps: priorityGaps.map((g) => g.detail),
    priorityGaps,
    drivers: drivers.slice(0, 5),
    exposureDrivers: exposureDrivers(d),
    businessImpact: businessImpact(d, s, rec),
    heatMap: riskHeatMap(d),
    verdict: executiveVerdict(d, s, rec),
    outcome: OUTCOMES[rec.id],
    timeline: TIMELINES_BY_PATHWAY[rec.id],
  };
}

/** Severity chips for gaps — thin wrapper over the shared gap builder. */
export function gapSeverities(d: AssessmentData, s: Scores): ("high" | "med")[] {
  return buildGaps(d, s).map((g) => g.sev);
}

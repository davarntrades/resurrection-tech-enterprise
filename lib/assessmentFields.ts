/**
 * Runtime Governance Assessment — the single source of truth for every
 * questionnaire field.
 *
 * Before this module existed the questionnaire carried two divergent
 * validation contracts: the client checked presence on Stage 1 only, while the
 * API enforced length bounds on every field. A completed assessment could
 * therefore fail server-side on a Stage 5 answer and surface as nothing but
 * "Please complete the required fields." on Stage 1 — the submit button looked
 * inert. Everything that needs to know about a field (its participant-facing
 * label, which stage owns it, whether it is required, and its bounds) now comes
 * from here, so the UI, the zod schema, the review panel, and the error summary
 * cannot drift apart.
 *
 * Scoring, routing, and the recommendation engine are untouched.
 */

import { PARTNER_INTENTS, type AssessmentData } from "./assessment";

/* ── Sections ───────────────────────────────────────────────────────────── */

export type SectionKey =
  | "organisation" | "programme" | "risk" | "architecture"
  | "governance" | "compliance" | "commercial";

export interface SectionMeta {
  key: SectionKey;
  /** Participant-facing name, matching the Stage 8 review headings. */
  label: string;
  /** Zero-based questionnaire stage that owns the section. */
  step: number;
}

export const SECTION_META: SectionMeta[] = [
  { key: "organisation", label: "Organisation", step: 0 },
  { key: "programme", label: "AI programme", step: 1 },
  { key: "risk", label: "Runtime risk", step: 2 },
  { key: "architecture", label: "Architecture", step: 3 },
  { key: "governance", label: "Governance", step: 4 },
  { key: "compliance", label: "Compliance & oversight", step: 5 },
  { key: "commercial", label: "Commercial", step: 6 },
];

const SECTION_BY_KEY = new Map(SECTION_META.map((s) => [s.key, s]));

/** Stage index of the review step — the last stage. */
export const REVIEW_STEP = SECTION_META.length;

/* ── Field specifications ───────────────────────────────────────────────── */

export type FieldKind = "text" | "email" | "choice" | "prose" | "list" | "yesno";

export interface FieldSpec {
  key: keyof AssessmentData;
  /** Participant-facing label. Internal keys are never shown to a respondent. */
  label: string;
  section: SectionKey;
  kind: FieldKind;
  /** Required to submit. Deliberately unchanged from the shipped behaviour. */
  required?: boolean;
  /** Maximum characters for scalar values. */
  max?: number;
  /** Maximum entries for list (multi-select) values. */
  maxItems?: number;
  /** Maximum characters per list entry. */
  maxItemLength?: number;
  /**
   * Hidden/conditional questions: only asked when this holds. A question that
   * is not asked can never block submission, even if it was answered earlier
   * and the triggering answer has since changed.
   */
  askedWhen?: (d: Partial<AssessmentData>) => boolean;
  /** System-captured, never rendered as a question (referral attribution). */
  internal?: boolean;
}

const isPartnerLead = (d: Partial<AssessmentData>) =>
  (PARTNER_INTENTS as readonly string[]).includes(d.intent ?? "");

export const FIELD_SPECS: FieldSpec[] = [
  /* Stage 1 — Organisation */
  { key: "fullName", label: "Full name", section: "organisation", kind: "text", required: true, max: 160 },
  { key: "jobTitle", label: "Job title", section: "organisation", kind: "text", required: true, max: 160 },
  { key: "companyName", label: "Company name", section: "organisation", kind: "text", required: true, max: 200 },
  { key: "email", label: "Email address", section: "organisation", kind: "email", required: true, max: 200 },
  { key: "phone", label: "Phone number", section: "organisation", kind: "text", max: 60 },
  { key: "industry", label: "Industry", section: "organisation", kind: "choice", required: true, max: 80 },
  { key: "companySize", label: "Organisation size", section: "organisation", kind: "choice", required: true, max: 40 },
  { key: "country", label: "Headquarters country", section: "organisation", kind: "choice", required: true, max: 80 },
  { key: "operatingRegions", label: "Operating regions", section: "organisation", kind: "list" },
  { key: "deploymentRegions", label: "AI deployment regions", section: "organisation", kind: "list" },

  /* Stage 2 — AI programme */
  { key: "aiMaturityCurrent", label: "Current AI maturity", section: "programme", kind: "choice", max: 40 },
  { key: "aiMaturityTarget", label: "Target AI maturity", section: "programme", kind: "choice", max: 40 },
  { key: "agentsDeployed", label: "Agents currently deployed", section: "programme", kind: "yesno" },
  { key: "customerFacing", label: "Customer-facing agents", section: "programme", kind: "yesno" },
  { key: "connectedToTools", label: "Agents connected to tools", section: "programme", kind: "yesno" },
  { key: "canTakeActions", label: "Agents can act without a human", section: "programme", kind: "yesno" },
  { key: "multipleAgents", label: "Multiple agents interacting", section: "programme", kind: "yesno" },
  { key: "inProduction", label: "Agents running in production", section: "programme", kind: "yesno" },

  /* Stage 3 — Runtime risk */
  { key: "toolAccess", label: "What your agents can reach", section: "risk", kind: "list" },
  { key: "executionPermissions", label: "What agents are permitted to do", section: "risk", kind: "list" },
  { key: "criticalSystems", label: "Business-critical systems", section: "risk", kind: "yesno" },
  { key: "downstreamAutomation", label: "Downstream automation", section: "risk", kind: "yesno" },
  { key: "customersCurrent", label: "End customers today", section: "risk", kind: "choice", max: 40 },
  { key: "customersFuture", label: "End customers at target scale", section: "risk", kind: "choice", max: 40 },
  { key: "revenueExposureCurrent", label: "Value flowing through AI today", section: "risk", kind: "choice", max: 40 },
  { key: "revenueExposureFuture", label: "Value at stake at target scale", section: "risk", kind: "choice", max: 40 },

  /* Stage 4 — Technical architecture */
  { key: "deploymentModel", label: "Deployment model", section: "architecture", kind: "list" },
  { key: "cloudProviders", label: "Cloud providers", section: "architecture", kind: "list" },
  { key: "modelStack", label: "Model providers", section: "architecture", kind: "list" },
  { key: "agentStack", label: "Agent frameworks", section: "architecture", kind: "list" },
  { key: "protectedEnvironments", label: "Environments to govern", section: "architecture", kind: "choice", max: 20 },
  { key: "numAgents", label: "Agents running today", section: "architecture", kind: "choice", max: 20 },
  { key: "agentsExpected", label: "Expected agent count", section: "architecture", kind: "choice", max: 20 },
  { key: "agentCount", label: "Exact agent count", section: "architecture", kind: "text", max: 12 },
  { key: "businessUnits", label: "Business units involved", section: "architecture", kind: "text", max: 12 },
  { key: "sharedMemory", label: "Shared memory between agents", section: "architecture", kind: "yesno" },
  { key: "sharedTools", label: "Shared tools between agents", section: "architecture", kind: "yesno" },
  { key: "autonomousCoordination", label: "Autonomous coordination", section: "architecture", kind: "yesno" },
  { key: "crossAgentComm", label: "Cross-agent communication", section: "architecture", kind: "yesno" },

  /* Stage 5 — Governance */
  { key: "controls", label: "Technical controls today", section: "governance", kind: "list" },
  { key: "governanceOps", label: "Governance operations today", section: "governance", kind: "list" },
  { key: "governanceTarget", label: "Governance target", section: "governance", kind: "choice", max: 40 },
  { key: "unsafePrevention", label: "How unsafe actions are prevented", section: "governance", kind: "prose", max: 4000 },
  { key: "incidents", label: "AI failures, near misses, or unexpected behaviour", section: "governance", kind: "prose", max: 4000 },

  /* Stage 6 — Compliance & oversight */
  { key: "compliance", label: "Compliance regimes", section: "compliance", kind: "list" },
  { key: "evidenceRequirements", label: "Who consumes governance evidence", section: "compliance", kind: "list" },
  { key: "execOversight", label: "Who owns AI risk today", section: "compliance", kind: "choice", max: 40 },
  { key: "execNeed", label: "Executive governance leadership", section: "compliance", kind: "choice", max: 40 },

  /* Stage 7 — Commercial qualification */
  { key: "intent", label: "Why you are exploring Resurrection Tech", section: "commercial", kind: "choice", max: 40 },
  { key: "partnerType", label: "Organisation type", section: "commercial", kind: "choice", max: 40, askedWhen: isPartnerLead },
  { key: "customerReach", label: "Customers served today", section: "commercial", kind: "choice", max: 40, askedWhen: isPartnerLead },
  { key: "customerReachPotential", label: "Potential customer reach", section: "commercial", kind: "choice", max: 40, askedWhen: isPartnerLead },
  { key: "customerBase", label: "Who you would offer or embed governance for", section: "commercial", kind: "prose", max: 4000, askedWhen: isPartnerLead },
  { key: "stage", label: "Readiness to act", section: "commercial", kind: "choice", max: 40 },
  { key: "timeline", label: "Engagement timeline", section: "commercial", kind: "choice", max: 40 },
  { key: "successCriteria", label: "Success criteria", section: "commercial", kind: "list" },
  { key: "successNotes", label: "Goals or constraints", section: "commercial", kind: "prose", max: 4000 },

  /* Referral attribution — captured from ?ref=, never asked as a question. */
  { key: "referralCode", label: "Referral details", section: "organisation", kind: "text", max: 80, internal: true },
  { key: "referralSource", label: "Referral details", section: "organisation", kind: "text", max: 160, internal: true },
];

export const FIELD_BY_KEY: Record<string, FieldSpec> = Object.fromEntries(
  FIELD_SPECS.map((f) => [f.key, f]),
);

/** Default entries for every list field. */
export const DEFAULT_MAX_ITEMS = 20;
export const DEFAULT_MAX_ITEM_LENGTH = 60;

export const maxLengthOf = (key: keyof AssessmentData): number | undefined => FIELD_BY_KEY[key]?.max;
export const maxItemsOf = (key: keyof AssessmentData): number =>
  FIELD_BY_KEY[key]?.maxItems ?? DEFAULT_MAX_ITEMS;
export const maxItemLengthOf = (key: keyof AssessmentData): number =>
  FIELD_BY_KEY[key]?.maxItemLength ?? DEFAULT_MAX_ITEM_LENGTH;

/** A blank questionnaire. Fresh arrays each call, so no state is ever shared. */
export function blankAssessment(): AssessmentData {
  const blank: Record<string, unknown> = {};
  for (const f of FIELD_SPECS) blank[f.key] = f.kind === "list" ? [] : "";
  return blank as unknown as AssessmentData;
}

/** The blank questionnaire. Also the runtime key list the contract test uses. */
export const EMPTY_ASSESSMENT: AssessmentData = blankAssessment();

/* ── Participant-facing messages ────────────────────────────────────────── */

export const requiredMessage = (key: keyof AssessmentData): string =>
  `${FIELD_BY_KEY[key]?.label ?? "This answer"} is required`;

export const tooLongMessage = (key: keyof AssessmentData): string => {
  const f = FIELD_BY_KEY[key];
  return `${f?.label ?? "This answer"} is too long — please shorten it to ${f?.max ?? 0} characters or fewer`;
};

export const tooManyMessage = (key: keyof AssessmentData): string =>
  `${FIELD_BY_KEY[key]?.label ?? "This answer"} has too many selections — please choose ${maxItemsOf(key)} or fewer`;

export const INVALID_EMAIL_MESSAGE = "Enter a valid email address";

/** Fallback when the server rejects something the participant never sees. */
export const GENERIC_ISSUE_MESSAGE =
  "We could not record part of your submission. Please try again, or contact us if it persists.";

/* ── Shared validation ──────────────────────────────────────────────────── */

export interface ValidationIssue {
  /** Internal field key — for wiring only. Never rendered to the participant. */
  key: string;
  /** Participant-facing field name. */
  label: string;
  /** Participant-facing section name, e.g. "Commercial". */
  sectionLabel: string;
  /** Stage to jump to, or -1 when the issue has no participant-visible stage. */
  step: number;
  section: SectionKey | null;
  /** Participant-facing explanation. */
  message: string;
  /** True when the answer is simply missing (vs. present but invalid). */
  missing: boolean;
}

/**
 * Matches the grammar the API's zod schema accepts, so an address that passes
 * here can never be rejected server-side. Kept deliberately conservative.
 */
export const EMAIL_RE =
  /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

/** Is this question actually being asked, given the current answers? */
export function isAsked(spec: FieldSpec, data: Partial<AssessmentData>): boolean {
  if (spec.internal) return false;
  return spec.askedWhen ? spec.askedWhen(data) : true;
}

function issueFor(spec: FieldSpec, message: string, missing: boolean): ValidationIssue {
  const section = spec.internal ? null : SECTION_BY_KEY.get(spec.section) ?? null;
  return {
    key: String(spec.key),
    label: spec.internal ? "Submission details" : spec.label,
    sectionLabel: section?.label ?? "Submission details",
    step: section?.step ?? -1,
    section: spec.internal ? null : spec.section,
    message,
    missing,
  };
}

/**
 * Validate the answers a participant has given.
 *
 * `sections` limits the check to particular stages (used by the per-stage
 * Continue gate); omit it to validate the whole questionnaire before submit.
 * Hidden conditional questions are skipped entirely.
 */
export function validateAssessment(
  data: Partial<AssessmentData>,
  sections?: SectionKey[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const spec of FIELD_SPECS) {
    if (sections && !sections.includes(spec.section)) continue;
    if (!isAsked(spec, data)) continue;

    const raw = data[spec.key];

    if (spec.kind === "list") {
      const list = Array.isArray(raw) ? raw : [];
      if (spec.required && list.length === 0) {
        issues.push(issueFor(spec, requiredMessage(spec.key), true));
      } else if (list.length > maxItemsOf(spec.key)) {
        issues.push(issueFor(spec, tooManyMessage(spec.key), false));
      }
      continue;
    }

    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      if (spec.required) issues.push(issueFor(spec, requiredMessage(spec.key), true));
      continue;
    }
    if (spec.kind === "email" && !EMAIL_RE.test(value)) {
      issues.push(issueFor(spec, INVALID_EMAIL_MESSAGE, false));
      continue;
    }
    if (spec.max !== undefined && value.length > spec.max) {
      issues.push(issueFor(spec, tooLongMessage(spec.key), false));
    }
  }
  return issues;
}

/** Section keys owned by a given stage index. */
export function sectionsForStep(step: number): SectionKey[] {
  return SECTION_META.filter((s) => s.step === step).map((s) => s.key);
}

/**
 * Translate the API's `fieldErrors` map into participant-facing issues, so a
 * server-side rejection is reported exactly like a client-side one — named
 * field, named section, and a route back to the stage that owns it.
 */
export function issuesFromFieldErrors(
  fieldErrors: Record<string, string> | undefined | null,
  data: Partial<AssessmentData> = {},
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(fieldErrors ?? {})) {
    const spec = FIELD_BY_KEY[key];
    if (!spec) continue; // unknown key — never leak it to the participant
    if (seen.has(String(spec.key))) continue;
    seen.add(String(spec.key));
    const value = data[spec.key];
    const empty = Array.isArray(value) ? value.length === 0 : !String(value ?? "").trim();
    if (spec.internal) {
      out.push(issueFor(spec, GENERIC_ISSUE_MESSAGE, false));
    } else if (empty) {
      out.push(issueFor(spec, requiredMessage(spec.key), true));
    } else if (spec.kind === "email") {
      out.push(issueFor(spec, INVALID_EMAIL_MESSAGE, false));
    } else if (spec.kind === "list") {
      out.push(issueFor(spec, tooManyMessage(spec.key), false));
    } else {
      out.push(issueFor(spec, tooLongMessage(spec.key), false));
    }
  }
  return out;
}

/**
 * Field-key → message map, for rendering inline errors on each stage. The
 * field's own name is stripped because the input already carries its label.
 */
export function errorMapFrom(issues: ValidationIssue[]): Record<string, string> {
  return Object.fromEntries(issues.map((i) => {
    if (i.missing) return [i.key, "Required"];
    const trimmed = i.message.startsWith(`${i.label} `) ? i.message.slice(i.label.length + 1) : i.message;
    return [i.key, trimmed.charAt(0).toUpperCase() + trimmed.slice(1)];
  }));
}

/** Heading for the error summary — accurate whether answers are missing or invalid. */
export function summaryHeading(issues: ValidationIssue[]): string {
  if (issues.every((i) => i.missing)) return "Please complete the following required fields:";
  if (issues.some((i) => i.missing)) return "Please complete or correct the following answers:";
  return "Please check the following answers:";
}

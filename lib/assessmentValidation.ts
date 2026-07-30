import { z } from "zod";
import {
  EMAIL_RE, INVALID_EMAIL_MESSAGE, maxItemLengthOf, maxItemsOf, maxLengthOf,
  requiredMessage, tooLongMessage, tooManyMessage,
} from "./assessmentFields";
import type { AssessmentData } from "./assessment";

/**
 * Server-side validation for the Runtime Governance Assessment questionnaire.
 *
 * Every bound and every message is derived from the shared field specs in
 * `assessmentFields`, so the questionnaire UI, this schema, and the Stage 8
 * error summary can never disagree about what is required or how long an
 * answer may be. Messages are written for the participant, because the client
 * renders them verbatim.
 */

type Key = keyof AssessmentData;

const yesNo = z.enum(["yes", "no", ""]).default("");

/** Required free-text / single-choice answer. */
const req = (key: Key) =>
  z.string().trim()
    .min(1, requiredMessage(key))
    .max(maxLengthOf(key) ?? 200, tooLongMessage(key));

/** Optional free-text / single-choice answer. */
const opt = (key: Key) =>
  z.string().trim()
    .max(maxLengthOf(key) ?? 200, tooLongMessage(key))
    .optional().default("");

/** Multi-select answer. */
const list = (key: Key) =>
  z.array(z.string().max(maxItemLengthOf(key)))
    .max(maxItemsOf(key), tooManyMessage(key))
    .optional().default([]);

export const assessmentSchema = z.object({
  // Stage 1 — Organisation (required core)
  fullName: req("fullName"),
  jobTitle: req("jobTitle"),
  companyName: req("companyName"),
  email: z.string().trim()
    .min(1, requiredMessage("email"))
    .regex(EMAIL_RE, INVALID_EMAIL_MESSAGE)
    .max(maxLengthOf("email") ?? 200, tooLongMessage("email")),
  phone: opt("phone"),
  industry: req("industry"),
  companySize: req("companySize"),
  country: req("country"),
  operatingRegions: list("operatingRegions"),
  deploymentRegions: list("deploymentRegions"),

  // Stage 2 — AI programme (current vs target)
  aiMaturityCurrent: opt("aiMaturityCurrent"),
  aiMaturityTarget: opt("aiMaturityTarget"),
  agentsDeployed: yesNo,
  customerFacing: yesNo,
  connectedToTools: yesNo,
  canTakeActions: yesNo,
  multipleAgents: yesNo,
  inProduction: yesNo,

  // Stage 3 — Runtime risk
  toolAccess: list("toolAccess"),
  executionPermissions: list("executionPermissions"),
  criticalSystems: yesNo,
  downstreamAutomation: yesNo,
  customersCurrent: opt("customersCurrent"),
  customersFuture: opt("customersFuture"),
  revenueExposureCurrent: opt("revenueExposureCurrent"),
  revenueExposureFuture: opt("revenueExposureFuture"),

  // Stage 4 — Technical architecture
  deploymentModel: list("deploymentModel"),
  cloudProviders: list("cloudProviders"),
  modelStack: list("modelStack"),
  agentStack: list("agentStack"),
  protectedEnvironments: opt("protectedEnvironments"),
  numAgents: opt("numAgents"),
  agentsExpected: opt("agentsExpected"),
  agentCount: opt("agentCount"),
  businessUnits: opt("businessUnits"),
  sharedMemory: yesNo,
  sharedTools: yesNo,
  autonomousCoordination: yesNo,
  crossAgentComm: yesNo,

  // Stage 5 — Governance (current + target)
  controls: list("controls"),
  governanceOps: list("governanceOps"),
  governanceTarget: opt("governanceTarget"),
  unsafePrevention: opt("unsafePrevention"),
  incidents: opt("incidents"),

  // Stage 6 — Compliance & oversight
  compliance: list("compliance"),
  evidenceRequirements: list("evidenceRequirements"),
  execOversight: opt("execOversight"),
  execNeed: opt("execNeed"),

  // Stage 7 — Commercial qualification
  intent: opt("intent"),
  partnerType: opt("partnerType"),
  customerReach: opt("customerReach"),
  customerReachPotential: opt("customerReachPotential"),
  customerBase: opt("customerBase"),
  stage: opt("stage"),
  timeline: opt("timeline"),
  successCriteria: list("successCriteria"),
  successNotes: opt("successNotes"),

  // Referral attribution (captured client-side from ?ref=)
  referralCode: opt("referralCode"),
  referralSource: opt("referralSource"),

  // Honeypot — bots fill it. Accepted by the schema so the route can silently
  // accept (200, no processing) without signalling the trap.
  company_url_confirm: z.string().max(200).optional().default(""),
});

export type AssessmentInput = z.infer<typeof assessmentSchema>;

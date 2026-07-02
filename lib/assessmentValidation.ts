import { z } from "zod";

/** Server-side validation for the Runtime Governance Assessment questionnaire. */
const yesNo = z.enum(["yes", "no", ""]).default("");
const strArr = z.array(z.string().max(60)).max(20).optional().default([]);

export const assessmentSchema = z.object({
  // Section 1 — Company (required core)
  fullName: z.string().trim().min(1, "Full name is required").max(160),
  jobTitle: z.string().trim().min(1, "Job title is required").max(160),
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  email: z.string().trim().email("Enter a valid email").max(200),
  phone: z.string().trim().max(60).optional().default(""),
  industry: z.string().trim().min(1, "Industry is required").max(80),
  companySize: z.string().trim().min(1, "Company size is required").max(40),
  country: z.string().trim().min(1, "Country is required").max(80),

  // Section 2 — AI deployment profile
  intent: z.string().trim().max(40).optional().default(""),
  partnerType: z.string().trim().max(40).optional().default(""),
  customerReach: z.string().trim().max(40).optional().default(""),
  customerBase: z.string().trim().max(4000).optional().default(""),
  stage: z.string().trim().max(40).optional().default(""),
  agentsDeployed: yesNo,
  customerFacing: yesNo,
  connectedToTools: yesNo,
  canTakeActions: yesNo,
  multipleAgents: yesNo,
  inProduction: yesNo,

  // Section 3 — Tool access
  toolAccess: strArr,

  // Section 4 — Governance & controls
  controls: strArr,
  unsafePrevention: z.string().trim().max(4000).optional().default(""),
  incidents: z.string().trim().max(4000).optional().default(""),

  // Section 5 — Multi-agent environment
  numAgents: z.string().trim().max(20).optional().default(""),
  agentCount: z.string().trim().max(12).optional().default(""),
  businessUnits: z.string().trim().max(12).optional().default(""),
  sharedMemory: yesNo,
  sharedTools: yesNo,
  autonomousCoordination: yesNo,
  crossAgentComm: yesNo,

  // Section 6 — Compliance
  compliance: strArr,

  // Section 7 — Success criteria
  successCriteria: strArr,
  successNotes: z.string().trim().max(4000).optional().default(""),

  // Referral attribution (captured client-side from ?ref=)
  referralCode: z.string().trim().max(80).optional().default(""),
  referralSource: z.string().trim().max(160).optional().default(""),

  // Honeypot — bots fill it. Accepted by the schema so the route can silently
  // accept (200, no processing) without signalling the trap.
  company_url_confirm: z.string().max(200).optional().default(""),
});

export type AssessmentInput = z.infer<typeof assessmentSchema>;

import { z } from "zod";

/**
 * Server-side validation schema for an audit request.
 * Mirrors the Supabase `audit_requests` table. Keep field names in sync
 * with supabase/schema.sql and lib/types.ts.
 */
export const auditRequestSchema = z.object({
  company_name: z.string().trim().min(1, "Company name is required").max(200),
  industry: z.string().trim().max(120).optional().default(""),
  website: z
    .string()
    .trim()
    .max(300)
    .optional()
    .default("")
    .refine(
      (v) => v === "" || /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(v),
      "Enter a valid website",
    ),
  team_size: z.string().trim().max(40).optional().default(""),
  contact_name: z.string().trim().min(1, "Primary contact is required").max(160),
  contact_email: z.string().trim().email("Enter a valid email").max(200),
  contact_phone: z.string().trim().max(60).optional().default(""),
  deployment_type: z.string().trim().max(60).optional().default(""), // production status
  ai_system_type: z.array(z.string().max(80)).max(20).optional().default([]),
  agent_platform: z.string().trim().max(200).optional().default(""),
  models_used: z.string().trim().max(200).optional().default(""),
  autonomy_level: z.string().trim().max(60).optional().default(""),
  risk_summary: z.string().trim().max(60).optional().default(""), // e.g. "Critical"
  risk_capabilities: z.array(z.string().max(80)).max(40).optional().default([]),
  audit_scope: z.string().trim().max(2000).optional().default(""),
  estimated_investment: z.string().trim().max(40).optional().default(""),
  // Honeypot — must be empty. Bots tend to fill every field.
  company_url_confirm: z.string().max(0).optional().default(""),
});

export type AuditRequestInput = z.infer<typeof auditRequestSchema>;

/**
 * Validation for the public "Test a Trajectory" demo.
 * A trajectory is a short sequence of proposed tool calls. We bound the count
 * and field sizes to prevent abuse. Tool calls are NEVER executed — only the
 * JSON shape is evaluated.
 */
export const MAX_TRAJECTORY_STEPS = 25;

export const toolCallSchema = z.object({
  tool: z.string().trim().min(1, "Each step needs a tool name").max(80),
  args: z.record(z.unknown()).optional(),
});

export const trajectoryRequestSchema = z.object({
  trajectory: z
    .array(toolCallSchema)
    .min(1, "Provide at least one tool-call step")
    .max(MAX_TRAJECTORY_STEPS, `Trajectory is limited to ${MAX_TRAJECTORY_STEPS} steps in this demo`),
});

export type TrajectoryRequestInput = z.infer<typeof trajectoryRequestSchema>;

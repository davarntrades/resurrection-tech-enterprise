import { z } from "zod";

/**
 * Server-side validation schema for an enterprise lead.
 * Mirrors the optional Supabase `leads` table (see supabase/schema.sql).
 */
export const leadSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  organisation: z.string().trim().max(200).optional().default(""),
  email: z.string().trim().email("Enter a valid email").max(200),
  role: z.string().trim().max(120).optional().default(""),
  use_case: z.string().trim().max(160).optional().default(""),
  message: z.string().trim().max(4000).optional().default(""),
  // Optional context: which booking/CTA the lead came from.
  source: z.string().trim().max(80).optional().default(""),
  // Honeypot — must be empty. Bots tend to fill every field.
  company_url_confirm: z.string().max(0).optional().default(""),
});

export type LeadInput = z.infer<typeof leadSchema>;

export const USE_CASES = [
  "Autonomous systems",
  "AI agents / agentic workflows",
  "High-trust deployment",
  "Enterprise pilot",
  "Research collaboration",
  "Investment / partnership",
  "Other",
] as const;

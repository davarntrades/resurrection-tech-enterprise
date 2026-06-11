/** Shared types mirroring the Supabase `audit_requests` row. */

export interface AuditRequestRow {
  id: string;
  reference: string;
  created_at: string;
  company_name: string;
  industry: string;
  website: string;
  team_size: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  agent_platform: string;
  models_used: string;
  ai_system_type: string[];
  deployment_type: string;
  autonomy_level: string;
  risk_capabilities: string[];
  risk_summary: string;
  audit_scope: string;
  estimated_investment: string;
  status: "new" | "reviewing" | "scheduled" | "declined";
  source_ip: string;
  user_agent: string;
}

export interface AuditSubmitResponse {
  ok: boolean;
  reference?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Per-sink delivery outcome (non-secret booleans) for observability/verification. */
  delivery?: {
    stored: boolean;      // persisted to the Supabase `audit_requests` table
    emailed: boolean;     // Resend notification sent (internal + prospect confirmation)
    logged_only: boolean; // no sink handled it — server log is the only record
    email_error?: string; // Resend failure reason when emailed is false (non-secret)
  };
}

export interface LeadSubmitResponse {
  ok: boolean;
  reference?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Per-sink delivery outcome (non-secret booleans) for observability/verification. */
  delivery?: {
    forwarded: boolean;   // LEAD_FORWARD_URL webhook accepted it
    stored: boolean;      // persisted to the Supabase `leads` table
    emailed: boolean;     // internal Resend notification sent to LEAD_NOTIFY_TO
    prospect_emailed?: boolean; // report email sent to the submitted (prospect) address
    logged_only: boolean; // no sink handled it — server log is the only record
    email_error?: string; // Resend failure reason when emailed is false (non-secret)
  };
}

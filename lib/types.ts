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
}

export interface LeadSubmitResponse {
  ok: boolean;
  reference?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

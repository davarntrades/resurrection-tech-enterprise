/**
 * Read-side queries for stored assessments — power the internal lead dashboard
 * and the partner analytics foundation. Server-only (service-role Supabase).
 */
import { getServiceSupabase } from "@/lib/supabase";

export interface LeadRow {
  reference: string;
  company: string;
  contact_name: string;
  contact_email: string;
  industry: string;
  country: string;
  recommended_pathway: string;
  referral_source: string;
  referral_code: string;
  status: string;
  submitted_at: string;
}

export interface ReferralSummaryRow {
  referral_code: string;
  referral_source: string;
  leads: number;
  workshops: number;
  audits: number;
  pilots: number;
  integrations: number;
  won: number;
  lost: number;
  rec_workshop: number;
  rec_audit: number;
  rec_pilot: number;
  rec_integration: number;
  last_lead_at: string | null;
}

export type Query<T> = { ok: true; rows: T[] } | { ok: false; rows: never[]; error: string };

/** Newest-first assessments for the internal lead dashboard. */
export async function getLeads(limit = 200): Promise<Query<LeadRow>> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, rows: [], error: "Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)." };
  const { data, error } = await sb
    .from("assessments")
    .select("reference,company,contact_name,contact_email,industry,country,recommended_pathway,referral_source,referral_code,status,submitted_at")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, rows: [], error: error.message };
  return { ok: true, rows: (data ?? []) as LeadRow[] };
}

/** Per-referral-source rollup (partner analytics foundation). */
export async function getReferralSummary(): Promise<Query<ReferralSummaryRow>> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, rows: [], error: "Supabase is not configured." };
  const { data, error } = await sb.from("referral_summary").select("*").order("leads", { ascending: false });
  if (error) return { ok: false, rows: [], error: error.message };
  return { ok: true, rows: (data ?? []) as ReferralSummaryRow[] };
}

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * Assessment persistence health check.
 * GET /api/health → at-a-glance status of the assessment storage stack:
 *   1. Supabase connected   2. assessments table   3. referral_summary view
 *   4. /admin/leads can read records
 * Returns only statuses (no record counts / PII), so it is safe to call openly.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = "OK" | "Missing env" | "Missing table" | "Missing view" | "Auth issue" | "Error";

function classify(error: { code?: string; message?: string } | null): Status {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  if (code === "42P01" || msg.includes("does not exist") || msg.includes("could not find the table") || msg.includes("find the table")) {
    return "Missing table";
  }
  if (code === "PGRST301" || code === "401" || msg.includes("jwt") || msg.includes("api key") || msg.includes("unauthorized") || msg.includes("permission denied")) {
    return "Auth issue";
  }
  return "Error";
}

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, Status> = {
    supabase_connected: "Missing env",
    assessments_table: "Missing env",
    referral_summary_view: "Missing env",
    admin_leads_readable: "Missing env",
  };
  const detail: Record<string, string> = {};

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({
      ok: false,
      checks,
      detail: { env: "Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY." },
      ts: new Date().toISOString(),
    });
  }
  checks.supabase_connected = "OK";

  // assessments table — existence/readability (GET so any error body classifies)
  {
    const { error } = await sb.from("assessments").select("reference").limit(1);
    if (!error) {
      checks.assessments_table = "OK";
    } else {
      checks.assessments_table = classify(error);
      detail.assessments = error.message;
      if (checks.assessments_table === "Auth issue") checks.supabase_connected = "Auth issue";
    }
  }

  // referral_summary view
  {
    const { error } = await sb.from("referral_summary").select("referral_code").limit(1);
    if (!error) {
      checks.referral_summary_view = "OK";
    } else {
      const c = classify(error);
      checks.referral_summary_view = c === "Missing table" ? "Missing view" : c;
      detail.referral_summary = error.message;
    }
  }

  // /admin/leads can read records (selects the same columns the dashboard uses)
  {
    const { error } = await sb.from("assessments").select("reference,status,submitted_at").limit(1);
    if (!error) checks.admin_leads_readable = "OK";
    else { checks.admin_leads_readable = classify(error); detail.admin = error.message; }
  }

  const ok = Object.values(checks).every((s) => s === "OK");
  return NextResponse.json({
    ok,
    checks,
    ...(Object.keys(detail).length ? { detail } : {}),
    ts: new Date().toISOString(),
  });
}

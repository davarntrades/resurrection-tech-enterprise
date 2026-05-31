import { NextResponse } from "next/server";
import { auditRequestSchema } from "@/lib/validation";
import { getServiceSupabase } from "@/lib/supabase";
import { sendAuditEmails } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import type { AuditSubmitResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeReference(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `RGA-${rand}-${new Date().getFullYear()}`;
}

export async function POST(req: Request): Promise<NextResponse<AuditSubmitResponse>> {
  // ── Rate limit ────────────────────────────────────────────
  const ip = clientIp(req.headers);
  const rl = rateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  // ── Parse + validate ──────────────────────────────────────
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request body." }, { status: 400 });
  }

  const parsed = auditRequestSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json({ ok: false, error: "Validation failed.", fieldErrors }, { status: 422 });
  }

  const data = parsed.data;

  // ── Honeypot ──────────────────────────────────────────────
  if (data.company_url_confirm) {
    // Silently accept to avoid signalling the trap to bots.
    return NextResponse.json({ ok: true, reference: makeReference() });
  }

  const reference = makeReference();

  // ── Persist (Supabase) ────────────────────────────────────
  const supabase = getServiceSupabase();
  if (supabase) {
    const { error } = await supabase.from("audit_requests").insert({
      reference,
      company_name: data.company_name,
      industry: data.industry,
      website: data.website,
      team_size: data.team_size,
      contact_name: data.contact_name,
      contact_email: data.contact_email,
      contact_phone: data.contact_phone,
      agent_platform: data.agent_platform,
      models_used: data.models_used,
      ai_system_type: data.ai_system_type,
      deployment_type: data.deployment_type,
      autonomy_level: data.autonomy_level,
      risk_capabilities: data.risk_capabilities,
      risk_summary: data.risk_summary,
      audit_scope: data.audit_scope,
      estimated_investment: data.estimated_investment,
      source_ip: ip,
      user_agent: req.headers.get("user-agent") ?? "",
    });
    if (error) {
      console.error("[audit] supabase insert failed:", error.message);
      return NextResponse.json(
        { ok: false, error: "Could not store your request. Please try again." },
        { status: 502 },
      );
    }
  } else {
    // No DB configured (e.g. local dev). Log so the dev still sees the payload.
    console.warn("[audit] Supabase not configured — skipping persistence.", { reference });
  }

  // ── Notify (email) — non-blocking failure ─────────────────
  try {
    await sendAuditEmails(data, reference);
  } catch (e) {
    console.error("[audit] email send failed:", e);
    // Submission already persisted; do not fail the request on email error.
  }

  return NextResponse.json({ ok: true, reference });
}

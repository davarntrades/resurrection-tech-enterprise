import { NextResponse } from "next/server";
import { leadSchema } from "@/lib/leadValidation";
import { getServiceSupabase } from "@/lib/supabase";
import { sendLeadEmail } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import type { LeadSubmitResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeReference(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `LEAD-${rand}-${new Date().getFullYear()}`;
}

/**
 * Lead-capture endpoint. Clean integration points only — no paid service is
 * required for it to succeed:
 *   1. Optional forward to a Formspree/webhook endpoint (LEAD_FORWARD_URL).
 *   2. Optional persistence to Supabase (`leads` table) when configured.
 *   3. Optional Resend notification when RESEND_API_KEY is set.
 * If none are configured, the payload is logged and the request still succeeds.
 */
export async function POST(req: Request): Promise<NextResponse<LeadSubmitResponse>> {
  const ip = clientIp(req.headers);
  const rl = rateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request body." }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { ok: false, error: "Validation failed.", fieldErrors },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // Honeypot — silently accept to avoid signalling the trap to bots.
  if (data.company_url_confirm) {
    return NextResponse.json({ ok: true, reference: makeReference() });
  }

  const reference = makeReference();
  let forwarded = false;
  let stored = false;
  let emailed = false;

  // ── Integration point 1: forward to Formspree / generic webhook ───────────
  const forwardUrl = process.env.LEAD_FORWARD_URL;
  if (forwardUrl) {
    try {
      const res = await fetch(forwardUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ reference, ...data, company_url_confirm: undefined }),
      });
      forwarded = res.ok;
      if (!res.ok) console.error("[lead] forward failed:", res.status);
    } catch (e) {
      console.error("[lead] forward error:", e);
    }
  }

  // ── Integration point 2: persist to Supabase (optional) ───────────────────
  const supabase = getServiceSupabase();
  if (supabase) {
    const { error } = await supabase.from("leads").insert({
      reference,
      name: data.name,
      organisation: data.organisation,
      email: data.email,
      role: data.role,
      use_case: data.use_case,
      message: data.message,
      source: data.source,
      source_ip: ip,
      user_agent: req.headers.get("user-agent") ?? "",
    });
    if (error) {
      console.error("[lead] supabase insert failed:", error.message);
    } else {
      stored = true;
    }
  }

  // ── Integration point 3: Resend notification (optional) ───────────────────
  try {
    const r = await sendLeadEmail(data, reference);
    emailed = r.sent;
  } catch (e) {
    console.error("[lead] email send failed:", e);
  }

  const logged_only = !(forwarded || stored || emailed);
  if (logged_only) {
    // No integration configured (e.g. local dev). Log so nothing is lost.
    console.warn("[lead] no sink configured — captured lead logged.", { reference, ...data });
  }
  // One structured line per lead for observability (metadata only).
  console.log(JSON.stringify({
    evt: "lead", reference, source: data.source,
    forwarded, stored, emailed, logged_only,
  }));

  return NextResponse.json({
    ok: true, reference,
    delivery: { forwarded, stored, emailed, logged_only },
  });
}

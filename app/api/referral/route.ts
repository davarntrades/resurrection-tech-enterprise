import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { slugifyRef, humanizeRef, REF_MAX_LENGTH } from "@/lib/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Basic email shape check — intentionally permissive (no MX / deliverability).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Referral-link registry. When someone generates a referral link at /referral,
 * the code (and an OPTIONAL referrer email) is captured here for future partner
 * onboarding / notification workflows. Purely additive and best-effort:
 *   - email is optional; an invalid one is rejected, but the code still registers
 *   - if Supabase isn't configured (local dev) or the table doesn't exist yet,
 *     the request is logged and still succeeds — nothing in the UI breaks
 * No commission/payment data. No automatic emails are sent.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIp(req.headers);
  const rl = rateLimit(ip, { bucket: "referral", max: 20 });
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

  const body = (json ?? {}) as { code?: unknown; referrer_email?: unknown };
  const code = slugifyRef(typeof body.code === "string" ? body.code : "");
  if (!code || code.length > REF_MAX_LENGTH) {
    return NextResponse.json({ ok: false, error: "A valid referral code is required." }, { status: 422 });
  }

  // Optional email. Empty is fine; non-empty must look like an email.
  const rawEmail = typeof body.referrer_email === "string" ? body.referrer_email.trim() : "";
  if (rawEmail && (!EMAIL_RE.test(rawEmail) || rawEmail.length > 254)) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address.", fieldErrors: { referrer_email: "Invalid email format." } },
      { status: 422 },
    );
  }
  const referrer_email = rawEmail.toLowerCase();

  let stored = false;
  const supabase = getServiceSupabase();
  if (supabase) {
    // Upsert by code. Only overwrite a previously-stored email when a new
    // (valid, non-empty) one is supplied — never blank it out by accident.
    const row: Record<string, unknown> = {
      referral_code: code,
      referral_source: humanizeRef(code),
      updated_at: new Date().toISOString(),
    };
    if (referrer_email) row.referrer_email = referrer_email;
    const { error } = await supabase.from("referrers").upsert(row, { onConflict: "referral_code" });
    if (error) {
      // Missing table (pre-migration) or any DB issue — log, don't fail the UX.
      console.error("[referral] supabase upsert failed:", error.message);
    } else {
      stored = true;
    }
  }

  if (!stored) {
    console.warn("[referral] not persisted (no DB / table) — captured code logged.", {
      code,
      has_email: Boolean(referrer_email),
    });
  }
  console.log(JSON.stringify({ evt: "referral_register", code, has_email: Boolean(referrer_email), stored }));

  return NextResponse.json({ ok: true, code, stored });
}

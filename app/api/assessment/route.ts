import { NextResponse } from "next/server";
import { assessmentSchema } from "@/lib/assessmentValidation";
import { score, recommend, type Recommendation } from "@/lib/assessment";
import { sendAssessmentEmails } from "@/lib/email";
import { getServiceSupabase } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Resp =
  | { ok: true; reference: string; recommendation: Recommendation; delivery: { emailed: boolean; stored: boolean } }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function makeReference(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `ASMT-${rand}-${new Date().getFullYear()}`;
}

export async function POST(req: Request): Promise<NextResponse<Resp>> {
  const ip = clientIp(req.headers);
  const rl = rateLimit(ip, { bucket: "assessment", max: 8 });
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

  const parsed = assessmentSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json({ ok: false, error: "Please complete the required fields.", fieldErrors }, { status: 422 });
  }

  const data = parsed.data;
  const reference = makeReference();

  // Honeypot — silently accept so bots don't learn the trap.
  if (data.company_url_confirm) {
    const s = score(data);
    return NextResponse.json({ ok: true, reference, recommendation: recommend(data, s), delivery: { emailed: false, stored: false } });
  }

  const scores = score(data);
  const recommendation = recommend(data, scores);

  // ── Persist (best-effort; never blocks submission) ──
  let stored = false;
  const supabase = getServiceSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.from("assessments").insert({
        reference,
        full_name: data.fullName,
        job_title: data.jobTitle,
        company_name: data.companyName,
        email: data.email,
        phone: data.phone,
        industry: data.industry,
        company_size: data.companySize,
        country: data.country,
        recommendation: recommendation.id,
        maturity_score: scores.maturity,
        complexity_score: scores.complexity,
        exposure_score: scores.exposure,
        payload: data,
        source_ip: ip,
        user_agent: req.headers.get("user-agent") ?? "",
      });
      if (error) console.warn("[assessment] supabase insert skipped:", error.message);
      else stored = true;
    } catch (e) {
      console.warn("[assessment] supabase unavailable:", (e as Error).message);
    }
  }

  // ── Notify (email) — non-blocking failure ──
  let emailed = false;
  try {
    const r = await sendAssessmentEmails(data, scores, recommendation, reference);
    emailed = !!r?.sent;
  } catch (e) {
    console.error("[assessment] email send failed:", (e as Error).message);
  }

  // Metadata-only observability line (no PII payload).
  console.log(JSON.stringify({
    evt: "assessment", reference, recommendation: recommendation.id,
    exposure: scores.exposure, maturity: scores.maturity, complexity: scores.complexity,
    stored, emailed,
  }));

  return NextResponse.json({ ok: true, reference, recommendation, delivery: { emailed, stored } });
}

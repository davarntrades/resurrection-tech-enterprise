import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as rt from "@/lib/runtime";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { frontierService, publicFrontierError } from "@/lib/frontier-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  provider: z.enum(["anthropic", "openai", "huggingface"]),
  model: z.string().min(1).max(160), scenario_id: z.string().min(1).max(120),
  objective: z.string().min(1).max(4000),
  mode: z.enum(["shadow", "guarded_pilot", "enforced"]),
  domain: z.enum(["broad", "finance", "cybersecurity", "data_privacy", "enterprise", "compliance"]),
  max_steps: z.number().int().min(1).max(50),
  max_runtime_s: z.number().int().min(10).max(3600),
  block_behavior: z.enum(["return_denial_and_replan", "terminate_session"]),
  custom_user_task: z.string().max(4000).optional(),
  custom_untrusted_content: z.string().max(12000).optional(),
  organization_profile: z.object({
    organization_id: z.string().max(120).optional(),
    jurisdictions: z.array(z.enum(["UK", "EU", "US"])).max(3),
    sector: z.enum(["financial_services", "healthcare", "technology", "other", "unknown"]),
    annual_global_turnover: z.object({ amount: z.number().positive(), currency: z.enum(["GBP", "EUR", "USD"]), year: z.number().int().min(2000).max(2100) }).strict().nullable(),
    data_categories: z.array(z.enum(["personal_data", "financial_data", "payment_card_data", "health_data"])).max(4),
    regulated_entities: z.array(z.enum(["financial_services", "healthcare"])).max(2),
    frameworks_enabled: z.array(z.enum(["eu_ai_act", "eu_gdpr", "uk_gdpr", "nis2", "dora", "pci_dss", "hipaa_hitech", "uk_financial_services"])).max(8),
    ai_system_classification: z.record(z.string(), z.string().max(120)),
    entity_classifications: z.record(z.string(), z.string().max(120)),
    contractual_frameworks: z.array(z.enum(["pci_dss"])).max(1),
  }).strict().optional(),
}).strict();

function authorized(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

export async function GET(req: NextRequest) {
  if (!authorized(req).ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const { res, data } = await frontierService("/v1/frontier/session?limit=20");
  return NextResponse.json(res.ok ? data : { error: publicFrontierError(data, "Session history unavailable") }, { status: res.status });
}

export async function POST(req: NextRequest) {
  if (!authorized(req).ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const limited = rateLimit(clientIp(req.headers), {
    bucket: "frontier-session-paid", max: Number(process.env.FRONTIER_SESSION_UI_RATE_LIMIT ?? 3),
    windowMs: 10 * 60 * 1000,
  });
  if (!limited.ok) return NextResponse.json({ error: "Continuous session usage limit reached. Try again shortly." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid session request." }, { status: 422 });
  try {
    const { res, data } = await frontierService("/v1/frontier/session", { method: "POST", body: JSON.stringify(parsed.data) });
    return NextResponse.json(res.ok ? data : { error: publicFrontierError(data, "Session failed to start") }, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Session failed closed.", execution_reached: false }, { status: 503 });
  }
}

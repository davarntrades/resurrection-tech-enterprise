import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as rt from "@/lib/runtime";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { frontierService, publicFrontierError } from "@/lib/frontier-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const runSchema = z.object({
  provider: z.enum(["anthropic", "openai", "huggingface"]),
  model: z.string().min(1).max(160),
  scenario_id: z.string().min(1).max(120),
  runs: z.number().int().min(1).max(5),
  domain: z.enum(["broad", "finance", "cybersecurity", "data_privacy", "enterprise", "compliance"]),
  custom_user_task: z.string().max(4000).optional(),
  custom_untrusted_content: z.string().max(12000).optional(),
}).strict();

function authorized(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

function firstProviderError(data: any): string | null {
  const rows = Array.isArray(data?.results) ? data.results : [];
  const row = rows.find((item: any) => item?.classification === "PROVIDER_ERROR" || item?.provider_error);
  if (!row) return null;
  const detail = String(row.provider_error || "Provider failed before model inference.");
  return `PROVIDER ERROR — MODEL NOT EXECUTED: ${detail}`.slice(0, 900);
}

export async function POST(req: NextRequest) {
  if (!authorized(req).ok) {
    return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  }
  const limited = rateLimit(clientIp(req.headers), {
    bucket: "frontier-paid", max: Number(process.env.FRONTIER_UI_RATE_LIMIT ?? 5),
    windowMs: 10 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json({ error: "Frontier Lab usage limit reached. Try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) },
    });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Malformed JSON." }, { status: 400 }); }
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid experiment request." }, { status: 422 });
  }
  try {
    const { res, data } = await frontierService("/v1/frontier/run", {
      method: "POST", body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      return NextResponse.json({ error: publicFrontierError(data, "Frontier experiment failed"), detail: data?.detail }, { status: res.status });
    }

    // A provider failure is not model resistance. Surface it as a failed run so
    // the browser never labels a model that was not executed as MODEL RESISTED.
    const providerError = firstProviderError(data);
    if (providerError) {
      return NextResponse.json({
        error: providerError,
        classification: "PROVIDER_ERROR",
        model_behaviour: "NOT_OBSERVED",
        morrison_verdict: "NOT_EXERCISED",
        execution_reached: false,
      }, { status: 502, headers: { "cache-control": "no-store, max-age=0" } });
    }

    return NextResponse.json(data, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    const name = (error as Error)?.name;
    const message = name === "TimeoutError"
      ? "Frontier experiment timed out. Execution remained fail-closed."
      : ((error as Error).message || "Frontier experiment failed closed.");
    return NextResponse.json({ error: message, execution_reached: false }, { status: 504 });
  }
}

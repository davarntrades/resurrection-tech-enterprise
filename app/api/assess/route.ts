import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { assessViaGovernance, type AssessReport } from "@/lib/governance-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Resp = (AssessReport & { ok: true }) | { ok: false; error: string };

const MAX_BYTES = 512 * 1024; // mirror the service cap

/**
 * Public Day-1 self-serve assessment proxy. Forwards a tool manifest to the
 * Morrison governance service's /v1/assess endpoint (server-side, so no CORS
 * and the backend URL stays private) and returns the Ω exposure report.
 *
 * It NEVER executes any tool in the manifest — the engine only inspects the
 * declared capabilities and grounds adversarial proxies. The manifest is not
 * persisted here; the service logs metadata only.
 */
export async function POST(req: Request): Promise<NextResponse<Resp>> {
  const rl = rateLimit(clientIp(req.headers), { bucket: "assess", max: 20 });
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
    return NextResponse.json({ ok: false, error: "Malformed JSON request." }, { status: 400 });
  }

  const body = json as { manifest?: unknown; manifest_text?: string; org?: string; format?: string };
  const hasManifest = body.manifest !== undefined && body.manifest !== null;
  const text = typeof body.manifest_text === "string" ? body.manifest_text : undefined;
  if (!hasManifest && !text) {
    return NextResponse.json(
      { ok: false, error: "Paste a tool manifest (JSON, CSV, or Markdown) or upload a file." },
      { status: 422 },
    );
  }
  const approxBytes = hasManifest ? JSON.stringify(body.manifest).length : (text?.length ?? 0);
  if (approxBytes > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Manifest too large (max 512 KB)." }, { status: 413 });
  }

  try {
    const report = await assessViaGovernance({
      manifest: hasManifest ? body.manifest : undefined,
      manifest_text: text,
      org: typeof body.org === "string" ? body.org.slice(0, 120) : undefined,
      format: typeof body.format === "string" ? body.format.slice(0, 20) : undefined,
    });
    return NextResponse.json<Resp>({ ok: true, ...report });
  } catch (err) {
    const e = err as Error & { status?: number };
    // 4xx from the service are user-actionable (bad manifest, too big, rate);
    // anything else is an upstream/availability problem.
    const status = e.status && e.status >= 400 && e.status < 500 ? e.status : 502;
    const msg = status === 502
      ? "The governance service is temporarily unavailable. Please try again shortly."
      : e.message;
    if (status === 502) console.warn("[assess] upstream error:", e.message);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

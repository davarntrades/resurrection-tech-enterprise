import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { getProvider } from "@/lib/paymentProviders";
import { getService } from "@/lib/paymentProviders/services";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  serviceId: z.string().trim().min(1).max(60),
  provider: z.enum(["stripe", "gocardless"]),
  email: z.string().trim().email().max(200).optional(),
});

/**
 * Creates a provider-hosted checkout session. The amount is taken from the
 * server-side service catalogue — never from the client. No payment details
 * are collected here; we only return a hosted URL to redirect to.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const rl = rateLimit(clientIp(req.headers), { bucket: "pay", max: 15 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 422 });
  }
  const { serviceId, provider, email } = parsed.data;

  const service = getService(serviceId);
  if (!service || !service.online) {
    return NextResponse.json({ ok: false, error: "This engagement is invoiced — please request an invoice." }, { status: 400 });
  }
  if (!service.providers.includes(provider)) {
    return NextResponse.json({ ok: false, error: "That payment method is not available for this service." }, { status: 400 });
  }

  const p = getProvider(provider);
  if (!p || !p.isConfigured()) {
    return NextResponse.json({ ok: false, error: "Online payment is temporarily unavailable. Please request an invoice." }, { status: 503 });
  }

  try {
    const baseUrl = SITE.url.replace(/\/$/, "");
    const result = await p.createCheckout({ service, baseUrl, email });
    return NextResponse.json({ ok: true, url: result.url, provider });
  } catch (e) {
    console.error("[payments] create failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "Could not start checkout. Please request an invoice." }, { status: 502 });
  }
}

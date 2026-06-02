import { NextResponse } from "next/server";
import { gocardlessProvider } from "@/lib/paymentProviders";
import { recordPayment } from "@/lib/payments-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GoCardless webhook. Verifies the Webhook-Signature HMAC against
 * GOCARDLESS_WEBHOOK_SECRET using the raw body, then persists only the
 * minimal payment status.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();
  const result = gocardlessProvider.verifyWebhook(rawBody, req.headers);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason ?? "invalid" }, { status: 498 });
  }
  const record = gocardlessProvider.parseEvent(result.event);
  if (record) await recordPayment(record);
  return NextResponse.json({ received: true });
}

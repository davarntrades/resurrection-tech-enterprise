import { NextResponse } from "next/server";
import { stripeProvider } from "@/lib/paymentProviders";
import { recordPayment } from "@/lib/payments-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook. Verifies the signature against STRIPE_WEBHOOK_SECRET using
 * the raw body, then persists only the minimal payment status.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text(); // raw body required for signature verification
  const result = stripeProvider.verifyWebhook(rawBody, req.headers);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason ?? "invalid" }, { status: 400 });
  }
  const record = stripeProvider.parseEvent(result.event);
  if (record) await recordPayment(record);
  return NextResponse.json({ received: true });
}

import crypto from "node:crypto";
import type { CheckoutInput, CheckoutResult, PaymentProvider, PaymentRecord, WebhookVerification } from "./types";

/**
 * Stripe via the REST API — hosted Checkout only. We send the customer to
 * Stripe's hosted page (which offers card + Apple Pay / Google Pay where
 * available). No card data ever touches this server.
 */
const API = "https://api.stripe.com/v1/checkout/sessions";
const SIG_TOLERANCE_S = 60 * 5;

function secret(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not set");
  return k;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  isConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  },

  async createCheckout({ service, baseUrl, email }: CheckoutInput): Promise<CheckoutResult> {
    if (service.amountMinor == null) throw new Error("Service has no online amount");

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", `${baseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`);
    form.set("cancel_url", `${baseUrl}/pay/cancel`);
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", service.currency);
    form.set("line_items[0][price_data][unit_amount]", String(service.amountMinor));
    form.set("line_items[0][price_data][product_data][name]", service.name);
    form.set("metadata[serviceType]", service.id);
    if (email) form.set("customer_email", email);
    // Apple Pay / Google Pay are offered automatically on hosted Checkout when
    // enabled in the Stripe dashboard; no card form is built here.

    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!res.ok || !data.url || !data.id) {
      throw new Error(data.error?.message ?? "Stripe session creation failed");
    }
    return { url: data.url, providerRef: data.id, provider: "stripe" };
  },

  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification {
    const wh = process.env.STRIPE_WEBHOOK_SECRET;
    const header = headers.get("stripe-signature");
    if (!wh || !header) return { ok: false, reason: "missing signature or secret" };

    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
    const t = parts["t"];
    const v1 = parts["v1"];
    if (!t || !v1) return { ok: false, reason: "malformed signature" };

    // Reject replays outside the tolerance window.
    if (Math.abs(Date.now() / 1000 - Number(t)) > SIG_TOLERANCE_S) return { ok: false, reason: "timestamp out of tolerance" };

    const expected = crypto.createHmac("sha256", wh).update(`${t}.${rawBody}`).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "signature mismatch" };

    try {
      return { ok: true, event: JSON.parse(rawBody) };
    } catch {
      return { ok: false, reason: "invalid json" };
    }
  },

  parseEvent(event: unknown): PaymentRecord | null {
    const e = event as { type?: string; data?: { object?: Record<string, unknown> } };
    if (e.type !== "checkout.session.completed") return null;
    const o = e.data?.object ?? {};
    return {
      provider: "stripe",
      providerId: String(o.id ?? ""),
      status: String(o.payment_status ?? "paid"),
      amountMinor: typeof o.amount_total === "number" ? o.amount_total : null,
      currency: String(o.currency ?? "gbp"),
      serviceType: String((o.metadata as Record<string, unknown> | undefined)?.serviceType ?? "unknown"),
      createdAt: new Date().toISOString(),
    };
  },
};

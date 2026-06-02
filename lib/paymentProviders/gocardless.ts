import crypto from "node:crypto";
import type { CheckoutInput, CheckoutResult, PaymentProvider, PaymentRecord, WebhookVerification } from "./types";

/**
 * GoCardless via the REST API — hosted Billing Request Flow only. We create a
 * billing request (Direct Debit mandate, plus a one-off payment when the
 * service has a fixed amount), then a flow that returns an authorisation URL
 * on GoCardless's hosted pages. No bank details touch this server.
 */
const VERSION = "2015-07-06";

function base(): string {
  return process.env.GOCARDLESS_ENVIRONMENT === "live"
    ? "https://api.gocardless.com"
    : "https://api-sandbox.gocardless.com";
}
function token(): string {
  const t = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!t) throw new Error("GOCARDLESS_ACCESS_TOKEN is not set");
  return t;
}
async function gcPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "GoCardless-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = data.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `GoCardless request failed (${res.status})`);
  }
  return data;
}

export const gocardlessProvider: PaymentProvider = {
  id: "gocardless",

  isConfigured() {
    return Boolean(process.env.GOCARDLESS_ACCESS_TOKEN);
  },

  async createCheckout({ service, baseUrl }: CheckoutInput): Promise<CheckoutResult> {
    const billingRequest: Record<string, unknown> = {
      mandate_request: { currency: "GBP", scheme: "bacs" },
      metadata: { serviceType: service.id },
    };
    if (service.amountMinor != null) {
      billingRequest.payment_request = { amount: service.amountMinor, currency: "GBP", description: service.name };
    }
    const br = await gcPost("/billing_requests", { billing_requests: billingRequest });
    const brId = (br.billing_requests as { id?: string } | undefined)?.id;
    if (!brId) throw new Error("GoCardless billing request creation failed");

    const flow = await gcPost("/billing_request_flows", {
      billing_request_flows: {
        redirect_uri: `${baseUrl}/pay/success?gc=1`,
        exit_uri: `${baseUrl}/pay/cancel`,
        links: { billing_request: brId },
      },
    });
    const url = (flow.billing_request_flows as { authorisation_url?: string } | undefined)?.authorisation_url;
    if (!url) throw new Error("GoCardless flow creation failed");
    return { url, providerRef: brId, provider: "gocardless" };
  },

  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification {
    const wh = process.env.GOCARDLESS_WEBHOOK_SECRET;
    const header = headers.get("webhook-signature");
    if (!wh || !header) return { ok: false, reason: "missing signature or secret" };
    const expected = crypto.createHmac("sha256", wh).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(header);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "signature mismatch" };
    try {
      return { ok: true, event: JSON.parse(rawBody) };
    } catch {
      return { ok: false, reason: "invalid json" };
    }
  },

  parseEvent(event: unknown): PaymentRecord | null {
    // GoCardless sends { events: [...] }; record the first actionable event.
    const evts = (event as { events?: Array<Record<string, unknown>> }).events;
    const ev = evts?.[0];
    if (!ev) return null;
    const links = (ev.links as Record<string, string> | undefined) ?? {};
    return {
      provider: "gocardless",
      providerId: String(links.payment ?? links.mandate ?? links.billing_request ?? ev.id ?? ""),
      status: String(ev.action ?? "unknown"),
      amountMinor: null,
      currency: "gbp",
      serviceType: String((ev.metadata as Record<string, unknown> | undefined)?.serviceType ?? "unknown"),
      createdAt: new Date().toISOString(),
    };
  },
};

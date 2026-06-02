/**
 * Payment provider abstraction.
 *
 * The website NEVER collects, stores, logs, or processes card or bank details.
 * Every provider here returns a *hosted* checkout/redirect URL — the customer
 * enters payment details on the provider's own PCI-compliant pages.
 *
 * To add a future provider, implement `PaymentProvider` and register it in
 * `index.ts`. No page or API route changes are required.
 */

export type ProviderId = "stripe" | "gocardless";

/** Server-side source of truth for what can be paid online and for how much. */
export interface ServiceDef {
  id: string;
  name: string;
  /** Amount in minor units (pence). null = no fixed online amount (invoice / mandate setup). */
  amountMinor: number | null;
  currency: "gbp";
  /** How this service is normally transacted. */
  kind: "deposit" | "retainer" | "invoice";
  /** Whether online payment is offered at all. */
  online: boolean;
  /** Online providers allowed for this service (empty = invoice only). */
  providers: ProviderId[];
  blurb: string;
}

export interface CheckoutInput {
  service: ServiceDef;
  baseUrl: string;
  email?: string;
}

export interface CheckoutResult {
  url: string; // hosted checkout / authorisation URL the client redirects to
  providerRef: string; // session / billing-request id
  provider: ProviderId;
}

/** The only payment data we ever persist. No card/bank details, ever. */
export interface PaymentRecord {
  provider: ProviderId;
  providerId: string;
  status: string;
  amountMinor: number | null;
  currency: string;
  serviceType: string;
  createdAt: string;
}

export interface WebhookVerification {
  ok: boolean;
  reason?: string;
  event?: unknown;
}

export interface PaymentProvider {
  id: ProviderId;
  /** True when the required server env vars are present. */
  isConfigured(): boolean;
  /** Create a hosted checkout/redirect session. Amount comes from the ServiceDef, never the client. */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** Verify a webhook payload using the provider's signature scheme. */
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification;
  /** Map a verified provider event into a minimal PaymentRecord (or null to ignore). */
  parseEvent(event: unknown): PaymentRecord | null;
}
